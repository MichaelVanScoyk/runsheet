# Incident Hub Modal - Technical Specification

## Overview

The Incident Hub Modal provides a kiosk-style interface for entering personnel assignments and basic incident data during and immediately after incidents. Like paper run sheets, it requires no authentication - allowing any member to quickly record who responded.

The modal matches the visual style of the Monthly Activity Report template, using the department's branding (logo, colors, station name) for a professional, consistent appearance.

## Routing Logic

```javascript
function incidentQualifiesForModal(incident) {
  // OPEN incidents always qualify
  if (incident.status === 'OPEN') return true;
  
  // CLOSED incidents qualify if cleared within last hour
  if (incident.status === 'CLOSED') {
    const clearTime = incident.cad_clear_received_at;
    if (!clearTime) return false;
    
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return new Date(clearTime).getTime() > oneHourAgo;
  }
  
  return false;
}
```

## Key Timestamp

`cad_clear_received_at` - Set when the CAD listener processes the clear report via POST /api/incidents/{id}/close. This is the timestamp used for the 1-hour window calculation.

## Acknowledgment System

The modal uses sessionStorage to track which incidents have been "acknowledged" by the user, preventing the same incident from auto-popping repeatedly.

```javascript
const ACK_STORAGE_KEY = 'hubModalAcknowledged';

// Storage format: { incidentId: lastAcknowledgedUpdatedAt }

function needsAutoShow(incident) {
  const acked = getAcknowledged();
  const lastAck = acked[incident.id];
  
  // Never acknowledged = needs to show
  if (!lastAck) return true;
  
  // Show if updated since last ack
  const updatedAt = incident.updated_at || incident.created_at;
  return new Date(updatedAt).getTime() > new Date(lastAck).getTime();
}
```

**Acknowledgment triggers:**
- Closing the modal (Close button or nav click)
- Closing an individual tab (X button)
- Navigating to Full Edit

**Auto-show behavior:**
- Only unacknowledged incidents auto-open the modal
- Manual row clicks show only that specific incident
- The "Active" button shows all currently active incidents

## Modal Phases

### ACTIVE Phase (status === 'OPEN')

