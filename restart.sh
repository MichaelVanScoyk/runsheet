#!/bin/bash
set -e

echo "=== Stopping everything ==="
pkill -9 -f vite 2>/dev/null || true
sudo systemctl stop runsheet 2>/dev/null || true
sleep 2

echo "=== Starting backend ==="
sudo systemctl start runsheet
sleep 2

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

echo ""
echo "=== READY ==="
echo "http://192.168.1.189:5173"
