import { memo } from 'react';

/**
 * Incident display - compact, tighter layout
 */
function IncidentDisplay({ incident, primaryColor = '#1a5f2a' }) {
  if (!incident) {
    return (
      <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
        No incident selected
      </div>
    );
  }

  const isActive = incident.status === 'OPEN';

  return (
    <div style={styles.container}>
      {/* Top row: Status and CAD# */}
      <div style={styles.topRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isActive ? '#22c55e' : '#888',
          }} />
          <span style={{ 
            fontSize: '11px', 
            fontWeight: '600',
            color: isActive ? '#22c55e' : '#666',
            textTransform: 'uppercase',
          }}>
            {isActive ? 'Active' : 'Closed'}
          </span>
        </div>
        <span style={{ fontSize: '11px', color: '#666' }}>
          CAD# {incident.cad_event_number}
        </span>
      </div>

      {/* Event type line */}
      <div style={styles.eventType}>
        {incident.cad_event_type}
        {incident.cad_event_subtype && (
          <span style={styles.eventSubtype}> — {incident.cad_event_subtype}</span>
        )}
      </div>

      {/* Address - prominent */}
      <div style={styles.address}>{incident.address || 'No Address'}</div>
      
      {/* Location details on one line */}
      <div style={styles.locationLine}>
        {incident.municipality_code}
        {incident.cross_streets && <span> @ {incident.cross_streets}</span>}
        {incident.esz_box && <span style={styles.separator}>ESZ/Box: {incident.esz_box}</span>}
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#fff',
    borderRadius: '4px',
    padding: '12px 16px',
    marginBottom: '12px',
    border: '1px solid #ddd',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  eventType: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#444',
    marginBottom: '2px',
  },
  eventSubtype: {
    fontWeight: '400',
    color: '#666',
  },
  address: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#111',
    marginBottom: '2px',
  },
  locationLine: {
    fontSize: '12px',
    color: '#555',
  },
  separator: {
    marginLeft: '12px',
    paddingLeft: '12px',
    borderLeft: '1px solid #ccc',
  },
};

export default memo(IncidentDisplay);
