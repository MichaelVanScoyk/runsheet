# NERIS Implementation Plan — CADReport

**Document Version:** 3.0  
**Last Updated:** March 1, 2026  
**Status:** Active — Updated with sandbox test results  
**Purpose:** Single source of truth for NERIS integration across all chat sessions

---

## 1. Overview

NERIS (National Emergency Response Information System) replaces NFIRS as of January 2026. CADReport will integrate NERIS as a toggleable module that rides alongside the existing RunSheet form. The NERIS module collects federal reporting data, validates it against the NERIS API, and submits incidents directly.

### Key Principle
> One incident record, two views. The RunSheet is the operational document. The NERIS form is a federal reporting view of the same data. No duplication — changes in either place update the same record.

---

## 2. Vendor Access (Obtained)

| Item | Value |
|------|-------|
| Vendor ID | VN22773762 |
| Test Department | FD09190828 ("CADReport Test Fire Department") |
| Test Portal | test.neris.fsri.org |
| Production API | api.neris.fsri.org/v1 |
| Test API | api-test.neris.fsri.org/v1 |
| Swagger Docs | api.neris.fsri.org/v1/docs |
| Helpdesk Tickets | HLPDSK-25587, HLPDSK-25836 |
| Python Client | `pip install neris-api-client` (v1.5.1 installed on server) |
| Auth Method | OAuth2 client_credentials (Client ID / Client Secret) |
| Cognito Config | neris-test-public.s3.us-east-2.amazonaws.com/cognito_config.json |
| Client ID | e9e5dfc7-6b6d-4332-98c1-ff55ea7a18e4 (shareable with departments) |
| Client Secret | *stored securely — do not commit to code* |
| Portal Login | admin@cadreport.com |

### Integration Credentials (Created)
Client ID and Secret obtained from test portal. Auth confirmed working against test API on March 1, 2026.

### V1 Compatibility Badge Requirements
1. ✅ Create a valid incident via API (`POST /incidents`) — confirmed March 1, 2026
2. ✅ Update that incident using PATCH (`PATCH /incidents/{uid}`) — confirmed March 1, 2026
3. ⬜ Create a new station (`POST /entities/{fd_id}/stations`)
4. ⬜ Add a unit to that station (`POST /entities/{fd_id}/stations/{station_id}/units`)
5. ⬜ Request compatibility check via helpdesk

### Test Incidents Created in Sandbox
| neris_id | Type | Status |
|----------|------|--------|
| FD09190828\|CAD-TEST-001\|1772366410 | PUBSERV\|\|ALARMS_NONMED\|\|FIRE_ALARM | APPROVED |
| FD09190828\|CAD-TEST-002\|1772366410 | PUBSERV\|\|ALARMS_NONMED\|\|FIRE_ALARM | APPROVED (patched with narrative) |

---

## 3. Architecture Decisions (Locked In)

### 3.1 Same Table, Different View
NERIS data lives on the existing `incidents` table. No separate `neris_reports` table. If an officer changes the address on the run sheet, NERIS reflects it. Data lives in one place.

### 3.2 Toggleable Module
The entire NERIS module is behind a per-tenant feature flag:
- Setting: `category: 'features'`, `key: 'enable_neris_module'`, `value_type: 'boolean'`
- **Default: OFF** for all tenants
- When OFF: no NERIS buttons, pages, nav items, review tasks — nothing exists
- When ON: NERIS status button on incident cards, NERIS page, admin config, review tasks
- Turning off preserves data; turning back on restores visibility
- Same pattern as the existing incident duplication feature flag

### 3.3 Admin NERIS Settings (visible when flag is ON)
- Enable NERIS module (on/off toggle)
- Default input mode: Questionnaire or Full Form
- API credentials (Client ID / Client Secret)
- Unit registration status
- Inline guidance messages on enable/disable

### 3.4 Two Input Modes
1. **Questionnaire mode** — Walks officer through conditional questions. "Was this a structure fire?" → Yes → "What floor?" Acts as a training tool. Default for new tenants.
2. **Full form mode** — All applicable fields visible at once. For experienced officers who want speed.
- Admin sets the default per tenant
- Officer can switch between modes on any incident

