# NERIS Page Refactor — Status Tracker

## Last Updated: Batch 1 Complete — Extraction

## Completed

### Batch 1: Foundation extraction (no behavior change)
All code extracted verbatim from the original monolithic NerisPage.jsx into modular files.

**Route continuity:** `pages/NerisPage.jsx` re-exports from `pages/neris/NerisPage.jsx`. App.jsx import unchanged.

**Files created:**

| File | Contents |
|------|----------|
| `pages/neris/NerisPage.jsx` | Shell — incident load, preview, submit, resubmit, tabs, header |
| `pages/neris/OverviewTab.jsx` | Assembles all sections with validation summary |
| `pages/neris/shared/nerisUtils.js` | btnStyle, thStyle, tdStyle, toLocalDatetimeStr, formatTs, formatBool, formatLabel, formatNerisCode |
| `pages/neris/shared/NerisComponents.jsx` | PayloadSection, FieldGrid, Field, FieldBlock, StatusBadge, TabBtn, Badge |
| `pages/neris/shared/PayloadTab.jsx` | JSON payload viewer with copy |
| `pages/neris/shared/ResponseTab.jsx` | NERIS API response display |
| `pages/neris/sections/BaseInformation.jsx` | dept ID, incident number, people present, displaced, narratives |
| `pages/neris/sections/LocationDisplay.jsx` | **UNTOUCHED** — read-only geocode display, identical to original |
| `pages/neris/sections/LocationUse.jsx` | Location use type/subtype display |
| `pages/neris/sections/IncidentClassification.jsx` | Incident type pills with primary star |
| `pages/neris/sections/DispatchSection.jsx` | **UNTOUCHED** — PsapTimestampEditor + unit response table, identical to original |
| `pages/neris/sections/TacticTimestamps.jsx` | Tactic timestamp display |
| `pages/neris/sections/ActionsTaken.jsx` | Action/no-action display |
| `pages/neris/sections/MutualAidDisplay.jsx` | Mutual aid from payload |
| `pages/neris/sections/FireDetail.jsx` | Conditional fire detail display |
| `pages/neris/sections/AlarmsAndSuppression.jsx` | Risk reduction alarm/suppression display |
| `pages/neris/sections/MedicalDetail.jsx` | Conditional medical display |
| `pages/neris/sections/HazmatDetail.jsx` | Conditional hazmat display |
| `pages/neris/sections/CasualtyRescues.jsx` | Casualty/rescue list |
| `pages/neris/sections/EmergingHazards.jsx` | EV/solar/CSST hazard display |
| `pages/neris/sections/DispatchComments.jsx` | CAD dispatch comments |
| `pages/NerisPage.jsx` | Re-export shim for route compatibility |

**Total: 22 files replacing 1 monolith.**

## NERIS API Reference (from NERIS docs)

Three operations for incidents:
1. `create_incident` — POST full payload → returns neris_id
2. `validate_incident` — POST same payload → dry-run, returns errors/warnings
3. `patch_incident` — PATCH by neris_id → updates individual sections after creation

Each section on NerisPage edits incident fields in our DB → payload builder assembles NERIS format → submit sends assembled payload.

## Next: Batch 2 — Editable sections

Priority per refactor plan:
1. IncidentClassification — add code picker, editable types/actions/no-action
2. BaseInformation — add editable fields for people present, displaced, narratives
3. LocationUse — add type/subtype pickers
4. MutualAidDisplay — display from run sheet data
5. FireDetail — conditional, dropdowns from neris_codes
6. AlarmsAndSuppression — conditional, field-heavy
7. MedicalDetail — conditional, simple dropdown
8. HazmatDetail — conditional, chemicals list
9. Exposures, EmergingHazards, CasualtyRescues — optional sections

Shared components needed for Batch 2:
- SectionWrapper (dirty tracking, save, loading feedback)
- NerisDropdown (fetch codes by category, render select)
- NerisMultiSelect (multi-select for code arrays)
- HierarchicalCodePicker (ported from NerisModal, uses branding, no RunSheetContext dependency)
