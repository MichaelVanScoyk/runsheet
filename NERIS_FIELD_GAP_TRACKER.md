# NERIS Field Gap Tracker — Updated from OpenAPI v1.4.34
# Source of truth: NERIS_OPENAPI_SCHEMA.md (extracted from live API)
# Last updated: March 3, 2026

---

## Gap Status Key
- 🔴 NO UI, NO DB FIELD — needs schema + UI
- 🟡 DB FIELD EXISTS, UI INCOMPLETE — needs deeper UI or field name correction
- 🟢 RESOLVED — confirmed placement, field accounted for
- ⚠️ CORRECTION — our build spec had wrong field names or structure
- 🔧 PAYLOAD BUILDER — backend fix only, no UI change

---

## ORIGINAL 25 GAPS

### Gap 1: nonfd_aids 🔴
**API location:** TOP LEVEL on IncidentPayload (same level as base, dispatch, fire_detail)
**Type:** Array of strings
**Values:** UTILITIES_PUBLIC_WORKS, LAW_ENFORCEMENT, EMS, HOUSING_SERVICES, MENTAL_HEALTH, SOCIAL_SERVICES, RED_CROSS, CORONER_MEDICAL_EXAMINER, FIRE_MARSHAL, OTHER_GOVERNMENT, PRIVATE_CONTRACTOR
**UI:** Multi-select checklist. "Which non-fire agencies assisted?"
**Notes:** Highly desired by NERIS. Part of future mutual aid module but could be its own small section. Separate from interagency FD aids.

### Gap 2: fire_detail.location_detail.type 🔴
**API location:** Inside fire_detail → FirePayload → location_detail (discriminator field)
**Type:** String — STRUCTURE / OUTSIDE / TRANSPORTATION
**UI:** Determines which sub-schema fires use. Could auto-derive from incident subtype — STRUCTURE_FIRE → STRUCTURE, OUTSIDE_FIRE → OUTSIDE, TRANSPORTATION_FIRE → TRANSPORTATION.
**Sub-schemas:**
- StructureFireLocationDetailPayload: arrival_condition, cause, damage_type, floor_of_origin, progression_evident, room_of_origin_type
- OutsideFireLocationDetailPayload: acres_burned, cause
- TransportationFireLocationDetailPayload: (not yet extracted)

### Gap 3: fire_detail.location_detail.progression_evident 🔴
**API location:** Inside fire_detail → location_detail → StructureFireLocationDetailPayload ONLY
**Type:** Boolean|null
**UI:** Yes/no field. Was fire progression evident on arrival? Pairs with arrival_condition. Only for structure fires.

### Gap 4: fire_detail.water_supply 🔴
**API location:** Inside fire_detail → FirePayload (direct child)
**Type:** String|null — single value
**Values:** HYDRANT_LESS_500, HYDRANT_GREATER_500, TANK_WATER, WATER_TENDER_SHUTTLE, DRAFT_FROM_STATIC_SOURCE, NURSE_OTHER_APPARATUS, SUPPLY_FROM_FIRE_BOAT, FOAM_ADDITIVE, NONE
**UI:** Dropdown. Very relevant for Glen Moore / rural departments where tanker shuttle vs hydrant is a major operational distinction.

### Gap 5: fire_detail.suppression_appliances 🔴
**API location:** Inside fire_detail → FirePayload (direct child)
**Type:** Array|null
**Values:** SMALL_DIAMETER_FIRE_HOSE, MEDIUM_DIAMETER_FIRE_HOSE, LARGE_DIAMETER_FIRE_HOSE, BOOSTER_FIRE_HOSE, MASTER_STREAM, PORTABLE_EXTINGUISHER, HAND_TOOL
**UI:** Multi-select. Most structure fires = small diameter + maybe medium.

### Gap 6: medical_details.patient_care_report_id 🔴
**API location:** Inside medical_details → MedicalPayload (direct child)
**Type:** String|null
**UI:** Text field. PCR number. Optional — many volunteer departments may not have PCR numbers.
**⚠️ CORRECTIONS:**
- API field name is `patient_care_report_id` (NOT patient_care_report)
- Parent node is `medical_details` (PLURAL, NOT medical_detail)

