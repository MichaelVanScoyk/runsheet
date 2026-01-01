import { memo } from 'react';

/**
 * Incident tabs - clean, minimal tab bar with readable text
 */
function IncidentTabs({ 
  incidents, 
  selectedId, 
  onSelect, 
  onClose,
  primaryColor = '#c41e3a',
  secondaryColor = '#1a365d',
}) {
  if (incidents.length <= 1) return null;

  return (
    <div style={styles.container}>
      {incidents.map(inc => {
        const isSelected = inc.id === selectedId;
        const isActive = inc.status === 'OPEN';
        
        return (
          <div
            key={inc.id}
            style={{
              ...styles.tab,
              backgroundColor: isSelected ? '#fff' : '#f5f5f5',
              borderBottomColor: isSelected ? secondaryColor : 'transparent',
            }}
            onClick={() => onSelect(inc.id)}
          >
            <div style={styles.tabContent}>
              {/* Status dot */}
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isActive ? '#22c55e' : '#999',
                flexShrink: 0,
              }} />
              
              <div style={styles.tabText}>
                <div style={{ 
                  fontSize: '12px', 
                  fontWeight: '500',
                  color: '#333',
                }}>
                  {inc.cad_event_type || 'Unknown'}
                </div>
                <div style={{ fontSize: '10px', color: '#888' }}>
                  {inc.address ? inc.address.substring(0, 20) : 'No address'}
                </div>
              </div>
            </div>
            
            {/* Close button */}
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
    backgroundColor: '#eee',
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
    transition: 'background-color 0.15s',
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
    marginLeft: '4px',
    lineHeight: 1,
  },
};

export default memo(IncidentTabs);
