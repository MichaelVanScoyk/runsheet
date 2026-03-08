/**
 * OpenIncidentPanel.jsx — Overlay listing active/open incidents
 *
 * Polls GET /api/map/open-incidents every 30 seconds.
 * Only renders when there are open incidents.
 * Click an incident to trigger response mode.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const POLL_INTERVAL = 30000; // 30 seconds

export default function OpenIncidentPanel({ onSelectIncident }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const timerRef = useRef(null);

  const fetchOpenIncidents = useCallback(async () => {
    try {
      const res = await fetch('/api/map/open-incidents');
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.incidents || []);
      }
    } catch (e) {
      console.error('Failed to fetch open incidents:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOpenIncidents();
    timerRef.current = setInterval(fetchOpenIncidents, POLL_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchOpenIncidents]);

  // Don't render anything if no open incidents
  if (!loading && incidents.length === 0) return null;

  const formatElapsed = (isoTime) => {
    if (!isoTime) return '';
    const ms = Date.now() - new Date(isoTime).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  };

  const categoryColor = (cat) => {
    if (cat === 'FIRE') return '#DC2626';
    if (cat === 'EMS') return '#2563EB';
    return '#6B7280';
  };

  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      zIndex: 15,
      width: minimized ? 'auto' : '300px',
      background: '#fff',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      overflow: 'hidden',
      border: '2px solid #DC2626',
    }}>
      {/* Header */}
      <div
        onClick={() => setMinimized(prev => !prev)}
        style={{
          padding: '8px 12px',
          background: '#DC2626',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: '600',
        }}
      >
        <span>
          {incidents.length} ACTIVE INCIDENT{incidents.length !== 1 ? 'S' : ''}
        </span>
        <span style={{ fontSize: '0.75rem' }}>
          {minimized ? '\u25BC' : '\u25B2'}
        </span>
      </div>

      {/* Incident list */}
      {!minimized && (
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {loading && incidents.length === 0 && (
            <div style={{ padding: '12px', color: '#888', fontSize: '0.8rem', textAlign: 'center' }}>
              Loading...
            </div>
          )}
          {incidents.map(inc => (
            <div
              key={inc.id}
              onClick={() => onSelectIncident(inc)}
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid #eee',
                cursor: 'pointer',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              {/* Category indicator */}
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: categoryColor(inc.call_category),
                marginTop: '5px',
                flexShrink: 0,
                animation: 'pulse-dot 1.5s ease-in-out infinite',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  color: '#111',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {inc.incident_number} &mdash; {inc.event_type || inc.call_category}
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  color: '#555',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {inc.address}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#999', marginTop: '2px' }}>
                  {formatElapsed(inc.time_dispatched)}
                  {inc.unit_count > 0 && ` \u00B7 ${inc.unit_count} unit${inc.unit_count !== 1 ? 's' : ''}`}
                </div>
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: '#DC2626',
                fontWeight: '600',
                flexShrink: 0,
                marginTop: '2px',
              }}>
                GO &rarr;
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
}
