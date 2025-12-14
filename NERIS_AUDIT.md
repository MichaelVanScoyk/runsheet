# NERIS Schema Audit - RunSheet
**Date:** December 13, 2025  
**Deadline:** January 1, 2026  
**Status:** 🔴 Critical Issues Found

---

## Executive Summary

The current RunSheet schema has **fundamental misalignments** with NERIS requirements that must be fixed before any data can be submitted. The primary issues are:

1. **NERIS codes stored as integers, but NERIS expects text strings**
2. **Missing department NERIS ID (fd_neris_id)**
3. **Missing incident NERIS ID (incident_neris_id)**
4. **Location data not structured per NERIS format**

---

## Issue #1: NERIS Code Data Types 🔴 CRITICAL

### Current Schema (WRONG)
```sql
neris_incident_types    INTEGER[]      -- e.g., [100, 111]
neris_property_use      INTEGER        -- e.g., 400
neris_actions_taken     INTEGER[]      -- e.g., [10, 20]
```

### NERIS Requirement (CORRECT)
```sql
neris_incident_types    TEXT[]         -- e.g., ['FIRE: STRUCTURE_FIRE: COMMERCIAL']
neris_property_use      TEXT           -- e.g., 'ASSEMBLY: NIGHTCLUB'
neris_actions_taken     TEXT[]         -- e.g., ['EXTINGUISHMENT: FIRE_CONTROL']
```

### NERIS Type Format Examples
| NERIS Field | Example Value |
|-------------|---------------|
| incident_final_type | `"FIRE: STRUCTURE_FIRE: RESIDENTIAL_MULTI"` |
| use_type/subtype | `"RESIDENTIAL: MULTI_FAMILY"` |
| action_tactic | `"EXTINGUISHMENT: FIRE_CONTROL: FIRE_ATTACK"` |

### Migration Required
```sql
-- Step 1: Add new TEXT columns
ALTER TABLE incidents ADD COLUMN neris_incident_type_codes TEXT[];
ALTER TABLE incidents ADD COLUMN neris_location_use_code TEXT;
ALTER TABLE incidents ADD COLUMN neris_action_codes TEXT[];

-- Step 2: Migrate existing data (if any integer codes exist)
-- This requires mapping old integer codes to new text values
-- Most likely: no production data yet, so just drop old columns

-- Step 3: Drop old INTEGER columns
ALTER TABLE incidents DROP COLUMN neris_incident_types;
ALTER TABLE incidents DROP COLUMN neris_property_use;
ALTER TABLE incidents DROP COLUMN neris_actions_taken;

-- Step 4: Rename new columns
ALTER TABLE incidents RENAME COLUMN neris_incident_type_codes TO neris_incident_types;
ALTER TABLE incidents RENAME COLUMN neris_location_use_code TO neris_location_use;
ALTER TABLE incidents RENAME COLUMN neris_action_codes TO neris_actions_taken;
```

---

## Issue #2: Missing fd_neris_id 🔴 CRITICAL

Every NERIS submission requires a department identifier in format: `FDxxxxxxxx`

### Required
Add to settings table:
```sql
INSERT INTO settings (category, key, value, value_type, description)
VALUES ('neris', 'fd_neris_id', '', 'string', 'Fire Department NERIS ID (e.g., FD24027000)');
```

### How to Get fd_neris_id
1. Register department at NERIS portal
2. Receive unique FD ID
3. Enter in RunSheet settings

---

## Issue #3: Missing incident_neris_id 🔴 CRITICAL

NERIS requires a unique incident identifier in format: `{fd_neris_id}:{epoch_milliseconds}`

### Required
Add to incidents table:
```sql
ALTER TABLE incidents ADD COLUMN neris_id TEXT UNIQUE;
```

### Generation Logic
```python
def generate_neris_id(fd_neris_id: str, incident_datetime: datetime) -> str:
    """Generate NERIS-format incident ID"""
    epoch_ms = int(incident_datetime.timestamp() * 1000)
    return f"{fd_neris_id}:{epoch_ms}"
    
# Example: "FD24027000:1714762619000"
```

