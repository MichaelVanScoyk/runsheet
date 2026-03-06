# NERIS Schema Migration Handoff
**Date:** 2026-03-05  
**Status:** All code changes complete — ready to commit and deploy  
**Next action:** git commit + push → on server: git pull → run migration 044 → ./restart.sh

---

## What Was Done This Session

1. **Full schema audit** completed against live `https://api.neris.fsri.org/v1/openapi.json` (v1.4.35)
   - Every NERIS field name verified against spec
   - Full audit in `NERIS_SCHEMA_AUDIT.md`

2. **Pre-migration backup** script written and tested
   - Script: `backend/migrations/pre_migration_backup.sh`
   - Use port **5432** (direct PostgreSQL — NOT 6432/PgBouncer) for pg_dump
   - Manual backup command: `PGPASSWORD="dashboard" pg_dump -h localhost -p 5432 -U dashboard -d runsheet_db -f /opt/runsheet/backups/runsheet_db_full_$(date +%Y%m%d_%H%M%S).sql`
   - Mike ran a manual full dump — file is ~11.2MB, confirmed good

3. **Bad uncommitted changes discarded** via `git checkout -- .`
   - Migration 044 (wrong rename approach) was never committed
   - apparatus.py, neris_entity.py, NerisEntityTab.jsx are clean at last commit

4. **Migration 044 written** — `backend/migrations/044_neris_entity_rebuild.py`
   - Drops neris_units, neris_stations, neris_entity (CASCADE)
   - Recreates all three tables with spec-correct column names per NERIS_SCHEMA_AUDIT.md Section 5
   - Drops apparatus.neris_unit_type
   - Uses port 5432 (direct PostgreSQL — not PgBouncer)
   - NOT yet run on server — code must be updated first

---

## Deployment Order — CRITICAL

Code and schema must land together. Wrong order = broken app.

1. Update all code locally (steps below)
2. Git commit and push
3. On server: `git pull` → run migration 044 → `./restart.sh`

---

## neris_unit_type — Confirmed Removal

**Source: `https://api.neris.fsri.org/v1/openapi.json` fetched live via browser 2026-03-05**

`apparatus.neris_unit_type` has no role in any NERIS payload. Confirmed from spec:

- `CreateUnitPayload` required fields: `staffing`, `type`, `cad_designation_1`
- The `type` field (TypeUnitValue) lives on `neris_units.type` — not on apparatus
- `DispatchUnitResponsePayload` links a responding unit via `unit_neris_id` (pattern `^FD\d{8}S\d{3}U\d{3}$`) which is `neris_units.neris_id` assigned by NERIS after entity registration — not from apparatus
- The apparatus options dropdown for unit-linking only needs `id`, `unit_designator`, `name`

`neris_unit_type` is a pre-spec placeholder with no spec basis. Remove everywhere:

| File | What to remove |
|------|----------------|
| `backend/models.py` | `neris_unit_type = Column(Text)` from `Apparatus` class and its comment block |
| `backend/routers/apparatus.py` | Field from `ApparatusCreate`, `ApparatusUpdate`, `apparatus_to_dict()`, and `Apparatus()` constructor in `create_apparatus` |
| `backend/routers/neris_entity.py` | `_get_apparatus_options()` — remove `neris_unit_type` from SELECT and returned dict |
| `frontend/src/pages/ApparatusPage.jsx` | Remove from `formData` state, `handleAdd()` defaults, `handleEdit()` mapping, the NERIS Type `<select>` form field, `loadApparatusTypes()` function and its state |

---

## What Needs to Be Done — Code Changes

### Step 1 — models.py ✅ DONE
- Removed `neris_unit_type = Column(Text)` and comment from `Apparatus` class

### Step 2 — apparatus.py ✅ DONE
- Removed `neris_unit_type` from `ApparatusCreate`, `ApparatusUpdate`, `apparatus_to_dict()`, `Apparatus()` constructor

### Step 3 — ApparatusPage.jsx ✅ DONE
- Removed `neris_unit_type` from formData, handleAdd, handleEdit, form field, loadApparatusTypes function and state

