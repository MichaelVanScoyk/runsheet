-- Migration 019: TTS Abbreviations Table
-- Replaces hardcoded DEFAULT_UNIT_PRONUNCIATIONS and STREET_TYPES dicts
-- Tenant-specific, seeded with defaults
-- Run this in tenant schema (e.g., runsheet_gmfc2)

-- Create the table
CREATE TABLE IF NOT EXISTS tts_abbreviations (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,  -- 'unit_prefix' or 'street_type'
    abbreviation TEXT NOT NULL,
    spoken_as TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category, abbreviation)
);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_tts_abbreviations_lookup 
ON tts_abbreviations(category, abbreviation);

-- Seed unit_prefix entries
INSERT INTO tts_abbreviations (category, abbreviation, spoken_as) VALUES
    ('unit_prefix', 'ENG', 'Engine'),
    ('unit_prefix', 'TWR', 'Tower'),
    ('unit_prefix', 'LAD', 'Ladder'),
    ('unit_prefix', 'TRK', 'Truck'),
    ('unit_prefix', 'RES', 'Rescue'),
    ('unit_prefix', 'SQD', 'Squad'),
    ('unit_prefix', 'AMB', 'Ambulance'),
    ('unit_prefix', 'MED', 'Medic'),
    ('unit_prefix', 'MIC', 'Mick you'),
    ('unit_prefix', 'BLS', 'B L S'),
    ('unit_prefix', 'ALS', 'A L S'),
    ('unit_prefix', 'QRS', 'Q R S'),
    ('unit_prefix', 'CHF', 'Chief'),
    ('unit_prefix', 'BC', 'Battalion Chief'),
    ('unit_prefix', 'DC', 'Deputy Chief'),
    ('unit_prefix', 'CAR', 'Car'),
    ('unit_prefix', 'UTL', 'Utility'),
    ('unit_prefix', 'TAN', 'Tanker'),
    ('unit_prefix', 'TNK', 'Tanker'),
    ('unit_prefix', 'BRU', 'Brush'),
    ('unit_prefix', 'BOT', 'Boat'),
    ('unit_prefix', 'HAZ', 'Hazmat'),
    ('unit_prefix', 'AIR', 'Air')
ON CONFLICT (category, abbreviation) DO NOTHING;

-- Seed street_type entries
INSERT INTO tts_abbreviations (category, abbreviation, spoken_as) VALUES
    ('street_type', 'RD', 'Road'),
    ('street_type', 'ST', 'Street'),
    ('street_type', 'AVE', 'Avenue'),
    ('street_type', 'AV', 'Avenue'),
    ('street_type', 'DR', 'Drive'),
    ('street_type', 'LN', 'Lane'),
    ('street_type', 'CT', 'Court'),
    ('street_type', 'CIR', 'Circle'),
    ('street_type', 'BLVD', 'Boulevard'),
    ('street_type', 'PL', 'Place'),
    ('street_type', 'TER', 'Terrace'),
    ('street_type', 'TERR', 'Terrace'),
    ('street_type', 'WAY', 'Way'),
    ('street_type', 'PKY', 'Parkway'),
    ('street_type', 'PKWY', 'Parkway'),
    ('street_type', 'HWY', 'Highway'),
    ('street_type', 'RT', 'Route'),
    ('street_type', 'RTE', 'Route')
ON CONFLICT (category, abbreviation) DO NOTHING;
