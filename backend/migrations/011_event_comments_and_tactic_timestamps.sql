-- Migration 011: Event Comments Storage and Complete Tactic Timestamps
-- Created: 2025-12-31
-- Purpose: 
--   1. Store parsed CAD event comments for PDF reports
--   2. Store detected tactical timestamps with NERIS field suggestions
--   3. Add ALL NERIS tactic timestamp fields (create buckets now, fill later)
--   4. Add operational timestamp fields for Chester County specifics

-- =============================================================================
-- PARSED CAD EVENT COMMENTS
-- =============================================================================

-- Full parsed event comments from CAD Clear Report
-- Used for: PDF report generation, historical record
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS cad_event_comments JSONB DEFAULT '{}';

-- Structure:
-- {
--   "comments": [
--     {
--       "time": "22:25:42",
--       "time_iso": "2025-12-27T22:25:42Z",
--       "operator": "ct08",
--       "operator_type": "CALLTAKER",  -- CALLTAKER, DISPATCHER, UNIT, SYSTEM
--       "text": "HOUSE ON FIRE",
--       "is_noise": false,
--       "category": "CALLER"  -- CALLER, TACTICAL, OPERATIONS, UNIT, SYSTEM
--     }
--   ],
--   "detected_timestamps": [
--     {
--       "time": "22:43:20",
--       "time_iso": "2025-12-27T22:43:20Z",
--       "raw_text": "12/27/25 22:43:20 Command Established for set Fire Incident Command Times.",
--       "detected_type": "COMMAND_ESTABLISHED",
--       "suggested_neris_field": "time_command_established",
--       "confidence": "HIGH",
--       "mapped_to": null,
--       "mapped_at": null,
--       "mapped_by": null
--     }
--   ],
--   "unit_crew_counts": [
--     {"unit_id": "ENG38", "crew_count": 4, "time": "22:27:34"}
--   ],
--   "parsed_at": "2025-12-28T00:32:00Z",
--   "parser_version": "1.0"
-- }

COMMENT ON COLUMN incidents.cad_event_comments IS 
'Parsed CAD event comments with detected timestamps and suggestions. Structure: {comments: [], detected_timestamps: [], unit_crew_counts: [], parsed_at, parser_version}';

-- =============================================================================
-- NERIS TACTIC TIMESTAMPS - COMPLETE SET
-- These are the official NERIS mod_tactic_timestamps fields
-- =============================================================================

-- COMMAND & CONTROL
-- Already exists: time_command_established
-- Already exists: time_sizeup_completed

-- SEARCH OPERATIONS
-- Already exists: time_primary_search_begin
-- Already exists: time_primary_search_complete
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_secondary_search_begin TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_secondary_search_complete TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN incidents.time_secondary_search_begin IS 'NERIS: Time secondary search operations began';
COMMENT ON COLUMN incidents.time_secondary_search_complete IS 'NERIS: Time secondary search completed';

-- FIRE SUPPRESSION
-- Already exists: time_water_on_fire
-- Already exists: time_fire_knocked_down
-- Already exists: time_fire_under_control
-- Already exists: time_suppression_complete

-- VENTILATION
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_ventilation_start TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_ventilation_complete TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN incidents.time_ventilation_start IS 'NERIS: Time ventilation operations began';
COMMENT ON COLUMN incidents.time_ventilation_complete IS 'NERIS: Time ventilation operations completed';

-- OVERHAUL
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_overhaul_start TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_overhaul_complete TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN incidents.time_overhaul_start IS 'NERIS: Time overhaul operations began';
COMMENT ON COLUMN incidents.time_overhaul_complete IS 'NERIS: Time overhaul operations completed';

-- SAFETY/RIT
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_rit_activated TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_mayday_declared TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_mayday_cleared TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN incidents.time_rit_activated IS 'NERIS: Time Rapid Intervention Team was activated';
COMMENT ON COLUMN incidents.time_mayday_declared IS 'NERIS: Time MAYDAY was declared';
COMMENT ON COLUMN incidents.time_mayday_cleared IS 'NERIS: Time MAYDAY situation was cleared';

-- RESCUE/EXTRICATION
-- Already exists: time_extrication_complete
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_extrication_start TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN incidents.time_extrication_start IS 'NERIS: Time extrication operations began';

