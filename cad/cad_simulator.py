"""
CAD Simulator - Send test data to CAD Listener

Reads the raw ADI log file and sends each HTML report as a separate
TCP connection, simulating how the real FDCMS ADI works.

Usage:
    python cad_simulator.py --file raw_adi_log_samples.txt --host localhost --port 19118
    python cad_simulator.py --file raw_adi_log_samples.txt --host localhost --port 19118 --delay 2
    python cad_simulator.py --file raw_adi_log_samples.txt --host localhost --port 19118 --interactive
"""

import socket
import argparse
import re
import time
import sys


def extract_html_reports(file_path: str) -> list:
    """
    Extract individual HTML reports from ADI log file.
    
    The log file has format:
    >>> 12/05/25  17:53:31  ADI: Accepted Connection...
    <style>...</style>
    <table>...</table>
    >>> 12/05/25  17:53:31  ADI: TCP Connection Terminated...
    
    We want just the HTML parts.
    """
    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    
    # Split by ADI log lines
    parts = re.split(r'>>>[^\n]+\n', content)
    
    reports = []
    for part in parts:
        part = part.strip()
        # Check if it looks like HTML (starts with < or has <style> or <table>)
        if part and ('<style>' in part or '<table' in part):
            reports.append(part)
    
    return reports


def get_report_info(html: str) -> str:
    """Extract brief info about a report for display"""
    
    # Report type
    if 'Clear Report' in html:
        report_type = 'CLEAR'
    else:
        report_type = 'DISPATCH'
    
    # Event number
    event_match = re.search(r'>([A-Z]\d{8})<', html)
    event_num = event_match.group(1) if event_match else 'Unknown'
    
    # Event type
    type_match = re.search(r'Event Type:[^<]*</td>\s*<td>([^<]+)', html)
    event_type = type_match.group(1).strip() if type_match else ''
    
    # Address
    addr_match = re.search(r'Address:[^<]*</td>\s*<td[^>]*>([^<]+)', html)
    address = addr_match.group(1).strip() if addr_match else ''
    
    # Municipality
    muni_match = re.search(r'Municipality:[^<]*</td>\s*<td>([^<]+)', html)
    municipality = muni_match.group(1).strip() if muni_match else ''
    
    return f"{report_type} | {event_num} | {event_type} | {address} | {municipality}"


def send_report(html: str, host: str, port: int) -> bool:
    """Send a single HTML report over TCP"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect((host, port))
        sock.sendall(html.encode('utf-8'))
        sock.close()
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='CAD Simulator - Send test data to CAD Listener')
    parser.add_argument('--file', '-f', required=True, help='Path to ADI log file')
    parser.add_argument('--host', '-H', default='localhost', help='CAD Listener host')
    parser.add_argument('--port', '-p', type=int, default=19118, help='CAD Listener port')
    parser.add_argument('--delay', '-d', type=float, default=1.0, help='Delay between reports (seconds)')
    parser.add_argument('--interactive', '-i', action='store_true', help='Wait for keypress between reports')
    parser.add_argument('--start', '-s', type=int, default=0, help='Start at report number (0-indexed)')
    parser.add_argument('--count', '-c', type=int, default=0, help='Number of reports to send (0=all)')
    parser.add_argument('--list', '-l', action='store_true', help='Just list reports, don\'t send')
    args = parser.parse_args()
    
    # Extract reports from file
    print(f"Reading {args.file}...")
    reports = extract_html_reports(args.file)
    print(f"Found {len(reports)} HTML reports\n")
    
    if not reports:
        print("No reports found!")
        return
    
    # List mode - just show what's in the file
    if args.list:
        print("Reports in file:")
        print("-" * 80)
        for i, html in enumerate(reports):
            info = get_report_info(html)
            print(f"[{i:3d}] {info}")
        return
    
    # Determine which reports to send
    start = args.start
    end = len(reports) if args.count == 0 else min(start + args.count, len(reports))
    
    print(f"Target: {args.host}:{args.port}")
    print(f"Sending reports {start} to {end - 1}")
    if args.interactive:
        print("Interactive mode: Press ENTER to send each report, 'q' to quit\n")
    else:
        print(f"Delay: {args.delay}s between reports\n")
    
    sent = 0
    failed = 0
    
    for i in range(start, end):
        html = reports[i]
        info = get_report_info(html)
        
        print(f"[{i:3d}] {info}")
        
        if args.interactive:
            user_input = input("      Press ENTER to send (q to quit): ")
            if user_input.lower() == 'q':
                break
        
        print(f"      Sending {len(html)} bytes... ", end='', flush=True)
        
        if send_report(html, args.host, args.port):
            print("OK")
            sent += 1
        else:
            failed += 1
        
        # Delay between reports (not in interactive mode)
        if not args.interactive and i < end - 1:
            time.sleep(args.delay)
    
    print(f"\nDone! Sent: {sent}, Failed: {failed}")


if __name__ == '__main__':
    main()