### 3.5 NERIS Shows for ALL Categories
Both FIRE and EMS incidents report to NERIS. Medical is a first-class NERIS incident type (Injury/Illness/Other). The old NERISSection that only showed for FIRE category is wrong.

### 3.6 Payload Builder at Submission Time
A backend function translates the incident record into the NERIS API payload format when submitting. No pre-formatting of data.

---

## 4. NERIS API — Sandbox-Verified Findings (March 1, 2026)

### 4.0 Critical Discoveries from Testing

**Payload structure:** Top-level keys are `base`, `incident_types`, `dispatch`. NOT flat — `incident_number` and `location` go inside `base`, not at root.

**incident_types uses `type` field, not `code`:** `{"type": "PUBSERV||ALARMS_NONMED||FIRE_ALARM"}` — the `||` separator format matches our neris_codes table.

**`BUILDING_FIRE` does not exist** — the valid structure fire types are `ROOM_AND_CONTENTS_FIRE`, `STRUCTURAL_INVOLVEMENT_FIRE`, `CHIMNEY_FIRE`, `CONFINED_COOKING_APPLIANCE_FIRE`. Our neris_codes table needs audit against the authoritative enum returned by the API.

**Dispatch timestamps ARE required** — `call_arrival`, `call_answered`, and `call_create` are all mandatory. Cannot be omitted. Best judgement approximation is required for Chester County CAD data.

**RMS submissions auto-approve** — Status goes directly to `APPROVED` (no PENDING_APPROVAL step). The `submitter_account_type` is `RMS`.

**Cannot re-submit approved incidents** — `create_incident` with the same dispatch incident number returns `409 Conflict`. Must use `patch_incident` for corrections.

**NERIS auto-enriches data:**
- Weather data automatically attached based on location/time
- Census tract (FIPS code, population density) auto-attached
- Location gets geocoded with a confidence score
- All sub-objects get `neris_uid` internal numeric IDs

**Location uses NG911 format** — Fields include `street_prefix_direction`, `street_postfix_modifier`, `complete_number`, `postal_community`, `incorporated_municipality`, etc. Minimum accepted: just `state`. Full NG911 parsing is a future enhancement.

### 4.1 Minimum Viable Payload (Verified Working)
```json
{
    "base": {
        "department_neris_id": "FD09190828",
        "incident_number": "TEST-2026-001",
        "location": {
            "state": "CT"
        }
    },
    "incident_types": [
        {"type": "PUBSERV||ALARMS_NONMED||FIRE_ALARM"}
    ],
    "dispatch": {
        "incident_number": "CAD-TEST-001",
        "call_arrival": "2026-03-01T12:00:00+00:00",
        "call_answered": "2026-03-01T12:00:05+00:00",
        "call_create": "2026-03-01T12:00:10+00:00",
        "location": {
            "state": "CT"
        },
        "unit_responses": [
            {
                "reported_unit_id": "E1",
                "dispatch": "2026-03-01T12:01:00+00:00"
            }
        ]
    }
}
```

**Response:**
```json
{
    "neris_id": "FD09190828|CAD-TEST-002|1772366410",
    "incident_status": {
        "last_modified": "2026-03-01T16:56:09.017457+00:00",
        "created_by": "e9e5dfc7-6b6d-4332-98c1-ff55ea7a18e4",
        "status": "SUBMITTED"
    }
}
```

**neris_id format:** `{department_id}|{dispatch_incident_number}|{unix_timestamp}`

### 4.2 PATCH Structure (Verified Working)
PATCH uses a deeply nested action/properties pattern. Each level requires `action` and `properties`. Scalar values use `set`/`unset`.

```json
{
    "neris_id": "FD09190828|CAD-TEST-002|1772366410",
    "action": "patch",
    "properties": {
        "base": {
            "action": "patch",
            "neris_uid": 131381,
            "properties": {
                "outcome_narrative": {
                    "action": "set",
                    "value": "Fire alarm, no fire found on scene."
                }
            }
        }
    }
}
```

