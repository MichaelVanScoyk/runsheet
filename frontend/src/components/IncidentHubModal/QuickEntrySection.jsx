import React, { memo, useState } from 'react';

/**
 * Quick Entry section - compact layout for CLOSED incidents
 * Darker blocks, simple titles, compact name chips
 */
function QuickEntrySection({
  incident,
  assignments,
  onAssignmentChange,
  formData,
  onFormChange,
  allPersonnel,
  getAssignedIds,
  dispatchedApparatus,
  primaryColor = '#1a5f2a',
}) {
  const apparatusUnits = dispatchedApparatus.filter(
    a => a.unit_category === 'APPARATUS' || !a.unit_category
  );

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
      {/* Unit Assignments */}
      {apparatusUnits.length > 0 && (
        <div style={styles.card}>
          <div style={{ ...styles.sectionHeader, color: primaryColor }}>
            Unit Assignments
          </div>
          <div style={styles.unitsGrid}>
            {apparatusUnits.map((apparatus) => (
              <UnitSection
                key={apparatus.id}
                title={apparatus.name || apparatus.unit_designator}
                assignedIds={assignments[apparatus.unit_designator] || []}
                unitDesignator={apparatus.unit_designator}
                getPersonName={getPersonName}
                onRemove={handleRemove}
                onAdd={handleAdd}
                getAvailable={getAvailable}
              />
            ))}
          </div>
        </div>
      )}

      {/* Narrative Fields */}
      <div style={styles.card}>
        <div style={{ ...styles.sectionHeader, color: primaryColor }}>
          Narrative
        </div>
        
        <div style={styles.fieldsGrid}>
          <div>
            <label style={styles.fieldLabel}>Situation Found</label>
            <textarea
              style={styles.textarea}
              rows={2}
              placeholder="What was found on arrival..."
              value={formData.situation_found || ''}
              onChange={(e) => onFormChange('situation_found', e.target.value)}
            />
          </div>

          <div>
            <label style={styles.fieldLabel}>Services Provided</label>
            <textarea
              style={styles.textarea}
              rows={2}
              placeholder="Actions taken..."
              value={formData.services_provided || ''}
              onChange={(e) => onFormChange('services_provided', e.target.value)}
            />
          </div>
        </div>

        <div>
          <label style={styles.fieldLabel}>Narrative</label>
          <textarea
            style={styles.textarea}
            rows={3}
            placeholder="Detailed narrative..."
            value={formData.narrative || ''}
            onChange={(e) => onFormChange('narrative', e.target.value)}
          />
        </div>
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
    <div style={styles.unitCard}>
      <div style={styles.unitName}>{title}</div>
      
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
      
      <div style={{ position: 'relative', marginTop: assigned.length > 0 ? '6px' : '0' }}>
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
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
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
  unitsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '10px',
  },
  unitCard: {
    padding: '10px',
    backgroundColor: '#fff',
    borderRadius: '4px',
    border: '1px solid #e0e0e0',
  },
  unitName: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '8px',
    paddingBottom: '6px',
    borderBottom: '1px solid #eee',
  },
  chipsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    border: '1px solid #ddd',
    borderRadius: '3px',
    padding: '2px 4px 2px 8px',
    fontSize: '11px',
    color: '#333',
  },
  chipText: {
    marginRight: '2px',
  },
  chipRemove: {
    background: 'none',
    border: 'none',
    color: '#e74c3c',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
  },
  input: {
    width: '100%',
    padding: '5px 8px',
    border: '1px dashed #ccc',
    borderRadius: '3px',
    fontSize: '11px',
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
    maxHeight: '160px',
    overflowY: 'auto',
    zIndex: 100,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  dropdownItem: {
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#333',
    borderBottom: '1px solid #f0f0f0',
  },
  fieldsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '10px',
    marginBottom: '10px',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '4px',
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    resize: 'vertical',
    fontFamily: 'inherit',
    backgroundColor: '#fff',
    color: '#333',
    boxSizing: 'border-box',
  },
};

export default memo(QuickEntrySection);
