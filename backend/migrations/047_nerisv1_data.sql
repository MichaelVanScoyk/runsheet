-- Migration 047: Add nerisv1_data JSONB to incidents
-- Overflow storage for NERIS field values that have NO mapping to existing DB columns.
-- Mapped fields read/write to their original source columns via neris_field_mapping.
-- Only unmapped NERIS-specific fields (e.g. smoke_alarm.presence.type) live here.

BEGIN;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS nerisv1_data JSONB;

COMMENT ON COLUMN incidents.nerisv1_data IS 'Overflow storage for NERIS fields with no mapping to existing DB columns. Keyed by NERIS field path.';

COMMIT;
