/**
 * ResponseOverlay.jsx — Tactical overlay for incident response mode
 *
 * Top bar: incident header + address + route distance
 * Floating card: ALL data visible at once — no tabs, no clicking to reveal.
 * Collapsible as a whole unit only.
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
  highlightFeatureId,
}) {
  const [responseData, setResponseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [flashId, setFlashId] = useState(null);

  // Flash highlight when a feature is clicked on map
  useEffect(() => {
    if (highlightFeatureId) {
      setFlashId(highlightFeatureId);
      const timer = setTimeout(() => setFlashId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightFeatureId]);

  const fetchResponseData = useCallback(async (originLat, originLng) => {
    if (!incident?.id) return;
    try {
      let url = `/api/map/incident-response/${incident.id}`;
      if (originLat && originLng) url += `?origin_lat=${originLat}&origin_lng=${originLng}`;
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
    const timer = setTimeout(() => fetchResponseData(gpsPosition.lat, gpsPosition.lng), 30000);
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
  const hasAnyData = waterAll.length || preplans.length || hazards.length || closures.length || addressNotes.length || sceneHistory.length || (inc?.dispatched_units?.length || inc?.cad_units?.length);

  // Section header style
  const sectionHead = (label, color) => (
    <div style={{
      fontSize: '0.6rem', color: color || '#888', textTransform: 'uppercase',
      letterSpacing: '0.8px', fontWeight: '700', marginTop: '6px', marginBottom: '3px',
      paddingBottom: '2px', borderBottom: `1px solid ${color || '#555'}33`,
    }}>{label}</div>
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
            }}>{inc?.incident_number}</span>
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
              background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600',
            }}>EXIT</button>
          </div>
        </div>
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

      {/* ===== FLOATING INFO CARD — everything visible, no tabs ===== */}
      <div style={{
        position: 'absolute', top: '68px', right: '12px', zIndex: 25,
        pointerEvents: 'auto',
        width: collapsed ? '32px' : '260px',
        maxHeight: 'calc(100vh - 160px)',
        background: 'rgba(20, 20, 20, 0.85)',
        backdropFilter: 'blur(14px)',
        borderRadius: '10px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(prev => !prev)}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer', fontSize: '0.7rem', padding: '6px 8px',
            textAlign: collapsed ? 'center' : 'right', flexShrink: 0,
          }}
        >{collapsed ? '\u25C0' : '\u25B6'}</button>

        {/* All content — visible, scrollable */}
        {!collapsed && (
          <div style={{
            flex: 1, overflowY: 'auto', padding: '0 10px 10px',
            color: '#ddd', fontSize: '0.76rem',
          }}>
            {loading && <div style={{ textAlign: 'center', padding: '12px', color: '#888' }}>Loading...</div>}

            {!loading && !hasAnyData && (
              <div style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '12px' }}>
                No tactical data for this location
              </div>
            )}

            {/* UNITS */}
            {!loading && (inc?.dispatched_units?.length > 0 || inc?.cad_units?.length > 0) && (
              <>
                {sectionHead('Units', '#60A5FA')}
                <div style={{ color: '#fff', fontSize: '0.8rem' }}>
                  {(inc.dispatched_units || inc.cad_units || []).map(u => u.unit_id || u.cad_unit_id || '?').join(', ')}
                </div>
              </>
            )}

            {/* HAZARDS */}
            {!loading && hazards.length > 0 && (
              <>
                {sectionHead('Hazards', '#F87171')}
                {hazards.map((h, i) => (
                  <div key={`hz${i}`} style={{
                    padding: '5px 7px', marginBottom: '3px', borderRadius: '5px',
                    background: 'rgba(220,38,38,0.18)', borderLeft: '3px solid #DC2626',
                  }}>
                    {h.icon || '\u26A0\uFE0F'} {h.title}
                    {h.on_route && <span style={{ background: '#DC2626', color: '#fff', fontSize: '0.55rem', padding: '1px 4px', borderRadius: '3px', marginLeft: '5px', fontWeight: '700' }}>ON ROUTE</span>}
                    {h.distance_meters && <span style={{ color: '#aaa', marginLeft: '6px', fontSize: '0.68rem' }}>{fmtDist(h.distance_meters)}</span>}
                  </div>
                ))}
              </>
            )}

            {/* CLOSURES */}
            {!loading && closures.length > 0 && (
              <>
                {sectionHead('Road Closures', '#F87171')}
                {closures.map((c, i) => (
                  <div key={`cl${i}`} style={{
                    padding: '5px 7px', marginBottom: '3px', borderRadius: '5px',
                    background: 'rgba(220,38,38,0.12)', borderLeft: '3px solid #F87171',
                  }}>
                    {c.icon || '\uD83D\uDEAB'} {c.title}
                    {c.on_route && <span style={{ background: '#DC2626', color: '#fff', fontSize: '0.55rem', padding: '1px 4px', borderRadius: '3px', marginLeft: '5px', fontWeight: '700' }}>ON ROUTE</span>}
                    {c.distance_meters && <span style={{ color: '#aaa', marginLeft: '6px', fontSize: '0.68rem' }}>{fmtDist(c.distance_meters)}</span>}
                  </div>
                ))}
              </>
            )}

            {/* ADDRESS NOTES */}
            {!loading && addressNotes.length > 0 && (
              <>
                {sectionHead('Address Notes', '#EAB308')}
                {addressNotes.map((n, i) => (
                  <div key={`an${i}`} style={{
                    padding: '5px 7px', marginBottom: '3px', borderRadius: '5px',
                    background: 'rgba(234,179,8,0.12)', borderLeft: '3px solid #EAB308',
                  }}>
                    <span style={{ fontWeight: '500', color: '#EAB308' }}>{n.note_type || 'Note'}:</span>{' '}
                    <span style={{ color: '#ddd' }}>{n.content}</span>
                  </div>
                ))}
              </>
            )}

            {/* WATER SOURCES */}
            {!loading && waterAll.length > 0 && (
              <>
                {sectionHead('Water Sources', '#60A5FA')}
                {waterAll.map((w, i) => {
                  const isHighlighted = flashId && w.feature_id === flashId;
                  return (
                    <div key={`w${i}`} id={`water-${w.feature_id}`} style={{
                      padding: '5px 7px', marginBottom: '3px', borderRadius: '5px',
                      background: isHighlighted ? 'rgba(59,130,246,0.5)' : (i < 3 ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.04)'),
                      borderLeft: `3px solid ${isHighlighted ? '#fff' : (i < 3 ? '#3B82F6' : '#555')}`,
                      transition: 'background 0.3s, border-left-color 0.3s',
                      animation: isHighlighted ? 'cadreport-flash 0.6s ease-in-out 3' : 'none',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: i < 3 ? '600' : '400', color: i < 3 ? '#fff' : '#ccc', flex: 1 }}>
                          {i < 3 && <span style={{ color: '#60A5FA', marginRight: '4px' }}>#{i + 1}</span>}
                          {w.icon || '\uD83D\uDCA7'} {w.title}
                        </div>
                        {w.latitude && w.longitude && (
                          <button
                            onClick={() => window.open(
                              `https://www.google.com/maps/dir/?api=1&destination=${w.latitude},${w.longitude}&travelmode=driving`,
                              '_blank'
                            )}
                            style={{
                              background: 'rgba(59,130,246,0.3)', border: '1px solid rgba(59,130,246,0.5)',
                              color: '#60A5FA', borderRadius: '4px', padding: '2px 6px',
                              fontSize: '0.62rem', cursor: 'pointer', fontWeight: '600',
                              flexShrink: 0, marginLeft: '6px',
                            }}
                          >NAV</button>
                        )}
                      </div>
                      <div style={{ fontSize: '0.66rem', color: '#999', marginTop: '1px' }}>
                        {fmtDist(w.distance_meters)}{w.layer_type && ` \u00B7 ${w.layer_type.replace('_', ' ')}`}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* PREPLANS */}
            {!loading && preplans.length > 0 && (
              <>
                {sectionHead('Preplans', '#A78BFA')}
                {preplans.map((p, i) => (
                  <div key={`p${i}`} style={{
                    padding: '5px 7px', marginBottom: '3px', borderRadius: '5px',
                    background: 'rgba(139,92,246,0.12)', borderLeft: '3px solid #8B5CF6',
                  }}>
                    <div style={{ fontWeight: '500', color: '#fff' }}>{p.title}</div>
                    {p.description && <div style={{ fontSize: '0.68rem', color: '#bbb', marginTop: '2px' }}>{p.description}</div>}
                  </div>
                ))}
              </>
            )}

            {/* SCENE HISTORY */}
            {!loading && sceneHistory.length > 0 && (
              <>
                {sectionHead(`Scene History (${sceneHistory.length})`, '#888')}
                {sceneHistory.map((h, i) => (
                  <div key={`sh${i}`} style={{
                    padding: '5px 7px', marginBottom: '3px', borderRadius: '5px',
                    background: 'rgba(255,255,255,0.04)',
                    borderLeft: `3px solid ${h.call_category === 'FIRE' ? '#DC2626' : '#2563EB'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '500', color: '#fff' }}>{h.incident_number}</span>
                      <span style={{ fontSize: '0.62rem', color: '#777' }}>{fmtDate(h.incident_date)}</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#aaa', marginTop: '1px' }}>
                      {h.event_type}{h.event_subtype ? ` \u2014 ${h.event_subtype}` : ''}
                    </div>
                    {h.narrative && (
                      <div style={{
                        fontSize: '0.62rem', color: '#777', marginTop: '2px',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>{h.narrative}</div>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* GPS STATUS */}
            {!loading && gpsEnabled && (
              <div style={{
                marginTop: '6px', padding: '5px 7px', borderRadius: '5px', fontSize: '0.68rem',
                background: gpsError ? 'rgba(220,38,38,0.12)' : 'rgba(22,163,74,0.12)',
                color: gpsError ? '#F87171' : '#4ADE80',
              }}>
                {gpsError ? `GPS: ${gpsError}` : 'GPS tracking active'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Flash animation for highlighted items */}
      <style>{`
        @keyframes cadreport-flash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