### Gap 7: medical_details.transport_disposition 🔴
**API location:** Inside medical_details → MedicalPayload (direct child)
**Type:** String|null
**Values:** TRANSPORTED_ALS, TRANSPORTED_BLS, TRANSPORTED_BY_OTHER, REFUSED_TRANSPORT, NO_TRANSPORT, TREATED_RELEASED, DEAD_ON_ARRIVAL, DEAD_AFTER_RESUSCITATION, TRANSFERRED_CARE
**UI:** Dropdown. Critical field for EMS reporting.
**⚠️ CORRECTION:** API field name is `transport_disposition` (NOT disposition)

### Gap 8: medical_details.patient_status 🔴
**API location:** Inside medical_details → MedicalPayload (direct child)
**Type:** String|null
**Values:** IMPROVED, UNCHANGED, DETERIORATED, NOT_APPLICABLE
**UI:** Dropdown. Pairs with transport_disposition.

### Gap 9: location_use.vacancy_cause 🔴
**API location:** Inside base → location_use → LocationUsePayload (direct child)
**Type:** String|null — conditional on vacant
**Values:** NEW_CONSTRUCTION_REMODEL, UNDER_RENOVATION, CONDEMNED, SEASONAL, FOR_SALE_RENT, FORECLOSURE, UNKNOWN
**UI:** Dropdown. Only show if location is vacant. Needs gate from in_use = false or vacancy indicator.

### Gap 10: location_use.secondary_use 🔴
**API location:** Inside base → location_use → LocationUsePayload (direct child)
**Type:** String|null
**UI:** Optional dropdown. Same hierarchy as primary use_type from neris_codes. Example: house with home office, church with daycare.

### Gap 11: location_use.in_use 🔴
**API location:** Inside base → location_use → LocationUsePayload (direct child)
**Type:** Boolean|null — FLAT, not nested
**UI:** Yes/no field. Was location being used as intended? Vacant house = no. School at night = no. Business during hours = yes.
**⚠️ CORRECTION:** API has this as flat boolean, NOT nested {in_use: {in_use: true}} as our spec docs showed.

### Gap 12: casualty_rescues full detail 🔴 MAJOR REBUILD
**API location:** TOP LEVEL on IncidentPayload (array of CasualtyRescuePayload)
**Current state:** We only store 3 count fields (neris_rescue_ff, neris_rescue_nonff, neris_rescue_animal). API wants individual records.
**Structure per entry:**
```
type                     CIVILIAN / FIREFIGHTER
birth_month_year         string|null ("03/1965")
gender                   MALE / FEMALE / NON_BINARY / UNKNOWN / NOT_REPORTED
race                     WHITE / BLACK_AFRICAN_AMERICAN / ASIAN / AMERICAN_INDIAN_ALASKA_NATIVE / NATIVE_HAWAIIAN_PACIFIC_ISLANDER / TWO_OR_MORE / OTHER / UNKNOWN / NOT_REPORTED
rank                     string|null (FF only) *** NEW from OpenAPI ***
years_of_service         integer|null (FF only) *** NEW from OpenAPI ***
casualty                 CasualtyPayload|null
  → injury_or_noninjury   discriminated → InjuryPayload or NonInjuryPayload
rescue                   RescuePayload|null
  → ffrescue_or_nonffrescue  discriminated → FfRescuePayload or NonFfRescuePayload
  → mayday               boolean|null *** NEW from OpenAPI ***
  → presence_known        boolean|null *** NEW from OpenAPI ***
```
**FfRescuePayload:** actions (array), impediments (array), removal_or_nonremoval (discriminated), type (string)
**NonFfRescuePayload:** type (string only)
**UI:** Needs list builder with "Add Casualty/Rescue" button → form card per person. DB needs JSONB array or child table.
**IMPORTANT:** "Think Numbers NOT Names" — NERIS explicitly says no PII. Demographics only, no names.
**NOTE:** animals_rescued is SEPARATE — confirmed in base node, NOT in casualty_rescues.

### Gap 13: electric_hazards full detail 🔴
**API location:** TOP LEVEL on IncidentPayload (array of ElectricHazardPayload)
**Structure per entry:**
```
type                     string (battery/EV/ESS type enum)
source_or_target         SOURCE / TARGET
involved_in_crash        boolean|null
fire_details             ElectricHazardFirePayload|null
  → reignition           boolean|null
  → suppression_types    array|null
```
**UI:** Needs full form per entry. Current UI has shallow checkboxes.
**⚠️ CORRECTION:** No "category" or "subtype" fields — those were in our spec docs but NOT in the actual API. Just type, source_or_target, crash, and fire_details.

