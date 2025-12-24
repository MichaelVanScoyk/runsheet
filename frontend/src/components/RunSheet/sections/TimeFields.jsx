import { useRunSheet } from '../RunSheetContext';

// Format ISO datetime to display format: "YYYY-MM-DD HH:MM:SS" (24-hour)
const formatForDisplay = (isoString) => {
  if (!isoString) return '';
  // Handle both "2025-12-23T15:48:26" and "2025-12-23T15:48:26+00:00" formats
  const match = isoString.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  // Fallback for HH:MM without seconds
  const matchNoSec = isoString.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (matchNoSec) {
    return `${matchNoSec[1]} ${matchNoSec[2]}:00`;
  }
  return isoString;
};

// Parse display format back to ISO for storage: "YYYY-MM-DDTHH:MM:SS"
const parseToIso = (displayString) => {
  if (!displayString) return '';
  // Already ISO format
  if (displayString.includes('T')) return displayString;
  // Convert "YYYY-MM-DD HH:MM:SS" to "YYYY-MM-DDTHH:MM:SS"
  const match = displayString.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  if (match) {
    return `${match[1]}T${match[2]}`;
  }
  // Handle "YYYY-MM-DD HH:MM" (no seconds)
  const matchNoSec = displayString.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (matchNoSec) {
    return `${matchNoSec[1]}T${matchNoSec[2]}:00`;
  }
  return displayString;
};

// Calculate duration between two ISO timestamps
const calculateDuration = (startIso, endIso) => {
  if (!startIso || !endIso) return '';
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const diffMs = end - start;
    if (diffMs < 0) return '';
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  } catch {
    return '';
  }
};

// Per context doc: labels inline LEFT of field, not above
export default function TimeFields() {
  const { formData, handleChange } = useRunSheet();
  
  const handleTimeChange = (key, displayValue) => {
    const isoValue = parseToIso(displayValue);
    handleChange(key, isoValue);
  };
  
  const fields = [
    { key: 'time_dispatched', label: 'Dispatched' },
    { key: 'time_first_enroute', label: 'Enroute' },
    { key: 'time_first_on_scene', label: 'On Scene' },
    { key: 'time_fire_under_control', label: 'Under Ctrl' },
    { key: 'time_last_cleared', label: 'Cleared' },
  ];
  
  // Calculate Time in Service (duration from Dispatched to Cleared)
  const timeInService = calculateDuration(formData.time_dispatched, formData.time_last_cleared);
  
  return (
    <div className="flex flex-col gap-1.5">
      {fields.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-2">
          <label className="text-gray-400 text-xs w-20 text-right shrink-0">{label}</label>
          <input 
            type="text"
            placeholder="YYYY-MM-DD HH:MM:SS"
            value={formatForDisplay(formData[key])} 
            onChange={(e) => handleTimeChange(key, e.target.value)}
            className="flex-1 font-mono text-sm"
            pattern="\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}"
          />
        </div>
      ))}
      {/* Time in Service - calculated duration, read-only */}
      <div className="flex items-center gap-2">
        <label className="text-gray-400 text-xs w-20 text-right shrink-0">In Service</label>
        <div className="flex-1 font-mono text-sm px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
          {timeInService || '—'}
        </div>
      </div>
    </div>
  );
}
