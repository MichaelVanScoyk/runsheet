#!/usr/bin/env python3
"""
WebSocket End-to-End Test Script

TRUE END-TO-END: Sends actual TCP packets to the CAD listener port,
just like Chester County's CAD system would.

Flow tested:
  TCP packet → CAD Listener (port 19117) → HTTP API → Backend → WebSocket → Browser

Usage:
    python test_websocket.py --port 19117

What to observe in browser:
1. When DISPATCH packet sent → incident appears immediately, modal auto-pops
2. When CLEAR packet sent → incident updates with times, status changes to CLOSED
3. All updates should appear in <1 second (not 5 second polling delay)
4. "Live" indicator should be green in the header
"""

import argparse
import socket
import time
import sys
from datetime import datetime

# Sample DISPATCH report HTML (mimics Chester County FDCMS ADI format)
DISPATCH_TEMPLATE = """
<html>
<head><title>Dispatch Report</title></head>
<body>
<table><tr><td class="Title">Dispatch Report</td></tr></table>

<table><tr><td class="Header">Event Information</td></tr></table>
<table class="EventInfo">
<tr><td class="Label">Event #</td><td>{event_number}</td></tr>
<tr><td class="Label">Event Type</td><td>TEST / WEBSOCKET</td></tr>
<tr><td class="Label">Dispatch Group</td><td>48FD</td></tr>
<tr><td class="Label">Agency</td><td>FIRE</td></tr>
</table>

<table><tr><td class="Header">Location</td></tr></table>
<table class="EventInfo">
<tr><td class="Label">Address</td><td>123 WEBSOCKET TEST LN</td></tr>
<tr><td class="Label">Municipality</td><td>WMOOR</td></tr>
<tr><td class="Label">ESZ</td><td>4801</td></tr>
<tr><td class="Label">Cross Streets</td><td>MAIN ST / OAK AVE</td></tr>
</table>

<table><tr><td class="Header">Caller</td></tr></table>
<table class="EventInfo">
<tr><td class="Label">Name</td><td>WEBSOCKET TEST</td></tr>
<tr><td class="Label">Phone</td><td>(610) 555-0123</td></tr>
</table>

<table><tr><td class="Header">Units Assigned</td></tr></table>
<table class="EventInfo">
<tr><td>ENG481</td><td>DP: {dispatch_time}</td></tr>
<tr><td>RES48</td><td>DP: {dispatch_time}</td></tr>
</table>

<table><tr><td class="Header">Event Comments</td></tr></table>
<table class="EventInfo">
<tr><td>{comment_time}</td><td>WEBSOCKET TEST - DISPATCH RECEIVED</td></tr>
</table>

</body>
</html>
"""

# Sample CLEAR report HTML
CLEAR_TEMPLATE = """
<html>
<head><title>Clear Report</title></head>
<body>
<table><tr><td class="Title">Clear Report</td></tr></table>

<table><tr><td class="Header">Event Information</td></tr></table>
<table class="EventInfo">
<tr><td class="Label">Event #</td><td>{event_number}</td></tr>
<tr><td class="Label">Event Type</td><td>TEST / WEBSOCKET</td></tr>
<tr><td class="Label">Dispatch Group</td><td>48FD</td></tr>
<tr><td class="Label">Agency</td><td>FIRE</td></tr>
</table>

<table><tr><td class="Header">Location</td></tr></table>
<table class="EventInfo">
<tr><td class="Label">Address</td><td>123 WEBSOCKET TEST LN</td></tr>
<tr><td class="Label">Municipality</td><td>WMOOR</td></tr>
<tr><td class="Label">ESZ</td><td>4801</td></tr>
</table>

<table><tr><td class="Header">Incident Times</td></tr></table>
<table class="EventInfo">
<tr><td class="Label">First Disp</td><td>{dispatch_time}</td></tr>
<tr><td class="Label">First EnRt</td><td>{enroute_time}</td></tr>
<tr><td class="Label">First Arrive</td><td>{arrive_time}</td></tr>
<tr><td class="Label">Last Avail</td><td>{clear_time}</td></tr>
</table>

<table><tr><td class="Header">Unit Times</td></tr></table>
<table class="UnitTimes">
<tr><th>Unit</th><th>DP</th><th>ER</th><th>AR</th><th>AV</th></tr>
<tr><td>ENG481</td><td>{dispatch_time}</td><td>{enroute_time}</td><td>{arrive_time}</td><td>{clear_time}</td></tr>
<tr><td>RES48</td><td>{dispatch_time}</td><td>{enroute_time}</td><td>{arrive_time}</td><td>{clear_time}</td></tr>
</table>

<table><tr><td class="Header">Event Comments</td></tr></table>
<table class="EventInfo">
<tr><td>{comment_time}</td><td>WEBSOCKET TEST - DISPATCH RECEIVED</td></tr>
<tr><td>{clear_comment_time}</td><td>WEBSOCKET TEST - CLEAR RECEIVED</td></tr>
</table>

</body>
</html>
"""


