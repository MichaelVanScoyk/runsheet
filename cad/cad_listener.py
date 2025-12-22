"""
CAD TCP Listener for Chester County Emergency Services

Listens for incoming TCP connections from FDCMS ADI (or simulator).
Each connection sends one HTML report, then disconnects.

Usage:
    python cad_listener.py --port 19118
    python cad_listener.py --port 19118 --api-url http://localhost:8001
"""

import socket
import threading
import argparse
import logging
import json
import requests
from datetime import datetime, timedelta
from typing import Optional

from cad_parser import parse_cad_html, report_to_dict

# Import settings from database
import sys
sys.path.insert(0, '/opt/runsheet/backend')
from settings_helper import is_station_unit, get_api_url, get_cad_port

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


class CADListener:
    def __init__(self, port: int = None, api_url: str = None):
        self.port = port or get_cad_port(test=True)  # Default to test port
        self.api_url = api_url or get_api_url()
        self.running = False
        self.server_socket = None
        self.stats = {
            'connections': 0,
            'dispatch_reports': 0,
            'clear_reports': 0,
            'errors': 0,
            'incidents_created': 0,
            'incidents_updated': 0,
            'incidents_closed': 0,
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
    
    def _handle_connection(self, client_socket: socket.socket, address: tuple):
        """Handle a single connection - receive HTML, parse, process"""
        try:
            # Receive all data (CAD sends then disconnects)
            data = b''
            while True:
                chunk = client_socket.recv(4096)
                if not chunk:
                    break
                data += chunk
            
            if not data:
                logger.warning("Empty connection received")
                return
            
            # Decode HTML
            try:
                html = data.decode('utf-8')
            except UnicodeDecodeError:
                html = data.decode('latin-1')
            
            # Parse HTML
            report = parse_cad_html(html)
            
            if not report:
                logger.warning("Could not parse report from HTML")
                return
            
            # Convert to dict
            report_dict = report_to_dict(report)
            
            # Log what we received
            report_type = report_dict.get('report_type', 'UNKNOWN')
            event_number = report_dict.get('event_number', 'N/A')
            
            if report_type == 'DISPATCH':
                self.stats['dispatch_reports'] += 1
                logger.info(f"Received DISPATCH for {event_number}")
            elif report_type == 'CLEAR':
                self.stats['clear_reports'] += 1
                logger.info(f"Received CLEAR for {event_number}")
            else:
                logger.warning(f"Unknown report type: {report_type}")
            
            # Process the report (include raw HTML for storage)
            self._process_report(report_dict, html)
            
        except Exception as e:
            logger.error(f"Error handling connection: {e}", exc_info=True)
            self.stats['errors'] += 1
        finally:
            client_socket.close()
    
    def _process_report(self, report: dict, raw_html: str = None):
        """Process parsed report - create/update/close incident via API"""
        
        event_number = report.get('event_number')
        if not event_number:
            logger.warning("No event number in report, skipping")
            return
        
        report_type = report.get('report_type')
        
        try:
            if report_type == 'DISPATCH':
                self._handle_dispatch(report, raw_html)
            elif report_type == 'CLEAR':
                self._handle_clear(report, raw_html)
        except Exception as e:
            logger.error(f"Error processing report: {e}", exc_info=True)
            self.stats['errors'] += 1
    
    def _handle_dispatch(self, report: dict, raw_html: str = None):
        """Handle Dispatch Report - create or update incident"""
        
        event_number = report['event_number']
        
        # Check if incident exists
        try:
            resp = requests.get(f"{self.api_url}/api/incidents/by-cad/{event_number}")
            exists = resp.status_code == 200
            existing_incident = resp.json() if exists else None
        except:
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
                    params={'code': municipality_code}
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
        
        for unit in report.get('responding_units', []):
            unit_id = unit.get('unit_id')
            if not unit_id:
                continue
            
            # Check if this is our unit or mutual aid
            is_ours = is_station_unit(unit_id)
            
            # Merge with existing data
            if unit_id in existing_units:
                unit_data = existing_units[unit_id]
            else:
                unit_data = {
                    'unit_id': unit_id,
                    'station': unit.get('station'),
                    'agency': unit.get('agency'),
                    'is_mutual_aid': not is_ours,
                    'time_dispatched': unit.get('time'),
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
            
            if report.get('dispatch_time'):
                update_data['time_dispatched'] = self._parse_cad_datetime(report['dispatch_time'])
            
            resp = requests.put(
                f"{self.api_url}/api/incidents/{existing_incident['id']}",
                json=update_data
            )
            
            if resp.status_code == 200:
                logger.info(f"Updated incident {event_number} - {len(cad_units)} units")
                self.stats['incidents_updated'] += 1
            else:
                logger.error(f"Failed to update incident: {resp.text}")
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
                json=create_data
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
                    json=update_data
                )
            else:
                logger.error(f"Failed to create incident: {resp.text}")
    
    def _handle_clear(self, report: dict, raw_html: str = None):
        """Handle Clear Report - update all fields, times, merge unit times, and close incident"""
        
        event_number = report['event_number']
        
        # Get incident
        try:
            resp = requests.get(f"{self.api_url}/api/incidents/by-cad/{event_number}")
            if resp.status_code != 200:
                logger.warning(f"Incident {event_number} not found for Clear Report")
                return
            incident = resp.json()
            incident_id = incident['id']
        except Exception as e:
            logger.error(f"Could not fetch incident: {e}")
            return
        
        # Get the incident_date for proper time parsing
        # Clear reports only have times (HH:MM:SS), not dates
        # We need to use the incident's actual date, not today's date
        incident_date = incident.get('incident_date')  # Format: YYYY-MM-DD
        
        # Also get the dispatch time to detect midnight crossover
        dispatch_time_str = None
        if incident.get('time_dispatched'):
            # Extract just the time portion from ISO format
            try:
                dispatch_time_str = incident['time_dispatched'].split('T')[1][:8]  # HH:MM:SS
            except:
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
                    params={'code': report['municipality']}
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
        if report.get('first_enroute'):
            update_data['time_first_enroute'] = self._parse_cad_time(
                report['first_enroute'], incident_date, dispatch_time_str
            )
        if report.get('first_arrive'):
            update_data['time_first_on_scene'] = self._parse_cad_time(
                report['first_arrive'], incident_date, dispatch_time_str
            )
        if report.get('last_at_quarters'):
            parsed_time = self._parse_cad_time(
                report['last_at_quarters'], incident_date, dispatch_time_str
            )
            update_data['time_last_cleared'] = parsed_time
            update_data['time_in_service'] = parsed_time
        
        # Merge unit times from Clear Report into cad_units
        existing_units = {}
        if incident.get('cad_units'):
            for u in incident['cad_units']:
                existing_units[u['unit_id']] = u
        
        for ut in report.get('unit_times', []):
            unit_id = ut.get('unit_id')
            if not unit_id:
                continue
            
            # Check if this is our unit or mutual aid
            is_ours = is_station_unit(unit_id)
            
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
            
            if unit_id in existing_units:
                # Update existing unit with times
                existing_units[unit_id]['time_dispatched'] = time_dispatched
                existing_units[unit_id]['time_enroute'] = time_enroute
                existing_units[unit_id]['time_arrived'] = time_arrived
                existing_units[unit_id]['time_available'] = time_available
                existing_units[unit_id]['time_cleared'] = time_cleared
            else:
                # New unit from clear report (maybe wasn't in dispatch)
                existing_units[unit_id] = {
                    'unit_id': unit_id,
                    'station': None,
                    'agency': None,
                    'is_mutual_aid': not is_ours,
                    'time_dispatched': time_dispatched,
                    'time_enroute': time_enroute,
                    'time_arrived': time_arrived,
                    'time_available': time_available,
                    'time_cleared': time_cleared,
                }
        
        cad_units = list(existing_units.values())
        if cad_units:
            update_data['cad_units'] = cad_units
        
        # Update incident
        if update_data:
            resp = requests.put(
                f"{self.api_url}/api/incidents/{incident_id}",
                json=update_data
            )
            if resp.status_code == 200:
                logger.info(f"Updated incident {event_number} with clear times - {len(cad_units)} units")
        
        # Close the incident
        resp = requests.post(f"{self.api_url}/api/incidents/{incident_id}/close")
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
                params=params
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
    
    def _parse_cad_datetime(self, dt_str: str) -> Optional[str]:
        """Parse CAD datetime format: 12-07-25 14:09:18 (24-hour clock)"""
        if not dt_str:
            return None
        try:
            # Try MM-DD-YY HH:MM:SS format (24-hour)
            dt = datetime.strptime(dt_str, '%m-%d-%y %H:%M:%S')
            return dt.isoformat()
        except ValueError:
            try:
                # Try just time HH:MM:SS (use today's date as fallback)
                return self._parse_cad_time(dt_str, None, None)
            except:
                logger.warning(f"Could not parse datetime: {dt_str}")
                return None
    
    def _parse_cad_time(self, time_str: str, incident_date: str = None, dispatch_time_str: str = None) -> Optional[str]:
        """
        Parse CAD time format: 14:09:18 (24-hour clock)
        
        Args:
            time_str: Time string in HH:MM:SS format
            incident_date: The incident's date in YYYY-MM-DD format
            dispatch_time_str: The dispatch time in HH:MM:SS format (for midnight detection)
        
        Returns:
            ISO format datetime string, or None if parsing fails
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
            
            # Combine date and time
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
            
            return dt.isoformat()
        except ValueError:
            logger.warning(f"Could not parse time: {time_str}")
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
    parser.add_argument('--production', action='store_true', help='Use production port from settings')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    args = parser.parse_args()
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Use production port if flag set
    port = get_cad_port(test=False) if args.production else args.port
    
    listener = CADListener(port=port, api_url=args.api_url)
    
    try:
        listener.start()
    except KeyboardInterrupt:
        print("\nShutting down...")
        listener.stop()
        print(f"\nStats: {listener.get_stats()}")


if __name__ == '__main__':
    main()