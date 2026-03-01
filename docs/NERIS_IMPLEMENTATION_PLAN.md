# NERIS Implementation Plan — CADReport

**Document Version:** 2.0  
**Last Updated:** March 1, 2026  
**Status:** Active — Consolidation of all NERIS decisions  
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
| Python Client | `pip install neris-api-client` (>= 1.3) |
| Auth Method | OAuth2 client_credentials (Client ID / Client Secret) |
| Cognito Config | neris-test-public.s3.us-east-2.amazonaws.com/cognito_config.json |

**Next:** Create an integration in the test portal to get Client ID / Client Secret for API calls.

### V1 Compatibility Badge Requirements
1. Create a valid incident via API (`POST /incidents`)
2. Update that incident using its UID (`PATCH /incidents/{uid}`)
3. Create a new station (`POST /entities/{fd_id}/stations`)
4. Add a unit to that station (`POST /entities/{fd_id}/stations/{station_id}/units`)
5. Request compatibility check via helpdesk

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

## 4. NERIS API Payload Structure

Based on the NERIS Minimum Data Requirements (neris.atlassian.net/wiki) and our test access:

### 4.1 Required Fields
| Field | API Path | CADReport Source |
|-------|----------|-----------------|
| Department NERIS ID | `base.department_neris_id` | Tenant settings |
| Incident Number | `base.incident_number` | `internal_incident_number` |
| Dispatch Incident Number | `dispatch.incident_number` | `cad_event_number` |
| Incident Types (up to 3) | `base.incident_types` | `neris_incident_type_codes` (JSONB) |
| Incident Location | `base.location` | Parsed from address fields (NG911 format) |
| Dispatch Location | `dispatch.location` | Same parsed address |
| Call Arrival | `dispatch.call_arrival` | **Skip if possible** — not in Chester County CAD. Best judgement if required. |
| Call Answered | `dispatch.call_answered` | **Skip if possible** — not in Chester County CAD. Best judgement if required. |
| Call Create | `dispatch.call_create` | **Skip if possible** — could approximate from earliest event comment if forced. |
| Unit Responses | `dispatch.unit_responses` | `cad_units` array |

**Dispatch Timestamps Strategy:** Chester County CAD does not provide PSAP call-handling timestamps. Plan is to attempt submission without them. If the API rejects, we'll use best judgement approximation at that time.

### 4.2 Highly Desired Fields (flagged if missing starting 2026)
| Field | API Path | CADReport Source |
|-------|----------|-----------------|
| Outcome Narrative | `base.outcome_narrative` | `narrative` or `services_provided` |
| Location Use | `base.location_use` | `neris_location_use` |
| Interagency Aid | `aids[]` | MutualAidSection → department NERIS IDs + direction + type |
| Non-FD Aids | `nonfd_aids[]` | Simple string array (e.g., "UTILITIES_PUBLIC_WORKS", "EMS") |
| Actions and Tactics | `actions_tactics` | `neris_action_codes` (JSONB) |

### 4.3 Interagency Aid Structure
```json
"aids": [
  {
    "department_neris_id": "FD48085117",
    "aid_type": "SUPPORT_AID",
    "aid_direction": "GIVEN"
  }
]
```
**Mapping from MutualAidSection:**
- `department_neris_id` → from mutual aid department registry (needs NERIS ID column added)
- `aid_type` → `formData.neris_aid_type` (AUTOMATIC/MUTUAL/OTHER → maps to NERIS SUPPORT_AID/IN_LIEU_AID/ACTING_AS_AID)
- `aid_direction` → `formData.neris_aid_direction` (GIVEN/RECEIVED)

### 4.4 Non-FD Aid Structure
```json
"nonfd_aids": ["UTILITIES_PUBLIC_WORKS", "HOUSING_SERVICES", "EMS"]
```
Simple multi-select of categories. No direction, no company names. Lives inside the mutual aid compartment on the UI, flows through to the NERIS context. To be implemented during the full NERIS module lift.