**Critical:** PATCH requires `neris_uid` of the sub-object being patched. These UIDs come from `list_incidents` response. After `create_incident`, we must store (or fetch) the full incident to get `neris_uid` values for base, dispatch, unit_responses, etc.

**Unit responses in PATCH** use discriminator actions: `append`, `patch`, `remove`.

### 4.3 Confirmed Required Fields
| Field | Required? | Notes |
|-------|-----------|-------|
| `base.department_neris_id` | YES | Must match URL param |
| `base.incident_number` | YES | Our internal number |
| `base.location.state` | YES | Minimum location — just state works |
| `incident_types[].type` | YES | Must be exact enum value with `\|\|` separators |
| `dispatch.incident_number` | YES | CAD event number |
| `dispatch.call_arrival` | YES | **Cannot skip** |
| `dispatch.call_answered` | YES | **Cannot skip** |
| `dispatch.call_create` | YES | **Cannot skip** |
| `dispatch.location.state` | YES | Minimum |
| `dispatch.unit_responses` | YES | At least one unit |
| `dispatch.unit_responses[].reported_unit_id` | YES | Unit name string |
| `dispatch.unit_responses[].dispatch` | YES | Dispatch timestamp |

### 4.4 Conditional Requirements (Verified)
- **FIRE||STRUCTURE_FIRE** types require: `smoke_alarm`, `fire_alarm`, `other_alarm`, `fire_suppression` modules — UNLESS all aids are SUPPORT_AID GIVEN to another department
- **CONFINED_COOKING_APPLIANCE_FIRE** additionally requires: `cooking_fire_suppression`

### 4.5 API Client Methods (neris-api-client v1.5.1)
```python
# Core incident operations
client.create_incident(entity_id, payload)      # POST - returns {neris_id, incident_status}
client.patch_incident(entity_id, neris_id, payload)  # PATCH - returns {last_modified}
client.validate_incident(entity_id, payload)     # POST - dry-run validation
client.list_incidents(neris_id_entity=..., ...)  # GET - keyword args only
client.update_incident_status(entity_id, neris_id, status)  # PUT status

# Entity operations
client.get_entity(entity_id)                     # GET department info
client.create_station(entity_id, payload)        # POST
client.create_unit(entity_id, station_id, payload)  # POST
client.patch_station(...)                        # PATCH
client.patch_unit(...)                           # PATCH

# All methods available:
# create_api_integration, create_entity, create_incident, create_station,
# create_unit, create_user, create_user_entity_membership,
# create_user_role_entity_set_attachment, delete_user,
# delete_user_entity_membership, enroll_integration, generate_api_secret,
# get_entity, get_user, health, list_entities, list_incidents,
# list_integrations, list_user_entity_memberships, patch_entity,
# patch_incident, patch_station, patch_unit, tokens, update_entity,
# update_incident_status, update_user, update_user_entity_activation,
# validate_incident
```

### 4.6 Remaining Required Fields (from original plan)
| Field | API Path | CADReport Source |
|-------|----------|-----------------|
| Department NERIS ID | `base.department_neris_id` | Tenant settings |
| Incident Number | `base.incident_number` | `internal_incident_number` |
| Dispatch Incident Number | `dispatch.incident_number` | `cad_event_number` |
| Incident Types (up to 3) | `incident_types[].type` | `neris_incident_type_codes` (JSONB) |
| Incident Location | `base.location` | Parsed from address fields (NG911 format, minimum = state) |
| Dispatch Location | `dispatch.location` | Same parsed address |
| Call Arrival | `dispatch.call_arrival` | **REQUIRED** — approximate from CAD data |
| Call Answered | `dispatch.call_answered` | **REQUIRED** — approximate from CAD data |
| Call Create | `dispatch.call_create` | **REQUIRED** — approximate from earliest event comment timestamp |
| Unit Responses | `dispatch.unit_responses` | `cad_units` array |

