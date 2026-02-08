/**
 * IncidentCards - Mobile card view for incident list
 * 
 * Renders incidents as tappable cards instead of a table.
 * Each card shows: incident number, category badge, date/time, 
 * type, address, status, and action buttons.
 * 
 * Props are identical to what the table in IncidentsPage uses,
 * so the parent component just swaps rendering.
 */

import { formatTimeLocal } from '../utils/timeUtils';

function IncidentCards({ 
  incidents, 
  qualifyingIncidents,
  onIncidentClick, 
  onEditIncident, 
  onPrintIncident,
  loadingIncident,
  year,
}) {

  const getCategoryColor = (category) => {
    if (category === 'EMS') return '#3498db';
    if (category === 'FIRE') return '#e74c3c';
    if (category === 'DETAIL') return '#6b7280';
    return '#999';
  };

  const getCardStyle = (incident) => {
    const isQualifying = qualifyingIncidents.some(q => q.id === incident.id);
    const style = {
      borderLeft: `4px solid ${getCategoryColor(incident.call_category)}`,
    };
    if (isQualifying) {
      style.backgroundColor = incident.status === 'OPEN' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(234, 179, 8, 0.08)';
    }
    return style;
  };

  const getTypeDisplay = (i) => {
    if (i.call_category === 'EMS') return i.cad_event_type || '-';
    if (i.cad_event_subtype) {
      return `${i.cad_event_type || ''} / ${i.cad_event_subtype}`.replace(/^\s*\/\s*/, '');
    }
    return i.cad_event_type || '-';
  };

  if (incidents.length === 0) {
    return (
      <div style={{ 
        textAlign: 'center', 
        color: '#888', 
        padding: '2rem 1rem',
        background: 'var(--bg-card)',
        borderRadius: '6px',
      }}>
        No incidents for {year}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {incidents.map((i) => (
        <div
          key={i.id}
          onClick={() => onIncidentClick(i)}
          style={{
            background: 'var(--bg-card)',
            borderRadius: '6px',
            padding: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            cursor: 'pointer',
            ...getCardStyle(i),
          }}
        >
          {/* Top row: incident number + category + status */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '6px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: '600', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                #{i.internal_incident_number}
              </span>
              <span style={{ 
                fontSize: '0.7rem', 
                fontWeight: '600',
                padding: '2px 6px', 
                borderRadius: '3px',
                color: '#fff',
                backgroundColor: getCategoryColor(i.call_category),
              }}>
                {i.call_category}
              </span>
            </div>
            <span className={`badge badge-${i.status?.toLowerCase()}`} style={{ fontSize: '0.7rem' }}>
              {i.status}
            </span>
          </div>

          {/* Type */}
          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '4px', fontWeight: '500' }}>
            {getTypeDisplay(i)}
          </div>

          {/* Address */}
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            {i.address || '-'}
            {i.municipality_display_name && (
              <span style={{ color: 'var(--text-muted)' }}> — {i.municipality_display_name}</span>
            )}
          </div>

          {/* Date/time + CAD number */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            fontSize: '0.78rem', 
            color: 'var(--text-hint)',
          }}>
            <span>
              {i.incident_date}
              {i.time_dispatched && ` ${formatTimeLocal(i.time_dispatched)}`}
            </span>
            {i.cad_event_number && (
              <span>CAD: {i.cad_event_number}</span>
            )}
          </div>

          {/* Action buttons */}
          <div 
            style={{ 
              display: 'flex', 
              gap: '8px', 
              marginTop: '8px', 
              paddingTop: '8px', 
              borderTop: '1px solid var(--border-light)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => onEditIncident(i)} 
              disabled={loadingIncident}
              style={{ flex: 1, padding: '8px', fontSize: '0.82rem' }}
            >
              Edit
            </button>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => onPrintIncident(i)}
              style={{ flex: 1, padding: '8px', fontSize: '0.82rem' }}
            >
              Print
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default IncidentCards;
