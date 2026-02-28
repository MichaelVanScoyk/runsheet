import { useState, useMemo, useCallback } from 'react';
import { useRunSheet } from '../RunSheetContext';
import { useBranding } from '../../../contexts/BrandingContext';
import { formatTimeLocal, formatDateTimeLocal } from '../../../utils/timeUtils';
import { updateCadUnits } from '../../../api';
import { useToast } from '../../../contexts/ToastContext';

// Sort indicator component
function SortIndicator({ active, direction }) {
  if (!active) {
    return (
      <span className="ml-1 text-theme-hint opacity-50">⇅</span>
    );
  }
  return (
    <span className="ml-1 text-accent-red">
      {direction === 'asc' ? '↑' : '↓'}
    </span>
  );
}

/**
 * Convert a datetime-local input value (station local) to UTC ISO string.
 * datetime-local gives us "YYYY-MM-DDTHH:MM" in the browser's local time,
 * but we need it in station timezone → UTC.
 */
function localInputToUtc(localValue, stationTimezone = 'America/New_York') {
  if (!localValue) return null;
  
  // Build a date string that's explicitly in the station timezone
  // datetime-local gives us "2025-01-15T14:23" format
  const parts = localValue.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!parts) return null;
  
  const [, year, month, day, hour, minute] = parts;
  
  // Create date in station timezone using Intl to find the UTC offset
  const stationDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
  
  // Use a trick: format the same instant in both UTC and station TZ to find offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: stationTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  
  // Try different UTC times until the station-local representation matches
  // Simple approach: assume the input IS in station time, compute UTC
  const tempDate = new Date(Date.UTC(
    parseInt(year), parseInt(month) - 1, parseInt(day),
    parseInt(hour), parseInt(minute), 0
  ));
  
  // Get what this UTC time looks like in station timezone
  const stationParts = formatter.formatToParts(tempDate);
  const get = (type) => stationParts.find(p => p.type === type)?.value || '00';
  const stationHour = parseInt(get('hour'));
  const stationMinute = parseInt(get('minute'));
  const inputHour = parseInt(hour);
  const inputMinute = parseInt(minute);
  
  // Calculate the offset (station_displayed - input_desired = adjustment needed)
  let hourDiff = stationHour - inputHour;
  // Handle day boundary
  if (hourDiff > 12) hourDiff -= 24;
  if (hourDiff < -12) hourDiff += 24;
  
  // Adjust: subtract the difference to get the correct UTC
  const corrected = new Date(tempDate.getTime() - hourDiff * 3600000 - (stationMinute - inputMinute) * 60000);
  
  return corrected.toISOString();
}

/**
 * Convert UTC ISO string to datetime-local input value in station timezone.
 */
function utcToLocalInput(isoString, stationTimezone = 'America/New_York') {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date)) return '';
  
  const options = {
    timeZone: stationTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  };
  
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value || '00';
  
  // datetime-local format: YYYY-MM-DDTHH:MM
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}