---

## Issue #4: Location Data Structure 🟡 MODERATE

### Current
```sql
address          VARCHAR(200)    -- "123 Main St"
municipality_code VARCHAR(10)    -- "WALLAC"
cross_streets    VARCHAR(200)    -- "Oak Ave / Elm St"
```

### NERIS Structure (mod_civic_location)
```sql
an_number        INTEGER         -- 123
sn_street_name   TEXT           -- "Main"
sn_post_type     TEXT           -- "St"
csop_incorporated_muni TEXT     -- "Wallace Township"
csop_county      TEXT           -- "Chester"
csop_state       TEXT           -- "PA"
csop_postal_code TEXT           -- "19301"
```

### Recommendation
Store raw address for display, add JSONB column for parsed NERIS location:
```sql
ALTER TABLE incidents ADD COLUMN neris_location JSONB;
```

Parse on export, not on storage. Use geocoding service or manual entry.

---

## Issue #5: Location Use Module 🟡 MODERATE

### NERIS Requirement
Location use is a **module**, not a single field:
```json
{
  "use_type": "RESIDENTIAL",
  "use_subtype": "SINGLE_FAMILY",
  "use_status": true,
  "use_intended": true,
  "use_vacancy": "OCCUPIED"
}
```

### Recommendation
Change `neris_location_use` from TEXT to JSONB:
```sql
ALTER TABLE incidents ADD COLUMN neris_location_use JSONB;
```

---

## Issue #6: Time Fields 🟢 OK (Minor Fix)

### Current Times (Good)
- `time_dispatched` ✅
- `time_first_enroute` ✅
- `time_first_on_scene` ✅
- `time_fire_under_control` ✅
- `time_extrication_complete` ✅
- `time_last_cleared` ✅

### Missing NERIS Tactic Timestamps
```sql
ALTER TABLE incidents ADD COLUMN time_command_established TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN time_sizeup_completed TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN time_suppression_complete TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN time_primary_search_begin TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN time_primary_search_complete TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN time_water_on_fire TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN time_fire_knocked_down TIMESTAMP WITH TIME ZONE;
```

**Note:** These are only required for fire incidents, can be NULL for EMS/other.

---

## Issue #7: Unit Response Structure 🟡 MODERATE

### Current (cad_units JSONB)
```json
[
  {
    "unit_id": "ENG481",
    "time_dispatched": "2025-12-13T10:00:00",
    "time_enroute": "2025-12-13T10:02:00",
    "time_arrived": "2025-12-13T10:08:00",
    "is_mutual_aid": false
  }
]
```

### NERIS mod_unit_response
```json
{
  "unit_id_reported": "ENG481",
  "unit_staffing_reported": 4,
  "time_dispatch": "2025-12-13T15:00:00Z",
  "time_enroute_to_scene": "2025-12-13T15:02:00Z",
  "time_on_scene": "2025-12-13T15:08:00Z",
  "time_unit_clear": "2025-12-13T16:30:00Z"
}
```

### Mapping
| RunSheet | NERIS |
|----------|-------|
| `unit_id` | `unit_id_reported` |
| `time_dispatched` | `time_dispatch` |
| `time_enroute` | `time_enroute_to_scene` |
| `time_arrived` | `time_on_scene` |
| `time_cleared` | `time_unit_clear` |
| (missing) | `unit_staffing_reported` |

### Recommendation
Add `crew_count` to cad_units structure or derive from personnel assignments.

---

## Issue #8: Apparatus NERIS Type 🟢 OK (Already Planned)

### Current apparatus table
```sql
apparatus_type   VARCHAR(30)     -- "Engine", "Rescue"
```

### Needed
```sql
ALTER TABLE apparatus ADD COLUMN neris_unit_type TEXT;
-- Values like: "ENGINE", "LADDER", "RESCUE", "AMBULANCE_ALS", etc.
```

