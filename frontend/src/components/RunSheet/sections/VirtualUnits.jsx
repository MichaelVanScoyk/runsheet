import { useRunSheet } from '../RunSheetContext';
import { DynamicPersonnelList } from '../shared';

// Virtual units: Direct, Station - dynamic growing lists
export default function VirtualUnits() {
  const { 
    apparatus, 
    assignments, 
    setAssignments,
    personnel,
    getAssignedIds
  } = useRunSheet();
  
  const virtualUnits = apparatus.filter(a => a.is_virtual);
  
  if (virtualUnits.length === 0) return null;
  
  return (
    <div className="pt-3 border-t border-dark-border">
      <h4 className="text-accent-red text-sm font-semibold mb-2">Direct / Station</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {virtualUnits.map(t => (
          <DynamicPersonnelList
            key={t.id}
            label={t.unit_designator}
            assignedIds={assignments[t.unit_designator] || []}
            onUpdate={(newList) => setAssignments(prev => ({ ...prev, [t.unit_designator]: newList }))}
            allPersonnel={personnel}
            getAssignedIds={getAssignedIds}
          />
        ))}
      </div>
    </div>
  );
}
