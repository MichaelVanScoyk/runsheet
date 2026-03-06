#!/bin/bash
# =============================================================================
# pre_migration_backup.sh
#
# Full database dump before NERIS schema migration.
# Run this ON THE SERVER before executing any migration.
#
# Usage:
#   chmod +x pre_migration_backup.sh
#   ./pre_migration_backup.sh
#
# Restore:
#   ./pre_migration_backup.sh restore
#
# What it backs up:
#   Full pg_dump of runsheet_db — all tables, all data, all schema.
#   Protects: incidents, incident_units, incident_personnel, apparatus,
#             personnel, ranks, municipalities, settings, audit_log, etc.
#
# Dump location:
#   /opt/runsheet/backups/
# =============================================================================

DB_NAME="runsheet_db"
DB_USER="dashboard"
DB_PASSWORD="dashboard"
DB_HOST="localhost"
DB_PORT="5432"
BACKUP_DIR="/opt/runsheet/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_FILE="${BACKUP_DIR}/runsheet_db_pre_neris_migration_${TIMESTAMP}.sql"
LATEST_LINK="${BACKUP_DIR}/latest.sql"

# -----------------------------------------------------------------------------
# RESTORE MODE
# -----------------------------------------------------------------------------
if [ "$1" == "restore" ]; then
    echo "============================================================"
    echo "  RESTORE MODE"
    echo "============================================================"

    # Find the dump to restore
    if [ -n "$2" ]; then
        RESTORE_FILE="$2"
    elif [ -L "$LATEST_LINK" ]; then
        RESTORE_FILE=$(readlink -f "$LATEST_LINK")
    else
        echo "ERROR: No dump file specified and no latest.sql symlink found."
        echo "Usage: ./pre_migration_backup.sh restore [path/to/dump.sql]"
        exit 1
    fi

    if [ ! -f "$RESTORE_FILE" ]; then
        echo "ERROR: Dump file not found: $RESTORE_FILE"
        exit 1
    fi

    echo "Restoring from: $RESTORE_FILE"
    echo "Database:       $DB_NAME"
    echo ""
    echo "WARNING: This will DROP and recreate the entire database."
    read -p "Type YES to confirm restore: " CONFIRM
    if [ "$CONFIRM" != "YES" ]; then
        echo "Aborted."
        exit 0
    fi

    echo ""
    echo "Dropping existing database..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
        -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
        2>/dev/null
    PGPASSWORD="$DB_PASSWORD" dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to drop database. Check connections."
        exit 1
    fi

    echo "Creating fresh database..."
    PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to create database."
        exit 1
    fi

    echo "Restoring dump..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$RESTORE_FILE"
    if [ $? -ne 0 ]; then
        echo "ERROR: Restore failed. Check output above."
        exit 1
    fi

    echo ""
    echo "============================================================"
    echo "  RESTORE COMPLETE"
    echo "  Database $DB_NAME restored from:"
    echo "  $RESTORE_FILE"
    echo "============================================================"
    echo ""
    echo "Restart services:"
    echo "  cd /opt/runsheet && ./restart.sh"
    exit 0
fi

# -----------------------------------------------------------------------------
# BACKUP MODE (default)
# -----------------------------------------------------------------------------
echo "============================================================"
echo "  runsheet_db PRE-MIGRATION BACKUP"
echo "  $(date)"
echo "============================================================"

# Create backup directory
mkdir -p "$BACKUP_DIR"
if [ $? -ne 0 ]; then
    echo "ERROR: Could not create backup directory: $BACKUP_DIR"
    exit 1
fi

echo ""
echo "Database:    $DB_NAME"
echo "Dump file:   $DUMP_FILE"
echo ""

# Run pg_dump
echo "Running pg_dump..."
PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=plain \
    --no-password \
    --verbose \
    -f "$DUMP_FILE" \
    2>&1 | grep -E "(dumping|creating|setting|pg_dump|ERROR|warning)" | head -40

DUMP_EXIT=$?

if [ $DUMP_EXIT -ne 0 ]; then
    echo ""
    echo "ERROR: pg_dump failed with exit code $DUMP_EXIT"
    exit 1
fi

# Verify dump file exists and is non-zero
if [ ! -f "$DUMP_FILE" ]; then
    echo "ERROR: Dump file was not created."
    exit 1
fi

DUMP_SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE" 2>/dev/null)
if [ -z "$DUMP_SIZE" ] || [ "$DUMP_SIZE" -eq 0 ]; then
    echo "ERROR: Dump file is empty. Something went wrong."
    exit 1
fi

# Update latest symlink
ln -sf "$DUMP_FILE" "$LATEST_LINK"

# Count rows in key tables for verification
echo ""
echo "Verifying key table row counts..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "
    SELECT 'incidents: ' || COUNT(*) FROM incidents
    UNION ALL
    SELECT 'incident_units: ' || COUNT(*) FROM incident_units
    UNION ALL
    SELECT 'incident_personnel: ' || COUNT(*) FROM incident_personnel
    UNION ALL
    SELECT 'apparatus: ' || COUNT(*) FROM apparatus
    UNION ALL
    SELECT 'personnel: ' || COUNT(*) FROM personnel
    UNION ALL
    SELECT 'neris_entity: ' || COUNT(*) FROM neris_entity
    UNION ALL
    SELECT 'neris_stations: ' || COUNT(*) FROM neris_stations
    UNION ALL
    SELECT 'neris_units: ' || COUNT(*) FROM neris_units
    UNION ALL
    SELECT 'neris_codes: ' || COUNT(*) FROM neris_codes;
"

echo ""
echo "============================================================"
echo "  BACKUP COMPLETE"
echo "  File: $DUMP_FILE"
printf "  Size: %s MB\n" $(echo "scale=2; $DUMP_SIZE / 1048576" | bc)
echo ""
echo "  To restore if migration goes wrong:"
echo "  ./pre_migration_backup.sh restore"
echo "  (uses latest.sql symlink automatically)"
echo ""
echo "  Or specify file explicitly:"
echo "  ./pre_migration_backup.sh restore $DUMP_FILE"
echo "============================================================"
