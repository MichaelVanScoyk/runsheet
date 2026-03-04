"""
Migration 043: Remove Redundant NERIS Settings Keys

Removes flat settings-based NERIS station fields that are now stored in
neris_entity/neris_stations/neris_units tables.

Also removes apparatus.neris_unit_id column (wrong concept — unit identity
in NERIS is station_unit_id_1 which maps to apparatus.unit_designator).

IMPORTANT: Run this ONLY after:
  - Migration 041 (tables created)
  - Migration 042 (Glen Moore data seeded)
  - Phase 4 backend endpoints deployed (neris_submit.py reads from neris_entity)

Settings keys removed (category=neris):
  station_neris_id, station_name, station_address_line1,
  station_city, station_state, station_zip

Settings keys KEPT (category=neris):
  client_id, client_secret, environment, submission_enabled,
  auto_generate_neris_id, department_neris_id (kept until neris_submit.py updated),
  fd_name (kept until neris_submit.py updated)

Usage:
    python 043_neris_settings_cleanup.py migrate    -- remove old keys
    python 043_neris_settings_cleanup.py rollback   -- not supported (data gone)
    python 043_neris_settings_cleanup.py status     -- show what would be removed
"""

import sys
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = "postgresql://dashboard:dashboard@localhost:6432/runsheet_db"

# Settings keys to remove from category='neris'
SETTINGS_TO_REMOVE = [
    "station_neris_id",
    "station_name",
    "station_address_line1",
    "station_city",
    "station_state",
    "station_zip",
    # These two removed once neris_submit.py is confirmed reading from neris_entity:
    "department_neris_id",
    "fd_name",
]


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def status():
    print("=" * 60)
    print("Migration 043 -- NERIS Settings Cleanup -- STATUS")
    print("=" * 60)
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    print("Settings keys that would be removed (category=neris):")
    for key in SETTINGS_TO_REMOVE:
        cur.execute(
            "SELECT value FROM settings WHERE category = 'neris' AND key = %s",
            (key,)
        )
        row = cur.fetchone()
        if row:
            val = row['value']
            display = (val[:40] + '...') if val and len(val) > 40 else val
            print(f"  EXISTS  neris.{key} = {display!r}")
        else:
            print(f"  MISSING neris.{key} (already gone)")

    print()
    print("apparatus.neris_unit_id column:")
    cur.execute("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'apparatus' AND column_name = 'neris_unit_id'
        )
    """)
    exists = cur.fetchone()['exists']
    print(f"  {'EXISTS — will be removed' if exists else 'MISSING (already gone)'}")

    conn.close()


def migrate():
    print("=" * 60)
    print("Migration 043 -- NERIS Settings Cleanup -- MIGRATE")
    print("=" * 60)

    # Safety check: verify neris_entity has data before removing settings
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("SELECT COUNT(*) as cnt FROM neris_entity")
    entity_count = cur.fetchone()['cnt']
    if entity_count == 0:
        print("ERROR: neris_entity table is empty.")
        print("       Run migration 042 first to seed entity data before removing settings.")
        conn.close()
        sys.exit(1)

    cur.execute("SELECT COUNT(*) as cnt FROM neris_stations")
    station_count = cur.fetchone()['cnt']
    if station_count == 0:
        print("ERROR: neris_stations table is empty.")
        print("       Run migration 042 first to seed station data before removing settings.")
        conn.close()
        sys.exit(1)

    print(f"  Safety check passed: {entity_count} entity row(s), {station_count} station row(s)")

    # ------------------------------------------------------------------
    # Remove redundant settings keys
    # ------------------------------------------------------------------
    print("Removing redundant settings keys...")
    removed = 0
    for key in SETTINGS_TO_REMOVE:
        cur.execute(
            "DELETE FROM settings WHERE category = 'neris' AND key = %s RETURNING id",
            (key,)
        )
        row = cur.fetchone()
        if row:
            print(f"  OK removed neris.{key}")
            removed += 1
        else:
            print(f"  SKIP neris.{key} (not found)")

    # ------------------------------------------------------------------
    # Remove apparatus.neris_unit_id column
    # ------------------------------------------------------------------
    cur.execute("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'apparatus' AND column_name = 'neris_unit_id'
        )
    """)
    col_exists = cur.fetchone()['exists']

    if col_exists:
        print("Removing apparatus.neris_unit_id column...")
        cur.execute("ALTER TABLE apparatus DROP COLUMN neris_unit_id")
        print("  OK apparatus.neris_unit_id dropped")
    else:
        print("  SKIP apparatus.neris_unit_id (column not found)")

    conn.commit()
    conn.close()

    print()
    print(f"Migration 043 complete. Removed {removed} settings key(s).")
    status()


def rollback():
    print("=" * 60)
    print("Migration 043 -- NERIS Settings Cleanup -- ROLLBACK")
    print("=" * 60)
    print("NOTE: Rollback is not supported for this migration.")
    print("      The removed settings keys are now stored in neris_entity/neris_stations.")
    print("      To restore old settings manually, re-add them via the settings API or psql.")
    print("      To restore apparatus.neris_unit_id, run:")
    print("        ALTER TABLE apparatus ADD COLUMN neris_unit_id TEXT;")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python 043_neris_settings_cleanup.py [migrate|rollback|status]")
        sys.exit(1)
    cmd = sys.argv[1].lower()
    if cmd == "migrate":
        migrate()
    elif cmd == "rollback":
        rollback()
    elif cmd == "status":
        status()
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
