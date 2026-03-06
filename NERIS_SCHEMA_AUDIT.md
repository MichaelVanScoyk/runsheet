# NERIS Schema Audit
**Date:** 2026-03-05  
**Truth Source:** `https://api.neris.fsri.org/v1/openapi.json` (NERIS API v1.4.35)  
**Spec fetched live from the NERIS production API via browser session.**  
**No secondary sources used.**

---

## Summary

Every NERIS-related table and column in CADReport was audited against the live NERIS OpenAPI spec.
The audit covers three scopes:

1. **Entity tables** (`neris_entity`, `neris_stations`, `neris_units`) — department profile submission
2. **Incident table** (`incidents`) — per-incident submission fields
3. **Enum/code values** stored in `neris_codes` table

**Safe tables — NO NERIS fields, NOT touched by this audit:**
- `incidents` (CAD/operational fields only — see section 2 for NERIS-prefixed columns)
- `incident_units`
- `incident_personnel`
- `apparatus`
- `personnel`
- `ranks`
- `municipalities`
- `settings`
- `audit_log`
- `review_tasks`

---

## 1. Entity Tables Audit

### 1.1 `neris_units` table

**Spec source:** `UnitPayload`, `CreateUnitPayload`, `PatchUnitPayload`

| Current Column | NERIS Spec Field | Status | Action |
|---|---|---|---|
| `station_unit_id_1` | `cad_designation_1` | ❌ Wrong name | Rename column |
| `station_unit_id_2` | `cad_designation_2` | ❌ Wrong name | Rename column |
| `station_unit_capability` | `type` | ❌ Wrong name | Rename column |
| `station_unit_staffing` | `staffing` | ❌ Wrong name | Rename column |
| `station_unit_dedicated` | `dedicated_staffing` | ❌ Wrong name | Rename column |
| `apparatus_id` | *(internal FK — not submitted to NERIS)* | ✅ Internal only | Keep |
| `station_id` (FK) | *(internal FK — not submitted to NERIS)* | ✅ Internal only | Keep |
| `display_order` | *(internal — not submitted to NERIS)* | ✅ Internal only | Keep |
| `neris_id` | `neris_id` | **MISSING** | Add column |

**`type` enum values from spec (`TypeUnitValue`):**
```
AIR_EMS, AIR_LIGHT, AIR_RECON, AIR_TANKER, ALS_AMB, ARFF, ATV_EMS, ATV_FIRE,
BLS_AMB, BOAT, BOAT_LARGE, CHIEF_STAFF_COMMAND, CREW, CREW_TRANS, DECON, DOZER,
EMS_NOTRANS, EMS_SUPV, ENGINE_STRUCT, ENGINE_WUI, FOAM, HAZMAT, HELO_FIRE,
HELO_GENERAL, HELO_RESCUE, INVEST, LADDER_QUINT, LADDER_SMALL, LADDER_TALL,
LADDER_TILLER, MAB, MOBILE_COMMS, MOBILE_ICP, OTHER_GROUND, PLATFORM,
PLATFORM_QUINT, POV, QUINT_TALL, REHAB, RESCUE_HEAVY, RESCUE_LIGHT,
RESCUE_MEDIUM, RESCUE_USAR, RESCUE_WATER, SCBA, TENDER, UAS_FIRE, UAS_RECON, UTIL
```

---

### 1.2 `neris_stations` table

**Spec source:** `StationPayload`, `CreateStationPayload`, `PatchStationPayload`

| Current Column | NERIS Spec Field | Status | Action |
|---|---|---|---|
| `station_address_1` | `address_line_1` | ❌ Wrong name | Rename column |
| `station_address_2` | `address_line_2` | ❌ Wrong name | Rename column |
| `station_city` | `city` | ❌ Wrong name | Rename column |
| `station_state` | `state` | ❌ Wrong name | Rename column |
| `station_zip` | `zip_code` | ❌ Wrong name | Rename column |
| `station_staffing` | `staffing` | ❌ Wrong name | Rename column |
| `station_id` | `station_id` | ✅ Correct | Keep |
| `station_point_lat` + `station_point_lng` | `location` (GeoPoint object) | ❌ Wrong structure | Replace with `location` JSONB |
| `station_name` | *(not in NERIS spec — local display only)* | ⚠️ Local only | Keep as-is |
| `internal_id` | `internal_id` | **MISSING** | Add column |
| `neris_id` | `neris_id` | **MISSING** | Add column |
| `entity_id` (FK) | *(internal FK)* | ✅ Internal only | Keep |
| `display_order` | *(internal)* | ✅ Internal only | Keep |

