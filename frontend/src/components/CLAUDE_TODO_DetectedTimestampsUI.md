# CLAUDE_IMPLEMENTATION_NOTES: RunSheet Detected Timestamps UI

## Context
This document contains implementation instructions for adding a "Detected Tactical Timestamps" UI section to the RunSheet form. This feature allows officers to review CAD-extracted timestamps and confirm/map them to NERIS fields.

## Database Schema (Already Implemented)

The `incidents.cad_event_comments` JSONB field contains:

```json
{
  "comments": [...],
  "detected_timestamps": [
    {
      "time": "22:43:20",
      "time_iso": "2025-12-27T22:43:20Z",
      "raw_text": "12/27/25 22:43:20 Command Established for set Fire Incident Command Times.",
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
  "unit_crew_counts": [...],
  "parsed_at": "...",
  "parser_version": "1.0"
}
```

## UI Implementation Requirements

### Location in RunSheetForm
Add a new collapsible section in the RunSheetForm, ideally:
- After the "Response Times" section
- Before the "Actions Taken" section
- Title: "Detected Tactical Timestamps (CAD)"

### Section Behavior
1. **Only show if** `incident.cad_event_comments?.detected_timestamps?.length > 0`
2. **Default state**: Collapsed if all timestamps have been mapped or accepted
3. **Highlighted state**: Expanded with visual indicator if unmapped timestamps exist

### Timestamp Card Design

Each detected timestamp should display as a card/row:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚡ 22:43:20  "Command Established for set Fire Incident Command..." │
│                                                                     │
│ Confidence: [HIGH]   Suggested: Command Established                 │
│                                                                     │
│ [✓ Accept]   [Map to Different Field ▼]   [Ignore]                 │
│                                                                     │
│ Status: Not yet mapped                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Confidence Indicators
- **HIGH** (green): Auto-accepted by CAD listener, shown for reference
- **MEDIUM** (yellow/amber): Likely match, officer review recommended  
- **LOW** (gray): Possible match, needs officer decision

### Action Buttons

1. **Accept** (for MEDIUM/LOW confidence)
   - Takes the `suggested_neris_field` or `suggested_operational_field`
   - Updates the corresponding incident timestamp column
   - Sets `mapped_to`, `mapped_at`, `mapped_by` in cad_event_comments
   
2. **Map to Different Field**
   - Dropdown showing ALL available timestamp fields grouped by category:
     - NERIS Fire Ops: time_command_established, time_sizeup_completed, time_primary_search_begin, etc.
     - NERIS EMS: time_patient_contact, time_cpr_started, etc.
     - Operational: time_par_started, time_evac_ordered, time_water_supply_established, etc.
     - HazMat: time_hazmat_identified, etc.
     - Rescue: time_victim_located, etc.
   - On selection, updates that timestamp column AND the mapping record
   
3. **Ignore**
   - Sets `mapped_to: "IGNORED"` in the cad_event_comments record
   - Hides from "needs attention" list but preserves record

### Available Timestamp Fields (Complete List)

Group these in the dropdown for user-friendly selection:

**NERIS Fire Operations**
- `time_command_established` - Command Established
- `time_sizeup_completed` - Size-up Completed
- `time_primary_search_begin` - Primary Search Begin
- `time_primary_search_complete` - Primary Search Complete
- `time_secondary_search_begin` - Secondary Search Begin
- `time_secondary_search_complete` - Secondary Search Complete
- `time_water_on_fire` - Water on Fire
- `time_fire_knocked_down` - Fire Knocked Down
- `time_fire_under_control` - Fire Under Control
- `time_suppression_complete` - Suppression Complete
- `time_ventilation_start` - Ventilation Start
- `time_ventilation_complete` - Ventilation Complete
- `time_overhaul_start` - Overhaul Start
- `time_overhaul_complete` - Overhaul Complete
- `time_extrication_start` - Extrication Start
- `time_extrication_complete` - Extrication Complete
- `time_rit_activated` - RIT Activated
- `time_mayday_declared` - MAYDAY Declared
- `time_mayday_cleared` - MAYDAY Cleared

