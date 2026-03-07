# NERIS BUILD TRACKER

> **PROMPT FOR EVERY NEW CONVERSATION:**
> When doing ANY NERIS-related work, you MUST first read `C:\Users\micha\runsheet\docs\NERIS_BUILD_TRACKER.md` and follow every rule in it. Do not start NERIS work without reading this file. Do not deviate from it. The browser tab must be open to `https://api-test.neris.fsri.org/v1/openapi.json` and all schema information must come from reading that live spec — never from memory, pattern recognition, or saved files.

## ⚠️ CRITICAL RULES — READ BEFORE TOUCHING ANY CODE ⚠️

### Communication Rule
**Facts only.** No narrative. No back-and-forth filler. No "let me do X" preamble. State what you're doing and do it. No wasting time. Claude will not offer direction, suggest next steps, or make its own decisions. Mike decides what happens next.

### Single Source of Truth
The **ONLY** source of truth for NERIS field names, data types, enum values, and payload structures is the live NERIS API schema at:

**`https://api-test.neris.fsri.org/v1/openapi.json`** (test environment, currently v1.4.38)

- **NEVER** create intermediate reference documents, markdown summaries, or spec interpretations
- **NEVER** save or download the OpenAPI spec locally
- **NEVER** guess field names, types, or enum values from pattern recognition
- **ALWAYS** read the live schema in real-time for the specific section being worked on

### Workflow Rules
1. **No section is started until the previous section is 100% complete**
2. **No section is considered complete until every field, type, enum, struct, dict, array, and nested object matches the live NERIS schema exactly — down to whether something is a string, int, bool, array, object, enum, nullable, etc.**
3. **Once a section is marked 100% COMPLETE, it is DONE. No coming back. No revisiting. No "quick fixes." It was verified against the live schema and it is correct.**
4. **Every section will be completed 100% before moving on. If the DB is missing columns, we add them. If CAD data is missing fields, we handle it. No section is left incomplete. No excuses.**

### BUILDER 1:1 NAMING RULE (NON-NEGOTIABLE)

The payload builder uses **NERIS field names natively throughout**. No translation. No renaming. No mapping from old DB names to NERIS names inside the builder.

- If NERIS calls a field `animals_rescued`, the builder reads `incident["animals_rescued"]` — NOT `incident["neris_rescue_animal"]`
- If NERIS calls a field `impediment_narrative`, the builder reads `incident["impediment_narrative"]` — NOT `incident["neris_narrative_impedance"]`
- If NERIS calls a field `canceled_enroute` and it's a datetime string, the builder reads it as a datetime string — NOT as a boolean
- Variable names, dict keys, function parameters, intermediate values — ALL use NERIS naming
- The builder assumes the incident dict it receives already has NERIS-native field names and types
- Any translation from old DB column names to NERIS names happens OUTSIDE the builder (in the caller/adapter layer) — never inside it

The builder is a **clean pass-through**: NERIS data in → NERIS payload out. Zero transformation logic.

### What "Code" Means — Fresh Build

All new NERIS code lives in **`nerisv1`** directories. The old `services/neris/` and `pages/neris/` are untouched legacy — do not read, reference, or import from them.

- **Backend:** `backend/services/nerisv1/`
- **Frontend:** `frontend/src/pages/nerisv1/`

Frontend and backend are built together, one section at a time. Both use NERIS field names natively — 1:1 with the spec. Incredibly slow pace. Each section verified against the live spec before moving on.

**Database is not touched.** The new code works with NERIS-native field names in its own data model. DB migration happens later to catch up to what the code already expects.

**The old code stays running production.** It is not modified, not referenced, not consulted. It does not exist as far as `nerisv1` is concerned.

### Skeleton Structure

**Backend (`backend/services/nerisv1/`):**
- One Python file per IncidentPayload module (e.g. `base.py`, `dispatch.py`, `fire_detail.py`)
- Each file contains one builder function that takes a dict with NERIS-native field names and outputs the NERIS payload structure for that module
- One orchestrator file (`builder.py`) that assembles all 23 modules into the final `IncidentPayload`
- Each builder function is written field-by-field from the live spec — no shortcuts

**Frontend (`frontend/src/pages/nerisv1/`):**
- One React component per module (e.g. `BaseSection.jsx`, `DispatchSection.jsx`)
- Each component's form fields map 1:1 to the NERIS schema fields for that module
- Shared components for recurring patterns (location, geo point, presence/not-present discriminators)
- One page component that assembles all sections

