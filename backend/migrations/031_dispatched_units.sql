-- Migration 031: Add dispatched_units column
-- Write-once snapshot of original dispatch units
-- Never overwritten by update dispatches or clear reports
-- Used for TTS preview and replaying original dispatch announcements

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS dispatched_units JSONB DEFAULT '[]';
