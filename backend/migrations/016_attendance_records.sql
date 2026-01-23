-- Migration 016: Attendance Records (Roll Call Feature)
-- 
-- Adds support for tracking attendance at meetings, worknights, training, drills, etc.
-- These are stored as DETAIL category incidents with a detail_type sub-classification.
-- Attendance is stored in incident_personnel with incident_unit_id = NULL.
--
-- ALL CHANGES ARE ADDITIVE - safe to run on existing data.
--
-- Run with: sudo -u postgres psql -d runsheet_db -f backend/migrations/016_attendance_records.sql

-- =============================================================================
-- 1. Add detail_type to incidents for roll call sub-classification
-- =============================================================================
-- Values: MEETING, WORKNIGHT, TRAINING, DRILL, OTHER, or NULL for operational details
ALTER TABLE incidents 
ADD COLUMN IF NOT EXISTS detail_type VARCHAR(50);

COMMENT ON COLUMN incidents.detail_type IS 
    'Sub-type for DETAIL category: MEETING, WORKNIGHT, TRAINING, DRILL, OTHER. NULL for operational details (standby, fire watch, etc.)';

-- =============================================================================
-- 2. Add event time fields (separate from incident dispatch times)
-- =============================================================================
-- These are for scheduled events like meetings, not emergency responses
ALTER TABLE incidents
ADD COLUMN IF NOT EXISTS time_event_start TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS time_event_end TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN incidents.time_event_start IS 
    'Start time for scheduled events (meetings, training). Separate from time_dispatched which is for CAD incidents.';
COMMENT ON COLUMN incidents.time_event_end IS 
    'End time for scheduled events. Separate from time_last_cleared which is for CAD incidents.';

-- =============================================================================
-- 3. Create configurable detail types lookup table
-- =============================================================================
CREATE TABLE IF NOT EXISTS detail_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    display_order INTEGER DEFAULT 100,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE detail_types IS 
    'Configurable event types for DETAIL category records (meetings, worknights, training, etc.)';

-- =============================================================================
-- 4. Seed default detail types (only if table is empty)
-- =============================================================================
INSERT INTO detail_types (code, display_name, display_order) 
SELECT * FROM (VALUES
    ('MEETING', 'Meeting', 10),
    ('WORKNIGHT', 'Worknight', 20),
    ('TRAINING', 'Training', 30),
    ('DRILL', 'Drill', 40),
    ('OTHER', 'Other', 999)
) AS defaults(code, display_name, display_order)
WHERE NOT EXISTS (SELECT 1 FROM detail_types LIMIT 1);

-- =============================================================================
-- 5. Add needs_profile_review flag to personnel
-- =============================================================================
-- Used when personnel are manually added during roll call - flags for admin review
ALTER TABLE personnel
ADD COLUMN IF NOT EXISTS needs_profile_review BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN personnel.needs_profile_review IS 
    'TRUE when personnel was manually added (e.g., during roll call) and needs admin review to complete profile';

-- =============================================================================
-- 6. Add index for efficient detail_type queries
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_incidents_detail_type 
ON incidents(detail_type) 
WHERE detail_type IS NOT NULL;

-- =============================================================================
-- 7. Add index for personnel needing review
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_personnel_needs_review 
ON personnel(needs_profile_review) 
WHERE needs_profile_review = TRUE;

-- =============================================================================
-- VERIFICATION QUERIES (run manually to confirm migration)
-- =============================================================================
-- Check new columns exist:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'incidents' AND column_name IN ('detail_type', 'time_event_start', 'time_event_end');
--
-- Check detail_types table:
-- SELECT * FROM detail_types ORDER BY display_order;
--
-- Check personnel column:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns 
-- WHERE table_name = 'personnel' AND column_name = 'needs_profile_review';
