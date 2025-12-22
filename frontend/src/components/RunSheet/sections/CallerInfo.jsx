import { useRunSheet } from '../RunSheetContext';

export default function CallerInfo() {
  const { formData, handleChange } = useRunSheet();
  
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">Caller</label>
        <input 
          type="text" 
          value={formData.caller_name} 
          onChange={(e) => handleChange('caller_name', e.target.value)} 
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">Phone</label>
        <input 
          type="text" 
          value={formData.caller_phone} 
          onChange={(e) => handleChange('caller_phone', e.target.value)} 
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">Weather</label>
        <input 
          type="text" 
          value={formData.weather_conditions} 
          onChange={(e) => handleChange('weather_conditions', e.target.value)} 
        />
      </div>
    </div>
  );
}