### 4.5 Conditional Modules
| Module | Triggers When | Key Fields |
|--------|---------------|------------|
| `fire_detail` | Any FIRE incident type selected | location_detail (type, arrival_condition, damage, floor/room of origin, cause), water_supply, suppression_appliances, investigation_needed |
| `medical_detail` | Any MEDICAL incident type selected | patient_evaluation_care, medical_disposition, patient_improved_status |
| `hazsit_detail` | Any HAZSIT incident type selected | disposition, evacuated count, chemicals (DOT class, name, release info) |

**Validation rule:** If a conditional module is included in the payload but the trigger condition is not met, the API rejects it.

### 4.6 Risk Reduction (required for FIRE STRUCTURE_FIRE)
- `smoke_alarm` (presence, type, operation, failure, action)
- `fire_alarm` (presence, type, operation, failure)
- `other_alarm` (presence, type)
- `fire_suppression` (presence, type, operation, coverage, heads activated, failure)
- `cooking_fire_suppression` (required if CONFINED_COOKING_APPLIANCE_FIRE)

### 4.7 Unit Responses
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
Maps from `cad_units` array. Requires unit NERIS IDs from entity registration.

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
- `neris_submission_status` (text: NOT_STARTED/DRAFT/VALIDATED/SUBMITTED/APPROVED)
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
| `NerisStatusButton` | Status badge on incident cards (Not Started / In Progress / Validated / Submitted / Errors) |
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
NOT_STARTED → DRAFT → VALIDATED → SUBMITTED → APPROVED
                                      ↓
                                   REJECTED (with errors)
```

| Status | Meaning |
|--------|---------|
| NOT_STARTED | No NERIS data filled in |
| DRAFT | Some NERIS fields populated, not yet validated |
| VALIDATED | Passed NERIS `validate_incident` dry-run |
| SUBMITTED | Sent to NERIS API, accepted |
| APPROVED | Confirmed in NERIS system |
| REJECTED | NERIS returned validation errors (stored in `neris_validation_errors`) |

The status button on incident cards reflects this. Color/icon changes per state. Incidents with NOT_STARTED or DRAFT appear in officer review tasks.

---

## 9. API Workflow

```
1. Officer fills NERIS data (questionnaire or form)
2. VALIDATE → POST to NERIS validate_incident endpoint (dry-run)
   - If errors → show inline, status = DRAFT
   - If passes → status = VALIDATED
3. SUBMIT → POST to NERIS create_incident endpoint
   - Returns NERIS incident UID → stored in neris_submission_id
   - Status = SUBMITTED
4. If changes after submission → PATCH to update_incident
   - Re-validates automatically
5. Officer review tasks clear when status reaches SUBMITTED
```

---

## 10. Implementation Phases

### Phase 1: Backend Foundation
- [ ] Create `backend/routers/neris_api.py` — auth, payload builder, validate, submit, patch, status tracking
- [ ] Add `neris_submission_status` column to incidents
- [ ] Add `neris_nonfd_aids` JSONB column
- [ ] Add `neris_entity_id` column to mutual aid departments table
- [ ] Backend readiness calculation endpoint — what's filled vs what's missing for a given incident
- [ ] Install and test `neris-api-client` against test environment
- [ ] Create integration credentials in test portal (Client ID/Secret)
- [ ] Smoke test: fetch entity FD09190828, create a test incident

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
| 1 | Address parsing (single string → NERIS location fields) | Not started | — |
| 2 | Incident type suggestions (narrative-based analysis) | Not started | — |
| 3 | Dispatch timestamps (call_arrival, call_answered, call_create gap) | Will attempt to omit. If required, use best judgement approximation | Dispatch timestamp chat |
| 4 | Unit registration (register stations/units in NERIS) | Not started, need Client ID first | — |
| 5 | NERIS module UI (the dedicated page, conditional sections) | Spec complete, needs build | neris-module-ui-prompt.md |
| 6 | NERIS admin feature flag | Spec complete, needs build | Feature flag chat |
| 7 | NERIS API integration (auth, payload, validate, submit) | Have vendor access, need credentials | Emails from NERIS chat |
| 8 | Incident number mutability (can base.incident_number change after submission?) | Unknown, test in sandbox | — |
| 9 | Import script fix (separator and column bugs) | Fixed (`||` separator) | — |
| 10 | Medical call reporting (all EMS calls require NERIS reports) | Confirmed — yes, all medical calls | Medical NERIS chat |

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