### Step 4 — neris_entity.py ✅ DONE
All Pydantic schemas, SQL queries, and column names use old field names from 041.
Must be rewritten to match new schema from NERIS_SCHEMA_AUDIT.md Section 5.
Key changes:
- `EntityUpdate` schema — all fields renamed to spec names, flat dispatch/staffing/etc replaced with JSONB fields
- `StationCreate`/`StationUpdate` — all fields renamed
- `UnitCreate`/`UnitUpdate` — all fields renamed (station_unit_id_1 → cad_designation_1, etc.)
- `_get_entity()` — all column names in SELECT updated
- `_get_stations()` — all column names updated
- `_get_units()` — all column names updated
- `_get_apparatus_options()` — remove neris_unit_type, return only id/unit_designator/name
- `update_entity()` INSERT/UPDATE — column names updated
- `add_station()` INSERT — column names updated
- `update_station()` — column names updated
- `add_unit()` INSERT — column names updated (station_unit_id_1 → cad_designation_1, etc.)
- `update_unit()` — column names updated
- `validate_entity()` — field references updated
- `_build_entity_payload()` — full rewrite to build spec-correct payload from new column names
- `submit_entity()` — fd_neris_id reference unchanged (column kept)

### Step 5 — NerisEntityTab.jsx ✅ DONE

#### Spec-confirmed enums (api.neris.fsri.org/v1/openapi.json, 2026-03-05)

**TypeDeptValue:** `CAREER`, `COMBINATION`, `VOLUNTEER`

**TypeEntityValue:** `CONTRACT`, `FEDERAL`, `LOCAL`, `OTHER`, `PRIVATE`, `STATE`, `TRANSPORTATION`, `TRIBAL`

**TypeUnitValue (49):** `AIR_EMS` `AIR_LIGHT` `AIR_RECON` `AIR_TANKER` `ALS_AMB` `ARFF` `ATV_EMS` `ATV_FIRE` `BLS_AMB` `BOAT` `BOAT_LARGE` `CHIEF_STAFF_COMMAND` `CREW` `CREW_TRANS` `DECON` `DOZER` `EMS_NOTRANS` `EMS_SUPV` `ENGINE_STRUCT` `ENGINE_WUI` `FOAM` `HAZMAT` `HELO_FIRE` `HELO_GENERAL` `HELO_RESCUE` `INVEST` `LADDER_QUINT` `LADDER_SMALL` `LADDER_TALL` `LADDER_TILLER` `MAB` `MOBILE_COMMS` `MOBILE_ICP` `OTHER_GROUND` `PLATFORM` `PLATFORM_QUINT` `POV` `QUINT_TALL` `REHAB` `RESCUE_HEAVY` `RESCUE_LIGHT` `RESCUE_MEDIUM` `RESCUE_USAR` `RESCUE_WATER` `SCBA` `TENDER` `UAS_FIRE` `UAS_RECON` `UTIL`

**TypeServFdValue (fire_services):** `ANIMAL_TECHRESCUE` `ARFF_FIREFIGHTING` `CAUSE_ORIGIN` `CAVE_SAR` `COLLAPSE_RESCUE` `CONFINED_SPACE` `DIVE_SAR` `FLOOD_SAR` `HAZMAT_OPS` `HAZMAT_TECHNICIAN` `HELO_SAR` `HIGHRISE_FIREFIGHTING` `ICE_RESCUE` `MACHINERY_RESCUE` `MARINE_FIREFIGHTING` `MINE_SAR` `PETROCHEM_FIREFIGHTING` `REHABILITATION` `ROPE_RESCUE` `RRD_EXISTING` `RRD_NEWCONST` `RRD_PLANS` `RRD_PUBLICED` `STRUCTURAL_FIREFIGHTING` `SURF_RESCUE` `SWIFTWATER_SAR` `TOWER_SAR` `TRAINING_DRIVER` `TRAINING_ELF` `TRAINING_OD` `TRAINING_VETFF` `TRENCH_RESCUE` `VEHICLE_RESCUE` `WATERCRAFT_RESCUE` `WATER_SAR` `WILDERNESS_SAR` `WILDLAND_FIREFIGHTING`