### Gap 14: powergen_hazards full detail 🔴
**API location:** TOP LEVEL on IncidentPayload (array, discriminated by type)
**Structure — two sub-types:**
- PvPowergenHazardPayload: type=SOLAR_PV, pv_type (ROOF_MOUNTED/GROUND_MOUNTED/BUILDING_INTEGRATED), source_or_target (SOURCE/TARGET/NOT_INVOLVED)
- OtherPowergenHazardPayload: type=WIND/GENERATOR/FUEL_CELL
**UI:** Needs form per entry with type selector that shows different fields. Current UI only captures present/energized/ignition.
**⚠️ CORRECTION:** Field is `source_or_target` not "pv_ignition". Discriminated by type.

### Gap 15: csst_hazard full detail 🔴
**API location:** TOP LEVEL on IncidentPayload (single CsstHazardPayload, NOT array)
**Fields:**
```
ignition_source          boolean|null (was CSST the ignition source?)
lightning_suspected      string YES / NO / UNKNOWN
grounded                 string YES / NO / UNKNOWN
```
**UI:** Three fields. Current UI only captures present/damage.
**⚠️ CORRECTION:** Field is `lightning_suspected` NOT "lightning".

### Gap 16: dispatch.comments 🟡
**API location:** Inside dispatch → DispatchPayload (direct child)
**Type:** Array|null
**Current state:** We display comments in DispatchComments section. Need to verify payload builder sends them correctly as arrays with timestamps extracted from CAD comment parsing.

### Gap 17: dispatch.determinant_code 🔴
**API location:** Inside dispatch → DispatchPayload (direct child)
**Type:** String|null
**UI:** Text field. EMD/EFD code like "17-D-5". Chester County may or may not include this in CAD data. If available from CAD, auto-populate. If not, optional manual entry.

### Gap 18: dispatch.incident_code 🟡
**API location:** Inside dispatch → DispatchPayload (direct child)
**Type:** String|null — CAD nature code
**Current state:** We have `cad_event_type` which likely maps here. Need to verify in payload builder.

### Gap 19: dispatch.automatic_alarm 🔴
**API location:** Inside dispatch → DispatchPayload (direct child)
**Type:** Boolean|null
**UI:** Yes/no field. Was this triggered by an automatic alarm system? Could potentially auto-derive from CAD event type if it contains "ALARM" or "FALRM".

### Gap 20: dispatch.incident_clear 🟡
**API location:** Inside dispatch → DispatchPayload (direct child)
**Type:** Datetime|null — when dispatch closed the incident
**Current state:** We have `time_last_cleared` which likely maps here. Need to verify in payload builder.

### Gap 21: smoke_alarm.post_alarm_action 🔴
**API location:** Inside smoke_alarm → SmokeAlarmPayload (need to verify exact nesting — could be inside a "present" sub-object)
**Type:** String|null
**Values:** EVACUATED, ATTEMPTED_EXTINGUISHMENT, NOTIFIED_OTHERS, CALLED_911, NO_ACTION, UNKNOWN
**UI:** Dropdown. Only show when smoke alarm operated. What did occupants do after alarm sounded?

### Gap 22: hazsit_detail.chemicals[] expanded 🟡
**API location:** Inside hazsit_detail → HazsitPayload → chemicals array → ChemicalPayload
**Current state:** Each chemical entry has dot_class, name, release_occurred. API also has:
```
release                  sub-object ReleasePayload|null
  → physical_state       SOLID / LIQUID / GAS / UNKNOWN
  → release_cause        EQUIPMENT_FAILURE / HUMAN_ERROR / TRANSPORTATION_ACCIDENT / INTENTIONAL / NATURAL_PHENOMENON / UNKNOWN
  → release_into         AIR / GROUND / WATER / STRUCTURE / MULTIPLE / UNKNOWN
  → amount_est           number
  → amount_units         GALLONS / LITERS / POUNDS / KILOGRAMS / CUBIC_FEET / CUBIC_METERS / UNKNOWN
```
**UI:** Each chemical card needs 5 more fields inside a conditional release detail section (show when release_occurred = true).
**⚠️ CORRECTION:** API has "release" as a sub-object, not flat fields.

### Gap 23: unit_responses[].staffing 🔴
**API location:** TWO PLACES — dispatch → unit_responses[] AND top-level unit_responses[] (both DispatchUnitResponsePayload and IncidentUnitResponsePayload have it)
**Type:** Integer|null — personnel count per unit
**UI:** Number field per unit row. Could potentially pull from assignments (count non-null slots per apparatus).
**⚠️ CORRECTION:** Field name is "staffing" NOT "unit_staffing_reported".

