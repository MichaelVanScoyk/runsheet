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
  showNarrative = true,
}) {
  // ==========================================================================
  // SLOT COUNT FILTER - Also exists in:
  //   - frontend/src/components/RunSheet/sections/PersonnelGrid.jsx
  //   - backend/report_engine/renderers.py (_render_apparatus_grid)
  // TODO: If touching this logic again, consolidate into shared helper function
  // ==========================================================================
  const getSlotCount = (unit) => (unit.has_driver ? 1 : 0) + (unit.has_officer ? 1 : 0) + (unit.ff_slots || 0);
  
  const apparatusUnits = dispatchedApparatus
    .filter(a => a.unit_category === 'APPARATUS' || !a.unit_category)
    .filter(a => getSlotCount(a) > 0);  // Exclude 0-slot units (CHF48, FP48, etc.)

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

  // Don't render anything if no units and no narrative to show
  if (apparatusUnits.length === 0 && !showNarrative) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Unit Assignments - always show if there are dispatched units */}
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

      {/* Narrative Fields - only show when closed */}
      {showNarrative && (
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
                spellCheck={true}
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
                spellCheck={true}
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
              spellCheck={true}
              style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical', fontFamily: 'inherit', backgroundColor: '#fff', color: '#333', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px', marginTop: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '4px' }}>Problems/Issues</label>
              <textarea
                rows={2}
                placeholder="Any problems encountered..."
                value={formData.problems_issues || ''}
                onChange={(e) => onFormChange('problems_issues', e.target.value)}
                spellCheck={true}
                style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical', fontFamily: 'inherit', backgroundColor: '#fff', color: '#333', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '4px' }}>Equipment Used</label>
              <textarea
                rows={2}
                placeholder="Halligan, Pike Pole, Chain Saw..."
                value={Array.isArray(formData.equipment_used) ? formData.equipment_used.join(', ') : (formData.equipment_used || '')}
                onChange={(e) => onFormChange('equipment_used', e.target.value)}
                spellCheck={true}
                style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical', fontFamily: 'inherit', backgroundColor: '#fff', color: '#333', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Officer Fields - always show when QuickEntrySection is visible */}
      {showNarrative && (
        <div style={{ backgroundColor: '#fff', borderRadius: '4px', padding: '12px', border: '1px solid #ddd' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: primaryColor }}>Report Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '4px' }}>Officer in Charge</label>
              <OfficerSelect
                value={formData.officer_in_charge || ''}
                personnel={allPersonnel}
                onSelect={(personId) => onFormChange('officer_in_charge', personId)}
                onClear={() => onFormChange('officer_in_charge', '')}
                placeholder="Select officer..."
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '4px' }}>Report Completed By</label>
              <OfficerSelect
                value={formData.completed_by || ''}
                personnel={allPersonnel}
                onSelect={(personId) => onFormChange('completed_by', personId)}
                onClear={() => onFormChange('completed_by', '')}
                placeholder="Select person..."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * OfficerSelect - Single-person select for Officer in Charge / Completed By
 * Shows full personnel list (no exclusions), allows one selection with clear button
 */
function OfficerSelect({ value, personnel, onSelect, onClear, placeholder = 'Select...' }) {
  const [searchText, setSearchText] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState(null);

  // Normalize value to number for comparison
  const valueNum = value ? parseInt(value) : null;
  const currentPerson = valueNum ? personnel.find(p => p.id === valueNum) : null;
  const displayValue = showDropdown ? searchText : (currentPerson ? `${currentPerson.last_name}, ${currentPerson.first_name}` : '');

  const filtered = personnel.filter(p => {
    if (!searchText) return true;
    const lower = searchText.toLowerCase();
    return p.last_name.toLowerCase().includes(lower) || p.first_name.toLowerCase().includes(lower);
  });

  const handleSelect = (person) => {
    onSelect(person.id);
    setSearchText('');
    setShowDropdown(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <input
          type="text"
          value={displayValue}
          placeholder={placeholder}
          onChange={(e) => {
            setSearchText(e.target.value);
            if (!showDropdown) setShowDropdown(true);
          }}
          onFocus={(e) => {
            const rect = e.target.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
            setShowDropdown(true);
            setSearchText('');
          }}
          onBlur={() => setTimeout(() => {
            setShowDropdown(false);
            setSearchText('');
          }, 200)}
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff', color: '#333', boxSizing: 'border-box' }}
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
            {filtered.slice(0, 50).map(p => (
              <div
                key={p.id}
                onMouseDown={() => handleSelect(p)}
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
      {value && !showDropdown && (
        <button
          onClick={onClear}
          style={{ flexShrink: 0, backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', width: '22px', height: '22px', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          type="button"
        >
          ×
        </button>
      )}
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
