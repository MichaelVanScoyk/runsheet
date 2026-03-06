# NERIS Entity Migration Plan
_Last updated: Phase 0 — Pre-flight_

## Purpose
Replace the flat settings-based NERIS station/unit config with a proper
Entity data model matching the NERIS spec exactly. The NERIS term for a
fire department's organizational profile is **Entity** (`fd_neris_id`).
Stations and units are embedded within the Entity, not separate registrations.

---

## Context

### Key NERIS Terms
- **Entity** — the fire department profile. One per tenant. Identified by `fd_neris_id` (e.g. `FD42029593`)
- **Station** — physical station within the Entity. Self-assigned ID e.g. `FD42029593S001`
- **Unit** — apparatus at a station. Identified by `station_unit_id_1` which **must match CAD exactly**
- `station_unit_id_1` maps directly to `apparatus.unit_designator` — this is the critical link for incident payloads
- `unit_id_linked` in incident submissions is populated from `station_unit_id_1`

### What Is Being Replaced
| Old | New |
|-----|-----|
| `settings` keys: `station_name`, `station_address_line1`, `station_city`, `station_state`, `station_zip`, `station_neris_id` | `neris_stations` table |
| `settings` key: `department_neris_id` | `neris_entity.fd_neris_id` |
| `settings` key: `fd_name` (neris category) | `neris_entity.fd_name` |
| `apparatus.neris_unit_id` column | `neris_units.station_unit_id_1` (already is `unit_designator`) |
| `NerisSetupTab.jsx` | `NerisEntityTab.jsx` |

### What Is NOT Changing
- `settings` keys kept: `client_id`, `client_secret`, `environment`, `submission_enabled`, `auto_generate_neris_id`
- `apparatus` table otherwise unchanged
- `neris_submit.py` logic unchanged except one line (see Phase 6)
- `payload_dispatch.py` unit linking logic — `reported_unit_id` stays as-is for now; `unit_id_linked` upgrade is future work once Entity is populated

### Audit Results (conflicts found)
- `department_neris_id` referenced in `neris_submit.py` → update in Phase 6
- `neris_dispatch_center_id` per-incident field in `DispatchSection.jsx` → **no change needed**, both levels valid
- `branding_config.py` uses `station_name` under category `station` not `neris` → **no conflict**

---

## Glen Moore Seed Data (for Migration 042)
- `fd_neris_id`: `FD42029593`
- `fd_name`: `Glen Moore Fire Company`
- `fd_address_1`: `578 Fairview Rd`
- `fd_city`: `Glenmoore`
- `fd_state`: `PA`
- `fd_zip`: `19343`
- Station ID convention: `FD42029593S001`
- Station name: `Station 48`
- Units: seed from existing `apparatus` table where `unit_category = 'APPARATUS'` and `active = true`

---

## Phase Checklist

### ✅ Phase 0 — Pre-flight
- [ ] Run pg_dump (manual, Mike runs)
  ```bash
  pg_dump -U dashboard -d runsheet_db -f ~/runsheet_backup_pre_entity_migration.sql
  ```
- [ ] Confirm `NerisSetupTab.jsx` is live and building cleanly (build error was fixed)
- [ ] Confirm current settings keys exist in DB (Mike verifies or shares output)

---

### ⬜ Phase 1 — Migration 041: Create Tables
**File:** `backend/migrations/041_neris_entity_tables.py`

Creates three tables:

**`neris_entity`** — one row per tenant
```sql
id, tenant_id (nullable for single-tenant),
fd_neris_id, fd_name, fd_id_legacy,
fd_address_1, fd_address_2, fd_city, fd_state, fd_zip,
fd_point_lat, fd_point_lng,
fd_telephone, fd_website,
fd_type, fd_entity,
fd_population_protected, fd_station_count (computed),
fd_fire_services (text[]), fd_ems_services (text[]),
fd_investigation_services (text[]),
dispatch_center_id, dispatch_cad_software, rms_software,
dispatch_avl_usage (bool),
dispatch_psap_capability, dispatch_psap_discipline,
dispatch_psap_jurisdiction, dispatch_psap_type,
dispatch_protocol_fire, dispatch_protocol_medical,
fd_shift_duration (int), fd_shift_count (int),
staff_total (int), staff_active_ff_volunteer (int),
staff_active_ff_career_ft (int), staff_active_ff_career_pt (int),
staff_active_ems_only_volunteer (int),
staff_active_ems_only_career_ft (int), staff_active_ems_only_career_pt (int),
staff_active_civilians_career_ft (int), staff_active_civilians_career_pt (int),
staff_active_civilians_volunteer (int),
assess_iso_rating (int),
neris_entity_submitted_at (timestamptz),
neris_entity_status (text default 'draft'),
neris_annual_renewal_month (int default 1),
created_at, updated_at
```

