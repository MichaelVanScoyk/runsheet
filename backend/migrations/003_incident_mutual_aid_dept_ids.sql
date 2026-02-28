-- Migration: Add mutual_aid_department_ids to incidents
-- Stores row IDs from neris_mutual_aid_departments selected on the RunSheet

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS mutual_aid_department_ids INTEGER[];
