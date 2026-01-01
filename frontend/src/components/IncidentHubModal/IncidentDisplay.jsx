import { memo } from 'react';

/**
 * Incident display - clean, minimal layout
 */
function IncidentDisplay({ incident, primaryColor = '#c41e3a', secondaryColor = '#1a365d' }) {
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

      {/* Type */}
      <div style={{ ...styles.type, color: secondaryColor }}>
        {incident.cad_event_type || 'Unknown Type'}
        {incident.cad_event_subtype && (
          <span style={{ color: primaryColor, marginLeft: '8px' }}>
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
          <span style={{ color: '#888' }}> @ {incident.cross_streets}</span>
        )}
      </div>

      {/* Units and ESZ */}
      <div style={styles.infoRow}>
        {dispatchedUnits && (
          <span><strong>Units:</strong> {dispatchedUnits}</span>
        )}
        {incident.esz_box && (
          <span><strong>ESZ/Box:</strong> {incident.esz_box}</span>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    marginBottom: '16px',
    paddingBottom: '16px',
    borderBottom: '1px solid #eee',
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  type: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '4px',
  },
  address: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#111',
    marginBottom: '2px',
  },
  location: {
    fontSize: '13px',
    color: '#555',
    marginBottom: '8px',
  },
  infoRow: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    color: '#666',
  },
};

export default memo(IncidentDisplay);
