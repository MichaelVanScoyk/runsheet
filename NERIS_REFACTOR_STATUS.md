# NERIS Page Refactor — Status Tracker

## Last Updated: Batch 2 — Editable Sections (Phase 1, 2, 5)

## Completed

### Batch 1: Foundation extraction
22 files extracted from monolith. Page renders identically. Deployed and verified.

### Batch 2: Editable sections + context

**New files:**
| File | Purpose |
|------|---------|
| `neris/NerisContext.jsx` | Page-level state: loads incident, reference data, dropdowns. Provides `saveFields()` which saves to incident, re-fetches, refreshes preview. |
| `neris/shared/HierarchicalCodePicker.jsx` | Ported from NerisModal. Light theme. No RunSheetContext dependency. Handles `children` and `subtypes` data types. |

**Editable sections (3):**
| Section | Fields | Save mechanism |
|---------|--------|---------------|
| `IncidentClassification.jsx` | `neris_incident_type_codes`, `neris_incident_type_primary`, `neris_action_codes`, `neris_noaction_code` | Individual save button, dirty tracking |
| `BaseInformation.jsx` | `neris_people_present`, `neris_displaced_number`, `neris_rescue_animal`, `neris_narrative_outcome`, `neris_narrative_impedance` | Individual save button, "Copy to NERIS" from run sheet narrative |
| `LocationUse.jsx` | `neris_location_use` (JSONB with use_type/use_subtype) | Individual save button, picker modal |

**Updated files:**
- `NerisPage.jsx` — wraps in `NerisProvider`, uses `useNeris()` for all state
- `OverviewTab.jsx` — uses `useNeris()`, editable sections get data from context, read-only sections still get payload as props

**Unchanged (identical to original):**
- `DispatchSection.jsx` — PsapTimestampEditor untouched
- `LocationDisplay.jsx` — geocode display untouched
- All other read-only sections

## How It Works

1. NerisProvider loads incident + all NERIS reference data (types, location uses, actions, dropdowns) in parallel
2. Auto-previews after incident loads
3. Editable sections read from `incident` via `useNeris()`, maintain local state
4. Each section has its own Save button → calls `saveFields({...})` → saves to DB → re-fetches incident → refreshes preview
5. Preview/validation updates automatically after each save

## Data flow
```
getAllNerisDropdowns() → dropdowns.type_noaction, dropdowns.type_aid, etc.
getIncidentTypesByCategory() → hierarchical data for code picker
getLocationUsesByCategory() → hierarchical data for location use picker  
getActionsTakenByCategory() → hierarchical data for actions picker
api.get('/incidents/:id') → incident record with all neris_ fields
saveFields() → updateIncident() → re-fetch incident → re-fetch preview
```

## Remaining read-only sections (future batches)
These currently display payload data. To make editable, follow same pattern:
- MutualAidDisplay (Phase 6)
- FireDetail (Phase 7)  
- AlarmsAndSuppression (Phase 8)
- MedicalDetail (Phase 9)
- HazmatDetail (Phase 10)
- Exposures (Phase 11)
- EmergingHazards (Phase 12)
- CasualtyRescues (Phase 13)
