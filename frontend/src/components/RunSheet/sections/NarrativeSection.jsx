import { useRef, useEffect } from 'react';
import { useRunSheet } from '../RunSheetContext';

// Auto-expanding textarea
function AutoTextarea({ value, onChange, placeholder, minRows = 1 }) {
  const ref = useRef(null);
  
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);
  
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={minRows}
      spellCheck={true}
      className="resize-none overflow-hidden"
      style={{ minHeight: `${minRows * 1.5}rem` }}
    />
  );
}

export default function NarrativeSection() {
  const { formData, handleChange, populateUnitsCalled } = useRunSheet();
  
  const hasCadUnits = formData.cad_units && formData.cad_units.length > 0;
  
  return (
    <div className="flex flex-col gap-2">
      {/* Units Called - per doc: Auto button small, LEFT side */}
      <div className="flex flex-col gap-0.5" data-help-id="units_called">
        <label className="text-gray-400 text-xs">Units Called</label>
        <div className="flex gap-2 items-center">
          {hasCadUnits && (
            <button 
              type="button" 
              className="btn btn-sm bg-status-completed hover:bg-status-completed/80 text-white shrink-0"
              onClick={populateUnitsCalled}
              title="Auto-fill from CAD"
            >
              Auto
            </button>
          )}
          <input 
            type="text" 
            value={formData.companies_called} 
            onChange={(e) => handleChange('companies_called', e.target.value)}

            className="flex-1"
          />
        </div>
      </div>
      
      {/* Narrative fields with shaded background */}
      <div className="flex flex-col gap-2 p-3 rounded" style={{ backgroundColor: '#ebebeb' }} data-help-id="narrative_block">
        <div className="flex flex-col gap-0.5" data-help-id="situation_found">
          <label className="text-gray-400 text-xs">Situation Found</label>
          <AutoTextarea 
            value={formData.situation_found} 
            onChange={(e) => handleChange('situation_found', e.target.value)}
          />
        </div>
        
        <div className="flex flex-col gap-0.5" data-help-id="extent_of_damage">
          <label className="text-gray-400 text-xs">Damage</label>
          <AutoTextarea 
            value={formData.extent_of_damage} 
            onChange={(e) => handleChange('extent_of_damage', e.target.value)}
          />
        </div>
        
        <div className="flex flex-col gap-0.5" data-help-id="services_provided">
          <label className="text-gray-400 text-xs">Services</label>
          <AutoTextarea 
            value={formData.services_provided} 
            onChange={(e) => handleChange('services_provided', e.target.value)}
          />
        </div>
        
        <div className="flex flex-col gap-0.5" data-help-id="narrative">
          <label className="text-gray-400 text-xs">Narrative</label>
          <AutoTextarea 
            value={formData.narrative} 
            onChange={(e) => handleChange('narrative', e.target.value)}
            minRows={2}
          />
        </div>
        
        <div className="flex flex-col gap-0.5" data-help-id="problems_issues">
          <label className="text-gray-400 text-xs">Problems</label>
          <AutoTextarea 
            value={formData.problems_issues} 
            onChange={(e) => handleChange('problems_issues', e.target.value)}
          />
        </div>
        
        <div className="flex flex-col gap-0.5" data-help-id="equipment_used">
          <label className="text-gray-400 text-xs">Equipment Used</label>
          <AutoTextarea 
            value={formData.equipment_used || ''} 
            onChange={(e) => handleChange('equipment_used', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
