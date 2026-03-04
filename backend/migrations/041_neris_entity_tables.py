"""
Migration 041: NERIS Entity Tables

Creates three tables to store the NERIS Entity profile per the NERIS spec:
  - neris_entity   : department-level Entity (one per tenant)
  - neris_stations : stations within the Entity (one or more per Entity)
  - neris_units    : units within a station (one or more per station)

NERIS terminology:
  Entity     = the fire department organizational profile (fd_neris_id)
  Station    = physical station, identified by station_id (e.g. FD42029593S001)
  Unit       = apparatus at a station, station_unit_id_1 MUST match CAD exactly

This replaces the flat settings-based approach (station_name, station_address_line1,
etc.) and the incorrect apparatus.neris_unit_id column.

Usage:
    python 041_neris_entity_tables.py migrate    -- create tables
    python 041_neris_entity_tables.py rollback   -- drop tables
    python 041_neris_entity_tables.py status     -- check if tables exist
"""

import sys
import psycopg2

DATABASE_URL = "postgresql://dashboard:dashboard@localhost:6432/runsheet_db"


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def status():
    print("=" * 60)
    print("Migration 041 -- NERIS Entity Tables -- STATUS")
    print("=" * 60)
    conn = get_connection()
    cur = conn.cursor()
    tables = ["neris_entity", "neris_stations", "neris_units"]
    for table in tables:
        cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = %s AND table_schema = 'public'
            )
        """, (table,))
        exists = cur.fetchone()[0]
        print(f"  {'OK' if exists else 'MISSING'} {table}")
    conn.close()


def migrate():
    print("=" * 60)
    print("Migration 041 -- NERIS Entity Tables -- MIGRATE")
    print("=" * 60)

    conn = get_connection()
    cur = conn.cursor()

    print("Creating neris_entity...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS neris_entity (
            id                              SERIAL PRIMARY KEY,

            -- NERIS Entity Identification
            fd_neris_id                     TEXT,
            fd_name                         TEXT,
            fd_id_legacy                    TEXT,

            -- Entity Address
            fd_address_1                    TEXT,
            fd_address_2                    TEXT,
            fd_city                         TEXT,
            fd_state                        TEXT,
            fd_zip                          TEXT,
            fd_point_lat                    NUMERIC,
            fd_point_lng                    NUMERIC,

            -- Contact
            fd_telephone                    TEXT,
            fd_website                      TEXT,

            -- Classification
            fd_type                         TEXT,
            fd_entity                       TEXT,
            fd_population_protected         INTEGER,
            fd_station_count                INTEGER,

            -- Services (arrays of NERIS enum values)
            fd_fire_services                TEXT[],
            fd_ems_services                 TEXT[],
            fd_investigation_services       TEXT[],

            -- Dispatch / PSAP configuration
            dispatch_center_id              TEXT,
            dispatch_cad_software           TEXT,
            rms_software                    TEXT DEFAULT 'CADReport',
            dispatch_avl_usage              BOOLEAN DEFAULT FALSE,
            dispatch_psap_capability        TEXT,
            dispatch_psap_discipline        TEXT,
            dispatch_psap_jurisdiction      TEXT,
            dispatch_psap_type              TEXT,
            dispatch_protocol_fire          TEXT,
            dispatch_protocol_medical       TEXT,

            -- Operations
            fd_shift_duration               INTEGER,
            fd_shift_count                  INTEGER,

            -- Staffing totals
            staff_total                     INTEGER,
            staff_active_ff_volunteer       INTEGER,
            staff_active_ff_career_ft       INTEGER,
            staff_active_ff_career_pt       INTEGER,
            staff_active_ems_only_volunteer INTEGER,
            staff_active_ems_only_career_ft INTEGER,
            staff_active_ems_only_career_pt INTEGER,
            staff_active_civilians_career_ft INTEGER,
            staff_active_civilians_career_pt INTEGER,
            staff_active_civilians_volunteer INTEGER,

            -- Accreditation
            assess_iso_rating               INTEGER,

            -- NERIS submission tracking
            neris_entity_submitted_at       TIMESTAMPTZ,
            neris_entity_status             TEXT DEFAULT 'draft',
            neris_annual_renewal_month      INTEGER DEFAULT 1,

            created_at                      TIMESTAMPTZ DEFAULT NOW(),
            updated_at                      TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    print("  OK neris_entity")

    print("Creating neris_stations...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS neris_stations (
            id                  SERIAL PRIMARY KEY,
            entity_id           INTEGER NOT NULL REFERENCES neris_entity(id) ON DELETE CASCADE,

            station_id          TEXT,
            station_name        TEXT,
            station_address_1   TEXT,
            station_address_2   TEXT,
            station_city        TEXT,
            station_state       TEXT,
            station_zip         TEXT,
            station_point_lat   NUMERIC,
            station_point_lng   NUMERIC,
            station_staffing    INTEGER,

            display_order       INTEGER DEFAULT 0,
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    print("  OK neris_stations")

    print("Creating neris_units...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS neris_units (
            id                      SERIAL PRIMARY KEY,
            station_id              INTEGER NOT NULL REFERENCES neris_stations(id) ON DELETE CASCADE,

            -- station_unit_id_1 MUST match apparatus.unit_designator / CAD unit ID exactly
            -- Used as unit_id_linked in all incident payload submissions
            station_unit_id_1       TEXT,
            station_unit_id_2       TEXT,

            station_unit_capability TEXT,
            station_unit_staffing   INTEGER,
            station_unit_dedicated  BOOLEAN DEFAULT FALSE,

            apparatus_id            INTEGER REFERENCES apparatus(id) ON DELETE SET NULL,

            display_order           INTEGER DEFAULT 0,
            created_at              TIMESTAMPTZ DEFAULT NOW(),
            updated_at              TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    print("  OK neris_units")

    print("Creating indexes...")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_neris_entity_fd_neris_id ON neris_entity(fd_neris_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_neris_stations_entity_id ON neris_stations(entity_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_neris_units_station_id ON neris_units(station_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_neris_units_apparatus_id ON neris_units(apparatus_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_neris_units_unit_id_1 ON neris_units(station_unit_id_1)")
    print("  OK indexes")

    conn.commit()
    conn.close()
    print()
    print("Migration 041 complete.")
    status()


def rollback():
    print("=" * 60)
    print("Migration 041 -- NERIS Entity Tables -- ROLLBACK")
    print("=" * 60)
    print("WARNING: This will drop neris_entity, neris_stations, neris_units and ALL data.")
    confirm = input("Type YES to confirm: ")
    if confirm != "YES":
        print("Aborted.")
        return

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS neris_units CASCADE")
    print("  OK neris_units dropped")
    cur.execute("DROP TABLE IF EXISTS neris_stations CASCADE")
    print("  OK neris_stations dropped")
    cur.execute("DROP TABLE IF EXISTS neris_entity CASCADE")
    print("  OK neris_entity dropped")
    conn.commit()
    conn.close()
    print("Rollback complete.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python 041_neris_entity_tables.py [migrate|rollback|status]")
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
