-- Migration 014: Add early entry setting for incident modal
-- Allows showing unit assignments and narrative fields before CAD CLEAR arrives
--
-- Run: sudo -u postgres psql runsheet_db < backend/migrations/014_early_entry_setting.sql

-- Add the setting (idempotent - won't fail if exists)
INSERT INTO settings (category, key, value, value_type, description)
VALUES (
    'incident_modal',
    'enable_early_entry',
    'false',
    'boolean',
    'When enabled, shows unit assignments and narrative fields in the incident modal even before CAD CLEAR arrives. Toggle persists until CAD CLEAR is received.'
)
ON CONFLICT DO NOTHING;

-- Verify
SELECT category, key, value, value_type, description 
FROM settings 
WHERE category = 'incident_modal' AND key = 'enable_early_entry';
