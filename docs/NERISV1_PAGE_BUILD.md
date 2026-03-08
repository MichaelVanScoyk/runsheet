# NERISv1 Page Build — Handoff Document

> **Status:** In progress. This document tracks the NerisPage build so work can continue across chat sessions.
> **Last updated:** 2026-03-07

---

## What Exists Today

### nerisv1 Backend (complete)
- **Location:** `backend/services/nerisv1/`
- 23 section builder files (one per IncidentPayload module) + `builder.py` orchestrator
- Shared sub-schemas in `shared/`: location.py, geo.py, location_use.py, cross_street.py
- All 23 sections marked complete in `docs/NERIS_BUILD_TRACKER.md`
- Builder expects a NERIS-native dict as input — zero translation inside builders

### nerisv1 Frontend Components (complete)
- **Location:** `frontend/src/pages/nerisv1/`
- 23 section components (one per module) + shared components in `shared/`
- Each component's form fields map 1:1 to NERIS schema fields
- Components are standalone — NOT yet wired into any page or route

### Mapping Config System (complete — this session)
- **Migration:** `backend/migrations/046_neris_field_mapping.sql`
  - `neris_field_mapping` table — alias registry: NERIS field X reads from DB column Y
  - `neris_field_mapping_columns_log` — audit trail for columns created via UI
- **Router:** `backend/routers/nerisv1_mapping.py`
  - `GET /api/nerisv1/mapping/schema` — DB introspection (information_schema.columns)
  - `GET /api/nerisv1/mapping/sample-data` — latest CLOSED incident data per column
  - `GET /api/nerisv1/mapping` — all active mappings
  - `GET /api/nerisv1/mapping/section/{num}` — mappings for one section
  - `POST /api/nerisv1/mapping` — create mapping
  - `PUT /api/nerisv1/mapping/{id}` — update mapping
  - `DELETE /api/nerisv1/mapping/{id}` — delete mapping
  - `POST /api/nerisv1/mapping/create-column` — ALTER TABLE ADD COLUMN with audit log
  - `GET /api/nerisv1/mapping/columns-log` — audit trail
- **Frontend:** `frontend/src/pages/NerisMappingTab.jsx`
  - Admin tab (🔗 NERIS Mapping) — drag-drop UI, section-focused, sample data display
  - Registered in AdminPage.jsx
- **Registered in:** `backend/main.py` under `/api/nerisv1` prefix
- **NERIS Codes Sync:** `backend/routers/nerisv1_sync.py` — already existed, pulls enums from live spec

### MutualAidSection (complete — in RunSheetForm)
- **Location:** `frontend/src/components/RunSheet/sections/MutualAidSection.jsx`
- Handles GIVEN/RECEIVED/NONE direction, aid type, department selection
- Auto-detects CAD mutual aid units, maps to departments
- Creates departments/units on the fly
- **Plan:** Move to NerisPage (or share between both)

---

## What Needs To Be Built

### 1. Migration: `nerisv1_data` JSONB on incidents
- Add `nerisv1_data JSONB` column to `incidents` table
- Stores NERIS field values that have NO mapping to existing DB columns
- Overflow storage only — mapped fields read/write to their original source columns

### 2. Backend Adapter (`backend/services/nerisv1/adapter.py`)
- Reads `neris_field_mapping` config table
- Fetches incident + incident_units + incident_personnel + municipalities + apparatus + settings
- Applies transforms (direct, timestamp_iso, geo_point, json_extract, etc.)
- Outputs NERIS-native dict ready for the builder
- **Key rule:** Mapped fields read from original DB column. Unmapped fields read from `nerisv1_data` JSONB.

### 3. Backend Endpoints for NerisPage
- `GET /api/nerisv1/incident/{id}` — runs adapter, returns NERIS-native dict + metadata (what mapped, what's empty, what errored)
- `PUT /api/nerisv1/incident/{id}` — saves edits:
  - Mapped fields write back to original source column (via mapping config)
  - Unmapped fields write to `nerisv1_data` JSONB
- `POST /api/nerisv1/incident/{id}/validate` — runs builder, sends to NERIS validate endpoint
- `POST /api/nerisv1/incident/{id}/submit` — runs builder, submits to NERIS

### 4. Frontend NerisPage (`frontend/src/pages/NerisPage.jsx`)
- **Route:** `/neris/:incident_id` — standalone page, NOT embedded in RunSheetForm
- **Layout:** Section tabs across top (23 sections), editable form below
- **Data flow:**
  1. On load: calls `GET /api/nerisv1/incident/{id}` to get pre-populated data
  2. User edits fields directly
  3. Save: calls `PUT /api/nerisv1/incident/{id}` to write back
  4. Validate: calls validate endpoint, shows results
  5. Submit: calls submit endpoint, shows confirmation
- **Components:** Uses the 23 existing nerisv1 section components
- **MutualAidSection:** Moved here from RunSheetForm (handles NERIS sections 5+6)
- **Access:** Eventually gated to super-admin/super-user only
- **Future:** Could be surfaced as a modal overlay from RunSheetForm or incidents list

### 5. Route Registration
- Add `/neris/:incident_id` route in frontend router
- Link from incidents list or RunSheetForm to open NerisPage for an incident

---

## Key Design Decisions

### Data stays in original location
- The incident record IS the data. NERIS is an alias/view of that data.
- Editing a NERIS field on the form writes back to the original DB column.
- The mapping config is bidirectional — tells the form where to read AND write.
- `nerisv1_data` JSONB is overflow only — for fields with no mapping.

### Mapping config is an alias registry
- `neris_field_mapping` table: NERIS field path → source table + column + transform
- Supports fan-in (multiple sources → one field with priority/fallback)
- Supports fan-out (one source → multiple NERIS fields)
- Transform types: direct, timestamp_iso, geo_point, json_extract, row_per_entry, lookup, address_parse, enum_map
- Create columns on the fly from the mapping UI

### Separation from RunSheetForm
- NerisPage is a separate route/view, not a tab in RunSheetForm
- Eventually could appear as a modal overlay that "looks like" it's in RunSheetForm
- MutualAidSection shared or moved to NerisPage

### Access control
- Mapping config UI: super-admin only (hidden from tenants)
- NerisPage form: super-user or super-admin
- Not for general tenant users to configure

---

## Build Order

1. ~~Mapping config table + router + UI~~ ✅ Done
2. Migration: `nerisv1_data` JSONB column
3. Backend adapter (read mapping config → build NERIS dict from incident)
4. Backend load/save endpoints
5. Frontend NerisPage shell (route, section tabs, loads data)
6. Wire up existing section components one by one
7. Move MutualAidSection
8. Validate + Submit endpoints
9. Preview JSON view
10. Access control / role gating

---

## File Locations Reference

| What | Path |
|------|------|
| Build tracker | `docs/NERIS_BUILD_TRACKER.md` |
| This handoff doc | `docs/NERISV1_PAGE_BUILD.md` |
| Backend builders | `backend/services/nerisv1/` |
| Backend mapping router | `backend/routers/nerisv1_mapping.py` |
| Backend sync router | `backend/routers/nerisv1_sync.py` |
| Frontend section components | `frontend/src/pages/nerisv1/` |
| Frontend mapping tab | `frontend/src/pages/NerisMappingTab.jsx` |
| MutualAidSection | `frontend/src/components/RunSheet/sections/MutualAidSection.jsx` |
| Admin page (tabs) | `frontend/src/pages/AdminPage.jsx` |
| Main.py (router registration) | `backend/main.py` |
| Migration dir | `backend/migrations/` |
