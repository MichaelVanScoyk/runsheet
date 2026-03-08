# Incident Response Map

## Overview

The Incident Response Map is a tactical map mode built into the MapPage that activates when an open incident is selected. It transforms the standard operational map into a focused, crew-facing display optimized for the iPad mounted on the apparatus. The officer sees the route, water sources, hazards, closures, preplans, scene history, and address notes — all in one view with no clicking required.

---

## Architecture

### Component Tree (Response Mode)

```
MapPage.jsx
├── GoogleMap (shared — receives different props in response mode)
├── OpenIncidentPanel.jsx (normal mode only — lists open incidents)
├── ResponseOverlay.jsx (response mode only — top bar + floating info card)
├── FeatureDetail.jsx (shows on feature click in both modes)
├── FeatureEditor.jsx (hidden in response mode)
├── LayerToggle sidebar (hidden in response mode)
└── HighwayRouteEditor.jsx (hidden in response mode)
```

### Key Design Decisions

- **ResponseOverlay is an overlay, not a replacement.** GoogleMap continues rendering underneath with altered props. ResponseOverlay renders absolute-positioned panels on top (top bar + floating card). The map stays interactive.
- **No monolith.** OpenIncidentPanel, ResponseOverlay, and the GPS tracking logic are separate concerns. MapPage acts as the mode switcher.
- **All tactical data in one API call.** `GET /api/map/incident-response/{id}` returns everything: route, water, hazards, closures, preplans, scene history, address notes. No waterfall of requests.
- **Live queries, not stale snapshots.** Hazards, closures, water sources, and address notes are queried live from PostGIS on every response mode entry — not from the cached `map_snapshot` JSONB. This ensures newly added hazards appear immediately.
- **Forced layers.** In response mode, hydrant/dry hydrant/draft point/hazard/closure/preplan layers render on the map regardless of the user's normal layer toggle settings.

---

## Files

### Frontend

| File | Purpose |
|------|---------|
| `pages/MapPage.jsx` | Mode switcher. Manages response state, GPS tracking, marker memoization, layer filtering. Passes altered props to GoogleMap when in response mode. |
| `components/Map/OpenIncidentPanel.jsx` | Polls `GET /api/map/open-incidents` every 30s. Shows red overlay listing active incidents. Click "GO" to enter response mode. Smart change detection prevents marker stacking. |
| `components/Map/ResponseOverlay.jsx` | Fetches `GET /api/map/incident-response/{id}`. Renders top bar (incident header, GPS toggle, EXIT) and floating dark glass info card with all tactical data visible — no tabs, no clicking to reveal. |
| `components/Map/ResponseMode.jsx` | UNUSED — original implementation replaced by ResponseOverlay pattern. Can be deleted. |
| `components/shared/GoogleMap.jsx` | Shared map component. Added: `gpsPosition` prop for blue dot, `BOUNCE` animation for pulsing markers (legacy mode), `cadreport-pulse` CSS keyframes (AdvancedMarker mode), GPS accuracy circle. |

### Backend

| File | Purpose |
|------|---------|
| `routers/map.py` | Added `GET /api/map/open-incidents` and `GET /api/map/incident-response/{id}` endpoints. Live hazard/closure queries, route corridor check, water source expansion to 10km. |
| `services/location/proximity.py` | Added `query_scene_history()` — finds previous incidents at same address or within 50m radius. |
| `services/location/route.py` | Added `_decode_polyline_to_coords()` — decodes Google encoded polyline to lat/lng tuples for PostGIS route corridor queries. |

---

## Two Map Modes

### Normal Mode

- All layers visible per user's toggle settings
- Open incidents shown with **bouncing markers** (Google Maps `BOUNCE` animation)
- `OpenIncidentPanel` overlay (top-right) lists open incidents with GO button
- Layer sidebar available (starts collapsed by default)
- Feature editor available for officers/admins

### Response Mode (activated by clicking GO or an open incident marker)

- Layer sidebar hidden
- Feature editor hidden
- Viewport layers forced to: hydrants, dry hydrants, draft points, hazards, closures, preplans
- Route polyline drawn from station → incident (or GPS → incident if GPS enabled)
- Incident marker bounces at scene location
- Top bar: incident number, type, subtype, GPS toggle, EXIT button
- Address bar: address, location name, route distance + estimated time
- Floating info card: all data visible at once (see below)
- Click any map feature → popup appears (positioned left of info card)
- Click anywhere on map → dismisses popup
- Click water source in sidebar → map recenters on it + entry flashes

---

## Floating Info Card (ResponseOverlay)

Dark glass card (`rgba(20,20,20,0.85)` + `backdrop-filter: blur(14px)`) floating top-right over the map. Collapsible as a whole unit. All sections visible at once — no tabs.

### Sections (render only if data exists)

