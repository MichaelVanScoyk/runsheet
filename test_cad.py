#!/usr/bin/env python3
"""
Simple CAD Test Script

Sends test dispatch/clear to CAD listener, then deletes via API.
Loops until you quit.

Usage:
    python test_cad.py
"""

import socket
import requests
from datetime import datetime

CAD_HOST = "127.0.0.1"
CAD_PORT = 19117
API_URL = "http://127.0.0.1:8001"
TENANT = "glenmoorefc"

DISPATCH_TEMPLATE = """<style>
table{{ table-layout: fixed; width:670px; border-collapse:collapse; margin-top:10px; }}
td, th{{ word-wrap:break-word; font-family: Arial; vertical-align:top; padding:5px; }}
td.Title{{ border-bottom:1px solid black; text-align:center; font-size: 1.75em; }}
td.Header{{ border-bottom:1px solid black; text-align:left; font-size: 1.5em; }}
</style>
<table><tr><td class="Title"> Chester County Emergency Services Dispatch Report </td></tr></table>
<table class="EventInfo">
<tr><td>Event ID: </td><td>9999999</td><td>Event: </td><td>{event_number}</td></tr>
<tr><td>Unit: </td><td>ENG481</td><td>Dispatch Time: </td><td>{dispatch_datetime}</td></tr>
<tr><td>Event Type: </td><td>FIRE</td><td>Agency: </td><td>FIRE</td></tr>
<tr><td>Event Sub-Type: </td><td>TEST - DELETE ME</td><td>Dispatch Group: </td><td>48FD</td></tr>
</table>
<table><tr><td class="Header"> Location </td></tr></table>
<table class="EventInfo">
<tr><td>Address: </td><td COLSPAN="3">999 TEST INCIDENT - DELETE ME<br></td></tr>
<tr><td>Municipality: </td><td>WMOOR</td><td> ESZ: </td><td>4801</td></tr>
</table>
<table><tr><td class="Header">Responding Units</td></tr></table>
<table class="EventUnits">
<tr><th>Unit</th><th>Station</th><th>Agency</th><th>Status</th><th>Time</th></tr>
<tr><td>ENG481</td><td>48</td><td>FIRE</td><td></td><td>{dispatch_time}</td></tr>
</table>
"""

CLEAR_TEMPLATE = """<style>
table{{ table-layout: fixed; width:670px; border-collapse:collapse; margin-top:10px; }}
td, th{{ word-wrap:break-word; font-family: Arial; vertical-align:top; padding:5px; }}
td.Title{{ border-bottom:1px solid black; text-align:center; font-size: 1.75em; }}
td.Header{{ border-bottom:1px solid black; text-align:left; font-size: 1.5em; }}
</style>
<table><tr><td class="Title"> Chester County Emergency Services Clear Report </td></tr></table>
<table class="twoCol">
<tr><td>Event Number: </td><td>{event_number}</td><td>Dispatch Group: </td><td>48FD</td></tr>
<tr><td>Event Type: </td><td>FIRE</td><td>First Disp: </td><td>{dispatch_time}</td></tr>
<tr><td>Event Sub-Type: </td><td>TEST - DELETE ME</td><td>First EnRt: </td><td>{enroute_time}</td></tr>
<tr><td></td><td></td><td>First Arrive: </td><td>{arrive_time}</td></tr>
<tr><td></td><td></td><td>Last Avail: </td><td>{clear_time}</td></tr>
</table>
<table><tr><td class="Header"> Location </td></tr></table>
<table class="EventInfo">
<tr><td>Address: </td><td COLSPAN="3">999 TEST INCIDENT - DELETE ME</td></tr>
<tr><td>Municipality: </td><td>WMOOR</td><td> ESZ: </td><td>4801</td></tr>
</table>
<table><tr><td class="Header">Unit Times</td></tr></table>
<table class="UnitTimes">
<tr><th>Unit</th><th>DP</th><th>ER</th><th>AR</th><th>TR</th><th>TA</th><th>AV</th><th>AQ</th></tr>
<tr><td>ENG481</td><td>{dispatch_time}</td><td>{enroute_time}</td><td>{arrive_time}</td><td></td><td></td><td>{clear_time}</td><td>{clear_time}</td></tr>
</table>
"""


def send_tcp(data: str) -> bool:
    """Send data to CAD listener"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect((CAD_HOST, CAD_PORT))
        sock.sendall(data.encode('utf-8'))
        sock.close()
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def get_incident_id(event_number: str) -> int | None:
    """Look up incident ID by CAD event number"""
    try:
        resp = requests.get(
            f"{API_URL}/api/incidents/by-cad/{event_number}",
            headers={"X-Tenant": TENANT},
            timeout=5
        )
        if resp.status_code == 200:
            return resp.json().get("id")
    except:
        pass
    return None


def delete_incident(incident_id: int) -> bool:
    """Delete incident via API"""
    try:
        resp = requests.delete(
            f"{API_URL}/api/incidents/{incident_id}",
            headers={"X-Tenant": TENANT},
            timeout=5
        )
        return resp.status_code == 200
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def run_test():
    """Run one test cycle"""
    now = datetime.now()
    event_number = f"T26{now.strftime('%H%M%S')}"
    dispatch_time = now.strftime('%H:%M:%S')
    dispatch_datetime = now.strftime('%m-%d-%y %H:%M:%S')
    
    print(f"\n{'='*50}")
    print(f"TEST EVENT: {event_number}")
    print(f"{'='*50}")
    
    # DISPATCH
    print("\n[1] Sending DISPATCH...")
    dispatch_html = DISPATCH_TEMPLATE.format(
        event_number=event_number,
        dispatch_datetime=dispatch_datetime,
        dispatch_time=dispatch_time,
    )
    if send_tcp(dispatch_html):
        print(f"  ✓ DISPATCH sent - check browser for dispatch sound")
    else:
        print("  ✗ DISPATCH failed")
        return
    
    input("\n[2] Press ENTER to send CLEAR...")
    
    # CLEAR
    print("Sending CLEAR...")
    clear_html = CLEAR_TEMPLATE.format(
        event_number=event_number,
        dispatch_time=dispatch_time,
        enroute_time=dispatch_time,
        arrive_time=dispatch_time,
        clear_time=dispatch_time,
    )
    if send_tcp(clear_html):
        print(f"  ✓ CLEAR sent - check browser for close sound")
    else:
        print("  ✗ CLEAR failed")
    
    input("\n[3] Press ENTER to DELETE incident...")
    
    # DELETE
    print("Deleting incident...")
    incident_id = get_incident_id(event_number)
    if incident_id:
        if delete_incident(incident_id):
            print(f"  ✓ Incident {incident_id} deleted")
        else:
            print(f"  ✗ Delete failed")
    else:
        print(f"  ✗ Could not find incident {event_number}")


def main():
    print("\n" + "="*50)
    print("CAD TEST SCRIPT")
    print("="*50)
    print("Make sure browser is open with AV alerts enabled")
    print("Ctrl+C to quit")
    
    while True:
        try:
            run_test()
            print("\n" + "-"*50)
            input("Press ENTER to run another test (Ctrl+C to quit)...")
        except KeyboardInterrupt:
            print("\n\nDone.")
            break


if __name__ == "__main__":
    main()
