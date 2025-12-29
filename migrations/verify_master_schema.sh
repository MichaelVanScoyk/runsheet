#!/bin/bash
# =============================================================================
# Master Database Schema Verification & Repair
# Run: bash verify_master_schema.sh
# =============================================================================

set -e

DB="cadreport_master"
echo "=== Verifying cadreport_master schema ==="

# Check if database exists
if ! psql -lqt | cut -d \| -f 1 | grep -qw $DB; then
    echo "Creating database $DB..."
    createdb $DB
fi

# Check each table
echo ""
echo "=== Checking tables ==="

check_table() {
    local table=$1
    if psql $DB -c "\d $table" &>/dev/null; then
        echo "✓ $table exists"
        return 0
    else
        echo "✗ $table MISSING"
        return 1
    fi
}

TABLES="tenants tenant_requests tenant_sessions master_admins master_sessions master_audit_log system_config"
MISSING=""

for t in $TABLES; do
    if ! check_table $t; then
        MISSING="$MISSING $t"
    fi
done

if [ -n "$MISSING" ]; then
    echo ""
    echo "=== MISSING TABLES: $MISSING ==="
    echo "Run the full migration to create them:"
    echo "  psql $DB -f /opt/runsheet/migrations/001_master_database_full.sql"
    exit 1
fi

# Check critical columns in tenants
echo ""
echo "=== Checking tenants columns ==="

check_column() {
    local table=$1
    local column=$2
    if psql $DB -c "SELECT $column FROM $table LIMIT 0" &>/dev/null; then
        echo "  ✓ $table.$column"
        return 0
    else
        echo "  ✗ $table.$column MISSING"
        return 1
    fi
}

TENANT_COLS="id slug name password_hash database_name status contact_name contact_email contact_phone county state cad_port cad_format notes approved_at approved_by suspended_at suspended_by suspended_reason created_at"
MISSING_COLS=""

for c in $TENANT_COLS; do
    if ! check_column tenants $c; then
        MISSING_COLS="$MISSING_COLS $c"
    fi
done

if [ -n "$MISSING_COLS" ]; then
    echo ""
    echo "=== MISSING COLUMNS: $MISSING_COLS ==="
    echo "Run the full migration to add them."
    exit 1
fi

# Show current state
echo ""
echo "=== Current data ==="
echo "Tenants:"
psql $DB -c "SELECT id, slug, name, status, cad_port FROM tenants"

echo ""
echo "Master admins:"
psql $DB -c "SELECT id, email, name, role, active FROM master_admins"

echo ""
echo "System config:"
psql $DB -c "SELECT key, value FROM system_config"

echo ""
echo "=== Schema verification complete ==="
