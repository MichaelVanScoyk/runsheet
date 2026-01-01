import { memo } from 'react';

/**
 * Browser-style tabs for multiple incidents.
 * Each tab shows: CAD Event Sub Type, Address, Status indicator
 */
function IncidentTabs({ incidents, selectedId, onSelect, onClose }) {
  if (!incidents || incidents.length === 0) {
    return null;
  }

  // Don't show tabs if only one incident
  if (incidents.length === 1) {
    return null;
  }

  return (
    <div className="flex items-end gap-0.5 px-4 pt-2">
      {incidents.map((incident) => {
        const isSelected = incident.id === selectedId;
        const isActive = incident.status === 'OPEN';

        return (
          <div
            key={incident.id}
            className={`
              relative flex flex-col px-3 py-2 min-w-[180px] max-w-[250px] cursor-pointer
              rounded-t-lg transition-all
              ${isSelected
                ? 'bg-dark-card border border-dark-border border-b-0 z-10'
                : 'bg-dark-hover border border-transparent hover:bg-dark-border/50'
              }
            `}
            onClick={() => onSelect(incident.id)}
          >
            {/* Close button */}
            <button
              className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center
                         text-gray-500 hover:text-white hover:bg-red-500/50 rounded
                         transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onClose(incident.id);
              }}
              title="Close this tab"
            >
              ×
            </button>

            {/* Event subtype */}
            <div className={`text-sm font-medium truncate pr-5 ${isSelected ? 'text-white' : 'text-gray-400'}`}>
              {incident.cad_event_subtype || incident.cad_event_type || 'Unknown Type'}
            </div>

            {/* Address */}
            <div className={`text-xs truncate ${isSelected ? 'text-gray-400' : 'text-gray-500'}`}>
              {truncateAddress(incident.address) || 'No address'}
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}
              />
              <span className={`text-xs ${isActive ? 'text-green-400' : 'text-gray-500'}`}>
                {isActive ? 'ACTIVE' : 'CLOSED'}
              </span>
            </div>

            {/* Bottom border connector for selected tab */}
            {isSelected && (
              <div className="absolute bottom-0 left-0 right-0 h-px bg-dark-card" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Truncate address for display in tab
 */
function truncateAddress(address) {
  if (!address) return null;
  if (address.length <= 25) return address;
  return address.substring(0, 22) + '...';
}

export default memo(IncidentTabs);