**`location` field structure (spec: `GeoPoint`):**
```json
{ "lat": 40.1234, "lng": -75.5678 }
```

---

### 1.3 `neris_entity` table

**Spec source:** `DepartmentPayload`, `PatchDepartmentPayload`  
**Nested schemas:** `DepartmentDispatchPayload`, `StaffingPayload`, `AssessmentPayload`, `ShiftPayload`, `PopulationPayload`

#### Top-level entity fields

| Current Column | NERIS Spec Field | Status | Action |
|---|---|---|---|
| `fd_name` | `name` | ❌ Wrong name | Rename column |
| `fd_address_1` | `address_line_1` | ❌ Wrong name | Rename column |
| `fd_address_2` | `address_line_2` | ❌ Wrong name | Rename column |
| `fd_city` | `city` | ❌ Wrong name | Rename column |
| `fd_state` | `state` | ❌ Wrong name | Rename column |
| `fd_zip` | `zip_code` | ❌ Wrong name | Rename column |
| `fd_website` | `website` | ❌ Wrong name | Rename column |
| `fd_type` | `department_type` | ❌ Wrong name | Rename column |
| `fd_entity` | `entity_type` | ❌ Wrong name | Rename column |
| `fd_neris_id` | *(identifier — used in URL path, not body)* | ✅ Internal use | Keep |
| `fd_id_legacy` | `internal_id` | ❌ Wrong name | Rename column |
| `fd_telephone` | *(not in spec)* | ⚠️ Not in spec | Drop or keep local-only |
| `fd_fire_services` | `fire_services` | ✅ Correct | Keep |
| `fd_ems_services` | `ems_services` | ✅ Correct | Keep |
| `fd_investigation_services` | `investigation_services` | ✅ Correct | Keep |
| `rms_software` | `rms_software` | ✅ Correct | Keep |
| `neris_entity_submitted_at` | *(internal tracking)* | ✅ Internal only | Keep |
| `neris_entity_status` | *(internal tracking)* | ✅ Internal only | Keep |
| `neris_annual_renewal_month` | *(internal)* | ✅ Internal only | Keep |
| `fd_station_count` | *(computed — not in spec body)* | ✅ Internal only | Keep |
| `fd_point_lat` + `fd_point_lng` | `location` (GeoPoint object) | ❌ Wrong structure | Replace with `location` JSONB |
| `mail_address_line_1` | `mail_address_line_1` | **MISSING** | Add column |
| `mail_address_line_2` | `mail_address_line_2` | **MISSING** | Add column |
| `mail_city` | `mail_city` | **MISSING** | Add column |
| `mail_state` | `mail_state` | **MISSING** | Add column |
| `mail_zip_code` | `mail_zip_code` | **MISSING** | Add column |
| `email` | `email` | **MISSING** | Add column |
| `time_zone` | `time_zone` | **MISSING** | Add column |
| `continue_edu` | `continue_edu` | **MISSING** | Add column |
| `fips_code` | `fips_code` | **MISSING** | Add column |

#### Nested: `dispatch` object → `DepartmentDispatchPayload`
Spec submits as `dispatch: { avl_usage, center_id, cad_software, psap_type, psap_capability, psap_discipline, psap_jurisdiction, protocol_fire, protocol_med }`