**Shared sub-schemas** (LocationPayload, GeoPoint, LocationUsePayload, etc.) are built as part of whichever section needs them first, then reused by later sections.

**Every field in the spec is built out.** Required or optional does not matter — all fields are implemented.

### Red Flags — Stop Immediately If Claude Does Any Of These
- Uses phrases like "I think this field is...", "this should be...", "I believe the type is..."
- Produces field names, types, or enum values without showing which schema definition they came from in the live spec
- Creates any .md, .json, .txt, or any other file containing NERIS schema information
- Downloads or saves the OpenAPI spec anywhere
- Fills in gaps with "pattern recognition" instead of reading the spec
- Says a section is done without having verified every field against the live schema in the same session
- Adds fields, structures, or enum values that "look right" but weren't read directly from the test API schema
- Declares a builder section done without verifying every output field against the live spec
- Gets distracted auditing frontend or DB before the builder is confirmed correct
- Uses ANY non-NERIS field name inside the builder (e.g. reading `neris_rescue_animal` instead of `animals_rescued`)
- Puts translation/mapping logic inside the builder instead of keeping it as a clean pass-through
- Reads, references, or imports from the old `services/neris/` or `pages/neris/` directories

If any of these happen, stop the session and call it out. Do not let Claude continue.

### Build Process (for each section)

1. Open the live NERIS schema in the browser at `api-test.neris.fsri.org/v1/openapi.json`
2. Read the exact schema definition for the section's payload type — every field, type, required/optional, nesting
3. For every `$ref` sub-schema in the section:
   a. Check if it was already built by a previous section — if yes, reuse it
   b. If not built yet, query the live spec to find all other schemas that reference it
   c. If referenced by multiple sections → build it in `shared/` (backend: `services/nerisv1/shared/`, frontend: `pages/nerisv1/shared/`)
   d. If only used by this section → build it in this section's file
4. Write the backend builder in `services/nerisv1/` — 1:1 with the spec, NERIS field names only
5. Write the frontend component in `pages/nerisv1/` — 1:1 with the spec, NERIS field names only
6. Verify every field in both backend and frontend against the live schema
7. Mark section complete only when 1:1 match is confirmed in both
8. Do not start the next section until this one is done

### Starting Over
If Claude gets lost, goes in circles, or needs to restart a section:
- Do NOT summarize previous findings from memory — that's pattern recognition
- Go back to step 1: read the live spec fresh
- Go back to step 3: read every file fresh
- Compare fresh. Fix fresh. No shortcuts.

### This Document
This document tracks **modules and workflow only**. It contains:
- The list of every module in the NERIS IncidentPayload
- Which schema each module references
- Build/audit status per section
- What's blocking incomplete sections

This document does **NOT** contain field definitions, enum values, or data type specifications. Those live in the NERIS API and nowhere else.

---

## Test Environment Credentials

| Item | Value |
|------|-------|
| **Test API Base URL** | `https://api-test.neris.fsri.org/v1` |
| **Test OpenAPI Spec** | `https://api-test.neris.fsri.org/v1/openapi.json` |
| **Vendor Account** | `VN22773762` |
| **Username** | `admin@cadreport.com` |
| **Password** | `Squeak01!neris!` |
| **Client ID** | `e9e5dfc7-6b6d-4332-98c1-ff55ea7a18e4` |
| **Client Secret** | `o6r9J_vvsCIl555NMMMAyg` |
| **Test Department** | `FD09190828` |

### Auth Token Request
```bash
curl -s -X POST https://api-test.neris.fsri.org/v1/token \
  -u "e9e5dfc7-6b6d-4332-98c1-ff55ea7a18e4:o6r9J_vvsCIl555NMMMAyg" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials"
```

### Validate Payload (no create)
```bash
curl -s -X POST https://api-test.neris.fsri.org/v1/incident/FD09190828/validate \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d @payload.json
```

### Read Schema (browser only — never download)
```
https://api-test.neris.fsri.org/v1/openapi.json
```

---

## NERIS IncidentPayload — Top-Level Modules

Source: `IncidentPayload` schema from `api-test.neris.fsri.org/v1/openapi.json` v1.4.38

**Required modules:** base, incident_types, dispatch
**Total modules:** 23

