import { useRunSheet } from '../RunSheetContext';
import { formatDateTimeLocal, parseLocalToUtc, calculateDuration } from '../../../utils/timeUtils';

// Per context doc: labels inline LEFT of field, not above
export default function TimeFields() {
  const { formData, handleChange } = useRunSheet();
  
  const handleTimeChange = (key, displayValue) => {
    const isoValue = parseLocalToUtc(displayValue);
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
            value={formatDateTimeLocal(formData[key])} 
            onChange={(e) => handleTimeChange(key, e.target.value)}
            className="flex-1 font-mono text-sm"
            pattern="\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}"
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