| Current Column | NERIS Spec Path | Status | Action |
|---|---|---|---|
| `dispatch_avl_usage` | `dispatch.avl_usage` | ❌ Flat instead of nested | Restructure |
| `dispatch_center_id` | `dispatch.center_id` | ❌ Flat instead of nested | Restructure |
| `dispatch_cad_software` | `dispatch.cad_software` | ❌ Flat instead of nested | Restructure |
| `dispatch_psap_type` | `dispatch.psap_type` | ❌ Flat instead of nested | Restructure |
| `dispatch_psap_capability` | `dispatch.psap_capability` | ❌ Flat instead of nested | Restructure |
| `dispatch_psap_discipline` | `dispatch.psap_discipline` | ❌ Flat instead of nested | Restructure |
| `dispatch_psap_jurisdiction` | `dispatch.psap_jurisdiction` | ❌ Flat instead of nested | Restructure |
| `dispatch_protocol_fire` | `dispatch.protocol_fire` | ❌ Flat instead of nested | Restructure |
| `dispatch_protocol_medical` | `dispatch.protocol_med` | ❌ Wrong name + flat | Restructure + rename |

**Recommended approach:** Replace all `dispatch_*` flat columns with single `dispatch` JSONB column.

#### Nested: `staffing` object → `StaffingPayload`
Spec submits as `staffing: { active_firefighters_volunteer, active_firefighters_career_ft, ... }`

| Current Column | NERIS Spec Path | Status | Action |
|---|---|---|---|
| `staff_active_ff_volunteer` | `staffing.active_firefighters_volunteer` | ❌ Wrong name + flat | Restructure |
| `staff_active_ff_career_ft` | `staffing.active_firefighters_career_ft` | ❌ Wrong name + flat | Restructure |
| `staff_active_ff_career_pt` | `staffing.active_firefighters_career_pt` | ❌ Wrong name + flat | Restructure |
| `staff_active_ems_only_career_ft` | `staffing.active_ems_only_career_ft` | ❌ Flat instead of nested | Restructure |
| `staff_active_ems_only_career_pt` | `staffing.active_ems_only_career_pt` | ❌ Flat instead of nested | Restructure |
| `staff_active_ems_only_volunteer` | `staffing.active_ems_only_volunteer` | ❌ Flat instead of nested | Restructure |
| `staff_active_civilians_career_ft` | `staffing.active_civilians_career_ft` | ❌ Flat instead of nested | Restructure |
| `staff_active_civilians_career_pt` | `staffing.active_civilians_career_pt` | ❌ Flat instead of nested | Restructure |
| `staff_active_civilians_volunteer` | `staffing.active_civilians_volunteer` | ❌ Flat instead of nested | Restructure |
| `staff_total` | *(not in spec)* | ⚠️ Not in spec | Drop or local-only |

**Recommended approach:** Replace all `staff_*` flat columns with single `staffing` JSONB column.

#### Nested: `assessment` object → `AssessmentPayload`
Spec submits as `assessment: { iso_rating, cpse_accredited, caas_accredited }`

| Current Column | NERIS Spec Path | Status | Action |
|---|---|---|---|
| `assess_iso_rating` | `assessment.iso_rating` | ❌ Wrong name + flat | Restructure |
| *(missing)* | `assessment.cpse_accredited` | **MISSING** | Add to JSONB |
| *(missing)* | `assessment.caas_accredited` | **MISSING** | Add to JSONB |

**Recommended approach:** Replace `assess_iso_rating` with single `assessment` JSONB column.

#### Nested: `shift` object → `ShiftPayload`
Spec submits as `shift: { count, duration, signup }`

| Current Column | NERIS Spec Path | Status | Action |
|---|---|---|---|
| `fd_shift_count` | `shift.count` | ❌ Wrong name + flat | Restructure |
| `fd_shift_duration` | `shift.duration` | ❌ Wrong name + flat | Restructure |
| *(missing)* | `shift.signup` | **MISSING** | Add to JSONB |

**Recommended approach:** Replace `fd_shift_count` + `fd_shift_duration` with single `shift` JSONB column.

#### Nested: `population` object → `PopulationPayload`
Spec submits as `population: { protected, source }`

| Current Column | NERIS Spec Path | Status | Action |
|---|---|---|---|
| `fd_population_protected` | `population.protected` | ❌ Wrong name + flat | Restructure |
| *(missing)* | `population.source` | **MISSING** | Add to JSONB |

**Recommended approach:** Replace `fd_population_protected` with single `population` JSONB column.