-- =============================================================================
-- NERIS EMS TACTIC TIMESTAMPS
-- For medical incidents
-- =============================================================================

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_patient_contact TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_patient_assessment_complete TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_cpr_started TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_aed_applied TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_aed_shock_delivered TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_rosc_achieved TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_airway_secured TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_iv_access TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN incidents.time_patient_contact IS 'NERIS EMS: Time of first patient contact';
COMMENT ON COLUMN incidents.time_patient_assessment_complete IS 'NERIS EMS: Time patient assessment completed';
COMMENT ON COLUMN incidents.time_cpr_started IS 'NERIS EMS: Time CPR was initiated';
COMMENT ON COLUMN incidents.time_aed_applied IS 'NERIS EMS: Time AED pads were applied';
COMMENT ON COLUMN incidents.time_aed_shock_delivered IS 'NERIS EMS: Time first AED shock delivered';
COMMENT ON COLUMN incidents.time_rosc_achieved IS 'NERIS EMS: Time return of spontaneous circulation achieved';
COMMENT ON COLUMN incidents.time_airway_secured IS 'NERIS EMS: Time advanced airway was secured';
COMMENT ON COLUMN incidents.time_iv_access IS 'NERIS EMS: Time IV/IO access was established';

-- =============================================================================
-- OPERATIONAL TIMESTAMPS (Not NERIS, but useful for Chester County)
-- These capture local operational practices
-- =============================================================================

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_par_started TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_par_complete TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_evac_ordered TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_water_supply_established TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_all_clear TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_loss_stop TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_utilities_secured TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_rehab_established TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_investigation_requested TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN incidents.time_par_started IS 'Chester County: Time Personnel Accountability Report initiated';
COMMENT ON COLUMN incidents.time_par_complete IS 'Chester County: Time PAR was completed/all accounted';
COMMENT ON COLUMN incidents.time_evac_ordered IS 'Chester County: Time evacuation was ordered';
COMMENT ON COLUMN incidents.time_water_supply_established IS 'Operational: Time water supply was established';
COMMENT ON COLUMN incidents.time_all_clear IS 'Operational: Time scene declared all clear';
COMMENT ON COLUMN incidents.time_loss_stop IS 'Operational: Time loss was stopped';
COMMENT ON COLUMN incidents.time_utilities_secured IS 'Operational: Time utilities were secured';
COMMENT ON COLUMN incidents.time_rehab_established IS 'Operational: Time REHAB sector was established';
COMMENT ON COLUMN incidents.time_investigation_requested IS 'Operational: Time fire investigation was requested';

-- =============================================================================
-- HAZMAT TIMESTAMPS (NERIS)
-- =============================================================================

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_hazmat_identified TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_hazmat_contained TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_decon_started TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_decon_complete TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN incidents.time_hazmat_identified IS 'NERIS HazMat: Time hazardous material was identified';
COMMENT ON COLUMN incidents.time_hazmat_contained IS 'NERIS HazMat: Time hazmat was contained';
COMMENT ON COLUMN incidents.time_decon_started IS 'NERIS HazMat: Time decontamination began';
COMMENT ON COLUMN incidents.time_decon_complete IS 'NERIS HazMat: Time decontamination completed';

-- =============================================================================
-- TECHNICAL RESCUE TIMESTAMPS (NERIS)
-- =============================================================================

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_victim_located TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_victim_accessed TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_victim_freed TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN incidents.time_victim_located IS 'NERIS Rescue: Time victim was located';
COMMENT ON COLUMN incidents.time_victim_accessed IS 'NERIS Rescue: Time victim was accessed';
COMMENT ON COLUMN incidents.time_victim_freed IS 'NERIS Rescue: Time victim was freed/extricated';

-- =============================================================================
-- WILDLAND FIRE TIMESTAMPS (NERIS)
-- =============================================================================

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_wildland_contained TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_wildland_controlled TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS time_wildland_mopup_complete TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN incidents.time_wildland_contained IS 'NERIS Wildland: Time fire was contained';
COMMENT ON COLUMN incidents.time_wildland_controlled IS 'NERIS Wildland: Time fire was controlled';
COMMENT ON COLUMN incidents.time_wildland_mopup_complete IS 'NERIS Wildland: Time mop-up operations completed';

