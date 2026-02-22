/**
 * IncidentMap.jsx — Reusable incident route map
 *
 * Thin wrapper around GoogleMap for the RunSheet LocationSection.
 * Shows station → incident driving route, auto-fitted to bounds.
 *
 * Reusable in:
 *   - RunSheetForm LocationSection
 *   - IncidentHubModal (future)
 *   - Mobile app incident view (future)
 *   - Standalone /incident/:id/map page (future)
 *
 * Props:
 *   incidentCoords  - { lat, lng }
 *   stationCoords   - { lat, lng }
 *   routePolyline   - encoded Google polyline string (from incidents.route_polyline)
 *   height          - CSS height (default '100%')
 *   onClickFullMap  - callback when user wants full interactive map (future)
 */

import { useMemo } from 'react';
import GoogleMap from './GoogleMap';

export default function IncidentMap({
  incidentCoords,
  stationCoords,
  routePolyline,
  height = '100%',
  onClickFullMap,
}) {
  // Incident location marker (red pin)
  const markers = useMemo(() => {
    console.log('IncidentMap markers useMemo:', { lat: incidentCoords?.lat, lng: incidentCoords?.lng });
    if (!incidentCoords?.lat || !incidentCoords?.lng) return [];
    return [{
      lat: incidentCoords.lat,
      lng: incidentCoords.lng,
      title: 'Incident Location',
    }];
  }, [incidentCoords?.lat, incidentCoords?.lng]);
  
  console.log('IncidentMap render:', { incidentCoords, markers, routePolyline: !!routePolyline });

  return (
    <div style={{ height, width: '100%', position: 'relative', zIndex: 0 }}>
      <GoogleMap
        center={incidentCoords}
        zoom={14}
        markers={markers}
        routePolyline={routePolyline}
        showStation={!!(stationCoords?.lat && stationCoords?.lng)}
        stationCoords={stationCoords}
        height="100%"
        interactive={true}
      />
    </div>
  );
}
