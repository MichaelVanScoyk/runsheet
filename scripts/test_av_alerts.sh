#!/bin/bash
# =============================================================================
# Test AV Alerts - Creates and closes a test incident
# =============================================================================
# 
# This script sends a test dispatch and then a clear report to verify
# the AV alerts WebSocket is working correctly.
#
# Prerequisites:
#   1. Enable Sound Alerts in the sidebar toggle
#   2. Have the browser tab open at glenmoorefc.cadreport.com
#   3. Sound files exist in frontend/public/sounds/
#
# Usage:
#   ssh dashboard@glenmoorefc.cadreport.com
#   cd /opt/runsheet
#   bash scripts/test_av_alerts.sh
#
# =============================================================================

set -e

# Configuration
HOST="localhost"
PORT="19117"
EVENT_NUM="T26999999"
TODAY=$(date +"%m/%d/%y")
NOW_TIME=$(date +"%H:%M:%S")
NOW_DT=$(date +"%m-%d-%y %H:%M:%S")

echo "=============================================="
echo "  AV Alerts Test Script"
echo "=============================================="
echo ""
echo "  Event Number: $EVENT_NUM"
echo "  Dispatch Time: $NOW_DT"
echo "  Target: $HOST:$PORT"
echo ""
echo "  BEFORE RUNNING:"
echo "  1. Open browser to https://glenmoorefc.cadreport.com"
echo "  2. Enable 'Sound Alerts' toggle in sidebar"
echo "  3. Ensure browser tab has focus (for audio)"
echo ""
read -p "Press ENTER to send DISPATCH (expect Fire alert sound)..."

# Create dispatch report
DISPATCH_HTML=$(cat << 'HTMLEOF'
<style>
table{table-layout:fixed;width:670px;border-collapse:collapse;margin-top:10px;}
td,th{word-wrap:break-word;font-family:Arial;vertical-align:top;padding:5px;}
th{text-align:left;font-size:1.25em;border-bottom:1px dashed black;}
td.Header{border-bottom:1px solid black;text-align:left;font-size:1.5em;}
td.Title{border-bottom:1px solid black;text-align:center;font-size:1.75em;}
</style>
<table><tr><td class="Title">Chester County Emergency Services Dispatch Report</td></tr></table>
<table class="EventInfo">
<tr><td>Event ID:</td><td>9999999</td><td>Event:</td><td>EVENT_NUM_PLACEHOLDER</td></tr>
<tr><td>Unit:</td><td>ENG481</td><td>Dispatch Time:</td><td>DISPATCH_TIME_PLACEHOLDER</td></tr>
<tr><td>Event Type:</td><td>DWELLING FIRE</td><td>Agency:</td><td>FIRE</td></tr>
<tr><td>Event Sub-Type:</td><td>W/ENTRAPMENT</td><td>Dispatch Group:</td><td>48FD</td></tr>
</table>
<table><tr><td class="Header">Location</td></tr></table>
<table class="EventInfo">
<tr><td>Address:</td><td COLSPAN="3">123 AV ALERT TEST DR</td></tr>
<tr><td>Cross Street:</td><td COLSPAN="3">MAIN ST AND OAK AVE</td></tr>
<tr><td>Municipality:</td><td>WALLAC</td><td>ESZ:</td><td>4801</td></tr>
</table>
<table><tr><td class="Header">Caller Information</td></tr></table>
<table class="EventInfo">
<tr><td>Caller Name:</td><td COLSPAN="3">AV ALERT TESTER</td></tr>
<tr><td>Caller Phone:</td><td COLSPAN="3">(610) 555-0000</td></tr>
</table>
<table><tr><td class="Header">Responding Units</td></tr></table>
<table class="EventUnits">
<tr><th>Unit</th><th>Station</th><th>Agency</th><th>Status</th><th>Time</th></tr>
<tr><td>ENG481</td><td>48</td><td>FIRE</td><td></td><td></td></tr>
<tr><td>TWR48</td><td>48</td><td>FIRE</td><td></td><td></td></tr>
</table>
<table><tr><td class="Header">Event Comments</td></tr></table>
<table>
<tr><td class="EventComment">TIME_PLACEHOLDER</td><td class="EventComment">tester</td><td class="EventComment">AV ALERT TEST - DISPATCH</td></tr>
</table>
HTMLEOF
)

# Replace placeholders
DISPATCH_HTML="${DISPATCH_HTML//EVENT_NUM_PLACEHOLDER/$EVENT_NUM}"
DISPATCH_HTML="${DISPATCH_HTML//DISPATCH_TIME_PLACEHOLDER/$NOW_DT}"
DISPATCH_HTML="${DISPATCH_HTML//TIME_PLACEHOLDER/$NOW_TIME}"

# Send dispatch
echo ""
echo "Sending DISPATCH report..."
echo "$DISPATCH_HTML" | nc -q 1 $HOST $PORT
echo "✓ Dispatch sent!"
echo ""
echo "  >> You should have heard the FIRE DISPATCH sound"
echo "  >> Check browser console for WebSocket messages"
echo ""

