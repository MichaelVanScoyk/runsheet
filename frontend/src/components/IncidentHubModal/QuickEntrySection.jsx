import React, { memo, useState } from 'react';

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
  const apparatusUnits = dispatchedApparatus.filter(a => a.unit_category === 'APPARATUS' || !a.unit_category);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {apparatusUnits.length > 0 && (
        <div style={{ backgroundColor: '#fff', borderRadius: '4px', padding: '12px', border: '1px solid #ddd' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: primaryColor }}>Unit Assignments</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
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

      <div style={{ backgroundColor: '#fff', borderRadius: '4px', padding: '12px', border: '1px solid #ddd' }}>
        <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: primaryColor }}>Narrative</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px', marginBottom: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '4px' }}>Situation Found</label>
            <textarea
              rows={2}
              placeholder="What was found on arrival..."
              value={formData.situation_found || ''}
              onChange={(e) => onFormChange('situation_found', e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical', fontFamily: 'inherit', backgroundColor: '#fff', color: '#333', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '4px' }}>Services Provided</label>
            <textarea
              rows={2}
              placeholder="Actions taken..."
              value={formData.services_provided || ''}
              onChange={(e) => onFormChange('services_provided', e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical', fontFamily: 'inherit', backgroundColor: '#fff', color: '#333', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '4px' }}>Narrative</label>
          <textarea
            rows={3}
            placeholder="Detailed narrative..."
            value={formData.narrative || ''}
            onChange={(e) => onFormChange('narrative', e.target.value)}
            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical', fontFamily: 'inherit', backgroundColor: '#fff', color: '#333', boxSizing: 'border-box' }}
          />
        </div>
      </div>
    </div>
  );
}

function UnitSection({ title, assignedIds, unitDesignator, getPersonName, onRemove, onAdd, getAvailable }) {
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
    <div style={{ padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
      <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #eee' }}>{title}</div>
      
      {assigned.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {assigned.map((personId, idx) => (
            <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '3px', padding: '2px 4px 2px 8px', fontSize: '11px', color: '#333' }}>
              <span style={{ marginRight: '2px' }}>{getPersonName(personId)}</span>
              <button onClick={() => onRemove(unitDesignator, idx)} style={{ background: 'none', border: 'none', color: '#e74c3c', fontSize: '12px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>×</button>
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
          onFocus={(e) => {
            const rect = e.target.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
            setShowDropdown(true);
          }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          style={{ width: '100%', padding: '5px 8px', border: '1px dashed #ccc', borderRadius: '3px', fontSize: '11px', backgroundColor: '#fff', color: '#333', boxSizing: 'border-box' }}
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
            maxHeight: '200px',
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
                style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: '#333', borderBottom: '1px solid #f0f0f0' }}
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

export default memo(QuickEntrySection);