**NERIS EMS**
- `time_patient_contact` - Patient Contact
- `time_patient_assessment_complete` - Patient Assessment Complete
- `time_cpr_started` - CPR Started
- `time_aed_applied` - AED Applied
- `time_aed_shock_delivered` - AED Shock Delivered
- `time_rosc_achieved` - ROSC Achieved
- `time_airway_secured` - Airway Secured
- `time_iv_access` - IV Access Established

**Chester County Operations**
- `time_par_started` - PAR Started
- `time_par_complete` - PAR Complete
- `time_evac_ordered` - Evacuation Ordered
- `time_water_supply_established` - Water Supply Established
- `time_all_clear` - All Clear
- `time_loss_stop` - Loss Stop
- `time_utilities_secured` - Utilities Secured
- `time_rehab_established` - REHAB Established
- `time_investigation_requested` - Investigation Requested

**NERIS HazMat**
- `time_hazmat_identified` - HazMat Identified
- `time_hazmat_contained` - HazMat Contained
- `time_decon_started` - Decon Started
- `time_decon_complete` - Decon Complete

**NERIS Rescue**
- `time_victim_located` - Victim Located
- `time_victim_accessed` - Victim Accessed
- `time_victim_freed` - Victim Freed

**NERIS Wildland**
- `time_wildland_contained` - Wildland Fire Contained
- `time_wildland_controlled` - Wildland Fire Controlled
- `time_wildland_mopup_complete` - Mop-up Complete

### API Endpoint Needed

Create a new endpoint to handle timestamp mapping:

```
PUT /api/incidents/{id}/map-detected-timestamp
{
  "detected_index": 0,  // Index in detected_timestamps array
  "map_to_field": "time_command_established",  // Or "IGNORED"
}
```

This endpoint should:
1. Validate the field name exists
2. Update the incident's timestamp column with the time_iso value
3. Update the detected_timestamps entry with mapped_to, mapped_at, mapped_by
4. Return the updated incident

### State Management

Use the existing RunSheetContext pattern. When mapping:
1. Call API endpoint
2. On success, update local incident state
3. The timestamp card should show "Mapped to: [field name]" status

### Visual States

**Unmapped timestamps** (needs attention):
- Yellow/amber border
- "⚠️" or similar icon
- Show in "Needs Attention" count if implementing that

**Already mapped** (including HIGH confidence auto-accepts):
- Green checkmark
- "✓ Mapped to [field]" status
- Can still be changed via "Map to Different Field"

**Ignored**:
- Gray/muted styling
- "Ignored" status
- Can be un-ignored

### Crew Counts Section (Optional/Future)

The `unit_crew_counts` array contains:
```json
[{"unit_id": "ENG38", "crew_count": 4, "time": "22:27:34"}]
```

This could be shown as read-only reference information:
- "CAD reported crew counts: ENG38 (4), RES48 (3)"
- Displayed in the Unit Response section as informational

### Files to Modify

1. **RunSheetForm.jsx** - Add the DetectedTimestamps section component
2. **RunSheetContext.jsx** - Add mapDetectedTimestamp action  
3. **New: DetectedTimestampsPanel.jsx** - The actual UI component
4. **Backend: routers/incidents.py** - Add the mapping endpoint
5. **RunSheetForm.css** - Styling for the new section

### Testing Scenarios

1. Incident with HIGH confidence detections only (should show green, already accepted)
2. Incident with MEDIUM/LOW confidence (should highlight for review)
3. Map to suggested field
4. Map to different field
5. Ignore a detection
6. Un-ignore and map
7. Incident with no detections (section should not appear)

### Notes for Implementation

- HIGH confidence timestamps are AUTO-POPULATED to NERIS columns by cad_listener.py
- The UI shows HIGH confidence items as "already mapped" for transparency
- Officers can override/change any mapping
- All mapping changes go through the completed_by audit trail
- Preserve the original detected_timestamps array - only update mapped_to/at/by fields