| # | Module | Schema Reference | Required | Conditional Trigger | Status |
|---|--------|-----------------|----------|-------------------|--------|
| 1 | `base` | `IncidentBasePayload` | **YES** | — | ✅ COMPLETE |
| 2 | `incident_types` | `IncidentTypePayload[]` or `IncidentTypeCadPayload[]` | **YES** | — | ❌ NOT STARTED |
| 3 | `dispatch` | `DispatchPayload` | **YES** | — | ❌ NOT STARTED |
| 4 | `special_modifiers` | `TypeSpecialModifierValue[]` | no | — | ❌ NOT STARTED |
| 5 | `aids` | `AidPayload[]` | no | — | ❌ NOT STARTED |
| 6 | `nonfd_aids` | `TypeAidNonfdValue[]` | no | — | ❌ NOT STARTED |
| 7 | `actions_tactics` | `ActionTacticPayload` | no | — | ❌ NOT STARTED |
| 8 | `tactic_timestamps` | `IncidentTacticTimestampsPayload` | no | — | ❌ NOT STARTED |
| 9 | `unit_responses` | `IncidentUnitResponsePayload[]` | no | — | ❌ NOT STARTED |
| 10 | `exposures` | `ExposurePayload[]` | no | — | ❌ NOT STARTED |
| 11 | `casualty_rescues` | `CasualtyRescuePayload[]` | no | — | ❌ NOT STARTED |
| 12 | `fire_detail` | `FirePayload` | no | Incident type starts with `FIRE\|\|` | ❌ NOT STARTED |
| 13 | `hazsit_detail` | `HazsitPayload` | no | Incident type starts with `HAZSIT\|\|` | ❌ NOT STARTED |
| 14 | `medical_details` | `MedicalPayload[]` | no | Incident type starts with `MEDICAL\|\|` | ❌ NOT STARTED |
| 15 | `smoke_alarm` | `SmokeAlarmPayload` | no | Required for `FIRE\|\|STRUCTURE_FIRE` (unless SUPPORT_AID GIVEN) | ❌ NOT STARTED |
| 16 | `fire_alarm` | `FireAlarmPayload` | no | Required for `FIRE\|\|STRUCTURE_FIRE` (unless SUPPORT_AID GIVEN) | ❌ NOT STARTED |
| 17 | `other_alarm` | `OtherAlarmPayload` | no | Required for `FIRE\|\|STRUCTURE_FIRE` (unless SUPPORT_AID GIVEN) | ❌ NOT STARTED |
| 18 | `fire_suppression` | `FireSuppressionPayload` | no | Required for `FIRE\|\|STRUCTURE_FIRE` (unless SUPPORT_AID GIVEN) | ❌ NOT STARTED |
| 19 | `cooking_fire_suppression` | `CookingFireSuppressionPayload` | no | Required for `FIRE\|\|STRUCTURE_FIRE\|\|CONFINED_COOKING_APPLIANCE_FIRE` (unless SUPPORT_AID GIVEN) | ❌ NOT STARTED |
| 20 | `electric_hazards` | `ElectricHazardPayload[]` | no | — | ❌ NOT STARTED |
| 21 | `powergen_hazards` | `PvPowergenHazardPayload[]` | no | — | ❌ NOT STARTED |
| 22 | `csst_hazard` | `CsstHazardPayload` | no | — | ❌ NOT STARTED |
| 23 | `medical_oxygen_hazard` | `MedicalOxygenHazardPayload` | no | — | ❌ NOT STARTED |

---

## Audit Log

Format: `[DATE] Section # — Status change — Notes`

[2026-03-07] ALL 23 SECTIONS — REVERTED TO NOT STARTED — Previous completion claims were false. Builder code still reads old DB column names (neris_rescue_animal, neris_narrative_impedance, etc.) inside the builder, violating the 1:1 naming rule. Translation/mapping logic exists inside builders. Full Phase 1 audit required from scratch against live spec.

[2026-03-07] Section 1 (base) — COMPLETE — nerisv1 fresh build.
  - Backend: services/nerisv1/base.py (12 fields, verified 12/12 vs live spec)
  - Frontend: pages/nerisv1/BaseSection.jsx (12 fields, all sub-schemas wired)
  - Shared built: location.py (40 fields, 40/40), geo.py (GeoPoint 2/2, HighPrecisionGeoMultipolygon 2/2), location_use.py (4 fields, 4/4)
  - Shared frontend: LocationFields.jsx, GeoPointFields.jsx, LocationUseFields.jsx
  - All field names are NERIS-native. Zero translation. Zero old DB names.
  - Verified against live spec v1.4.38 via JavaScript queries in same session.
