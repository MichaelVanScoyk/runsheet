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
  
  // Calculate slot count per truck from apparatus config
  const getSlotCount = (truck) => (truck.has_driver ? 1 : 0) + (truck.has_officer ? 1 : 0) + (truck.ff_slots || 0);
  
  // Filter out units with 0 slots (e.g., chief vehicles)
  const trucksWithSlots = realTrucks.filter(t => getSlotCount(t) > 0);
  
  if (trucksWithSlots.length === 0) return null;
  
  const maxSlots = Math.max(...trucksWithSlots.map(getSlotCount), 1);
  
  // Slot labels: D, O, 3, 4, 5, 6
  const getSlotLabel = (slot) => {
    if (slot === 0) return 'D';
    if (slot === 1) return 'O';
    return String(slot + 1);
  };
  
  // Check if truck was dispatched (only if we have CAD data)
  const hasCadData = Array.isArray(formData.cad_units) && formData.cad_units.length > 0;
  const wasDispatched = (truck) => hasCadData && formData.cad_units.some(u => 
    u.unit_id === truck.unit_designator && !u.is_mutual_aid
  );
  
  return (
    <div className="pt-3 border-t border-dark-border">
      <h4 className="text-accent-red text-sm font-semibold mb-2">Personnel Assignments</h4>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th className="w-8 bg-dark-border text-gray-400 text-xs font-semibold px-1 py-1.5 border border-dark-border">#</th>
              {trucksWithSlots.map(t => {
                const dispatched = wasDispatched(t);
                const headerClass = hasCadData 
                  ? (dispatched ? 'bg-status-open/30 text-status-open' : 'opacity-40 text-gray-500')
                  : 'text-accent-red';
                return (
                  <th 
                    key={t.id} 
                    className={`bg-dark-border text-xs font-semibold px-2 py-1.5 border border-dark-border min-w-[120px] ${headerClass}`}
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
                <td className="w-8 bg-dark-border text-gray-400 text-xs font-semibold text-center px-1 py-1 border border-dark-border">
                  {getSlotLabel(slot)}
                </td>
                {trucksWithSlots.map(t => {
                  const slotCount = getSlotCount(t);
                  
                  // Slot doesn't exist for this truck
                  if (slot >= slotCount) {
                    return <td key={t.id} className="bg-dark-hover/50 border border-dark-border" />;
                  }
                  
                  const val = assignments[t.unit_designator]?.[slot] || '';
                  const dispatched = wasDispatched(t);
                  const shouldDim = hasCadData && !dispatched;
                  
                  return (
                    <td 
                      key={t.id} 
                      className={`bg-dark-card border border-dark-border p-1 ${shouldDim ? 'opacity-35 hover:opacity-70' : ''}`}
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
