# Event Comments & NERIS Tactical Timestamps Implementation

## Overview

This implementation adds:
1. **CAD Event Comments Parsing** - Extract, categorize, and store all event comments from CAD Clear Reports
2. **Tactical Timestamp Detection** - Detect timestamps in comments and suggest NERIS field mappings
3. **Complete NERIS Timestamp Schema** - All possible NERIS tactic timestamp fields as database columns
4. **PDF Report Support** - Event comments can be displayed on incident reports

## Architecture

```
┌─────────────────────┐
│   CAD CLEAR HTML    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    cad_parser.py                                │
│  - Extracts event_comments: [{time, operator, text}]            │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    comment_processor.py                         │
│  - Categorizes comments (CALLER, TACTICAL, OPERATIONS, UNIT)    │
│  - Filters noise (system messages)                              │
│  - Detects tactical timestamps with confidence levels           │
│  - Suggests NERIS field mappings                                │
│  - Extracts crew counts                                         │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    cad_listener.py                              │
│  - On CLEAR: processes comments via comment_processor           │
│  - AUTO-POPULATES HIGH confidence timestamps to NERIS columns   │
│  - Stores full processed data in cad_event_comments JSONB       │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    incidents table                              │
│  cad_event_comments JSONB = {                                   │
│    comments: [...],                                             │
│    detected_timestamps: [...with suggestions...],               │
│    unit_crew_counts: [...],                                     │
│    parsed_at, parser_version                                    │
│  }                                                              │
│                                                                 │
│  + 38 new timestamp columns ready for manual or UI mapping      │
└─────────────────────────────────────────────────────────────────┘
```

## What Gets Auto-Populated

Only **HIGH confidence** detections are auto-populated to NERIS columns:

| CAD Pattern | NERIS Column | Auto? |
|-------------|--------------|-------|
| `Command Established for set Fire Incident Command Times` | `time_command_established` | ✅ YES |
| `** Fire Under Control at MM/DD/YY HH:MM:SS` | `time_fire_under_control` | ✅ YES |
| `Evac Ordered for set Fire Incident Command Times` | `time_evac_ordered` | ✅ YES |
| `Accountability/Start PAR - timer started` | `time_par_started` | ✅ YES |
| `MAYDAY` | `time_mayday_declared` | ✅ YES |
| `FUC` (abbreviation) | `time_fire_under_control` | ❌ Suggested |
| `Water Supply Established` | `time_water_supply_established` | ❌ Suggested |
| `Primary All Clear / PAC` | `time_primary_search_complete` | ❌ Suggested |
| `Overhaul` | `time_overhaul_start` | ❌ Suggested |

## What Gets Stored

The `cad_event_comments` JSONB field stores everything:

```json
{
  "comments": [
    {
      "time": "22:25:42",
      "time_iso": "2025-12-27T22:25:42Z",
      "operator": "ct08",
      "operator_type": "CALLTAKER",
      "text": "HOUSE ON FIRE",
      "is_noise": false,
      "category": "CALLER"
    }
  ],
  "detected_timestamps": [
    {
      "time": "22:43:20",
      "time_iso": "2025-12-27T22:43:20Z",
      "raw_text": "Command Established for set Fire Incident Command Times",
      "detected_type": "COMMAND_ESTABLISHED",
      "suggested_neris_field": "time_command_established",
      "suggested_operational_field": null,
      "confidence": "HIGH",
      "pattern_matched": "...",
      "mapped_to": null,
      "mapped_at": null,
      "mapped_by": null
    }
  ],
  "unit_crew_counts": [
    {"unit_id": "ENG38", "crew_count": 4, "time": "22:27:34"}
  ],
  "parsed_at": "2025-12-28T00:32:00Z",
  "parser_version": "1.0"
}
```

## New Database Columns (38 total)

### NERIS Fire Operations
- `time_secondary_search_begin`
- `time_secondary_search_complete`
- `time_ventilation_start`
- `time_ventilation_complete`
- `time_overhaul_start`
- `time_overhaul_complete`
- `time_extrication_start`
- `time_rit_activated`
- `time_mayday_declared`
- `time_mayday_cleared`

### NERIS EMS
- `time_patient_contact`
- `time_patient_assessment_complete`
- `time_cpr_started`
- `time_aed_applied`
- `time_aed_shock_delivered`
- `time_rosc_achieved`
- `time_airway_secured`
- `time_iv_access`

### Chester County Operational
- `time_par_started`
- `time_par_complete`
- `time_evac_ordered`
- `time_water_supply_established`
- `time_all_clear`
- `time_loss_stop`
- `time_utilities_secured`
- `time_rehab_established`
- `time_investigation_requested`

### NERIS HazMat
- `time_hazmat_identified`
- `time_hazmat_contained`
- `time_decon_started`
- `time_decon_complete`

### NERIS Rescue
- `time_victim_located`
- `time_victim_accessed`
- `time_victim_freed`

### NERIS Wildland
- `time_wildland_contained`
- `time_wildland_controlled`
- `time_wildland_mopup_complete`

### Storage
- `cad_event_comments` (JSONB)

## Files Modified/Created

### New Files
- `backend/migrations/011_event_comments_and_tactic_timestamps.sql`
- `backend/migrations/011_MODELS_UPDATE_REQUIRED.md`
- `cad/comment_processor.py`

### Files to Update
- `backend/models.py` - Add 38 new columns (see 011_MODELS_UPDATE_REQUIRED.md)

### Already Updated
- `cad/cad_listener.py` - Already calls `process_clear_report_comments()`

## Future UI Work (RunSheet Form)

The RunSheet form should display:

1. **Detected Timestamps Panel**
   - Show all `detected_timestamps` from `cad_event_comments`
   - Display confidence level (HIGH/MEDIUM/LOW)
   - Show suggested NERIS field mapping
   - Allow officer to:
     - Accept suggestion → Populates NERIS column
     - Map to different field → Updates `mapped_to`
     - Ignore → Mark as ignored

2. **Event Comments View**
   - Display comments grouped by category
   - Option to show/hide noise
   - Printable for Page 2 of incident report

## Deployment Steps

```bash
# SSH to server
ssh dashboard@192.168.1.189

# Run migration
cd /opt/runsheet
sudo -u postgres psql runsheet_db < backend/migrations/011_event_comments_and_tactic_timestamps.sql

# Pull code changes (after editing models.py locally)
git pull

# Restart
./restart.sh

# Verify
sudo journalctl -u runsheet -n 50 --no-pager
```

## Testing

After deployment, the next CAD CLEAR report received will:
1. Parse event comments
2. Detect tactical timestamps
3. Auto-populate HIGH confidence matches
4. Store full processed data in `cad_event_comments`

Query to check:
```sql
SELECT 
    internal_incident_number,
    time_command_established,
    time_fire_under_control,
    cad_event_comments->'detected_timestamps' as detected
FROM incidents 
WHERE cad_event_comments IS NOT NULL
ORDER BY id DESC 
LIMIT 5;
```