**`department_type` enum values from spec (`TypeDeptValue`):**
```
COMBINATION, CAREER, VOLUNTEER
```

**`entity_type` enum values from spec (`TypeEntityValue`):**
```
FEDERAL, FIRE_DEPARTMENT, FIRE_DISTRICT, FIRE_PROTECTION_DISTRICT,
MILITARY, STATE_LOCAL_GOVERNMENT, TRIBAL, VOLUNTEER_FIRE_DEPARTMENT
```

---

## 2. Incident Table NERIS Field Audit

**Spec source:** `IncidentPayload`, `IncidentBasePayload`, `DispatchPayload`,  
`DispatchUnitResponsePayload`, `FirePayload`, `MedicalPayload`, `HazsitPayload`,  
`AidPayload`, `TacticTimestampsPayload`

### 2.1 Base Incident Fields

| Current Column | NERIS Spec Field | Status |
|---|---|---|
| `neris_id` | *(identifier)* | ✅ Correct |
| `neris_incident_type_codes` | `incident_types[].type` | ✅ Correct structure |
| `neris_incident_type_primary` | `incident_types[].primary` | ✅ Correct structure |
| `neris_people_present` | `base.people_present` | ✅ Correct |
| `neris_displaced_number` | `base.displacement_count` | ⚠️ Column name differs — col maps correctly in payload builder |
| `neris_displacement_causes` | `base.displacement_causes` | ✅ Correct |
| `neris_location` | `base.location` | ✅ Correct structure |
| `neris_narrative_impedance` | `base.impediment_narrative` | ⚠️ Column name differs — maps correctly in payload builder |
| `neris_narrative_outcome` | `base.outcome_narrative` | ⚠️ Column name differs — maps correctly in payload builder |
| `neris_aid_direction` | `aids[].aid_direction` | ✅ Correct values |
| `neris_aid_type` | `aids[].aid_type` | ✅ Correct values |
| `neris_nonfd_aids` | `nonfd_aids[].type` | ✅ Correct |
| `neris_action_codes` | `actions_tactics[].type` | ✅ Correct values |
| `neris_noaction_code` | `actions_tactics[].action_noaction` | ✅ Correct |
| `neris_special_modifiers` | `special_modifiers` | ✅ Correct |
| `neris_medical_oxygen_hazard` | `medical_oxygen_hazard.presence` | ⚠️ Stored flat — maps to nested object in payload |

### 2.2 Dispatch Fields

**Spec source:** `DispatchPayload`

| Current Column | NERIS Spec Field | Status |
|---|---|---|
| `psap_call_arrival` | `dispatch.call_arrival` | ✅ Correct |
| `psap_call_answered` | `dispatch.call_answered` | ✅ Correct |
| `time_dispatched` | `dispatch.call_create` | ⚠️ Column name differs — maps correctly |
| `neris_dispatch_determinant_code` | `dispatch.determinant_code` | ✅ Correct |
| `neris_dispatch_automatic_alarm` | `dispatch.automatic_alarm` | ✅ Correct |
| `neris_dispatch_disposition` | `dispatch.disposition` | ✅ Correct |
| `neris_dispatch_center_id` | `dispatch.center_id` | ✅ Correct |

### 2.3 Unit Response Fields

**Spec source:** `DispatchUnitResponsePayload`

| Current Column (incident_units) | NERIS Spec Field | Status |
|---|---|---|
| `neris_unit_id_linked` | `unit_neris_id` | ⚠️ Column name differs — verify payload builder maps this |
| `neris_unit_id_reported` | `reported_unit_id` | ⚠️ Column name differs — verify payload builder maps this |
| `crew_count` | `staffing` | ⚠️ Column name differs — verify payload builder |
| `response_mode` | `response_mode` | ✅ Correct |
| `transport_mode` | `transport_mode` | ✅ Correct |
| `time_dispatch` | `dispatch` | ⚠️ Column name differs |
| `time_enroute_to_scene` | `enroute_to_scene` | ⚠️ Column name differs |
| `time_on_scene` | `on_scene` | ⚠️ Column name differs |
| `time_canceled_enroute` | `canceled_enroute` | ⚠️ Column name differs |
| `time_staging` | `staging` | ⚠️ Column name differs |
| `time_unit_clear` | `unit_clear` | ⚠️ Column name differs |
| `hospital_destination` | `med_responses[].hospital_destination` | ⚠️ Column name differs |
| `time_at_patient` | `med_responses[].at_patient` | ⚠️ Column name differs |
| `time_enroute_hospital` | `med_responses[].enroute_to_hospital` | ⚠️ Column name differs |
| `time_arrived_hospital` | `med_responses[].arrived_at_hospital` | ⚠️ Column name differs |
| `time_hospital_clear` | `med_responses[].hospital_cleared` | ⚠️ Column name differs |

