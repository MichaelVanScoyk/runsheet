#!/bin/bash
set -e

echo "=== Stopping everything ==="
pkill -9 -f vite 2>/dev/null || true
pkill -f "cad_listener.py" 2>/dev/null || true
sudo systemctl stop runsheet 2>/dev/null || true
sleep 3

echo "=== Starting backend ==="
sudo systemctl start runsheet
sleep 3

# Verify backend is up
if ! curl -s http://127.0.0.1:8001/health > /dev/null 2>&1; then
    echo "ERROR: Backend failed to start"
    sudo journalctl -u runsheet -n 20 --no-pager
    exit 1
fi
echo "Backend running on :8001"

echo "=== Building frontend ==="
cd /opt/runsheet/frontend
npm run build

echo "=== Starting frontend dev server ==="
npm run dev -- --host > /tmp/vite.log 2>&1 &
disown
sleep 3

# Verify frontend is up
if ! curl -s http://127.0.0.1:5173 > /dev/null 2>&1; then
    echo "ERROR: Frontend failed to start"
    cat /tmp/vite.log
    exit 1
fi
echo "Frontend running on :5173"

echo "=== Starting CAD listener ==="
cd /opt/runsheet/cad
nohup /opt/runsheet/runsheet_env/bin/python cad_listener.py --port 19117 --tenant glenmoorefc > /opt/runsheet/cad/listener.log 2>&1 &
disown
sleep 3

# Verify CAD listener is up
if ! netstat -tlnp 2>/dev/null | grep -q 19117; then
    if ! ss -tlnp | grep -q 19117; then
        echo "ERROR: CAD listener failed to start"
        tail -20 /opt/runsheet/cad/listener.log
        exit 1
    fi
fi
echo "CAD listener running on :19117"

echo ""
echo "=== READY ==="
echo "App:          http://192.168.1.189:5173"
echo "API:          http://192.168.1.189:8001"
echo "CAD Listener: port 19117"
echo ""
echo "CAD log: tail -f /opt/runsheet/cad/listener.log"
