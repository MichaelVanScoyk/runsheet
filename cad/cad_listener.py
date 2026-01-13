"""
CAD TCP Listener for RunSheet

Listens for incoming TCP connections from CAD systems (FDCMS ADI, etc).
Each connection sends one report (HTML/XML/JSON), then disconnects.

MULTI-TENANT: Each tenant runs their own listener instance.
All configuration is explicit via command line - NO database lookups.

DATA PROTECTION:
- Raw data saved to disk BEFORE any API call
- If dispatch fails, clear can still create the incident
- Failed API calls logged with reference to backup file

Usage:
    python cad_listener.py --port 19117 --tenant glenmoorefc --api-url https://glenmoorefc.cadreport.com
    python cad_listener.py --port 19118 --tenant otherdept --api-url https://otherdept.cadreport.com --timezone America/Chicago
"""

import socket
import threading
import argparse
import logging
import json
import requests
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from zoneinfo import ZoneInfo
from pathlib import Path

from cad_parser import parse_cad_html, report_to_dict
from comment_processor import process_clear_report_comments

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Base directory for tenant data
DATA_BASE_DIR = '/opt/runsheet/data'


class CADListener:
    def __init__(self, port: int, api_url: str, tenant: str, timezone: str = 'America/New_York'):
        """
        Initialize CAD Listener.
        
        Args:
            port: TCP port to listen on (REQUIRED)
            api_url: Base URL for RunSheet API (REQUIRED) - e.g., https://glenmoorefc.cadreport.com
            tenant: Tenant slug for data directory (REQUIRED)
            timezone: IANA timezone for CAD timestamps (default: America/New_York)
        """
        self.port = port
        self.api_url = api_url.rstrip('/')  # Remove trailing slash if present
        self.tenant = tenant
        self.timezone = timezone
        
        # Standard headers for all API requests (tenant routing for internal calls)
        self._api_headers = {
            'X-Tenant': tenant,
            'Content-Type': 'application/json',
        }
        self.running = False
        self.server_socket = None
        
        # Cache for unit info lookups (avoid repeated API calls)
        self._unit_cache: Dict[str, Dict[str, Any]] = {}
        self._unit_cache_time: Optional[datetime] = None
        self._unit_cache_ttl = 300  # 5 minutes
        
        # Setup tenant data directories
        self.data_dir = Path(DATA_BASE_DIR) / self.tenant
        self.backup_dir = self.data_dir / 'cad_backup'
        self.failed_queue_dir = self.data_dir / 'cad_failed'
        
        # Create directories if they don't exist (non-blocking)
        try:
            self.backup_dir.mkdir(parents=True, exist_ok=True)
            self.failed_queue_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.warning(f"Could not create data directories: {e}")
        
        self.stats = {
            'connections': 0,
            'dispatch_reports': 0,
            'clear_reports': 0,
            'errors': 0,
            'incidents_created': 0,
            'incidents_updated': 0,
            'incidents_closed': 0,
            'backups_saved': 0,
            'incidents_created_from_clear': 0,
        }
    
    def start(self):
        """Start listening for connections"""
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind(('0.0.0.0', self.port))
        self.server_socket.listen(5)
        self.running = True
        
        logger.info(f"CAD Listener started on port {self.port}")
        logger.info(f"API URL: {self.api_url}")
        logger.info(f"Tenant: {self.tenant}")
        logger.info(f"Timezone: {self.timezone}")
        logger.info(f"Backup directory: {self.backup_dir}")
        
        while self.running:
            try:
                client_socket, address = self.server_socket.accept()
                self.stats['connections'] += 1
                logger.info(f"Connection from {address[0]}:{address[1]}")
                
                # Handle in thread to allow multiple connections
                thread = threading.Thread(
                    target=self._handle_connection,
                    args=(client_socket, address)
                )
                thread.daemon = True
                thread.start()
                
            except Exception as e:
                if self.running:
                    logger.error(f"Accept error: {e}")
    
    def stop(self):
        """Stop the listener"""
        self.running = False
        if self.server_socket:
            self.server_socket.close()
        logger.info("CAD Listener stopped")
    
    def _get_unit_info(self, unit_id: str) -> Dict[str, Any]:
        """
        Look up unit info via API.
        Returns dict with: unit_designator, apparatus_id, category, is_ours, counts_for_response_times
        
        Caches results for 5 minutes to avoid hammering API.
        """
        # Check cache freshness
        now = datetime.now()
        if self._unit_cache_time and (now - self._unit_cache_time).total_seconds() > self._unit_cache_ttl:
            self._unit_cache = {}
            self._unit_cache_time = None
        
        # Check cache
        if unit_id in self._unit_cache:
            return self._unit_cache[unit_id]
        
        # Query API
        try:
            resp = requests.get(
                f"{self.api_url}/api/apparatus/lookup",
                params={'unit_id': unit_id},
                headers=self._api_headers,
                timeout=5
            )
            if resp.status_code == 200:
                data = resp.json()
                self._unit_cache[unit_id] = data
                if not self._unit_cache_time:
                    self._unit_cache_time = now
                return data
        except Exception as e:
            logger.warning(f"Could not lookup unit {unit_id}: {e}")
        
        # Return defaults for unknown unit (treated as mutual aid)
        return {
            'unit_designator': unit_id,
            'apparatus_id': None,
            'category': None,
            'is_ours': False,
            'counts_for_response_times': False,
        }
    
    def _save_backup(self, raw_data: bytes, event_number: str, report_type: str) -> Optional[str]:
        """
        Save raw CAD data to disk BEFORE any API processing.
        This is redundant protection - data also goes to database.
        
        NON-BLOCKING: If disk write fails, log error but continue processing.
        The database (cad_raw_dispatch/cad_raw_clear) is the primary store.
        
        Returns the backup file path, or None if save failed.
        """
        timestamp = datetime.now().strftime('%Y-%m-%d_%H%M%S')
        
        # Detect file type from content
        ext = self._detect_content_type(raw_data)
        filename = f"{timestamp}_{event_number}_{report_type}.{ext}"
        filepath = self.backup_dir / filename
        
        # NON-BLOCKING: Try to save, but don't fail the whole process
        try:
            with open(filepath, 'wb') as f:
                f.write(raw_data)
            self.stats['backups_saved'] += 1
            logger.info(f"Backup saved: {filename}")
            return str(filepath)
        except PermissionError as e:
            logger.error(f"BACKUP FAILED (permissions): {e} - Data will be in database only")
        except OSError as e:
            logger.error(f"BACKUP FAILED (disk): {e} - Data will be in database only")
        except Exception as e:
            logger.error(f"BACKUP FAILED: {e} - Data will be in database only")
        
        # Try /tmp as last resort (non-blocking)
        try:
            alt_path = f"/tmp/cad_backup_{self.tenant}_{timestamp}_{event_number}_{report_type}.{ext}"
            with open(alt_path, 'wb') as f:
                f.write(raw_data)
            logger.warning(f"Backup saved to /tmp: {alt_path}")
            return alt_path
        except:
            pass
        
        # Failed to save anywhere - log but continue (database will have it)
        return None
    
    def _detect_content_type(self, raw_data: bytes) -> str:
        """
        Detect content type from raw bytes.
        Returns appropriate file extension.
        """
        header = raw_data[:500].lower() if raw_data else b''
        
        if b'<html' in header or b'<!doctype html' in header:
            return 'html'
        elif b'<?xml' in header:
            return 'xml'
        elif header.startswith(b'{') or header.startswith(b'['):
            return 'json'
        else:
            return 'dat'
    
    def _handle_connection(self, client_socket: socket.socket, address: tuple):
        """Handle a single connection - receive data, parse, process"""
        try:
            # Receive all data (CAD sends then disconnects)
            raw_data = b''
            while True:
                chunk = client_socket.recv(4096)
                if not chunk:
                    break
                raw_data += chunk
            
            if not raw_data:
                logger.warning("Empty connection received")
                return
            
            # SAVE RAW BYTES TO DISK FIRST - before any processing
            backup_path = self._save_backup(raw_data, 'PENDING', 'RAW')
            
            # Decode to text for parsing
            try:
                text_data = raw_data.decode('utf-8')
            except UnicodeDecodeError:
                text_data = raw_data.decode('latin-1')
            
            # Parse the data
            report = parse_cad_html(text_data)
            
            if not report:
                logger.warning("Could not parse report from data")
                if backup_path:
                    try:
                        new_path = backup_path.replace('PENDING_RAW', 'UNKNOWN_UNPARSED')
                        os.rename(backup_path, new_path)
                    except:
                        pass
                return
            
            # Convert to dict
            report_dict = report_to_dict(report)
            
            # Get event info for logging and backup rename
            report_type = report_dict.get('report_type', 'UNKNOWN')
            event_number = report_dict.get('event_number', 'UNKNOWN')
            
            # Rename backup file with actual event info
            if backup_path:
                try:
                    new_path = backup_path.replace('PENDING_RAW', f'{event_number}_{report_type}')
                    os.rename(backup_path, new_path)
                    backup_path = new_path
                except:
                    pass
            
            if report_type == 'DISPATCH':
                self.stats['dispatch_reports'] += 1
                logger.info(f"Received DISPATCH for {event_number}")
            elif report_type == 'CLEAR':
                self.stats['clear_reports'] += 1
                logger.info(f"Received CLEAR for {event_number}")
            else:
                logger.warning(f"Unknown report type: {report_type}")
            
            # Process the report
            self._process_report(report_dict, text_data, backup_path)
            
        except Exception as e:
            logger.error(f"Error handling connection: {e}", exc_info=True)
            self.stats['errors'] += 1
        finally:
            client_socket.close()
    
    def _process_report(self, report: dict, text_data: str = None, backup_path: str = None):
        """Process parsed report - create/update/close incident via API"""
        
        event_number = report.get('event_number')
        if not event_number:
            logger.warning("No event number in report, skipping")
            return
        
        report_type = report.get('report_type')
        
        try:
            if report_type == 'DISPATCH':
                self._handle_dispatch(report, text_data)
            elif report_type == 'CLEAR':
                self._handle_clear(report, text_data)
        except Exception as e:
            logger.error(f"Error processing report: {e}", exc_info=True)
            self.stats['errors'] += 1
            self._save_failed_request(report, backup_path, str(e))
    
    def _save_failed_request(self, report: dict, backup_path: str, error: str):
        """Log failed API request with reference to backup file."""
        timestamp = datetime.now().strftime('%Y-%m-%d_%H%M%S')
        event_number = report.get('event_number', 'UNKNOWN')
        report_type = report.get('report_type', 'UNKNOWN')
        
        filename = f"{timestamp}_{event_number}_{report_type}_FAILED.json"
        filepath = self.failed_queue_dir / filename
        
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump({
                    'event_number': event_number,
                    'report_type': report_type,
                    'backup_file': backup_path,
                    'error': error,
                    'timestamp': timestamp,
                    'report_summary': {
                        'address': report.get('address'),
                        'municipality': report.get('municipality'),
                        'event_type': report.get('event_type'),
                    },
                }, f, indent=2)
            logger.info(f"Logged failed request: {filename}")
        except Exception as e:
            logger.error(f"Could not log failed request: {e}")
    
    def _handle_dispatch(self, report: dict, raw_html: str = None):
        """Handle Dispatch Report - create or update incident"""
        
        event_number = report['event_number']
        
        # Check if incident exists
        try:
            resp = requests.get(f"{self.api_url}/api/incidents/by-cad/{event_number}", headers=self._api_headers, timeout=10)
            exists = resp.status_code == 200
            existing_incident = resp.json() if exists else None
        except Exception as e:
            logger.error(f"API error checking incident: {e}")
            raise
        
        event_type = report.get('event_type', '')
        event_subtype = report.get('event_subtype', '')
        
        # Auto-create municipality if needed
        municipality_code = report.get('municipality')
        if municipality_code:
            try:
                requests.post(
                    f"{self.api_url}/api/lookups/municipalities/auto-create",
                    params={'code': municipality_code},
                    headers=self._api_headers,
                    timeout=10
                )
            except Exception as e:
                logger.warning(f"Could not auto-create municipality: {e}")
        
        # Build cad_units from responding units
        cad_units = []
        existing_units = {}
        
        if existing_incident and existing_incident.get('cad_units'):
            for u in existing_incident['cad_units']:
                existing_units[u['unit_id']] = u
        
        # Get incident date from dispatch_time
        incident_date_str = None
        dispatch_time_str = None
        if report.get('dispatch_time'):
            try:
                dt = datetime.strptime(report['dispatch_time'], '%m-%d-%y %H:%M:%S')
                incident_date_str = dt.strftime('%Y-%m-%d')
                dispatch_time_str = dt.strftime('%H:%M:%S')
            except ValueError:
                pass
        
        for unit in report.get('responding_units', []):
            unit_id = unit.get('unit_id')
            if not unit_id:
                continue
            
            # Look up unit info via API
            unit_info = self._get_unit_info(unit_id)
            
            canonical_unit_id = unit_info['unit_designator'] or unit_id
            
            unit_dispatch_time = None
            if unit.get('time') and incident_date_str:
                unit_dispatch_time = self._parse_cad_time(
                    unit.get('time'), incident_date_str, dispatch_time_str
                )
            
            if canonical_unit_id in existing_units:
                unit_data = existing_units[canonical_unit_id]
                unit_data['is_mutual_aid'] = not unit_info['is_ours']
                unit_data['apparatus_id'] = unit_info['apparatus_id']
                unit_data['unit_category'] = unit_info['category']
                unit_data['counts_for_response_times'] = unit_info['counts_for_response_times']
            else:
                unit_data = {
                    'unit_id': canonical_unit_id,
                    'station': unit.get('station'),
                    'agency': unit.get('agency'),
                    'is_mutual_aid': not unit_info['is_ours'],
                    'apparatus_id': unit_info['apparatus_id'],
                    'unit_category': unit_info['category'],
                    'counts_for_response_times': unit_info['counts_for_response_times'],
                    'time_dispatched': unit_dispatch_time,
                    'time_enroute': None,
                    'time_arrived': None,
                    'time_available': None,
                    'time_cleared': None,
                }
            
            cad_units.append(unit_data)
        
        if exists:
            # Update existing incident
            existing_updates = existing_incident.get('cad_raw_updates') or []
            if raw_html:
                existing_updates.append(raw_html)
            
            update_data = {
                'cad_event_type': event_type,
                'cad_event_subtype': event_subtype,
                'address': report.get('address'),
                'municipality_code': municipality_code,
                'cross_streets': report.get('cross_streets'),
                'esz_box': report.get('esz'),
                'caller_name': report.get('caller_name'),
                'caller_phone': report.get('caller_phone'),
                'cad_units': cad_units,
                'cad_raw_updates': existing_updates,
            }
            
            resp = requests.put(
                f"{self.api_url}/api/incidents/{existing_incident['id']}",
                json=update_data,
                headers=self._api_headers,
                timeout=10
            )
            
            if resp.status_code == 200:
                logger.info(f"Updated incident {event_number} - {len(cad_units)} units")
                self.stats['incidents_updated'] += 1
            else:
                logger.error(f"Failed to update incident: {resp.text}")
                raise Exception(f"API returned {resp.status_code}: {resp.text}")
        else:
            # Determine call category
            call_category = self._determine_category(event_type, event_subtype)
            
            # Create new incident
            create_data = {
                'cad_event_number': event_number,
                'cad_event_type': event_type,
                'cad_event_subtype': event_subtype,
                'call_category': call_category,
                'address': report.get('address'),
                'municipality_code': municipality_code,
                'cad_raw_dispatch': raw_html,
            }
            
            # Use incident_date_str (local date) computed earlier, NOT from UTC conversion
            if incident_date_str:
                create_data['incident_date'] = incident_date_str
            
            resp = requests.post(
                f"{self.api_url}/api/incidents",
                json=create_data,
                headers=self._api_headers,
                timeout=10
            )
            
            if resp.status_code == 200:
                result = resp.json()
                incident_id = result['id']
                logger.info(f"Created incident {event_number} (ID: {incident_id}) - {len(cad_units)} units")
                self.stats['incidents_created'] += 1
                
                # Update with full details
                update_data = {
                    'cross_streets': report.get('cross_streets'),
                    'esz_box': report.get('esz'),
                    'caller_name': report.get('caller_name'),
                    'caller_phone': report.get('caller_phone'),
                    'cad_units': cad_units,
                }
                
                if report.get('dispatch_time'):
                    update_data['time_dispatched'] = self._parse_cad_datetime(report['dispatch_time'])
                
                requests.put(
                    f"{self.api_url}/api/incidents/{incident_id}",
                    json=update_data,
                    headers=self._api_headers,
                    timeout=10
                )
            else:
                logger.error(f"Failed to create incident: {resp.text}")
                raise Exception(f"API returned {resp.status_code}: {resp.text}")
    
    def _handle_clear(self, report: dict, raw_html: str = None):
        """Handle Clear Report - update fields, times, and close incident"""
        
        event_number = report['event_number']
        
        # Get incident
        try:
            resp = requests.get(f"{self.api_url}/api/incidents/by-cad/{event_number}", headers=self._api_headers, timeout=10)
            if resp.status_code != 200:
                logger.warning(f"Incident {event_number} not found - creating from CLEAR report")
                self._create_incident_from_clear(report, raw_html)
                return
            incident = resp.json()
            incident_id = incident['id']
        except Exception as e:
            logger.error(f"Could not fetch incident: {e}")
            raise
        
        incident_date = incident.get('incident_date')
        
        # Get dispatch time for midnight detection
        dispatch_time_str = None
        if incident.get('time_dispatched'):
            try:
                stored_dt_str = incident['time_dispatched']
                if stored_dt_str.endswith('Z'):
                    stored_dt_str = stored_dt_str[:-1] + '+00:00'
                utc_dt = datetime.fromisoformat(stored_dt_str)
                local_tz = self._get_local_timezone()
                local_dt = utc_dt.astimezone(local_tz)
                dispatch_time_str = local_dt.strftime('%H:%M:%S')
            except Exception as e:
                logger.warning(f"Could not parse dispatch time: {e}")
        
        if not incident_date and incident.get('time_dispatched'):
            # Convert UTC to local before extracting date
            try:
                stored_dt_str = incident['time_dispatched']
                if stored_dt_str.endswith('Z'):
                    stored_dt_str = stored_dt_str[:-1] + '+00:00'
                utc_dt = datetime.fromisoformat(stored_dt_str)
                local_tz = self._get_local_timezone()
                local_dt = utc_dt.astimezone(local_tz)
                incident_date = local_dt.strftime('%Y-%m-%d')
            except:
                pass
        
        update_data = {
            'cad_raw_clear': raw_html,
        }
        
        # Process event comments for storage and tactical timestamp extraction
        if report.get('event_comments'):
            try:
                comment_result = process_clear_report_comments(
                    report['event_comments'],
                    incident_date or datetime.now().strftime('%Y-%m-%d'),
                    self.timezone
                )
                
                # Store processed comments
                update_data['cad_event_comments'] = comment_result.get('cad_event_comments', [])
                
                # Extract tactical timestamps (only set if not already in incident)
                tactical = comment_result.get('tactical_timestamps', {})
                
                # NERIS timestamps
                if tactical.get('time_command_established') and not incident.get('time_command_established'):
                    update_data['time_command_established'] = tactical['time_command_established']
                    logger.info(f"Auto-populated time_command_established from comments")
                
                if tactical.get('time_fire_under_control') and not incident.get('time_fire_under_control'):
                    update_data['time_fire_under_control'] = tactical['time_fire_under_control']
                    logger.info(f"Auto-populated time_fire_under_control from comments")
                
                if tactical.get('time_water_on_fire') and not incident.get('time_water_on_fire'):
                    update_data['time_water_on_fire'] = tactical['time_water_on_fire']
                    logger.info(f"Auto-populated time_water_on_fire from comments")
                
                if tactical.get('time_primary_search_complete') and not incident.get('time_primary_search_complete'):
                    update_data['time_primary_search_complete'] = tactical['time_primary_search_complete']
                    logger.info(f"Auto-populated time_primary_search_complete from comments")
                
                # Chester County custom timestamps
                if tactical.get('time_evac_ordered') and not incident.get('time_evac_ordered'):
                    update_data['time_evac_ordered'] = tactical['time_evac_ordered']
                    logger.info(f"Auto-populated time_evac_ordered from comments")
                
                if tactical.get('time_par_started') and not incident.get('time_par_started'):
                    update_data['time_par_started'] = tactical['time_par_started']
                    logger.info(f"Auto-populated time_par_started from comments")
                
                if tactical.get('time_water_supply_established') and not incident.get('time_water_supply_established'):
                    update_data['time_water_supply_established'] = tactical['time_water_supply_established']
                    logger.info(f"Auto-populated time_water_supply_established from comments")
                
                # Log crew counts (not acted on yet)
                crew_counts = comment_result.get('crew_counts', {})
                if crew_counts:
                    logger.info(f"Crew counts from comments: {crew_counts}")
                
            except Exception as e:
                logger.warning(f"Could not process event comments: {e}")
        
        # Update fields from clear report
        if report.get('address'):
            update_data['address'] = report['address']
        if report.get('municipality'):
            try:
                requests.post(
                    f"{self.api_url}/api/lookups/municipalities/auto-create",
                    params={'code': report['municipality']},
                    headers=self._api_headers,
                    timeout=10
                )
            except:
                pass
            update_data['municipality_code'] = report['municipality']
        if report.get('cross_streets'):
            update_data['cross_streets'] = report['cross_streets']
        if report.get('esz'):
            update_data['esz_box'] = report['esz']
        if report.get('event_type'):
            update_data['cad_event_type'] = report['event_type']
        if report.get('event_subtype'):
            update_data['cad_event_subtype'] = report['event_subtype']
        if report.get('caller_name'):
            update_data['caller_name'] = report['caller_name']
        if report.get('caller_phone'):
            update_data['caller_phone'] = report['caller_phone']
        
        if report.get('first_dispatch'):
            update_data['time_dispatched'] = self._parse_cad_time(
                report['first_dispatch'], incident_date, dispatch_time_str
            )
        
        # Merge unit times
        existing_units = {}
        if incident.get('cad_units'):
            for u in incident['cad_units']:
                existing_units[u['unit_id']] = u
        
        for ut in report.get('unit_times', []):
            unit_id = ut.get('unit_id')
            if not unit_id:
                continue
            
            unit_info = self._get_unit_info(unit_id)
            canonical_unit_id = unit_info['unit_designator'] or unit_id
            
            time_dispatched = self._parse_cad_time(ut.get('time_dispatched'), incident_date, dispatch_time_str)
            time_enroute = self._parse_cad_time(ut.get('time_enroute'), incident_date, dispatch_time_str)
            time_arrived = self._parse_cad_time(ut.get('time_arrived'), incident_date, dispatch_time_str)
            time_available = self._parse_cad_time(ut.get('time_available'), incident_date, dispatch_time_str)
            time_cleared = self._parse_cad_time(ut.get('time_at_quarters'), incident_date, dispatch_time_str)
            
            if canonical_unit_id in existing_units:
                existing_units[canonical_unit_id].update({
                    'time_dispatched': time_dispatched,
                    'time_enroute': time_enroute,
                    'time_arrived': time_arrived,
                    'time_available': time_available,
                    'time_cleared': time_cleared,
                    'is_mutual_aid': not unit_info['is_ours'],
                    'apparatus_id': unit_info['apparatus_id'],
                    'unit_category': unit_info['category'],
                    'counts_for_response_times': unit_info['counts_for_response_times'],
                })
            else:
                existing_units[canonical_unit_id] = {
                    'unit_id': canonical_unit_id,
                    'station': None,
                    'agency': None,
                    'is_mutual_aid': not unit_info['is_ours'],
                    'apparatus_id': unit_info['apparatus_id'],
                    'unit_category': unit_info['category'],
                    'counts_for_response_times': unit_info['counts_for_response_times'],
                    'time_dispatched': time_dispatched,
                    'time_enroute': time_enroute,
                    'time_arrived': time_arrived,
                    'time_available': time_available,
                    'time_cleared': time_cleared,
                }
        
        cad_units = list(existing_units.values())
        if cad_units:
            update_data['cad_units'] = cad_units
            
            # Calculate response metrics from units that count
            metric_units = [u for u in cad_units 
                           if u.get('counts_for_response_times') == True 
                           and not u.get('is_mutual_aid', True)]
            
            enroute_times = [u['time_enroute'] for u in metric_units if u.get('time_enroute')]
            if enroute_times:
                update_data['time_first_enroute'] = min(enroute_times)
            
            arrive_times = [u['time_arrived'] for u in metric_units if u.get('time_arrived')]
            if arrive_times:
                update_data['time_first_on_scene'] = min(arrive_times)
            
            # Only use OUR units for time_last_cleared (not mutual aid)
            our_units = [u for u in cad_units if not u.get('is_mutual_aid', True)]
            cleared_times = [u['time_cleared'] for u in our_units if u.get('time_cleared')]
            if cleared_times:
                update_data['time_last_cleared'] = max(cleared_times)
            
            excluded = [u['unit_id'] for u in cad_units 
                       if u.get('counts_for_response_times') != True or u.get('is_mutual_aid', True)]
            if excluded:
                logger.info(f"Units excluded from metrics: {', '.join(excluded)}")
        
        # Update incident
        if update_data:
            resp = requests.put(
                f"{self.api_url}/api/incidents/{incident_id}",
                json=update_data,
                headers=self._api_headers,
                timeout=10
            )
            if resp.status_code == 200:
                logger.info(f"Updated incident {event_number} with clear times - {len(cad_units)} units")
            else:
                raise Exception(f"API returned {resp.status_code}: {resp.text}")
        
        # Close incident
        resp = requests.post(f"{self.api_url}/api/incidents/{incident_id}/close", headers=self._api_headers, timeout=10)
        if resp.status_code == 200:
            logger.info(f"Closed incident {event_number}")
            self.stats['incidents_closed'] += 1
        else:
            logger.error(f"Failed to close incident: {resp.text}")
    
    def _create_incident_from_clear(self, report: dict, raw_html: str = None):
        """Create incident from CLEAR report when DISPATCH was missed."""
        event_number = report['event_number']
        event_type = report.get('event_type', '')
        event_subtype = report.get('event_subtype', '')
        
        call_category = self._determine_category(event_type, event_subtype)
        
        # Extract incident_date from report_time (format: "HH:MM MM/DD") if available
        # This is more accurate than server time if clear report is delayed
        incident_date = None
        if report.get('report_time'):
            try:
                # Parse "21:29 01/05" format - extract MM/DD from end
                rt = report['report_time']
                parts = rt.strip().split(' ')
                if len(parts) >= 2:
                    date_part = parts[-1]  # Get last part (MM/DD)
                    if '/' in date_part:
                        month, day = date_part.split('/')
                        year = datetime.now().year
                        incident_date = f"{year:04d}-{int(month):02d}-{int(day):02d}"
            except:
                pass
        
        # Fallback to server time if report_time parsing failed
        if not incident_date:
            incident_date = datetime.now().strftime('%Y-%m-%d')
        
        create_data = {
            'cad_event_number': event_number,
            'cad_event_type': event_type,
            'cad_event_subtype': event_subtype,
            'call_category': call_category,
            'address': report.get('address'),
            'municipality_code': report.get('municipality'),
            'incident_date': incident_date,
            'cad_raw_clear': raw_html,
        }
        
        if report.get('municipality'):
            try:
                requests.post(
                    f"{self.api_url}/api/lookups/municipalities/auto-create",
                    params={'code': report['municipality']},
                    headers=self._api_headers,
                    timeout=10
                )
            except:
                pass
        
        resp = requests.post(f"{self.api_url}/api/incidents", json=create_data, headers=self._api_headers, timeout=10)
        
        if resp.status_code != 200:
            raise Exception(f"API returned {resp.status_code}: {resp.text}")
        
        result = resp.json()
        incident_id = result['id']
        logger.info(f"Created incident {event_number} from CLEAR (ID: {incident_id})")
        self.stats['incidents_created'] += 1
        self.stats['incidents_created_from_clear'] += 1
        
        # Build unit data
        cad_units = []
        for ut in report.get('unit_times', []):
            unit_id = ut.get('unit_id')
            if not unit_id:
                continue
            
            unit_info = self._get_unit_info(unit_id)
            canonical_unit_id = unit_info['unit_designator'] or unit_id
            
            cad_units.append({
                'unit_id': canonical_unit_id,
                'station': None,
                'agency': None,
                'is_mutual_aid': not unit_info['is_ours'],
                'apparatus_id': unit_info['apparatus_id'],
                'unit_category': unit_info['category'],
                'counts_for_response_times': unit_info['counts_for_response_times'],
                'time_dispatched': self._parse_cad_time(ut.get('time_dispatched'), incident_date, None),
                'time_enroute': self._parse_cad_time(ut.get('time_enroute'), incident_date, None),
                'time_arrived': self._parse_cad_time(ut.get('time_arrived'), incident_date, None),
                'time_available': self._parse_cad_time(ut.get('time_available'), incident_date, None),
                'time_cleared': self._parse_cad_time(ut.get('time_at_quarters'), incident_date, None),
            })
        
        update_data = {
            'cross_streets': report.get('cross_streets'),
            'esz_box': report.get('esz'),
            'caller_name': report.get('caller_name'),
            'caller_phone': report.get('caller_phone'),
            'cad_units': cad_units,
        }
        
        if report.get('first_dispatch'):
            update_data['time_dispatched'] = self._parse_cad_time(report['first_dispatch'], incident_date, None)
        
        if cad_units:
            metric_units = [u for u in cad_units 
                           if u.get('counts_for_response_times') == True 
                           and not u.get('is_mutual_aid', True)]
            
            enroute_times = [u['time_enroute'] for u in metric_units if u.get('time_enroute')]
            if enroute_times:
                update_data['time_first_enroute'] = min(enroute_times)
            
            arrive_times = [u['time_arrived'] for u in metric_units if u.get('time_arrived')]
            if arrive_times:
                update_data['time_first_on_scene'] = min(arrive_times)
            
            # Only use OUR units for time_last_cleared (not mutual aid)
            our_units = [u for u in cad_units if not u.get('is_mutual_aid', True)]
            cleared_times = [u['time_cleared'] for u in our_units if u.get('time_cleared')]
            if cleared_times:
                update_data['time_last_cleared'] = max(cleared_times)
        
        requests.put(f"{self.api_url}/api/incidents/{incident_id}", json=update_data, headers=self._api_headers, timeout=10)
        requests.post(f"{self.api_url}/api/incidents/{incident_id}/close", headers=self._api_headers, timeout=10)
        logger.info(f"Closed incident {event_number} (created from clear)")
        self.stats['incidents_closed'] += 1
    
    def _determine_category(self, event_type: str, event_subtype: str = None) -> str:
        """
        Determine call category from event type.
        Simple rule: MEDICAL -> EMS, everything else -> FIRE
        """
        if (event_type or '').upper().startswith('MEDICAL'):
            return 'EMS'
        return 'FIRE'
    
    def _get_local_timezone(self) -> ZoneInfo:
        """Get configured timezone."""
        return ZoneInfo(self.timezone)
    
    def _parse_cad_datetime(self, dt_str: str) -> Optional[str]:
        """Parse CAD datetime (MM-DD-YY HH:MM:SS) to UTC ISO format."""
        if not dt_str:
            return None
        try:
            dt = datetime.strptime(dt_str, '%m-%d-%y %H:%M:%S')
            local_tz = self._get_local_timezone()
            local_dt = dt.replace(tzinfo=local_tz)
            utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
            return utc_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        except ValueError:
            return self._parse_cad_time(dt_str, None, None)
        except Exception as e:
            logger.error(f"Error parsing datetime {dt_str}: {e}")
            return None
    
    def _parse_cad_time(self, time_str: str, incident_date: str = None, dispatch_time_str: str = None) -> Optional[str]:
        """Parse CAD time (HH:MM:SS) to UTC ISO format with midnight detection."""
        if not time_str:
            return None
        try:
            time_part = datetime.strptime(time_str, '%H:%M:%S').time()
            
            if incident_date:
                base_date = datetime.strptime(incident_date, '%Y-%m-%d').date()
            else:
                base_date = datetime.now().date()
            
            dt = datetime.combine(base_date, time_part)
            
            # Midnight crossover detection
            if dispatch_time_str and incident_date:
                try:
                    dispatch_time = datetime.strptime(dispatch_time_str, '%H:%M:%S').time()
                    if time_part < dispatch_time:
                        dt = dt + timedelta(days=1)
                except:
                    pass
            
            local_tz = self._get_local_timezone()
            local_dt = dt.replace(tzinfo=local_tz)
            utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
            return utc_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        except Exception as e:
            logger.warning(f"Could not parse time {time_str}: {e}")
            return None
    
    def get_stats(self) -> dict:
        """Get current statistics."""
        return self.stats.copy()


def main():
    parser = argparse.ArgumentParser(description='CAD TCP Listener for RunSheet')
    parser.add_argument('--port', type=int, required=True, help='Port to listen on')
    parser.add_argument('--api-url', required=True, help='RunSheet API URL (e.g., https://glenmoorefc.cadreport.com)')
    parser.add_argument('--tenant', required=True, help='Tenant slug for data directory')
    parser.add_argument('--timezone', default='America/New_York', help='IANA timezone for CAD timestamps (default: America/New_York)')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    args = parser.parse_args()
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    listener = CADListener(
        port=args.port,
        api_url=args.api_url,
        tenant=args.tenant,
        timezone=args.timezone
    )
    
    try:
        listener.start()
    except KeyboardInterrupt:
        print("\nShutting down...")
        listener.stop()
        print(f"\nStats: {listener.get_stats()}")


if __name__ == '__main__':
    main()
