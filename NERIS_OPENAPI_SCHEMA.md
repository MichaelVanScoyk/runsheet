# NERIS API v1.4.34 — Incident Payload Schema (from OpenAPI spec)
# Source: https://api-test.neris.fsri.org/v1/openapi.yaml
# Extracted: March 3, 2026

## TOP-LEVEL: IncidentPayload
```
actions_tactics          → ActionTacticPayload
aids                     → array of AidPayload
base                     → IncidentBasePayload              *** REQUIRED ***
casualty_rescues         → array of CasualtyRescuePayload
cooking_fire_suppression → CookingFireSuppressionPayload
csst_hazard              → CsstHazardPayload
dispatch                 → DispatchPayload                  *** REQUIRED ***
electric_hazards         → array of ElectricHazardPayload
exposures                → array of ExposurePayload
fire_alarm               → FireAlarmPayload
fire_detail              → FirePayload                      (conditional: FIRE type)
fire_suppression         → FireSuppressionPayload
hazsit_detail            → HazsitPayload                    (conditional: HAZSIT type)
incident_types           → array of IncidentTypePayload     *** REQUIRED ***
medical_details          → MedicalDetailsPayload??          (conditional: MEDICAL type — NOTE: PLURAL)
medical_oxygen_hazard    → MedicalOxygenHazardPayload       *** NEW — not in our spec docs ***
nonfd_aids               → array of strings
other_alarm              → OtherAlarmPayload
powergen_hazards         → array of PvPowergenHazardPayload / OtherPowergenHazardPayload
smoke_alarm              → SmokeAlarmPayload
special_modifiers        → SpecialModifiersPayload          *** NEW — incident modifiers ***
tactic_timestamps        → TacticTimestampPayload
unit_responses           → array of IncidentUnitResponsePayload
```

## NODE: base (IncidentBasePayload) — REQUIRED
```
animals_rescued          integer|null    Total number of animals rescued
department_neris_id      string          REQUIRED — FD42029593
displacement_causes      array|null      TypeDisplaceCauseValueRelIncident
displacement_count       integer|null    Number of people/businesses displaced
impediment_narrative     string|null     Impediment narrative
incident_number          string          REQUIRED — internal incident number
location                 LocationPayload REQUIRED — NG911 civic address
location_use             LocationUsePayload|null
outcome_narrative        string|null     Outcome narrative
people_present           boolean|null    Whether people were present
point                    GeoPoint|null   GeoJSON coordinates
polygon                  GeoPolygon|null (likely for wildfire)
```

## NODE: dispatch (DispatchPayload) — REQUIRED
```
automatic_alarm          boolean|null    Was this an automatic alarm?
call_answered            datetime        REQUIRED
call_arrival             datetime        REQUIRED
call_create              datetime        REQUIRED
center_id                string|null     PSAP center ID
comments                 array|null      Dispatch comments
determinant_code         string|null     EMD/EFD code
disposition              string|null     Dispatch disposition
incident_clear           datetime|null   When dispatch closed incident
incident_code            string|null     CAD nature/incident code
incident_number          string          REQUIRED — CAD event number
location                 LocationPayload REQUIRED
point                    GeoPoint|null
tactic_timestamps        DispatchTacticTimestampsPayload|null
unit_responses           array of DispatchUnitResponsePayload  REQUIRED
```

## NODE: dispatch.tactic_timestamps (DispatchTacticTimestampsPayload)
```
command_established      datetime|null
completed_sizeup         datetime|null
extrication_complete     datetime|null
fire_knocked_down        datetime|null
fire_under_control       datetime|null
primary_search_begin     datetime|null
primary_search_complete  datetime|null
suppression_complete     datetime|null
water_on_fire            datetime|null
```

## NODE: dispatch.unit_responses[] (DispatchUnitResponsePayload)
```
canceled_enroute         boolean|null
dispatch                 datetime|null
enroute_to_scene         datetime|null
med_responses            array of MedResponsePayload
on_scene                 datetime|null
point                    GeoPoint|null
reported_unit_id         string          E48, SQ48, etc.
response_mode            string          EMERGENT / NON_EMERGENT
staffing                 integer|null    *** NEW — personnel count ***
staging                  datetime|null   *** NEW — staging timestamp ***
transport_mode           string|null     EMERGENT / NON_EMERGENT (EMS)
unable_to_dispatch       boolean
unit_clear               datetime|null
unit_neris_id            string          REQUIRED — FD42029593S001U001
```