**`neris_stations`** — one row per station
```sql
id, entity_id (FK → neris_entity.id),
station_id (text, e.g. FD42029593S001),
station_name (text),
station_address_1, station_address_2,
station_city, station_state, station_zip,
station_point_lat, station_point_lng,
station_staffing (int),
display_order (int default 0),
created_at, updated_at
```

**`neris_units`** — one row per unit
```sql
id, station_id (FK → neris_stations.id),
station_unit_id_1 (text, must match CAD / apparatus.unit_designator),
station_unit_id_2 (text, optional alias),
station_unit_capability (text, NERIS enum),
station_unit_staffing (int),
station_unit_dedicated (bool default false),
apparatus_id (int, FK → apparatus.id, nullable),
display_order (int default 0),
created_at, updated_at
```

**Deploy:**
```
cd C:\Users\micha\runsheet
git commit -am "migration 041: create neris_entity, neris_stations, neris_units tables"
git push
```
```bash
cd /opt/runsheet && git pull && ./restart.sh
```
Then run migration endpoint or psql directly.

---

### ⬜ Phase 2 — Migration 042: Seed Glen Moore Data
**File:** `backend/migrations/042_neris_entity_seed_glenmoor.py`

1. Insert one row into `neris_entity` with Glen Moore data (see seed data above)
2. Insert one row into `neris_stations` for Station 48
3. Insert rows into `neris_units` for each active APPARATUS-category unit from `apparatus` table
   - `station_unit_id_1` = `apparatus.unit_designator`
   - `station_unit_capability` = map from `apparatus.neris_unit_type` if present, else null
   - `apparatus_id` = `apparatus.id`

**Deploy:** same pattern — commit, push, pull, restart, run migration.

---

### ⬜ Phase 3 — Migration 043: Drop Old Keys
**File:** `backend/migrations/043_neris_settings_cleanup.py`

Removes from `settings` table (category = `neris`):
- `station_neris_id`
- `station_name`
- `station_address_line1`
- `station_city`
- `station_state`
- `station_zip`

Removes from `apparatus` table:
- Column `neris_unit_id`

**Note:** `department_neris_id` and `fd_name` in settings are removed ONLY after Phase 5
(backend) confirms `neris_submit.py` is updated to read from `neris_entity`.

**Deploy:** same pattern.

---

### ⬜ Phase 4 — Backend: New Entity API Endpoints
**File:** `backend/routers/neris_entity.py` (new file)

Routes:
```
GET    /api/neris/entity                   — full entity + stations + units
PUT    /api/neris/entity                   — update entity fields
POST   /api/neris/stations                 — add station
PUT    /api/neris/stations/{id}            — update station
DELETE /api/neris/stations/{id}            — remove station
POST   /api/neris/stations/{id}/units      — add unit to station
PUT    /api/neris/units/{id}               — update unit
DELETE /api/neris/units/{id}               — remove unit
POST   /api/neris/entity/validate          — local completeness check
POST   /api/neris/entity/submit            — build Entity payload + POST to NERIS API
```

Validation check (`/validate`) confirms:
- `fd_neris_id` present
- `fd_name` present
- At least one station
- Each station has at least one unit
- Each unit has `station_unit_id_1` and `station_unit_capability`
- Required address fields present

Register in `main.py`:
```python
from routers.neris_entity import router as neris_entity_router
app.include_router(neris_entity_router, prefix="/api/neris")
```

**Deploy:** commit, push, pull, restart.

---

### ⬜ Phase 5 — Update neris_submit.py
**File:** `backend/routers/neris_submit.py`

