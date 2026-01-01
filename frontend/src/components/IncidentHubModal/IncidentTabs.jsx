import { memo } from 'react';

/**
 * Incident tabs - clean style matching report template
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
        
        return (
          <div
            key={inc.id}
            style={{
              ...styles.tab,
              backgroundColor: isSelected ? '#fff' : '#f5f5f5',
              borderBottomColor: isSelected ? primaryColor : 'transparent',
              borderBottomWidth: isSelected ? '2px' : '0',
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
                  fontSize: '13px', 
                  fontWeight: '600',
                  color: '#333',
                }}>
                  {inc.cad_event_type || 'Unknown'}
                </div>
                <div style={{ fontSize: '11px', color: '#888' }}>
                  {inc.address ? inc.address.substring(0, 25) : 'No address'}
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
    backgroundColor: '#f0f0f0',
    borderBottom: '1px solid #ddd',
    overflowX: 'auto',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    minWidth: '180px',
    maxWidth: '220px',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    borderRight: '1px solid #e0e0e0',
    transition: 'background-color 0.15s',
  },
  tabContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
    overflow: 'hidden',
  },
  tabText: {
    overflow: 'hidden',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    color: '#999',
    cursor: 'pointer',
    padding: '0 4px',
    marginLeft: '8px',
    lineHeight: 1,
  },
};

export default memo(IncidentTabs);
