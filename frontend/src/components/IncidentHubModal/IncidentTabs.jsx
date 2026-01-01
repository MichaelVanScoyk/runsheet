import { memo } from 'react';

/**
 * Incident tabs - show subtype, not type
 */
function IncidentTabs({ 
  incidents, 
  selectedId, 
  onSelect, 
  onClose,
  primaryColor = '#1a5f2a',
}) {
  if (incidents.length <= 1) return null;

  return (
    <div style={styles.container}>
      {incidents.map(inc => {
        const isSelected = inc.id === selectedId;
        const isActive = inc.status === 'OPEN';
        // Use subtype if available, fallback to type
        const displayType = inc.cad_event_subtype || inc.cad_event_type || 'Unknown';
        
        return (
          <div
            key={inc.id}
            style={{
              ...styles.tab,
              backgroundColor: isSelected ? '#fff' : '#f0f0f0',
              borderBottomColor: isSelected ? primaryColor : 'transparent',
              borderBottomWidth: isSelected ? '2px' : '0',
            }}
            onClick={() => onSelect(inc.id)}
          >
            <div style={styles.tabContent}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isActive ? '#22c55e' : '#888',
                flexShrink: 0,
              }} />
              
              <div style={styles.tabText}>
                <div style={{ 
                  fontSize: '12px', 
                  fontWeight: '600',
                  color: '#333',
                }}>
                  {displayType}
                </div>
                <div style={{ fontSize: '10px', color: '#888' }}>
                  {inc.address ? inc.address.substring(0, 25) : 'No address'}
                </div>
              </div>
            </div>
            
            <button
              style={styles.closeBtn}
              onClick={(e) => {
                e.stopPropagation();
                onClose(inc.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    backgroundColor: '#e8e8e8',
    borderBottom: '1px solid #ddd',
    overflowX: 'auto',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    minWidth: '160px',
    maxWidth: '200px',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    borderRight: '1px solid #ddd',
  },
  tabContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    overflow: 'hidden',
  },
  tabText: {
    overflow: 'hidden',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    color: '#999',
    cursor: 'pointer',
    padding: '0 4px',
    marginLeft: '6px',
    lineHeight: 1,
  },
};

export default memo(IncidentTabs);
