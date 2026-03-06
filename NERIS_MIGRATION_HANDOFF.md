# NERIS Schema Migration Handoff
**Date:** 2026-03-05  
**Status:** Ready to execute migration — backup complete  
**Next action:** Write and run migration 044

---

## What Was Done This Session

1. **Full schema audit** completed against live `https://api.neris.fsri.org/v1/openapi.json` (v1.4.35)
   - Every NERIS field name verified against spec
   - Full audit in `NERIS_SCHEMA_AUDIT.md`

2. **Pre-migration backup** script written and tested
   - Script: `backend/migrations/pre_migration_backup.sh`
   - Use port **5432** (direct PostgreSQL — NOT 6432/PgBouncer) for pg_dump
   - Manual backup command: `PGPASSWORD="dashboard" pg_dump -h localhost -p 5432 -U dashboard -d runsheet_db -f /opt/runsheet/backups/runsheet_db_full_$(date +%Y%m%d_%H%M%S).sql`
   - Mike ran a manual full dump before proceeding — verify it exists and is ~40MB+

3. **Bad uncommitted changes discarded** via `git checkout -- .`
   - Migration 044 (wrong rename approach) was never committed
   - apparatus.py, neris_entity.py, NerisEntityTab.jsx are clean at last commit

---

## What Needs to Be Done Next

### Step 1 — Write migration 044
Drop and recreate all three NERIS entity profile tables with correct spec field names.  
**Key rule: Only source of truth is `https://api.neris.fsri.org/v1/openapi.json`**

Tables to rebuild (NERIS profile data only — no incident data):
- `neris_entity`
- `neris_stations`  
- `neris_units`

Also: remove `apparatus.neris_unit_type` column (old duplicate, replaced by `neris_units.type`).

Full target schema is in `NERIS_SCHEMA_AUDIT.md` Section 5.

### Step 2 — Update backend
Files that reference old column names (all need updating to match new schema):
- `backend/routers/neris_entity.py` — all column names wrong, payload builder wrong
- `backend/models.py` — remove `Apparatus.neris_unit_type` field
- `backend/routers/apparatus.py` — remove `neris_unit_type` references
- `backend/services/neris/` — payload builder files reference old field names

### Step 3 — Update frontend
- `frontend/src/pages/NerisEntityTab.jsx` — hardcoded enum values wrong (invented values, not spec values)
  - `FD_TYPES` → must use `COMBINATION, CAREER, VOLUNTEER` (TypeDeptValue)
  - `FD_ENTITIES` → must use spec values (TypeEntityValue)
  - `UNIT_CAPABILITIES` → must use TypeUnitValue (49 values, load dynamically from neris_codes table)
  - All field references use old names (fd_name, fd_address_1, etc.) → new names (name, address_line_1, etc.)
  - Dispatch/staffing/assessment/shift/population are now JSONB objects not flat fields

### Step 4 — Commit and deploy

---

## Critical Schema Changes Summary

### `neris_units` — all columns renamed
| Old | New |
|-----|-----|
| `station_unit_id_1` | `cad_designation_1` |
| `station_unit_id_2` | `cad_designation_2` |
| `station_unit_capability` | `type` |
| `station_unit_staffing` | `staffing` |
| `station_unit_dedicated` | `dedicated_staffing` |
| *(missing)* | `neris_id` |

### `neris_stations` — all columns renamed
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
- Drop: `fd_telephone` (not in NERIS spec), `staff_total` (not in spec)

### `apparatus` table
- Drop column: `neris_unit_type` (old placeholder, replaced by `neris_units.type`)
- Keep everything else — apparatus table is NOT a NERIS table

---

## Safe Tables — Never Touch
These contain real operational data and must never be modified by this migration:
- `incidents` (4,065 rows)
- `incident_units` (662 rows)
- `incident_personnel` (3,229 rows)
- `apparatus` (15 rows) — except dropping `neris_unit_type` column
- `personnel` (105 rows)
- `ranks`, `municipalities`, `settings`, `audit_log`, `review_tasks`

---

## Key Files
- `NERIS_SCHEMA_AUDIT.md` — full field-by-field audit with target schema SQL
- `backend/migrations/pre_migration_backup.sh` — backup + restore script
- `backend/migrations/041_neris_entity_tables.py` — original (wrong) table creation
- `backend/routers/neris_entity.py` — router to rewrite
- `frontend/src/pages/NerisEntityTab.jsx` — frontend to rewrite

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