## NODE: unit_responses[] (IncidentUnitResponsePayload) — TOP LEVEL
Same fields as dispatch.unit_responses — represents units that ACTUALLY responded
(vs dispatch.unit_responses = units that were dispatched)

## NODE: dispatch.unit_responses[].med_responses[] (MedResponsePayload)
```
arrived_at_hospital      datetime|null
at_patient               datetime|null
enroute_to_hospital      datetime|null
hospital_cleared         datetime|null
hospital_destination     string|null     *** hospital name ***
transferred_to_agency    datetime|null
transferred_to_facility  datetime|null
```

## NODE: incident_types[] (IncidentTypePayload)
```
primary                  boolean         Is this the primary type?
type                     string          FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE
```

## NODE: fire_detail (FirePayload) — conditional on FIRE type
```
investigation_needed     string          YES / NO / UNABLE_TO_DETERMINE
investigation_types      array|null      Investigation type strings
location_detail          discriminated   → StructureFireLocationDetailPayload
                                         → OutsideFireLocationDetailPayload
                                         → TransportationFireLocationDetailPayload
suppression_appliances   array|null      Appliance type strings
water_supply             string|null     HYDRANT_LESS_500, etc.
```

## NODE: fire_detail.location_detail (StructureFireLocationDetailPayload)
```
arrival_condition        string          SMOKE_SHOWING, etc.
cause                    string          COOKING, ELECTRICAL, etc.
damage_type              string          MINOR_DAMAGE, etc.
floor_of_origin          integer|null
progression_evident      boolean|null
room_of_origin_type      string|null     KITCHEN, BEDROOM, etc.
type                     string          STRUCTURE (discriminator)
```

## NODE: fire_detail.location_detail (OutsideFireLocationDetailPayload)
```
acres_burned             number|null
cause                    string
type                     string          OUTSIDE (discriminator)
```

## NODE: StructureFireOriginPayload (nested in structure fire)
```
cause
contributing_hazards
cooking_fire_suppression
fire_alarm
fire_spread
fire_suppression
general_cause
initial_detection
interstitial_space   (truncated in extraction)
... more fields
```

## NODE: hazsit_detail (HazsitPayload) — conditional on HAZSIT type
```
chemicals                array of ChemicalPayload
disposition              string          CONTROLLED, REMOVED, etc.
evacuated                integer|null    Number evacuated
```

## NODE: hazsit_detail.chemicals[] (ChemicalPayload)
```
dot_class                string          CLASS_1 through CLASS_9
name                     string          Chemical name
release                  object|null     Release details sub-object
release_occurred         boolean|null
```

## NODE: medical_details (MedicalPayload) — conditional on MEDICAL type
NOTE: API field is "medical_details" (PLURAL), not "medical_detail"
```
patient_care_evaluation  string|null     ALS_TREATMENT, BLS_TREATMENT, etc.
patient_care_report_id   string|null     PCR number
patient_status           string|null     IMPROVED, UNCHANGED, etc.
transport_disposition    string|null     TRANSPORTED_ALS, REFUSED_TRANSPORT, etc.
```
NOTE: Field names differ from our spec docs:
  - "evaluation_care" → actually "patient_care_evaluation"
  - "disposition" → actually "transport_disposition"
  - "patient_care_report" → actually "patient_care_report_id"

## NODE: medical_oxygen_hazard (MedicalOxygenHazardPayload) — NEW
```
presence                 string          PRESENT / NOT_PRESENT / UNKNOWN ???
```
*** This is entirely new — not in our NERIS spec docs. Medical oxygen as hazard. ***

## NODE: casualty_rescues[] (CasualtyRescuePayload)
```
birth_month_year         string|null     "03/1965"
casualty                 CasualtyPayload|null
gender                   string|null     MALE, FEMALE, etc.
race                     string|null     WHITE, etc.
rank                     string|null     *** NEW — FF rank ***
rescue                   RescuePayload|null
type                     string          CIVILIAN / FIREFIGHTER
years_of_service         integer|null    *** NEW — FF years of service ***
```

## NODE: casualty_rescues[].casualty (CasualtyPayload)
```
injury_or_noninjury      discriminated   → InjuryPayload or NonInjuryPayload
```

