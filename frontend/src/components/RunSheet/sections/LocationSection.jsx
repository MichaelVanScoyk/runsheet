import { useState, useEffect, lazy, Suspense } from 'react';
import { useRunSheet } from '../RunSheetContext';

// Lazy load LocationMap so leaflet import failure doesn't crash the page
const LocationMap = lazy(() => import('../../shared/LocationMap'));

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
  const [incidentCoords, setIncidentCoords] = useState({ lat: null, lng: null });
  const [geocodeResult, setGeocodeResult] = useState(null);

  // Load location config (feature flag) once
  useEffect(() => {
    fetch('/api/location/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => setLocationConfig(data))
      .catch(() => {});
  }, []);

  // Sync coords from incident prop
  useEffect(() => {
    if (incident?.latitude && incident?.longitude) {
      setIncidentCoords({ lat: incident.latitude, lng: incident.longitude });
    }
  }, [incident?.latitude, incident?.longitude]);

  const handleGeocode = async () => {
    if (!incident?.id) return;
    setGeocoding(true);
    setGeocodeResult(null);
    try {
      const res = await fetch(`/api/location/geocode/${incident.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setIncidentCoords({ lat: data.latitude, lng: data.longitude });
        setGeocodeResult({ success: true, address: data.matched_address, distance: data.distance_km });
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
      {incidentCoords.lat && incidentCoords.lng ? (
        <>
          <Suspense fallback={<div style={{ flex: 1, minHeight: '300px', background: '#f5f5f5', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '0.85rem' }}>Loading map...</div>}>
            <LocationMap
              latitude={incidentCoords.lat}
              longitude={incidentCoords.lng}
              markerLabel={formData.address || ''}
              height="100%"
              zoom={15}
              interactive={true}
              style={{ flex: 1, minHeight: '300px' }}
            />
          </Suspense>
          {geocodeResult && (
            <div style={{ fontSize: '0.75rem', color: geocodeResult.success ? '#22c55e' : '#ef4444', marginTop: '0.25rem' }}>
              {geocodeResult.success 
                ? `✓ ${geocodeResult.address} (${geocodeResult.distance}km from station)`
                : '✗ Could not geocode address'
              }
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
          alignItems: 'center',
          justifyContent: 'center',
        }}>
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
            {geocoding ? 'Geocoding...' : '📍 Geocode Address'}
          </button>
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