1. **Units** — dispatched unit designators from CAD
2. **Hazards** — point-radius features near incident (red accent, shows address + description)
3. **Road Closures** — closures near incident or along route corridor (red accent, ON ROUTE badge if found via route check, shows address)
4. **Address Notes** — notes matching the incident address (yellow accent)
5. **Water Sources** — closest 3 highlighted (#1, #2, #3 with blue accent), all 10 shown. Each has NAV button → opens Google Maps directions. Click entry → map recenters + entry flashes.
6. **Preplans** — preplans at or near the incident address (purple accent)
7. **Scene History** — previous incidents at same location (shows date, type, narrative snippet)
8. **GPS Status** — shows when GPS tracking is active

---

## API Endpoints

### GET /api/map/open-incidents

Lightweight poll endpoint. Returns all OPEN status incidents with coordinates.

**Response:**
```json
{
  "incidents": [
    {
      "id": 5338,
      "incident_number": "F260040",
      "call_category": "FIRE",
      "event_type": "Alarm",
      "event_subtype": "CHIMNEY",
      "address": "1020 N Manor road",
      "latitude": 40.0974,
      "longitude": -75.8131,
      "time_dispatched": "2026-03-08T14:07:00Z",
      "status": "OPEN",
      "unit_count": 3
    }
  ],
  "count": 1
}
```

### GET /api/map/incident-response/{incident_id}

One-call tactical data endpoint. Optional `?origin_lat=X&origin_lng=Y` for GPS-based routing.

**Response structure:**
```json
{
  "incident": { "id", "incident_number", "call_category", "event_type", "address", "latitude", "longitude", "route_polyline", "dispatched_units", ... },
  "route": { "polyline": "encoded_string", "distance_meters": 5200, "duration_seconds": 420 },
  "water_sources": [ top 3 with coordinates ],
  "water_sources_all": [ up to 10, expanding search radius to 10km if needed ],
  "preplans": [],
  "hazards": [ live query, includes address + description ],
  "closures": [ within 500m of incident + 200m of route corridor, ON ROUTE tagged ],
  "address_notes": [ live query by normalized address ],
  "scene_history": [ previous incidents at same address/50m radius ],
  "station": { "latitude", "longitude" }
}
```

**Proximity query sources:**
- Hazards: `query_point_radius_features()` — point_radius geometry with `ST_DWithin`
- Closures: `query_nearby_closures()` — 500m from incident
- Route corridor: PostGIS `ST_DWithin(geometry, ST_GeomFromText(route_wkt), 200)` — 200m buffer around decoded polyline
- Water: `query_nearby_water()` — expands 2km → 5km → 10km until 3 found
- Address notes: `query_address_notes()` — normalized address match
- Preplans: `query_nearby_preplans()` — address match then 200m proximity
- Scene history: `query_scene_history()` — address match then 50m proximity

---

## GPS Tracking

### How It Works

1. User taps GPS ON (persisted in localStorage per device)
2. Browser `navigator.geolocation.watchPosition()` starts with high accuracy
3. Blue dot marker appears on map with 30m accuracy circle
4. Map auto-follows GPS position (recenters on each update)
5. Route recalculates from current GPS position → incident when device moves >100m from last calculation point (minimum 15s between recalculations)
6. ResponseOverlay also throttles: skips API calls if <80m movement since last route fetch

### API Cost

- GPS position: free (browser Geolocation API)
- Route recalculation: ~$0.005 per Google Directions API call
- Typical incident response: 10-20 recalculations = $0.05-$0.10
- Total per incident with GPS: under $0.15

### iPad Safari Considerations

- GPS works in Safari while tab is active and screen is on
- Screen lock kills GPS — set iPad to never auto-lock during response
- Cellular iPad required for real GPS hardware; WiFi-only iPads use WiFi triangulation (unreliable while moving)
- No voice turn-by-turn — visual route only (intentional: radio comms take priority)

---

## iPad Safari Compatibility

| Feature | Fix Applied |
|---------|-------------|
| `backdrop-filter` | Added `-webkit-backdrop-filter` prefix |
| `100vh` viewport | Changed to `100dvh` (dynamic viewport height) |
| `inset: 0` shorthand | Replaced with `top/right/bottom/left: 0` |
| Scrollable panels | Added `WebkitOverflowScrolling: 'touch'` for momentum scroll |
| Touch targets | GPS/EXIT buttons: 36px min-height. NAV buttons: 32×44px minimum |
| Hover effects | Guarded with `matchMedia('(hover: hover)')` to prevent sticky highlights on touch |
| NAV button | `e.stopPropagation()` prevents row click-through |

---

## Marker Behavior

### Open Incidents (Normal Mode)
- Google Maps `BOUNCE` animation (legacy markers — no AdvancedMarkerElement without Map ID)
- Red circle with "!" label for FIRE, blue for EMS
- `translateY(-10px)` offset baked into CSS keyframes (AdvancedMarker path) to clear address labels

### Open Incidents (Response Mode)
- Same bouncing marker at incident location
- Viewport layers show only tactical layers (water, hazards, closures, preplans)

### Smart Polling (OpenIncidentPanel)
- Polls every 30 seconds
- Only updates React state if incident data actually changed (compares `id:status:lat:lng:address` key)
- Prevents marker stacking from repeated state updates with identical data

---

## Future Enhancements

- **Unit GPS Tracking** — apparatus positions on map via `POST /api/map/unit-position` from each device, rendered as labeled markers (ENG481, RES48, etc.)
- **AdvancedMarkerElement** — when Map ID is configured, enables CSS pulse animations instead of BOUNCE, smoother rendering
- **Viewport marker diff** — compare incoming viewport data with existing markers to avoid clear/recreate flash
- **SMS shareable link** — read-only incident map link for responders' phones
- **Route corridor preplans** — check for preplans along the route, not just at the destination
