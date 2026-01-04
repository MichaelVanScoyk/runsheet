#!/usr/bin/env python3
"""
Plain Text CAD Parser for pre-2018 ADI log files.

Handles the plain text format used in 2017 and earlier (before HTML format).
"""

import re
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime


@dataclass
class PlainTextCADReport:
    """Parsed plain text CAD report."""
    report_type: str  # 'DISPATCH' or 'CLEAR'
    event_number: str = ''
    call_time: str = ''  # Raw string like "01-01-17 02:16:12"
    event_type: str = ''
    event_subtype: str = ''
    esz: str = ''
    beat: str = ''
    address: str = ''
    cross_streets: str = ''
    location_info: str = ''
    development: str = ''
    municipality: str = ''
    caller_name: str = ''
    caller_phone: str = ''
    caller_address: str = ''
    caller_source: str = ''
    responding_units: List[Dict[str, Any]] = field(default_factory=list)
    unit_times: List[Dict[str, Any]] = field(default_factory=list)
    comments: List[str] = field(default_factory=list)
    raw_text: str = ''


def parse_plaintext_cad(text: str) -> Optional[PlainTextCADReport]:
    """
    Parse a plain text CAD report (Dispatch or Clear).
    
    Args:
        text: Raw text of a single CAD report
        
    Returns:
        PlainTextCADReport object or None if parsing fails
    """
    text = text.strip()
    if not text:
        return None
    
    # Determine report type
    if 'Dispatch Report' in text:
        report_type = 'DISPATCH'
    elif 'Clear Report' in text:
        report_type = 'CLEAR'
    else:
        return None
    
    report = PlainTextCADReport(report_type=report_type, raw_text=text)
    
    lines = text.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    
    # Parse key-value pairs
    address_lines = []
    in_address = False
    in_units = False
    in_comments = False
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Section headers
        if stripped == 'Address:':
            in_address = True
            in_units = False
            in_comments = False
            i += 1
            continue
        elif stripped == 'Caller Information:':
            # End address section, save what we have
            if address_lines:
                report.address = ' '.join(address_lines).strip()
                report.address = re.sub(r'\s+', ' ', report.address)
                address_lines = []
            in_address = False
            in_units = False
            in_comments = False
            i += 1
            continue
        elif stripped == 'Units:':
            in_address = False
            in_units = True
            in_comments = False
            i += 1
            continue
        elif stripped == 'Event Comments:':
            in_address = False
            in_units = False
            in_comments = True
            i += 1
            continue
        
        # Parse based on current context
        if in_address:
            # Address section - collect lines until we hit a known field
            if stripped.startswith('Cross Street:'):
                report.cross_streets = stripped.replace('Cross Street:', '').strip()
            elif stripped.startswith('Location Information:'):
                report.location_info = stripped.replace('Location Information:', '').strip()
            elif stripped.startswith('Development:'):
                report.development = stripped.replace('Development:', '').strip()
            elif stripped.startswith('Municipality:'):
                report.municipality = stripped.replace('Municipality:', '').strip()
            elif stripped and not stripped.endswith(':'):
                # This is an address line
                address_lines.append(stripped)
            i += 1
            continue
        
        if in_units:
            # Parse unit lines - they contain tabs
            if '\t' in line or (stripped and not stripped.endswith(':')):
                parts = line.split('\t')
                unit_id = parts[0].strip() if parts else ''
                
                if unit_id and not unit_id.endswith(':') and unit_id != '':
                    if report_type == 'DISPATCH':
                        # Dispatch just has unit IDs
                        report.responding_units.append({
                            'unit_id': unit_id,
                            'station': None,
                            'agency': None,
                            'time': None,
                        })
                    else:
                        # Clear has status codes and times
                        # Format: UNIT\tSTATUS\tTIME\t?\tLOCATION
                        status = parts[1].strip() if len(parts) > 1 else ''
                        time_str = parts[2].strip() if len(parts) > 2 else ''
                        
                        # Find or create unit entry
                        unit_entry = None
                        for u in report.unit_times:
                            if u['unit_id'] == unit_id:
                                unit_entry = u
                                break
                        
                        if not unit_entry:
                            unit_entry = {
                                'unit_id': unit_id,
                                'time_dispatched': None,
                                'time_enroute': None,
                                'time_arrived': None,
                                'time_available': None,
                                'time_at_quarters': None,
                            }
                            report.unit_times.append(unit_entry)
                        
                        # Map status codes to time fields
                        if status == 'DP':
                            unit_entry['time_dispatched'] = time_str if time_str else None
                        elif status == 'ER':
                            unit_entry['time_enroute'] = time_str if time_str else None
                        elif status in ('OS', 'AR'):  # AR sometimes used for arrived
                            unit_entry['time_arrived'] = time_str if time_str else None
                        elif status == 'AK':
                            unit_entry['time_available'] = time_str if time_str else None
                        elif status == 'AQ':
                            unit_entry['time_at_quarters'] = time_str if time_str else None
            i += 1
            continue
        
        if in_comments:
            if stripped and not stripped.startswith('\f'):
                report.comments.append(stripped)
            i += 1
            continue
        
        # Key-value parsing (not in any special section)
        if stripped.startswith('Call Time:'):
            report.call_time = stripped.replace('Call Time:', '').strip()
        elif stripped.startswith('Event:'):
            report.event_number = stripped.replace('Event:', '').strip()
        elif stripped.startswith('Event Type Code:'):
            report.event_type = stripped.replace('Event Type Code:', '').strip()
        elif stripped.startswith('Event Subtype Code:'):
            report.event_subtype = stripped.replace('Event Subtype Code:', '').strip()
        elif stripped.startswith('ESZ:'):
            report.esz = stripped.replace('ESZ:', '').strip()
        elif stripped.startswith('Beat:'):
            report.beat = stripped.replace('Beat:', '').strip()
        elif stripped.startswith('Caller Name:'):
            report.caller_name = stripped.replace('Caller Name:', '').strip()
        elif stripped.startswith('Caller Phone Number:'):
            # Format: (610) 500-0690 x Type: CELL
            phone_part = stripped.replace('Caller Phone Number:', '').strip()
            if ' x Type:' in phone_part:
                report.caller_phone = phone_part.split(' x Type:')[0].strip()
            else:
                report.caller_phone = phone_part
        elif stripped.startswith('Caller Address:'):
            report.caller_address = stripped.replace('Caller Address:', '').strip()
        elif stripped.startswith('Caller Source:'):
            report.caller_source = stripped.replace('Caller Source:', '').strip()
        
        i += 1
    
    # Finalize address if we ended while still in address section
    if address_lines:
        report.address = ' '.join(address_lines).strip()
        report.address = re.sub(r'\s+', ' ', report.address)
    
    return report


