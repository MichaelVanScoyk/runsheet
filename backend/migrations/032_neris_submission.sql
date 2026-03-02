-- Migration 032: NERIS submission fields
-- Adds PSAP timestamps required by NERIS dispatch payload
-- and NERIS settings for API credentials

-- ============================================================================
-- PSAP TIMESTAMPS
-- NERIS requires: call_arrival <= call_answered <= call_create
-- call_create maps to our existing time_dispatched
-- call_arrival and call_answered are PSAP-side timestamps we don't have yet
-- Per tenant CAD parser profile, these are either real data from PSAP
-- or derived upstream from earliest CAD event with conservative offsets.
-- The payload builder just reads whatever is in the DB.
-- ============================================================================

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS psap_call_arrival TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS psap_call_answered TIMESTAMP WITH TIME ZONE;

-- ============================================================================
-- NERIS SETTINGS
-- Stored per-tenant in the settings table
-- client_id and client_secret come from NERIS vendor enrollment
-- department_neris_id is the FD identifier assigned by NERIS
-- environment controls test vs production API endpoint
-- ============================================================================

INSERT INTO settings (category, key, value, value_type, description)
VALUES 
  ('neris', 'department_neris_id', NULL, 'string', 'NERIS department identifier (e.g. FD09190828)'),
  ('neris', 'client_id', NULL, 'string', 'NERIS API OAuth2 client ID (UUID)'),
  ('neris', 'client_secret', NULL, 'string', 'NERIS API OAuth2 client secret'),
  ('neris', 'environment', 'test', 'string', 'NERIS API environment: test or production')
ON CONFLICT DO NOTHING;
