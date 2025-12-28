# Timestamp Handling Convention

**Last Updated:** December 2025

## Overview

RunSheet stores all timestamps in **UTC** and displays them in the **station's configured timezone** (default: `America/New_York`). All times use **24-hour clock format**.

```
CAD (local time) → Convert to UTC → Store in PostgreSQL → Retrieve as UTC → Convert to local → Display
```

## Why UTC?

1. **Daylight Saving Time** - Avoids ambiguity during "fall back" when 1:30 AM occurs twice
2. **Multi-tenant future** - Departments in different timezones can share infrastructure
3. **Industry convention** - Standard practice for database storage
4. **NERIS compatibility** - Federal reporting expects consistent timestamp handling

## Database Storage

All `TIMESTAMP WITH TIME ZONE` columns store UTC:
- `time_dispatched`
- `time_first_enroute`
- `time_first_on_scene`
- `time_last_cleared`
- `time_fire_under_control`
- All other `time_*` columns
- `created_at`, `updated_at`

The `cad_units` JSONB column also stores unit times in UTC ISO format:
```json
{
  "unit_id": "ENG481",
  "time_dispatched": "2025-12-27T03:26:04Z",
  "time_enroute": "2025-12-27T03:28:15Z",
  "time_arrived": "2025-12-27T03:35:42Z",
  "time_cleared": "2025-12-27T04:15:00Z"
}
```

## Station Timezone Setting

Configured in database `settings` table:
- Category: `general`
- Key: `timezone`
- Value: `"America/New_York"` (or other IANA timezone)

Retrieved via `settings_helper.get_timezone()` in Python or loaded into `timeUtils.js` on frontend startup.

---

## Backend: Converting CAD Times to UTC

### Entry Points

All CAD data enters through `cad/cad_listener.py`:

| Report Type | Handler | What's Converted |
|-------------|---------|------------------|
| Dispatch | `_handle_dispatch()` | `time_dispatched` (incident + per-unit) |
| Clear | `_handle_clear()` | All unit times (dispatched, enroute, arrived, cleared) |

### Conversion Functions

#### `_parse_cad_datetime(dt_str)`
Converts full CAD datetime string to UTC.

```python
# Input:  "12-27-25 22:26:04" (local Eastern time)
# Output: "2025-12-28T03:26:04Z" (UTC)
```

#### `_parse_cad_time(time_str, incident_date, dispatch_time_str)`
Converts time-only string to UTC, handling midnight crossing.

```python
# Input:  "22:26:04", "2025-12-27", "22:00:00"
# Output: "2025-12-28T03:26:04Z" (UTC)

# Midnight crossing example:
# Input:  "00:15:00", "2025-12-27", "23:45:00"  
# Output: "2025-12-28T05:15:00Z" (next day, UTC)
```

### Midnight Crossing Logic

CAD clear reports only contain times (HH:MM:SS), not dates. If a unit's time is earlier than dispatch time, it crossed midnight:

```python
if time_part < dispatch_time:
    result_date = base_date + timedelta(days=1)
```

Example: Dispatched 23:45, cleared 00:15 → cleared is next calendar day.

---

## Backend: Reparse / Restore from CAD

`backend/routers/backup.py` contains `full_reparse_incident()` which rebuilds timestamps from stored raw CAD HTML.

Uses `build_datetime_with_midnight_crossing()` - same logic as cad_listener but in backup context.

**Important:** Reparse uses the CURRENT apparatus configuration, so if you change `counts_for_response_times` settings, reparsing will recalculate `time_first_enroute` and `time_first_on_scene` correctly.

---

## Frontend: Converting UTC to Local Display

### Core Utility: `frontend/src/utils/timeUtils.js`

#### `formatDateTimeLocal(isoString)`
Converts UTC to station timezone for display.

```javascript
// Input:  "2025-12-28T03:26:04Z"
// Output: "2025-12-27 22:26:04" (Eastern, 24-hour)
```

#### `formatTimeLocal(isoString, includeSeconds)`
Converts UTC to station timezone, time only.

