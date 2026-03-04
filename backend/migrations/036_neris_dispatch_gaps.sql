-- Migration 036: NERIS Dispatch gaps from OpenAPI v1.4.34 audit
-- Adds: determinant_code, automatic_alarm, disposition, center_id

-- ============================================================================
-- DETERMINANT CODE (dispatch node)
-- EMD/EFD code like "17-D-5" from dispatch center
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_dispatch_determinant_code TEXT;

-- ============================================================================
-- AUTOMATIC ALARM (dispatch node)
-- Was this triggered by an automatic alarm system?
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_dispatch_automatic_alarm BOOLEAN;

-- ============================================================================
-- DISPOSITION (dispatch node)
-- How the call was resolved from dispatch perspective
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_dispatch_disposition TEXT;

-- ============================================================================
-- CENTER ID (dispatch node)
-- PSAP center identifier — could auto-populate per tenant config
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_dispatch_center_id TEXT;
