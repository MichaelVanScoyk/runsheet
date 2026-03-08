/**
 * ResponseOverlay.jsx — Tactical overlay panels for incident response mode
 *
 * Renders over the map: top bar (incident header) + side panel (tabbed info).
 * Does NOT render its own map — the parent's GoogleMap renders underneath.
 * Uses pointer-events: none on container so map stays interactive,
 * pointer-events: auto on the actual panel elements.
 *
 * Props:
 *   incident      - { id, latitude, longitude, ... } from open-incidents
 *   onExit        - callback to return to normal map mode
 *   onDataLoaded  - callback with response data for parent to use
 *   gpsEnabled    - boolean
 *   onToggleGps   - callback
 *   gpsPosition   - { lat, lng } or null
 *   gpsError      - string or null
 */

import { useState, useEffect, useCallback } from 'react';

export default function ResponseOverlay({
  incident,
  onExit,
  onDataLoaded,
  gpsEnabled,
  onToggleGps,
  gpsPosition,
  gpsError,
}) {
  const [responseData, setResponseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');

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
        if (onDataLoaded) onDataLoaded(data);
      }
    } catch (e) {
      console.error('Failed to fetch response data:', e);
    } finally {
      setLoading(false);
    }
  }, [incident?.id, onDataLoaded]);

  useEffect(() => { fetchResponseData(); }, [fetchResponseData]);

  // Throttled GPS route recalculation
  useEffect(() => {
    if (!gpsEnabled || !gpsPosition || !responseData) return;
    const timer = setTimeout(() => {
      fetchResponseData(gpsPosition.lat, gpsPosition.lng);
    }, 30000);
    return () => clearTimeout(timer);
  }, [gpsEnabled, gpsPosition?.lat, gpsPosition?.lng]); // eslint-disable-line

  const inc = responseData?.incident || incident;
  const route = responseData?.route;
  const waterAll = responseData?.water_sources_all || responseData?.water_sources || [];
  const preplans = responseData?.preplans || [];
  const hazards = responseData?.hazards || [];
  const closures = responseData?.closures || [];
  const sceneHistory = responseData?.scene_history || [];
  const addressNotes = responseData?.address_notes || [];

  const fmtDist = (m) => {
    if (!m) return '';
    const ft = m * 3.28084;
    return ft < 1000 ? `${Math.round(ft)} ft` : `${(ft / 5280).toFixed(1)} mi`;
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const tabBtn = (id, label) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: '6px 10px', fontSize: '0.72rem', cursor: 'pointer',
        fontWeight: activeTab === id ? '600' : '400',
        color: activeTab === id ? '#DC2626' : '#666',
        background: 'none', border: 'none',
        borderBottom: `2px solid ${activeTab === id ? '#DC2626' : 'transparent'}`,
      }}
    >{label}</button>
  );

  const headerColor = inc?.call_category === 'FIRE' ? '#DC2626' : '#2563EB';

  // Check if there's any data worth showing in the side panel
  const hasData = !loading && (
    waterAll.length > 0 || preplans.length > 0 || sceneHistory.length > 0 ||
    hazards.length > 0 || closures.length > 0 || addressNotes.length > 0 ||
    (inc?.dispatched_units?.length > 0) || (inc?.cad_units?.length > 0)
  );
  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <>
      {/* ===== TOP BAR — sits above map, full width ===== */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25,
        pointerEvents: 'auto',
      }}>
        {/* Incident header */}
        <div style={{
          background: headerColor, color: '#fff', padding: '6px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>{inc?.incident_number}</span>
            <span style={{ marginLeft: '10px', fontSize: '0.82rem', opacity: 0.9 }}>
              {inc?.event_type || inc?.call_category}
              {inc?.event_subtype ? ` \u2014 ${inc.event_subtype}` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={onToggleGps} style={{
              padding: '3px 8px', borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.5)',
              background: gpsEnabled ? 'rgba(255,255,255,0.3)' : 'transparent',
              color: '#fff', fontSize: '0.72rem', cursor: 'pointer',
            }}>{gpsEnabled ? 'GPS ON' : 'GPS OFF'}</button>
            <button onClick={onExit} style={{
              padding: '3px 10px', borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.2)',
              color: '#fff', fontSize: '0.78rem', cursor: 'pointer', fontWeight: '600',
            }}>EXIT</button>
          </div>
        </div>

        {/* Address + distance */}
        <div style={{
          background: 'rgba(255,255,255,0.95)', padding: '4px 16px',
          fontSize: '0.82rem', color: '#333', fontWeight: '500',
          borderBottom: '1px solid #ddd', backdropFilter: 'blur(4px)',
        }}>
          {inc?.address}
          {inc?.location_name && <span style={{ color: '#888', marginLeft: '8px', fontWeight: '400' }}>({inc.location_name})</span>}
          {route?.distance_meters && (
            <span style={{ float: 'right', color: '#666', fontWeight: '400' }}>
              {fmtDist(route.distance_meters)}
              {route.duration_seconds ? ` \u00B7 ${Math.ceil(route.duration_seconds / 60)} min` : ''}
            </span>
          )}
        </div>
      </div>

      {/* ===== SIDE PANEL toggle button ===== */}
      {!loading && (
        <button
          onClick={() => setPanelOpen(prev => !prev)}
          style={{
            position: 'absolute', top: '68px', right: panelOpen && hasData ? '280px' : '0px',
            zIndex: 26, pointerEvents: 'auto',
            background: '#fff', border: '1px solid #ddd', borderRight: 'none',
            borderRadius: '4px 0 0 4px', padding: '6px 4px', cursor: 'pointer',
            fontSize: '0.75rem', color: '#666', boxShadow: '-2px 0 4px rgba(0,0,0,0.1)',
            transition: 'right 0.2s',
          }}
        >
          {panelOpen && hasData ? '\u25B6' : '\u25C0'}
        </button>
      )}

      {/* ===== SIDE PANEL — right edge, below top bar ===== */}
      <div style={{
        position: 'absolute', top: '62px', right: 0, bottom: 0,
        width: panelOpen && hasData ? '280px' : '0px',
        zIndex: 25, pointerEvents: 'auto',
        background: '#fff', borderLeft: panelOpen && hasData ? '1px solid #e0e0e0' : 'none',
        display: 'flex', flexDirection: 'column',
        boxShadow: panelOpen && hasData ? '-2px 0 8px rgba(0,0,0,0.1)' : 'none',
        overflow: 'hidden', transition: 'width 0.2s',
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #eee', flexShrink: 0 }}>
          {tabBtn('info', 'Info')}
          {tabBtn('water', `Water (${waterAll.length})`)}
          {tabBtn('preplans', `Plans (${preplans.length})`)}
          {tabBtn('history', `Hx (${sceneHistory.length})`)}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {loading && <div style={{ color: '#888', fontSize: '0.8rem', textAlign: 'center', padding: '20px' }}>Loading...</div>}

          {/* INFO */}
          {!loading && activeTab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(inc?.dispatched_units?.length > 0 || inc?.cad_units?.length > 0) && (
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#999', textTransform: 'uppercase', marginBottom: '3px' }}>Units</div>
                  <div style={{ fontSize: '0.8rem', color: '#333' }}>
                    {(inc.dispatched_units || inc.cad_units || []).map(u => u.unit_id || u.cad_unit_id || '?').join(', ')}
                  </div>
                </div>
              )}
              {hazards.map((h, i) => (
                <div key={`hz${i}`} style={{ padding: '5px 7px', background: '#FEF2F2', borderRadius: '4px', fontSize: '0.78rem' }}>
                  {h.icon || '\u26A0\uFE0F'} {h.title}
                  {h.distance_meters && <span style={{ color: '#888', marginLeft: '6px' }}>{fmtDist(h.distance_meters)}</span>}
                </div>
              ))}
              {closures.map((c, i) => (
                <div key={`cl${i}`} style={{ padding: '5px 7px', background: '#FEF2F2', borderRadius: '4px', fontSize: '0.78rem' }}>
                  {c.icon || '\uD83D\uDEAB'} {c.title}
                  {c.distance_meters && <span style={{ color: '#888', marginLeft: '6px' }}>{fmtDist(c.distance_meters)}</span>}
                </div>
              ))}
              {addressNotes.map((n, i) => (
                <div key={`an${i}`} style={{ padding: '5px 7px', background: '#FFFBEB', borderRadius: '4px', fontSize: '0.78rem' }}>
                  <span style={{ fontWeight: '500' }}>{n.note_type || 'Note'}:</span> {n.content}
                </div>
              ))}
              {gpsEnabled && (
                <div style={{ padding: '5px 7px', background: gpsError ? '#FEF2F2' : '#F0FDF4', borderRadius: '4px', fontSize: '0.73rem', color: gpsError ? '#DC2626' : '#16A34A' }}>
                  {gpsError ? `GPS: ${gpsError}` : 'GPS tracking active'}
                </div>
              )}
              {!hazards.length && !closures.length && !addressNotes.length && !(inc?.dispatched_units?.length || inc?.cad_units?.length) && (
                <div style={{ color: '#888', fontSize: '0.8rem', fontStyle: 'italic' }}>No alerts for this location</div>
              )}
            </div>
          )}

          {/* WATER */}
          {!loading && activeTab === 'water' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {waterAll.length === 0 && <div style={{ color: '#888', fontSize: '0.8rem', fontStyle: 'italic' }}>No water sources nearby</div>}
              {waterAll.map((w, i) => (
                <div key={i} style={{
                  padding: '7px 9px', background: i < 3 ? '#EFF6FF' : '#f9fafb',
                  borderRadius: '5px', borderLeft: `3px solid ${i < 3 ? '#2563EB' : '#e0e0e0'}`,
                }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: i < 3 ? '600' : '400', color: '#111' }}>
                    {i < 3 && <span style={{ color: '#2563EB', marginRight: '4px' }}>#{i + 1}</span>}
                    {w.icon || '\uD83D\uDCA7'} {w.title}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#666', marginTop: '2px' }}>
                    {fmtDist(w.distance_meters)}{w.layer_type && ` \u00B7 ${w.layer_type.replace('_', ' ')}`}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PREPLANS */}
          {!loading && activeTab === 'preplans' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {preplans.length === 0 && <div style={{ color: '#888', fontSize: '0.8rem', fontStyle: 'italic' }}>No preplans found</div>}
              {preplans.map((p, i) => (
                <div key={i} style={{ padding: '7px 9px', background: '#f9fafb', borderRadius: '5px', borderLeft: '3px solid #8B5CF6' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: '500', color: '#111' }}>{p.title}</div>
                  {p.description && <div style={{ fontSize: '0.73rem', color: '#555', marginTop: '2px' }}>{p.description}</div>}
                </div>
              ))}
            </div>
          )}

          {/* HISTORY */}
          {!loading && activeTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {sceneHistory.length === 0 && <div style={{ color: '#888', fontSize: '0.8rem', fontStyle: 'italic' }}>No previous incidents here</div>}
              {sceneHistory.map((h, i) => (
                <div key={i} style={{
                  padding: '7px 9px', background: '#f9fafb', borderRadius: '5px',
                  borderLeft: `3px solid ${h.call_category === 'FIRE' ? '#DC2626' : '#2563EB'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: '500' }}>{h.incident_number}</span>
                    <span style={{ fontSize: '0.68rem', color: '#888' }}>{fmtDate(h.incident_date)}</span>
                  </div>
                  <div style={{ fontSize: '0.73rem', color: '#555', marginTop: '2px' }}>
                    {h.event_type}{h.event_subtype ? ` \u2014 ${h.event_subtype}` : ''}
                  </div>
                  {h.narrative && (
                    <div style={{
                      fontSize: '0.68rem', color: '#777', marginTop: '3px',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>{h.narrative}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
