-- ============================================================================
-- MIGRATION: Add unit_category system
-- Run: psql -d runsheet_db -f 002_unit_category_migrate.sql
-- 
-- MUST RUN 001_unit_category_backup.sql FIRST!
--
-- Categories:
--   APPARATUS - Physical CAD units (engines, trucks, chief vehicles)
--   DIRECT    - Virtual unit for POV to scene
--   STATION   - Virtual unit for personnel who reported to station (not on scene)
-- ============================================================================

-- Check backup exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'apparatus_backup_pre_category') THEN
        RAISE EXCEPTION 'BACKUP TABLE NOT FOUND! Run 001_unit_category_backup.sql first!';
    END IF;
    RAISE NOTICE 'Backup verified, proceeding with migration...';
END $$;

-- ============================================================================
-- STEP 1: Add new columns to apparatus table
-- ============================================================================

-- Add unit_category column
ALTER TABLE apparatus 
ADD COLUMN IF NOT EXISTS unit_category VARCHAR(20);

-- Add counts_for_response_times flag
ALTER TABLE apparatus 
ADD COLUMN IF NOT EXISTS counts_for_response_times BOOLEAN;

-- Add cad_unit_id for matching CAD data
ALTER TABLE apparatus 
ADD COLUMN IF NOT EXISTS cad_unit_id VARCHAR(20);

DO $$ BEGIN RAISE NOTICE 'Step 1: Columns added to apparatus table'; END $$;

-- ============================================================================
-- STEP 2: Migrate existing data based on is_virtual flag
-- ============================================================================

-- Virtual units that look like "Direct" -> DIRECT category
UPDATE apparatus 
SET unit_category = 'DIRECT',
    counts_for_response_times = FALSE
WHERE is_virtual = TRUE 
  AND (UPPER(name) LIKE '%DIRECT%' OR UPPER(unit_designator) LIKE '%DIRECT%');

-- Virtual units that look like "Station" -> STATION category  
UPDATE apparatus 
SET unit_category = 'STATION',
    counts_for_response_times = FALSE
WHERE is_virtual = TRUE 
  AND (UPPER(name) LIKE '%STATION%' OR UPPER(unit_designator) LIKE '%STATION%');

-- Any remaining virtual units -> STATION (catch-all)
UPDATE apparatus 
SET unit_category = 'STATION',
    counts_for_response_times = FALSE
WHERE is_virtual = TRUE 
  AND unit_category IS NULL;

-- Real apparatus -> APPARATUS category (default counts for response times)
UPDATE apparatus 
SET unit_category = 'APPARATUS',
    counts_for_response_times = TRUE
WHERE (is_virtual = FALSE OR is_virtual IS NULL)
  AND unit_category IS NULL;

-- Populate cad_unit_id from unit_designator (same value initially)
UPDATE apparatus 
SET cad_unit_id = unit_designator
WHERE cad_unit_id IS NULL;

DO $$
DECLARE
    apparatus_count INT;
    direct_count INT;
    station_count INT;
BEGIN
    SELECT COUNT(*) INTO apparatus_count FROM apparatus WHERE unit_category = 'APPARATUS';
    SELECT COUNT(*) INTO direct_count FROM apparatus WHERE unit_category = 'DIRECT';
    SELECT COUNT(*) INTO station_count FROM apparatus WHERE unit_category = 'STATION';
    
    RAISE NOTICE 'Step 2: Category migration complete:';
    RAISE NOTICE '  APPARATUS: %', apparatus_count;
    RAISE NOTICE '  DIRECT: %', direct_count;
    RAISE NOTICE '  STATION: %', station_count;
END $$;

-- ============================================================================
-- STEP 3: Import units from station_units setting that aren't in apparatus
-- Chief vehicles (CHF, ASST, DEP) get 0 crew slots, counts_for_response=false
-- Other units get standard apparatus defaults
-- ============================================================================

DO $$
DECLARE
    station_units_json TEXT;
    unit_id TEXT;
    units_array TEXT[];
    units_added INT := 0;
    is_chief_vehicle BOOLEAN;
