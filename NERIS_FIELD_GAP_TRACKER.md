# NERIS Field Gap Tracker — Updated from OpenAPI v1.4.34

## Purpose
Track every NERIS API field not yet accounted for in the NERIS page UI or database.
Source of truth: NERIS_OPENAPI_SCHEMA.md (extracted from live API)

---

## Gap Status Key
- 🔴 NO UI, NO DB FIELD — needs schema + UI
- 🟡 DB FIELD EXISTS, UI INCOMPLETE — needs deeper UI or field name correction
- 🟢 RESOLVED — confirmed placement, field accounted for
- ⚠️ CORRECTION — our build spec had wrong field names or structure

---

## SECTION: base (IncidentBasePayload) — always shown

### Gap 26: people_present 🟢 RESOLVED
**API field:** base.people_present (boolean|null)
**Our DB field:** neris_people_present
**Placement:** BaseInformation section — CORRECT
**Notes:** Was in base all along.

### Gap 27: displacement_count + displacement_causes 🟡
**API fields:** base.displacement_count (integer), base.displacement_causes (array)
**Our DB field:** neris_displaced_number (count only)
**Placement:** BaseInformation section — CORRECT
**MISSING:** displacement_causes array. NERIS wants CAUSES of displacement, not just count.
**Action:** Add displacement_causes multi-select. Values: TypeDisplaceCauseValueRelIncident (need to extract enum values).

### Gap 28: animals_rescued 🟢 RESOLVED
**API field:** base.animals_rescued (integer|null)
**Our DB field:** neris_rescue_animal
**Placement:** Confirmed in BASE, not casualty_rescues. Remove from CasualtyRescues section if duplicated.

### Gap 29: impediment_narrative 🟢 RESOLVED
**API field:** base.impediment_narrative (string|null)
**Our DB field:** neris_narrative_impedance
**Placement:** BaseInformation section — CORRECT

### Gap 30: outcome_narrative 🟢 RESOLVED
**API field:** base.outcome_narrative (string|null)
**Confirmed in base.

### Gap 31: base.polygon 🔴 NEW
**API field:** base.polygon (GeoPolygon|null)
**Notes:** Likely for wildfire perimeter. Low priority. Skip for V1 UI, handle in payload builder if data available.

---

## SECTION: Fire Detail (fire_detail → FirePayload) — gated on FIRE|| types

### Gap 1: fire_detail.location_detail.type 🟡
**API field:** fire_detail.location_detail.type — DISCRIMINATOR
**Values:** STRUCTURE / OUTSIDE / TRANSPORTATION (determines which sub-schema)
**Notes:** Auto-derivable from incident subtype. STRUCTURE_FIRE → STRUCTURE, etc.

### Gap 2: fire_detail.location_detail.progression_evident 🔴
**API field:** StructureFireLocationDetailPayload.progression_evident (boolean|null)
**Notes:** Only for structure fires. Simple yes/no.

### Gap 3: fire_detail.water_supply 🔴
**API field:** FirePayload.water_supply (string|null)
**Values:** HYDRANT_LESS_500, HYDRANT_GREATER_500, TANK_WATER, WATER_TENDER_SHUTTLE, DRAFT_FROM_STATIC_SOURCE, NURSE_OTHER_APPARATUS, SUPPLY_FROM_FIRE_BOAT, FOAM_ADDITIVE, NONE

### Gap 4: fire_detail.suppression_appliances 🔴
**API field:** FirePayload.suppression_appliances (array|null)
**Values:** SMALL_DIAMETER_FIRE_HOSE, MEDIUM_DIAMETER_FIRE_HOSE, LARGE_DIAMETER_FIRE_HOSE, BOOSTER_FIRE_HOSE, MASTER_STREAM, PORTABLE_EXTINGUISHER, HAND_TOOL

### Gap 32: Outside fire has extra fields 🔴 NEW
**API schema:** OutsideFirePayload has: acres_burned, cause, contributing_activities, elevation, fire_aspect, flame_length, fuel_arrangement, fuel_distribution, fuel_size, general_cause, incident_complexity, incident_end, incident_name, incident_start, minor_involved, open_burning, polygon, rate_of_spread, relative_position
**Notes:** Wildfire/outside fire is a BIG module. Way more than our current FireDetail handles. Separate sub-form needed when fire type = OUTSIDE.

### Gap 33: StructureFireOriginPayload 🔴 NEW
**API schema has:** cause, contributing_hazards, cooking_fire_suppression, fire_alarm, fire_spread, fire_suppression, general_cause, initial_detection, interstitial_space, + more
**Notes:** This is a deeper layer for structure fires — origin investigation detail. Partially overlaps with our alarm/suppression sections but structured differently in the API.

---

## SECTION: Medical Detail — gated on MEDICAL|| types

### ⚠️ CORRECTIONS FROM API:
- Top-level field is **medical_details** (PLURAL, not medical_detail)
- **patient_care_evaluation** (not "evaluation_care")
- **transport_disposition** (not "disposition")
- **patient_care_report_id** (not "patient_care_report")

