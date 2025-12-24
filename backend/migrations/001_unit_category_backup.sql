-- ============================================================================
-- BACKUP SCRIPT: Run BEFORE migration
-- Creates backup tables to allow rollback
-- Run: psql -d runsheet_db -f 001_unit_category_backup.sql
-- ============================================================================

-- Timestamp this backup
DO $$
BEGIN
    RAISE NOTICE 'Creating backup at %', NOW();
END $$;

-- Backup apparatus table
DROP TABLE IF EXISTS apparatus_backup_pre_category;
CREATE TABLE apparatus_backup_pre_category AS 
SELECT * FROM apparatus;

-- Backup settings table (specifically station_units)
DROP TABLE IF EXISTS settings_backup_pre_category;
CREATE TABLE settings_backup_pre_category AS 
SELECT * FROM settings WHERE category = 'units' AND key = 'station_units';

-- Backup incident_units (in case we need to restore unit relationships)
DROP TABLE IF EXISTS incident_units_backup_pre_category;
CREATE TABLE incident_units_backup_pre_category AS
SELECT * FROM incident_units;

-- Verify backups
DO $$
DECLARE
    apparatus_count INT;
    settings_count INT;
    incident_units_count INT;
BEGIN
    SELECT COUNT(*) INTO apparatus_count FROM apparatus_backup_pre_category;
    SELECT COUNT(*) INTO settings_count FROM settings_backup_pre_category;
    SELECT COUNT(*) INTO incident_units_count FROM incident_units_backup_pre_category;
    
    RAISE NOTICE '=== BACKUP COMPLETE ===';
    RAISE NOTICE 'Apparatus rows backed up: %', apparatus_count;
    RAISE NOTICE 'Settings rows backed up: %', settings_count;
    RAISE NOTICE 'Incident units rows backed up: %', incident_units_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Backup tables created:';
    RAISE NOTICE '  - apparatus_backup_pre_category';
    RAISE NOTICE '  - settings_backup_pre_category';
    RAISE NOTICE '  - incident_units_backup_pre_category';
END $$;