export default function CADUnitsTable() {
  const { 
    formData, setFormData, incident, apparatus, userSession, 
    unlockedFields, toggleUnlock 
  } = useRunSheet();
  const branding = useBranding();
  const toast = useToast();
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'asc' });
  const [editedUnits, setEditedUnits] = useState(null); // null = not editing
  const [saving, setSaving] = useState(false);
  const [showAddRow, setShowAddRow] = useState(false);
  const [newUnitId, setNewUnitId] = useState('');
  
  const isAdmin = userSession?.role === 'ADMIN';
  const isEditing = unlockedFields['cad_units'] === true;
  
  // Units to display: edited copy when editing, formData when not
  const displayUnits = isEditing && editedUnits !== null ? editedUnits : (formData.cad_units || []);
  
  if (displayUnits.length === 0 && !isEditing) return null;
  
  // Enable sorting when more than 3 units and not editing
  const sortingEnabled = displayUnits.length > 3 && !isEditing;
  
  const formatTime = (isoString) => {
    if (!isoString) return '-';
    return formatTimeLocal(isoString, true) || '-';
  };
  
  // Check if a unit's time matches the incident metric time
  const timesMatch = (unitTime, metricTime) => {
    if (!unitTime || !metricTime) return false;
    const normalizeTime = (t) => {
      if (!t) return '';
      const matchSec = t.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
      if (matchSec) return `${matchSec[1]}T${matchSec[2]}`;
      const matchNoSec = t.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      if (matchNoSec) return `${matchNoSec[1]}T${matchNoSec[2]}:00`;
      return t.slice(0, 19);
    };
    return normalizeTime(unitTime) === normalizeTime(metricTime);
  };
  
  // Handle sort
  const handleSort = (field) => {
    if (!sortingEnabled) return;
    setSortConfig(prev => {
      if (prev.field === field) {
        if (prev.direction === 'asc') return { field, direction: 'desc' };
        return { field: null, direction: 'asc' };
      }
      return { field, direction: 'asc' };
    });
  };
  
  // Sorted units
  const sortedUnits = useMemo(() => {
    if (!sortConfig.field || !sortingEnabled) return displayUnits;
    
    return [...displayUnits].sort((a, b) => {
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
          aVal = a[sortConfig.field] || '';
          bVal = b[sortConfig.field] || '';
          if (!aVal && bVal) return 1;
          if (aVal && !bVal) return -1;
          if (!aVal && !bVal) return 0;
          break;
        case 'type':
          aVal = a.is_mutual_aid ? 1 : 0;
          bVal = b.is_mutual_aid ? 1 : 0;
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [displayUnits, sortConfig, sortingEnabled]);
  
  // ----------- EDITING LOGIC -----------
  
  const handleUnlockToggle = () => {
    if (!isEditing) {
      // Opening edit: clone current units
      setEditedUnits(JSON.parse(JSON.stringify(formData.cad_units || [])));
      setShowAddRow(false);
      setNewUnitId('');
    } else {
      // Closing edit: discard changes
      setEditedUnits(null);
      setShowAddRow(false);
      setNewUnitId('');
    }
    toggleUnlock('cad_units');
  };
  
  const handleTimeChange = (unitIndex, field, localValue) => {
    if (!editedUnits) return;
    const updated = [...editedUnits];
    updated[unitIndex] = {
      ...updated[unitIndex],
      [field]: localValue ? localInputToUtc(localValue) : null,
      source: updated[unitIndex].source === 'ADMIN_OVERRIDE' 
        ? 'ADMIN_OVERRIDE' 
        : 'ADMIN_TIMES_MODIFIED',
    };
    setEditedUnits(updated);
  };
  
  const handleRemoveUnit = (unitIndex) => {
    if (!editedUnits) return;
    const updated = editedUnits.filter((_, i) => i !== unitIndex);
    setEditedUnits(updated);
  };
  
  const handleAddUnit = () => {
    if (!newUnitId || !editedUnits) return;
    
    // Look up apparatus info
    const app = apparatus.find(a => a.unit_designator === newUnitId);
    
    const newUnit = {
      unit_id: newUnitId,
      station: null,
      agency: null,
      is_mutual_aid: app ? false : true,  // If found in our apparatus, it's ours
      apparatus_id: app?.id || null,
      unit_category: app?.unit_category || null,
      counts_for_response_times: app?.counts_for_response_times ?? false,
      time_dispatched: null,
      time_enroute: null,
      time_arrived: null,
      time_available: null,
      time_cleared: null,
      source: 'ADMIN_OVERRIDE',
    };
    
    setEditedUnits([...editedUnits, newUnit]);
    setNewUnitId('');
    setShowAddRow(false);
  };
  
  const handleSave = async () => {
    if (!incident?.id || !editedUnits) return;
    
    setSaving(true);
    try {
      await updateCadUnits(incident.id, editedUnits, userSession.personnel_id);
      
      // Update formData with new units
      setFormData(prev => ({ ...prev, cad_units: editedUnits }));
      
      // Re-fetch incident to get recalculated times
      const response = await fetch(`/api/incidents/${incident.id}`);
      const refreshed = await response.json();
      
      setFormData(prev => ({
        ...prev,
        cad_units: refreshed.cad_units || [],
        time_dispatched: refreshed.time_dispatched || '',
        time_first_enroute: refreshed.time_first_enroute || '',
        time_first_on_scene: refreshed.time_first_on_scene || '',
        time_last_cleared: refreshed.time_last_cleared || '',
      }));
      
      // Exit edit mode
      setEditedUnits(null);
      toggleUnlock('cad_units');
      toast.success('CAD units updated');
    } catch (err) {
      console.error('Failed to save CAD units:', err);
      const msg = err.response?.data?.detail || 'Failed to save CAD units';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };
  
  const hasChanges = useMemo(() => {
    if (!editedUnits) return false;
    return JSON.stringify(editedUnits) !== JSON.stringify(formData.cad_units || []);
  }, [editedUnits, formData.cad_units]);
  
  // Get apparatus options for "Add Unit" dropdown (exclude already-present units)
  const availableApparatus = useMemo(() => {
    const presentIds = new Set(displayUnits.map(u => u.unit_id));
    return apparatus
      .filter(a => a.active && !presentIds.has(a.unit_designator))
      .sort((a, b) => a.unit_designator.localeCompare(b.unit_designator));
  }, [apparatus, displayUnits]);
  
  // Column definitions
  const columns = [
    { key: 'unit_id', label: 'Unit' },
    { key: 'time_dispatched', label: 'Dispatched' },
    { key: 'time_enroute', label: 'Enroute' },
    { key: 'time_arrived', label: 'Arrived' },
    { key: 'time_cleared', label: 'Cleared' },
    { key: 'type', label: 'Type' },
  ];
  
  return (
    <div className="pt-3 border-t border-theme" data-help-id="cad_units_table">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-accent-red text-sm font-semibold flex items-center gap-1.5">
          CAD Units ({displayUnits.length})
          {/* Lock/unlock for admin */}
          {incident && (
            isAdmin ? (
              <button
                type="button"
                onClick={handleUnlockToggle}
                className="text-xs hover:text-yellow-500 transition-colors"
                title={isEditing ? "Discard changes & lock" : "Admin: Click to edit CAD units"}
              >
                {isEditing ? '🔓' : '🔒'}
              </button>
            ) : (
              <span className="text-xs opacity-50" title="Admin only">🔒</span>
            )
          )}
        </h4>
        <div className="flex items-center gap-2">
          {/* Add Unit button - only when editing */}
          {isEditing && (
            <button
              type="button"
              onClick={() => setShowAddRow(!showAddRow)}
              className="text-xs bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700 transition-colors font-semibold"
              title="Add a missing unit"
            >
              +
            </button>
          )}
          {/* Save / Cancel when editing with changes */}
          {isEditing && hasChanges && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-xs bg-blue-600 text-white px-2.5 py-0.5 rounded hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
          {/* Sort controls */}
          {sortingEnabled && sortConfig.field && (
            <button
              onClick={() => setSortConfig({ field: null, direction: 'asc' })}
              className="text-xs text-theme-muted hover:text-accent-red transition-colors"
            >
              Clear Sort
            </button>
          )}
        </div>
      </div>
      
      {/* Add Unit row */}
      {isEditing && showAddRow && (
        <div className="flex items-center gap-2 mb-2 p-2 bg-yellow-50 border border-yellow-300 rounded text-sm">
          <label className="text-xs text-gray-600 font-medium">Add Unit:</label>
          <select
            value={newUnitId}
            onChange={(e) => setNewUnitId(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
          >
            <option value="">Select apparatus...</option>
            {availableApparatus.map(a => (
              <option key={a.id} value={a.unit_designator}>
                {a.unit_designator} — {a.unit_category || 'Engine'}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddUnit}
            disabled={!newUnitId}
            className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-40 font-semibold"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setShowAddRow(false); setNewUnitId(''); }}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      )}
      
      {sortingEnabled && !isEditing && (
        <p className="text-xs text-theme-hint mb-2">Click column headers to sort</p>
      )}
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-theme-section text-accent-red text-xs uppercase">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-2 py-1.5 text-left border-b border-theme ${sortingEnabled ? 'cursor-pointer hover:bg-theme-hover select-none' : ''}`}
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
              {/* Delete column when editing */}
              {isEditing && <th className="px-2 py-1.5 border-b border-theme w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {sortedUnits.map((unit, idx) => {
              const countsForMetrics = unit.counts_for_response_times !== false;
              const isFirstDispatch = countsForMetrics && timesMatch(unit.time_dispatched, formData.time_dispatched);
              const isFirstEnroute = countsForMetrics && timesMatch(unit.time_enroute, formData.time_first_enroute);
              const isFirstArrived = countsForMetrics && timesMatch(unit.time_arrived, formData.time_first_on_scene);
              const isLastCleared = timesMatch(unit.time_cleared, formData.time_last_cleared);
              const highlightClass = 'text-green-700 font-semibold';
              
              // Override indicator
              const isOverride = unit.source === 'ADMIN_OVERRIDE' || unit.source === 'ADMIN_TIMES_MODIFIED';
              
              // Row styling
              let rowClass = unit.is_mutual_aid 
                ? 'bg-blue-50 border-x-2 border-blue-400' 
                : 'bg-green-50 border-x-2 border-green-400';
              if (isOverride) {
                rowClass = unit.is_mutual_aid
                  ? 'bg-yellow-50 border-x-2 border-yellow-400'
                  : 'bg-yellow-50 border-x-2 border-yellow-400';
              }
              
              // Find actual index in editedUnits (may differ from sorted display)
              const editIndex = isEditing && editedUnits
                ? editedUnits.findIndex(u => u.unit_id === unit.unit_id)
                : idx;
              
              return (
                <tr key={`${unit.unit_id}-${idx}`} className={rowClass}>
                  <td className="px-2 py-1.5 border-b border-theme">
                    <span className="font-semibold text-theme-primary">{unit.unit_id}</span>
                    {unit.is_mutual_aid && (
                      <span className="ml-1.5 bg-blue-600 text-white text-[10px] px-1 py-0.5 rounded font-semibold">
                        MA
                      </span>
                    )}
                    {isOverride && (
                      <span className="ml-1.5 bg-yellow-500 text-white text-[10px] px-1 py-0.5 rounded font-semibold" title="Manually edited">
                        ✏️
                      </span>
                    )}
                  </td>
                  
                  {/* Time cells: editable when unlocked, display when locked */}
                  {['time_dispatched', 'time_enroute', 'time_arrived', 'time_cleared'].map(field => {
                    const isHighlight = (
                      (field === 'time_dispatched' && isFirstDispatch) ||
                      (field === 'time_enroute' && isFirstEnroute) ||
                      (field === 'time_arrived' && isFirstArrived) ||
                      (field === 'time_cleared' && isLastCleared)
                    );
                    
                    if (isEditing) {
                      return (
                        <td key={field} className="px-1 py-1 border-b border-theme">
                          <input
                            type="datetime-local"
                            value={utcToLocalInput(unit[field])}
                            onChange={(e) => handleTimeChange(editIndex, field, e.target.value)}
                            className="text-xs w-full border border-gray-300 rounded px-1 py-0.5 bg-white"
                            step="60"
                          />
                        </td>
                      );
                    }
                    
                    return (
                      <td 
                        key={field} 
                        className={`px-2 py-1.5 border-b border-theme ${isHighlight ? highlightClass : 'text-theme-muted'}`}
                      >
                        {formatTime(unit[field])}
                      </td>
                    );
                  })}
                  
                  <td className="px-2 py-1.5 border-b border-theme text-theme-muted">
                    {unit.is_mutual_aid ? 'Mutual Aid' : `Station ${branding.stationNumber || ''}`}
                  </td>
                  
                  {/* Delete button when editing */}
                  {isEditing && (
                    <td className="px-1 py-1.5 border-b border-theme text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveUnit(editIndex)}
                        className="text-red-400 hover:text-red-600 text-sm"
                        title={`Remove ${unit.unit_id}`}
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