def send_tcp_packet(host: str, port: int, data: str) -> bool:
    """Send data to TCP port, just like Chester County CAD does"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect((host, port))
        sock.sendall(data.encode('utf-8'))
        sock.close()
        return True
    except Exception as e:
        print(f"      ERROR: TCP send failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Test WebSocket with real CAD packets')
    parser.add_argument('--host', default='127.0.0.1', help='CAD listener host')
    parser.add_argument('--port', type=int, default=19117, help='CAD listener port')
    args = parser.parse_args()
    
    # Generate unique test event number
    now = datetime.now()
    event_number = f"FTEST{now.strftime('%H%M%S')}"
    
    # Generate times
    dispatch_time = now.strftime('%H:%M:%S')
    enroute_time = (now.replace(second=(now.second + 30) % 60)).strftime('%H:%M:%S')
    arrive_time = (now.replace(minute=(now.minute + 2) % 60)).strftime('%H:%M:%S')
    clear_time = (now.replace(minute=(now.minute + 15) % 60)).strftime('%H:%M:%S')
    comment_time = now.strftime('%H:%M:%S')
    clear_comment_time = (now.replace(minute=(now.minute + 15) % 60)).strftime('%H:%M:%S')
    
    print(f"\n{'='*70}")
    print("WebSocket End-to-End Test - TRUE TCP PACKETS")
    print(f"{'='*70}")
    print(f"Target: {args.host}:{args.port}")
    print(f"Test Event #: {event_number}")
    print(f"{'='*70}\n")
    
    print("This test sends REAL TCP packets to the CAD listener,")
    print("exactly like Chester County's CAD system does.\n")
    print("Flow: TCP packet → CAD Listener → HTTP API → Backend → WebSocket → Browser\n")
    
    # Step 1: Send DISPATCH
    print("[1/2] Sending DISPATCH packet via TCP...")
    print("      >>> WATCH BROWSER NOW - incident should appear in <1 second <<<")
    print("      >>> Modal should auto-popup <<<\n")
    
    dispatch_html = DISPATCH_TEMPLATE.format(
        event_number=event_number,
        dispatch_time=dispatch_time,
        comment_time=comment_time,
    )
    
    if not send_tcp_packet(args.host, args.port, dispatch_html):
        print("\nFailed to send DISPATCH packet. Is CAD listener running?")
        print(f"Check: ss -tlnp | grep {args.port}")
        sys.exit(1)
    
    print(f"      ✓ DISPATCH sent for {event_number}")
    print(f"      Address: 123 WEBSOCKET TEST LN")
    print(f"      Type: TEST / WEBSOCKET")
    print(f"      Units: ENG481, RES48\n")
    
    input("      Press ENTER after confirming browser updated...\n")
    
    # Step 2: Send CLEAR
    print("[2/2] Sending CLEAR packet via TCP...")
    print("      >>> WATCH BROWSER NOW - status should change to CLOSED <<<")
    print("      >>> Unit times should populate <<<\n")
    
    clear_html = CLEAR_TEMPLATE.format(
        event_number=event_number,
        dispatch_time=dispatch_time,
        enroute_time=enroute_time,
        arrive_time=arrive_time,
        clear_time=clear_time,
        comment_time=comment_time,
        clear_comment_time=clear_comment_time,
    )
    
    if not send_tcp_packet(args.host, args.port, clear_html):
        print("\nFailed to send CLEAR packet.")
        sys.exit(1)
    
    print(f"      ✓ CLEAR sent for {event_number}")
    print(f"      Status should now be: CLOSED")
    print(f"      Unit times should show dispatch → enroute → arrive → clear\n")
    
    print(f"{'='*70}")
    print("Test Complete!")
    print(f"{'='*70}")
    print("\n✓ SUCCESS CRITERIA:")
    print("  1. Incident appeared in browser list within 1 second of DISPATCH")
    print("  2. Modal auto-popped for the new incident")
    print("  3. 'Live' indicator is green (WebSocket connected)")
    print("  4. Status changed to CLOSED within 1 second of CLEAR")
    print("  5. No 5-second polling delay on any update")
    print("\n✗ IF SOMETHING DIDN'T WORK:")
    print("  - Check browser console (F12) for WebSocket errors")
    print("  - Check CAD listener log: tail -f /opt/runsheet/cad/listener.log")
    print("  - Check backend log: sudo journalctl -u runsheet -n 50 --no-pager")
    print(f"\nTest incident {event_number} is in the database.")
    print("It will appear as a TEST/WEBSOCKET call - delete manually if needed.")
    print("")


if __name__ == '__main__':
    main()
