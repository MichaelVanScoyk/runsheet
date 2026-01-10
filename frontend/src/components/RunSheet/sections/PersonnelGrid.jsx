import { useRunSheet } from '../RunSheetContext';
import { PersonnelTypeahead } from '../shared';

// CRITICAL: Personnel assignment logic must not change
export default function PersonnelGrid() {
  const { 
    apparatus, 
    formData,
    assignments, 
    handleAssignment, 
    clearSlot, 
    getAvailablePersonnel,
    personnel
  } = useRunSheet();
  
  // Only APPARATUS category (physical units with crew slots)
  // Chief vehicles are APPARATUS with 0 slots - they won't show in grid
  const realTrucks = apparatus.filter(a => {
    const category = a.unit_category || 'APPARATUS';
    return category === 'APPARATUS';
  });
  
  if (realTrucks.length === 0) return null;
  
  // ==========================================================================
  // SLOT COUNT FILTER - Also exists in:
  //   - frontend/src/components/IncidentHubModal/QuickEntrySection.jsx
  //   - backend/report_engine/renderers.py (_render_apparatus_grid)
  // TODO: If touching this logic again, consolidate into shared helper function
  // ==========================================================================
  const getSlotCount = (truck) => (truck.has_driver ? 1 : 0) + (truck.has_officer ? 1 : 0) + (truck.ff_slots || 0);
  
  // Filter out units with 0 slots (e.g., chief vehicles like CHF48, FP48)
  const trucksWithSlots = realTrucks.filter(t => getSlotCount(t) > 0);
  
  if (trucksWithSlots.length === 0) return null;
  
  const maxSlots = Math.max(...trucksWithSlots.map(getSlotCount), 1);
  
  // Slot labels: D, O, 3, 4, 5, 6
  const getSlotLabel = (slot) => {
    if (slot === 0) return 'D';
    if (slot === 1) return 'O';
    return String(slot + 1);
  };
  
  // Check if truck actually responded (only if we have CAD data)
  // Must have gone enroute OR arrived - just being dispatched isn't enough
  const hasCadData = Array.isArray(formData.cad_units) && formData.cad_units.length > 0;
  const actuallyResponded = (truck) => hasCadData && formData.cad_units.some(u => 
    u.unit_id === truck.unit_designator && !u.is_mutual_aid && (u.time_enroute || u.time_arrived)
  );
  
  return (
    <div className="pt-3 border-t border-theme">
      <h4 className="text-accent-red text-sm font-semibold mb-2">Personnel Assignments</h4>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th className="w-8 bg-theme-section text-theme-muted text-xs font-semibold px-1 py-1.5 border border-theme">#</th>
              {trucksWithSlots.map(t => {
                const responded = actuallyResponded(t);
                // On light theme: responded units are green, non-responded are dimmed
                const headerClass = hasCadData 
                  ? (responded ? 'text-green-700 font-bold' : 'text-theme-hint opacity-60')
                  : 'text-accent-red font-semibold';
                return (
                  <th 
                    key={t.id} 
                    className={`bg-theme-section text-xs px-2 py-1.5 border border-theme min-w-[120px] ${headerClass}`}
                  >
                    {t.name}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxSlots }, (_, slot) => (
              <tr key={slot}>
                <td className="w-8 bg-theme-section text-theme-muted text-xs font-semibold text-center px-1 py-1 border border-theme">
                  {getSlotLabel(slot)}
                </td>
                {trucksWithSlots.map(t => {
                  const slotCount = getSlotCount(t);
                  
                  // Slot doesn't exist for this truck
                  if (slot >= slotCount) {
                    return <td key={t.id} className="bg-theme-section-alt border border-theme" />;
                  }
                  
                  const val = assignments[t.unit_designator]?.[slot] || '';
                  const responded = actuallyResponded(t);
                  const shouldDim = hasCadData && !responded;
                  
                  return (
                    <td 
                      key={t.id} 
                      className={`bg-white border border-theme p-1 ${shouldDim ? 'opacity-40 hover:opacity-80' : ''}`}
                    >
                      <PersonnelTypeahead
                        value={val}
                        availablePersonnel={getAvailablePersonnel(t.unit_designator, slot)}
                        allPersonnel={personnel}
                        onSelect={(personId) => handleAssignment(t.unit_designator, slot, personId)}
                        onClear={() => clearSlot(t.unit_designator, slot)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
