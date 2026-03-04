-- Migration 034: NERIS Fire Detail gaps from OpenAPI v1.4.34 audit
-- Adds: water_supply, suppression_appliances, progression_evident
-- These were previously stored in neris_additional_data JSONB catch-all

-- ============================================================================
-- WATER SUPPLY (fire_detail node)
-- Values: DRAFT_FROM_STATIC_SOURCE, FOAM_ADDITIVE, HYDRANT_GREATER_500,
--         HYDRANT_LESS_500, NONE, NURSE_OTHER_APPARATUS, SUPPLY_FROM_FIRE_BOAT,
--         TANK_WATER, WATER_TENDER_SHUTTLE
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_fire_water_supply TEXT;

-- ============================================================================
-- SUPPRESSION APPLIANCES (fire_detail node)
-- Values: AIRATTACK_HELITACK, BOOSTER_FIRE_HOSE, BUILDING_FDC, BUILDING_STANDPIPE,
--         ELEVATED_MASTER_STREAM_STANDPIPE, FIRE_EXTINGUISHER, GROUND_MONITOR,
--         MASTER_STREAM, MEDIUM_DIAMETER_FIRE_HOSE, NONE, OTHER, SMALL_DIAMETER_FIRE_HOSE
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_fire_suppression_appliances TEXT[] DEFAULT '{}';

-- ============================================================================
-- PROGRESSION EVIDENT (fire_detail.location_detail — STRUCTURE fires only)
-- Boolean: was fire progression evident on arrival?
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_fire_progression_evident BOOLEAN;
