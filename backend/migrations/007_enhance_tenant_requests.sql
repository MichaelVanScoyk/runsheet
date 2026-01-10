-- Migration: Enhance tenant_requests table with additional lead capture fields
-- Date: 2026-01-06
-- Description: Add station number, CAD info, and other fields for better lead capture

-- Add new columns to tenant_requests
ALTER TABLE tenant_requests 
ADD COLUMN IF NOT EXISTS station_number VARCHAR(50);

ALTER TABLE tenant_requests 
ADD COLUMN IF NOT EXISTS station_address TEXT;

ALTER TABLE tenant_requests 
ADD COLUMN IF NOT EXISTS cad_system VARCHAR(100);

ALTER TABLE tenant_requests 
ADD COLUMN IF NOT EXISTS cad_system_details TEXT;

ALTER TABLE tenant_requests 
ADD COLUMN IF NOT EXISTS department_type VARCHAR(50);

ALTER TABLE tenant_requests 
ADD COLUMN IF NOT EXISTS member_count INTEGER;

ALTER TABLE tenant_requests 
ADD COLUMN IF NOT EXISTS how_heard_about_us VARCHAR(100);

ALTER TABLE tenant_requests 
ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);

ALTER TABLE tenant_requests 
ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Add index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_tenant_requests_status ON tenant_requests(status);

-- Add index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_tenant_requests_created_at ON tenant_requests(created_at DESC);

COMMENT ON COLUMN tenant_requests.station_number IS 'Fire station number (e.g., Station 48)';
COMMENT ON COLUMN tenant_requests.station_address IS 'Physical address of the fire station';
COMMENT ON COLUMN tenant_requests.cad_system IS 'Current CAD system type (chester_county, berks_county, other, unknown)';
COMMENT ON COLUMN tenant_requests.cad_system_details IS 'Additional details about their CAD setup';
COMMENT ON COLUMN tenant_requests.department_type IS 'volunteer, career, combination';
COMMENT ON COLUMN tenant_requests.member_count IS 'Approximate number of members';
COMMENT ON COLUMN tenant_requests.how_heard_about_us IS 'How they found out about CADReport';
