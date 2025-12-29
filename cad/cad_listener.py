"""
CAD TCP Listener for Chester County Emergency Services

Listens for incoming TCP connections from FDCMS ADI (or simulator).
Each connection sends one HTML report, then disconnects.

MULTI-TENANT: Each tenant runs their own listener instance on their assigned port.
The --tenant flag identifies which tenant's data directory to use for backups.

DATA PROTECTION:
- Raw HTML is saved to disk BEFORE any API call (retention priority)
- If dispatch fails, clear can still create the incident
- Failed API calls are queued for retry

Usage:
    python cad_listener.py --port 19117 --tenant glenmoorefc
    python cad_listener.py --port 19117 --tenant glenmoorefc --api-url http://localhost:8001
"""

import socket
import threading
import argparse
import logging
import json
import requests
import os
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo
from pathlib import Path

from cad_parser import parse_cad_html, report_to_dict

# Import settings from database
import sys
sys.path.insert(0, '/opt/runsheet/backend')
from settings_helper import get_unit_info, get_api_url, get_cad_port, get_timezone

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
    def __init__(self, port: int = None, api_url: str = None, tenant: str = None):
        self.port = port or get_cad_port(test=True)  # Default to test port
        self.api_url = api_url or get_api_url()
        self.tenant = tenant or 'default'
        self.running = False
        self.server_socket = None
        
        # Setup tenant data directories
        self.data_dir = Path(DATA_BASE_DIR) / self.tenant
        self.backup_dir = self.data_dir / 'cad_backup'
        self.failed_queue_dir = self.data_dir / 'cad_failed'
        
        # Create directories if they don't exist
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.failed_queue_dir.mkdir(parents=True, exist_ok=True)
        
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
    
    def _save_backup(self, raw_data: bytes, event_number: str, report_type: str) -> str:
        """
        Save raw CAD data to disk BEFORE any API processing.
        This is redundant protection - data also goes to database.
        
        NON-BLOCKING: If disk write fails, log error but continue processing.
        The database (cad_raw_dispatch/cad_raw_clear) is the primary store.
        
        Args:
            raw_data: Raw bytes from socket (not decoded yet)
            event_number: CAD event number for filename
            report_type: DISPATCH, CLEAR, or UNKNOWN
        
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
            alt_path = f"/tmp/cad_backup_{timestamp}_{event_number}_{report_type}.{ext}"
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
        # Check first 500 bytes for signatures
        header = raw_data[:500].lower() if raw_data else b''
        
        if b'<html' in header or b'<!doctype html' in header:
            return 'html'
        elif b'<?xml' in header:
            return 'xml'
        elif header.startswith(b'{') or header.startswith(b'['):
            return 'json'
        else:
            return 'dat'  # Unknown binary/text
    
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
            # This ensures we never lose data even if parsing/API fails
            # Use placeholder names until we parse
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
                # Rename backup file with UNPARSED tag if possible
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
            
            # Process the report (include text data for database storage)
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
            # Log failure with reference to backup file (raw data already saved)
            self._save_failed_request(report, backup_path, str(e))
    
    def _save_failed_request(self, report: dict, backup_path: str, error: str):
        """
        Log failed API request for later retry.
        
        Raw data is already saved in cad_backup/ - this just logs the failure
        with a reference to that backup file.
        """
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
                    'backup_file': backup_path,  # Reference to raw data
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
            resp = requests.get(f"{self.api_url}/api/incidents/by-cad/{event_number}", timeout=10)
            exists = resp.status_code == 200
            existing_incident = resp.json() if exists else None
        except Exception as e:
            logger.error(f"API error checking incident: {e}")
            exists = False
            existing_incident = None
        
        # Get event type and subtype separately (not combined)
        event_type = report.get('event_type', '')
        event_subtype = report.get('event_subtype', '')
        
        # Auto-create municipality if needed
        municipality_code = report.get('municipality')
        if municipality_code:
            try:
                requests.post(
                    f"{self.api_url}/api/lookups/municipalities/auto-create",
                    params={'code': municipality_code},
                    timeout=10
                )
            except Exception as e:
                logger.warning(f"Could not auto-create municipality: {e}")
        
        # Build cad_units from responding units
        # Merge with existing units if updating
        cad_units = []
        existing_units = {}
        
        if existing_incident and existing_incident.get('cad_units'):
            for u in existing_incident['cad_units']:
                existing_units[u['unit_id']] = u
        
        # Get incident date from dispatch_time for proper timestamp conversion
        # dispatch_time format: "12-07-25 14:09:18" (MM-DD-YY HH:MM:SS)
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
            
            # Look up unit info (includes category and response time config)
            unit_info = get_unit_info(unit_id)
            
            # Use canonical unit_designator if available (normalizes aliases like 48QRS -> QRS48)
            canonical_unit_id = unit_info['unit_designator'] or unit_id
            
            # Convert unit dispatch time to proper UTC format
            # unit.get('time') is raw HH:MM:SS from CAD
            unit_dispatch_time = None
            if unit.get('time') and incident_date_str:
                unit_dispatch_time = self._parse_cad_time(
                    unit.get('time'), incident_date_str, dispatch_time_str
                )
            
            # Merge with existing data, but ALWAYS update unit config from current apparatus table
            if canonical_unit_id in existing_units:
                unit_data = existing_units[canonical_unit_id]
                # ALWAYS update unit config fields from current apparatus config
                # This ensures changes to apparatus table are reflected
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
                    'time_dispatched': unit_dispatch_time,  # Now proper UTC ISO format
                    'time_enroute': None,
                    'time_arrived': None,
                    'time_available': None,
                    'time_cleared': None,
                }
            
            cad_units.append(unit_data)
        
        if exists:
            # Update existing incident - append raw HTML to updates array
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
                'cad_raw_updates': existing_updates,  # Store update HTMLs
            }
            
            # NOTE: Do NOT update time_dispatched on update reports
            # The new unit's dispatch time goes in cad_units[].time_dispatched
            # The incident-level time_dispatched must stay as the original incident start
            # Otherwise clear report midnight logic breaks (compares times to wrong reference)
            
            resp = requests.put(
                f"{self.api_url}/api/incidents/{existing_incident['id']}",
                json=update_data,
                timeout=10
            )
            
            if resp.status_code == 200:
                logger.info(f"Updated incident {event_number} - {len(cad_units)} units")
                self.stats['incidents_updated'] += 1
            else:
                logger.error(f"Failed to update incident: {resp.text}")
                raise Exception(f"API returned {resp.status_code}: {resp.text}")
        else:
            # Determine call category from event type mapping
            call_category = self._determine_category(event_type, event_subtype)
            
            # Create new incident
            create_data = {
                'cad_event_number': event_number,
                'cad_event_type': event_type,
                'cad_event_subtype': event_subtype,
                'call_category': call_category,
                'address': report.get('address'),
                'municipality_code': municipality_code,
                'cad_raw_dispatch': raw_html,  # Store raw CAD HTML
            }
            
            # Extract incident_date from dispatch_time - this is when the incident occurred
            if report.get('dispatch_time'):
                parsed_dt = self._parse_cad_datetime(report['dispatch_time'])
                if parsed_dt:
                    # Extract just the date portion (YYYY-MM-DD from ISO format)
                    create_data['incident_date'] = parsed_dt.split('T')[0]
            
            resp = requests.post(
                f"{self.api_url}/api/incidents",
                json=create_data,
                timeout=10
            )
            
            if resp.status_code == 200:
                result = resp.json()
                incident_id = result['id']
                logger.info(f"Created incident {event_number} (ID: {incident_id}) - {len(cad_units)} units")
                self.stats['incidents_created'] += 1
                
                # Now update with full details including cad_units
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
                    timeout=10
                )
            else:
                logger.error(f"Failed to create incident: {resp.text}")
                raise Exception(f"API returned {resp.status_code}: {resp.text}")
    
    def _handle_clear(self, report: dict, raw_html: str = None):
        """Handle Clear Report - update all fields, times, merge unit times, and close incident"""
        
        event_number = report['event_number']
        
        # Get incident
        try:
            resp = requests.get(f"{self.api_url}/api/incidents/by-cad/{event_number}", timeout=10)
            if resp.status_code != 200:
                # INCIDENT DOESN'T EXIST - create it from clear report!
                logger.warning(f"Incident {event_number} not found - creating from CLEAR report")
                self._create_incident_from_clear(report, raw_html)
                return
            incident = resp.json()
            incident_id = incident['id']
        except Exception as e:
            logger.error(f"Could not fetch incident: {e}")
            raise
        
        # Get the incident_date for proper time parsing
        # Clear reports only have times (HH:MM:SS), not dates
        # We need to use the incident's actual date, not today's date
        incident_date = incident.get('incident_date')  # Format: YYYY-MM-DD
        
        # Also get the dispatch time to detect midnight crossover
        # IMPORTANT: Convert stored UTC back to local time for comparison
        # because clear report times arrive as local wall clock times
        dispatch_time_str = None
        if incident.get('time_dispatched'):
            try:
                # Parse the stored UTC timestamp
                stored_dt_str = incident['time_dispatched']
                # Handle both 'Z' and '+00:00' UTC suffixes
                if stored_dt_str.endswith('Z'):
                    stored_dt_str = stored_dt_str[:-1] + '+00:00'
                utc_dt = datetime.fromisoformat(stored_dt_str)
                # Convert to local timezone to get original wall clock time
                local_tz = self._get_local_timezone()
                local_dt = utc_dt.astimezone(local_tz)
                dispatch_time_str = local_dt.strftime('%H:%M:%S')
            except Exception as e:
                logger.warning(f"Could not parse dispatch time for midnight detection: {e}")
                pass
        
        # If we don't have incident_date, try to extract from time_dispatched
        if not incident_date and incident.get('time_dispatched'):
            try:
                incident_date = incident['time_dispatched'].split('T')[0]
            except:
                pass
        
        # Build update data - start with raw HTML
        update_data = {
            'cad_raw_clear': raw_html,  # Store raw clear report HTML
        }
        
        # Track fields that changed between dispatch and clear for audit purposes
        cad_changes = []
        
        # Update ALL text fields from clear report (clear report is most authoritative)
        # Address, municipality, cross streets, caller info, event type/subtype
        if report.get('address'):
            if report['address'] != incident.get('address'):
                cad_changes.append(f"address: '{incident.get('address')}' -> '{report['address']}'")
            update_data['address'] = report['address']
        
        if report.get('municipality'):
            # Auto-create municipality if needed
            try:
                requests.post(
                    f"{self.api_url}/api/lookups/municipalities/auto-create",
                    params={'code': report['municipality']},
                    timeout=10
                )
            except Exception as e:
                logger.warning(f"Could not auto-create municipality: {e}")
            if report['municipality'] != incident.get('municipality_code'):
                cad_changes.append(f"municipality: '{incident.get('municipality_code')}' -> '{report['municipality']}'")
            update_data['municipality_code'] = report['municipality']
        
        if report.get('cross_streets'):
            if report['cross_streets'] != incident.get('cross_streets'):
                cad_changes.append(f"cross_streets: '{incident.get('cross_streets')}' -> '{report['cross_streets']}'")
            update_data['cross_streets'] = report['cross_streets']
        
        if report.get('esz'):
            update_data['esz_box'] = report['esz']
        
        if report.get('event_type'):
            if report['event_type'] != incident.get('cad_event_type'):
                cad_changes.append(f"event_type: '{incident.get('cad_event_type')}' -> '{report['event_type']}'")
            update_data['cad_event_type'] = report['event_type']
        
        if report.get('event_subtype'):
            if report['event_subtype'] != incident.get('cad_event_subtype'):
                cad_changes.append(f"event_subtype: '{incident.get('cad_event_subtype')}' -> '{report['event_subtype']}'")
            update_data['cad_event_subtype'] = report['event_subtype']
        
        if report.get('caller_name'):
            update_data['caller_name'] = report['caller_name']
        
        if report.get('caller_phone'):
            update_data['caller_phone'] = report['caller_phone']
        
        # Log any CAD data changes for audit trail
        if cad_changes:
            logger.info(f"CAD data changed between dispatch and clear for {event_number}: {'; '.join(cad_changes)}")
        
        if report.get('first_dispatch'):
            update_data['time_dispatched'] = self._parse_cad_time(
                report['first_dispatch'], incident_date, dispatch_time_str
            )
        # NOTE: first_enroute and first_on_scene will be calculated from units
        # that have counts_for_response_times=true (after processing unit times below)
        
        # NOTE: time_last_cleared will be calculated from MAX(time_cleared) across all units
        # below after processing unit times. We no longer use the header value.
        # time_in_service is NOT stored as a timestamp - it's calculated as duration in frontend.
        
        # Merge unit times from Clear Report into cad_units
        existing_units = {}
        if incident.get('cad_units'):
            for u in incident['cad_units']:
                existing_units[u['unit_id']] = u
        
        for ut in report.get('unit_times', []):
            unit_id = ut.get('unit_id')
            if not unit_id:
                continue
            
            # Look up unit info (includes category and response time config)
            unit_info = get_unit_info(unit_id)
            
            # Use canonical unit_designator if available (normalizes aliases like 48QRS -> QRS48)
            canonical_unit_id = unit_info['unit_designator'] or unit_id
            
            # Parse unit times with proper date
            time_dispatched = self._parse_cad_time(
                ut.get('time_dispatched'), incident_date, dispatch_time_str
            ) if ut.get('time_dispatched') else None
            time_enroute = self._parse_cad_time(
                ut.get('time_enroute'), incident_date, dispatch_time_str
            ) if ut.get('time_enroute') else None
            time_arrived = self._parse_cad_time(
                ut.get('time_arrived'), incident_date, dispatch_time_str
            ) if ut.get('time_arrived') else None
            time_available = self._parse_cad_time(
                ut.get('time_available'), incident_date, dispatch_time_str
            ) if ut.get('time_available') else None
            time_cleared = self._parse_cad_time(
                ut.get('time_at_quarters'), incident_date, dispatch_time_str
            ) if ut.get('time_at_quarters') else None
            
            if canonical_unit_id in existing_units:
                # Update existing unit with times AND always refresh config from apparatus table
                existing_units[canonical_unit_id]['time_dispatched'] = time_dispatched
                existing_units[canonical_unit_id]['time_enroute'] = time_enroute
                existing_units[canonical_unit_id]['time_arrived'] = time_arrived
                existing_units[canonical_unit_id]['time_available'] = time_available
                existing_units[canonical_unit_id]['time_cleared'] = time_cleared
                # ALWAYS update unit config from current apparatus table
                # This ensures changes to apparatus config are reflected
                existing_units[canonical_unit_id]['is_mutual_aid'] = not unit_info['is_ours']
                existing_units[canonical_unit_id]['apparatus_id'] = unit_info['apparatus_id']
                existing_units[canonical_unit_id]['unit_category'] = unit_info['category']
                existing_units[canonical_unit_id]['counts_for_response_times'] = unit_info['counts_for_response_times']
            else:
                # New unit from clear report (maybe wasn't in dispatch)
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
            
            # Calculate first_enroute and first_on_scene from units where counts_for_response_times=true
            # This excludes chief vehicles and other units configured not to affect metrics
            # CRITICAL: Default to False - if field is missing/None, unit should NOT affect metrics
            # Also check is_mutual_aid as belt-and-suspenders safety
            metric_units = [u for u in cad_units 
                           if u.get('counts_for_response_times') == True 
                           and not u.get('is_mutual_aid', True)]
            
            # Find earliest enroute time from units that count
            enroute_times = [u['time_enroute'] for u in metric_units if u.get('time_enroute')]
            if enroute_times:
                update_data['time_first_enroute'] = min(enroute_times)
                logger.debug(f"Calculated first_enroute from {len(enroute_times)} metric units")
            
            # Find earliest arrival time from units that count
            arrive_times = [u['time_arrived'] for u in metric_units if u.get('time_arrived')]
            if arrive_times:
                update_data['time_first_on_scene'] = min(arrive_times)
                logger.debug(f"Calculated first_on_scene from {len(arrive_times)} metric units")
            
            # Find latest cleared time from ALL units (not just metric units)
            # This is when the incident is actually over
            cleared_times = [u['time_cleared'] for u in cad_units if u.get('time_cleared')]
            if cleared_times:
                update_data['time_last_cleared'] = max(cleared_times)
                logger.debug(f"Calculated last_cleared from {len(cleared_times)} units")
            
            # Log which units were excluded from metrics
            # Excluded = either counts_for_response_times is not True OR is_mutual_aid is True
            excluded_units = [u['unit_id'] for u in cad_units 
                             if u.get('counts_for_response_times') != True or u.get('is_mutual_aid', True)]
            if excluded_units:
                logger.info(f"Units excluded from response metrics: {', '.join(excluded_units)}")
        
        # Update incident
        if update_data:
            resp = requests.put(
                f"{self.api_url}/api/incidents/{incident_id}",
                json=update_data,
                timeout=10
            )
            if resp.status_code == 200:
                logger.info(f"Updated incident {event_number} with clear times - {len(cad_units)} units")
            else:
                logger.error(f"Failed to update incident: {resp.text}")
                raise Exception(f"API returned {resp.status_code}: {resp.text}")
        
        # Close the incident
        resp = requests.post(f"{self.api_url}/api/incidents/{incident_id}/close", timeout=10)
        if resp.status_code == 200:
            logger.info(f"Closed incident {event_number}")
            self.stats['incidents_closed'] += 1
        else:
            logger.error(f"Failed to close incident: {resp.text}")
        
        # Log unit times for reference
        if report.get('unit_times'):
            logger.info(f"Unit times for {event_number}:")
            for ut in report['unit_times']:
                logger.info(
                    f"  {ut['unit_id']}: DP={ut.get('time_dispatched', '-')} "
                    f"ER={ut.get('time_enroute', '-')} AR={ut.get('time_arrived', '-')} "
                    f"AQ={ut.get('time_at_quarters', '-')}"
                )
    
    def _create_incident_from_clear(self, report: dict, raw_html: str = None):
        """
        Create an incident from a CLEAR report when DISPATCH was missed.
        This ensures we don't lose incident data even if dispatch failed.
        """
        event_number = report['event_number']
        event_type = report.get('event_type', '')
        event_subtype = report.get('event_subtype', '')
        
        # Determine call category
        call_category = self._determine_category(event_type, event_subtype)
        
        # Extract incident date from first_dispatch time in clear report
        incident_date = None
        if report.get('first_dispatch'):
            try:
                # first_dispatch in clear is just HH:MM:SS, need to use today or infer
                # Best we can do is use today's date
                incident_date = datetime.now().strftime('%Y-%m-%d')
            except:
                pass
        
        # Create the incident
        create_data = {
            'cad_event_number': event_number,
            'cad_event_type': event_type,
            'cad_event_subtype': event_subtype,
            'call_category': call_category,
            'address': report.get('address'),
            'municipality_code': report.get('municipality'),
            'incident_date': incident_date,
            'cad_raw_clear': raw_html,  # Store clear as primary since we missed dispatch
        }
        
        # Auto-create municipality if needed
        if report.get('municipality'):
            try:
                requests.post(
                    f"{self.api_url}/api/lookups/municipalities/auto-create",
                    params={'code': report['municipality']},
                    timeout=10
                )
            except:
                pass
        
        resp = requests.post(
            f"{self.api_url}/api/incidents",
            json=create_data,
            timeout=10
        )
        
        if resp.status_code != 200:
            logger.error(f"Failed to create incident from clear: {resp.text}")
            raise Exception(f"API returned {resp.status_code}: {resp.text}")
        
        result = resp.json()
        incident_id = result['id']
        logger.info(f"Created incident {event_number} from CLEAR report (ID: {incident_id})")
        self.stats['incidents_created'] += 1
        self.stats['incidents_created_from_clear'] += 1
        
        # Now process unit times and update like normal clear
        # Use today's date for time parsing since we don't have original dispatch
        incident_date = datetime.now().strftime('%Y-%m-%d')
        dispatch_time_str = None
        
        # Build unit data from clear report
        cad_units = []
        for ut in report.get('unit_times', []):
            unit_id = ut.get('unit_id')
            if not unit_id:
                continue
            
            unit_info = get_unit_info(unit_id)
            canonical_unit_id = unit_info['unit_designator'] or unit_id
            
            time_dispatched = self._parse_cad_time(
                ut.get('time_dispatched'), incident_date, dispatch_time_str
            ) if ut.get('time_dispatched') else None
            time_enroute = self._parse_cad_time(
                ut.get('time_enroute'), incident_date, dispatch_time_str
            ) if ut.get('time_enroute') else None
            time_arrived = self._parse_cad_time(
                ut.get('time_arrived'), incident_date, dispatch_time_str
            ) if ut.get('time_arrived') else None
            time_available = self._parse_cad_time(
                ut.get('time_available'), incident_date, dispatch_time_str
            ) if ut.get('time_available') else None
            time_cleared = self._parse_cad_time(
                ut.get('time_at_quarters'), incident_date, dispatch_time_str
            ) if ut.get('time_at_quarters') else None
            
            cad_units.append({
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
            })
        
        # Update with times and units
        update_data = {
            'cross_streets': report.get('cross_streets'),
            'esz_box': report.get('esz'),
            'caller_name': report.get('caller_name'),
            'caller_phone': report.get('caller_phone'),
            'cad_units': cad_units,
        }
        
        if report.get('first_dispatch'):
            update_data['time_dispatched'] = self._parse_cad_time(
                report['first_dispatch'], incident_date, None
            )
        
        # Calculate metrics from units
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
            
            cleared_times = [u['time_cleared'] for u in cad_units if u.get('time_cleared')]
            if cleared_times:
                update_data['time_last_cleared'] = max(cleared_times)
        
        requests.put(
            f"{self.api_url}/api/incidents/{incident_id}",
            json=update_data,
            timeout=10
        )
        
        # Close the incident
        requests.post(f"{self.api_url}/api/incidents/{incident_id}/close", timeout=10)
        logger.info(f"Closed incident {event_number} (created from clear)")
        self.stats['incidents_closed'] += 1
    
    def _determine_category(self, event_type: str, event_subtype: str = None) -> str:
        """
        Determine call category (FIRE or EMS) from CAD event type.
        Uses cad_type_mappings table for learned overrides, falls back to defaults.
        """
        # Try to look up in mappings via API
        try:
            params = {'event_type': event_type}
            if event_subtype:
                params['event_subtype'] = event_subtype
            
            resp = requests.get(
                f"{self.api_url}/api/lookups/cad-type-mappings/lookup",
                params=params,
                timeout=5
            )
            
            if resp.status_code == 200:
                data = resp.json()
                return data.get('call_category', 'FIRE')
        except Exception as e:
            logger.warning(f"Could not lookup category mapping: {e}")
        
        # Fall back to default logic
        event_type_upper = (event_type or '').upper()
        if event_type_upper.startswith('MEDICAL'):
            return 'EMS'
        return 'FIRE'
    
    def _get_local_timezone(self) -> ZoneInfo:
        """
        Get the configured local timezone for CAD data.
        CAD times arrive as local time (what the wall clock said).
        """
        return ZoneInfo(get_timezone())
    
    def _parse_cad_datetime(self, dt_str: str) -> Optional[str]:
        """
        Parse CAD datetime format: 12-07-25 14:09:18 (24-hour clock)
        Converts local time to UTC for storage.
        """
        if not dt_str:
            return None
        try:
            # Try MM-DD-YY HH:MM:SS format (24-hour)
            dt = datetime.strptime(dt_str, '%m-%d-%y %H:%M:%S')
            
            # CAD sends local time - convert to UTC
            local_tz = self._get_local_timezone()
            local_dt = dt.replace(tzinfo=local_tz)
            utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
            
            # Log the conversion
            logger.info(f"Datetime conversion: {dt_str} local -> {utc_dt.strftime('%Y-%m-%dT%H:%M:%SZ')} UTC")
            
            # Return with explicit Z suffix
            return utc_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        except ValueError:
            try:
                # Try just time HH:MM:SS (use today's date as fallback)
                return self._parse_cad_time(dt_str, None, None)
            except:
                logger.warning(f"Could not parse datetime: {dt_str}")
                return None
        except Exception as e:
            logger.error(f"Unexpected error parsing datetime {dt_str}: {e}")
            return None
    
    def _parse_cad_time(self, time_str: str, incident_date: str = None, dispatch_time_str: str = None) -> Optional[str]:
        """
        Parse CAD time format: 14:09:18 (24-hour clock)
        Converts local time to UTC for storage.
        
        Args:
            time_str: Time string in HH:MM:SS format
            incident_date: The incident's date in YYYY-MM-DD format
            dispatch_time_str: The dispatch time in HH:MM:SS format (for midnight detection)
        
        Returns:
            ISO format datetime string in UTC with Z suffix, or None if parsing fails
        """
        if not time_str:
            return None
        try:
            time_part = datetime.strptime(time_str, '%H:%M:%S').time()
            
            # Determine which date to use
            if incident_date:
                base_date = datetime.strptime(incident_date, '%Y-%m-%d').date()
            else:
                # Fallback to today if no incident_date provided
                base_date = datetime.now().date()
            
            # Combine date and time (still local)
            dt = datetime.combine(base_date, time_part)
            
            # Check for midnight crossover (24-hour clock logic)
            # If this time is earlier than dispatch time, it crossed midnight
            if dispatch_time_str and incident_date:
                try:
                    dispatch_time = datetime.strptime(dispatch_time_str, '%H:%M:%S').time()
                    # Simple rule: if this time < dispatch time, add 1 day
                    # e.g., dispatch 23:07, cleared 00:15 -> next day
                    if time_part < dispatch_time:
                        dt = dt + timedelta(days=1)
                        logger.debug(f"Midnight crossover detected: {time_str} -> {dt.date()}")
                except:
                    pass
            
            # CAD sends local time - convert to UTC
            local_tz = self._get_local_timezone()
            local_dt = dt.replace(tzinfo=local_tz)
            utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
            
            # Return with explicit Z suffix to ensure UTC is clear
            return utc_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        except ValueError as e:
            logger.warning(f"Could not parse time: {time_str} - {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error parsing time {time_str}: {e}")
            return None
    
    def get_stats(self) -> dict:
        """Get current statistics"""
        return self.stats.copy()


def main():
    # Get defaults from database
    default_port = get_cad_port(test=True)
    default_api = get_api_url()
    
    parser = argparse.ArgumentParser(description='CAD TCP Listener')
    parser.add_argument('--port', type=int, default=default_port, help=f'Port to listen on (default: {default_port})')
    parser.add_argument('--api-url', default=default_api, help=f'RunSheet API URL (default: {default_api})')
    parser.add_argument('--tenant', default='glenmoorefc', help='Tenant slug for data directory (default: glenmoorefc)')
    parser.add_argument('--production', action='store_true', help='Use production port from settings')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    args = parser.parse_args()
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Use production port if flag set
    port = get_cad_port(test=False) if args.production else args.port
    
    listener = CADListener(port=port, api_url=args.api_url, tenant=args.tenant)
    
    try:
        listener.start()
    except KeyboardInterrupt:
        print("\nShutting down...")
        listener.stop()
        print(f"\nStats: {listener.get_stats()}")


if __name__ == '__main__':
    main()
