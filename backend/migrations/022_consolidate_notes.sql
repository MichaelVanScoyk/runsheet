-- Migration 022: Consolidate description → notes
--
-- Fixes the triple-notes problem:
--   1. map_features.description (column) — written by FeatureEditor on create
--   2. map_features.notes (column) — shown by FeatureDetail but never set on create
--   3. properties->>'notes' (JSONB key) — from property_schema, different storage
--
-- This migration:
--   a) Merges any existing description data into the notes column
--   b) Removes 'notes' key from property_schema in all affected layers
--   c) Migrates any properties->>'notes' JSONB values into the notes column

-- =============================================================================
-- STEP 1: Merge description → notes (don't overwrite existing notes)
-- =============================================================================
UPDATE map_features
SET notes = COALESCE(notes, description),
    updated_at = NOW()
WHERE description IS NOT NULL
  AND (notes IS NULL OR notes = '');

-- =============================================================================
-- STEP 2: Merge properties->>'notes' → column notes (don't overwrite existing)
-- =============================================================================
UPDATE map_features
SET notes = COALESCE(notes, properties->>'notes'),
    updated_at = NOW()
WHERE properties->>'notes' IS NOT NULL
  AND properties->>'notes' != ''
  AND (notes IS NULL OR notes = '');

-- Remove 'notes' key from properties JSONB where it exists
UPDATE map_features
SET properties = properties - 'notes',
    updated_at = NOW()
WHERE properties ? 'notes';

-- =============================================================================
-- STEP 3: Remove 'notes' from property_schema in all layers
-- =============================================================================
UPDATE map_layers
SET property_schema = property_schema - 'notes',
    updated_at = NOW()
WHERE property_schema ? 'notes';
