import React, { memo, useState } from 'react';

function StationDirectSection({
  assignments,
  onAssignmentChange,
  allPersonnel,
  getAssignedIds,
  stationUnit,
  directUnit,
  primaryColor = '#1a5f2a',
}) {
  if (!stationUnit && !directUnit) return null;

  const getPersonName = (id) => {
    const p = allPersonnel.find(x => x.id === id);
    return p ? `${p.last_name}, ${p.first_name}` : '?';
  };

  const handleRemove = (unitDesignator, idx) => {
    const current = assignments[unitDesignator] || [];
    onAssignmentChange(unitDesignator, current.filter((_, i) => i !== idx));
  };

  const handleAdd = (unitDesignator, personnelId) => {
    const current = assignments[unitDesignator] || [];
    onAssignmentChange(unitDesignator, [...current, personnelId]);
  };

  const globalAssigned = getAssignedIds();
  const getAvailable = () => allPersonnel.filter(p => !globalAssigned.has(p.id));

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
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

function UnitSection({ title, assignedIds, unitDesignator, getPersonName, onRemove, onAdd, getAvailable, primaryColor }) {
  const [searchText, setSearchText] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState(null);

  const assigned = (assignedIds || []).filter(id => id !== null);
  const filtered = getAvailable().filter(p => {
    if (!searchText) return true;
    const lower = searchText.toLowerCase();
    return p.last_name.toLowerCase().includes(lower) || p.first_name.toLowerCase().includes(lower);
  });

  const handleSelect = (personnelId) => {
    onAdd(unitDesignator, personnelId);
    setSearchText('');
    setShowDropdown(false);
  };

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '4px', padding: '12px', border: '1px solid #ddd' }}>
      <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: primaryColor }}>{title}</div>
      
      {assigned.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {assigned.map((personId, idx) => (
            <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px', padding: '4px 6px 4px 10px', fontSize: '12px', color: '#333' }}>
              <span style={{ marginRight: '4px' }}>{getPersonName(personId)}</span>
              <button onClick={() => onRemove(unitDesignator, idx)} style={{ background: 'none', border: 'none', color: '#e74c3c', fontSize: '14px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}
      
      <div style={{ position: 'relative', marginTop: assigned.length > 0 ? '8px' : '0' }}>
        <input
          type="text"
          placeholder="+ Add..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onFocus={(e) => {
            const rect = e.target.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
            setShowDropdown(true);
          }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          style={{ width: '100%', padding: '6px 10px', border: '1px dashed #ccc', borderRadius: '4px', fontSize: '12px', backgroundColor: '#fff', color: '#333', boxSizing: 'border-box' }}
        />
        {showDropdown && dropdownPos && (
          <div style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '4px',
            maxHeight: '220px',
            overflowY: 'auto',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            {filtered.map(p => (
              <div
                key={p.id}
                onMouseDown={() => handleSelect(p.id)}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                style={{ padding: '8px 10px', cursor: 'pointer', fontSize: '12px', color: '#333', borderBottom: '1px solid #f0f0f0' }}
              >
                {p.last_name}, {p.first_name}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '8px 10px', color: '#999', fontSize: '12px' }}>No matches</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(StationDirectSection);
