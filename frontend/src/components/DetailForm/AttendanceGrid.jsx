/**
 * AttendanceGrid - Personnel checklist for attendance tracking
 * 
 * Shows all active personnel with toggle checkboxes.
 * Compact layout: ranked personnel first (alpha), then unranked (alpha).
 * Includes quick-add for new personnel.
 */

import { useMemo, useState } from 'react';
import { quickAddPersonnel } from '../../api';

export default function AttendanceGrid({ personnel, attendees, onToggle, onMarkAll, onClearAll, onPersonnelAdded }) {
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
        
        // Ranked first
        if (aHasRank && !bHasRank) return -1;
        if (!aHasRank && bHasRank) return 1;
        
        // Within same group, alpha by last name
        return `${a.last_name}, ${a.first_name}`.localeCompare(`${b.last_name}, ${b.first_name}`);
      });
  }, [personnel, searchTerm]);

  const presentCount = attendees.length;
  const totalCount = personnel.length;

  // Quick add handler
  const handleQuickAdd = async () => {
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
            className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
          >
            All
          </button>
          <button
            onClick={onClearAll}
            className="text-xs px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
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
              <span className={`text-xs ${isPresent ? 'text-green-400 font-medium' : 'text-gray-400'}`}>
                {person.last_name}, {person.first_name}
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
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); setQuickAddError(''); }}
            placeholder="First Name"
            className="form-control text-xs py-1 px-2 w-28"
          />
          <input
            type="text"
            value={lastName}
            onChange={(e) => { setLastName(e.target.value); setQuickAddError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
            placeholder="Last Name"
            className="form-control text-xs py-1 px-2 w-28"
          />
          <button
            onClick={handleQuickAdd}
            disabled={quickAddLoading || !firstName.trim()}
            className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
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
