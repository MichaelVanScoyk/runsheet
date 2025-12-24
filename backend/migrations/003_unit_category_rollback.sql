-- ============================================================================
-- ROLLBACK SCRIPT: Restore to pre-migration state
-- Run: psql -d runsheet_db -f 003_unit_category_rollback.sql
-- 
-- This will:
-- 1. Drop new columns from apparatus table
-- 2. Restore apparatus data from backup
-- 3. Restore settings from backup
-- ============================================================================

-- Check backup exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'apparatus_backup_pre_category') THEN
        RAISE EXCEPTION 'BACKUP TABLE NOT FOUND! Cannot rollback without backup.';
    END IF;
    RAISE NOTICE 'Backup found, proceeding with rollback...';
END $$;

-- ============================================================================
-- STEP 1: Drop indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_apparatus_cad_unit_id;
DROP INDEX IF EXISTS idx_apparatus_category;

RAISE NOTICE 'Indexes dropped';

-- ============================================================================
-- STEP 2: Drop new columns (if they exist)
-- ============================================================================

ALTER TABLE apparatus DROP COLUMN IF EXISTS unit_category;
ALTER TABLE apparatus DROP COLUMN IF EXISTS counts_for_response_times;
ALTER TABLE apparatus DROP COLUMN IF EXISTS cad_unit_id;

RAISE NOTICE 'New columns dropped';

-- ============================================================================
-- STEP 3: Restore apparatus table from backup
-- ============================================================================

-- Delete any rows that weren't in original backup
DELETE FROM apparatus 
WHERE id NOT IN (SELECT id FROM apparatus_backup_pre_category);

-- Update existing rows to match backup
UPDATE apparatus a
SET 
    unit_designator = b.unit_designator,
    name = b.name,
    apparatus_type = b.apparatus_type,
    is_virtual = b.is_virtual,
    has_driver = b.has_driver,
    has_officer = b.has_officer,
    ff_slots = b.ff_slots,
    display_order = b.display_order,
    active = b.active,
    neris_unit_type = b.neris_unit_type
FROM apparatus_backup_pre_category b
WHERE a.id = b.id;

-- Insert any missing rows (shouldn't happen, but just in case)
INSERT INTO apparatus (
    id, unit_designator, name, apparatus_type, is_virtual, 
    has_driver, has_officer, ff_slots, display_order, active, 
    created_at, neris_unit_type
)
SELECT 
    id, unit_designator, name, apparatus_type, is_virtual,
    has_driver, has_officer, ff_slots, display_order, active,
    created_at, neris_unit_type
FROM apparatus_backup_pre_category b
WHERE NOT EXISTS (SELECT 1 FROM apparatus WHERE id = b.id);

RAISE NOTICE 'Apparatus table restored';

-- ============================================================================
-- STEP 4: Verify restoration
-- ============================================================================

DO $$
DECLARE
    current_count INT;
    backup_count INT;
BEGIN
    SELECT COUNT(*) INTO current_count FROM apparatus;
    SELECT COUNT(*) INTO backup_count FROM apparatus_backup_pre_category;
    
    IF current_count = backup_count THEN
        RAISE NOTICE '=== ROLLBACK COMPLETE ===';
        RAISE NOTICE 'Apparatus rows: % (matches backup)', current_count;
    ELSE
        RAISE WARNING 'Row count mismatch! Current: %, Backup: %', current_count, backup_count;
    END IF;
END $$;

-- Show current state
SELECT 
    id,
    unit_designator,
    name,
    apparatus_type,
    is_virtual,
    active
FROM apparatus 
ORDER BY display_order;

-- ============================================================================
-- OPTIONAL: Clean up backup tables after successful rollback
-- Uncomment these lines if you want to remove backups
-- ============================================================================

-- DROP TABLE IF EXISTS apparatus_backup_pre_category;
-- DROP TABLE IF EXISTS settings_backup_pre_category;
-- DROP TABLE IF EXISTS incident_units_backup_pre_category;
-- RAISE NOTICE 'Backup tables removed';
