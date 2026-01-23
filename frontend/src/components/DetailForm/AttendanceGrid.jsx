/**
 * AttendanceGrid - Personnel checklist for attendance tracking
 * 
 * Shows all active personnel with toggle checkboxes.
 * Compact layout sorted by rank.
 * Includes quick-add for new personnel.
 */

import { useMemo, useState } from 'react';
import { quickAddPersonnel } from '../../api';

export default function AttendanceGrid({ personnel, attendees, onToggle, onMarkAll, onClearAll, onPersonnelAdded }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddError, setQuickAddError] = useState('');
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  // Sort personnel by rank order, then last name
  const sortedPersonnel = useMemo(() => {
    return [...personnel]
      .filter(p => {
        if (!searchTerm) return true;
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        return fullName.includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => {
        const rankDiff = (a.rank_order || 999) - (b.rank_order || 999);
        if (rankDiff !== 0) return rankDiff;
        return `${a.last_name}, ${a.first_name}`.localeCompare(`${b.last_name}, ${b.first_name}`);
      });
  }, [personnel, searchTerm]);

  const presentCount = attendees.length;
  const totalCount = personnel.length;

  // Quick add handler
  const handleQuickAdd = async () => {
    const name = quickAddName.trim();
    if (!name) return;

    // Parse name - expect "First Last" or "Last, First"
    let firstName, lastName;
    if (name.includes(',')) {
      const parts = name.split(',').map(s => s.trim());
      lastName = parts[0];
      firstName = parts[1] || '';
    } else {
      const parts = name.split(' ').filter(s => s);
      if (parts.length === 1) {
        firstName = parts[0];
        lastName = '';
      } else {
        firstName = parts[0];
        lastName = parts.slice(1).join(' ');
      }
    }

    if (!firstName) {
      setQuickAddError('Enter a name');
      return;
    }

    setQuickAddLoading(true);
    setQuickAddError('');

    try {
      const res = await quickAddPersonnel(firstName, lastName);
      const newPerson = res.data.personnel;
      
      // Notify parent to refresh personnel list and mark as present
      if (onPersonnelAdded) {
        onPersonnelAdded(newPerson);
      }
      
      setQuickAddName('');
      
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
    <div className="bg-dark-hover rounded-lg p-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {presentCount}/{totalCount} present
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter..."
            className="form-control text-xs py-1 px-2 w-28"
          />
          <button
            onClick={onMarkAll}
            className="text-xs px-2 py-1 bg-green-600/30 text-green-300 border border-green-600 rounded hover:bg-green-600/50"
          >
            All
          </button>
          <button
            onClick={onClearAll}
            className="text-xs px-2 py-1 bg-dark-border text-gray-400 rounded hover:bg-dark-card"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Compact personnel list */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 max-h-64 overflow-y-auto">
        {sortedPersonnel.map(person => {
          const isPresent = attendees.includes(person.id);
          
          return (
            <label
              key={person.id}
              className="flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <input
                type="checkbox"
                checked={isPresent}
                onChange={() => onToggle(person.id)}
                className="h-3 w-3"
              />
              <span className={`text-xs ${isPresent ? 'text-green-300' : 'text-gray-400'}`}>
                {person.rank_abbreviation ? `${person.rank_abbreviation} ` : ''}{person.last_name}, {person.first_name}
              </span>
            </label>
          );
        })}

        {sortedPersonnel.length === 0 && (
          <div className="text-xs text-gray-500 py-2">
            {searchTerm ? 'No match' : 'No personnel'}
          </div>
        )}
      </div>

      {/* Quick add */}
      <div className="mt-3 pt-2 border-t border-dark-border">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={quickAddName}
            onChange={(e) => { setQuickAddName(e.target.value); setQuickAddError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
            placeholder="Add: First Last"
            className="form-control text-xs py-1 px-2 flex-1"
          />
          <button
            onClick={handleQuickAdd}
            disabled={quickAddLoading || !quickAddName.trim()}
            className="text-xs px-2 py-1 bg-blue-600/30 text-blue-300 border border-blue-600 rounded hover:bg-blue-600/50 disabled:opacity-50"
          >
            {quickAddLoading ? '...' : 'Add'}
          </button>
        </div>
        {quickAddError && (
          <div className="text-xs text-yellow-400 mt-1">{quickAddError}</div>
        )}
      </div>
    </div>
  );
}