def plaintext_report_to_dict(report: PlainTextCADReport) -> Dict[str, Any]:
    """Convert PlainTextCADReport to dictionary matching HTML parser output format."""
    
    # Get first dispatch time from unit_times for Clear reports
    first_dispatch = None
    if report.report_type == 'CLEAR' and report.unit_times:
        dispatch_times = [u['time_dispatched'] for u in report.unit_times if u.get('time_dispatched')]
        if dispatch_times:
            first_dispatch = min(dispatch_times)
    
    return {
        'report_type': report.report_type,
        'event_number': report.event_number,
        'dispatch_time': report.call_time,  # Call Time is effectively dispatch time
        'report_time': report.call_time,
        'event_type': report.event_type,
        'event_subtype': report.event_subtype,
        'esz': report.esz,
        'address': report.address,
        'cross_streets': report.cross_streets,
        'location_info': report.location_info,
        'municipality': report.municipality,
        'caller_name': report.caller_name,
        'caller_phone': report.caller_phone,
        'responding_units': report.responding_units,
        'unit_times': report.unit_times,
        'first_dispatch': first_dispatch,
        'comments': report.comments,
    }


def is_plaintext_format(text: str) -> bool:
    """Check if text is plain text format (vs HTML)."""
    # Plain text has "Call Time:" but no HTML tags
    has_call_time = 'Call Time:' in text
    has_html = '<table' in text.lower() or '<style' in text.lower()
    return has_call_time and not has_html


if __name__ == '__main__':
    # Test with sample data
    import sys
    
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        
        # Split by ADI markers
        segments = re.split(r'>>>[^\n]+\n', content)
        
        count = 0
        for segment in segments:
            segment = segment.strip()
            if not segment:
                continue
            
            if is_plaintext_format(segment):
                report = parse_plaintext_cad(segment)
                if report:
                    count += 1
                    print(f"\n{'='*60}")
                    print(f"Report #{count}: {report.report_type}")
                    print(f"Event: {report.event_number}")
                    print(f"Call Time: {report.call_time}")
                    print(f"Type: {report.event_type} / {report.event_subtype}")
                    print(f"Address: {report.address}")
                    print(f"Municipality: {report.municipality}")
                    if report.responding_units:
                        print(f"Responding Units: {[u['unit_id'] for u in report.responding_units]}")
                    if report.unit_times:
                        print(f"Unit Times: {len(report.unit_times)} units")
                        for ut in report.unit_times[:3]:
                            print(f"  {ut['unit_id']}: DP={ut.get('time_dispatched')} ER={ut.get('time_enroute')} OS={ut.get('time_arrived')}")
                    
                    if count >= 5:
                        print(f"\n... (showing first 5 of many)")
                        break
        
        print(f"\nTotal parsed: {count} reports")
