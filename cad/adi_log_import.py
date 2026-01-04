#!/usr/bin/env python3
"""
ADI Log File Importer

Imports historical CAD data from ADI .log files into CADReport.
Each .log file contains raw HTML CAD reports (Dispatch and Clear) 
that ADI received from Chester County.

Usage:
    # Import to test tenant (gmfc2)
    python adi_log_import.py ADI202201.log --tenant gmfc2
    
    # Dry run first
    python adi_log_import.py ADI202201.log --tenant gmfc2 --dry-run
    
    # Import to production (glenmoorefc)
    python adi_log_import.py ADI202201.log --tenant glenmoorefc
"""

import re
import sys
import argparse
import logging
import requests
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List
from zoneinfo import ZoneInfo

from cad_parser import parse_cad_html, report_to_dict

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


class ADILogImporter:
    def __init__(self, api_url: str, tenant: str, timezone: str = 'America/New_York', dry_run: bool = False):
        self.api_url = api_url.rstrip('/')
        self.timezone = timezone
        self.dry_run = dry_run
        self.tenant = tenant
        
        # Host header for multi-tenant database routing
        self.headers = {'Host': f'{tenant}.cadreport.com'}
        logger.info(f"Tenant: {tenant} → Host: {self.headers['Host']}")
        
        # Unit cache
        self._unit_cache: Dict[str, Dict[str, Any]] = {}
        
        # Stats
        self.stats = {
            'reports_parsed': 0,
            'dispatch_reports': 0,
            'clear_reports': 0,
            'incidents_created': 0,
            'incidents_updated': 0,
            'incidents_closed': 0,
            'incidents_skipped': 0,
            'errors': 0,
            'parse_errors': 0,
        }
    
    def _parse_dispatch_datetime_str(self, dt_str: str) -> Optional[datetime]:
        """
        Parse dispatch datetime string handling multiple formats:
        - MM-DD-YY HH:MM:SS (newer format)
        - DD-MM-YY HH:MM:SS (older 2018 format)
        Also strips timezone suffixes (ED, EDT, EST, ES).
        """
        if not dt_str:
            return None
        
        # Strip timezone suffixes
        dt_str = re.sub(r'\s+(ED|EDT|EST|ES)$', '', dt_str.strip())
        
        # Try MM-DD-YY first (newer format)
        try:
            return datetime.strptime(dt_str, '%m-%d-%y %H:%M:%S')
        except ValueError:
            pass
        
        # Try DD-MM-YY (older 2018 format)
        try:
            return datetime.strptime(dt_str, '%d-%m-%y %H:%M:%S')
        except ValueError:
            pass
        
        return None
    
    def import_log_file(self, filepath: str):
        """Import all reports from an ADI log file."""
        path = Path(filepath)
        if not path.exists():
            logger.error(f"File not found: {filepath}")
            return
        
        logger.info(f"Reading {filepath}...")
        
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        
        # Split by ADI log markers
        # Format: >>> MM/DD/YY  HH:MM:SS  ADI: ...
        segments = re.split(r'>>>[^\n]+\n', content)
        
        reports = []
        for segment in segments:
            segment = segment.strip()
            if not segment or '<' not in segment:
                continue
            
            # Skip non-HTML segments (ADI status messages, etc)
            if not ('<table' in segment.lower() or '<style' in segment.lower()):
                continue
            
            try:
                parsed = parse_cad_html(segment)
                if parsed and parsed.event_number:
                    report_dict = report_to_dict(parsed)
                    report_dict['_raw_html'] = segment
                    reports.append(report_dict)
                    self.stats['reports_parsed'] += 1
            except Exception as e:
                self.stats['parse_errors'] += 1
                logger.warning(f"Parse error: {e}")
        
        logger.info(f"Parsed {len(reports)} reports from {path.name}")
        
        # Sort by event number and type (DISPATCH before CLEAR)
        def sort_key(r):
            event = r.get('event_number', '')
            type_order = 0 if r.get('report_type') == 'DISPATCH' else 1
            return (event, type_order)
        
        reports.sort(key=sort_key)
        
        # Process each report
        for i, report in enumerate(reports):
            if (i + 1) % 50 == 0:
                logger.info(f"Progress: {i + 1}/{len(reports)}")
            
            try:
                self._process_report(report)
            except Exception as e:
                self.stats['errors'] += 1
                logger.error(f"Error processing {report.get('event_number')}: {e}")
        
        logger.info(f"Import complete. Stats: {self.stats}")
    
    def _process_report(self, report: dict):
        """Process a single parsed report."""
        report_type = report.get('report_type')
        raw_html = report.get('_raw_html')
        
        if report_type == 'DISPATCH':
            self.stats['dispatch_reports'] += 1
            self._handle_dispatch(report, raw_html)
        elif report_type == 'CLEAR':
            self.stats['clear_reports'] += 1
            self._handle_clear(report, raw_html)
    
    def _get_unit_info(self, unit_id: str) -> Dict[str, Any]:
        """Look up unit info via API with caching."""
        if unit_id in self._unit_cache:
            return self._unit_cache[unit_id]
        
        try:
            resp = requests.get(
                f"{self.api_url}/api/apparatus/lookup",
                params={'unit_id': unit_id},
                headers=self.headers,
                timeout=5
            )
            if resp.status_code == 200:
                data = resp.json()
                self._unit_cache[unit_id] = data
                return data
        except Exception as e:
            logger.debug(f"Could not lookup unit {unit_id}: {e}")
        
        # Default for unknown units
        return {
            'unit_designator': unit_id,
            'apparatus_id': None,
            'category': None,
            'is_ours': False,
            'counts_for_response_times': False,
        }
    
    def _incident_exists(self, event_number: str) -> tuple[bool, Optional[dict]]:
        """Check if incident already exists."""
        if self.dry_run:
            return False, None
        
        try:
            resp = requests.get(
                f"{self.api_url}/api/incidents/by-cad/{event_number}",
                headers=self.headers,
                timeout=10
            )
            if resp.status_code == 200:
                return True, resp.json()
        except:
            pass
        return False, None
    
    def _handle_dispatch(self, report: dict, raw_html: str = None):
        """Handle Dispatch Report."""
        event_number = report['event_number']
        
        exists, existing = self._incident_exists(event_number)
        if exists:
            logger.debug(f"Skipping existing incident {event_number}")
            self.stats['incidents_skipped'] += 1
            return
        
        event_type = report.get('event_type', '')
        event_subtype = report.get('event_subtype', '')
        municipality_code = report.get('municipality')
        
        # Auto-create municipality
        if municipality_code and not self.dry_run:
            try:
                requests.post(
                    f"{self.api_url}/api/lookups/municipalities/auto-create",
                    params={'code': municipality_code},
                    headers=self.headers,
                    timeout=10
                )
            except:
                pass
        
        # Determine category
        call_category = self._determine_category(event_type, event_subtype)
        
        # Get year from event number as fallback (e.g., F18013845 -> 2018)
        fallback_year = datetime.now().year
        try:
            year_prefix = event_number[1:3]
            fallback_year = 2000 + int(year_prefix)
        except:
            pass
        
        # Parse incident date from dispatch_time
        incident_date = None
        if report.get('dispatch_time'):
            dt = self._parse_dispatch_datetime_str(report['dispatch_time'])
            if dt:
                incident_date = dt.strftime('%Y-%m-%d')
            else:
                logger.warning(f"Could not parse dispatch_time '{report['dispatch_time']}' for {event_number}")
        
        # Fall back to Jan 1 of event year if parsing failed
        if not incident_date:
            incident_date = f"{fallback_year}-01-01"
            logger.warning(f"No date parsed for {event_number}, defaulting to {incident_date}")
        
        create_data = {
            'cad_event_number': event_number,
            'cad_event_type': event_type,
            'cad_event_subtype': event_subtype,
            'call_category': call_category,
            'address': report.get('address'),
            'municipality_code': municipality_code,
            'incident_date': incident_date,
            'cad_raw_dispatch': raw_html,
        }
        
        if self.dry_run:
            logger.info(f"[DRY RUN] Would create: {event_number} - {event_type} - {report.get('address')}")
            self.stats['incidents_created'] += 1
            return
        
        resp = requests.post(
            f"{self.api_url}/api/incidents",
            json=create_data,
            headers=self.headers,
            timeout=10
        )
        
        if resp.status_code != 200:
            raise Exception(f"API returned {resp.status_code}: {resp.text}")
        
        result = resp.json()
        incident_id = result['id']
        logger.info(f"Created incident {event_number} (ID: {incident_id})")
        self.stats['incidents_created'] += 1
        
        # Build cad_units
        cad_units = self._build_cad_units_from_dispatch(report, incident_date)
        
        # Update with additional fields
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
            headers=self.headers,
            timeout=10
        )
    
    def _handle_clear(self, report: dict, raw_html: str = None):
        """Handle Clear Report."""
        event_number = report['event_number']
        
        exists, incident = self._incident_exists(event_number)
        
        if not exists:
            # Create from clear (dispatch was missed or not in this file)
            self._create_incident_from_clear(report, raw_html)
            return
        
        incident_id = incident['id']
        incident_date = incident.get('incident_date')
        
        # Get dispatch time for midnight detection
        dispatch_time_str = None
        if incident.get('time_dispatched'):
            try:
                stored_dt_str = incident['time_dispatched']
                if stored_dt_str.endswith('Z'):
                    stored_dt_str = stored_dt_str[:-1] + '+00:00'
                utc_dt = datetime.fromisoformat(stored_dt_str)
                local_tz = ZoneInfo(self.timezone)
                local_dt = utc_dt.astimezone(local_tz)
                dispatch_time_str = local_dt.strftime('%H:%M:%S')
            except:
                pass
        
        if not incident_date and incident.get('time_dispatched'):
            try:
                incident_date = incident['time_dispatched'].split('T')[0]
            except:
                pass
        
        update_data = {
            'cad_raw_clear': raw_html,
        }
        
        # Update fields from clear report
        if report.get('address'):
            update_data['address'] = report['address']
        if report.get('municipality'):
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
        
        # Only set dispatch time if not already set from DISPATCH report
        if report.get('first_dispatch') and not incident.get('time_dispatched'):
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
            
            times = {
                'time_dispatched': self._parse_cad_time(ut.get('time_dispatched'), incident_date, dispatch_time_str),
                'time_enroute': self._parse_cad_time(ut.get('time_enroute'), incident_date, dispatch_time_str),
                'time_arrived': self._parse_cad_time(ut.get('time_arrived'), incident_date, dispatch_time_str),
                'time_available': self._parse_cad_time(ut.get('time_available'), incident_date, dispatch_time_str),
                'time_cleared': self._parse_cad_time(ut.get('time_at_quarters'), incident_date, dispatch_time_str),
            }
            
            if canonical_unit_id in existing_units:
                existing_units[canonical_unit_id].update(times)
                existing_units[canonical_unit_id].update({
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
                    **times,
                }
        
        cad_units = list(existing_units.values())
        if cad_units:
            update_data['cad_units'] = cad_units
            
            # Calculate response metrics
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
        
        if self.dry_run:
            logger.info(f"[DRY RUN] Would update and close: {event_number}")
            self.stats['incidents_updated'] += 1
            self.stats['incidents_closed'] += 1
            return
        
        # Update incident
        resp = requests.put(
            f"{self.api_url}/api/incidents/{incident_id}",
            json=update_data,
            headers=self.headers,
            timeout=10
        )
        if resp.status_code == 200:
            self.stats['incidents_updated'] += 1
        
        # Close incident
        resp = requests.post(
            f"{self.api_url}/api/incidents/{incident_id}/close",
            headers=self.headers,
            timeout=10
        )
        if resp.status_code == 200:
            logger.debug(f"Closed incident {event_number}")
            self.stats['incidents_closed'] += 1
    
    def _create_incident_from_clear(self, report: dict, raw_html: str = None):
        """Create incident from CLEAR when DISPATCH was missed."""
        event_number = report['event_number']
        event_type = report.get('event_type', '')
        event_subtype = report.get('event_subtype', '')
        
        call_category = self._determine_category(event_type, event_subtype)
        
        # Get year from event number first (e.g., F25052996 -> 2025)
        year = datetime.now().year
        try:
            year_prefix = event_number[1:3]
            year = 2000 + int(year_prefix)
        except:
            pass
        
        # Try to get incident date from report_time
        # Format can be "HH:MM MM/DD" (e.g., "03:18 09/28") or "MM-DD-YY HH:MM:SS"
        incident_date = None
        report_time_hour = None
        if report.get('report_time'):
            rt = report['report_time'].strip()
            try:
                if '-' in rt and len(rt) > 10:
                    # Try both date formats
                    dt = self._parse_dispatch_datetime_str(rt)
                    if dt:
                        incident_date = dt.strftime('%Y-%m-%d')
                        report_time_hour = dt.hour
                elif '/' in rt:
                    # Format: HH:MM MM/DD (e.g., "03:18 09/28")
                    date_match = re.search(r'(\d{1,2})/(\d{1,2})', rt)
                    time_match = re.search(r'^(\d{1,2}):(\d{2})', rt)
                    if date_match:
                        month = int(date_match.group(1))
                        day = int(date_match.group(2))
                        incident_date = f"{year}-{month:02d}-{day:02d}"
                    if time_match:
                        report_time_hour = int(time_match.group(1))
            except Exception as e:
                logger.warning(f"Could not parse report_time '{rt}': {e}")
        
        # Get first_dispatch for midnight crossover detection
        # This matches the logic used in _handle_clear when DISPATCH exists
        dispatch_time_str = report.get('first_dispatch')  # e.g., "20:54:26"
        
        # Detect midnight crossover: if dispatch was in evening and report_time
        # is in early morning, the incident started the PREVIOUS day
        # Example: dispatch 20:54, report 03:18 → incident started day before
        if incident_date and dispatch_time_str and report_time_hour is not None:
            try:
                dispatch_hour = int(dispatch_time_str.split(':')[0])
                # If dispatch in evening (>= 12) and report in early morning (< 12)
                # and dispatch hour > report hour, it crossed midnight
                if dispatch_hour >= 12 and report_time_hour < 12 and dispatch_hour > report_time_hour:
                    dt = datetime.strptime(incident_date, '%Y-%m-%d')
                    dt = dt - timedelta(days=1)
                    incident_date = dt.strftime('%Y-%m-%d')
                    logger.info(f"Midnight crossover detected for {event_number}, adjusted incident_date to {incident_date}")
            except Exception as e:
                logger.warning(f"Could not check midnight crossover for {event_number}: {e}")
        
        # Fall back to Jan 1 of event year
        if not incident_date:
            incident_date = f"{year}-01-01"
            logger.warning(f"No date parsed for {event_number}, defaulting to {incident_date}")
        
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
        
        if report.get('municipality') and not self.dry_run:
            try:
                requests.post(
                    f"{self.api_url}/api/lookups/municipalities/auto-create",
                    params={'code': report['municipality']},
                    headers=self.headers,
                    timeout=10
                )
            except:
                pass
        
        if self.dry_run:
            logger.info(f"[DRY RUN] Would create from CLEAR: {event_number} - {event_type}")
            self.stats['incidents_created'] += 1
            self.stats['incidents_closed'] += 1
            return
        
        resp = requests.post(
            f"{self.api_url}/api/incidents",
            json=create_data,
            headers=self.headers,
            timeout=10
        )
        
        if resp.status_code != 200:
            raise Exception(f"API returned {resp.status_code}: {resp.text}")
        
        result = resp.json()
        incident_id = result['id']
        logger.info(f"Created incident {event_number} from CLEAR (ID: {incident_id})")
        self.stats['incidents_created'] += 1
        
        # Build unit data from clear report
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
                'time_dispatched': self._parse_cad_time(ut.get('time_dispatched'), incident_date, dispatch_time_str),
                'time_enroute': self._parse_cad_time(ut.get('time_enroute'), incident_date, dispatch_time_str),
                'time_arrived': self._parse_cad_time(ut.get('time_arrived'), incident_date, dispatch_time_str),
                'time_available': self._parse_cad_time(ut.get('time_available'), incident_date, dispatch_time_str),
                'time_cleared': self._parse_cad_time(ut.get('time_at_quarters'), incident_date, dispatch_time_str),
            })
        
        update_data = {
            'cross_streets': report.get('cross_streets'),
            'esz_box': report.get('esz'),
            'caller_name': report.get('caller_name'),
            'caller_phone': report.get('caller_phone'),
            'cad_units': cad_units,
        }
        
        if report.get('first_dispatch'):
            update_data['time_dispatched'] = self._parse_cad_time(
                report['first_dispatch'], incident_date, dispatch_time_str
            )
        
        # Calculate metrics
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
            headers=self.headers,
            timeout=10
        )
        
        requests.post(
            f"{self.api_url}/api/incidents/{incident_id}/close",
            headers=self.headers,
            timeout=10
        )
        self.stats['incidents_closed'] += 1
    
    def _build_cad_units_from_dispatch(self, report: dict, incident_date: str) -> List[dict]:
        """Build cad_units list from dispatch report."""
        cad_units = []
        
        dispatch_time_str = None
        if report.get('dispatch_time'):
            dt = self._parse_dispatch_datetime_str(report['dispatch_time'])
            if dt:
                dispatch_time_str = dt.strftime('%H:%M:%S')
        
        for unit in report.get('responding_units', []):
            unit_id = unit.get('unit_id')
            if not unit_id:
                continue
            
            unit_info = self._get_unit_info(unit_id)
            canonical_unit_id = unit_info['unit_designator'] or unit_id
            
            unit_dispatch_time = None
            if unit.get('time') and incident_date:
                unit_dispatch_time = self._parse_cad_time(
                    unit.get('time'), incident_date, dispatch_time_str
                )
            
            cad_units.append({
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
            })
        
        return cad_units
    
    def _determine_category(self, event_type: str, event_subtype: str = None) -> str:
        """Determine call category."""
        if self.dry_run:
            if (event_type or '').upper().startswith('MEDICAL'):
                return 'EMS'
            return 'FIRE'
        
        try:
            params = {'event_type': event_type}
            if event_subtype:
                params['event_subtype'] = event_subtype
            
            resp = requests.get(
                f"{self.api_url}/api/lookups/cad-type-mappings/lookup",
                params=params,
                headers=self.headers,
                timeout=5
            )
            
            if resp.status_code == 200:
                return resp.json().get('call_category', 'FIRE')
        except:
            pass
        
        if (event_type or '').upper().startswith('MEDICAL'):
            return 'EMS'
        return 'FIRE'
    
    def _parse_cad_datetime(self, dt_str: str) -> Optional[str]:
        """Parse CAD datetime to UTC ISO format. Handles both MM-DD-YY and DD-MM-YY formats."""
        if not dt_str:
            return None
        
        dt = self._parse_dispatch_datetime_str(dt_str)
        if not dt:
            logger.warning(f"Could not parse datetime {dt_str}")
            return None
        
        try:
            local_tz = ZoneInfo(self.timezone)
            local_dt = dt.replace(tzinfo=local_tz)
            utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
            return utc_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        except Exception as e:
            logger.warning(f"Could not convert datetime {dt_str}: {e}")
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
            
            local_tz = ZoneInfo(self.timezone)
            local_dt = dt.replace(tzinfo=local_tz)
            utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
            return utc_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        except Exception as e:
            logger.warning(f"Could not parse time {time_str}: {e}")
            return None


def main():
    parser = argparse.ArgumentParser(description='Import ADI log file into CADReport')
    parser.add_argument('logfile', help='Path to ADI .log file')
    parser.add_argument('--tenant', required=True, help='Tenant slug (e.g., gmfc2, glenmoorefc)')
    parser.add_argument('--api-url', default='http://127.0.0.1:8001', help='CADReport API URL')
    parser.add_argument('--timezone', default='America/New_York', help='Timezone for timestamps')
    parser.add_argument('--dry-run', action='store_true', help='Parse only, do not create incidents')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    args = parser.parse_args()
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    importer = ADILogImporter(
        api_url=args.api_url,
        tenant=args.tenant,
        timezone=args.timezone,
        dry_run=args.dry_run
    )
    
    importer.import_log_file(args.logfile)
    
    print(f"\n{'='*50}")
    print("Import Summary")
    print('='*50)
    for key, value in importer.stats.items():
        print(f"  {key}: {value}")


if __name__ == '__main__':
    main()
