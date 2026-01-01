# Incident Hub Modal - Technical Specification

## Overview

The Incident Hub Modal provides a kiosk-style interface for entering personnel assignments and basic incident data during and immediately after incidents. Like paper run sheets, it requires no authentication - allowing any member to quickly record who responded.

## Routing Logic

```javascript
if (incident.status === 'OPEN') {
  // Always show modal - incident is active
  showModal(incident);
} else if (incident.status === 'CLOSED') {
  const clearTime = new Date(incident.cad_clear_received_at).getTime();
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  
  if (clearTime > oneHourAgo) {
    // Within 1 hour of clear - show modal (kiosk mode)
    showModal(incident);
  } else {
    // More than 1 hour - require full RunSheetForm with auth
    navigateToRunSheetForm(incident);
  }
}
```

## Key Timestamp

`cad_clear_received_at` - Set when the CAD listener processes the clear report via POST /api/incidents/{id}/close. This is the timestamp used for the 1-hour window calculation.

## Modal Phases

### ACTIVE Phase (status === 'OPEN')

Available immediately when incident is dispatched:
- Incident display (type, address, units, status)
- Station Responders input
- Direct Responders input
- Save button

### CLOSED Phase (status === 'CLOSED', within 1 hour)

All of ACTIVE phase plus:
- Unit assignments (personnel per dispatched apparatus)
- Situation Found textarea
- Services Provided textarea
- Narrative textarea
- Print button (direct to PDF)
- Full Edit button (navigates to RunSheetForm)

## Component Structure

```
frontend/src/components/IncidentHubModal/
├── index.jsx                 # Main modal component
├── IncidentHubModal.css      # Styles
├── IncidentTabs.jsx          # Browser-style tabs for multiple incidents
├── IncidentDisplay.jsx       # Large incident info display
├── StationDirectSection.jsx  # Station + Direct responder inputs
├── QuickEntrySection.jsx     # Unit assignments + narrative (CLOSED only)
└── hooks/
    └── useActiveIncidents.js # Polling hook + incidentQualifiesForModal()
```

## Multi-Incident Handling

When multiple incidents qualify for the modal:
- Browser-style tabs appear at top
- Each tab shows: Event subtype, Address, Status indicator
- Click tab to switch incidents
- Click X on tab to close that tab (not the incident)
- Newest incident auto-focuses

## Personnel Assignment

Reuses existing components:
- `DynamicPersonnelList` from RunSheet/shared
- `PersonnelTypeahead` for search

Three assignment types:
- **Station** (unit_category='STATION'): Responded to station, didn't ride on truck
- **Direct** (unit_category='DIRECT'): Went directly to scene (POV)
- **Apparatus** (unit_category='APPARATUS'): Rode on dispatched units

Same depletion logic - person can only appear in one bucket.

## Polling

- Interval: 5 seconds (matches IncidentsPage)
- Auto-opens modal when new OPEN incident detected
- Updates qualifying list in background

## Button Actions

| Button | Action |
|--------|--------|
| 🖨️ Print | `window.open('/api/reports/pdf/incident/{id}', '_blank')` |
| 💾 Save | Save assignments + fields, refresh modal, **stay open** |
| 📋 Full Edit | Navigate to RunSheetForm |
| Close | Exit modal |

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/incidents | GET | List incidents for polling |
| /api/incidents/{id} | GET | Full incident details |
| /api/incidents/{id}/assignments | PUT | Save personnel assignments |
| /api/incidents/{id} | PUT | Update narrative fields |
| /api/reports/pdf/incident/{id} | GET | Generate PDF |
| /api/apparatus | GET | Unit list with categories |
| /api/personnel | GET | Personnel roster |

## Integration Points

### IncidentsPage.jsx

- Imports `IncidentHubModal` and `incidentQualifiesForModal`
- Polls for qualifying incidents
- Routes row clicks: qualifying → modal, else → RunSheetForm
- Shows "🚨 X Active" button when incidents qualify
- Row highlighting: green tint for OPEN, yellow tint for recently CLOSED

### Backend (incidents.py)

- GET /api/incidents/{id} returns `cad_clear_received_at`
- POST /api/incidents/{id}/close sets `cad_clear_received_at` if not already set

## Future Considerations

- WebSocket for real-time updates (noted in memory)
- Klaxon integration may use same real-time system
- Branding system integration for logo/colors