Already referenced in `neris_codes.py` validation - just need the column.

---

## Priority Migration Plan

### Phase 1: Critical Schema Changes (Do First)
```sql
-- 1. Add NERIS ID columns
ALTER TABLE incidents ADD COLUMN neris_id TEXT UNIQUE;

-- 2. Fix NERIS code types (TEXT not INTEGER)
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_incident_types;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_property_use;
ALTER TABLE incidents DROP COLUMN IF EXISTS neris_actions_taken;

ALTER TABLE incidents ADD COLUMN neris_incident_type_codes TEXT[];
ALTER TABLE incidents ADD COLUMN neris_location_use_code TEXT;  -- or JSONB for full module
ALTER TABLE incidents ADD COLUMN neris_action_codes TEXT[];

-- 3. Add fd_neris_id to settings
INSERT INTO settings (category, key, value, value_type, description)
VALUES ('neris', 'fd_neris_id', '', 'string', 'Fire Department NERIS ID');

-- 4. Add apparatus NERIS type
ALTER TABLE apparatus ADD COLUMN IF NOT EXISTS neris_unit_type TEXT;
```

### Phase 2: Enhanced Fields (Can Wait)
```sql
-- Additional tactic timestamps
ALTER TABLE incidents ADD COLUMN time_command_established TIMESTAMP WITH TIME ZONE;
ALTER TABLE incidents ADD COLUMN time_water_on_fire TIMESTAMP WITH TIME ZONE;
-- etc.

-- Structured location
ALTER TABLE incidents ADD COLUMN neris_location JSONB;
```

### Phase 3: Code Updates
1. Update `models.py` - change column types
2. Update `incidents.py` router - handle TEXT arrays
3. Update `RunSheetForm.jsx` - NERIS code selectors use text values
4. Update `neris_codes.py` - validation uses text matching

---

## neris_codes Table (Already Good)

The existing `neris_codes` table structure is correct:
```sql
CREATE TABLE neris_codes (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,          -- 'type_incident', 'type_location_use', etc.
    value TEXT NOT NULL,             -- 'FIRE: STRUCTURE_FIRE: RESIDENTIAL'
    active BOOLEAN DEFAULT true,
    value_1 TEXT,                    -- 'FIRE'
    value_2 TEXT,                    -- 'STRUCTURE_FIRE'
    value_3 TEXT,                    -- 'RESIDENTIAL'
    description TEXT,
    description_1 TEXT,
    description_2 TEXT,
    description_3 TEXT,
    definition TEXT,
    display_order INTEGER,
    source TEXT,
    imported_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

This stores the hierarchical TEXT values correctly. The issue is the `incidents` table references INTEGER codes instead of these TEXT values.

---

## Validation Checklist

Before NERIS submission, each incident must have:

| Field | Required | Source |
|-------|----------|--------|
| neris_id | ✅ | Generated from fd_neris_id + timestamp |
| incident_internal_id | ✅ | internal_incident_number |
| incident_final_type | ✅ | User selection (neris_incident_type_codes) |
| incident_location | ✅ | Parsed from address or manual |
| incident_location_use | ✅ | User selection |
| incident_actions_taken | ✅ | User selection |
| unit_response | ✅ | From cad_units + personnel |
| tactic_timestamps | Conditional | Required for fire incidents |
| incident_narrative_outcome | ✅ | narrative field |

---

## Next Steps

1. **Run Phase 1 SQL migration** on runsheet_db
2. **Update models.py** with correct column types
3. **Update frontend** NERIS selectors to use text values
4. **Test with sample incident** - verify data structure
5. **Register for fd_neris_id** when ready

---

## Files to Modify

| File | Changes |
|------|---------|
| `models.py` | Column type changes |
| `incidents.py` | IncidentUpdate schema, API responses |
| `neris_codes.py` | Validation queries (already use text) |
| `RunSheetForm.jsx` | NERIS code selectors |
| `lookups.py` | May have old integer-based endpoints |
| Migration SQL | New migration file |
