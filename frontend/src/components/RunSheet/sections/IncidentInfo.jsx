import { useRunSheet } from '../RunSheetContext';

export default function IncidentInfo() {
  const { 
    incident, 
    formData, 
    handleChange, 
    municipalities,
    restoreLoading,
    setShowCadModal,
    handleRestorePreview
  } = useRunSheet();
  
  const isLocked = !!incident;
  
  return (
    <div className="flex flex-col gap-2">
      {/* Row 1: Internal #, Category, CAD # */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-0.5">
          <label className="text-gray-400 text-xs flex items-center gap-1">
            Internal #
            {isLocked && <span className="text-[10px]" title="Cannot change after creation">🔒</span>}
          </label>
          <input 
            type="text" 
            value={formData.internal_incident_number} 
            onChange={(e) => handleChange('internal_incident_number', e.target.value)} 
            disabled={isLocked}
            className={isLocked ? 'opacity-60' : ''}
            placeholder="F250001"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-gray-400 text-xs">Category</label>
          <select
            value={formData.call_category}
            onChange={(e) => handleChange('call_category', e.target.value)}
            className={formData.call_category === 'EMS' ? 'border-status-completed bg-status-completed/10' : 'border-status-error bg-status-error/10'}
          >
            <option value="FIRE">🔥 Fire</option>
            <option value="EMS">🚑 EMS</option>
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-gray-400 text-xs flex items-center gap-1">
            CAD #
            {isLocked && <span className="text-[10px]" title="Cannot change after creation">🔒</span>}
          </label>
          <input 
            type="text" 
            value={formData.cad_event_number} 
            onChange={(e) => handleChange('cad_event_number', e.target.value)} 
            placeholder="F25000000"
            disabled={isLocked}
            className={isLocked ? 'opacity-60' : ''}
          />
        </div>
      </div>
      
      {/* Incident Date */}
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs flex items-center gap-1">
          Incident Date
          {isLocked && <span className="text-[10px]" title="Cannot change after creation">🔒</span>}
        </label>
        <input 
          type="date" 
          value={formData.incident_date} 
          onChange={(e) => handleChange('incident_date', e.target.value)} 
          disabled={isLocked}
          className={isLocked ? 'opacity-60' : ''}
        />
      </div>
      
      {/* CAD Type */}
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">CAD Type</label>
        <input 
          type="text" 
          value={formData.cad_event_type} 
          onChange={(e) => handleChange('cad_event_type', e.target.value)} 
        />
      </div>
      
      {/* CAD Subtype + buttons */}
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">CAD Subtype</label>
        <div className="flex gap-2 items-center">
          <input 
            type="text" 
            value={formData.cad_event_subtype} 
            onChange={(e) => handleChange('cad_event_subtype', e.target.value)} 
            className="flex-1"
          />
          {incident && (formData.cad_raw_dispatch || formData.cad_raw_clear) && (
            <>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCadModal(true)}
                title="View raw CAD data"
              >
                📄
              </button>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                onClick={handleRestorePreview}
                disabled={restoreLoading}
                title="Restore from CAD"
              >
                {restoreLoading ? '...' : '🔄'}
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Address */}
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">Address</label>
        <input 
          type="text" 
          value={formData.address} 
          onChange={(e) => handleChange('address', e.target.value)} 
        />
      </div>
      
      {/* Municipality + ESZ */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <label className="text-gray-400 text-xs">Municipality</label>
          <select 
            value={formData.municipality_code} 
            onChange={(e) => handleChange('municipality_code', e.target.value)}
          >
            <option value="">--</option>
            {municipalities.map(m => (
              <option key={m.code} value={m.code}>
                {m.display_name || m.name}{m.subdivision_type ? ` ${m.subdivision_type}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-gray-400 text-xs">ESZ</label>
          <input 
            type="text" 
            value={formData.esz_box} 
            onChange={(e) => handleChange('esz_box', e.target.value)} 
          />
        </div>
      </div>
      
      {/* Cross Streets */}
      <div className="flex flex-col gap-0.5">
        <label className="text-gray-400 text-xs">Cross Streets</label>
        <input 
          type="text" 
          value={formData.cross_streets} 
          onChange={(e) => handleChange('cross_streets', e.target.value)} 
        />
      </div>
    </div>
  );
}