### Gap 24: unit_responses[].med_responses 🔴
**API location:** TWO PLACES — dispatch → unit_responses[] AND top-level unit_responses[]
**Type:** Array of MedResponsePayload per unit
**Fields per med_response:**
```
at_patient               datetime|null
enroute_to_hospital      datetime|null
arrived_at_hospital      datetime|null
hospital_cleared         datetime|null
hospital_destination     string|null (hospital name)
transferred_to_agency    datetime|null
transferred_to_facility  datetime|null
```
**UI:** Expandable section per transport unit on MEDICAL incidents. Most timestamps manual entry — not available from CAD.
**⚠️ CORRECTION:** Field names have NO "time_" prefix (at_patient not time_at_patient, etc.)
**Notes:** Only relevant for transport units. Not all units will have med_responses.

### Gap 25: special_modifiers 🟢 BUILT — March 3, 2026
**API location:** TOP LEVEL on IncidentPayload (array of TypeSpecialModifierValue strings)
**Values:** ACTIVE_ASSAILANT, MCI, FEDERAL_DECLARED_DISASTER, STATE_DECLARED_DISASTER, COUNTY_LOCAL_DECLARED_DISASTER, URBAN_CONFLAGRATION, VIOLENCE_AGAINST_RESPONDER
**UI:** Multi-select checkboxes in BaseInformation section. Shows "None selected" hint when empty.
**DB column:** `neris_special_modifiers` TEXT[] DEFAULT '{}' (migration 033)
**Model:** models.py → Incident.neris_special_modifiers
**Payload:** builder.py → top-level `special_modifiers` array
**Frontend:** BaseInformation.jsx → SPECIAL_MODIFIERS checkbox list
**Notes:** Previously read from neris_additional_data JSONB. Now dedicated column. Most incidents = none selected. Rare but important.

---

## NEW GAPS FROM OPENAPI (26-35)

### Gap 26: base.displacement_causes 🟢 BUILT — March 3, 2026
**API location:** Inside base → IncidentBasePayload (direct child). ALSO exists per-exposure inside exposures[].
**Type:** Array of TypeDisplaceCauseValueRelIncident|null
**Values:** COLLAPSE, FIRE, HAZARDOUS_SITUATION, OTHER, SMOKE, UTILITIES, WATER
**DB column:** `neris_displacement_causes` TEXT[] DEFAULT '{}' (migration 033)
**Model:** models.py → Incident.neris_displacement_causes
**Payload:** payload_base.py → base.displacement_causes array
**Frontend:** BaseInformation.jsx → DISPLACEMENT_CAUSES checkbox list, conditionally shown when displaced count > 0
**Notes:** Per-exposure displacement_causes (in ExposurePayload) still needs to be handled separately in Gap 35 exposures rebuild.

### Gap 27: medical_oxygen_hazard 🟢 BUILT — March 3, 2026
**API location:** TOP LEVEL on IncidentPayload (MedicalOxygenHazardPayload)
**API structure:** `presence` is a discriminated object: {type: PRESENT} → MedicalOxygenHazardPresentPayload, {type: NOT_PRESENT} or {type: NOT_APPLICABLE} → MedicalOxygenHazardNotPresentPayload
**Values:** PRESENT, NOT_PRESENT, NOT_APPLICABLE
**DB column:** `neris_medical_oxygen_hazard` TEXT (migration 033)
**Model:** models.py → Incident.neris_medical_oxygen_hazard
**Payload:** builder.py → top-level `medical_oxygen_hazard: {presence: {type: <value>}}`
**Frontend:** BaseInformation.jsx → 4-way radio (Present / Not Present / N/A / Unknown where Unknown = null)
**Notes:** Entirely new module not in any prior spec docs. Was medical oxygen a hazard at the incident? Relevant on any incident type where oxygen is in use.

### Gap 28: dispatch.disposition 🔴
**API location:** Inside dispatch → DispatchPayload (direct child)
**Type:** String|null
**UI:** Dropdown or text field. How the call was resolved from dispatch perspective. Separate from medical transport_disposition.
**Notes:** No field, no DB column currently.

