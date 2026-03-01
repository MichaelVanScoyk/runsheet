#!/bin/bash
# =============================================================================
# CADReport Database Restore
# Usage: ./scripts/db_restore.sh <backup_file>
# Example: ./scripts/db_restore.sh /opt/runsheet/backups/runsheet_db_2026-02-28_143000.dump
#
# WARNING: This drops and recreates the database. All current data is replaced.
# =============================================================================
set -e

if [ -z "$1" ]; then
    echo "Usage: ./scripts/db_restore.sh <backup_file>"
    echo ""
    echo "Available backups:"
    ls -lhtr /opt/runsheet/backups/*.dump 2>/dev/null || echo "  No backups found"
    exit 1
fi

BACKUP_FILE="$1"
DB_NAME="runsheet_db"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Verify backup is readable
echo "Verifying backup file..."
pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "ERROR: Backup file is corrupt or unreadable"
    exit 1
fi
echo "✓ Backup file verified"

# Confirm
DUMP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo ""
echo "=== CADReport Database Restore ==="
echo "Source: $BACKUP_FILE ($DUMP_SIZE)"
echo "Target: $DB_NAME"
echo ""
echo "WARNING: This will REPLACE all data in $DB_NAME"
read -p "Type 'RESTORE' to confirm: " CONFIRM

if [ "$CONFIRM" != "RESTORE" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "Stopping services..."
cd /opt/runsheet
pkill -f "cad_listener.py" 2>/dev/null || true
sudo systemctl stop runsheet 2>/dev/null || true
sleep 2

echo "Restoring database..."
pg_restore --clean --if-exists --dbname="$DB_NAME" "$BACKUP_FILE" 2>&1 | grep -v "does not exist, skipping" || true

echo "Restarting services..."
./restart.sh

echo ""
echo "=== Restore Complete ==="
