/**
 * ResponseMode.jsx — Full-screen tactical incident response map
 *
 * Activated when user clicks an open incident from OpenIncidentPanel or map marker.
 * Strips down to essential layers (water, hazards, closures).
 * Shows route from station/GPS → scene, top 3 hydrants, preplans, scene history.
 * Supports live GPS tracking via navigator.geolocation.watchPosition().
 *
 * Props:
 *   incident      - { id, latitude, longitude, ... } from open-incidents
 *   stationCoords - { lat, lng } from map config
 *   onExit        - callback to return to normal map mode
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// GPS tracking hook
function useGpsTracking(enabled) {
  const [position, setPosition] = useState(null);
  const [heading, setHeading] = useState(null);
  const [error, setError] = useState(null);
  const watchRef = useRef(null);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      setError(enabled ? 'Geolocation not supported' : null);
      return;
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
          setHeading(pos.coords.heading);
        }
        setError(null);
      },
      (err) => {
        console.warn('GPS error:', err.message);
        setError(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
    };
  }, [enabled]);

  return { position, heading, error };
}

// Decode Google encoded polyline
function decodePolyline(encoded) {
  if (!encoded) return [];
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, b;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export default function ResponseMode({ incident, stationCoords, onExit }) {
  const [responseData, setResponseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState('info'); // info, water, preplans, history
  const { position: gpsPosition, heading, error: gpsError } = useGpsTracking(gpsEnabled);

  // Route recalculation debounce
  const lastRouteCalcRef = useRef(0);
  const ROUTE_RECALC_INTERVAL = 30000; // 30 seconds minimum between recalcs

  // Fetch response data
  const fetchResponseData = useCallback(async (originLat, originLng) => {
    if (!incident?.id) return;
    try {
      let url = `/api/map/incident-response/${incident.id}`;
      if (originLat && originLng) {
        url += `?origin_lat=${originLat}&origin_lng=${originLng}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setResponseData(data);
      }
    } catch (e) {
      console.error('Failed to fetch response data:', e);
    } finally {
      setLoading(false);
    }
  }, [incident?.id]);

  // Initial load
  useEffect(() => {
    fetchResponseData();
  }, [fetchResponseData]);

  // Route recalculation when GPS moves significantly
  useEffect(() => {
    if (!gpsEnabled || !gpsPosition || !responseData) return;
    const now = Date.now();
    if (now - lastRouteCalcRef.current < ROUTE_RECALC_INTERVAL) return;
    lastRouteCalcRef.current = now;
    fetchResponseData(gpsPosition.lat, gpsPosition.lng);
  }, [gpsEnabled, gpsPosition, responseData, fetchResponseData]);

  const inc = responseData?.incident || incident;
  const route = responseData?.route;
  const waterSources = responseData?.water_sources || [];
  const preplans = responseData?.preplans || [];
  const hazards = responseData?.hazards || [];
  const closures = responseData?.closures || [];
  const sceneHistory = responseData?.scene_history || [];
  const addressNotes = responseData?.address_notes || [];

  const routePoints = route?.polyline ? decodePolyline(route.polyline) : [];

  const formatDistance = (meters) => {
    if (!meters) return '';
    const ft = meters * 3.28084;
    if (ft < 1000) return `${Math.round(ft)} ft`;
    return `${(ft / 5280).toFixed(1)} mi`;
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const tabStyle = (tab) => ({
    padding: '6px 12px',
    fontSize: '0.75rem',
    fontWeight: activeTab === tab ? '600' : '400',
    color: activeTab === tab ? '#DC2626' : '#666',
    borderBottom: activeTab === tab ? '2px solid #DC2626' : '2px solid transparent',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: activeTab === tab ? '#DC2626' : 'transparent',
  });

  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        background: inc?.call_category === 'FIRE' ? '#DC2626' : '#2563EB',
        color: '#fff',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <span style={{ fontWeight: '700', fontSize: '1rem' }}>
            {inc?.incident_number}
          </span>
          <span style={{ marginLeft: '12px', fontSize: '0.85rem', opacity: 0.9 }}>
            {inc?.event_type || inc?.call_category}
            {inc?.event_subtype && ` \u2014 ${inc.event_subtype}`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => setGpsEnabled(prev => !prev)}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.5)',
              background: gpsEnabled ? 'rgba(255,255,255,0.3)' : 'transparent',
              color: '#fff',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            {gpsEnabled ? 'GPS ON' : 'GPS OFF'}
          </button>
          <button
            onClick={onExit}
            style={{
              padding: '4px 12px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            EXIT
          </button>
        </div>
      </div>

      {/* Address bar */}
      <div style={{
        background: '#fff',
        padding: '6px 16px',
        borderBottom: '1px solid #e0e0e0',
        fontSize: '0.85rem',
        color: '#333',
        fontWeight: '500',
        flexShrink: 0,
      }}>
        {inc?.address}
        {inc?.location_name && (
          <span style={{ color: '#888', marginLeft: '8px', fontWeight: '400' }}>
            ({inc.location_name})
          </span>
        )}
        {route?.distance_meters && (
          <span style={{ float: 'right', color: '#666', fontWeight: '400' }}>
            {formatDistance(route.distance_meters)}
            {route.duration_seconds && ` \u00B7 ${Math.ceil(route.duration_seconds / 60)} min`}
          </span>
        )}
      </div>

      {/* Main content: map placeholder + overlay card */}
      <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
        {/* Map area — GoogleMap will be rendered here by parent */}
        <div style={{
          flex: 1,
          background: '#e8e8e8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontSize: '0.9rem',
        }}>
          {loading ? 'Loading response data...' : 'Map renders here (GoogleMap component)'}
        </div>

        {/* Overlay card */}
        <div style={{
          width: '320px',
          background: '#fff',
          borderLeft: '1px solid #e0e0e0',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          {/* Tabs */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #eee',
            flexShrink: 0,
          }}>
            <button onClick={() => setActiveTab('info')} style={tabStyle('info')}>Info</button>
            <button onClick={() => setActiveTab('water')} style={tabStyle('water')}>
              Water ({waterSources.length})
            </button>
            <button onClick={() => setActiveTab('preplans')} style={tabStyle('preplans')}>
              Preplans ({preplans.length})
            </button>
            <button onClick={() => setActiveTab('history')} style={tabStyle('history')}>
              History ({sceneHistory.length})
            </button>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {/* INFO TAB */}
            {activeTab === 'info' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Units */}
                {(inc?.dispatched_units?.length > 0 || inc?.cad_units?.length > 0) && (
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#999', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Dispatched Units
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#333' }}>
                      {(inc.dispatched_units || inc.cad_units || []).map(u =>
                        u.unit_id || u.cad_unit_id || 'Unknown'
                      ).join(', ')}
                    </div>
                  </div>
                )}

                {/* Hazards */}
                {hazards.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#DC2626', textTransform: 'uppercase', fontWeight: '600', marginBottom: '4px' }}>
                      Hazards
                    </div>
                    {hazards.map((h, i) => (
                      <div key={i} style={{
                        padding: '6px 8px',
                        background: '#FEF2F2',
                        borderRadius: '4px',
                        marginBottom: '4px',
                        fontSize: '0.8rem',
                      }}>
                        <span style={{ marginRight: '6px' }}>{h.icon || '\u26A0\uFE0F'}</span>
                        {h.title}
                        {h.distance_meters && (
                          <span style={{ color: '#888', marginLeft: '6px' }}>
                            {formatDistance(h.distance_meters)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Closures */}
                {closures.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#B91C1C', textTransform: 'uppercase', fontWeight: '600', marginBottom: '4px' }}>
                      Road Closures
                    </div>
                    {closures.map((c, i) => (
                      <div key={i} style={{
                        padding: '6px 8px',
                        background: '#FEF2F2',
                        borderRadius: '4px',
                        marginBottom: '4px',
                        fontSize: '0.8rem',
                      }}>
                        {c.icon || '\uD83D\uDEAB'} {c.title}
                        {c.distance_meters && (
                          <span style={{ color: '#888', marginLeft: '6px' }}>
                            {formatDistance(c.distance_meters)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Address notes */}
                {addressNotes.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#B45309', textTransform: 'uppercase', fontWeight: '600', marginBottom: '4px' }}>
                      Address Notes
                    </div>
                    {addressNotes.map((n, i) => (
                      <div key={i} style={{
                        padding: '6px 8px',
                        background: '#FFFBEB',
                        borderRadius: '4px',
                        marginBottom: '4px',
                        fontSize: '0.8rem',
                      }}>
                        <span style={{ fontWeight: '500' }}>{n.note_type || 'Note'}:</span>{' '}
                        {n.content}
                      </div>
                    ))}
                  </div>
                )}

                {/* GPS status */}
                {gpsEnabled && (
                  <div style={{
                    padding: '6px 8px',
                    background: gpsError ? '#FEF2F2' : '#F0FDF4',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    color: gpsError ? '#DC2626' : '#16A34A',
                  }}>
                    {gpsError ? `GPS: ${gpsError}` : 'GPS tracking active'}
                  </div>
                )}
              </div>
            )}

            {/* WATER TAB */}
            {activeTab === 'water' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {waterSources.length === 0 && (
                  <div style={{ color: '#888', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    No water sources found nearby
                  </div>
                )}
                {waterSources.map((w, i) => (
                  <div key={i} style={{
                    padding: '8px 10px',
                    background: i < 3 ? '#EFF6FF' : '#f9fafb',
                    borderRadius: '6px',
                    borderLeft: i < 3 ? '3px solid #2563EB' : '3px solid #e0e0e0',
                  }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: i < 3 ? '600' : '400', color: '#111' }}>
                      {i < 3 && <span style={{ color: '#2563EB', marginRight: '4px' }}>#{i + 1}</span>}
                      {w.icon || '\uD83D\uDCA7'} {w.title}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '2px' }}>
                      {formatDistance(w.distance_meters)}
                      {w.layer_type && ` \u00B7 ${w.layer_type.replace('_', ' ')}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* PREPLANS TAB */}
            {activeTab === 'preplans' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {preplans.length === 0 && (
                  <div style={{ color: '#888', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    No preplans found for this location
                  </div>
                )}
                {preplans.map((p, i) => (
                  <div key={i} style={{
                    padding: '8px 10px',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    borderLeft: '3px solid #8B5CF6',
                  }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '500', color: '#111' }}>
                      {p.title}
                    </div>
                    {p.description && (
                      <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '2px' }}>
                        {p.description}
                      </div>
                    )}
                    {p.distance_meters && (
                      <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '2px' }}>
                        {formatDistance(p.distance_meters)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* HISTORY TAB */}
            {activeTab === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {sceneHistory.length === 0 && (
                  <div style={{ color: '#888', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    No previous incidents at this location
                  </div>
                )}
                {sceneHistory.map((h, i) => (
                  <div key={i} style={{
                    padding: '8px 10px',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    borderLeft: `3px solid ${h.call_category === 'FIRE' ? '#DC2626' : '#2563EB'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '500', color: '#111' }}>
                        {h.incident_number}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#888' }}>
                        {formatDate(h.incident_date)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '2px' }}>
                      {h.event_type}
                      {h.event_subtype && ` \u2014 ${h.event_subtype}`}
                    </div>
                    {h.narrative && (
                      <div style={{
                        fontSize: '0.7rem', color: '#777', marginTop: '4px',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {h.narrative}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
