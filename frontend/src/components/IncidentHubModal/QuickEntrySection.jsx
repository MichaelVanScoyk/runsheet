import { memo } from 'react';
import DynamicPersonnelList from '../RunSheet/shared/DynamicPersonnelList';

/**
 * Quick Entry section - only visible when incident is CLOSED.
 * Contains:
 * - Unit assignments (personnel for each dispatched unit)
 * - Situation Found
 * - Services Provided
 * - Narrative
 */
function QuickEntrySection({
  incident,
  assignments,
  onAssignmentChange,
  formData,
  onFormChange,
  allPersonnel,
  getAssignedIds,
  dispatchedApparatus,
}) {
  // Get apparatus units (not STATION or DIRECT)
  const apparatusUnits = dispatchedApparatus.filter(
    a => a.unit_category === 'APPARATUS' || !a.unit_category
  );

  return (
    <div className="px-6 py-4 border-t border-dashed border-dark-border">
      {/* Unit Assignments */}
      {apparatusUnits.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-accent-red mb-3">UNIT ASSIGNMENTS</h3>
          <div className="space-y-4">
            {apparatusUnits.map((apparatus) => (
              <div
                key={apparatus.id}
                className="bg-dark-hover rounded-lg p-3 border border-dark-border"
              >
                <div className="text-sm font-semibold text-white mb-2 pb-2 border-b border-dark-border">
                  {apparatus.name || apparatus.unit_designator}
                </div>
                <DynamicPersonnelList
                  label={apparatus.unit_designator}
                  assignedIds={assignments[apparatus.unit_designator] || []}
                  onUpdate={(newList) => onAssignmentChange(apparatus.unit_designator, newList)}
                  allPersonnel={allPersonnel}
                  getAssignedIds={getAssignedIds}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Narrative Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Situation Found */}
        <div>
          <label className="block text-sm font-semibold text-accent-red mb-1">
            SITUATION FOUND
          </label>
          <textarea
            className="w-full bg-dark-input border border-dark-border rounded px-3 py-2 
                       text-white text-sm placeholder-gray-600 resize-none
                       focus:outline-none focus:border-accent-red"
            rows={3}
            placeholder="What was found on arrival..."
            value={formData.situation_found || ''}
            onChange={(e) => onFormChange('situation_found', e.target.value)}
          />
        </div>

        {/* Services Provided */}
        <div>
          <label className="block text-sm font-semibold text-accent-red mb-1">
            SERVICES PROVIDED
          </label>
          <textarea
            className="w-full bg-dark-input border border-dark-border rounded px-3 py-2 
                       text-white text-sm placeholder-gray-600 resize-none
                       focus:outline-none focus:border-accent-red"
            rows={3}
            placeholder="Actions taken..."
            value={formData.services_provided || ''}
            onChange={(e) => onFormChange('services_provided', e.target.value)}
          />
        </div>
      </div>

      {/* Narrative */}
      <div>
        <label className="block text-sm font-semibold text-accent-red mb-1">
          NARRATIVE
        </label>
        <textarea
          className="w-full bg-dark-input border border-dark-border rounded px-3 py-2 
                     text-white text-sm placeholder-gray-600 resize-none
                     focus:outline-none focus:border-accent-red"
          rows={4}
          placeholder="Detailed narrative of the incident..."
          value={formData.narrative || ''}
          onChange={(e) => onFormChange('narrative', e.target.value)}
        />
      </div>
    </div>
  );
}

export default memo(QuickEntrySection);
