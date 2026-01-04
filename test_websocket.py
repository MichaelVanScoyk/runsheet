#!/usr/bin/env python3
"""
WebSocket End-to-End Test Script

TRUE END-TO-END: Sends actual TCP packets to the CAD listener port,
just like Chester County's CAD system would.

Flow tested:
  TCP packet → CAD Listener (port 19117) → HTTP API → Backend → WebSocket → Browser

Usage:
    python test_websocket.py --port 19117
"""

import argparse
import socket
import time
import sys
from datetime import datetime

# Real Chester County DISPATCH format
DISPATCH_TEMPLATE = """<style>
                        table{{
                                table-layout: fixed;
                                width:670px;
                                border-collapse:collapse;
                                margin-top:10px;
                        }}
                        table.EventInfo td:first-child, table.EventInfo td:nth-child(3){{
                                width:20ch;
                                vertical-align:top;
                                text-align:right;
                                font-family: Arial;
                                font-weight: bold;
                        }}
                        td, th{{
                                word-wrap:break-word;
                                font-family: Arial;
                                vertical-align:top;
                                padding:5px;
                        }}
                        th{{
                                text-align:left;
                                font-size: 1.25em;
                                border-bottom:1px dashed black;
                        }}
                        td.Header{{
                                border-bottom:1px solid black;
                                text-align:left;
                                font-size: 1.5em;
                        }}
                        td.Title{{
                                border-bottom:1px solid black;
                                text-align:center;
                                font-size: 1.75em;
                        }}
                        table.EventUnits td{{
                                text-align:left;
                        }}
                </style>
<table xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td class="Title"> Chester County Emergency Services Dispatch Report </td>
</tr>
</table>
<table class="EventInfo" xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td>Event ID: </td>
<td>9999999</td>
<td>Event: </td>
<td>{event_number}</td>
</tr>
<tr>
<td>Unit: </td>
<td>ENG481</td>
<td>Dispatch Time: </td>
<td>{dispatch_datetime}</td>
</tr>
<tr>
<td>Event Type: </td>
<td>FIRE</td>
<td>Agency: </td>
<td>FIRE</td>
</tr>
<tr>
<td>Event Sub-Type: </td>
<td>WEBSOCKET TEST</td>
<td>Dispatch Group: </td>
<td>48FD</td>
</tr>
</table>
<table xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td COLSPAN="4" class="Header"> Location </td>
</tr>
</table>
<table class="EventInfo" xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td>Address: </td>
<td COLSPAN="3">999 WEBSOCKET TEST LN<br></td>
</tr>
<tr>
<td>Location Info: </td>
<td COLSPAN="3"></td>
</tr>
<tr>
<td>Cross Street: </td>
<td COLSPAN="3">MAIN ST AND OAK AVE</td>
</tr>
<tr>
<td>Municipality: </td>
<td>WMOOR</td>
<td> ESZ: </td>
<td>4801</td>
</tr>
<tr>
<td> Development: </td>
<td></td>
<td>Beat: </td>
<td>48</td>
</tr>
</table>
<table xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td COLSPAN="4" class="Header">Caller Information</td>
</tr>
</table>
<table class="EventInfo" xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td>Caller Name: </td>
<td COLSPAN="3">WEBSOCKET TEST</td>
</tr>
<tr>
<td>Caller Phone: </td>
<td COLSPAN="3">(610) 555-0199</td>
</tr>
<tr>
<td>Caller Address: </td>
<td></td>
<td>Caller Source: </td>
<td></td>
</tr>
</table>
<table xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td COLSPAN="4" class="Header">Responding Units</td>
</tr>
</table>
<table class="EventUnits" xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<th width="17%">Unit</th>
<th width="17%">Station</th>
<th width="17%">Agency</th>
<th width="17%">Status</th>
<th width="32%">Time</th>
</tr>
<tr>
<td>ENG481</td>
<td>48</td>
<td>FIRE</td>
<td></td>
<td></td>
</tr>
</table>
<table xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td COLSPAN="4" class="Header">Event Comments</td>
</tr>
</table>
<table xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td class="EventComment" width="80px">{comment_time}</td>
<td class="EventComment" width="80px">TEST</td>
<td COLSPAN="2" class="EventComment">WEBSOCKET TEST - IGNORE THIS INCIDENT</td>
</tr>
</table>
"""