# Wait for user
read -p "Press ENTER to send CLEAR (expect Close sound)..."

# Create clear report  
CLEAR_TIME=$(date +"%H:%M:%S")
CLEAR_DT=$(date +"%m-%d-%y %H:%M:%S")

CLEAR_HTML=$(cat << 'HTMLEOF'
<style>
table{table-layout:fixed;width:670px;border-collapse:collapse;margin-top:10px;}
td,th{word-wrap:break-word;font-family:Arial;vertical-align:top;padding:5px;}
th{text-align:left;font-size:1.25em;border-bottom:1px dashed black;}
td.Header{border-bottom:1px solid black;text-align:left;font-size:1.5em;}
td.Title{border-bottom:1px solid black;text-align:center;font-size:1.75em;}
</style>
<table><tr><td class="Title">Chester County Emergency Services Clear Report</td></tr></table>
<table class="EventInfo">
<tr><td>Event ID:</td><td>9999999</td><td>Event:</td><td>EVENT_NUM_PLACEHOLDER</td></tr>
<tr><td>Unit:</td><td>ENG481</td><td>Dispatch Time:</td><td>DISPATCH_TIME_PLACEHOLDER</td></tr>
<tr><td>Event Type:</td><td>DWELLING FIRE</td><td>Agency:</td><td>FIRE</td></tr>
<tr><td>Event Sub-Type:</td><td>W/ENTRAPMENT</td><td>Dispatch Group:</td><td>48FD</td></tr>
</table>
<table><tr><td class="Header">Location</td></tr></table>
<table class="EventInfo">
<tr><td>Address:</td><td COLSPAN="3">123 AV ALERT TEST DR</td></tr>
<tr><td>Municipality:</td><td>WALLAC</td><td>ESZ:</td><td>4801</td></tr>
</table>
<table><tr><td class="Header">Responding Units</td></tr></table>
<table class="EventUnits">
<tr><th>Unit</th><th>Station</th><th>Agency</th><th>Disp</th><th>Enrt</th><th>Arrv</th><th>Avail</th><th>Clear</th></tr>
<tr><td>ENG481</td><td>48</td><td>FIRE</td><td>DISPATCH_TIME_PLACEHOLDER</td><td>DISPATCH_TIME_PLACEHOLDER</td><td>DISPATCH_TIME_PLACEHOLDER</td><td></td><td>CLEAR_TIME_PLACEHOLDER</td></tr>
<tr><td>TWR48</td><td>48</td><td>FIRE</td><td>DISPATCH_TIME_PLACEHOLDER</td><td>DISPATCH_TIME_PLACEHOLDER</td><td>DISPATCH_TIME_PLACEHOLDER</td><td></td><td>CLEAR_TIME_PLACEHOLDER</td></tr>
</table>
<table><tr><td class="Header">Event Comments</td></tr></table>
<table>
<tr><td class="EventComment">COMMENT_TIME_PLACEHOLDER</td><td class="EventComment">tester</td><td class="EventComment">AV ALERT TEST - DISPATCH</td></tr>
<tr><td class="EventComment">CLEAR_COMMENT_TIME_PLACEHOLDER</td><td class="EventComment">tester</td><td class="EventComment">AV ALERT TEST - CLEAR</td></tr>
</table>
HTMLEOF
)

# Replace placeholders
CLEAR_HTML="${CLEAR_HTML//EVENT_NUM_PLACEHOLDER/$EVENT_NUM}"
CLEAR_HTML="${CLEAR_HTML//DISPATCH_TIME_PLACEHOLDER/$NOW_DT}"
CLEAR_HTML="${CLEAR_HTML//CLEAR_TIME_PLACEHOLDER/$CLEAR_DT}"
CLEAR_HTML="${CLEAR_HTML//COMMENT_TIME_PLACEHOLDER/$NOW_TIME}"
CLEAR_HTML="${CLEAR_HTML//CLEAR_COMMENT_TIME_PLACEHOLDER/$CLEAR_TIME}"

# Send clear
echo ""
echo "Sending CLEAR report..."
echo "$CLEAR_HTML" | nc -q 1 $HOST $PORT
echo "✓ Clear sent!"
echo ""
echo "  >> You should have heard the CLOSE sound"
echo "  >> Incident should now show as CLOSED in the list"
echo ""

# Cleanup prompt
echo "=============================================="
echo "  Test Complete!"
echo "=============================================="
echo ""
echo "To clean up the test incident, run:"
echo ""
echo "  sudo -u postgres psql runsheet_db -c \\"
echo "    \"DELETE FROM incident_personnel WHERE incident_id IN (SELECT id FROM incidents WHERE cad_event_number = '$EVENT_NUM');\""
echo "  sudo -u postgres psql runsheet_db -c \\"
echo "    \"DELETE FROM incident_units WHERE incident_id IN (SELECT id FROM incidents WHERE cad_event_number = '$EVENT_NUM');\""
echo "  sudo -u postgres psql runsheet_db -c \\"
echo "    \"DELETE FROM incidents WHERE cad_event_number = '$EVENT_NUM';\""
echo ""
