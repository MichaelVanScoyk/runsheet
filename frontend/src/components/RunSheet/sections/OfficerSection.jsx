import { useRunSheet } from '../RunSheetContext';
import { PersonnelSelect } from '../shared';

export default function OfficerSection() {
  const { formData, handleChange, personnel } = useRunSheet();
  
  return (
    <div className="pt-3 border-t border-dark-border">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <label className="text-gray-400 text-xs">Officer in Charge</label>
          <PersonnelSelect
            value={formData.officer_in_charge || ''}
            personnel={personnel}
            excludeIds={null}
            onSelect={(personId) => handleChange('officer_in_charge', personId)}
            onClear={() => handleChange('officer_in_charge', '')}
            placeholder="Select officer..."
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-gray-400 text-xs">Originally Completed By</label>
          <PersonnelSelect
            value={formData.completed_by || ''}
            personnel={personnel}
            excludeIds={null}
            onSelect={(personId) => handleChange('completed_by', personId)}
            onClear={() => handleChange('completed_by', '')}
            placeholder="Select person..."
          />
        </div>
      </div>
    </div>
  );
}
