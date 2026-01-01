import { memo } from 'react';

/**
 * Incident display - matches report template style
 * Section headers use branding color, body text is dark/readable
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

  const dispatchedUnits = (incident.cad_units || [])
    .filter(u => !u.is_mutual_aid)
    .map(u => u.unit_id)
    .join(', ');

  return (
    <div style={styles.container}>
      {/* Status row */}
      <div style={styles.statusRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isActive ? '#22c55e' : '#999',
          }} />
          <span style={{ 
            fontSize: '12px', 
            fontWeight: '600',
            color: isActive ? '#22c55e' : '#666',
            textTransform: 'uppercase',
          }}>
            {isActive ? 'Active' : 'Closed'}
          </span>
        </div>
        <span style={{ fontSize: '12px', color: '#666' }}>
          CAD# {incident.cad_event_number}
        </span>
      </div>

      {/* Type */}
      <div style={styles.type}>
        {incident.cad_event_type || 'Unknown Type'}
        {incident.cad_event_subtype && (
          <span style={{ marginLeft: '10px' }}>
            {incident.cad_event_subtype}
          </span>
        )}
      </div>

      {/* Address */}
      <div style={styles.address}>
        {incident.address || 'No Address'}
      </div>
      
      {/* Municipality / Cross streets */}
      <div style={styles.location}>
        {incident.municipality_code}
        {incident.cross_streets && (
          <span> @ {incident.cross_streets}</span>
        )}
      </div>

      {/* ESZ/Box */}
      {incident.esz_box && (
        <div style={styles.info}>
          <strong>ESZ/Box:</strong> {incident.esz_box}
        </div>
      )}

      {/* Units */}
      {dispatchedUnits && (
        <div style={styles.info}>
          <strong>Units:</strong> {dispatchedUnits}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#fff',
    borderRadius: '4px',
    padding: '16px',
    marginBottom: '16px',
    border: '1px solid #e0e0e0',
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  type: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#555',
    marginBottom: '4px',
  },
  address: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#222',
    marginBottom: '4px',
  },
  location: {
    fontSize: '14px',
    color: '#555',
    marginBottom: '8px',
  },
  info: {
    fontSize: '13px',
    color: '#555',
    marginTop: '4px',
  },
};

export default memo(IncidentDisplay);