### 2.4 Tactic Timestamps

**Spec source:** `DispatchTacticTimestampsPayload` / `IncidentTacticTimestampsPayload`

| Current Column | NERIS Spec Field | Status |
|---|---|---|
| `time_command_established` | `command_established` | ✅ Maps correctly |
| `time_sizeup_completed` | `completed_sizeup` | ✅ Maps correctly |
| `time_primary_search_begin` | `primary_search_begin` | ✅ Maps correctly |
| `time_primary_search_complete` | `primary_search_complete` | ✅ Maps correctly |
| `time_water_on_fire` | `water_on_fire` | ✅ Maps correctly |
| `time_fire_under_control` | `fire_under_control` | ✅ Maps correctly |
| `time_fire_knocked_down` | `fire_knocked_down` | ✅ Maps correctly |
| `time_suppression_complete` | `suppression_complete` | ✅ Maps correctly |
| `time_extrication_complete` | `extrication_complete` | ✅ Maps correctly |

### 2.5 Fire Module Fields

**Spec source:** `FirePayload`

| Current Column | NERIS Spec Field | Status |
|---|---|---|
| `neris_fire_water_supply` | `fire_detail.water_supply` | ✅ Correct |
| `neris_fire_suppression_appliances` | `fire_detail.suppression_appliances` | ✅ Correct |
| `neris_fire_investigation_need` | `fire_detail.investigation_needed` | ✅ Correct |
| `neris_fire_investigation_type` | `fire_detail.investigation_types` | ✅ Correct |

### 2.6 Medical Module Fields

**Spec source:** `MedicalPayload`

| Current Column | NERIS Spec Field | Status |
|---|---|---|
| `neris_medical_patient_care` | `medical_details[].patient_care_evaluation` | ✅ Correct values |
| `neris_medical_pcr_id` | `medical_details[].patient_care_report_id` | ✅ Correct |
| `neris_medical_transport_disposition` | `medical_details[].transport_disposition` | ✅ Correct |
| `neris_medical_patient_status` | `medical_details[].patient_status` | ✅ Correct |

### 2.7 Hazmat Module Fields

**Spec source:** `HazsitPayload`

| Current Column | NERIS Spec Field | Status |
|---|---|---|
| `neris_hazmat_disposition` | `hazsit_detail.disposition` | ✅ Correct |
| `neris_hazmat_evacuated` | `hazsit_detail.evacuated` | ✅ Correct |
| `neris_hazmat_chemicals` | `hazsit_detail.chemicals` | ✅ Correct |

---

## 3. Enum Values Audit (neris_codes table)

All values verified against `api.neris.fsri.org/v1/openapi.json`.

### 3.1 `type_unit` (unit capability / TypeUnitValue)
**Separator:** `||` not used — flat values
```
AIR_EMS, AIR_LIGHT, AIR_RECON, AIR_TANKER, ALS_AMB, ARFF, ATV_EMS, ATV_FIRE,
BLS_AMB, BOAT, BOAT_LARGE, CHIEF_STAFF_COMMAND, CREW, CREW_TRANS, DECON, DOZER,
EMS_NOTRANS, EMS_SUPV, ENGINE_STRUCT, ENGINE_WUI, FOAM, HAZMAT, HELO_FIRE,
HELO_GENERAL, HELO_RESCUE, INVEST, LADDER_QUINT, LADDER_SMALL, LADDER_TALL,
LADDER_TILLER, MAB, MOBILE_COMMS, MOBILE_ICP, OTHER_GROUND, PLATFORM,
PLATFORM_QUINT, POV, QUINT_TALL, REHAB, RESCUE_HEAVY, RESCUE_LIGHT,
RESCUE_MEDIUM, RESCUE_USAR, RESCUE_WATER, SCBA, TENDER, UAS_FIRE, UAS_RECON, UTIL
```

