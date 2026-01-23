/**
 * AttendanceGrid - Personnel checklist for attendance tracking
 * 
 * Shows all active personnel with toggle checkboxes.
 * Includes "Mark All" and "Clear All" buttons.
 * Groups by rank for easier scanning.
 */

import { useMemo, useState } from 'react';

export default function AttendanceGrid({ personnel, attendees, onToggle, onMarkAll, onClearAll }) {
  const [searchTerm, setSearchTerm] = useState('');

  // Group personnel by rank, sorted by rank display_order
  const groupedPersonnel = useMemo(() => {
    // Filter by search term
    const filtered = personnel.filter(p => {
      if (!searchTerm) return true;
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
      return fullName.includes(searchTerm.toLowerCase());
    });

    // Group by rank
    const groups = {};
    filtered.forEach(p => {
      const rankName = p.rank_name || 'No Rank';
      if (!groups[rankName]) {
        groups[rankName] = {
          rankName,
          displayOrder: p.rank_order || 999,
          members: []
        };
      }
      groups[rankName].members.push(p);
    });

    // Sort groups by display order, then sort members alphabetically within each group
    return Object.values(groups)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(group => ({
        ...group,
        members: group.members.sort((a, b) => 
          `${a.last_name}, ${a.first_name}`.localeCompare(`${b.last_name}, ${b.first_name}`)
        )
      }));
  }, [personnel, searchTerm]);

  const presentCount = attendees.length;
  const totalCount = personnel.length;

  return (
    <div className="bg-dark-hover rounded-lg p-4">
      {/* Header with count and actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-gray-300">Attendance</h3>
          <span className="text-xs px-2 py-1 rounded bg-dark-border text-gray-400">
            {presentCount} / {totalCount} present
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Search */}
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="form-control text-sm py-1 px-2 w-40"
          />
          
          {/* Actions */}
          <button
            onClick={onMarkAll}
            className="btn btn-sm bg-green-600/30 text-green-300 border border-green-600 hover:bg-green-600/50"
          >
            Mark All
          </button>
          <button
            onClick={onClearAll}
            className="btn btn-sm bg-dark-border text-gray-300 hover:bg-dark-hover"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Personnel grid grouped by rank */}
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {groupedPersonnel.map(group => (
          <div key={group.rankName}>
            {/* Rank header */}
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2 sticky top-0 bg-dark-hover py-1">
              {group.rankName} ({group.members.filter(m => attendees.includes(m.id)).length}/{group.members.length})
            </div>
            
            {/* Members grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
              {group.members.map(person => {
                const isPresent = attendees.includes(person.id);
                
                return (
                  <label
                    key={person.id}
                    className={`
                      flex items-center gap-2 p-2 rounded cursor-pointer transition-colors
                      ${isPresent 
                        ? 'bg-green-900/30 border border-green-600/50' 
                        : 'bg-dark-card hover:bg-dark-border'}
                    `}
                  >
                    <input
                      type="checkbox"
                      checked={isPresent}
                      onChange={() => onToggle(person.id)}
                      className="form-checkbox h-4 w-4 rounded border-gray-600 bg-dark-card text-green-500 focus:ring-green-500 focus:ring-offset-0"
                    />
                    <span className={`text-sm truncate ${isPresent ? 'text-green-300' : 'text-gray-300'}`}>
                      {person.last_name}, {person.first_name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        {groupedPersonnel.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            {searchTerm ? 'No matching personnel found' : 'No active personnel'}
          </div>
        )}
      </div>
    </div>
  );
}
