#!/bin/bash
# =============================================================================
# CADReport Database Backup
# Usage: ./scripts/db_backup.sh [label]
# Output: /opt/runsheet/backups/runsheet_db_YYYY-MM-DD_HHMMSS[_label].dump
# =============================================================================
set -e

DB_NAME="runsheet_db"
BACKUP_DIR="/opt/runsheet/backups"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
LABEL="${1:+_$1}"
FILENAME="${DB_NAME}_${TIMESTAMP}${LABEL}.dump"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "$BACKUP_DIR"

echo "=== CADReport Database Backup ==="
echo "Database: $DB_NAME"
echo "Output:   $FILEPATH"
echo ""

pg_dump "$DB_NAME" --format=custom --compress=6 --file="$FILEPATH"

DUMP_SIZE=$(du -h "$FILEPATH" | cut -f1)
echo "Backup created: $FILENAME ($DUMP_SIZE)"

# Verify
echo "Verifying..."
pg_restore --list "$FILEPATH" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Backup verified"
else
    echo "✗ Backup verification failed!"
    exit 1
fi

echo ""
echo "Recent backups:"
ls -lhtr "$BACKUP_DIR"/*.dump 2>/dev/null | tail -5
