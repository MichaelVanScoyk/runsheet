import { useRunSheet } from '../RunSheetContext';
import { PersonnelSelect } from '../shared';

// Virtual units: Direct, Station - dynamic growing lists
export default function VirtualUnits() {
  const { 
    apparatus, 
    assignments, 
    setAssignments,
    personnel,
    getAssignedIds
  } = useRunSheet();
  
  // Virtual units: DIRECT and STATION categories
  const virtualUnits = apparatus.filter(a => {
    const category = a.unit_category || (a.is_virtual ? 'DIRECT' : 'APPARATUS');
    return ['DIRECT', 'STATION'].includes(category);
  });
  
  if (virtualUnits.length === 0) return null;
  
  return (
    <div className="pt-3 border-t border-dark-border">
      <h4 className="text-accent-red text-sm font-semibold mb-2">Direct / Station</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {virtualUnits.map(t => (
          <VirtualUnitCard
            key={t.id}
            unit={t}
            assignedIds={assignments[t.unit_designator] || []}
            onUpdate={(newList) => setAssignments(prev => ({ ...prev, [t.unit_designator]: newList }))}
            personnel={personnel}
            getAssignedIds={getAssignedIds}
          />
        ))}
      </div>
    </div>
  );
}

function VirtualUnitCard({ unit, assignedIds, onUpdate, personnel, getAssignedIds }) {
  // Filter out nulls to get actual assigned people
  const assigned = (assignedIds || []).filter(id => id !== null);
  
  // Build exclude set (all globally assigned except this unit's assignments)
  const getExcludeIds = () => {
    const allAssigned = getAssignedIds();
    // Remove this unit's assigned personnel from the exclusion set
    // so they can be reassigned within this unit if needed
    assigned.forEach(id => allAssigned.delete(id));
    return allAssigned;
  };
  
  const handleSelect = (personnelId) => {
    onUpdate([...assigned, personnelId]);
  };
  
  const handleRemove = (idx) => {
    const newList = assigned.filter((_, i) => i !== idx);
    onUpdate(newList);
  };
  
  const getPersonName = (id) => {
    const p = personnel.find(x => x.id === id);
    return p ? `${p.last_name}, ${p.first_name}` : '?';
  };
  
  return (
    <div className="bg-theme-card rounded-md p-3 border border-theme">
      <div className="text-accent-red font-semibold text-sm mb-2 pb-2 border-b border-theme">
        {unit.unit_designator}
      </div>
      <div className="flex flex-col gap-2">
        {/* Existing assignments */}
        {assigned.map((personId, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="flex-1 px-2 py-1 bg-theme-section rounded text-theme-primary text-sm">
              {getPersonName(personId)}
            </span>
            <button 
              className="bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded text-sm flex items-center justify-center"
              onClick={() => handleRemove(idx)}
            >
              ×
            </button>
          </div>
        ))}
        
        {/* New entry field - always show one empty slot */}
        <PersonnelSelect
          value=""
          personnel={personnel}
          excludeIds={getExcludeIds()}
          onSelect={handleSelect}
          placeholder="+ Add..."
        />
      </div>
    </div>
  );
}