### Gap 29: dispatch.center_id 🔴
**API location:** Inside dispatch → DispatchPayload (direct child)
**Type:** String|null — PSAP center identifier
**UI:** Text field. Could auto-populate per tenant config since each department typically uses one dispatch center.
**Notes:** No field, no DB column currently.

### Gap 30: unit_responses[].staging 🔴
**API location:** TWO PLACES — dispatch → unit_responses[] AND top-level unit_responses[]
**Type:** Datetime|null — when unit staged before proceeding to scene
**UI:** Timestamp field per unit row.
**Notes:** New timestamp not in our spec docs.

### Gap 31: unit_responses[].canceled_enroute 🔴
**API location:** TWO PLACES — dispatch → unit_responses[] AND top-level unit_responses[]
**Type:** Boolean|null
**UI:** Checkbox per unit row.
**Notes:** Distinct from unable_to_dispatch. Unit was dispatched but canceled before arrival.

### Gap 32: OutsideFirePayload expanded fields 🔴 MAJOR
**API location:** Inside fire_detail → (replaces or supplements FirePayload for outside fires — exact nesting needs clarification)
**Fields:**
```
acres_burned             number|null
cause                    string
contributing_activities  (type unknown — need extraction)
elevation                (type unknown)
fire_aspect              (type unknown)
flame_length             (type unknown)
fuel_arrangement         (type unknown)
fuel_distribution        (type unknown)
fuel_size                (type unknown)
general_cause            (type unknown)
incident_complexity      (type unknown)
incident_end             datetime|null
incident_name            string|null
incident_start           datetime|null
minor_involved           (type unknown)
open_burning             (type unknown)
polygon                  GeoPolygon|null
rate_of_spread           (type unknown)
relative_position        (type unknown)
```
**UI:** Basically a separate wildfire reporting module. Needs its own sub-form when fire type = OUTSIDE.
**Notes:** Low priority for Chester County (mostly structure fires) but needed for full spec compliance.

### Gap 33: StructureFireOriginPayload expanded fields 🔴
**API location:** Nested inside structure fire detail (exact path needs clarification — could be inside fire_detail or inside location_detail for structures)
**Fields (partially extracted, was truncated):**
```
cause
contributing_hazards
cooking_fire_suppression
fire_alarm
fire_spread
fire_suppression
general_cause
initial_detection
interstitial_space
... more fields not yet extracted
```
**UI:** Deeper structure fire investigation detail. Partially overlaps with our existing alarm/suppression sections but structured differently in the API.
**TODO:** Full extraction from OpenAPI needed.

### Gap 34: casualty_rescues extra fields 🔴
**API location:** Inside casualty_rescues[] — additions to Gap 12 rebuild
**Fields on CasualtyRescuePayload (direct children):**
```
rank                     string|null (FF rank — FIREFIGHTER only)
years_of_service         integer|null (FF only)
```
**Fields on rescue → RescuePayload:**
```
mayday                   boolean|null (was mayday declared?)
presence_known           boolean|null (was victim's presence known before rescue?)
```
**Notes:** These are part of the Gap 12 major rebuild. Merge into that work.

### Gap 35: exposures full rebuild 🔴 MAJOR
**API location:** TOP LEVEL on IncidentPayload (array of ExposurePayload)
**Current state:** Simple rows with exposure_type, exposure_item, address. Nowhere close to spec.
**Structure per exposure:**
```
damage_type              string (exposure damage rating)
displacement_causes      array|null (same type as base.displacement_causes)
displacement_count       integer|null
location                 LocationPayload (FULL NG911 civic address!)
location_detail          discriminated INTERNAL_EXPOSURE or EXTERNAL_EXPOSURE
                         → InternalExposurePayload or ExternalExposurePayload
location_use             LocationUsePayload|null (same structure as base.location_use)
people_present           boolean|null
point                    GeoPoint|null
polygon                  GeoPolygon|null
```
**UI:** Each exposure is basically a mini-incident with its own full address, location use, damage assessment, displacement data. Needs address parsing, location use dropdowns, damage assessment per entry. Full form per exposure with "Add Exposure" button.
**Notes:** Fire-only (gated on FIRE types). "When fire spread to other properties."

---

## PAYLOAD BUILDER FIXES (36-38, no UI changes)

### Gap 36: incident_types as top-level 🔧
**API location:** TOP LEVEL on IncidentPayload (array of IncidentTypePayload) — NOT inside base
**Structure:** [{type: "FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE", primary: true}]
**Current state:** Our code may nest this inside base. Payload builder needs to put it at top level.
**Fix:** Backend only — move incident_types to top level in payload output.

