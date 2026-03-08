-- Migration 046: NERIS Field Mapping Config Table
-- Alias registry: "NERIS field X reads from DB column Y"
-- Both sides discovered dynamically — DB via information_schema, NERIS via spec.
-- Supports fan-in (multiple sources → one NERIS field with priority),
-- fan-out (one source → multiple NERIS fields), and transforms.

BEGIN;

CREATE TABLE IF NOT EXISTS neris_field_mapping (
    id SERIAL PRIMARY KEY,

    -- NERIS side (right panel in config UI)
    neris_section INTEGER NOT NULL,                -- Section 1-23
    neris_field_path TEXT NOT NULL,                 -- e.g. "base.impediment_narrative"
    neris_type TEXT,                                -- string, integer, boolean, datetime, enum, object, array
    neris_required BOOLEAN DEFAULT FALSE,

    -- Source side (left panel in config UI)
    source_table TEXT,                              -- e.g. "incidents", "incident_units"
    source_column TEXT,                             -- e.g. "problems_issues", "latitude,longitude"

    -- Transform
    transform TEXT NOT NULL DEFAULT 'direct',       -- direct, timestamp_iso, geo_point, json_extract, row_per_entry, lookup, address_parse, enum_map
    transform_params JSONB,                         -- Transform-specific config (json_path, regex, lookup_table, etc.)

    -- Priority for fan-in (multiple sources → one NERIS field)
    priority INTEGER NOT NULL DEFAULT 1,            -- 1 = primary, 2 = first fallback, etc.

    -- Metadata
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- One mapping per NERIS field + priority level
    UNIQUE(neris_field_path, priority)
);

CREATE INDEX IF NOT EXISTS idx_nfm_section ON neris_field_mapping(neris_section);
CREATE INDEX IF NOT EXISTS idx_nfm_neris_path ON neris_field_mapping(neris_field_path);
CREATE INDEX IF NOT EXISTS idx_nfm_source ON neris_field_mapping(source_table, source_column);
CREATE INDEX IF NOT EXISTS idx_nfm_active ON neris_field_mapping(is_active) WHERE is_active = TRUE;

-- Track columns created through the mapping UI (for audit)
CREATE TABLE IF NOT EXISTS neris_field_mapping_columns_log (
    id SERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    column_type TEXT NOT NULL,
    created_by TEXT DEFAULT 'mapping_ui',
    neris_field_hint TEXT,                          -- Which NERIS field prompted the creation
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMIT;
