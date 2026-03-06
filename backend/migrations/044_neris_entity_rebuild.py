"""
Migration 044: NERIS Entity Tables Rebuild

Drops and recreates neris_entity, neris_stations, neris_units with column names
that map 1:1 to the NERIS API spec (api.neris.fsri.org/v1/openapi.json v1.4.35).

Also drops apparatus.neris_unit_type — old placeholder column replaced by
neris_units.type which maps directly to TypeUnitValue in the spec.

Truth source: https://api.neris.fsri.org/v1/openapi.json
No secondary sources. No invented field names.

Safe tables — NOT touched by this migration:
  incidents, incident_units, incident_personnel, personnel, apparatus (except
  the neris_unit_type column drop), ranks, municipalities, settings, audit_log,
  review_tasks

Usage:
    python 044_neris_entity_rebuild.py migrate    -- rebuild tables
    python 044_neris_entity_rebuild.py rollback   -- restore old 041 schema
    python 044_neris_entity_rebuild.py status     -- check current state
"""

import sys
import psycopg2

# Use direct PostgreSQL port (5432), NOT PgBouncer (6432).
# DDL (DROP/CREATE/ALTER) must not run through a connection pooler.
DATABASE_URL = "postgresql://dashboard:dashboard@localhost:5432/runsheet_db"


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def status():
    print("=" * 60)
    print("Migration 044 -- NERIS Entity Rebuild -- STATUS")
    print("=" * 60)
    conn = get_connection()
    cur = conn.cursor()

    # Check tables exist
    for table in ["neris_entity", "neris_stations", "neris_units"]:
        cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = %s AND table_schema = 'public'
            )
        """, (table,))
        exists = cur.fetchone()[0]
        print(f"  {'OK' if exists else 'MISSING'} {table}")

    # Check apparatus.neris_unit_type is gone
    cur.execute("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'apparatus' AND column_name = 'neris_unit_type'
        )
    """)
    col_exists = cur.fetchone()[0]
    print(f"  {'PRESENT (needs drop)' if col_exists else 'OK (dropped)'} apparatus.neris_unit_type")

    # Spot-check a key column to confirm new schema is in place
    cur.execute("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'neris_entity' AND column_name = 'department_type'
        )
    """)
    new_schema = cur.fetchone()[0]
    print(f"  {'OK new schema' if new_schema else 'OLD schema (department_type missing)'} neris_entity.department_type")

    conn.close()


def migrate():
    print("=" * 60)
    print("Migration 044 -- NERIS Entity Rebuild -- MIGRATE")
    print("=" * 60)
    print()
    print("This will DROP neris_units, neris_stations, neris_entity (CASCADE)")
    print("and recreate them with spec-correct column names.")
    print("Any existing NERIS entity profile data will be lost.")
    print("Incident data (incidents, incident_units, personnel) is NOT affected.")
    print()
    confirm = input("Type YES to continue: ")
    if confirm != "YES":
        print("Aborted.")
        return

    conn = get_connection()
    cur = conn.cursor()

    # ------------------------------------------------------------------ #
    # 1. Drop existing NERIS entity tables (CASCADE handles FK order)
    # ------------------------------------------------------------------ #
    print()
    print("Dropping old tables...")
    cur.execute("DROP TABLE IF EXISTS neris_units CASCADE")
    print("  OK dropped neris_units")
    cur.execute("DROP TABLE IF EXISTS neris_stations CASCADE")
    print("  OK dropped neris_stations")
    cur.execute("DROP TABLE IF EXISTS neris_entity CASCADE")
    print("  OK dropped neris_entity")

    # ------------------------------------------------------------------ #
    # 2. Drop apparatus.neris_unit_type
    #    Old placeholder column — replaced by neris_units.type (TypeUnitValue)
    # ------------------------------------------------------------------ #
    print()
    print("Dropping apparatus.neris_unit_type...")
    cur.execute("""
        ALTER TABLE apparatus
        DROP COLUMN IF EXISTS neris_unit_type
    """)
    print("  OK dropped apparatus.neris_unit_type")

    # ------------------------------------------------------------------ #
    # 3. Create neris_entity
    #    Spec source: DepartmentPayload, PatchDepartmentPayload
    #    Nested objects stored as JSONB:
    #      dispatch   -> DepartmentDispatchPayload
    #      staffing   -> StaffingPayload
    #      assessment -> AssessmentPayload
    #      shift      -> ShiftPayload
    #      population -> PopulationPayload
    # ------------------------------------------------------------------ #
    print()
    print("Creating neris_entity...")
    cur.execute("""
        CREATE TABLE neris_entity (
            id                          SERIAL PRIMARY KEY,

            -- NERIS identifier (used in URL path for API calls, not request body)
            fd_neris_id                 TEXT,

            -- Top-level fields per DepartmentPayload
            name                        TEXT,           -- was fd_name
            internal_id                 TEXT,           -- was fd_id_legacy
            email                       TEXT,
            website                     TEXT,           -- was fd_website
            department_type             TEXT,           -- was fd_type (TypeDeptValue: COMBINATION, CAREER, VOLUNTEER)
            entity_type                 TEXT,           -- was fd_entity (TypeEntityValue)
            rms_software                TEXT DEFAULT 'CADReport',
            time_zone                   TEXT,
            continue_edu                BOOLEAN,
            fips_code                   TEXT,

            -- Physical address
            address_line_1              TEXT,           -- was fd_address_1
            address_line_2              TEXT,           -- was fd_address_2
            city                        TEXT,           -- was fd_city
            state                       TEXT,           -- was fd_state
            zip_code                    TEXT,           -- was fd_zip
            location                    JSONB,          -- { lat, lng } replaces fd_point_lat + fd_point_lng

            -- Mailing address (new — was missing from 041)
            mail_address_line_1         TEXT,
            mail_address_line_2         TEXT,
            mail_city                   TEXT,
            mail_state                  TEXT,
            mail_zip_code               TEXT,

            -- Services arrays (TypeFireServiceValue, TypeEmsServiceValue, etc.)
            fire_services               TEXT[],         -- was fd_fire_services
            ems_services                TEXT[],         -- was fd_ems_services
            investigation_services      TEXT[],         -- was fd_investigation_services

            -- Nested objects stored as JSONB (replaces all flat dispatch_* columns)
            -- Keys: avl_usage, center_id, cad_software, psap_type, psap_capability,
            --       psap_discipline, psap_jurisdiction, protocol_fire, protocol_med
            dispatch                    JSONB,

            -- Nested staffing object (replaces all flat staff_* columns)
            -- Keys: active_firefighters_volunteer, active_firefighters_career_ft,
            --       active_firefighters_career_pt, active_ems_only_career_ft,
            --       active_ems_only_career_pt, active_ems_only_volunteer,
            --       active_civilians_career_ft, active_civilians_career_pt,
            --       active_civilians_volunteer
            staffing                    JSONB,

            -- Nested assessment object (replaces assess_iso_rating)
            -- Keys: iso_rating, cpse_accredited, caas_accredited
            assessment                  JSONB,

            -- Nested shift object (replaces fd_shift_count + fd_shift_duration)
            -- Keys: count, duration, signup
            shift                       JSONB,

            -- Nested population object (replaces fd_population_protected)
            -- Keys: protected, source
            population                  JSONB,

            -- Internal tracking columns (not submitted to NERIS)
            fd_station_count            INTEGER,
            neris_entity_submitted_at   TIMESTAMPTZ,
            neris_entity_status         TEXT DEFAULT 'draft',
            neris_annual_renewal_month  INTEGER DEFAULT 1,

            created_at                  TIMESTAMPTZ DEFAULT NOW(),
            updated_at                  TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    print("  OK neris_entity")

    # ------------------------------------------------------------------ #
    # 4. Create neris_stations
    #    Spec source: StationPayload, CreateStationPayload, PatchStationPayload
    # ------------------------------------------------------------------ #
    print()
    print("Creating neris_stations...")
    cur.execute("""
        CREATE TABLE neris_stations (
            id              SERIAL PRIMARY KEY,
            entity_id       INTEGER NOT NULL REFERENCES neris_entity(id) ON DELETE CASCADE,

            -- NERIS spec fields per StationPayload
            station_id      TEXT,                   -- already correct in 041
            internal_id     TEXT,                   -- new — was missing
            neris_id        TEXT,                   -- new — assigned by NERIS after submission
            address_line_1  TEXT,                   -- was station_address_1
            address_line_2  TEXT,                   -- was station_address_2
            city            TEXT,                   -- was station_city
            state           TEXT,                   -- was station_state
            zip_code        TEXT,                   -- was station_zip
            staffing        INTEGER,                -- was station_staffing
            location        JSONB,                  -- { lat, lng } replaces station_point_lat + station_point_lng

            -- Local display only — not in NERIS spec, kept for UI
            station_name    TEXT,

            -- Internal tracking
            display_order   INTEGER DEFAULT 0,
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    print("  OK neris_stations")

    # ------------------------------------------------------------------ #
    # 5. Create neris_units
    #    Spec source: UnitPayload, CreateUnitPayload, PatchUnitPayload
    #    type column values: TypeUnitValue (49 values, stored in neris_codes table)
    # ------------------------------------------------------------------ #
    print()
    print("Creating neris_units...")
    cur.execute("""
        CREATE TABLE neris_units (
            id                  SERIAL PRIMARY KEY,
            station_id          INTEGER NOT NULL REFERENCES neris_stations(id) ON DELETE CASCADE,

            -- NERIS spec fields per UnitPayload
            cad_designation_1   TEXT,               -- was station_unit_id_1
            cad_designation_2   TEXT,               -- was station_unit_id_2
            type                TEXT,               -- was station_unit_capability (TypeUnitValue)
            staffing            INTEGER,            -- was station_unit_staffing
            dedicated_staffing  BOOLEAN DEFAULT FALSE,  -- was station_unit_dedicated
            neris_id            TEXT,               -- new — assigned by NERIS after submission

            -- Internal FK — not submitted to NERIS
            apparatus_id        INTEGER REFERENCES apparatus(id) ON DELETE SET NULL,

            -- Internal tracking
            display_order       INTEGER DEFAULT 0,
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    print("  OK neris_units")

    # ------------------------------------------------------------------ #
    # 6. Indexes
    # ------------------------------------------------------------------ #
    print()
    print("Creating indexes...")
    cur.execute("CREATE INDEX idx_neris_entity_fd_neris_id ON neris_entity(fd_neris_id)")
    cur.execute("CREATE INDEX idx_neris_stations_entity_id ON neris_stations(entity_id)")
    cur.execute("CREATE INDEX idx_neris_units_station_id ON neris_units(station_id)")
    cur.execute("CREATE INDEX idx_neris_units_apparatus_id ON neris_units(apparatus_id)")
    # cad_designation_1 is the CAD match field — needs an index for incident payload lookups
    cur.execute("CREATE INDEX idx_neris_units_cad_designation_1 ON neris_units(cad_designation_1)")
    print("  OK indexes")

    conn.commit()
    conn.close()
    print()
    print("Migration 044 complete.")
    status()


def rollback():
    """
    Restores the original 041 schema.
    Use this only if you need to undo 044 and go back to the old column names.
    """
    print("=" * 60)
    print("Migration 044 -- NERIS Entity Rebuild -- ROLLBACK")
    print("=" * 60)
    print()
    print("This will DROP the new tables and restore the old 041 schema.")
    print("apparatus.neris_unit_type will NOT be restored (it was a bad column).")
    print()
    confirm = input("Type YES to restore old schema: ")
    if confirm != "YES":
        print("Aborted.")
        return

    conn = get_connection()
    cur = conn.cursor()

    print("Dropping new tables...")
    cur.execute("DROP TABLE IF EXISTS neris_units CASCADE")
    cur.execute("DROP TABLE IF EXISTS neris_stations CASCADE")
    cur.execute("DROP TABLE IF EXISTS neris_entity CASCADE")
    print("  OK dropped")

    print("Restoring old 041 neris_entity schema...")
    cur.execute("""
        CREATE TABLE neris_entity (
            id                              SERIAL PRIMARY KEY,
            fd_neris_id                     TEXT,
            fd_name                         TEXT,
            fd_id_legacy                    TEXT,
            fd_address_1                    TEXT,
            fd_address_2                    TEXT,
            fd_city                         TEXT,
            fd_state                        TEXT,
            fd_zip                          TEXT,
            fd_point_lat                    NUMERIC,
            fd_point_lng                    NUMERIC,
            fd_telephone                    TEXT,
            fd_website                      TEXT,
            fd_type                         TEXT,
            fd_entity                       TEXT,
            fd_population_protected         INTEGER,
            fd_station_count                INTEGER,
            fd_fire_services                TEXT[],
            fd_ems_services                 TEXT[],
            fd_investigation_services       TEXT[],
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
            fd_shift_duration               INTEGER,
            fd_shift_count                  INTEGER,
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
            assess_iso_rating               INTEGER,
            neris_entity_submitted_at       TIMESTAMPTZ,
            neris_entity_status             TEXT DEFAULT 'draft',
            neris_annual_renewal_month      INTEGER DEFAULT 1,
            created_at                      TIMESTAMPTZ DEFAULT NOW(),
            updated_at                      TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    print("  OK neris_entity (old schema)")

    print("Restoring old 041 neris_stations schema...")
    cur.execute("""
        CREATE TABLE neris_stations (
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
    print("  OK neris_stations (old schema)")

    print("Restoring old 041 neris_units schema...")
    cur.execute("""
        CREATE TABLE neris_units (
            id                      SERIAL PRIMARY KEY,
            station_id              INTEGER NOT NULL REFERENCES neris_stations(id) ON DELETE CASCADE,
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
    print("  OK neris_units (old schema)")

    print("Restoring indexes...")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_neris_entity_fd_neris_id ON neris_entity(fd_neris_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_neris_stations_entity_id ON neris_stations(entity_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_neris_units_station_id ON neris_units(station_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_neris_units_apparatus_id ON neris_units(apparatus_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_neris_units_unit_id_1 ON neris_units(station_unit_id_1)")
    print("  OK indexes")

    conn.commit()
    conn.close()
    print()
    print("Rollback complete. Old 041 schema restored.")
    status()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python 044_neris_entity_rebuild.py [migrate|rollback|status]")
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
