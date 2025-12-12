"""
CAD Parser for Chester County Emergency Services HTML format

Handles two document types:
1. Dispatch Report - Initial alert and updates
2. Clear Report - Incident closes, contains unit times table
"""

import re
from datetime import datetime
from typing import Optional, Dict, List, Any
from bs4 import BeautifulSoup
from dataclasses import dataclass, field


@dataclass
class UnitTimes:
    """Times for a single unit from Clear Report"""
    unit_id: str
    time_dispatched: Optional[str] = None      # DP
    time_enroute: Optional[str] = None         # ER
    time_arrived: Optional[str] = None         # AR
    time_transport: Optional[str] = None       # TR
    time_transport_arrive: Optional[str] = None # TA
    time_available: Optional[str] = None       # AV
    time_at_quarters: Optional[str] = None     # AQ (cleared)


@dataclass
class ParsedCADReport:
    """Structured data extracted from CAD HTML"""
    report_type: str  # 'DISPATCH' or 'CLEAR'
    
    # Event info
    event_id: Optional[str] = None          # Internal ID (3972104)
    event_number: Optional[str] = None      # F25066673
    event_type: Optional[str] = None        # FIRE, ACCIDENT, etc
    event_subtype: Optional[str] = None     # GAS LEAK INSIDE, BLS, etc
    dispatch_group: Optional[str] = None    # 48FD
    agency: Optional[str] = None            # FIRE
    
    # Location
    address: Optional[str] = None
    location_info: Optional[str] = None
    cross_streets: Optional[str] = None
    municipality: Optional[str] = None       # WALLAC, WNANT
    esz: Optional[str] = None               # 4801, 4816
    development: Optional[str] = None
    beat: Optional[str] = None
    
    # Caller
    caller_name: Optional[str] = None
    caller_phone: Optional[str] = None
    caller_address: Optional[str] = None
    caller_source: Optional[str] = None     # ANI/ALI
    
    # Times (from Clear Report header)
    dispatch_time: Optional[str] = None     # From Dispatch Report unit line
    first_dispatch: Optional[str] = None    # Clear Report: First Disp
    first_enroute: Optional[str] = None     # Clear Report: First EnRt
    first_arrive: Optional[str] = None      # Clear Report: First Arrive
    last_available: Optional[str] = None    # Clear Report: Last Avail
    last_at_quarters: Optional[str] = None  # Clear Report: Last AQ
    report_time: Optional[str] = None       # Clear Report: Report Time
    
    # Units
    responding_units: List[Dict[str, str]] = field(default_factory=list)  # From Dispatch
    unit_times: List[UnitTimes] = field(default_factory=list)  # From Clear Report
    
    # Comments
    event_comments: List[Dict[str, str]] = field(default_factory=list)
    
    # Raw for debugging
    raw_html: Optional[str] = None


