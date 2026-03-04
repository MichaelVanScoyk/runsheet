#!/bin/bash
# =============================================================================
# CADReport Database Backup & Restore
# Usage:
#   ./db_backup.sh backup [label]   -- create a timestamped dump
#   ./db_backup.sh restore <file>   -- restore from a dump file
#   ./db_backup.sh list             -- list available backups
# =============================================================================

DB_NAME="runsheet_db"
DB_USER="dashboard"
BACKUP_DIR="/opt/runsheet/backups"
PGPASSWORD="dashboard"
export PGPASSWORD

mkdir -p "$BACKUP_DIR"

case "$1" in

  backup)
    LABEL=${2:-manual}
    TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
    FILENAME="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}_${LABEL}.dump"
    echo "Backing up $DB_NAME to $FILENAME ..."
    pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f "$FILENAME"
    if [ $? -eq 0 ]; then
      SIZE=$(du -sh "$FILENAME" | cut -f1)
      echo "OK backup complete: $FILENAME ($SIZE)"
    else
      echo "ERROR backup failed"
      exit 1
    fi
    ;;

  restore)
    if [ -z "$2" ]; then
      echo "Usage: ./db_backup.sh restore <filename>"
      echo "Run './db_backup.sh list' to see available backups"
      exit 1
    fi
    FILE="$2"
    if [ ! -f "$FILE" ]; then
      # Try prepending backup dir
      FILE="$BACKUP_DIR/$2"
    fi
    if [ ! -f "$FILE" ]; then
      echo "ERROR file not found: $2"
      exit 1
    fi
    echo "WARNING: This will DROP and recreate $DB_NAME from:"
    echo "  $FILE"
    read -p "Type YES to confirm: " CONFIRM
    if [ "$CONFIRM" != "YES" ]; then
      echo "Aborted."
      exit 0
    fi
    echo "Stopping runsheet service..."
    sudo systemctl stop runsheet
    echo "Restoring $DB_NAME ..."
    pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists -Fc "$FILE"
    if [ $? -eq 0 ]; then
      echo "OK restore complete"
      echo "Starting runsheet service..."
      cd /opt/runsheet && ./restart.sh
    else
      echo "ERROR restore failed — service not restarted, check manually"
      exit 1
    fi
    ;;

  list)
    echo "Available backups in $BACKUP_DIR:"
    echo ""
    ls -lh "$BACKUP_DIR"/*.dump 2>/dev/null | awk '{print $5, $9}' || echo "  (none found)"
    ;;

  *)
    echo "Usage: ./db_backup.sh [backup [label] | restore <file> | list]"
    exit 1
    ;;

esac