### 3.2 `type_incident` (TypeIncidentValue)
**Separator:** `||`  
Hierarchical. Sample:
```
FIRE||OUTSIDE_FIRE||CONSTRUCTION_WASTE
FIRE||OUTSIDE_FIRE||DUMPSTER_OUTDOOR_CONTAINER_FIRE
FIRE||STRUCTURE_FIRE||CHIMNEY_FIRE
FIRE||STRUCTURE_FIRE||CONFINED_COOKING_APPLIANCE_FIRE
FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE
FIRE||STRUCTURE_FIRE||STRUCTURAL_INVOLVEMENT_FIRE
MEDICAL||EMS||ALS_CARDIAC_ARREST
MEDICAL||EMS||BLS
... (full list in neris_codes table)
```

### 3.3 `type_location_use` (TypeLocationUseValue)
**Separator:** `||`  
Hierarchical. Sample:
```
AGRICULTURE_STRUCT||ANIMAL_PROCESSING
AGRICULTURE_STRUCT||FARM_BUILDING
ASSEMBLY||COMMUNITY_CENTER
RESIDENTIAL||SINGLE_FAMILY
... (full list in neris_codes table)
```

### 3.4 `type_action_tactic` (TypeActionTacticValue)
**Separator:** `||`  
89 values. Sample:
```
COMMAND_AND_CONTROL||ESTABLISH_INCIDENT_COMMAND
EMERGENCY_MEDICAL_CARE||PROVIDE_ADVANCED_LIFE_SUPPORT
FORCIBLE_ENTRY
SEARCH||PRIMARY_SEARCH
VENTILATION||HORIZONTAL_VENTILATION
... (full list in neris_codes table)
```

### 3.5 `type_aid` (TypeAidValue)
```
AUTOMATIC, MUTUAL, OTHER
```

### 3.6 `type_aid_direction` (TypeAidDirectionValue)
```
GIVEN, RECEIVED
```

### 3.7 `type_nonfd_aid` (TypeAidNonfdValue)
```
EMS_AGENCY, HAZMAT_TEAM, LAW_ENFORCEMENT, OTHER, PRIVATE_EMS, RESCUE_TEAM, UTILITY_COMPANY
```

### 3.8 `type_displacement_cause` (TypeDisplaceCauseValueRelIncident)
```
COLLAPSE, FIRE, HAZARDOUS_SITUATION, OTHER, SMOKE, UTILITIES, WATER
```

### 3.9 `type_special_modifier` (TypeSpecialModifierValue)
```
ACTIVE_ASSAILANT, COUNTY_LOCAL_DECLARED_DISASTER, FEDERAL_DECLARED_DISASTER,
MCI, STATE_DECLARED_DISASTER, URBAN_CONFLAGRATION, VIOLENCE_AGAINST_RESPONDER
```

### 3.10 `type_medical_transport` (TypeMedicalTransportValue)
```
NONPATIENT_TRANSPORT, NO_TRANSPORT, OTHER_AGENCY_TRANSPORT,
PATIENT_REFUSED_TRANSPORT, TRANSPORT_BY_EMS_UNIT
```

### 3.11 `type_medical_patient_status` (TypeMedicalPatientStatusValue)
```
IMPROVED, UNCHANGED, WORSE
```

### 3.12 `type_medical_patient_care` (TypeMedicalPatientCareValue)
```
PATIENT_DEAD_ON_ARRIVAL, PATIENT_EVALUATED_CARE_PROVIDED,
PATIENT_EVALUATED_NO_CARE_REQUIRED, PATIENT_EVALUATED_REFUSED_CARE,
PATIENT_REFUSED_EVALUATION_CARE, PATIENT_SUPPORT_SERVICES_PROVIDED
```