### Gap 37: unit_responses dual-level 🔧
**API location:** dispatch.unit_responses = units that were DISPATCHED. Top-level unit_responses = units that ACTUALLY RESPONDED.
**Schema:** Both use same structure (IncidentUnitResponsePayload / DispatchUnitResponsePayload — same fields).
**Current state:** We probably only send one set.
**Fix:** Payload builder needs to populate both levels. In many cases identical, but a unit dispatched then canceled_enroute wouldn't appear at top level. Backend logic to split.

### Gap 38: dispatch.tactic_timestamps field name verification 🔧
**API location:** Inside dispatch → DispatchPayload → tactic_timestamps → DispatchTacticTimestampsPayload
**API field names:**
```
command_established
completed_sizeup
extrication_complete
fire_knocked_down
fire_under_control
primary_search_begin
primary_search_complete
suppression_complete
water_on_fire
```
**Fix:** Verify our TacticTimestamps section and DB columns use these exact names. If not, rename in payload builder mapping.

---

## RESOLVED ITEMS

### people_present 🟢
**API location:** Inside base → IncidentBasePayload (direct child). Boolean|null.
**Our DB field:** neris_people_present
**Status:** BaseInformation section — CORRECT placement.

### animals_rescued 🟢
**API location:** Inside base → IncidentBasePayload (direct child). Integer|null.
**Our DB field:** neris_rescue_animal
**Status:** Confirmed in BASE, not casualty_rescues. Remove from CasualtyRescues if duplicated.

### impediment_narrative 🟢
**API location:** Inside base → IncidentBasePayload (direct child). String|null.
**Our DB field:** neris_narrative_impedance
**Status:** BaseInformation section — CORRECT placement.

### outcome_narrative 🟢
**API location:** Inside base → IncidentBasePayload (direct child). String|null.
**Status:** Confirmed in base.

---

## FIELD NAME CORRECTIONS (apply when building payload)

| Our spec / DB name | Actual API field name | Location |
|---|---|---|
| medical_detail | medical_details (PLURAL) | top-level |
| evaluation_care | patient_care_evaluation | medical_details |
| disposition | transport_disposition | medical_details |
| patient_care_report | patient_care_report_id | medical_details |
| lightning | lightning_suspected | csst_hazard |
| unit_staffing_reported | staffing | unit_responses[] |
| pv_ignition | source_or_target | powergen_hazards[] |
| time_at_patient | at_patient | med_responses[] |
| time_enroute_hospital | enroute_to_hospital | med_responses[] |
| time_arrived_hospital | arrived_at_hospital | med_responses[] |
| in_use.in_use (nested) | in_use (flat boolean) | location_use |

---

## STILL NEED TO EXTRACT FROM API
- TypeDisplaceCauseValueRelIncident enum values (for gap 26)
- SpecialModifiersPayload exact fields (for gap 25)
- ReleasePayload exact structure (for gap 22 — partial info from our spec docs)
- InjuryPayload / NonInjuryPayload (casualty detail for gap 12)
- FfRescueRemovalPayload / NonRemovalPayload (rescue detail for gap 12)
- ExternalExposurePayload / InternalExposurePayload (for gap 35)
- Top-level tactic_timestamps vs dispatch.tactic_timestamps (may differ)
- OutsideFirePayload full field types (for gap 32)
- StructureFireOriginPayload full field list (for gap 33)
- SmokeAlarmPayload / FireAlarmPayload / OtherAlarmPayload exact nesting (for gap 21)
- TransportationFireLocationDetailPayload (for gap 2)

---

## RUNNING TOTAL
- 🔴 New / no UI: 24
- 🟡 Partial / needs verification: 4 (gaps 16, 18, 20, 22)
- 🟢 Resolved / confirmed placement: 4 (people_present, animals_rescued, impediment_narrative, outcome_narrative)
- 🟢 Built: 3 (gap 25 special_modifiers, gap 26 displacement_causes, gap 27 medical_oxygen_hazard)
- 🔧 Payload builder fixes: 3 (gaps 36, 37, 38)
- ⚠️ Field name corrections: 11 mappings
- **Total tracked: 38 gaps + 4 resolved + 11 corrections**
- **Built so far: 3 of 38 gaps (migration 033, March 3 2026)**

*Last updated: March 3, 2026 — gaps 25/26/27 built into BaseInformation section*
