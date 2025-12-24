"""
Migration 001: Unit Management Refactor

Unifies station_units setting with apparatus table, adds unit categories
for controlling response time metrics.

BACKUP: Creates JSON backup before any changes
ROLLBACK: Can restore to pre-migration state

Usage:
    python 001_unit_management_refactor.py backup     # Create backup only
    python 001_unit_management_refactor.py migrate    # Run migration
    python 001_unit_management_refactor.py rollback   # Restore from backup
    python 001_unit_management_refactor.py status     # Check current state
"""

import sys
import json
import os
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = "dbname=runsheet_db"
BACKUP_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_FILE = os.path.join(BACKUP_DIR, "001_backup_unit_management.json")


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def backup():
    """Create full backup of apparatus table and station_units setting"""
    print("=" * 60)
    print("CREATING BACKUP")
    print("=" * 60)
    
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    backup_data = {
        'created_at': datetime.now().isoformat(),
        'migration': '001_unit_management_refactor',
        'apparatus': [],
        'station_units_setting': None,
        'schema': {}
    }
    
    # Backup apparatus table - all rows
    print("Backing up apparatus table...")
    cur.execute("SELECT * FROM apparatus ORDER BY id")
    backup_data['apparatus'] = [dict(row) for row in cur.fetchall()]
    print(f"  → {len(backup_data['apparatus'])} rows")
    
    # Backup station_units setting
    print("Backing up station_units setting...")
    cur.execute("""
        SELECT * FROM settings 
        WHERE category = 'units' AND key = 'station_units'
    """)
    row = cur.fetchone()
    if row:
        backup_data['station_units_setting'] = dict(row)
        print(f"  → Found: {row['value']}")
    else:
        print("  → Not found (will create)")
    
    # Backup current schema (column names and types)
    print("Backing up schema...")
    cur.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'apparatus'
        ORDER BY ordinal_position
    """)
    backup_data['schema']['apparatus_columns'] = [dict(row) for row in cur.fetchall()]
    print(f"  → {len(backup_data['schema']['apparatus_columns'])} columns")
    
    conn.close()
    
    # Write backup
    with open(BACKUP_FILE, 'w') as f:
        json.dump(backup_data, f, indent=2, default=str)
    
    print(f"\n✓ Backup saved to: {BACKUP_FILE}")
    print(f"  Size: {os.path.getsize(BACKUP_FILE)} bytes")
    
    return backup_data


def check_migration_status():
    """Check if migration has been applied"""
    conn = get_connection()
    cur = conn.cursor()
    
    # Check for new columns
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'apparatus' AND column_name = 'unit_category'
    """)
    has_category = cur.fetchone() is not None
    
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'apparatus' AND column_name = 'counts_for_response_times'
    """)
    has_response_times = cur.fetchone() is not None
    
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'apparatus' AND column_name = 'cad_unit_id'
    """)
    has_cad_unit_id = cur.fetchone() is not None
    
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'apparatus' AND column_name = 'is_virtual'
    """)
    has_is_virtual = cur.fetchone() is not None
    
    conn.close()
    
    return {
        'has_unit_category': has_category,
        'has_counts_for_response_times': has_response_times,
        'has_cad_unit_id': has_cad_unit_id,
        'has_is_virtual': has_is_virtual,
        'migration_applied': has_category and has_response_times and has_cad_unit_id,
        'fully_migrated': has_category and has_response_times and has_cad_unit_id and not has_is_virtual
    }


def status():
    """Show current migration status"""
    print("=" * 60)
    print("MIGRATION STATUS")
    print("=" * 60)
    
    status = check_migration_status()
    
    print(f"\nColumn Status:")
    print(f"  unit_category:            {'✓' if status['has_unit_category'] else '✗'}")
    print(f"  counts_for_response_times: {'✓' if status['has_counts_for_response_times'] else '✗'}")
    print(f"  cad_unit_id:              {'✓' if status['has_cad_unit_id'] else '✗'}")
    print(f"  is_virtual (legacy):      {'✓ (still exists)' if status['has_is_virtual'] else '✗ (removed)'}")
    
    print(f"\nOverall:")
    if status['fully_migrated']:
        print("  ✓ Migration COMPLETE (is_virtual removed)")
    elif status['migration_applied']:
        print("  ⚠ Migration APPLIED (is_virtual still exists for compatibility)")
    else:
        print("  ✗ Migration NOT APPLIED")
    
    # Show current data
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    print(f"\nCurrent Apparatus Table:")
    if status['has_unit_category']:
        cur.execute("""
            SELECT unit_designator, name, unit_category, counts_for_response_times, 
                   cad_unit_id, is_virtual, active
            FROM apparatus ORDER BY display_order
        """)
    else:
        cur.execute("""
            SELECT unit_designator, name, is_virtual, active
            FROM apparatus ORDER BY display_order
        """)
    
    rows = cur.fetchall()
    for row in rows:
        print(f"  {row}")
    
    # Show station_units setting
    cur.execute("""
        SELECT value FROM settings 
        WHERE category = 'units' AND key = 'station_units'
    """)
    row = cur.fetchone()
    if row:
        print(f"\nstation_units setting: {row['value']}")
    
    conn.close()
    
    # Check backup
    if os.path.exists(BACKUP_FILE):
        with open(BACKUP_FILE, 'r') as f:
            backup = json.load(f)
        print(f"\n✓ Backup exists: {BACKUP_FILE}")
        print(f"  Created: {backup.get('created_at', 'unknown')}")
        print(f"  Apparatus rows: {len(backup.get('apparatus', []))}")
    else:
        print(f"\n✗ No backup found at: {BACKUP_FILE}")
    
    return status


def migrate():
    """Run the migration"""
    print("=" * 60)
    print("RUNNING MIGRATION: Unit Management Refactor")
    print("=" * 60)
    
    # Check if already applied
    current_status = check_migration_status()
    if current_status['migration_applied']:
        print("\n⚠ Migration already applied!")
        print("  Use 'status' to see current state")
        print("  Use 'rollback' to revert if needed")
        return False
    
    # Create backup first
    if not os.path.exists(BACKUP_FILE):
        backup()
    else:
        print(f"\n✓ Using existing backup: {BACKUP_FILE}")
    
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        print("\n--- Step 1: Add new columns ---")
        
        # Add unit_category column
        print("  Adding unit_category column...")
        cur.execute("""
            ALTER TABLE apparatus 
            ADD COLUMN IF NOT EXISTS unit_category VARCHAR(20) NOT NULL DEFAULT 'APPARATUS'
        """)
        
        # Add counts_for_response_times column
        print("  Adding counts_for_response_times column...")
        cur.execute("""
            ALTER TABLE apparatus 
            ADD COLUMN IF NOT EXISTS counts_for_response_times BOOLEAN DEFAULT TRUE
        """)
        
        # Add cad_unit_id column
        print("  Adding cad_unit_id column...")
        cur.execute("""
            ALTER TABLE apparatus 
            ADD COLUMN IF NOT EXISTS cad_unit_id VARCHAR(20)
        """)
        
        print("\n--- Step 2: Migrate existing data ---")
        
        # Migrate is_virtual=true to DIRECT or STANDBY category
        print("  Converting virtual units to categories...")
        cur.execute("""
            UPDATE apparatus SET unit_category = 'DIRECT'
            WHERE is_virtual = true AND UPPER(name) LIKE '%DIRECT%'
        """)
        direct_count = cur.rowcount
        print(f"    → {direct_count} units set to DIRECT")
        
        cur.execute("""
            UPDATE apparatus SET unit_category = 'STANDBY'
            WHERE is_virtual = true AND UPPER(name) LIKE '%STATION%'
        """)
        standby_count = cur.rowcount
        print(f"    → {standby_count} units set to STANDBY")
        
        # Any remaining virtual units default to DIRECT
        cur.execute("""
            UPDATE apparatus SET unit_category = 'DIRECT'
            WHERE is_virtual = true AND unit_category = 'APPARATUS'
        """)
        other_virtual = cur.rowcount
        if other_virtual:
            print(f"    → {other_virtual} other virtual units set to DIRECT")
        
        # Non-virtual units stay as APPARATUS (already default)
        print("  Physical units remain as APPARATUS category")
        
        print("\n--- Step 3: Set response time defaults ---")
        
        # APPARATUS: counts by default
        cur.execute("""
            UPDATE apparatus SET counts_for_response_times = true
            WHERE unit_category = 'APPARATUS'
        """)
        print(f"    → APPARATUS units: counts_for_response_times = true")
        
        # COMMAND: doesn't count by default (we'll set these manually next)
        # DIRECT/STANDBY: never counts
        cur.execute("""
            UPDATE apparatus SET counts_for_response_times = false
            WHERE unit_category IN ('DIRECT', 'STANDBY')
        """)
        print(f"    → DIRECT/STANDBY units: counts_for_response_times = false")
        
        print("\n--- Step 4: Populate cad_unit_id ---")
        cur.execute("""
            UPDATE apparatus SET cad_unit_id = unit_designator
            WHERE cad_unit_id IS NULL
        """)
        print(f"    → Set cad_unit_id = unit_designator for all units")
        
        print("\n--- Step 5: Import station_units into apparatus table ---")
        
        # Get current station_units from settings
        cur.execute("""
            SELECT value FROM settings 
            WHERE category = 'units' AND key = 'station_units'
        """)
        row = cur.fetchone()
        
        if row and row['value']:
            try:
                station_units = json.loads(row['value'])
                print(f"  Found station_units: {station_units}")
                
                # Get existing unit_designators
                cur.execute("SELECT unit_designator FROM apparatus")
                existing_units = {r['unit_designator'].upper() for r in cur.fetchall()}
                
                # Find units in station_units that aren't in apparatus
                # These are likely command units (CHF48, ASST48, etc.)
                new_units = []
                for unit_id in station_units:
                    if unit_id.upper() not in existing_units:
                        new_units.append(unit_id.upper())
                
                if new_units:
                    print(f"  Adding missing units as COMMAND: {new_units}")
                    for unit_id in new_units:
                        # Determine display name
                        if 'CHF' in unit_id.upper():
                            name = f"Chief {unit_id[-2:]}"
                        elif 'ASST' in unit_id.upper():
                            name = f"Asst Chief {unit_id[-2:]}"
                        elif 'DEP' in unit_id.upper():
                            name = f"Deputy {unit_id[-2:]}"
                        elif 'CMD' in unit_id.upper():
                            name = f"Command {unit_id[-2:]}"
                        elif 'OFC' in unit_id.upper():
                            name = f"Officer {unit_id[-2:]}"
                        else:
                            name = unit_id
                        
                        cur.execute("""
                            INSERT INTO apparatus (
                                unit_designator, name, apparatus_type,
                                unit_category, counts_for_response_times,
                                cad_unit_id, is_virtual,
                                has_driver, has_officer, ff_slots,
                                display_order, active
                            ) VALUES (
                                %s, %s, 'Command',
                                'COMMAND', false,
                                %s, false,
                                true, false, 0,
                                50, true
                            )
                        """, (unit_id, name, unit_id))
                        print(f"    → Added: {unit_id} ({name})")
                else:
                    print("  All station_units already exist in apparatus table")
                    
            except json.JSONDecodeError:
                print(f"  ⚠ Could not parse station_units: {row['value']}")
        else:
            print("  No station_units setting found")
        
        # Commit all changes
        conn.commit()
        print("\n✓ Migration complete!")
        print("\nNote: is_virtual column preserved for backward compatibility.")
        print("      Run with 'finalize' after verifying everything works to remove it.")
        
        return True
        
    except Exception as e:
        conn.rollback()
        print(f"\n✗ Migration failed: {e}")
        print("  No changes were made.")
        raise
    finally:
        conn.close()


def rollback():
    """Restore from backup"""
    print("=" * 60)
    print("ROLLING BACK MIGRATION")
    print("=" * 60)
    
    if not os.path.exists(BACKUP_FILE):
        print(f"\n✗ No backup found at: {BACKUP_FILE}")
        print("  Cannot rollback without backup!")
        return False
    
    # Load backup
    with open(BACKUP_FILE, 'r') as f:
        backup_data = json.load(f)
    
    print(f"\nBackup from: {backup_data.get('created_at', 'unknown')}")
    print(f"Apparatus rows: {len(backup_data.get('apparatus', []))}")
    
    confirm = input("\n⚠ This will RESTORE the apparatus table to backup state.\n  Type 'yes' to confirm: ")
    if confirm.lower() != 'yes':
        print("Rollback cancelled.")
        return False
    
    conn = get_connection()
    cur = conn.cursor()
    
    try:
        print("\n--- Step 1: Remove new columns (if exist) ---")
        
        # Drop new columns if they exist
        for col in ['unit_category', 'counts_for_response_times', 'cad_unit_id']:
            try:
                cur.execute(f"ALTER TABLE apparatus DROP COLUMN IF EXISTS {col}")
                print(f"  Dropped column: {col}")
            except Exception as e:
                print(f"  Column {col} not found or error: {e}")
        
        print("\n--- Step 2: Restore apparatus data ---")
        
        # Clear table and restore
        cur.execute("DELETE FROM apparatus")
        print(f"  Cleared apparatus table")
        
        # Get original columns from backup
        original_columns = [c['column_name'] for c in backup_data['schema']['apparatus_columns']]
        # Filter to only columns that exist in backup data
        if backup_data['apparatus']:
            available_columns = [c for c in original_columns if c in backup_data['apparatus'][0]]
        else:
            available_columns = original_columns
        
        # Restore each row
        for row in backup_data['apparatus']:
            # Build INSERT for available columns
            cols = [c for c in available_columns if c in row and c != 'id']
            placeholders = ', '.join(['%s'] * len(cols))
            col_names = ', '.join(cols)
            values = [row[c] for c in cols]
            
            # Include id explicitly for identity preservation
            if 'id' in row:
                cur.execute(f"""
                    INSERT INTO apparatus (id, {col_names})
                    VALUES (%s, {placeholders})
                """, [row['id']] + values)
            else:
                cur.execute(f"""
                    INSERT INTO apparatus ({col_names})
                    VALUES ({placeholders})
                """, values)
        
        print(f"  Restored {len(backup_data['apparatus'])} rows")
        
        # Reset sequence
        cur.execute("""
            SELECT setval(pg_get_serial_sequence('apparatus', 'id'), 
                          COALESCE((SELECT MAX(id) FROM apparatus), 1))
        """)
        print("  Reset ID sequence")
        
        conn.commit()
        print("\n✓ Rollback complete!")
        print("  Database restored to pre-migration state.")
        
        return True
        
    except Exception as e:
        conn.rollback()
        print(f"\n✗ Rollback failed: {e}")
        raise
    finally:
        conn.close()


def finalize():
    """Remove is_virtual column after confirming migration works"""
    print("=" * 60)
    print("FINALIZING MIGRATION")
    print("=" * 60)
    
    current_status = check_migration_status()
    
    if not current_status['migration_applied']:
        print("\n✗ Migration not applied yet. Run 'migrate' first.")
        return False
    
    if not current_status['has_is_virtual']:
        print("\n✓ Already finalized (is_virtual already removed)")
        return True
    
    confirm = input("\n⚠ This will REMOVE the is_virtual column permanently.\n  Type 'yes' to confirm: ")
    if confirm.lower() != 'yes':
        print("Finalize cancelled.")
        return False
    
    conn = get_connection()
    cur = conn.cursor()
    
    try:
        cur.execute("ALTER TABLE apparatus DROP COLUMN is_virtual")
        conn.commit()
        print("\n✓ Removed is_virtual column")
        print("  Migration fully complete!")
        return True
    except Exception as e:
        conn.rollback()
        print(f"\n✗ Failed to remove column: {e}")
        raise
    finally:
        conn.close()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    
    command = sys.argv[1].lower()
    
    if command == 'backup':
        backup()
    elif command == 'migrate':
        migrate()
    elif command == 'rollback':
        rollback()
    elif command == 'status':
        status()
    elif command == 'finalize':
        finalize()
    else:
        print(f"Unknown command: {command}")
        print(__doc__)


if __name__ == '__main__':
    main()