**Dispatch Timestamps Strategy:** Chester County CAD does not provide PSAP call-handling timestamps but NERIS requires them. We will approximate: `call_create` ≈ earliest CAD event timestamp, `call_answered` ≈ call_create + small offset, `call_arrival` ≈ call_create - small offset (call arrives before it's answered/created in the system). Exact logic TBD during payload builder implementation.

### 4.7 Highly Desired Fields (flagged if missing starting 2026)
| Field | API Path | CADReport Source |
|-------|----------|-----------------|
| Outcome Narrative | `base.outcome_narrative` | `narrative` or `services_provided` |
| Location Use | `base.location_use` | `neris_location_use` |
| Interagency Aid | `aids[]` | MutualAidSection → department NERIS IDs + direction + type |
| Non-FD Aids | `nonfd_aids[]` | Simple string array (e.g., "UTILITIES_PUBLIC_WORKS", "EMS") |
| Actions and Tactics | `actions_tactics` | `neris_action_codes` (JSONB) |

### 4.8 Interagency Aid Structure
```json
"aids": [
  {
    "department_neris_id": "FD48085117",
    "aid_type": "SUPPORT_AID",
    "aid_direction": "GIVEN"
  }
]
```

### 4.9 Non-FD Aid Structure
```json
"nonfd_aids": ["UTILITIES_PUBLIC_WORKS", "HOUSING_SERVICES", "EMS"]
```
Simple multi-select of categories. To be implemented during the full NERIS module lift.

### 4.10 Conditional Modules
| Module | Triggers When | Key Fields |
|--------|---------------|------------|
| `fire_detail` | Any FIRE incident type selected | location_detail, water_supply, suppression_appliances, investigation_needed |
| `medical_detail` | Any MEDICAL incident type selected | patient_evaluation_care, medical_disposition, patient_improved_status |
| `hazsit_detail` | Any HAZSIT incident type selected | disposition, evacuated count, chemicals |

**Validation rule:** If a conditional module is included in the payload but the trigger condition is not met, the API rejects it.

### 4.11 Risk Reduction (required for FIRE STRUCTURE_FIRE)
- `smoke_alarm` (presence, type, operation, failure, action)
- `fire_alarm` (presence, type, operation, failure)
- `other_alarm` (presence, type)
- `fire_suppression` (presence, type, operation, coverage, heads activated, failure)
- `cooking_fire_suppression` (required if CONFINED_COOKING_APPLIANCE_FIRE)

### 4.12 Unit Responses
```json
{
  "unit_neris_id": "FD24027077S000U001",
  "reported_unit_id": "E48",
  "dispatch": "2025-05-03T18:50:12+00:00",
  "enroute_to_scene": "2025-05-03T18:51:13+00:00",
  "on_scene": "2025-05-03T18:53:54+00:00",
  "unit_clear": "2025-05-03T19:36:33+00:00",
  "response_mode": "EMERGENT",
  "med_responses": [{}]
}
```
Maps from `cad_units` array. `unit_neris_id` optional but desired (requires entity registration).

---

## 5. Existing Database Schema (NERIS Columns on incidents table)

~60 NERIS-specific columns already exist. Key groups:

**Classification:** `neris_incident_type_codes` (JSONB), `neris_location_use`, `neris_action_codes` (JSONB), `neris_no_action_reason`

**Mutual Aid:** `neris_aid_direction`, `neris_aid_type`, `mutual_aid_department_ids` (JSONB)

**Fire Detail:** `neris_fire_investigation`, `neris_fire_arrival_conditions`, `neris_structure_damage`, `neris_floor_origin`, `neris_room_origin`, `neris_fire_cause_in`, `neris_fire_cause_out`

**Medical:** `neris_patient_care`

**Hazmat:** `neris_hazmat_disposition`, `neris_hazmat_evacuated`, `neris_hazmat_chemicals` (JSONB)

**Risk Reduction:** ~15 columns for smoke alarm, fire alarm, other alarm, sprinkler, cooking suppression (presence, type, operation, failure)

**Emerging Hazards:** `neris_emerging_electric` (JSONB), `neris_emerging_pvign` (JSONB)

**Submission Tracking:** `neris_id`, `neris_submitted_at`, `neris_submission_id`, `neris_validation_errors`, `neris_last_validated_at`, `neris_additional_data` (JSONB)

**Tactical Timestamps:** 38 timestamp columns for command established, all clear, water on fire, fire under control, etc.

**Columns still needed:**
- `neris_nonfd_aids` (JSONB, string array)
- `neris_submission_status` (text: NOT_STARTED/DRAFT/VALIDATED/APPROVED)
- `neris_uids` (JSONB — stores neris_uid values from API response for PATCH operations, e.g. `{"base": 131381, "dispatch": 133370, "unit_responses": [{"reported_unit_id": "E1", "neris_uid": 308411}]}`)
- Department-level: NERIS Entity ID on mutual aid departments table

---

## 6. Existing Frontend Code

### Current State
| Component | Size | Status |
|-----------|------|--------|
| `NERISSection.jsx` | 48KB (~1200 lines) | Monolith, needs decomposition |
| `NerisModal.jsx` | ~8KB | Hierarchical code picker, works |
| `MutualAidSection.jsx` | ~10KB | Complete, production-ready |
| `RunSheetContext.jsx` | 35KB (~900 lines) | Has NERIS helpers, initialFormData |

### What exists in RunSheetContext
- `getNerisDisplayName()` — display formatter
- `hasFireType()`, `hasMedicalType()`, `hasHazsitType()`, `hasStructureFireType()`, `hasOutsideFireType()` — conditional helpers
- `NERIS_DESCRIPTIONS` — field tooltip text
- `initialFormData` — all neris_ fields defined with defaults
- All NERIS dropdown option lists loaded from `/api/neris-codes/categories/{category}`

### Backend
- `neris_codes.py` — NERIS code management (import, browse, validate, grouped hierarchical endpoint)
- `neris_mutual_aid.py` — Mutual aid department registry with unit mapping
- `neris_codes` table — 343 rows across categories, `||` separator format
- No NERIS submission router yet (neris_api.py does not exist)

---

## 7. Component Decomposition Plan

The 48KB NERISSection.jsx monolith gets broken into focused components:

| Component | Responsibility |
|-----------|---------------|
| `NerisStatusButton` | Status badge on incident cards (Not Started / In Progress / Validated / Approved) |
| `IncidentClassification` | Incident type picker (up to 3), location use, actions taken |
| `TacticTimestamps` | Detected timestamps from ComCat with confidence indicators and source attribution |
| `FireDetail` | Arrival conditions, damage, floor/room of origin, cause, investigation needed |
| `RiskReduction` | Smoke alarm, fire alarm, sprinkler, cooking suppression modules |
| `MedicalDetail` | Patient evaluation/care, disposition |
| `HazmatDetail` | Disposition, evacuated count, chemicals |
| `EmergingHazards` | Electric/battery, PV/ignition source |
| `CasualtyRescues` | FF and civilian injury/rescue data |
| `SupportResources` | Non-FD aids multi-select (tow, SPCA, utilities, etc.) |
| `NerisReviewSubmit` | Readiness indicator, validate button, submit button, status/errors |

### NerisContext (new)
Separate context for NERIS-specific UI state. Keeps RunSheetContext focused on form data and generic operations. Components check the feature flag and return null when NERIS is disabled.

---

## 8. NERIS Status Flow

```
NOT_STARTED → DRAFT → VALIDATED → APPROVED
```

| Status | Meaning |
|--------|---------|
| NOT_STARTED | No NERIS data filled in |
| DRAFT | Some NERIS fields populated, not yet validated |
| VALIDATED | Passed NERIS `validate_incident` dry-run |
| APPROVED | Submitted to NERIS and auto-approved (RMS submissions skip SUBMITTED/PENDING) |

**Note:** RMS submissions go directly to APPROVED. No SUBMITTED → APPROVED transition. The REJECTED status from the original plan doesn't apply — validation errors are caught at VALIDATE stage before submission. If create_incident fails, it stays at VALIDATED with error details stored.

The status button on incident cards reflects this. Color/icon changes per state. Incidents with NOT_STARTED or DRAFT appear in officer review tasks.

---

## 9. API Workflow (Verified)

```
1. Officer fills NERIS data (questionnaire or form)
2. VALIDATE → POST to validate_incident endpoint (dry-run, same payload as create)
   - If errors → show inline, status = DRAFT
   - If passes → status = VALIDATED
3. SUBMIT → POST to create_incident endpoint (full payload)
   - Returns neris_id (format: FD...|dispatch_number|timestamp)
   - Status goes directly to APPROVED for RMS submissions
   - Store neris_id in incidents table
4. FETCH → call list_incidents to get full response with neris_uid values
   - Store neris_uids for base, dispatch, unit_responses in neris_additional_data JSONB
   - These are required for any future PATCH operations
5. If corrections needed after submission:
   - Cannot re-create (409 Conflict) — must use patch_incident
   - PATCH requires neris_uid of sub-object + nested action/properties/set structure
   - Each field change: {"action": "set", "value": "new value"}
   - Each field removal: {"action": "unset"}
6. Officer review tasks clear when status reaches APPROVED
```

**Key difference from original plan:** No SUBMITTED → APPROVED transition for RMS. It's instant APPROVED. Our internal status flow simplifies to: NOT_STARTED → DRAFT → VALIDATED → APPROVED.

---

## 10. Implementation Phases

### Phase 1: Backend Foundation
- [ ] Create `backend/routers/neris_api.py` — auth, payload builder, validate, submit, patch, status tracking
- [ ] Add `neris_submission_status` column to incidents
- [ ] Add `neris_nonfd_aids` JSONB column
- [ ] Add `neris_uids` JSONB column to incidents
- [ ] Add `neris_entity_id` column to mutual aid departments table
- [ ] Backend readiness calculation endpoint — what's filled vs what's missing for a given incident
- [x] Install `neris-api-client` (v1.5.1) on server
- [x] Create integration credentials in test portal (Client ID/Secret)
- [x] Smoke test: fetch entity FD09190828 — confirmed working
- [x] Create test incident via API — confirmed working (APPROVED)
- [x] Patch test incident via API — confirmed working (narrative updated)
- [ ] Create station in NERIS test environment
- [ ] Create unit in NERIS test environment
- [ ] Store neris_uids after create (needed for PATCH operations)
- [ ] Audit neris_codes table against authoritative API enum (BUILDING_FIRE doesn't exist)

### Phase 2: Feature Flag & Admin
- [ ] Add `enable_neris_module` feature flag (same pattern as incident duplication)
- [ ] Admin → Features tab toggle with inline guidance messages
- [ ] Admin → NERIS Config section (visible when enabled): API credentials, unit registration, default input mode
- [ ] Frontend gating: all NERIS components check flag and return null when off

### Phase 3: NERIS UI — Component Decomposition
- [ ] Create `NerisContext` provider
- [ ] Decompose NERISSection.jsx into 11 focused components
- [ ] Build NerisStatusButton for incident cards
- [ ] Build NerisReviewSubmit with readiness indicator
- [ ] Wire questionnaire mode flow (conditional question-based navigation)
- [ ] Wire full form mode (all applicable fields visible)
- [ ] Add SupportResources (nonfd_aids) multi-select inside mutual aid compartment
- [ ] NERIS sections show for both FIRE and EMS categories

### Phase 4: Submission & Testing
- [ ] End-to-end test: fill NERIS data → validate → submit to test API
- [ ] Handle NERIS response (UID storage, error display)
- [ ] PATCH workflow for post-submission updates
- [ ] Entity registration: create station + units in NERIS test environment
- [ ] Request V1 Compatibility Badge
- [ ] Production enrollment for Glen Moore (FD42029593)

### Future
- [ ] Mobile Field Guide for on-scene timestamp capture
- [ ] Narrative-based incident type suggestions (AI analysis)
- [ ] CAD incident code → NERIS type auto-suggestion mapping
- [ ] Address parsing → NG911 location format auto-conversion
- [ ] Chester County CAD code mapping table

---

## 11. Pain Points Tracker

| # | Pain Point | Status | Chat Reference |
|---|-----------|--------|---------------|
| 1 | Address parsing (single string → NG911 location fields) | Not started. Minimum viable = just `state`. Full NG911 is enhancement. | — |
| 2 | Incident type suggestions (narrative-based analysis) | Not started | — |
| 3 | Dispatch timestamps (call_arrival, call_answered, call_create) | **REQUIRED — cannot skip.** Must approximate from CAD data. | Sandbox test March 1, 2026 |
| 4 | Unit registration (register stations/units in NERIS) | Not started, have Client ID now | — |
| 5 | NERIS module UI (the dedicated page, conditional sections) | Spec complete, needs build | neris-module-ui-prompt.md |
| 6 | NERIS admin feature flag | Spec complete, needs build | Feature flag chat |
| 7 | NERIS API integration (auth, payload, validate, submit) | **Auth confirmed. Create + Patch verified in sandbox.** | Sandbox test March 1, 2026 |
| 8 | Incident number mutability after submission | **Answered: Cannot re-create (409). Must PATCH.** | Sandbox test March 1, 2026 |
| 9 | Import script fix (separator and column bugs) | Fixed (`||` separator) | — |
| 10 | Medical call reporting (all EMS calls require NERIS reports) | Confirmed — yes, all medical calls | Medical NERIS chat |
| 11 | neris_codes table audit vs API enum | **BUILDING_FIRE not valid** — need to reconcile against authoritative enum | Sandbox test March 1, 2026 |
| 12 | PATCH requires neris_uid from list_incidents | Must fetch and store UIDs after create_incident | Sandbox test March 1, 2026 |
| 13 | Structure fire requires risk reduction modules | Confirmed — smoke_alarm, fire_alarm, other_alarm, fire_suppression all required | Sandbox test March 1, 2026 |

---

## 12. Key Resources

| Resource | URL |
|----------|-----|
| NERIS Knowledge Base | neris.atlassian.net/wiki/spaces/NKB |
| Minimum Data Requirements FAQ | neris.atlassian.net/wiki/spaces/NKB/pages/416317459 |
| NERIS API Swagger (Production) | api.neris.fsri.org/v1/docs |
| NERIS API Swagger (Test) | api-test.neris.fsri.org/v1/docs |
| NERIS Test Portal | test.neris.fsri.org |
| NERIS GitHub (schemas) | github.com/ulfsri/neris-framework |
| NERIS Python Client | pypi.org/project/neris-api-client/ |
| NERIS Helpdesk | neris.atlassian.net/servicedesk/customer/portals |
| Responserack Cheat Sheet | responserack.com/neris/ |
| NERIS Integration Partners | neris.fsri.org/integration-partners |

---

## 13. File Reference

### Backend
| File | Purpose |
|------|---------|
| `backend/routers/neris_codes.py` | NERIS code table management |
| `backend/routers/neris_mutual_aid.py` | Mutual aid department/unit registry |
| `backend/routers/neris_api.py` | **TO BUILD** — Auth, payload builder, validate, submit |
| `backend/migrations/002_neris_mutual_aid.sql` | Mutual aid tables migration |

### Frontend
| File | Purpose |
|------|---------|
| `frontend/src/components/RunSheet/neris/NERISSection.jsx` | Current monolith (48KB, to decompose) |
| `frontend/src/components/RunSheet/neris/NerisModal.jsx` | Hierarchical code picker |
| `frontend/src/components/RunSheet/sections/MutualAidSection.jsx` | Mutual aid direction, type, departments |
| `frontend/src/components/RunSheet/RunSheetContext.jsx` | NERIS helpers, dropdown options, initialFormData |

---

*This document supersedes all previous NERIS planning discussions. Reference this file in future chats.*