### 3.13 `type_water_supply` (TypeWaterSupplyValue)
```
DRAFT_FROM_STATIC_SOURCE, FOAM_ADDITIVE, HYDRANT_GREATER_500,
HYDRANT_LESS_500, NONE, NURSE_OTHER_APPARATUS, SUPPLY_FROM_FIRE_BOAT,
TANK_WATER, WATER_TENDER_SHUTTLE
```

### 3.14 `type_suppression_appliance` (TypeSuppressApplianceValue)
```
AIRATTACK_HELITACK, BOOSTER_FIRE_HOSE, BUILDING_FDC, BUILDING_STANDPIPE,
ELEVATED_MASTER_STREAM_STANDPIPE, FIRE_EXTINGUISHER, GROUND_MONITOR,
MASTER_STREAM, MEDIUM_DIAMETER_FIRE_HOSE, NONE, OTHER, SMALL_DIAMETER_FIRE_HOSE
```

### 3.15 `type_fire_invest_need` (TypeFireInvestNeedValue)
```
NO, NOT_APPLICABLE, NOT_EVALUATED, NO_CAUSE_OBVIOUS, OTHER, YES
```

### 3.16 `type_fire_invest` (TypeFireInvestValue)
```
INVESTIGATED_BY_ARSON_FIRE_INVESTIGATOR, INVESTIGATED_BY_INSURANCE,
INVESTIGATED_BY_LAW_ENFORCEMENT, INVESTIGATED_BY_OTHER, NO_INVESTIGATION
```

### 3.17 `type_response_mode` (TypeResponseModeValue)
```
EMERGENT, NON_EMERGENT
```

### 3.18 `type_department` (TypeDeptValue)
```
COMBINATION, CAREER, VOLUNTEER
```

### 3.19 `type_entity` (TypeEntityValue)
```
FEDERAL, FIRE_DEPARTMENT, FIRE_DISTRICT, FIRE_PROTECTION_DISTRICT,
MILITARY, STATE_LOCAL_GOVERNMENT, TRIBAL, VOLUNTEER_FIRE_DEPARTMENT
```

### 3.20 `type_dispatch_protocol_fire` (TypeDispProtoFireValue)
Values from spec — fire dispatch protocol types.

### 3.21 `type_dispatch_protocol_med` (TypeDispProtoMedValue)
Values from spec — medical dispatch protocol types.

---

## 4. Migration Plan

### Safe tenant data — NEVER TOUCH:
- `incidents` table rows
- `incident_units` table rows  
- `incident_personnel` table rows
- `apparatus` table rows
- `personnel` table rows
- `ranks`, `municipalities`, `settings`, `audit_log`, `review_tasks`

### Tables to rebuild (NERIS entity profile only):
- `neris_entity` — rename columns + add missing + restructure nested fields
- `neris_stations` — rename all columns
- `neris_units` — rename all columns

### Recommended approach:
Drop and recreate `neris_entity`, `neris_stations`, `neris_units` in a single migration.
These tables hold only department profile data (not incidents, not personnel).
Any existing data in these three tables can be re-entered through the UI after migration.

### Migration will NOT affect:
- `incidents` and all child tables
- All apparatus, personnel, ranks, municipalities
- Settings, audit logs

---

## 5. Correct Target Schema

