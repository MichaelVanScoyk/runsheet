-- Migration 031: Add dispatched_units column
-- Write-once snapshot of original dispatch units
-- Never overwritten by update dispatches or clear reports
-- Used for TTS preview and replaying original dispatch announcements

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS dispatched_units JSONB DEFAULT '[]';

-- Backfill: copy current cad_units into dispatched_units for existing incidents
-- This is the best approximation we have for historical data
UPDATE incidents 
SET dispatched_units = cad_units 
WHERE dispatched_units IS NULL OR dispatched_units = '[]'::jsonb
  AND cad_units IS NOT NULL AND cad_units != '[]'::jsonb;
