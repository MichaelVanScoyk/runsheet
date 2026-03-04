-- Migration 037: NERIS nonfd_aids gap from OpenAPI v1.4.34 audit
-- Non-fire department agencies that assisted

-- ============================================================================
-- NON-FD AIDS (top-level payload node)
-- Values: CORONER_MEDICAL_EXAMINER, EMS, FIRE_MARSHAL, HOUSING_SERVICES,
--         LAW_ENFORCEMENT, MENTAL_HEALTH, OTHER_GOVERNMENT, PRIVATE_CONTRACTOR,
--         RED_CROSS, SOCIAL_SERVICES, UTILITIES_PUBLIC_WORKS
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_nonfd_aids TEXT[] DEFAULT '{}';