## NODE: casualty_rescues[].rescue (RescuePayload)
```
ffrescue_or_nonffrescue  discriminated   → FfRescuePayload or NonFfRescuePayload
mayday                   boolean|null    *** NEW — was mayday declared? ***
presence_known           boolean|null    *** NEW — was victim's presence known? ***
```

## NODE: casualty_rescues[].rescue → FfRescuePayload
```
actions                  array|null      Rescue actions taken
impediments              array|null      Rescue impediments
removal_or_nonremoval    discriminated   Removal vs non-removal
type                     string          FF rescue type
```

## NODE: casualty_rescues[].rescue → NonFfRescuePayload
```
type                     string          Non-FF rescue type
```

## NODE: electric_hazards[] (ElectricHazardPayload)
```
fire_details             ElectricHazardFirePayload|null
involved_in_crash        boolean|null
source_or_target         string          SOURCE / TARGET
type                     string          Battery/EV/ESS type
```

## NODE: electric_hazards[].fire_details (ElectricHazardFirePayload)
```
reignition               boolean|null
suppression_types        array|null      Suppression methods used
```

## NODE: powergen_hazards[] — PvPowergenHazardPayload
```
pv_type                  string          ROOF_MOUNTED, GROUND_MOUNTED, etc.
source_or_target         string          SOURCE / TARGET / NOT_INVOLVED
type                     string          SOLAR_PV (discriminator)
```

## NODE: powergen_hazards[] — OtherPowergenHazardPayload
```
type                     string          WIND / GENERATOR / FUEL_CELL
```

## NODE: csst_hazard (CsstHazardPayload)
```
grounded                 string          YES / NO / UNKNOWN
ignition_source          boolean|null    Was CSST the ignition source?
lightning_suspected      string          YES / NO / UNKNOWN
```
NOTE: Field is "lightning_suspected" not "lightning"

## NODE: exposures[] (ExposurePayload)
```
damage_type              string          Exposure damage rating
displacement_causes      array|null      Displacement causes
displacement_count       integer|null    People/businesses displaced
location                 LocationPayload
location_detail          INTERNAL or EXTERNAL exposure detail (discriminated)
location_use             LocationUsePayload|null
people_present           boolean|null    Were people present at exposure?
point                    GeoPoint|null
polygon                  GeoPolygon|null
```
*** Exposures are WAY more detailed than we thought — each exposure has its own
    location, location_use, displacement data, and damage type ***

## NODE: location_use (LocationUsePayload)
```
in_use                   boolean|null    Was location being used as intended?
secondary_use            string|null     Secondary use type
use_type                 string          Primary use type (hierarchical)
vacancy_cause            string|null     Why vacant if vacant
```

## NODE: actions_tactics (ActionTacticPayload)
```
(need to extract — but confirmed as action_noaction with ACTION/NOACTION discriminator)
```

## NODE: smoke_alarm / fire_alarm / other_alarm / fire_suppression
(existing structures — presence-based with detail sub-objects)

## NODE: special_modifiers
```
(need to extract exact fields — contains incident modifier flags like
 Active Assailant, Mass Casualty, Federal Disaster, etc.)
```

## NODE: tactic_timestamps (top level — separate from dispatch.tactic_timestamps)
```
(need to extract — may duplicate or supplement dispatch tactic timestamps)
```

---

## CRITICAL DIFFERENCES FROM OUR BUILD SPEC

1. **medical_details** is PLURAL (not medical_detail)
2. **patient_care_evaluation** not "evaluation_care"
3. **transport_disposition** not "disposition"
4. **patient_care_report_id** not "patient_care_report"
5. **lightning_suspected** not "lightning" in csst_hazard
6. **medical_oxygen_hazard** — entirely new module we didn't know about
7. **special_modifiers** — top-level node, not just a field
8. **staffing** and **staging** on unit responses — new fields
9. **incident_types** is separate top-level array, not inside base
10. **unit_responses** at top level AND inside dispatch (dispatched vs responded)
11. **displacement_causes** is an array (not just count) — in base AND in exposures
12. **animals_rescued** is in BASE, not casualty_rescues
13. **Exposures** have full location, location_use, displacement per exposure — much bigger than expected
14. **CasualtyRescuePayload** has rank and years_of_service for FF entries
15. **RescuePayload** has mayday and presence_known — new fields
16. **ElectricHazardPayload** has fire_details sub-object (reignition, suppression_types)
17. **center_id** in dispatch — PSAP center identifier
18. **canceled_enroute** on unit responses — distinct from unable_to_dispatch