def clean_text(text: Optional[str]) -> Optional[str]:
    """Clean up extracted text"""
    if not text:
        return None
    # Remove extra whitespace, newlines, br tags
    text = re.sub(r'<br\s*/?>', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    return text if text else None


def parse_phone(text: Optional[str]) -> Optional[str]:
    """Extract phone number"""
    if not text:
        return None
    # Look for (xxx) xxx-xxxx pattern
    match = re.search(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text)
    return match.group(0) if match else clean_text(text)


def find_section_table(soup: BeautifulSoup, section_name: str) -> Optional[BeautifulSoup]:
    """
    Find the data table that follows a section header.
    
    The HTML structure is:
    <table><tr><td class="Header">Section Name</td></tr></table>
    <table class="EventInfo">...actual data...</table>
    
    This function finds the header, then returns the NEXT sibling table.
    """
    all_tables = soup.find_all('table')
    
    for i, table in enumerate(all_tables):
        header_td = table.find('td', class_='Header')
        if header_td and section_name in header_td.get_text():
            # Found the header, return the next table
            if i + 1 < len(all_tables):
                return all_tables[i + 1]
    return None


def parse_cad_html(html: str) -> ParsedCADReport:
    """
    Parse Chester County CAD HTML into structured data.
    """
    soup = BeautifulSoup(html, 'html.parser')
    
    # Determine report type from title
    title_td = soup.find('td', class_='Title')
    title_text = title_td.get_text() if title_td else ''
    
    if 'Clear Report' in title_text:
        report_type = 'CLEAR'
    else:
        report_type = 'DISPATCH'
    
    report = ParsedCADReport(report_type=report_type, raw_html=html)
    
    # Parse based on report type
    if report_type == 'CLEAR':
        _parse_clear_report(soup, report)
    else:
        _parse_dispatch_report(soup, report)
    
    # Parse sections by finding the right tables
    _parse_location_section(soup, report)
    _parse_caller_section(soup, report)
    _parse_comments(soup, report)
    
    return report


def _parse_dispatch_report(soup: BeautifulSoup, report: ParsedCADReport):
    """Parse Dispatch Report specific fields from the top EventInfo table"""
    
    # The first EventInfo table has event details
    first_event_info = soup.find('table', class_='EventInfo')
    if first_event_info:
        rows = first_event_info.find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            for i in range(0, len(cells) - 1, 2):
                label = clean_text(cells[i].get_text())
                value = clean_text(cells[i + 1].get_text()) if i + 1 < len(cells) else None
                
                if not label:
                    continue
                    
                if 'Event ID' in label:
                    report.event_id = value
                elif label == 'Event:':
                    report.event_number = value
                elif 'Dispatch Time' in label:
                    report.dispatch_time = value
                elif 'Event Type' in label and 'Sub' not in label:
                    report.event_type = value
                elif 'Sub-Type' in label or 'Sub Type' in label:
                    report.event_subtype = value
                elif label == 'Agency:':
                    report.agency = value
                elif 'Dispatch Group' in label:
                    report.dispatch_group = value
    
    # Parse responding units from EventUnits table
    units_table = soup.find('table', class_='EventUnits')
    if units_table:
        rows = units_table.find_all('tr')
        for row in rows[1:]:  # Skip header
            cells = row.find_all('td')
            if len(cells) >= 3:
                unit = {
                    'unit_id': clean_text(cells[0].get_text()),
                    'station': clean_text(cells[1].get_text()) if len(cells) > 1 else None,
                    'agency': clean_text(cells[2].get_text()) if len(cells) > 2 else None,
                    'status': clean_text(cells[3].get_text()) if len(cells) > 3 else None,
                    'time': clean_text(cells[4].get_text()) if len(cells) > 4 else None,
                }
                if unit['unit_id']:
                    report.responding_units.append(unit)


def _parse_clear_report(soup: BeautifulSoup, report: ParsedCADReport):
    """Parse Clear Report specific fields"""
    
    # Find the twoCol table with event summary
    twocol_table = soup.find('table', class_='twoCol')
    if twocol_table:
        rows = twocol_table.find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            for i in range(0, len(cells) - 1, 2):
                label = clean_text(cells[i].get_text())
                value = clean_text(cells[i + 1].get_text()) if i + 1 < len(cells) else None
                
                if not label:
                    continue
                
                if 'Event Number' in label:
                    report.event_number = value
                elif 'Event Type' in label and 'Sub' not in label:
                    report.event_type = value
                elif 'Sub-Type' in label or 'Sub Type' in label:
                    report.event_subtype = value
                elif 'Dispatch Group' in label:
                    report.dispatch_group = value
                elif 'First Disp' in label:
                    report.first_dispatch = value
                elif 'First EnRt' in label:
                    report.first_enroute = value
                elif 'First Arrive' in label:
                    report.first_arrive = value
                elif 'Last Avail' in label:
                    report.last_available = value
                elif 'Last AQ' in label:
                    report.last_at_quarters = value
                elif 'Report Time' in label:
                    report.report_time = value
    
    # Parse unit times from UnitTimes table
    times_table = soup.find('table', class_='UnitTimes')
    if times_table:
        rows = times_table.find_all('tr', class_='datarow')
        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 8:
                unit_times = UnitTimes(
                    unit_id=clean_text(cells[0].get_text()),
                    time_dispatched=clean_text(cells[1].get_text()) or None,
                    time_enroute=clean_text(cells[2].get_text()) or None,
                    time_arrived=clean_text(cells[3].get_text()) or None,
                    time_transport=clean_text(cells[4].get_text()) or None,
                    time_transport_arrive=clean_text(cells[5].get_text()) or None,
                    time_available=clean_text(cells[6].get_text()) or None,
                    time_at_quarters=clean_text(cells[7].get_text()) or None,
                )
                if unit_times.unit_id:
                    report.unit_times.append(unit_times)


def _parse_location_section(soup: BeautifulSoup, report: ParsedCADReport):
    """Parse the Location section - finds header then parses next table"""
    
    location_table = find_section_table(soup, 'Location')
    if not location_table:
        return
    
    rows = location_table.find_all('tr')
    for row in rows:
        cells = row.find_all('td')
        if len(cells) < 2:
            continue
        
        label = clean_text(cells[0].get_text())
        if not label:
            continue
        
        # Get value - might span multiple columns
        value = clean_text(cells[1].get_text())
        
        if label == 'Address:':
            report.address = value
        elif 'Location Info' in label:
            report.location_info = value
        elif 'Cross Street' in label:
            report.cross_streets = value
        elif label == 'Municipality:':
            report.municipality = value
            # ESZ is in same row, different cells
            for i, cell in enumerate(cells):
                cell_text = cell.get_text()
                if 'ESZ' in cell_text:
                    if i + 1 < len(cells):
                        report.esz = clean_text(cells[i + 1].get_text())
        elif 'Development' in label:
            report.development = value
            # Beat is in same row
            for i, cell in enumerate(cells):
                cell_text = cell.get_text()
                if 'Beat' in cell_text:
                    if i + 1 < len(cells):
                        report.beat = clean_text(cells[i + 1].get_text())


def _parse_caller_section(soup: BeautifulSoup, report: ParsedCADReport):
    """Parse the Caller Information section"""
    
    caller_table = find_section_table(soup, 'Caller')
    if not caller_table:
        return
    
    rows = caller_table.find_all('tr')
    for row in rows:
        cells = row.find_all('td')
        if len(cells) < 2:
            continue
        
        # Process cells in pairs (label, value)
        for i in range(0, len(cells) - 1, 2):
            label = clean_text(cells[i].get_text())
            value = clean_text(cells[i + 1].get_text()) if i + 1 < len(cells) else None
            
            if not label:
                continue
            
            if 'Caller Name' in label:
                report.caller_name = value
            elif 'Caller Phone' in label:
                report.caller_phone = parse_phone(value)
            elif 'Caller Address' in label:
                report.caller_address = value
            elif 'Caller Source' in label:
                report.caller_source = value


def _parse_comments(soup: BeautifulSoup, report: ParsedCADReport):
    """Parse event comments"""
    
    for table in soup.find_all('table'):
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all('td', class_='EventComment')
            if len(cells) >= 3:
                comment = {
                    'time': clean_text(cells[0].get_text()),
                    'operator': clean_text(cells[1].get_text()),
                    'text': clean_text(cells[2].get_text()),
                }
                if comment['text']:
                    report.event_comments.append(comment)


def report_to_dict(report: ParsedCADReport) -> Dict[str, Any]:
    """Convert ParsedCADReport to dictionary for JSON/API use"""
    return {
        'report_type': report.report_type,
        'event_id': report.event_id,
        'event_number': report.event_number,
        'event_type': report.event_type,
        'event_subtype': report.event_subtype,
        'dispatch_group': report.dispatch_group,
        'agency': report.agency,
        'address': report.address,
        'location_info': report.location_info,
        'cross_streets': report.cross_streets,
        'municipality': report.municipality,
        'esz': report.esz,
        'development': report.development,
        'beat': report.beat,
        'caller_name': report.caller_name,
        'caller_phone': report.caller_phone,
        'caller_address': report.caller_address,
        'caller_source': report.caller_source,
        'dispatch_time': report.dispatch_time,
        'first_dispatch': report.first_dispatch,
        'first_enroute': report.first_enroute,
        'first_arrive': report.first_arrive,
        'last_available': report.last_available,
        'last_at_quarters': report.last_at_quarters,
        'report_time': report.report_time,
        'responding_units': report.responding_units,
        'unit_times': [
            {
                'unit_id': ut.unit_id,
                'time_dispatched': ut.time_dispatched,
                'time_enroute': ut.time_enroute,
                'time_arrived': ut.time_arrived,
                'time_transport': ut.time_transport,
                'time_transport_arrive': ut.time_transport_arrive,
                'time_available': ut.time_available,
                'time_at_quarters': ut.time_at_quarters,
            }
            for ut in report.unit_times
        ],
        'event_comments': report.event_comments,
    }


# For testing
if __name__ == '__main__':
    import sys
    import json
    
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            content = f.read()
        
        # Split by ADI log lines to get individual reports
        reports = re.split(r'>>>[^\n]+\n', content)
        
        for i, html in enumerate(reports):
            html = html.strip()
            if not html or '<' not in html:
                continue
            
            print(f"\n{'='*60}")
            print(f"Report {i + 1}")
            print('='*60)
            
            report = parse_cad_html(html)
            d = report_to_dict(report)
            
            # Print key fields only for quick review
            print(f"Type: {d['report_type']}")
            print(f"Event: {d['event_number']}")
            print(f"CAD Type: {d['event_type']} / {d['event_subtype']}")
            print(f"Address: {d['address']}")
            print(f"Municipality: {d['municipality']}")
            print(f"Caller Address: {d['caller_address']}")
            print(f"Units: {[u['unit_id'] for u in d['responding_units']]}")
            if d['unit_times']:
                print(f"Unit Times: {[(u['unit_id'], u['time_dispatched'], u['time_arrived']) for u in d['unit_times']]}")