# Real Chester County CLEAR format  
CLEAR_TEMPLATE = """<style>
                        table{{
                                table-layout: fixed;
                                width:670px;
                                border-collapse:collapse;
                                margin-top:10px;
                        }}
                        td.twoCol{{
                                width:25%;
                        }}
                        td, th{{
                                word-wrap:break-word;
                                font-family: Arial;
                                vertical-align:top;
                                padding:5px;
                        }}
                        td.Header{{
                                border-bottom:1px solid black;
                                text-align:left;
                                font-size: 1.5em;
                        }}
                        td.Title{{
                                border-bottom:1px solid black;
                                text-align:center;
                                font-size: 1.75em;
                        }}
                        table.UnitTimes tr.datarow td{{
                                border-bottom: 1px dashed black;
                        }}
                </style>
<table xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td class="Title"> Chester County Emergency Services Clear Report </td>
</tr>
</table>
<table class="twoCol" xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td class="twoCol">Event Number: </td>
<td class="twoCol">{event_number}</td>
<td class="twoCol">Dispatch Group: </td>
<td class="twoCol">48FD</td>
</tr>
<tr>
<td class="twoCol">Event Type: </td>
<td class="twoCol">FIRE</td>
<td class="twoCol">First Disp: </td>
<td class="twoCol">{dispatch_time}</td>
</tr>
<tr>
<td class="twoCol">Event Sub-Type: </td>
<td class="twoCol">WEBSOCKET TEST</td>
<td class="twoCol">First EnRt: </td>
<td class="twoCol">{enroute_time}</td>
</tr>
<tr>
<td class="twoCol"></td>
<td class="twoCol"></td>
<td class="twoCol">First Arrive: </td>
<td class="twoCol">{arrive_time}</td>
</tr>
<tr>
<td class="twoCol"></td>
<td class="twoCol"></td>
<td class="twoCol">Last Avail: </td>
<td class="twoCol">{clear_time}</td>
</tr>
</table>
<table xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td class="Header"> Location </td>
</tr>
</table>
<table class="EventInfo" xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td>Address: </td>
<td COLSPAN="3">999 WEBSOCKET TEST LN</td>
</tr>
<tr>
<td>Municipality: </td>
<td>WMOOR</td>
<td> ESZ: </td>
<td>4801</td>
</tr>
</table>
<table xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td class="Header">Unit Times</td>
</tr>
</table>
<table class="UnitTimes" xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<th>Unit</th>
<th>DP</th>
<th>ER</th>
<th>AR</th>
<th>TR</th>
<th>TA</th>
<th>AV</th>
<th>AQ</th>
</tr>
<tr class="datarow">
<td>ENG481</td>
<td>{dispatch_time}</td>
<td>{enroute_time}</td>
<td>{arrive_time}</td>
<td></td>
<td></td>
<td>{clear_time}</td>
<td>{clear_time}</td>
</tr>
</table>
<table xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td class="Header">Event Comments</td>
</tr>
</table>
<table xmlns:msxsl="urn:schemas-microsoft-com:xslt">
<tr>
<td class="EventComment" width="80px">{comment_time}</td>
<td class="EventComment" width="80px">TEST</td>
<td COLSPAN="2" class="EventComment">WEBSOCKET TEST - IGNORE THIS INCIDENT</td>
</tr>
</table>
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
    
    # Generate test event number in real format: F26XXXXXX
    now = datetime.now()
    event_number = f"F269{now.strftime('%H%M%S')}"  # e.g. F269143025 - unique per second
    
    # Generate times
    dispatch_time = now.strftime('%H:%M:%S')
    dispatch_datetime = now.strftime('%m-%d-%y %H:%M:%S')
    enroute_time = now.strftime('%H:%M:%S')
    arrive_time = now.strftime('%H:%M:%S')
    clear_time = now.strftime('%H:%M:%S')
    comment_time = now.strftime('%H:%M:%S')
    
    print(f"\n{'='*70}")
    print("WebSocket End-to-End Test")
    print(f"{'='*70}")
    print(f"Target: {args.host}:{args.port}")
    print(f"Test Event #: {event_number}")
    print(f"{'='*70}\n")
    
    # Step 1: Send DISPATCH
    print("[1/2] Sending DISPATCH packet...")
    print("      >>> WATCH BROWSER - incident should appear instantly <<<\n")
    
    dispatch_html = DISPATCH_TEMPLATE.format(
        event_number=event_number,
        dispatch_datetime=dispatch_datetime,
        comment_time=comment_time,
    )
    
    if not send_tcp_packet(args.host, args.port, dispatch_html):
        print("\nFailed to send DISPATCH. Is CAD listener running?")
        sys.exit(1)
    
    print(f"      ✓ DISPATCH sent: {event_number}")
    print(f"      Address: 999 WEBSOCKET TEST LN")
    print(f"      Type: FIRE / WEBSOCKET TEST\n")
    
    input("      Press ENTER after confirming browser updated...\n")
    
    # Step 2: Send CLEAR
    print("[2/2] Sending CLEAR packet...")
    print("      >>> WATCH BROWSER - status should change to CLOSED <<<\n")
    
    clear_html = CLEAR_TEMPLATE.format(
        event_number=event_number,
        dispatch_time=dispatch_time,
        enroute_time=enroute_time,
        arrive_time=arrive_time,
        clear_time=clear_time,
        comment_time=comment_time,
    )
    
    if not send_tcp_packet(args.host, args.port, clear_html):
        print("\nFailed to send CLEAR.")
        sys.exit(1)
    
    print(f"      ✓ CLEAR sent: {event_number}")
    print(f"      Status should now be: CLOSED\n")
    
    print(f"{'='*70}")
    print("Test Complete!")
    print(f"{'='*70}")
    print(f"\nTest incident {event_number} created.")
    print("Address: 999 WEBSOCKET TEST LN")
    print("Delete via Admin if needed.\n")


if __name__ == '__main__':
    main()
