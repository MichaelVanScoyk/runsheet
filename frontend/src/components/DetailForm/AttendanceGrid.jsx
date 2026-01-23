/**
 * AttendanceGrid - Personnel checklist for attendance tracking
 * 
 * Shows all active personnel with toggle checkboxes.
 * Columns with checkbox in front of name.
 * Ranked personnel first (alpha), then unranked (alpha).
 * Includes quick-add for new personnel.
 */

import { useMemo, useState } from 'react';
import { quickAddPersonnel } from '../../api';

export default function AttendanceGrid({ personnel, attendees, onToggle, onPersonnelAdded, disabled }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [quickAddError, setQuickAddError] = useState('');
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  // Sort: ranked first (alpha by last name), then unranked (alpha by last name)
  const sortedPersonnel = useMemo(() => {
    return [...personnel]
      .filter(p => {
        if (!searchTerm) return true;
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        return fullName.includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => {
        const aHasRank = a.rank_id != null;
        const bHasRank = b.rank_id != null;
        
        if (aHasRank && !bHasRank) return -1;
        if (!aHasRank && bHasRank) return 1;
        
        return `${a.last_name}, ${a.first_name}`.localeCompare(`${b.last_name}, ${b.first_name}`);
      });
  }, [personnel, searchTerm]);

  const presentCount = attendees.length;
  const totalCount = personnel.length;

  const handleQuickAdd = async () => {
    if (disabled) return;
    
    const first = firstName.trim();
    const last = lastName.trim();
    
    if (!first) {
      setQuickAddError('First name required');
      return;
    }

    setQuickAddLoading(true);
    setQuickAddError('');

    try {
      const res = await quickAddPersonnel(first, last);
      const newPerson = res.data.personnel;
      
      if (onPersonnelAdded) {
        onPersonnelAdded(newPerson);
      }
      
      setFirstName('');
      setLastName('');
      
      if (res.data.status === 'exists') {
        setQuickAddError(`${newPerson.display_name} already exists`);
      }
    } catch (err) {
      setQuickAddError(err.response?.data?.detail || 'Failed to add');
    } finally {
      setQuickAddLoading(false);
    }
  };

  return (
    <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', color: '#666' }}>
          {presentCount}/{totalCount} present
        </span>
        
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter..."
            style={{ 
              fontSize: '12px', 
              padding: '4px 24px 4px 8px', 
              width: '120px', 
              border: '1px solid #ccc', 
              borderRadius: '4px' 
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '4px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#999',
                padding: '0 4px',
                lineHeight: '1'
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Personnel columns */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '2px 16px',
        maxHeight: '400px',
        overflowY: 'auto'
      }}>
        {sortedPersonnel.map(person => {
          const isPresent = attendees.includes(person.id);
          
          return (
            <label
              key={person.id}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                cursor: disabled ? 'not-allowed' : 'pointer',
                padding: '2px 0',
                fontSize: '13px',
                color: isPresent ? '#16a34a' : '#333',
                fontWeight: isPresent ? '500' : 'normal',
                opacity: disabled ? 0.7 : 1
              }}
            >
              <input
                type="checkbox"
                checked={isPresent}
                onChange={() => !disabled && onToggle(person.id)}
                disabled={disabled}
                style={{ width: '14px', height: '14px', cursor: disabled ? 'not-allowed' : 'pointer' }}
              />
              {person.last_name}, {person.first_name}
            </label>
          );
        })}
      </div>

      {sortedPersonnel.length === 0 && (
        <div style={{ fontSize: '12px', color: '#999', padding: '8px 0' }}>
          {searchTerm ? 'No match' : 'No personnel'}
        </div>
      )}

      {/* Quick add - hidden when disabled */}
      {!disabled && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #ddd' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setQuickAddError(''); }}
              placeholder="First Name"
              style={{ fontSize: '12px', padding: '4px 8px', width: '120px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
              type="text"
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); setQuickAddError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
              placeholder="Last Name"
              style={{ fontSize: '12px', padding: '4px 8px', width: '120px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <button
              onClick={handleQuickAdd}
              disabled={quickAddLoading || !firstName.trim()}
              style={{ 
                fontSize: '12px', 
                padding: '4px 12px', 
                background: quickAddLoading || !firstName.trim() ? '#9ca3af' : '#2563eb', 
                color: '#fff', 
                border: 'none', 
                borderRadius: '4px', 
                cursor: quickAddLoading || !firstName.trim() ? 'default' : 'pointer' 
              }}
            >
              {quickAddLoading ? '...' : 'Add'}
            </button>
          </div>
          {quickAddError && (
            <div style={{ fontSize: '12px', color: '#ca8a04', marginTop: '4px' }}>{quickAddError}</div>
          )}
        </div>
      )}
    </div>
  );
}
