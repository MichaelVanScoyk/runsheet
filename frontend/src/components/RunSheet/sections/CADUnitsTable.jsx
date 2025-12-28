import { useState, useMemo } from 'react';
import { useRunSheet } from '../RunSheetContext';
import { formatTimeLocal } from '../../../utils/timeUtils';

// Sort indicator component
function SortIndicator({ active, direction }) {
  if (!active) {
    return (
      <span className="ml-1 text-gray-600 opacity-50">⇅</span>
    );
  }
  return (
    <span className="ml-1 text-accent-red">
      {direction === 'asc' ? '↑' : '↓'}
    </span>
  );
}

export default function CADUnitsTable() {
  const { formData } = useRunSheet();
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'asc' });
  
  if (!formData.cad_units || formData.cad_units.length === 0) return null;
  
  // Enable sorting when more than 3 units
  const sortingEnabled = formData.cad_units.length > 3;
  
  const formatTime = (isoString) => {
    if (!isoString) return '-';
    return formatTimeLocal(isoString, true) || '-';  // Include seconds
  };
  
  // Check if a unit's time matches the incident metric time
  // Normalize both to YYYY-MM-DDTHH:MM:SS format for comparison
  const timesMatch = (unitTime, metricTime) => {
    if (!unitTime || !metricTime) return false;
    // Extract YYYY-MM-DDTHH:MM:SS from both, padding seconds if missing
    const normalizeTime = (t) => {
      if (!t) return '';
      // Try with seconds first: YYYY-MM-DDTHH:MM:SS
      const matchSec = t.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
      if (matchSec) return `${matchSec[1]}T${matchSec[2]}`;
      // Fallback without seconds: YYYY-MM-DDTHH:MM -> add :00
      const matchNoSec = t.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      if (matchNoSec) return `${matchNoSec[1]}T${matchNoSec[2]}:00`;
      return t.slice(0, 19);
    };
    return normalizeTime(unitTime) === normalizeTime(metricTime);
  };
  
  // Handle column header click for sorting
  const handleSort = (field) => {
    if (!sortingEnabled) return;
    
    setSortConfig(prev => {
      if (prev.field === field) {
        // Toggle direction, or clear if already descending
        if (prev.direction === 'asc') {
          return { field, direction: 'desc' };
        } else {
          return { field: null, direction: 'asc' }; // Clear sort
        }
      }
      // New field, start with ascending
      return { field, direction: 'asc' };
    });
  };
  
  // Sorted units based on current sort configuration
  const sortedUnits = useMemo(() => {
    if (!sortConfig.field || !sortingEnabled) {
      return formData.cad_units;
    }
    
    return [...formData.cad_units].sort((a, b) => {
      let aVal, bVal;
      
      switch (sortConfig.field) {
        case 'unit_id':
          aVal = (a.unit_id || '').toLowerCase();
          bVal = (b.unit_id || '').toLowerCase();
          break;
        case 'time_dispatched':
        case 'time_enroute':
        case 'time_arrived':
        case 'time_cleared':
          // For time fields, treat null/empty as "infinite" so they sort to end
          aVal = a[sortConfig.field] || '';
          bVal = b[sortConfig.field] || '';
          // Empty values go to end regardless of sort direction
          if (!aVal && bVal) return 1;
          if (aVal && !bVal) return -1;
          if (!aVal && !bVal) return 0;
          break;
        case 'type':
          // Sort by mutual aid status (Station 48 first, then Mutual Aid)
          aVal = a.is_mutual_aid ? 1 : 0;
          bVal = b.is_mutual_aid ? 1 : 0;
          break;
        default:
          return 0;
      }
      
      // Compare values
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [formData.cad_units, sortConfig, sortingEnabled]);
  
  // Column definitions for sortable headers
  const columns = [
    { key: 'unit_id', label: 'Unit' },
    { key: 'time_dispatched', label: 'Dispatched' },
    { key: 'time_enroute', label: 'Enroute' },
    { key: 'time_arrived', label: 'Arrived' },
    { key: 'time_cleared', label: 'Cleared' },
    { key: 'type', label: 'Type' },
  ];
  
  return (
    <div className="pt-3 border-t border-dark-border">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-accent-red text-sm font-semibold">
          CAD Units ({formData.cad_units.length})
        </h4>
        {sortingEnabled && sortConfig.field && (
          <button
            onClick={() => setSortConfig({ field: null, direction: 'asc' })}
            className="text-xs text-gray-400 hover:text-accent-red transition-colors"
          >
            Clear Sort
          </button>
        )}
      </div>
      {sortingEnabled && (
        <p className="text-xs text-gray-500 mb-2">Click column headers to sort</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-dark-border text-accent-red text-xs uppercase">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-2 py-1.5 text-left ${sortingEnabled ? 'cursor-pointer hover:bg-dark-hover select-none' : ''}`}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center">
                    {col.label}
                    {sortingEnabled && (
                      <SortIndicator
                        active={sortConfig.field === col.key}
                        direction={sortConfig.direction}
                      />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedUnits.map((unit, idx) => {
              // Only highlight enroute/arrived for units that count for response times
              const countsForMetrics = unit.counts_for_response_times !== false;
              const isFirstDispatch = countsForMetrics && timesMatch(unit.time_dispatched, formData.time_dispatched);
              const isFirstEnroute = countsForMetrics && timesMatch(unit.time_enroute, formData.time_first_enroute);
              const isFirstArrived = countsForMetrics && timesMatch(unit.time_arrived, formData.time_first_on_scene);
              // Cleared highlights for any unit that matches
              const isLastCleared = timesMatch(unit.time_cleared, formData.time_last_cleared);
              
              const highlightClass = 'text-green-400 font-semibold';
              
              return (
                <tr 
                  key={`${unit.unit_id}-${idx}`} 
                  className={unit.is_mutual_aid ? 'bg-status-completed/10 border-x-2 border-status-completed' : 'bg-status-open/10 border-x-2 border-status-open'}
                >
                  <td className="px-2 py-1.5 border-b border-dark-border">
                    <span className="font-semibold">{unit.unit_id}</span>
                    {unit.is_mutual_aid && (
                      <span className="ml-1.5 bg-status-completed text-white text-[10px] px-1 py-0.5 rounded font-semibold">
                        MA
                      </span>
                    )}
                  </td>
                  <td className={`px-2 py-1.5 border-b border-dark-border ${isFirstDispatch ? highlightClass : 'text-gray-400'}`}>{formatTime(unit.time_dispatched)}</td>
                  <td className={`px-2 py-1.5 border-b border-dark-border ${isFirstEnroute ? highlightClass : 'text-gray-400'}`}>{formatTime(unit.time_enroute)}</td>
                  <td className={`px-2 py-1.5 border-b border-dark-border ${isFirstArrived ? highlightClass : 'text-gray-400'}`}>{formatTime(unit.time_arrived)}</td>
                  <td className={`px-2 py-1.5 border-b border-dark-border ${isLastCleared ? highlightClass : 'text-gray-400'}`}>{formatTime(unit.time_cleared)}</td>
                  <td className="px-2 py-1.5 border-b border-dark-border text-gray-400">{unit.is_mutual_aid ? 'Mutual Aid' : 'Station 48'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
