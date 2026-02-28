-- =============================================================================
-- Migration: Mutual Aid Departments & Units for NERIS Integration
-- Run AFTER taking a full database backup with scripts/db_backup.sh
-- =============================================================================

-- 1. Create neris_mutual_aid_departments
--    Source of truth for departments this tenant works with.
--    Populated via NERIS API import or manual admin entry.
--    Independent from map_features layer 15 (GIS fire stations).
--    Works for all tenants regardless of NERIS toggle — neris_entity_id is nullable.

CREATE TABLE IF NOT EXISTS neris_mutual_aid_departments (
    id                  SERIAL PRIMARY KEY,
    neris_entity_id     VARCHAR(10) UNIQUE,         -- FD42029127 (nullable when NERIS disabled)
    name                TEXT NOT NULL,               -- "East Brandywine Fire Company"
    station_number      VARCHAR(10),                -- "49" — for display and CAD matching
    address             TEXT,
    city                TEXT,
    state               VARCHAR(2),
    zip_code            VARCHAR(10),
    department_type     TEXT,                       -- VOLUNTEER, CAREER, etc.
    import_source       TEXT DEFAULT 'manual',      -- 'neris_api' or 'manual'
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nmad_station_number ON neris_mutual_aid_departments(station_number);
CREATE INDEX IF NOT EXISTS idx_nmad_neris_entity_id ON neris_mutual_aid_departments(neris_entity_id);


-- 2. Create neris_mutual_aid_units
--    Per-department apparatus. Admin-configured.
--    neris_unit_type references neris_codes table (category = 'type_unit').

CREATE TABLE IF NOT EXISTS neris_mutual_aid_units (
    id                  SERIAL PRIMARY KEY,
    department_id       INTEGER NOT NULL REFERENCES neris_mutual_aid_departments(id) ON DELETE CASCADE,
    unit_designator     VARCHAR(20) NOT NULL,       -- "E49", "L49", "T49"
    neris_unit_type     TEXT,                       -- From neris_codes where category = 'type_unit'
    cad_prefix          VARCHAR(20),                -- What shows up in CAD data for auto-matching
    neris_unit_id       TEXT,                       -- Future: if NERIS grants cross-entity unit access
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nmau_department_id ON neris_mutual_aid_units(department_id);
CREATE INDEX IF NOT EXISTS idx_nmau_cad_prefix ON neris_mutual_aid_units(cad_prefix);


-- 3. Add new incident columns for NERIS mutual aid submission
--    neris_aid_entity_ids: array of NERIS Entity IDs for departments involved
--    neris_nonfd_aids: array of non-fire aid categories (LAW_ENFORCEMENT, EMS, etc.)

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_aid_entity_ids TEXT[];
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_nonfd_aids TEXT[];


-- 4. Drop unused mutual_aid_stations table (empty, 0 rows, dead code)

DROP TABLE IF EXISTS mutual_aid_stations;
