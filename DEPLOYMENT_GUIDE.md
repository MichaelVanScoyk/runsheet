# RunSheet NERIS Update - Deployment Guide
## December 2025

### What Changed

The schema has been updated for **100% NERIS compatibility**. Key changes:

| Before | After | Why |
|--------|-------|-----|
| `neris_incident_types INTEGER[]` | `neris_incident_type_codes TEXT[]` | NERIS uses hierarchical text codes |
| `neris_property_use INTEGER` | `neris_location_use JSONB` | Full module with type, subtype, vacancy |
| `neris_actions_taken INTEGER[]` | `neris_action_codes TEXT[]` | Text codes |
| - | `neris_id TEXT` | Globally unique NERIS incident ID |
| - | Additional tactic timestamps | Fire incident requirements |

### Data Flow (New)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ CAD Data    │────▶│ Raw Storage │────▶│ Display     │
│ "FIRE/CHIMNEY"    │ cad_event_type     │ (unchanged) │
└─────────────┘     └─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────────────────────────┐     ┌─────────────┐
│ User Picks  │────▶│ NERIS Format Storage            │────▶│ NERIS API   │
│ from dropdown      │ neris_incident_type_codes =     │     │ (no change) │
│                    │ ["FIRE: STRUCTURE_FIRE: CHIMNEY"]│     │             │
└─────────────┘     └─────────────────────────────────┘     └─────────────┘
```

**Store as NERIS expects = No conversion at export**

---

## Deployment Steps

### 1. Backup Database (just in case)
```bash
pg_dump runsheet_db > runsheet_backup_$(date +%Y%m%d).sql
```

### 2. Run Migration
```bash
cd /opt/runsheet
psql -d runsheet_db -f migrations/002_neris_schema_alignment.sql
```

### 3. Replace Backend Files
```bash
# Stop backend
sudo systemctl stop runsheet

# Backup current
cp -r backend backend_backup_$(date +%Y%m%d)

# Replace files (from the uploaded package)
cp models.py backend/
cp routers/incidents.py backend/routers/
cp routers/lookups.py backend/routers/
cp routers/neris_codes.py backend/routers/
# (other routers unchanged)

# Restart
sudo systemctl start runsheet
```

### 4. Import NERIS Codes
Go to **Admin > NERIS Codes > Import** and import from the Excel files:
- `incident_type_files.xlsx` → sheet `type_incident` → category `type_incident`
- `shared_type_files.xlsx` → sheet `type_location_use` → category `type_location_use`
- `incident_type_files.xlsx` → sheet `type_action_tactic` → category `type_action_tactic`
- `entity_type_files.xlsx` → sheet `type_unit` → category `type_unit`

### 5. Set fd_neris_id (When Ready)
Go to **Settings** and add your department's NERIS ID once you register:
- Category: `neris`
- Key: `fd_neris_id`  
- Value: `FDxxxxxxxx` (from NERIS portal)

---

## Files in This Package

### Modified (replace existing)
| File | Changes |
|------|---------|
| `models.py` | New NERIS columns, TEXT instead of INTEGER |
| `routers/incidents.py` | Updated Pydantic schemas, NERIS ID generation |
| `routers/lookups.py` | New NERIS endpoints for TEXT codes |
| `routers/neris_codes.py` | Fixed validation for new column names |

### Unchanged (keep existing)
- `database.py`
- `main.py`
- `weather_service.py`
- `settings_helper.py`
- `routers/apparatus.py`
- `routers/personnel.py`
- `routers/settings.py`
- `routers/reports.py`

### New
| File | Purpose |
|------|---------|
| `migrations/002_neris_schema_alignment.sql` | Database migration |

---

## NERIS Code Format Examples

### Incident Types (neris_incident_type_codes)
```json
["FIRE: STRUCTURE_FIRE: RESIDENTIAL_SINGLE"]
["EMS: MEDICAL: CARDIAC_ARREST"]
["RESCUE: VEHICLE: EXTRICATION"]
```

### Location Use (neris_location_use JSONB)
```json
{
  "use_type": "RESIDENTIAL",
  "use_subtype": "SINGLE_FAMILY",
  "use_status": true,
  "use_intended": true,
  "use_vacancy": "OCCUPIED"
}
```

### Actions Taken (neris_action_codes)
```json
["EXTINGUISHMENT: FIRE_CONTROL", "SEARCH: PRIMARY_SEARCH", "VENTILATION: HORIZONTAL"]
```

---

## Testing After Deployment

1. **Create test incident** via CAD simulator
2. **Add NERIS classification** in run sheet form
3. **Verify storage** - check database directly:
   ```sql
   SELECT neris_id, neris_incident_type_codes, neris_location_use, neris_action_codes 
   FROM incidents ORDER BY id DESC LIMIT 1;
   ```
4. **Validate** - use Admin > NERIS Codes > Validate

---

## Frontend Changes Needed

The frontend (`RunSheetForm.jsx`) will need updates to:

1. **NERIS type selectors** - send TEXT values, not integers
2. **Location use form** - capture full module (type, subtype, status, vacancy)
3. **Actions multi-select** - send TEXT array

These frontend changes can be made incrementally. The backend now accepts both formats during transition.