Focused interface for members responding but not riding apparatus:
- Incident display (status, CAD#, type, subtype, address, cross streets, ESZ/Box)
- **Station** section - Members who came to station but didn't ride
- **Direct** section - Members who went directly to scene (POV)
- Save button

### CLOSED Phase (status === 'CLOSED', within 1 hour)

All of ACTIVE phase plus:
- **Unit Assignments** - Personnel per dispatched apparatus
- **Narrative** section:
  - Situation Found textarea
  - Services Provided textarea
  - Narrative textarea
- Print button (direct to PDF)
- Full Edit button (navigates to RunSheetForm with auth)

## Visual Design (Report-Style)

The modal follows the Monthly Report template styling:

### Color Scheme
- **Modal background:** White (`#fff`)
- **Content area background:** Light gray (`#e8e8e8`)
- **Section cards:** White with `1px solid #ddd` border
- **Section headers:** Branding primary color (default `#1a5f2a`)
- **Body text:** Dark neutrals (`#333`, `#555`)

### Header
- Department logo (50x50px)
- Station name in uppercase
- Station number subtitle in primary color
- Incident count badge (when multiple)
- Green accent line under header

### Layout Structure
```
Modal (white, max-width: 800px)
├── Header (logo, station name, badge)
├── Accent line (3px, primary color)
├── Tabs (if multiple incidents)
└── Content (#e8e8e8 background, scrollable)
    ├── Incident Display (white card)
    ├── Station/Direct (white cards, side-by-side)
    └── Quick Entry (white cards, closed only)
        ├── Unit Assignments
        └── Narrative fields
└── Footer (Save, Print, Full Edit, Close)
```

### Personnel Chips
Assigned personnel display as compact chips that wrap:
```
[Smith, John ×] [Doe, Jane ×] [Brown, Bob ×]
[+ Add...]
```
- Chips: white/gray background, 12px font
- Remove button: Red × 
- Add input: Dashed border, typeahead dropdown

### Dropdowns
Personnel dropdowns use `position: fixed` with `getBoundingClientRect()` to extend outside modal boundaries when needed.

## Component Structure

```
frontend/src/components/IncidentHubModal/
├── index.jsx                 # Main modal, branding, state management
├── IncidentTabs.jsx          # Browser-style tabs (subtype, address, X)
├── IncidentDisplay.jsx       # Compact incident info display
├── StationDirectSection.jsx  # Station + Direct chips layout
├── QuickEntrySection.jsx     # Unit assignments + narrative (CLOSED)
└── hooks/
    └── useActiveIncidents.js # incidentQualifiesForModal() helper
```

## Multi-Incident Handling

### Auto-popup (unacknowledged incidents)
- All unacknowledged qualifying incidents appear as tabs
- Newest incident auto-selected

### Manual row click
- Only the clicked incident appears (single tab)
- Acknowledged incidents can still be manually opened

### Tab behavior
- Tab shows: Event subtype (fallback to type), address
- Green dot for OPEN, gray dot for CLOSED
- X button removes tab and acknowledges that incident
- If last tab closed, modal closes

### "Active" button
- Shows when any OPEN incidents exist
- Opens all currently OPEN incidents as tabs

## Personnel Assignment

Three assignment types with same depletion logic (person appears in one bucket only):

| Type | unit_category | Purpose |
|------|---------------|---------|
| Station | STATION | Came to station, didn't ride |
| Direct | DIRECT | Went directly to scene (POV) |
| Apparatus | APPARATUS | Rode on dispatched units |

### Assignment Storage
- Station/Direct: Variable-length arrays of personnel IDs
- Apparatus: Fixed 6-slot arrays (null-padded)

## Polling & State

### IncidentsPage state
```javascript
const [qualifyingIncidents, setQualifyingIncidents] = useState([]); // All qualifying
const [modalIncidents, setModalIncidents] = useState([]);           // Shown in modal
const [selectedModalIncidentId, setSelectedModalIncidentId] = useState(null);
```

### Polling interval
- 5 seconds (matches incidents list refresh)
- Checks for new unacknowledged incidents
- Updates qualifying list in background

## Button Actions

| Button | Condition | Action |
|--------|-----------|--------|
| Save | Always | PUT assignments + fields, show success, stay open |
| Print | CLOSED only | `window.open('/api/reports/pdf/incident/{id}', '_blank')` |
| Full Edit | CLOSED only | Acknowledge, close modal, open RunSheetForm |
| Close | Always | Acknowledge all shown incidents, close modal |

## Branding Integration

Loaded on modal mount via Promise.allSettled:
```javascript
const [branding, setBranding] = useState({
  logo: null,           // data:image/...;base64,...
  stationName: '',      // "Glen Moore Fire Company"
  stationNumber: '',    // "48"
  primaryColor: '#1a5f2a',
  secondaryColor: '#1a365d',
});
```

**Endpoints:**
- `/api/settings/branding/logo`
- `/api/settings` (station name/number)
- `/api/settings/branding/primary_color`
- `/api/settings/branding/secondary_color`

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/incidents | GET | List incidents for polling |
| /api/incidents/{id} | GET | Full incident details |
| /api/incidents/{id}/assignments | PUT | Save personnel assignments |
| /api/incidents/{id} | PUT | Update narrative fields |
| /api/reports/pdf/incident/{id} | GET | Generate PDF |
| /api/apparatus | GET | Unit list with categories |
| /api/personnel | GET | Active personnel roster |
| /api/settings/* | GET | Branding configuration |

## Integration Points

### IncidentsPage.jsx
- Manages modal state and acknowledgment tracking
- Routes row clicks: qualifying → modal, else → RunSheetForm
- Provides `onTabClose` callback to handle individual tab dismissal
- Row highlighting: green tint for OPEN, yellow tint for recently CLOSED
- "🚨 X Active" button when OPEN incidents exist

### Backend (incidents.py)
- GET /api/incidents/{id} returns `cad_clear_received_at`
- POST /api/incidents/{id}/close sets `cad_clear_received_at`

## Session Behavior

- Acknowledgments stored in sessionStorage (cleared on browser close)
- Modal state resets on page refresh
- Each browser tab maintains independent acknowledgment state

## Future Considerations

- **WebSocket:** Replace polling with real-time updates for instant dispatch notification
- **Klaxon integration:** May share same WebSocket infrastructure
- **Mobile optimization:** Touch-friendly chip selection
- **Offline support:** Queue assignments when disconnected