### Gap 5: patient_care_report_id 🔴
**API field:** medical_details.patient_care_report_id (string|null)

### Gap 6: transport_disposition 🔴
**API field:** medical_details.transport_disposition (string|null)
**Values:** TRANSPORTED_ALS, TRANSPORTED_BLS, TRANSPORTED_BY_OTHER, REFUSED_TRANSPORT, NO_TRANSPORT, TREATED_RELEASED, DEAD_ON_ARRIVAL, DEAD_AFTER_RESUSCITATION, TRANSFERRED_CARE

### Gap 7: patient_status 🔴
**API field:** medical_details.patient_status (string|null)

### Gap 34: patient_care_evaluation 🟡 NEW
**API field:** medical_details.patient_care_evaluation (string|null)
**Notes:** We have neris_medical_patient_care but need to verify it maps to this correctly.

---

## SECTION: medical_oxygen_hazard — ⚠️ ENTIRELY NEW MODULE

### Gap 35: medical_oxygen_hazard 🔴 NEW
**API field:** medical_oxygen_hazard.presence (string)
**Values:** Likely PRESENT / NOT_PRESENT / UNKNOWN
**Notes:** Not in any of our spec docs. Was medical oxygen a hazard at the incident? Could be relevant on ANY incident type where oxygen is in use (EMS, medical, even fires). Needs research on when to show — possibly question-gated like emerging hazards.

---

## SECTION: Location Use (location_use) — in base

### Gap 8: vacancy_cause 🔴
**API field:** location_use.vacancy_cause (string|null)

### Gap 9: secondary_use 🔴
**API field:** location_use.secondary_use (string|null)

### Gap 10: in_use 🔴
**API field:** location_use.in_use (boolean|null)
**Note:** API has this as boolean directly, not nested {in_use: {in_use: true}}

---

## SECTION: Mutual Aid — future full module

### Gap 11: nonfd_aids 🔴
**API field:** nonfd_aids (top-level array of strings)

---

## SECTION: Casualty & Rescue — question-gated on all types

### Gap 12: casualty_rescues full detail 🔴 MAJOR REBUILD
**API structure per entry:**
```
type                     CIVILIAN / FIREFIGHTER
birth_month_year         string|null
gender                   string|null
race                     string|null
rank                     string|null         *** FF only — NEW ***
years_of_service         integer|null        *** FF only — NEW ***
casualty                 CasualtyPayload|null
  → injury_or_noninjury   discriminated (InjuryPayload or NonInjuryPayload)
rescue                   RescuePayload|null
  → ffrescue_or_nonffrescue  discriminated
  → mayday               boolean|null       *** NEW ***
  → presence_known        boolean|null       *** NEW ***
```
**Notes:** 
- Rescue is discriminated: FF rescues have actions, impediments, removal details. Non-FF rescues just have type.
- Casualty is discriminated: injury vs non-injury.
- FF entries get rank and years_of_service.
- mayday and presence_known are new fields on rescue.

---

## SECTION: Emerging Hazards — question-gated on all types

### Gap 13: electric_hazards 🟡 NEEDS REBUILD
**API structure per entry:**
```
type                     string (battery/EV/ESS type)
source_or_target         SOURCE / TARGET
involved_in_crash        boolean|null
fire_details             ElectricHazardFirePayload|null
  → reignition           boolean|null
  → suppression_types    array|null
```
**⚠️ CORRECTION:** No "category" or "subtype" fields in API. Just type, source_or_target, crash, and fire_details.

### Gap 14: powergen_hazards 🟡 NEEDS REBUILD
**API structure — discriminated:**
- PvPowergenHazardPayload: type=SOLAR_PV, pv_type, source_or_target
- OtherPowergenHazardPayload: type=WIND/GENERATOR/FUEL_CELL
**⚠️ CORRECTION:** source_or_target (not "pv_ignition"). Discriminated by type.

### Gap 15: csst_hazard 🟡 NEEDS UPDATE
**API fields:**
```
ignition_source          boolean|null
lightning_suspected      string YES/NO/UNKNOWN    *** was "lightning" ***
grounded                 string YES/NO/UNKNOWN
```
**⚠️ CORRECTION:** Field is lightning_suspected, not lightning.

---

## SECTION: Hazmat Detail (hazsit_detail) — gated on HAZSIT|| types

### Gap 16: chemicals[] expanded 🟡
**API structure per chemical:**
```
dot_class                string
name                     string
release_occurred         boolean|null
release                  object|null (release details sub-object — need to extract)
```
**Notes:** API has "release" as a sub-object, not flat fields. Need to extract ReleasePayload schema.

---

## SECTION: Dispatch — auto-populated + editable

### Gap 17: dispatch.comments 🟡
**API field:** dispatch.comments (array|null)

### Gap 18: dispatch.determinant_code 🔴
**API field:** dispatch.determinant_code (string|null)

### Gap 19: dispatch.incident_code 🟡
**API field:** dispatch.incident_code (string|null)
**Maps to:** cad_event_type

