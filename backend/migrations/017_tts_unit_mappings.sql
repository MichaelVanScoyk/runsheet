-- Migration 017: TTS Unit Mappings
-- 
-- Stores pronunciation mappings for CAD unit IDs.
-- When a new unit is seen in CAD data, it gets auto-created with needs_review=true.
-- Admins can then configure how it should be spoken by TTS.
--
-- Similar pattern to municipalities auto-creation.
--
-- Run with: sudo -u postgres psql -d runsheet_db -f backend/migrations/017_tts_unit_mappings.sql

-- =============================================================================
-- 1. Create TTS unit mappings table
-- =============================================================================
CREATE TABLE IF NOT EXISTS tts_unit_mappings (
    id SERIAL PRIMARY KEY,
    
    -- The CAD unit ID as it appears in dispatch data (e.g., ENG481, MIC2441, QRS48)
    cad_unit_id VARCHAR(20) NOT NULL UNIQUE,
    
    -- How this unit should be spoken by TTS
    -- e.g., "Engine forty-eight one", "MICU two forty-four one"
    spoken_as TEXT,
    
    -- Flag for units that were auto-created and need admin review
    needs_review BOOLEAN DEFAULT TRUE,
    
    -- When this unit was first seen in CAD data
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- When an admin last updated this mapping
    updated_at TIMESTAMP WITH TIME ZONE,
    
    -- Optional: link to apparatus table if this is one of our units
    apparatus_id INTEGER REFERENCES apparatus(id) ON DELETE SET NULL,
    
    -- Store the raw incident ID where we first saw this unit (for reference)
    first_seen_incident_id INTEGER
);

COMMENT ON TABLE tts_unit_mappings IS 
    'Pronunciation mappings for CAD unit IDs. Auto-created when new units seen, admin configures spoken form.';

COMMENT ON COLUMN tts_unit_mappings.cad_unit_id IS 
    'The unit ID exactly as it appears in CAD data (uppercase)';
COMMENT ON COLUMN tts_unit_mappings.spoken_as IS 
    'How TTS should pronounce this unit, e.g., "Engine forty-eight one"';
COMMENT ON COLUMN tts_unit_mappings.needs_review IS 
    'TRUE when auto-created from CAD and admin has not yet configured pronunciation';

-- =============================================================================
-- 2. Create indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_tts_unit_mappings_needs_review 
ON tts_unit_mappings(needs_review) 
WHERE needs_review = TRUE;

CREATE INDEX IF NOT EXISTS idx_tts_unit_mappings_cad_unit 
ON tts_unit_mappings(cad_unit_id);

-- =============================================================================
-- 3. Create TTS field settings table
-- =============================================================================
-- Per-field configuration for TTS announcements (pause after, formatting, etc.)
CREATE TABLE IF NOT EXISTS tts_field_settings (
    id SERIAL PRIMARY KEY,
    
    -- Field identifier (units, call_type, address, box, etc.)
    field_id VARCHAR(30) NOT NULL UNIQUE,
    
    -- Pause duration after this field: none, short, medium, long
    pause_after VARCHAR(10) DEFAULT 'medium',
    
    -- Optional prefix to add before field value (e.g., "Box" for box field)
    prefix TEXT,
    
    -- Optional suffix to add after field value
    suffix TEXT,
    
    -- Additional field-specific settings as JSON
    -- e.g., {"expand_street_types": true, "max_units": 5}
    options JSONB DEFAULT '{}',
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE tts_field_settings IS 
    'Per-field TTS settings: pauses, prefixes, formatting options';

-- =============================================================================
-- 4. Seed default field settings
-- =============================================================================
INSERT INTO tts_field_settings (field_id, pause_after, prefix, options) 
SELECT * FROM (VALUES
    ('units', 'medium', NULL, '{"max_units": 5, "join_word": "and"}'::jsonb),
    ('call_type', 'medium', NULL, '{}'::jsonb),
    ('subtype', 'short', NULL, '{}'::jsonb),
    ('box', 'short', 'Box', '{}'::jsonb),
    ('address', 'medium', NULL, '{"expand_street_types": true}'::jsonb),
    ('cross_streets', 'short', 'between', '{}'::jsonb),
    ('municipality', 'short', NULL, '{}'::jsonb),
    ('development', 'short', NULL, '{}'::jsonb)
) AS defaults(field_id, pause_after, prefix, options)
WHERE NOT EXISTS (SELECT 1 FROM tts_field_settings LIMIT 1);

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Check tables exist:
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'tts_%';
--
-- Check tts_unit_mappings columns:
-- \d tts_unit_mappings
--
-- Check tts_field_settings:
-- SELECT * FROM tts_field_settings ORDER BY field_id;
