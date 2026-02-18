#!/bin/bash
# =============================================================================
# Phase B Deploy Script — PgBouncer + Connection Refactor
# =============================================================================
# Run this ON THE SERVER after git pull but BEFORE restart.sh
#
# What it does:
#   1. Installs PgBouncer
#   2. Copies config files
#   3. Increases PostgreSQL max_connections to 2000
#   4. Restarts PostgreSQL (required for max_connections)
#   5. Starts PgBouncer
#   6. Verifies PgBouncer is accepting connections
#
# Usage:
#   cd /opt/runsheet
#   git pull
#   sudo bash server/pgbouncer/deploy_phase_b.sh
#   ./restart.sh
# =============================================================================

set -e  # Exit on any error

echo "============================================"
echo "  Phase B: PgBouncer + Connection Refactor"
echo "============================================"
echo ""

# ─── Step 1: Install PgBouncer ───
echo ">>> Step 1: Installing PgBouncer..."
if command -v pgbouncer &> /dev/null; then
    echo "    PgBouncer already installed: $(pgbouncer --version 2>&1 | head -1)"
else
    apt-get update -qq
    apt-get install -y pgbouncer
    echo "    PgBouncer installed: $(pgbouncer --version 2>&1 | head -1)"
fi
echo ""

# ─── Step 2: Stop PgBouncer if running (to safely replace config) ───
echo ">>> Step 2: Stopping PgBouncer (if running)..."
systemctl stop pgbouncer 2>/dev/null || true
echo "    Stopped."
echo ""

# ─── Step 3: Copy config files ───
echo ">>> Step 3: Copying PgBouncer config files..."
cp /opt/runsheet/server/pgbouncer/pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
cp /opt/runsheet/server/pgbouncer/userlist.txt /etc/pgbouncer/userlist.txt

# Set permissions — pgbouncer user needs to read these
chown postgres:postgres /etc/pgbouncer/pgbouncer.ini
chown postgres:postgres /etc/pgbouncer/userlist.txt
chmod 640 /etc/pgbouncer/pgbouncer.ini
chmod 640 /etc/pgbouncer/userlist.txt

# Ensure log directory exists
mkdir -p /var/log/pgbouncer
chown postgres:postgres /var/log/pgbouncer

# Ensure pid directory exists
mkdir -p /run/pgbouncer
chown postgres:postgres /run/pgbouncer

echo "    Config files installed."
echo ""

# ─── Step 4: Verify PgBouncer auth hash matches PostgreSQL ───
echo ">>> Step 4: Verifying auth hash..."
# Get the actual hash from PostgreSQL to make sure it matches
PG_HASH=$(sudo -u postgres psql -tAc "SELECT rolpassword FROM pg_authid WHERE rolname = 'dashboard'" 2>/dev/null || echo "")
BOUNCER_HASH=$(grep '"dashboard"' /etc/pgbouncer/userlist.txt | awk '{print $2}' | tr -d '"')

if [ -n "$PG_HASH" ] && [ "$PG_HASH" != "$BOUNCER_HASH" ]; then
    echo "    WARNING: PgBouncer hash doesn't match PostgreSQL!"
    echo "    PG hash:       $PG_HASH"
    echo "    Bouncer hash:  $BOUNCER_HASH"
    echo "    Updating userlist.txt with correct hash from PostgreSQL..."
    echo "\"dashboard\" \"$PG_HASH\"" > /etc/pgbouncer/userlist.txt
    chown postgres:postgres /etc/pgbouncer/userlist.txt
    chmod 640 /etc/pgbouncer/userlist.txt
    echo "    Fixed."
elif [ -z "$PG_HASH" ]; then
    echo "    Could not read PG hash (might use scram-sha-256). Checking..."
    PG_METHOD=$(sudo -u postgres psql -tAc "SELECT rolpassword FROM pg_authid WHERE rolname = 'dashboard'" 2>/dev/null || echo "")
    if [[ "$PG_METHOD" == SCRAM-SHA-256* ]]; then
        echo ""
        echo "    ╔═══════════════════════════════════════════════════════════╗"
        echo "    ║  PostgreSQL uses SCRAM-SHA-256 auth for 'dashboard'.     ║"
        echo "    ║  PgBouncer needs md5. Run this in psql to switch:        ║"
        echo "    ║                                                           ║"
        echo "    ║  ALTER USER dashboard WITH PASSWORD 'dashboard';          ║"
        echo "    ║  (after setting password_encryption = 'md5' in pg_hba)   ║"
        echo "    ║                                                           ║"
        echo "    ║  OR set auth_type = scram-sha-256 in pgbouncer.ini       ║"
        echo "    ║  (requires PgBouncer >= 1.14)                            ║"
        echo "    ╚═══════════════════════════════════════════════════════════╝"
        echo ""
        # Check PgBouncer version for SCRAM support
        PGB_VER=$(pgbouncer --version 2>&1 | grep -oP '\d+\.\d+' | head -1)
        echo "    PgBouncer version: $PGB_VER"
        if [[ $(echo "$PGB_VER >= 1.14" | bc -l 2>/dev/null || echo 0) == 1 ]]; then
            echo "    PgBouncer >= 1.14 detected. Switching to scram-sha-256 auth..."
            sed -i 's/auth_type = md5/auth_type = scram-sha-256/' /etc/pgbouncer/pgbouncer.ini
            # For SCRAM, we can use auth_query instead of userlist.txt
            # But simpler: just use auth_file with the SCRAM hash
            echo "\"dashboard\" \"$PG_METHOD\"" > /etc/pgbouncer/userlist.txt
            chown postgres:postgres /etc/pgbouncer/userlist.txt
            chmod 640 /etc/pgbouncer/userlist.txt
            echo "    Updated to scram-sha-256."
        fi
    fi
