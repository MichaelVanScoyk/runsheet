/**
 * ResponseOverlay.jsx — Tactical overlay panels for incident response mode
 *
 * Renders over the map: top bar (incident header) + floating info card.
 * Does NOT render its own map — the parent's GoogleMap renders underneath.
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
  const [collapsed, setCollapsed] = useState(false);

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

  const headerColor = inc?.call_category === 'FIRE' ? '#DC2626' : '#2563EB';

  // Count items per tab for badges
  const infoBadge = hazards.length + closures.length + addressNotes.length;

  const tabBtn = (id, label, count) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: '5px 8px', fontSize: '0.7rem', cursor: 'pointer',
        fontWeight: activeTab === id ? '600' : '400',
        color: activeTab === id ? '#fff' : 'rgba(255,255,255,0.7)',
        background: activeTab === id ? 'rgba(255,255,255,0.2)' : 'transparent',
        border: 'none', borderRadius: '4px',
        transition: 'all 0.15s',
      }}
    >
      {label}{count > 0 ? ` (${count})` : ''}
    </button>
  );

  return (
    <>
      {/* ===== TOP BAR ===== */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25,
        pointerEvents: 'auto',
      }}>
        <div style={{
          background: `linear-gradient(135deg, ${headerColor}, ${headerColor}dd)`,
          color: '#fff', padding: '6px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              fontWeight: '700', fontSize: '0.95rem',
              background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px',
            }}>
              {inc?.incident_number}
            </span>
            <span style={{ fontSize: '0.82rem', opacity: 0.95 }}>
              {inc?.event_type || inc?.call_category}
              {inc?.event_subtype ? ` \u2014 ${inc.event_subtype}` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button onClick={onToggleGps} style={{
              padding: '3px 8px', borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.4)',
              background: gpsEnabled ? 'rgba(255,255,255,0.3)' : 'transparent',
              color: '#fff', fontSize: '0.7rem', cursor: 'pointer',
            }}>{gpsEnabled ? 'GPS ON' : 'GPS OFF'}</button>
            <button onClick={onExit} style={{
              padding: '3px 10px', borderRadius: '4px',
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600',
            }}>EXIT</button>
          </div>
        </div>

        {/* Address + route info */}
        <div style={{
          background: 'rgba(255,255,255,0.92)', padding: '4px 16px',
          fontSize: '0.8rem', color: '#333', fontWeight: '500',
          backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(0,0,0,0.08)',
        }}>
          {inc?.address}
          {inc?.location_name && <span style={{ color: '#888', marginLeft: '8px', fontWeight: '400' }}>({inc.location_name})</span>}
          {route?.distance_meters && (
            <span style={{ float: 'right', color: '#555', fontWeight: '400', fontSize: '0.78rem' }}>
              {fmtDist(route.distance_meters)}
              {route.duration_seconds ? ` \u00B7 ${Math.ceil(route.duration_seconds / 60)} min` : ''}
            </span>
          )}
        </div>
      </div>

      {/* ===== FLOATING INFO CARD ===== */}
      <div style={{
        position: 'absolute',
        top: '68px', right: '12px',
        zIndex: 25, pointerEvents: 'auto',
        width: collapsed ? 'auto' : '280px',
        maxHeight: collapsed ? 'auto' : 'calc(100vh - 160px)',
        background: 'rgba(30, 30, 30, 0.88)',
        backdropFilter: 'blur(12px)',
        borderRadius: '10px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        {/* Card header with tabs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '2px',
          padding: '6px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
        }}>
          {!collapsed && (
            <>
              {tabBtn('info', 'Info', infoBadge)}
              {tabBtn('water', 'Water', waterAll.length)}
              {tabBtn('preplans', 'Plans', preplans.length)}
              {tabBtn('history', 'Hx', sceneHistory.length)}
            </>
          )}
          <button
            onClick={() => setCollapsed(prev => !prev)}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.75rem',
              padding: '2px 4px',
            }}
          >
            {collapsed ? '\u25C0' : '\u25B6'}
          </button>
        </div>

        {/* Card content */}
        {!collapsed && (
          <div style={{
            flex: 1, overflowY: 'auto', padding: '8px 10px',
            color: '#e0e0e0', fontSize: '0.78rem',
          }}>
            {loading && (
              <div style={{ textAlign: 'center', padding: '16px', color: '#999' }}>Loading...</div>
            )}

            {/* INFO TAB */}
            {!loading && activeTab === 'info' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(inc?.dispatched_units?.length > 0 || inc?.cad_units?.length > 0) && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Units</div>
                    <div style={{ color: '#fff' }}>
                      {(inc.dispatched_units || inc.cad_units || []).map(u => u.unit_id || u.cad_unit_id || '?').join(', ')}
                    </div>
                  </div>
                )}
                {hazards.map((h, i) => (
                  <div key={`hz${i}`} style={{
                    padding: '6px 8px', background: 'rgba(220, 38, 38, 0.2)',
                    borderRadius: '6px', borderLeft: '3px solid #DC2626',
                  }}>
                    {h.icon || '\u26A0\uFE0F'} {h.title}
                    {h.distance_meters && <span style={{ color: '#aaa', marginLeft: '6px', fontSize: '0.7rem' }}>{fmtDist(h.distance_meters)}</span>}
                  </div>
                ))}
                {closures.map((c, i) => (
                  <div key={`cl${i}`} style={{
                    padding: '6px 8px', background: 'rgba(220, 38, 38, 0.15)',
                    borderRadius: '6px', borderLeft: '3px solid #F87171',
                  }}>
                    {c.icon || '\uD83D\uDEAB'} {c.title}
                    {c.distance_meters && <span style={{ color: '#aaa', marginLeft: '6px', fontSize: '0.7rem' }}>{fmtDist(c.distance_meters)}</span>}
                  </div>
                ))}
                {addressNotes.map((n, i) => (
                  <div key={`an${i}`} style={{
                    padding: '6px 8px', background: 'rgba(234, 179, 8, 0.15)',
                    borderRadius: '6px', borderLeft: '3px solid #EAB308',
                  }}>
                    <span style={{ fontWeight: '500', color: '#EAB308' }}>{n.note_type || 'Note'}:</span>{' '}
                    <span style={{ color: '#ddd' }}>{n.content}</span>
                  </div>
                ))}
                {gpsEnabled && (
                  <div style={{
                    padding: '5px 8px', borderRadius: '6px', fontSize: '0.7rem',
                    background: gpsError ? 'rgba(220,38,38,0.15)' : 'rgba(22,163,74,0.15)',
                    color: gpsError ? '#F87171' : '#4ADE80',
                  }}>
                    {gpsError ? `GPS: ${gpsError}` : 'GPS tracking active'}
                  </div>
                )}
                {!hazards.length && !closures.length && !addressNotes.length && !(inc?.dispatched_units?.length || inc?.cad_units?.length) && !gpsEnabled && (
                  <div style={{ color: '#777', fontStyle: 'italic', textAlign: 'center', padding: '8px' }}>
                    No alerts for this location
                  </div>
                )}
              </div>
            )}

            {/* WATER TAB */}
            {!loading && activeTab === 'water' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {waterAll.length === 0 && <div style={{ color: '#777', fontStyle: 'italic', textAlign: 'center', padding: '8px' }}>No water sources nearby</div>}
                {waterAll.map((w, i) => (
                  <div key={i} style={{
                    padding: '6px 8px', borderRadius: '6px',
                    background: i < 3 ? 'rgba(37, 99, 235, 0.2)' : 'rgba(255,255,255,0.05)',
                    borderLeft: `3px solid ${i < 3 ? '#3B82F6' : '#555'}`,
                  }}>
                    <div style={{ fontWeight: i < 3 ? '600' : '400', color: i < 3 ? '#fff' : '#ccc' }}>
                      {i < 3 && <span style={{ color: '#60A5FA', marginRight: '4px' }}>#{i + 1}</span>}
                      {w.icon || '\uD83D\uDCA7'} {w.title}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#999', marginTop: '2px' }}>
                      {fmtDist(w.distance_meters)}{w.layer_type && ` \u00B7 ${w.layer_type.replace('_', ' ')}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* PREPLANS TAB */}
            {!loading && activeTab === 'preplans' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {preplans.length === 0 && <div style={{ color: '#777', fontStyle: 'italic', textAlign: 'center', padding: '8px' }}>No preplans found</div>}
                {preplans.map((p, i) => (
                  <div key={i} style={{
                    padding: '6px 8px', borderRadius: '6px',
                    background: 'rgba(139, 92, 246, 0.15)',
                    borderLeft: '3px solid #8B5CF6',
                  }}>
                    <div style={{ fontWeight: '500', color: '#fff' }}>{p.title}</div>
                    {p.description && <div style={{ fontSize: '0.7rem', color: '#bbb', marginTop: '2px' }}>{p.description}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* HISTORY TAB */}
            {!loading && activeTab === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {sceneHistory.length === 0 && <div style={{ color: '#777', fontStyle: 'italic', textAlign: 'center', padding: '8px' }}>No previous incidents here</div>}
                {sceneHistory.map((h, i) => (
                  <div key={i} style={{
                    padding: '6px 8px', borderRadius: '6px',
                    background: 'rgba(255,255,255,0.06)',
                    borderLeft: `3px solid ${h.call_category === 'FIRE' ? '#DC2626' : '#2563EB'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '500', color: '#fff' }}>{h.incident_number}</span>
                      <span style={{ fontSize: '0.65rem', color: '#888' }}>{fmtDate(h.incident_date)}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '2px' }}>
                      {h.event_type}{h.event_subtype ? ` \u2014 ${h.event_subtype}` : ''}
                    </div>
                    {h.narrative && (
                      <div style={{
                        fontSize: '0.65rem', color: '#888', marginTop: '3px',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>{h.narrative}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
