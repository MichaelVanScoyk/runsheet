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
      <div className="flex flex-col gap-0.5">
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
            placeholder="Station 48: ENG481, CHF48 | Mutual Aid: AMB891"
            className="flex-1"
          />
        </div>
      </div>
      
      {/* Textareas - per doc: start at 1 line, auto-expand */}
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">Situation Found</label>
        <AutoTextarea 
          value={formData.situation_found} 
          onChange={(e) => handleChange('situation_found', e.target.value)}
        />
      </div>
      
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">Damage</label>
        <AutoTextarea 
          value={formData.extent_of_damage} 
          onChange={(e) => handleChange('extent_of_damage', e.target.value)}
        />
      </div>
      
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">Services</label>
        <AutoTextarea 
          value={formData.services_provided} 
          onChange={(e) => handleChange('services_provided', e.target.value)}
        />
      </div>
      
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">Narrative</label>
        <AutoTextarea 
          value={formData.narrative} 
          onChange={(e) => handleChange('narrative', e.target.value)}
          minRows={2}
        />
      </div>
      
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">Problems</label>
        <AutoTextarea 
          value={formData.problems_issues} 
          onChange={(e) => handleChange('problems_issues', e.target.value)}
        />
      </div>
      
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">Equipment Used</label>
        <AutoTextarea 
          value={Array.isArray(formData.equipment_used) ? formData.equipment_used.join(', ') : (formData.equipment_used || '')} 
          onChange={(e) => handleChange('equipment_used', e.target.value)}
          placeholder="Halligan, Pike Pole, Chain Saw..."
        />
      </div>
    </div>
  );
}
