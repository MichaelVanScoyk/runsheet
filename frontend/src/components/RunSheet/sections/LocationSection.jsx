import { useState, useEffect, lazy, Suspense } from 'react';
import { useRunSheet } from '../RunSheetContext';

// Lazy load IncidentMap (Google Maps route display)
const IncidentMap = lazy(() => import('../../shared/IncidentMap'));

export default function LocationSection() {
  const { 
    incident, 
    formData, 
    handleChange, 
    municipalities,
  } = useRunSheet();

  // Location services state
  const [locationConfig, setLocationConfig] = useState(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeResult, setGeocodeResult] = useState(null);

  // Load location config (feature flag) once
  useEffect(() => {
    fetch('/api/location/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => setLocationConfig(data))
      .catch(() => {});
  }, []);

  // Coords come from the incident (populated by background task on ingest)
  // Falls back to manualCoords if user clicked Retry Geocode
  const incidentCoords = manualCoords
    ? manualCoords
    : (incident?.latitude && incident?.longitude)
      ? { lat: incident.latitude, lng: incident.longitude }
      : { lat: null, lng: null };

  const hasCoords = !!(incidentCoords.lat && incidentCoords.lng);
  const needsReview = incident?.geocode_needs_review === true;

  // Manual geocode — retry button for failed background geocodes
  const [manualCoords, setManualCoords] = useState(null);
  const [manualPolyline, setManualPolyline] = useState(null);

  const handleGeocode = async () => {
    if (!incident?.id) return;
    setGeocoding(true);
    setGeocodeResult(null);
    try {
      const res = await fetch(`/api/location/geocode/${incident.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setManualCoords({ lat: data.latitude, lng: data.longitude });
        setGeocodeResult({ success: true, address: data.matched_address, distance: data.distance_km });
        // Fetch updated route polyline (cached by geocode endpoint)
        try {
          const incRes = await fetch(`/api/incidents/${incident.id}`);
          const incData = await incRes.json();
          if (incData.route_polyline) setManualPolyline(incData.route_polyline);
        } catch {}
      } else {
        setGeocodeResult({ success: false });
      }
    } catch {
      setGeocodeResult({ success: false });
    } finally {
      setGeocoding(false);
    }
  };

  const locationEnabled = locationConfig?.enabled;

  const fieldsColumn = (
    <div className="flex flex-col gap-2">
      {/* CAD Subtype */}
      <div className="flex flex-col gap-0.5" data-help-id="cad_event_subtype">
        <label className="text-gray-400 text-xs">CAD Subtype</label>
        <input 
          type="text" 
          value={formData.cad_event_subtype} 
          onChange={(e) => handleChange('cad_event_subtype', e.target.value)} 
        />
      </div>

      {/* Location Name (business/place name from CAD) */}
      {formData.location_name && (
        <div className="flex flex-col gap-0.5" data-help-id="location_name">
          <label className="text-gray-400 text-xs">Location Name</label>
          <input 
            type="text" 
            value={formData.location_name} 
            onChange={(e) => handleChange('location_name', e.target.value)} 
          />
        </div>
      )}

      {/* Address */}
      <div className="flex flex-col gap-0.5" data-help-id="address">
        <label className="text-gray-400 text-xs">Address</label>
        <input 
          type="text" 
          value={formData.address} 
          onChange={(e) => handleChange('address', e.target.value)} 
        />
      </div>

      {/* Municipality + ESZ */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5" data-help-id="municipality">
          <label className="text-gray-400 text-xs">Municipality</label>
          <select 
            value={formData.municipality_code} 
            onChange={(e) => handleChange('municipality_code', e.target.value)}
          >
            <option value="">--</option>
            {municipalities.map(m => (
              <option key={m.code} value={m.code}>
                {m.display_name || m.name}{m.subdivision_type ? ` ${m.subdivision_type}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-0.5" data-help-id="esz_box">
          <label className="text-gray-400 text-xs">ESZ</label>
          <input 
            type="text" 
            value={formData.esz_box} 
            onChange={(e) => handleChange('esz_box', e.target.value)} 
          />
        </div>
      </div>

      {/* Cross Streets */}
      <div className="flex flex-col gap-0.5" data-help-id="cross_streets">
        <label className="text-gray-400 text-xs">Cross Streets</label>
        <input 
          type="text" 
          value={formData.cross_streets} 
          onChange={(e) => handleChange('cross_streets', e.target.value)} 
        />
      </div>

      {/* Caller */}
      <div className="flex flex-col gap-0.5" data-help-id="caller_name">
        <label className="text-gray-400 text-xs">Caller</label>
        <input 
          type="text" 
          value={formData.caller_name} 
          onChange={(e) => handleChange('caller_name', e.target.value)} 
        />
      </div>

      {/* Phone + Weather */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <label className="text-gray-400 text-xs">Phone</label>
          <input 
            type="text" 
            value={formData.caller_phone} 
            onChange={(e) => handleChange('caller_phone', e.target.value)} 
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-gray-400 text-xs">Weather</label>
          <input 
            type="text" 
            value={formData.weather_conditions} 
            onChange={(e) => handleChange('weather_conditions', e.target.value)} 
          />
        </div>
      </div>
    </div>
  );

  const mapColumn = locationEnabled ? (
    <div className="flex flex-col h-full">
      {hasCoords ? (
        <>
          <Suspense fallback={<div style={{ flex: 1, minHeight: '300px', background: '#f5f5f5', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '0.85rem' }}>Loading map...</div>}>
            <IncidentMap
              incidentCoords={incidentCoords}
              stationCoords={locationConfig ? { lat: locationConfig.station_latitude, lng: locationConfig.station_longitude } : null}
              routePolyline={manualPolyline || incident?.route_polyline}
              height="300px"
            />
          </Suspense>
          {geocodeResult?.success && (
            <div style={{ fontSize: '0.75rem', color: '#22c55e', marginTop: '0.25rem' }}>
              ✓ {geocodeResult.address} ({geocodeResult.distance}km from station)
            </div>
          )}
        </>
      ) : incident?.id && formData.address ? (
        <div style={{
          flex: 1,
          minHeight: '300px',
          background: '#f5f5f5',
          border: '1px dashed #ccc',
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
        }}>
          {needsReview ? (
            <>
              <span style={{ fontSize: '0.8rem', color: '#b45309' }}>
                ⚠ Address could not be geocoded automatically
              </span>
              <button
                onClick={handleGeocode}
                disabled={geocoding}
                style={{
                  padding: '0.35rem 0.75rem',
                  background: geocoding ? '#999' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  cursor: geocoding ? 'wait' : 'pointer',
                }}
              >
                {geocoding ? 'Geocoding...' : '📍 Retry Geocode'}
              </button>
            </>
          ) : (
            <span style={{ fontSize: '0.8rem', color: '#888' }}>
              📍 Geocoding in progress...
            </span>
          )}
          {geocodeResult && !geocodeResult.success && (
            <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>
              ✗ Could not geocode address
            </span>
          )}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="mb-4">
      {/* Desktop: 2-col (fields left, map right). Mobile: stacked */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {fieldsColumn}
        {mapColumn}
      </div>
    </div>
  );
}
