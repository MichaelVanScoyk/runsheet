-- Migration 018: Change equipment_used from ARRAY(Text) to Text
-- This field should be regular narrative text, not an array

-- Convert existing array data to comma-separated string, then change column type
ALTER TABLE incidents 
ALTER COLUMN equipment_used TYPE TEXT 
USING array_to_string(equipment_used, ', ');
