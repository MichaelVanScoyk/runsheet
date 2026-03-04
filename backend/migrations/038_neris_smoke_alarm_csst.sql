-- Migration 038: NERIS smoke alarm post_alarm_action + CSST hazard fields
-- From OpenAPI v1.4.34 gaps 15, 21

-- ============================================================================
-- SMOKE ALARM POST ALARM ACTION (smoke_alarm.presence.post_alarm_action)
-- What did occupants do after alarm sounded?
-- Values: EVACUATED, ATTEMPTED_EXTINGUISHMENT, NOTIFIED_OTHERS, CALLED_911,
--         NO_ACTION, UNKNOWN
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_rr_smoke_alarm_post_action TEXT;

-- ============================================================================
-- CSST HAZARD fields (top-level csst_hazard node)
-- Replaces shallow present/damage with full spec fields
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_csst_ignition_source BOOLEAN;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_csst_lightning_suspected TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_csst_grounded TEXT;