BEGIN
    -- Get station_units setting
    SELECT value INTO station_units_json
    FROM settings 
    WHERE category = 'units' AND key = 'station_units';
    
    IF station_units_json IS NULL THEN
        RAISE NOTICE 'Step 3: No station_units setting found, skipping import';
        RETURN;
    END IF;
    
    -- Parse JSON array to text array
    SELECT ARRAY(SELECT json_array_elements_text(station_units_json::json))
    INTO units_array;
    
    -- For each unit in station_units
    FOREACH unit_id IN ARRAY units_array
    LOOP
        -- Check if it exists in apparatus table
        IF NOT EXISTS (
            SELECT 1 FROM apparatus 
            WHERE UPPER(unit_designator) = UPPER(unit_id) 
               OR UPPER(cad_unit_id) = UPPER(unit_id)
        ) THEN
            -- Check if it looks like a chief vehicle (CHF, ASST, DEP, CMD, OFC)
            is_chief_vehicle := UPPER(unit_id) ~ '^(CHF|ASST|DEP|CMD|OFC|CHIEF|DEPUTY)';
            
            IF is_chief_vehicle THEN
                -- Chief vehicle: APPARATUS with 0 crew slots, doesn't count for response times
                INSERT INTO apparatus (
                    unit_designator, 
                    name, 
                    apparatus_type,
                    unit_category, 
                    counts_for_response_times,
                    cad_unit_id,
                    is_virtual,
                    has_driver,
                    has_officer,
                    ff_slots,
                    display_order,
                    active
                ) VALUES (
                    UPPER(unit_id),
                    UPPER(unit_id),  -- Use unit_id as name initially
                    'Command Vehicle',
                    'APPARATUS',
                    FALSE,  -- Chief vehicles don't count for response times by default
                    UPPER(unit_id),
                    FALSE,  -- Physical vehicle
                    FALSE,  -- No driver slot (chief is assigned to DIRECT)
                    FALSE,  -- No officer slot
                    0,      -- No FF slots
                    50,     -- Display after main apparatus
                    TRUE
                );
                units_added := units_added + 1;
                RAISE NOTICE '  Added chief vehicle: % (0 slots, no response metrics)', unit_id;
            ELSE
                -- Regular apparatus with standard defaults
                INSERT INTO apparatus (
                    unit_designator, 
                    name, 
                    apparatus_type,
                    unit_category, 
                    counts_for_response_times,
                    cad_unit_id,
                    is_virtual,
                    has_driver,
                    has_officer,
                    ff_slots,
                    display_order,
                    active
                ) VALUES (
                    UPPER(unit_id),
                    UPPER(unit_id),
                    'Unknown',
                    'APPARATUS',
                    TRUE,   -- Counts for response times
                    UPPER(unit_id),
                    FALSE,
                    TRUE,   -- Has driver
                    TRUE,   -- Has officer
                    4,      -- 4 FF slots
                    100,
                    TRUE
                );
                units_added := units_added + 1;
                RAISE NOTICE '  Added apparatus: % (standard config)', unit_id;
            END IF;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Step 3: Imported % units from station_units setting', units_added;
END $$;

-- ============================================================================
-- STEP 4: Set NOT NULL constraint and default after migration
-- ============================================================================

-- Set default for new rows
ALTER TABLE apparatus 
ALTER COLUMN unit_category SET DEFAULT 'APPARATUS';

-- Make unit_category required
ALTER TABLE apparatus 
ALTER COLUMN unit_category SET NOT NULL;

-- Set default for counts_for_response_times
ALTER TABLE apparatus 
ALTER COLUMN counts_for_response_times SET DEFAULT TRUE;

DO $$ BEGIN RAISE NOTICE 'Step 4: Constraints applied'; END $$;

-- ============================================================================
-- STEP 5: Add indexes for CAD lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_apparatus_cad_unit_id 
ON apparatus (UPPER(cad_unit_id));

CREATE INDEX IF NOT EXISTS idx_apparatus_category 
ON apparatus (unit_category);

DO $$ BEGIN RAISE NOTICE 'Step 5: Indexes created'; END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    total_count INT;
    null_category INT;
    null_cad_id INT;
BEGIN
    SELECT COUNT(*) INTO total_count FROM apparatus;
    SELECT COUNT(*) INTO null_category FROM apparatus WHERE unit_category IS NULL;
    SELECT COUNT(*) INTO null_cad_id FROM apparatus WHERE cad_unit_id IS NULL;
    
    RAISE NOTICE '';
    RAISE NOTICE '=== MIGRATION COMPLETE ===';
    RAISE NOTICE 'Total units: %', total_count;
    RAISE NOTICE 'Null categories: % (should be 0)', null_category;
    RAISE NOTICE 'Null CAD IDs: % (should be 0)', null_cad_id;
    RAISE NOTICE '';
END $$;

-- Show final state
SELECT 
    unit_designator,
    name,
    unit_category,
    counts_for_response_times AS counts_resp,
    cad_unit_id,
    CASE 
        WHEN has_driver THEN 1 ELSE 0 
    END + 
    CASE 
        WHEN has_officer THEN 1 ELSE 0 
    END + 
    COALESCE(ff_slots, 0) AS crew_slots,
    active
FROM apparatus 
ORDER BY 
    CASE unit_category 
        WHEN 'APPARATUS' THEN 1 
        WHEN 'DIRECT' THEN 2 
        WHEN 'STATION' THEN 3 
    END,
    display_order;