```javascript
// Input:  "2025-12-28T03:26:04Z"
// Output: "22:26:04" (Eastern, 24-hour)
```

#### `parseLocalToUtc(displayString)`
Converts user-entered local time back to UTC for storage.

```javascript
// Input:  "2025-12-27 22:26:04" (user types in Eastern)
// Output: "2025-12-28T03:26:04.000Z" (UTC for API)
```

### Components Using timeUtils

| Component | Function Used | Purpose |
|-----------|---------------|---------|
| `TimeFields.jsx` | `formatDateTimeLocal`, `parseLocalToUtc` | Edit incident times |
| `CADUnitsTable.jsx` | `formatTimeLocal` | Display unit response times |
| `IncidentsPage.jsx` | `formatDateTimeLocal` | Incident list dispatch time |
| `PrintView/index.jsx` | `formatDateTimeLocal`, `formatTimeLocal` | Print output |
| `AuditTrail.jsx` | Direct `toLocaleString()` | Audit log timestamps |

---

## Debugging Timestamp Issues

### Symptom: Times display wrong (off by 5 hours)

**Check:** Is the timestamp being converted on both ends?

1. **Database value** - Should end with `+00` or `Z` (UTC)
   ```sql
   SELECT time_dispatched FROM incidents WHERE id = 123;
   -- Should show: 2025-12-28 03:26:04+00
   ```

2. **API response** - Should be ISO format with timezone
   ```json
   "time_dispatched": "2025-12-28T03:26:04+00:00"
   ```

3. **Frontend display** - Should use `formatDateTimeLocal()` or `formatTimeLocal()`

### Symptom: cad_units times look different from incident times

**Check:** Are unit times in proper ISO format?

```sql
SELECT cad_units FROM incidents WHERE id = 123;
```

Good (UTC ISO):
```json
{"time_dispatched": "2025-12-28T03:26:04Z"}
```

Bad (raw CAD string):
```json
{"time_dispatched": "22:26:04"}
```

If bad: The dispatch report path wasn't converting. Fixed in December 2025.

### Symptom: Sorting doesn't work correctly

**Check:** Sorting compares raw UTC strings, which works because ISO format is lexicographically sortable:
```
"2025-12-27T03:00:00Z" < "2025-12-27T04:00:00Z"  ✓
```

If times are in different formats, sorting will fail.

---

## Testing Timestamp Handling

### Simulate with cad_simulator.py

```bash
cd /opt/runsheet/cad
python cad_simulator.py --port 19118 --file test_incidents.txt
```

### Verify in database

```sql
-- Check incident-level times (should be UTC)
SELECT 
    internal_incident_number,
    time_dispatched,
    time_first_enroute,
    time_first_on_scene
FROM incidents 
WHERE id = (SELECT MAX(id) FROM incidents);

-- Check unit times in cad_units JSON (should be UTC ISO)
SELECT 
    internal_incident_number,
    jsonb_pretty(cad_units)
FROM incidents 
WHERE id = (SELECT MAX(id) FROM incidents);
```

### Verify in frontend

Open browser dev tools → Network tab → find the incident API call → check that times have `+00:00` or `Z` suffix.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `cad/cad_listener.py` | Converts CAD local → UTC on ingest |
| `cad/cad_parser.py` | Parses raw CAD HTML (no conversion) |
| `backend/routers/backup.py` | Reparse logic with UTC conversion |
| `backend/settings_helper.py` | `get_timezone()` function |
| `frontend/src/utils/timeUtils.js` | All frontend UTC ↔ local conversion |
| `frontend/src/components/RunSheet/sections/TimeFields.jsx` | Time input fields |
| `frontend/src/components/RunSheet/sections/CADUnitsTable.jsx` | Unit times display |

---

## Change History

| Date | Change |
|------|--------|
| Dec 2025 | Initial UTC implementation - cad_listener clear report path |
| Dec 2025 | Added timeUtils.js for frontend conversion |
| Dec 2025 | Fixed cad_listener dispatch report path (unit times were stored as raw strings) |