### Gap 20: dispatch.automatic_alarm 🔴
**API field:** dispatch.automatic_alarm (boolean|null)

### Gap 21: dispatch.incident_clear 🟡
**API field:** dispatch.incident_clear (datetime|null)
**Maps to:** time_last_cleared

### Gap 36: dispatch.disposition 🔴 NEW
**API field:** dispatch.disposition (string|null)
**Notes:** Dispatch disposition — how was the call resolved from dispatch perspective?

### Gap 37: dispatch.center_id 🔴 NEW
**API field:** dispatch.center_id (string|null)
**Notes:** PSAP center identifier. Could be auto-populated per tenant config.

### Gap 38: dispatch.tactic_timestamps 🟡
**API nested object inside dispatch:**
```
command_established, completed_sizeup, extrication_complete,
fire_knocked_down, fire_under_control, primary_search_begin,
primary_search_complete, suppression_complete, water_on_fire
```
**Notes:** We have TacticTimestamps display. Verify field names match API exactly.

---

## SECTION: Alarms & Suppression — gated on STRUCTURE_FIRE

### Gap 22: smoke_alarm.post_alarm_action 🔴
(unchanged)

---

## SECTION: Unit Responses

### Gap 23: staffing (was unit_staffing_reported) 🔴
**API field:** unit_responses[].staffing (integer|null)
**⚠️ CORRECTION:** Field name is "staffing", not "unit_staffing_reported"

### Gap 24: med_responses 🔴
**API fields per med_response:**
```
at_patient, enroute_to_hospital, arrived_at_hospital,
hospital_cleared, hospital_destination, transferred_to_agency, transferred_to_facility
```
**⚠️ CORRECTION:** Field names differ from our spec (time_ prefix removed).

### Gap 39: staging 🔴 NEW
**API field:** unit_responses[].staging (datetime|null)
**Notes:** When unit staged (before proceeding to scene). New timestamp.

### Gap 40: canceled_enroute 🔴 NEW
**API field:** unit_responses[].canceled_enroute (boolean|null)
**Notes:** Distinct from unable_to_dispatch. Unit was dispatched but canceled before arrival.

### Gap 41: unit_responses at TOP LEVEL vs dispatch 🔴 NEW
**API structure:** unit_responses exists at TWO levels:
- dispatch.unit_responses = units that were DISPATCHED
- (top-level) unit_responses = units that ACTUALLY RESPONDED
**Notes:** In many cases identical, but a unit dispatched that was canceled wouldn't appear in top-level. Payload builder needs to handle this distinction.

---

## SECTION: Incident Classification

### Gap 25: special_modifiers 🔴
**API field:** special_modifiers (top-level node)
**Values:** Active Assailant, Mass Casualty, Federal/State/County Disaster, Urban Conflagration, Violence Against Responder
**Notes:** Need to extract SpecialModifiersPayload schema for exact field structure.

### Gap 42: incident_types as top-level 🟡 NEW
**API field:** incident_types (top-level array, separate from base)
**Structure:** [{type: "FIRE||STRUCTURE_FIRE||...", primary: true}]
**Notes:** Our current code may nest this in base. Payload builder needs to put it at top level.

---

## SECTION: Exposures — gated on FIRE types

### Gap 43: Exposures full rebuild 🔴 NEW — MAJOR
**API structure per exposure:**
```
damage_type              string
displacement_causes      array|null
displacement_count       integer|null
location                 LocationPayload (full NG911 address!)
location_detail          INTERNAL or EXTERNAL (discriminated)
location_use             LocationUsePayload|null
people_present           boolean|null
point                    GeoPoint|null
polygon                  GeoPolygon|null
```
**Notes:** Each exposure is practically a mini-incident with its own address, location use, and displacement data. Our current simple {exposure_type, exposure_item, address} is nowhere close. This needs a full form per exposure entry with address parsing, location use, damage assessment, etc.

---

## FEATURE: Incident Templates
(unchanged from previous version)

---

## RUNNING TOTAL
- 🔴 New gaps / no UI: 24
- 🟡 Needs correction or deeper UI: 10
- 🟢 Resolved / confirmed: 4 (people_present, animals_rescued, impediment_narrative, outcome_narrative)
- ⚠️ Critical API corrections: 18 field name / structure differences
- Total tracked items: 43

## STILL NEED TO EXTRACT FROM API
- TypeDisplaceCauseValueRelIncident enum values
- SpecialModifiersPayload exact fields
- ReleasePayload (chemical release details)
- InjuryPayload / NonInjuryPayload (casualty detail)
- FfRescueRemovalPayload / NonRemovalPayload
- ExternalExposurePayload / InternalExposurePayload
- Top-level tactic_timestamps vs dispatch.tactic_timestamps
- OutsideFirePayload full field list (wildfire)
- StructureFireOriginPayload full field list
- SmokeAlarmPayload / FireAlarmPayload / OtherAlarmPayload / FireSuppressionPayload exact fields

*Last updated: March 3, 2026 — from OpenAPI v1.4.34*
