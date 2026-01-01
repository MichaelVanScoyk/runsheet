import { useState } from 'react';

// Dynamic growing list component for Direct/Station virtual units
// CRITICAL: Assignment logic must not change
export default function DynamicPersonnelList({ 
  label, 
  assignedIds, 
  onUpdate, 
  allPersonnel, 
  getAssignedIds,
  lightMode = false 
}) {
  const [searchText, setSearchText] = useState('');
  const [showDropdown, setShowDropdown] = useState(null);

  // Filter out nulls to get actual assigned people
  const assigned = (assignedIds || []).filter(id => id !== null);

  // Get all assigned IDs across entire form
  const globalAssigned = getAssignedIds();

  // Available personnel: not assigned elsewhere, or is current selection
  const getAvailable = (currentIdx) => {
    const currentValue = assigned[currentIdx];
    return allPersonnel.filter(p => {
      if (p.id === currentValue) return true;
      return !globalAssigned.has(p.id);
    });
  };

  // Filter by search text
  const getFiltered = (currentIdx) => {
    const available = getAvailable(currentIdx);
    if (!searchText) return available;
    const lower = searchText.toLowerCase();
    return available.filter(p => 
      p.last_name.toLowerCase().includes(lower) || 
      p.first_name.toLowerCase().includes(lower)
    );
  };

  const handleSelect = (idx, personnelId) => {
    const newList = [...assigned];
    if (idx >= newList.length) {
      newList.push(personnelId);
    } else {
      newList[idx] = personnelId;
    }
    onUpdate(newList);
    setSearchText('');
    setShowDropdown(null);
  };

  const handleRemove = (idx) => {
    const newList = assigned.filter((_, i) => i !== idx);
    onUpdate(newList);
  };

  const getPersonName = (id) => {
    const p = allPersonnel.find(x => x.id === id);
    return p ? `${p.last_name}, ${p.first_name}` : '?';
  };

  // Light mode styles (for white background modals)
  if (lightMode) {
    return (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Existing assignments */}
          {assigned.map((personId, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                flex: 1,
                padding: '6px 10px',
                backgroundColor: '#e9ecef',
                borderRadius: '4px',
                fontSize: '13px',
                color: '#333',
              }}>
                {getPersonName(personId)}
              </span>
              <button 
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: '#dc3545',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onClick={() => handleRemove(idx)}
              >
                ×
              </button>
            </div>
          ))}
          
          {/* New entry field */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="+ Add..."
              value={showDropdown === assigned.length ? searchText : ''}
              onChange={(e) => setSearchText(e.target.value)}
              onFocus={() => setShowDropdown(assigned.length)}
              onBlur={() => setTimeout(() => setShowDropdown(null), 200)}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px dashed #ccc',
                borderRadius: '4px',
                fontSize: '13px',
                backgroundColor: '#fff',
                color: '#333',
                boxSizing: 'border-box',
              }}
            />
            {showDropdown === assigned.length && (
              <div style={{
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
              }}>
                {getFiltered(assigned.length).slice(0, 10).map(p => (
                  <div
                    key={p.id}
                    style={{
                      padding: '8px 10px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#333',
                      borderBottom: '1px solid #f0f0f0',
                    }}
                    onMouseDown={() => handleSelect(assigned.length, p.id)}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  >
                    {p.last_name}, {p.first_name}
                  </div>
                ))}
                {getFiltered(assigned.length).length === 0 && (
                  <div style={{ padding: '8px 10px', color: '#999', fontSize: '13px', fontStyle: 'italic' }}>
                    No matches
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Dark mode (original)
  return (
    <div className="bg-dark-card rounded-md p-3 border border-dark-border">
      <div className="text-accent-red font-semibold text-sm mb-2 pb-2 border-b border-dark-border">
        {label}
      </div>
      <div className="flex flex-col gap-2">
        {/* Existing assignments */}
        {assigned.map((personId, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="flex-1 px-2 py-1 bg-dark-border rounded text-white text-sm">
              {getPersonName(personId)}
            </span>
            <button 
              className="bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded text-sm flex items-center justify-center"
              onClick={() => handleRemove(idx)}
            >
              ×
            </button>
          </div>
        ))}
        
        {/* New entry field - always show one empty slot */}
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            placeholder="+ Add..."
            value={showDropdown === assigned.length ? searchText : ''}
            onChange={(e) => setSearchText(e.target.value)}
            onFocus={() => setShowDropdown(assigned.length)}
            onBlur={() => setTimeout(() => setShowDropdown(null), 200)}
            className="flex-1 px-2 py-1 bg-dark-hover border border-dashed border-dark-border rounded text-white text-sm placeholder-gray-600 focus:outline-none focus:border-accent-red focus:border-solid"
          />
          {showDropdown === assigned.length && (
            <div className="absolute top-full left-0 right-0 mt-0.5 bg-dark-bg border border-dark-border rounded max-h-48 overflow-y-auto z-50 shadow-lg">
              {getFiltered(assigned.length).slice(0, 10).map(p => (
                <div
                  key={p.id}
                  className="px-2 py-1.5 cursor-pointer text-sm text-gray-400 hover:bg-dark-border hover:text-white"
                  onMouseDown={() => handleSelect(assigned.length, p.id)}
                >
                  {p.last_name}, {p.first_name}
                </div>
              ))}
              {getFiltered(assigned.length).length === 0 && (
                <div className="px-2 py-1.5 text-gray-500 text-sm italic">No matches</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
