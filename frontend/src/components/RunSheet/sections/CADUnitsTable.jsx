import { useState, useMemo } from 'react';
import { useRunSheet } from '../RunSheetContext';
import { useBranding } from '../../../contexts/BrandingContext';
import { formatTimeLocal, getStationTimezone } from '../../../utils/timeUtils';
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
 * Convert UTC ISO string to station-local parts: { date: "MM/DD/YYYY", time: "HH:MM:SS" }
 */
function utcToLocalParts(isoString) {
  if (!isoString) return { date: '', time: '' };
  const date = new Date(isoString);
  if (isNaN(date)) return { date: '', time: '' };
  
  const tz = getStationTimezone();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  
  const get = (type) => parts.find(p => p.type === type)?.value || '00';
  
  return {
    date: `${get('month')}/${get('day')}/${get('year')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

/**
 * Convert a date string (MM/DD/YYYY) + time string (HH:MM:SS) in station timezone to UTC ISO.
 */
function localPartsToUtc(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  
  // Parse time - accept HH:MM:SS or HH:MM
  const timeParts = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!timeParts) return null;
  
  const [, hStr, mStr, sStr] = timeParts;
  const h = parseInt(hStr);
  const m = parseInt(mStr);
  const s = parseInt(sStr || '0');
  if (h > 23 || m > 59 || s > 59) return null;
  
  // Parse date
  const dateParts = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!dateParts) return null;
  const [, mo, dy, yr] = dateParts;
  
  const tz = getStationTimezone();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  
  // Start with UTC guess, correct for offset
  const tempDate = new Date(Date.UTC(
    parseInt(yr), parseInt(mo) - 1, parseInt(dy), h, m, s
  ));
  
  const stationParts = formatter.formatToParts(tempDate);
  const get = (type) => stationParts.find(p => p.type === type)?.value || '00';
  const stationHour = parseInt(get('hour'));
  const stationMinute = parseInt(get('minute'));
  
  let hourDiff = stationHour - h;
  if (hourDiff > 12) hourDiff -= 24;
  if (hourDiff < -12) hourDiff += 24;
  
  const corrected = new Date(tempDate.getTime() - hourDiff * 3600000 - (stationMinute - m) * 60000);
  return corrected.toISOString();
}

/**
 * Inline time editor: shows "MM/DD/YYYY [HH:MM:SS]"
 * Date is static label, time is editable text input.
 */
function TimeEditCell({ value, incidentDate, onChange }) {
  const localParts = utcToLocalParts(value);
  // Use incident date as fallback when no value exists
  const displayDate = localParts.date || incidentDate || '';
  
  const [timeText, setTimeText] = useState(localParts.time);
  const [isValid, setIsValid] = useState(true);
  
  const handleBlur = () => {
    const trimmed = timeText.trim();
    
    // Empty = clear the time
    if (!trimmed) {
      if (value) onChange(null); // Only fire if was set
      setIsValid(true);
      return;
    }
    
    // Validate format
    const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
      setIsValid(false);
      return;
    }
    
    const h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const s = parseInt(match[3] || '0');
    if (h > 23 || m > 59 || s > 59) {
      setIsValid(false);
      return;
    }
    
    // Normalize display to HH:MM:SS
    const normalized = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    setTimeText(normalized);
    setIsValid(true);
    
    // Convert to UTC using the date portion
    const dateForConvert = displayDate;
    const utc = localPartsToUtc(dateForConvert, normalized);
    if (utc) {
      onChange(utc);
    } else {
      setIsValid(false);
    }
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };
  
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-400 whitespace-nowrap">{displayDate}</span>
      <input
        type="text"
        value={timeText}
        onChange={(e) => { setTimeText(e.target.value); setIsValid(true); }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`text-xs border rounded px-1.5 py-0.5 w-20 text-center font-mono
          ${isValid ? 'border-gray-300 bg-white' : 'border-red-400 bg-red-50'}`}
        maxLength={8}
      />
    </div>
  );
}


export default function CADUnitsTable() {
  const { 
    formData, setFormData, incident, apparatus, userSession, 
    unlockedFields, toggleUnlock 
  } = useRunSheet();
  const branding = useBranding();
  const toast = useToast();
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'asc' });
  const [editedUnits, setEditedUnits] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAddRow, setShowAddRow] = useState(false);
  const [newUnitId, setNewUnitId] = useState('');
  
  const isAdmin = userSession?.role === 'ADMIN';
  const isEditing = unlockedFields['cad_units'] === true;
  
  const displayUnits = isEditing && editedUnits !== null ? editedUnits : (formData.cad_units || []);
  
  if (displayUnits.length === 0 && !isEditing) return null;
  
  const sortingEnabled = displayUnits.length > 3 && !isEditing;
  
  const formatTime = (isoString) => {
    if (!isoString) return '-';
    return formatTimeLocal(isoString, true) || '-';
  };
  
  // Get incident date in MM/DD/YYYY format for the edit cells
  const incidentDate = useMemo(() => {
    // Try to get from first unit's dispatch time, or from incident_date
    const firstDispatch = (formData.cad_units || []).find(u => u.time_dispatched);
    if (firstDispatch) {
      return utcToLocalParts(firstDispatch.time_dispatched).date;
    }
    if (formData.incident_date) {
      const parts = formData.incident_date.split('-');
      if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return '';
  }, [formData.cad_units, formData.incident_date]);
  
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
      setEditedUnits(JSON.parse(JSON.stringify(formData.cad_units || [])));
      setShowAddRow(false);
      setNewUnitId('');
    } else {
      setEditedUnits(null);
      setShowAddRow(false);
      setNewUnitId('');
    }
    toggleUnlock('cad_units');
  };
  
  const handleTimeChange = (unitIndex, field, utcValue) => {
    if (!editedUnits) return;
    const updated = [...editedUnits];
    updated[unitIndex] = {
      ...updated[unitIndex],
      [field]: utcValue,
      source: updated[unitIndex].source === 'ADMIN_OVERRIDE' 
        ? 'ADMIN_OVERRIDE' 
        : 'ADMIN_TIMES_MODIFIED',
    };
    setEditedUnits(updated);
  };
  
  const handleRemoveUnit = (unitIndex) => {
    if (!editedUnits) return;
    setEditedUnits(editedUnits.filter((_, i) => i !== unitIndex));
  };
  
  const handleAddUnit = () => {
    if (!newUnitId || !editedUnits) return;
    const app = apparatus.find(a => a.unit_designator === newUnitId);
    
    const newUnit = {
      unit_id: newUnitId,
      station: null,
      agency: null,
      is_mutual_aid: app ? false : true,
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
      
      setFormData(prev => ({ ...prev, cad_units: editedUnits }));
      
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
      
      setEditedUnits(null);
      toggleUnlock('cad_units');
      toast.success('CAD units updated');
    } catch (err) {
      console.error('Failed to save CAD units:', err);
      toast.error(err.response?.data?.detail || 'Failed to save CAD units');
    } finally {
      setSaving(false);
    }
  };
  
  const hasChanges = useMemo(() => {
    if (!editedUnits) return false;
    return JSON.stringify(editedUnits) !== JSON.stringify(formData.cad_units || []);
  }, [editedUnits, formData.cad_units]);
  
  const availableApparatus = useMemo(() => {
    const presentIds = new Set(displayUnits.map(u => u.unit_id));
    return apparatus
      .filter(a => a.active && !presentIds.has(a.unit_designator))
      .sort((a, b) => a.unit_designator.localeCompare(b.unit_designator));
  }, [apparatus, displayUnits]);
  
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
          {isEditing && hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-xs bg-blue-600 text-white px-2.5 py-0.5 rounded hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
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
              
              const isOverride = unit.source === 'ADMIN_OVERRIDE' || unit.source === 'ADMIN_TIMES_MODIFIED';
              
              let rowClass = unit.is_mutual_aid 
                ? 'bg-blue-50 border-x-2 border-blue-400' 
                : 'bg-green-50 border-x-2 border-green-400';
              if (isOverride) {
                rowClass = 'bg-yellow-50 border-x-2 border-yellow-400';
              }
              
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
                          <TimeEditCell
                            value={unit[field]}
                            incidentDate={incidentDate}
                            onChange={(utcVal) => handleTimeChange(editIndex, field, utcVal)}
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
