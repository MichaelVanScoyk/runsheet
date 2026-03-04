-- Migration 035: NERIS Medical Detail gaps from OpenAPI v1.4.34 audit
-- Adds: patient_care_report_id, transport_disposition, patient_status
-- These were previously stored in neris_additional_data JSONB catch-all

-- ============================================================================
-- PATIENT CARE REPORT ID (medical_details node)
-- PCR number from EMS documentation
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_medical_pcr_id TEXT;

-- ============================================================================
-- TRANSPORT DISPOSITION (medical_details node)
-- Values: NONPATIENT_TRANSPORT, NO_TRANSPORT, OTHER_AGENCY_TRANSPORT,
--         PATIENT_REFUSED_TRANSPORT, TRANSPORT_BY_EMS_UNIT
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_medical_transport_disposition TEXT;

-- ============================================================================
-- PATIENT STATUS (medical_details node)
-- Values: IMPROVED, UNCHANGED, WORSE
-- ============================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_medical_patient_status TEXT;
