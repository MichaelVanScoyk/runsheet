-- Migration: Add Chiefs Report Fields
-- Date: 2025-12-28
-- Adds fields needed for traditional monthly chiefs report:
--   - Property value at risk
--   - Fire damages estimate  
--   - Injury counts (FF and civilian)

-- Property and damage estimates (stored as cents to avoid float issues)
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS property_value_at_risk BIGINT DEFAULT 0;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS fire_damages_estimate BIGINT DEFAULT 0;

-- Simple injury counts for chiefs report (separate from complex NERIS rescue modules)
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ff_injuries_count INTEGER DEFAULT 0;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS civilian_injuries_count INTEGER DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN incidents.property_value_at_risk IS 'Estimated property value at risk in cents (divide by 100 for dollars)';
COMMENT ON COLUMN incidents.fire_damages_estimate IS 'Estimated fire damages in cents (divide by 100 for dollars)';
COMMENT ON COLUMN incidents.ff_injuries_count IS 'Number of firefighter injuries (for chiefs report)';
COMMENT ON COLUMN incidents.civilian_injuries_count IS 'Number of civilian injuries (for chiefs report)';