**TypeServEmsValue (ems_services):** `AERO_TRANSPORT` `ALS_NO_TRANSPORT` `ALS_TRANSPORT` `BLS_NO_TRANSPORT` `BLS_TRANSPORT` `COMMUNITY_MED` `NO_MEDICAL`

**TypeServInvestValue (investigation_services):** `COMPANY_LEVEL` `DEDICATED` `K9_DETECT` `LAW_ENFORCEMENT` `YOUTH_FIRESETTER`

**DepartmentPayload required:** `address_line_1`, `city`, `state`, `zip_code`, `name`, `time_zone`

**DepartmentDispatchPayload fields:** `avl_usage` (bool), `center_id` (str), `cad_software` (str), `psap_type` (PRIMARY/SECONDARY), `psap_capability` (LEGACY/NG911), `psap_discipline` (MULTIPLE/SINGLE), `psap_jurisdiction` (MULTIPLE/SINGLE), `protocol_fire` (APCO/IAED/OTHER/PROQA), `protocol_med` (APCO/IAED/OTHER/PROQA)

**StaffingPayload fields:** `active_firefighters_career_ft`, `active_firefighters_career_pt`, `active_firefighters_volunteer`, `active_ems_only_career_ft`, `active_ems_only_career_pt`, `active_ems_only_volunteer`, `active_civilians_career_ft`, `active_civilians_career_pt`, `active_civilians_volunteer`

**AssessmentPayload fields:** `iso_rating` (int 1-10), `cpse_accredited` (bool), `caas_accredited` (bool)

**ShiftPayload fields:** `count` (int), `duration` (int), `signup` (int)

**PopulationPayload fields:** `protected` (int), `source` (CENSUS_DERIVED/DEPARTMENT_ENTERED)

#### Old field name → new name mapping for NerisEntityTab.jsx
| Old (wrong) | New (spec) |
|---|---|
| `fd_name` | `name` |
| `fd_id_legacy` | `internal_id` |
| `fd_type` | `department_type` (CAREER/COMBINATION/VOLUNTEER only — paid_on_call not in spec) |
| `fd_entity` | `entity_type` (CONTRACT/FEDERAL/LOCAL/OTHER/PRIVATE/STATE/TRANSPORTATION/TRIBAL) |
| `fd_address_1` | `address_line_1` |
| `fd_address_2` | `address_line_2` |
| `fd_city` | `city` |
| `fd_state` | `state` |
| `fd_zip` | `zip_code` |
| `fd_website` | `website` |
| `fd_telephone` | **NOT IN SPEC — remove** |
| `fd_population_protected` | `population.protected` (JSONB) |
| `assess_iso_rating` | `assessment.iso_rating` (JSONB) |
| `fd_fire_services` | `fire_services` |
| `fd_ems_services` | `ems_services` |
| `fd_investigation_services` | `investigation_services` |
| `dispatch_center_id` | `dispatch.center_id` (JSONB) |
| `dispatch_cad_software` | `dispatch.cad_software` (JSONB) |
| `dispatch_avl_usage` | `dispatch.avl_usage` (JSONB) |
| `dispatch_protocol_fire` | `dispatch.protocol_fire` (JSONB) |
| `dispatch_protocol_medical` | `dispatch.protocol_med` (JSONB — note: `med` not `medical`) |
| `staff_total` | **NOT IN SPEC — remove** |
| `staff_active_ff_career_ft` | `staffing.active_firefighters_career_ft` (JSONB) |
| `staff_active_ff_career_pt` | `staffing.active_firefighters_career_pt` |
| `staff_active_ff_volunteer` | `staffing.active_firefighters_volunteer` |
| `staff_active_ems_only_career_ft` | `staffing.active_ems_only_career_ft` |
| `staff_active_ems_only_volunteer` | `staffing.active_ems_only_volunteer` |
| `staff_active_civilians_career_ft` | `staffing.active_civilians_career_ft` |
| `staff_active_civilians_volunteer` | `staffing.active_civilians_volunteer` |
| `station_address_1` | `address_line_1` |
| `station_city` | `city` |
| `station_state` | `state` |
| `station_zip` | `zip_code` |
| `station_staffing` | `staffing` |
| `station_unit_id_1` | `cad_designation_1` |
| `station_unit_id_2` | `cad_designation_2` |
| `station_unit_capability` | `type` |
| `station_unit_staffing` | `staffing` |

