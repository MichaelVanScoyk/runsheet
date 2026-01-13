-- Migration 014: Drop cad_type_mappings table
-- This table was part of a "learning" system that caused issues:
-- - Changing one incident's category would affect all future incidents of that type
-- - The parsing logic had bugs that updated wrong mappings
-- 
-- The new approach uses simple logic: MEDICAL -> EMS, everything else -> FIRE
-- Category changes on individual incidents now only affect that incident.

DROP TABLE IF EXISTS cad_type_mappings;
