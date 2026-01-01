import { memo } from 'react';
import DynamicPersonnelList from '../RunSheet/shared/DynamicPersonnelList';

/**
 * Station and Direct responders section.
 * Available during both ACTIVE and CLOSED phases.
 * 
 * - Station: People who responded to the station but didn't ride on a truck
 * - Direct: People who went directly to the scene (POV)
 */
function StationDirectSection({
  assignments,
  onAssignmentChange,
  allPersonnel,
  getAssignedIds,
  stationUnit,
  directUnit,
}) {
  if (!stationUnit && !directUnit) {
    return (
      <div className="px-6 py-4 text-center text-gray-500">
        No Station or Direct units configured.
        <br />
        <span className="text-sm">Configure in Admin → Apparatus with unit_category STATION or DIRECT.</span>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 border-t border-dark-border">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Station Responders */}
        {stationUnit && (
          <div>
            <h3 className="text-sm font-semibold text-accent-red mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-yellow-500 rounded-full" />
              STATION RESPONDERS
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Responded to station but did not ride on a truck
            </p>
            <DynamicPersonnelList
              label={stationUnit.unit_designator}
              assignedIds={assignments[stationUnit.unit_designator] || []}
              onUpdate={(newList) => onAssignmentChange(stationUnit.unit_designator, newList)}
              allPersonnel={allPersonnel}
              getAssignedIds={getAssignedIds}
            />
          </div>
        )}

        {/* Direct Responders */}
        {directUnit && (
          <div>
            <h3 className="text-sm font-semibold text-accent-red mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
              DIRECT RESPONDERS
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Went directly to the scene (POV)
            </p>
            <DynamicPersonnelList
              label={directUnit.unit_designator}
              assignedIds={assignments[directUnit.unit_designator] || []}
              onUpdate={(newList) => onAssignmentChange(directUnit.unit_designator, newList)}
              allPersonnel={allPersonnel}
              getAssignedIds={getAssignedIds}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(StationDirectSection);