-- =============================================================================
-- CREATE INDEX FOR FASTER JSONB QUERIES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_incidents_cad_event_comments 
ON incidents USING GIN (cad_event_comments);

-- =============================================================================
-- TIMESTAMP MAPPING LOOKUP TABLE
-- Maps detected patterns to NERIS fields for suggestions
-- =============================================================================

CREATE TABLE IF NOT EXISTS tactic_timestamp_patterns (
    id SERIAL PRIMARY KEY,
    pattern_regex TEXT NOT NULL,
    pattern_description TEXT NOT NULL,
    neris_field_name TEXT,  -- NULL if no NERIS mapping
    operational_field_name TEXT,  -- For non-NERIS operational timestamps
    confidence TEXT DEFAULT 'MEDIUM',  -- HIGH, MEDIUM, LOW
    cad_source TEXT DEFAULT 'CHESTER_COUNTY',
    active BOOLEAN DEFAULT true,
    match_count INTEGER DEFAULT 0,  -- Track how often this pattern matches
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE tactic_timestamp_patterns IS 
'Pattern matching rules for detecting tactical timestamps in CAD event comments. Used to suggest NERIS field mappings.';

-- Insert known Chester County patterns
INSERT INTO tactic_timestamp_patterns (pattern_regex, pattern_description, neris_field_name, operational_field_name, confidence) VALUES
-- High confidence NERIS matches (Chester County formal timestamp system)
('Command Established for set Fire Incident Command Times', 'Chester County formal command established', 'time_command_established', NULL, 'HIGH'),
('\*\*\s*Fire Under Control at', 'Chester County formal FUC', 'time_fire_under_control', NULL, 'HIGH'),
('Fire Under Control', 'General FUC mention', 'time_fire_under_control', NULL, 'MEDIUM'),
('\bFUC\b', 'FUC abbreviation', 'time_fire_under_control', NULL, 'MEDIUM'),

-- Chester County operational (not direct NERIS)
('Evac Ordered for set Fire Incident Command Times', 'Chester County evacuation order', NULL, 'time_evac_ordered', 'HIGH'),
('Accountability/Start PAR.*timer started', 'Chester County PAR started', NULL, 'time_par_started', 'HIGH'),
('PAR\s*(Complete|All Accounted)', 'PAR completed', NULL, 'time_par_complete', 'MEDIUM'),

-- Water supply
('Water Supply Established', 'Water supply established', NULL, 'time_water_supply_established', 'MEDIUM'),
('WATER ON FIRE', 'Water on fire', 'time_water_on_fire', NULL, 'MEDIUM'),

-- Search operations
('Primary.*All Clear|PAC\b', 'Primary all clear', 'time_primary_search_complete', NULL, 'MEDIUM'),
('Primary Search (Complete|Started)', 'Primary search status', 'time_primary_search_complete', NULL, 'MEDIUM'),
('Secondary Search', 'Secondary search mention', 'time_secondary_search_begin', NULL, 'LOW'),

-- Overhaul
('Overhaul (Complete|Started)', 'Overhaul status', 'time_overhaul_start', NULL, 'LOW'),
('Extensive Overhaul', 'Overhaul mention', 'time_overhaul_start', NULL, 'LOW'),

-- Safety
('\bMAYDAY\b', 'MAYDAY declared', 'time_mayday_declared', NULL, 'HIGH'),
('\bRIT\b.*Activated', 'RIT activation', 'time_rit_activated', NULL, 'MEDIUM'),

-- All clear
('All Clear', 'Scene all clear', NULL, 'time_all_clear', 'LOW'),
('Loss Stop', 'Loss stopped', NULL, 'time_loss_stop', 'LOW'),

-- Utilities
('Utilities (Secured|Off|Cut)', 'Utilities secured', NULL, 'time_utilities_secured', 'MEDIUM'),

-- Investigation
('(Fire Marshal|Investigation|Investigator)', 'Investigation requested', NULL, 'time_investigation_requested', 'LOW')

ON CONFLICT DO NOTHING;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
    col_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns 
    WHERE table_name = 'incidents' 
    AND column_name LIKE 'time_%';
    
    RAISE NOTICE 'Migration 011 complete. Total timestamp columns in incidents table: %', col_count;
END $$;
