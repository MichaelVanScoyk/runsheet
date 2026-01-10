-- Migration 004: Add CAD Unit Aliases
-- Allows multiple CAD identifiers to map to the same apparatus unit
-- Example: QRS48 and 48QRS both map to the same rescue squad

-- Add the aliases column
ALTER TABLE apparatus ADD COLUMN IF NOT EXISTS cad_unit_aliases TEXT[] DEFAULT '{}';

-- Add comment explaining usage
COMMENT ON COLUMN apparatus.cad_unit_aliases IS 'Alternate CAD identifiers that map to this unit. Used when dispatch center uses inconsistent unit IDs.';

-- Example update (run manually if needed):
-- UPDATE apparatus SET cad_unit_aliases = ARRAY['48QRS'] WHERE unit_designator = 'QRS48';
