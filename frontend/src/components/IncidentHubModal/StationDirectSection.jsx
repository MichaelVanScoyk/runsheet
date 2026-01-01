import React, { memo, useState } from 'react';

/**
 * Station and Direct responders - compact chips layout
 * Simple titles: "Station" and "Direct"
 */
function StationDirectSection({
  assignments,
  onAssignmentChange,
  allPersonnel,
  getAssignedIds,
  stationUnit,
  directUnit,
  primaryColor = '#1a5f2a',
}) {
  if (!stationUnit && !directUnit) {
    return null;
  }

  const getPersonName = (id) => {
    const p = allPersonnel.find(x => x.id === id);
    return p ? `${p.last_name}, ${p.first_name}` : '?';
  };

  const handleRemove = (unitDesignator, idx) => {
    const current = assignments[unitDesignator] || [];
    const newList = current.filter((_, i) => i !== idx);
    onAssignmentChange(unitDesignator, newList);
  };

  const handleAdd = (unitDesignator, personnelId) => {
    const current = assignments[unitDesignator] || [];
    onAssignmentChange(unitDesignator, [...current, personnelId]);
  };

  const globalAssigned = getAssignedIds();

  const getAvailable = () => {
    return allPersonnel.filter(p => !globalAssigned.has(p.id));
  };

  return (
    <div style={styles.container}>
      <div style={styles.grid}>
        {stationUnit && (
          <UnitSection
            title="Station"
            assignedIds={assignments[stationUnit.unit_designator] || []}
            unitDesignator={stationUnit.unit_designator}
            getPersonName={getPersonName}
            onRemove={handleRemove}
            onAdd={handleAdd}
            getAvailable={getAvailable}
            primaryColor={primaryColor}
          />
        )}

        {directUnit && (
          <UnitSection
            title="Direct"
            assignedIds={assignments[directUnit.unit_designator] || []}
            unitDesignator={directUnit.unit_designator}
            getPersonName={getPersonName}
            onRemove={handleRemove}
            onAdd={handleAdd}
            getAvailable={getAvailable}
            primaryColor={primaryColor}
          />
        )}
      </div>
    </div>
  );
}

function UnitSection({ 
  title, 
  assignedIds, 
  unitDesignator, 
  getPersonName, 
  onRemove, 
  onAdd, 
  getAvailable,
  primaryColor 
}) {
  const [searchText, setSearchText] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const assigned = (assignedIds || []).filter(id => id !== null);
  
  const filtered = getAvailable().filter(p => {
    if (!searchText) return true;
    const lower = searchText.toLowerCase();
    return p.last_name.toLowerCase().includes(lower) || 
           p.first_name.toLowerCase().includes(lower);
  });

  const handleSelect = (personnelId) => {
    onAdd(unitDesignator, personnelId);
    setSearchText('');
    setShowDropdown(false);
  };

  return (
    <div style={styles.section}>
      <div style={{ ...styles.sectionHeader, color: primaryColor }}>{title}</div>
      
      {/* Compact chips for assigned personnel */}
      {assigned.length > 0 && (
        <div style={styles.chipsContainer}>
          {assigned.map((personId, idx) => (
            <div key={idx} style={styles.chip}>
              <span style={styles.chipText}>{getPersonName(personId)}</span>
              <button 
                style={styles.chipRemove}
                onClick={() => onRemove(unitDesignator, idx)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      
      {/* Add input */}
      <div style={{ position: 'relative', marginTop: assigned.length > 0 ? '8px' : '0' }}>
        <input
          type="text"
          placeholder="+ Add..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          style={styles.input}
        />
        {showDropdown && (
          <div style={styles.dropdown}>
            {filtered.slice(0, 8).map(p => (
              <div
                key={p.id}
                style={styles.dropdownItem}
                onMouseDown={() => handleSelect(p.id)}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                {p.last_name}, {p.first_name}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '8px 10px', color: '#999', fontSize: '12px' }}>
                No matches
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    marginBottom: '12px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '12px',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: '4px',
    padding: '12px',
    border: '1px solid #ddd',
  },
  sectionHeader: {
    fontSize: '13px',
    fontWeight: '700',
    marginBottom: '10px',
  },
  chipsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '4px 6px 4px 10px',
    fontSize: '12px',
    color: '#333',
  },
  chipText: {
    marginRight: '4px',
  },
  chipRemove: {
    background: 'none',
    border: 'none',
    color: '#e74c3c',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
  },
  input: {
    width: '100%',
    padding: '6px 10px',
    border: '1px dashed #ccc',
    borderRadius: '4px',
    fontSize: '12px',
    backgroundColor: '#fff',
    color: '#333',
    boxSizing: 'border-box',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '2px',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '4px',
    maxHeight: '180px',
    overflowY: 'auto',
    zIndex: 100,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  dropdownItem: {
    padding: '8px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#333',
    borderBottom: '1px solid #f0f0f0',
  },
};

export default memo(StationDirectSection);
