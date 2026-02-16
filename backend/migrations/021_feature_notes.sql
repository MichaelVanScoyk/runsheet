-- Migration 021: Add notes column to map_features
-- Short free-text notes field editable by officers/admins per feature
ALTER TABLE map_features ADD COLUMN IF NOT EXISTS notes TEXT;
