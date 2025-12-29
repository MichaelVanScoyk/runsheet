import { useState, useEffect, useMemo } from 'react';
import { useRunSheet } from '../RunSheetContext';
import { formatDateTimeLocal, parseLocalToUtc, calculateDuration } from '../../../utils/timeUtils';

const FIELD_KEYS = [
  'time_dispatched',
  'time_first_enroute', 
  'time_first_on_scene',
  'time_fire_under_control',
  'time_last_cleared',
];

const FIELD_LABELS = {
  time_dispatched: 'Dispatched',
  time_first_enroute: 'Enroute',
  time_first_on_scene: 'On Scene',
  time_fire_under_control: 'Under Ctrl',
  time_last_cleared: 'Cleared',
};

// Per context doc: labels inline LEFT of field, not above
export default function TimeFields() {
  const { formData, handleChange } = useRunSheet();
  
  // Track display values separately from stored UTC values
  // This allows typing without conversion until blur
  const [displayValues, setDisplayValues] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  
  // Sync display values from formData when not editing
  useEffect(() => {
    setDisplayValues(prev => {
      const updated = { ...prev };
      FIELD_KEYS.forEach(key => {
        // Only update if not currently editing this field
        if (editingKey !== key) {
          updated[key] = formatDateTimeLocal(formData[key]);
        }
      });
      return updated;
    });
  }, [formData, editingKey]);
  
  const handleFocus = (key) => {
    setEditingKey(key);
  };
  
  const handleInputChange = (key, value) => {
    // Just update display value while typing - don't convert yet
    setDisplayValues(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  const handleBlur = (key) => {
    setEditingKey(null);
    const displayValue = displayValues[key];
    
    // Only convert if we have a complete-looking datetime
    if (displayValue && displayValue.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/)) {
      const isoValue = parseLocalToUtc(displayValue);
      if (isoValue && isoValue !== displayValue) {
        handleChange(key, isoValue);
      }
    } else if (!displayValue || displayValue.trim() === '') {
      // Clear the field if empty
      handleChange(key, null);
    }
    // If partial/invalid, keep the display value but don't save to form
  };
  
  // Calculate Time in Service (duration from Dispatched to Cleared)
  const timeInService = calculateDuration(formData.time_dispatched, formData.time_last_cleared);
  
  return (
    <div className="flex flex-col gap-1.5">
      {FIELD_KEYS.map(key => (
        <div key={key} className="flex items-center gap-2">
          <label className="text-gray-400 text-xs w-20 text-right shrink-0">
            {FIELD_LABELS[key]}
          </label>
          <input 
            type="text"
            placeholder="YYYY-MM-DD HH:MM:SS"
            value={displayValues[key] ?? ''} 
            onChange={(e) => handleInputChange(key, e.target.value)}
            onFocus={() => handleFocus(key)}
            onBlur={() => handleBlur(key)}
            className="flex-1 font-mono text-sm"
          />
        </div>
      ))}
      {/* Time in Service - calculated duration, read-only */}
      <div className="flex items-center gap-2">
        <label className="text-gray-400 text-xs w-20 text-right shrink-0">In Service</label>
        <input 
          type="text"
          value={timeInService || '—'}
          readOnly
          disabled
          className="flex-1 font-mono text-sm cursor-default"
        />
      </div>
    </div>
  );
}
