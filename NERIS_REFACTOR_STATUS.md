# NERIS Page Refactor — Status Tracker

## Last Updated: Batch 3 Complete — All Sections Editable

## Completed

### Batch 1: Foundation extraction
22 files extracted from monolith NerisPage.jsx. Page rendered identically. Deployed and verified.

### Batch 2: NerisContext + first 3 editable sections
Created NerisContext.jsx — loads incident, all NERIS reference data (hierarchical types, location uses, actions, flat dropdowns) in parallel. Provides `saveFields()` which saves to DB, re-fetches incident, refreshes preview automatically.

Created HierarchicalCodePicker.jsx — ported from NerisModal. Light theme, no RunSheetContext dependency, supports `children` and `subtypes` data types.

Made editable: IncidentClassification, BaseInformation, LocationUse.

### Batch 3: Remaining editable sections (Phases 6–13)
All NERIS sections now editable with per-section Save buttons, dirty tracking, and auto-preview refresh after save.

## File Structure

```
pages/NerisPage.jsx                    ← Re-export shim (route compatibility)
pages/neris/
├── NerisContext.jsx                   ← Page-level state provider
├── NerisPage.jsx                      ← Shell: NerisProvider wrapper + tabs + header
├── OverviewTab.jsx                    ← Assembles all sections
├── shared/
│   ├── nerisUtils.js                  ← Formatting helpers
│   ├── NerisComponents.jsx            ← PayloadSection, Field, FieldGrid, TabBtn, Badge, etc.
│   ├── HierarchicalCodePicker.jsx     ← Modal picker for hierarchical NERIS codes
│   ├── PayloadTab.jsx                 ← JSON payload viewer + copy
│   └── ResponseTab.jsx                ← NERIS API response display
└── sections/
    ├── IncidentClassification.jsx     ← EDITABLE: types (max 3, primary star), actions, no-action
    ├── BaseInformation.jsx            ← EDITABLE: people present, displaced, animals, narratives
    ├── LocationUse.jsx                ← EDITABLE: type/subtype picker
    ├── MutualAidDisplay.jsx           ← EDITABLE: aid direction + type
    ├── FireDetail.jsx                 ← EDITABLE: conditional on FIRE types. Investigation, arrival, damage, floor/room, cause
    ├── AlarmsAndSuppression.jsx       ← EDITABLE: conditional on structure fire. All alarm/suppression detail sub-panels
    ├── MedicalDetail.jsx              ← EDITABLE: conditional on MEDICAL types. Patient care
    ├── HazmatDetail.jsx               ← EDITABLE: conditional on HAZSIT types. Disposition, evacuated, chemicals list
    ├── Exposures.jsx                  ← EDITABLE: conditional on structure fire. Add/remove rows
    ├── EmergingHazards.jsx            ← EDITABLE: EV/battery, solar PV, CSST with detail fields
    ├── CasualtyRescues.jsx            ← EDITABLE: FF/civilian/animal rescue counts
    ├── LocationDisplay.jsx            ← READ-ONLY: geocode NG911 civic address (unchanged)
    ├── DispatchSection.jsx            ← READ-ONLY: PsapTimestampEditor + unit response table (unchanged)
    ├── TacticTimestamps.jsx           ← READ-ONLY: from payload
    ├── DispatchComments.jsx           ← READ-ONLY: CAD comments from payload
    └── ActionsTaken.jsx               ← STUB: merged into IncidentClassification
```

## Data Flow

```
NerisProvider loads on mount:
  ├── api.get('/incidents/:id')              → incident record
  ├── getIncidentTypesByCategory()           → hierarchical types for picker
  ├── getLocationUsesByCategory()            → hierarchical location uses for picker
  ├── getActionsTakenByCategory()            → hierarchical actions for picker
  └── getAllNerisDropdowns()                  → flat dropdown codes by category

Auto-preview after incident loads:
  └── api.get('/neris/preview/:id')          → { payload, errors, warnings, valid }

Section save flow:
  saveFields({ field: value, ... })
    → updateIncident(id, fields, editedBy)   → saves to DB
    → api.get('/incidents/:id')              → re-fetches incident
    → api.get('/neris/preview/:id')          → refreshes payload + validation
```

## Conditional Section Visibility

| Section | Shows when |
|---------|-----------|
| FireDetail | Any `neris_incident_type_codes` starts with `FIRE` |
| AlarmsAndSuppression | Any type contains `STRUCTURE_FIRE` or `CONFINED_COOKING` |
| MedicalDetail | Any type starts with `MEDICAL` |
| HazmatDetail | Any type starts with `HAZSIT` |
| Exposures | Any type contains `STRUCTURE_FIRE` |
| Alarm sub-panels | Corresponding presence field = `PRESENT` |

## What's Unchanged
- DispatchSection with PsapTimestampEditor — saves via `/neris/psap/:id`, identical to original
- LocationDisplay — read-only geocode data, identical to original
- Submit/Resubmit to NERIS sandbox — same endpoints, same flow
- Route: App.jsx imports `pages/NerisPage.jsx` which re-exports from `pages/neris/NerisPage.jsx`

## Phase 0 (future): Delete NERISSection from RunSheet
Per refactor plan, `components/RunSheet/neris/NERISSection.jsx` and related files get deleted once NerisPage is confirmed working. The NERIS button on RunSheet navigates to NerisPage — all NERIS data entry happens there.

## Phase 14 (future): Delete old reference files
`components/RunSheet/neris/NerisModal.jsx`, `NERISSection.jsx`, etc. are reference material only. Delete after NerisPage is stable.