Single change in `_build_preview()`:
```python
# OLD:
department_neris_id = settings.get("department_neris_id")

# NEW:
from sqlalchemy import text
entity_row = db.execute(text("SELECT fd_neris_id FROM neris_entity LIMIT 1")).fetchone()
department_neris_id = entity_row[0] if entity_row else settings.get("department_neris_id")
```

The fallback to settings keeps things working if Entity table is empty.

Also update `/submit` and `/resubmit` endpoints which have the same `department_neris_id` lookup.

**Deploy:** commit, push, pull, restart.

---

### ⬜ Phase 6 — Frontend: NerisEntityTab.jsx
**File:** `frontend/src/pages/NerisEntityTab.jsx` (new, replaces NerisSetupTab.jsx)

Sub-tab structure:
```
[ ⚙️ Credentials ]  [ 🏛️ Entity ]
```

**Credentials sub-tab** (identical to current NerisSetupTab credentials section):
- Environment toggle (test/production)
- `client_id`, `client_secret`
- `submission_enabled` toggle
- `auto_generate_neris_id` toggle

**Entity sub-tab** — collapsible sections:
1. **Entity Identification** — `fd_neris_id` (badge display), `fd_name`, `fd_id_legacy`
2. **Address** — `fd_address_1/2`, city, state, zip, lat/lng, phone, website
3. **Classification** — `fd_type`, `fd_entity`, population, ISO rating
4. **Services** — checkbox arrays for fire/EMS/investigation services
5. **Dispatch & PSAP** — `dispatch_center_id`, CAD software, RMS (pre-filled "CADReport"), PSAP fields
6. **Staffing Totals** — all `staff_*` fields, `staff_total` auto-computes
7. **Stations** — list of station cards, Add Station button
   - Each station card: fields + collapsible units table
   - Each unit row: `station_unit_id_1`, `station_unit_id_2`, capability, staffing, dedicated, linked apparatus dropdown
   - Add Unit button per station
8. **Entity Status & Submit** — last submitted date, status badge, Validate + Submit buttons

**Key UI rules:**
- `fd_neris_id` displayed as a prominent badge — yellow "Not set" if empty
- `rms_software` pre-filled "CADReport", read-only
- Annual renewal reminder: banner if `neris_entity_submitted_at` > 11 months ago
- Disabled Submit button until validation passes
- All fields auto-save on blur (except station/unit add/delete which use explicit buttons)

---

### ⬜ Phase 7 — AdminPage.jsx Update
**File:** `frontend/src/pages/AdminPage.jsx`

- Change import: `NerisSetupTab` → `NerisEntityTab`
- Change tab label: `🔗 NERIS Setup` → `🏛️ NERIS Entity`
- Change tab key: `neris_setup` → `neris_entity`
- Update render block accordingly

---

### ⬜ Phase 8 — Remove NerisSetupTab.jsx
Once `NerisEntityTab.jsx` is confirmed working:
```
git rm frontend/src/pages/NerisSetupTab.jsx
```

---

## Files Modified Summary
| File | Change |
|------|--------|
| `backend/migrations/041_neris_entity_tables.py` | New |
| `backend/migrations/042_neris_entity_seed_glenmoor.py` | New |
| `backend/migrations/043_neris_settings_cleanup.py` | New |
| `backend/routers/neris_entity.py` | New |
| `backend/main.py` | Register new router |
| `backend/routers/neris_submit.py` | Read `fd_neris_id` from `neris_entity` |
| `frontend/src/pages/NerisEntityTab.jsx` | New |
| `frontend/src/pages/AdminPage.jsx` | Tab rename + import swap |
| `frontend/src/pages/NerisSetupTab.jsx` | Delete |

---

## Status
- [ ] Phase 0 — Pre-flight / pg_dump
- [ ] Phase 1 — Migration 041 (create tables)
- [ ] Phase 2 — Migration 042 (seed data)
- [ ] Phase 3 — Migration 043 (drop old keys)
- [ ] Phase 4 — Backend entity endpoints
- [ ] Phase 5 — neris_submit.py update
- [ ] Phase 6 — NerisEntityTab.jsx
- [ ] Phase 7 — AdminPage.jsx update
- [ ] Phase 8 — Delete NerisSetupTab.jsx