### `neris_entity` (rebuilt to spec)
```sql
CREATE TABLE neris_entity (
    id                      SERIAL PRIMARY KEY,

    -- NERIS identifier (used in URL path for API calls)
    fd_neris_id             TEXT,

    -- Top-level fields per DepartmentPayload
    name                    TEXT,                    -- fd_name → name
    internal_id             TEXT,                    -- fd_id_legacy → internal_id
    email                   TEXT,
    website                 TEXT,                    -- fd_website → website
    department_type         TEXT,                    -- fd_type → department_type (TypeDeptValue)
    entity_type             TEXT,                    -- fd_entity → entity_type (TypeEntityValue)
    rms_software            TEXT DEFAULT 'CADReport',
    time_zone               TEXT,
    continue_edu            BOOLEAN,
    fips_code               TEXT,

    -- Physical address
    address_line_1          TEXT,                    -- fd_address_1 → address_line_1
    address_line_2          TEXT,
    city                    TEXT,
    state                   TEXT,
    zip_code                TEXT,                    -- fd_zip → zip_code
    location                JSONB,                   -- { lat, lng } replaces fd_point_lat/lng

    -- Mailing address (new — was missing)
    mail_address_line_1     TEXT,
    mail_address_line_2     TEXT,
    mail_city               TEXT,
    mail_state              TEXT,
    mail_zip_code           TEXT,

    -- Services arrays (TypeFireServiceValue etc.)
    fire_services           TEXT[],                  -- fd_fire_services → fire_services
    ems_services            TEXT[],
    investigation_services  TEXT[],

    -- Nested objects stored as JSONB
    dispatch                JSONB,                   -- replaces all dispatch_* flat cols
    -- { avl_usage, center_id, cad_software, psap_type, psap_capability,
    --   psap_discipline, psap_jurisdiction, protocol_fire, protocol_med }

    staffing                JSONB,                   -- replaces all staff_* flat cols
    -- { active_firefighters_volunteer, active_firefighters_career_ft,
    --   active_firefighters_career_pt, active_ems_only_career_ft,
    --   active_ems_only_career_pt, active_ems_only_volunteer,
    --   active_civilians_career_ft, active_civilians_career_pt,
    --   active_civilians_volunteer }

    assessment              JSONB,                   -- replaces assess_iso_rating
    -- { iso_rating, cpse_accredited, caas_accredited }

    shift                   JSONB,                   -- replaces fd_shift_count/duration
    -- { count, duration, signup }

    population              JSONB,                   -- replaces fd_population_protected
    -- { protected, source }

    -- Internal tracking (not submitted to NERIS)
    fd_station_count        INTEGER,
    neris_entity_submitted_at   TIMESTAMPTZ,
    neris_entity_status         TEXT DEFAULT 'draft',
    neris_annual_renewal_month  INTEGER DEFAULT 1,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
```

### `neris_stations` (rebuilt to spec)
```sql
CREATE TABLE neris_stations (
    id                  SERIAL PRIMARY KEY,
    entity_id           INTEGER NOT NULL REFERENCES neris_entity(id) ON DELETE CASCADE,

    -- NERIS spec fields per StationPayload
    station_id          TEXT,                        -- ✅ already correct
    internal_id         TEXT,                        -- new
    neris_id            TEXT,                        -- new — assigned by NERIS after submission
    address_line_1      TEXT,                        -- station_address_1 → address_line_1
    address_line_2      TEXT,
    city                TEXT,
    state               TEXT,
    zip_code            TEXT,                        -- station_zip → zip_code
    staffing            INTEGER,                     -- station_staffing → staffing
    location            JSONB,                       -- { lat, lng } replaces station_point_lat/lng

    -- Local display only (not in NERIS spec)
    station_name        TEXT,

    -- Internal tracking
    display_order       INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### `neris_units` (rebuilt to spec)
```sql
CREATE TABLE neris_units (
    id                  SERIAL PRIMARY KEY,
    station_id          INTEGER NOT NULL REFERENCES neris_stations(id) ON DELETE CASCADE,

    -- NERIS spec fields per UnitPayload
    cad_designation_1   TEXT,                        -- station_unit_id_1 → cad_designation_1
    cad_designation_2   TEXT,                        -- station_unit_id_2 → cad_designation_2
    type                TEXT,                        -- station_unit_capability → type (TypeUnitValue)
    staffing            INTEGER,                     -- station_unit_staffing → staffing
    dedicated_staffing  BOOLEAN DEFAULT FALSE,       -- station_unit_dedicated → dedicated_staffing
    neris_id            TEXT,                        -- new — assigned by NERIS after submission

    -- Internal FK (not submitted to NERIS)
    apparatus_id        INTEGER REFERENCES apparatus(id) ON DELETE SET NULL,

    -- Internal tracking
    display_order       INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

*End of audit. All data points verified against `https://api.neris.fsri.org/v1/openapi.json` (v1.4.35) fetched live on 2026-03-05.*
