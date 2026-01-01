import { memo } from 'react';

/**
 * Large incident display showing key info from CAD.
 * Designed to be visible on a station monitor.
 */
function IncidentDisplay({ incident }) {
  if (!incident) {
    return (
      <div className="text-center text-gray-500 py-8">
        No incident selected
      </div>
    );
  }

  const isActive = incident.status === 'OPEN';

  // Get dispatched units from cad_units
  const dispatchedUnits = (incident.cad_units || [])
    .filter(u => !u.is_mutual_aid)
    .map(u => u.unit_id)
    .join(', ');

  const mutualAidUnits = (incident.cad_units || [])
    .filter(u => u.is_mutual_aid)
    .map(u => u.unit_id)
    .join(', ');

  return (
    <div className="px-6 py-4">
      {/* Event Type - Large */}
      <div className="text-center mb-4">
        <div className="text-2xl font-bold text-white uppercase tracking-wide">
          {incident.cad_event_type || 'UNKNOWN TYPE'}
        </div>
        {incident.cad_event_subtype && (
          <div className="text-xl text-accent-red mt-1">
            {incident.cad_event_subtype}
          </div>
        )}
      </div>

      {/* Address - Very Large */}
      <div className="text-center mb-4">
        <div className="text-3xl font-bold text-white">
          {incident.address || 'NO ADDRESS'}
        </div>
        <div className="text-xl text-gray-400 mt-1">
          {incident.municipality_code || ''}
          {incident.cross_streets && (
            <span className="text-gray-500 ml-2">
              @ {incident.cross_streets}
            </span>
          )}
        </div>
      </div>

      {/* Units */}
      {dispatchedUnits && (
        <div className="text-center mb-4">
          <div className="text-lg text-gray-400">
            <span className="text-gray-500">UNITS:</span>{' '}
            <span className="text-white font-semibold">{dispatchedUnits}</span>
          </div>
          {mutualAidUnits && (
            <div className="text-sm text-gray-500 mt-1">
              Mutual Aid: {mutualAidUnits}
            </div>
          )}
        </div>
      )}

      {/* Status and CAD Number */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-dark-border">
        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${
              isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
            }`}
          />
          <span
            className={`text-lg font-semibold ${
              isActive ? 'text-green-400' : 'text-gray-400'
            }`}
          >
            {isActive ? 'ACTIVE' : 'CLOSED'}
          </span>
        </div>

        {/* CAD Event Number */}
        <div className="text-gray-500">
          CAD# <span className="text-gray-400">{incident.cad_event_number}</span>
        </div>
      </div>

      {/* ESZ/Box if present */}
      {incident.esz_box && (
        <div className="text-center mt-2 text-sm text-gray-500">
          ESZ/Box: {incident.esz_box}
        </div>
      )}
    </div>
  );
}

export default memo(IncidentDisplay);
