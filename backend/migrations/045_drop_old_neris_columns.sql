-- Migration 045: Drop old neris_ prefix columns and unused extra timestamps
-- These columns were from the first NERIS attempt and contain only test data.
-- The nerisv1 builder architecture replaces all of them.
-- Approved by Mike — drop without backup.

BEGIN;

-- =========================================================================
-- PART 1: Drop 66 neris_ prefix columns from incidents table
-- =========================================================================

-- Dispatch fields (4)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_dispatch_determinant_code;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_dispatch_automatic_alarm;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_dispatch_disposition;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_dispatch_center_id;

-- Location (2)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_location;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_location_use;

-- Incident type classification (2)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_incident_type_codes;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_incident_type_primary;

-- Actions taken (2)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_action_codes;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_noaction_code;

-- Mutual aid (5)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_aid_direction;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_aid_type;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_aid_departments;
ALTER TABLE incidents DROP COLUMN IF EXISTS mutual_aid_department_ids;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_nonfd_aids;

-- Additional / general (3)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_additional_data;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_people_present;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_displaced_number;

-- Displacement (1)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_displacement_causes;

-- Risk reduction (1)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_risk_reduction;

-- Rescue/casualty (3)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rescue_ff;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rescue_nonff;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rescue_animal;

-- Narrative (2)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_narrative_impedance;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_narrative_outcome;

-- Fire detail (11)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_fire_investigation_need;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_fire_investigation_type;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_fire_arrival_conditions;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_fire_structure_damage;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_fire_structure_floor;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_fire_structure_room;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_fire_structure_cause;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_fire_outside_cause;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_fire_water_supply;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_fire_suppression_appliances;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_fire_progression_evident;

-- Medical detail (4)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_medical_patient_care;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_medical_pcr_id;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_medical_transport_disposition;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_medical_patient_status;

-- Hazmat detail (3)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_hazmat_disposition;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_hazmat_evacuated;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_hazmat_chemicals;

-- Exposures (1)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_exposures;

-- Emerging hazards (1)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_emerging_hazard;

-- CSST hazard (3)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_csst_ignition_source;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_csst_lightning_suspected;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_csst_grounded;

-- Risk reduction detail - Smoke alarm (6)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_smoke_alarm_type;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_smoke_alarm_working;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_smoke_alarm_post_action;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_smoke_alarm_operation;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_smoke_alarm_failure;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_smoke_alarm_action;

-- Risk reduction detail - Fire alarm (2)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_fire_alarm_type;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_fire_alarm_operation;

-- Risk reduction detail - Other alarm (2)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_other_alarm;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_other_alarm_type;

-- Risk reduction detail - Sprinkler/suppression (5)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_sprinkler_type;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_sprinkler_coverage;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_sprinkler_operation;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_sprinkler_heads_activated;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_sprinkler_failure;

-- Risk reduction detail - Cooking suppression (2)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_cooking_suppression;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_rr_cooking_suppression_type;

-- Special modifiers (1)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_special_modifiers;

-- Medical oxygen hazard (1)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_medical_oxygen_hazard;

-- =========================================================================
-- PART 2: Drop 37 extra timestamp columns (not in NERIS tactic_timestamps)
-- =========================================================================

-- Secondary search (2)
ALTER TABLE incidents DROP COLUMN IF EXISTS time_secondary_search_begin;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_secondary_search_complete;

-- Ventilation (2)
ALTER TABLE incidents DROP COLUMN IF EXISTS time_ventilation_start;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_ventilation_complete;

-- Overhaul (2)
ALTER TABLE incidents DROP COLUMN IF EXISTS time_overhaul_start;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_overhaul_complete;

-- Safety/RIT (3)
ALTER TABLE incidents DROP COLUMN IF EXISTS time_rit_activated;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_mayday_declared;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_mayday_cleared;

-- Extrication start (1)
ALTER TABLE incidents DROP COLUMN IF EXISTS time_extrication_start;

-- EMS tactic timestamps (8)
ALTER TABLE incidents DROP COLUMN IF EXISTS time_patient_contact;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_patient_assessment_complete;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_cpr_started;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_aed_applied;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_aed_shock_delivered;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_rosc_achieved;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_airway_secured;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_iv_access;

-- Operational timestamps (9)
ALTER TABLE incidents DROP COLUMN IF EXISTS time_par_started;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_par_complete;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_evac_ordered;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_water_supply_established;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_all_clear;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_loss_stop;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_utilities_secured;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_rehab_established;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_investigation_requested;

-- Hazmat timestamps (4)
ALTER TABLE incidents DROP COLUMN IF EXISTS time_hazmat_identified;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_hazmat_contained;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_decon_started;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_decon_complete;

-- Technical rescue timestamps (3)
ALTER TABLE incidents DROP COLUMN IF EXISTS time_victim_located;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_victim_accessed;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_victim_freed;

-- Wildland fire timestamps (3)
ALTER TABLE incidents DROP COLUMN IF EXISTS time_wildland_contained;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_wildland_controlled;
ALTER TABLE incidents DROP COLUMN IF EXISTS time_wildland_mopup_complete;

COMMIT;