### Step 5 — ApparatusPage.jsx
- Remove neris_unit_type field and loadApparatusTypes (see table above)

---

## Critical Schema Changes Summary

### `neris_units` — columns renamed
| Old | New |
|-----|-----|
| `station_unit_id_1` | `cad_designation_1` |
| `station_unit_id_2` | `cad_designation_2` |
| `station_unit_capability` | `type` |
| `station_unit_staffing` | `staffing` |
| `station_unit_dedicated` | `dedicated_staffing` |
| *(missing)* | `neris_id` |

### `neris_stations` — columns renamed
| Old | New |
|-----|-----|
| `station_address_1` | `address_line_1` |
| `station_address_2` | `address_line_2` |
| `station_city` | `city` |
| `station_state` | `state` |
| `station_zip` | `zip_code` |
| `station_staffing` | `staffing` |
| `station_point_lat` + `station_point_lng` | `location` JSONB `{ lat, lng }` |
| *(missing)* | `internal_id` |
| *(missing)* | `neris_id` |

### `neris_entity` — major restructure
- Top-level renames: `fd_name`→`name`, `fd_type`→`department_type`, `fd_entity`→`entity_type`, `fd_zip`→`zip_code`, `fd_website`→`website`, `fd_id_legacy`→`internal_id`, `fd_address_*`→`address_*`
- `fd_point_lat` + `fd_point_lng` → `location` JSONB `{ lat, lng }`
- All `dispatch_*` flat columns → single `dispatch` JSONB column
- All `staff_*` flat columns → single `staffing` JSONB column
- `assess_iso_rating` → single `assessment` JSONB column (adds `cpse_accredited`, `caas_accredited`)
- `fd_shift_*` flat columns → single `shift` JSONB column (adds `signup`)
- `fd_population_protected` → single `population` JSONB column (adds `source`)
- New columns: `email`, `time_zone`, `continue_edu`, `fips_code`, mailing address fields
- Drop: `fd_telephone` (not in spec), `staff_total` (not in spec)

### `apparatus` table
- Drop column: `neris_unit_type` — handled by migration 044
- Keep everything else

---

## Safe Tables — Never Touch
- `incidents` (4,065 rows)
- `incident_units` (662 rows)
- `incident_personnel` (3,229 rows)
- `apparatus` (15 rows) — except dropping `neris_unit_type`, handled by migration
- `personnel` (105 rows)
- `ranks`, `municipalities`, `settings`, `audit_log`, `review_tasks`

---

## Key Files
- `NERIS_SCHEMA_AUDIT.md` — full field-by-field audit with target schema SQL (Section 5)
- `backend/migrations/pre_migration_backup.sh` — backup + restore script
- `backend/migrations/044_neris_entity_rebuild.py` — **ready to run** (run after git pull on server)
- `backend/routers/neris_entity.py` — ✅ rewritten with spec-correct column names
- `frontend/src/pages/NerisEntityTab.jsx` — ✅ rewritten with spec enums + new field names
- `frontend/src/pages/ApparatusPage.jsx` — ✅ neris_unit_type removed
- `backend/models.py` — ✅ neris_unit_type removed
- `backend/routers/apparatus.py` — ✅ neris_unit_type removed

---

## Server Info
- SSH: `ssh dashboard@glenmoorefc.cadreport.com`
- Restart: `cd /opt/runsheet && git pull && ./restart.sh`
- Backend logs: `sudo journalctl -u runsheet -n 50 --no-pager`
- Backup location: `/opt/runsheet/backups/`
- Restore command: `./backend/migrations/pre_migration_backup.sh restore`

---

## Development Rules (Always)
- No code without explicit permission — discuss first
- No hardcoded values — everything from DB/API
- No monolithic components — per-section files
- No dark themes — light backgrounds only
- No placeholder text in form fields
- No edit/toggle buttons — always editable
- NERIS spec is the ONLY source of truth — `https://api.neris.fsri.org/v1/openapi.json`
- Restart via `./restart.sh` only — never manual
- Git on Windows: separate lines, no `&&`
