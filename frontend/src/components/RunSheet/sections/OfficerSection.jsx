import { useRunSheet } from '../RunSheetContext';

export default function OfficerSection() {
  const { formData, handleChange, personnel } = useRunSheet();
  
  return (
    <div className="pt-3 border-t border-dark-border">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <label className="text-gray-400 text-xs">Officer in Charge</label>
          <select 
            value={formData.officer_in_charge} 
            onChange={(e) => handleChange('officer_in_charge', e.target.value ? parseInt(e.target.value) : '')}
          >
            <option value="">--</option>
            {personnel.map(p => (
              <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-gray-400 text-xs">Originally Completed By</label>
          <select 
            value={formData.completed_by} 
            onChange={(e) => handleChange('completed_by', e.target.value ? parseInt(e.target.value) : '')}
          >
            <option value="">--</option>
            {personnel.map(p => (
              <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
