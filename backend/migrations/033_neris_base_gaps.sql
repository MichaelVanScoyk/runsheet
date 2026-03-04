-- Migration 033: NERIS Base Info gaps from OpenAPI v1.4.34 audit
-- Adds: displacement_causes, special_modifiers, medical_oxygen_hazard

-- ============================================================================
-- DISPLACEMENT CAUSES (base node)
-- NERIS wants WHY people were displaced, not just count
-- Values: COLLAPSE, FIRE, HAZARDOUS_SITUATION, OTHER, SMOKE, UTILITIES, WATER
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_displacement_causes TEXT[] DEFAULT '{}';

-- ============================================================================
-- SPECIAL MODIFIERS (top-level payload node)
-- Rare incident flags: Active Assailant, MCI, Disasters, etc.
-- Values: ACTIVE_ASSAILANT, COUNTY_LOCAL_DECLARED_DISASTER, FEDERAL_DECLARED_DISASTER,
--         MCI, STATE_DECLARED_DISASTER, URBAN_CONFLAGRATION, VIOLENCE_AGAINST_RESPONDER
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_special_modifiers TEXT[] DEFAULT '{}';

-- ============================================================================
-- MEDICAL OXYGEN HAZARD (top-level payload node)
-- Was medical oxygen present as a hazard?
-- Values: PRESENT, NOT_PRESENT, NOT_APPLICABLE
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_medical_oxygen_hazard TEXT;