else
    echo "    Hash matches PostgreSQL. Good."
fi
echo ""

# ─── Step 5: Increase PostgreSQL max_connections ───
echo ">>> Step 5: Checking PostgreSQL max_connections..."
CURRENT_MAX=$(sudo -u postgres psql -tAc "SHOW max_connections" 2>/dev/null || echo "100")
CURRENT_MAX=$(echo "$CURRENT_MAX" | tr -d '[:space:]')
echo "    Current max_connections: $CURRENT_MAX"

if [ "$CURRENT_MAX" -lt 2000 ]; then
    echo "    Increasing to 2000..."
    sudo -u postgres psql -c "ALTER SYSTEM SET max_connections = 2000;" 2>/dev/null
    
    echo "    Restarting PostgreSQL (required for max_connections change)..."
    systemctl restart postgresql
    sleep 3
    
    NEW_MAX=$(sudo -u postgres psql -tAc "SHOW max_connections" 2>/dev/null || echo "?")
    echo "    New max_connections: $(echo $NEW_MAX | tr -d '[:space:]')"
else
    echo "    Already >= 2000. No change needed."
fi
echo ""

# ─── Step 6: Start PgBouncer ───
echo ">>> Step 6: Starting PgBouncer..."
systemctl enable pgbouncer
systemctl start pgbouncer
sleep 2
echo ""

# ─── Step 7: Verify PgBouncer is running and accepting connections ───
echo ">>> Step 7: Verifying PgBouncer..."

# Check service status
if systemctl is-active --quiet pgbouncer; then
    echo "    ✓ PgBouncer service is running"
else
    echo "    ✗ PgBouncer service FAILED to start!"
    echo "    Check: journalctl -u pgbouncer -n 30 --no-pager"
    echo "    Check: cat /var/log/pgbouncer/pgbouncer.log"
    exit 1
fi

# Check port is listening
if ss -tlnp | grep -q ':6432'; then
    echo "    ✓ Port 6432 is listening"
else
    echo "    ✗ Port 6432 is NOT listening!"
    echo "    Check: journalctl -u pgbouncer -n 30 --no-pager"
    exit 1
fi

# Test actual connection through PgBouncer
if PGPASSWORD=dashboard psql -h 127.0.0.1 -p 6432 -U dashboard -d cadreport_master -c "SELECT 1" > /dev/null 2>&1; then
    echo "    ✓ Can connect to cadreport_master via PgBouncer"
else
    echo "    ✗ Cannot connect to cadreport_master via PgBouncer!"
    echo "    This is likely an auth issue. Check:"
    echo "      cat /var/log/pgbouncer/pgbouncer.log"
    echo "      sudo -u postgres psql -c \"SELECT rolname, left(rolpassword,10) FROM pg_authid WHERE rolname='dashboard'\""
    exit 1
fi

if PGPASSWORD=dashboard psql -h 127.0.0.1 -p 6432 -U dashboard -d runsheet_db -c "SELECT 1" > /dev/null 2>&1; then
    echo "    ✓ Can connect to runsheet_db via PgBouncer"
else
    echo "    ✗ Cannot connect to runsheet_db via PgBouncer!"
    exit 1
fi

echo ""
echo "============================================"
echo "  Phase B: PgBouncer deployed successfully"
echo "============================================"
echo ""
echo "  PgBouncer:  127.0.0.1:6432 (transaction mode)"
echo "  PostgreSQL: 127.0.0.1:5432 (direct, for LISTEN/NOTIFY)"
echo ""
echo "  Next step: ./restart.sh"
echo ""
echo "  Useful commands:"
echo "    PGPASSWORD=dashboard psql -h 127.0.0.1 -p 6432 -U dashboard pgbouncer -c 'SHOW POOLS;'"
echo "    PGPASSWORD=dashboard psql -h 127.0.0.1 -p 6432 -U dashboard pgbouncer -c 'SHOW STATS;'"
echo "    journalctl -u pgbouncer -n 20 --no-pager"
echo "    cat /var/log/pgbouncer/pgbouncer.log"
echo ""
