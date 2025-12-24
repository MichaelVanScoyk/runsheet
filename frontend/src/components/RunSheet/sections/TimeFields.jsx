import { useRunSheet } from '../RunSheetContext';

// Per context doc: labels inline LEFT of field, not above
export default function TimeFields() {
  const { formData, handleChange } = useRunSheet();
  
  const fields = [
    { key: 'time_dispatched', label: 'Dispatched' },
    { key: 'time_first_enroute', label: 'Enroute' },
    { key: 'time_first_on_scene', label: 'On Scene' },
    { key: 'time_fire_under_control', label: 'Under Ctrl' },
    { key: 'time_last_cleared', label: 'Cleared' },
    { key: 'time_in_service', label: 'In Service' },
  ];
  
  return (
    <div className="flex flex-col gap-1.5">
      {fields.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-2">
          <label className="text-gray-400 text-xs w-20 text-right shrink-0">{label}</label>
          <input 
            type="datetime-local" 
            step="1"
            value={formData[key]} 
            onChange={(e) => handleChange(key, e.target.value)}
            className="flex-1"
          />
        </div>
      ))}
    </div>
  );
}
