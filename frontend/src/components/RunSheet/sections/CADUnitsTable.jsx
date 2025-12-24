import { useRunSheet } from '../RunSheetContext';

export default function CADUnitsTable() {
  const { formData } = useRunSheet();
  
  if (!formData.cad_units || formData.cad_units.length === 0) return null;
  
  const formatTime = (isoString) => {
    if (!isoString) return '-';
    return isoString.split('T')[1]?.substring(0, 5) || '-';
  };
  
  // Check if a unit's time matches the incident metric time
  const timesMatch = (unitTime, metricTime) => {
    if (!unitTime || !metricTime) return false;
    return unitTime === metricTime;
  };
  
  return (
    <div className="pt-3 border-t border-dark-border">
      <h4 className="text-accent-red text-sm font-semibold mb-2">Cad Units</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-dark-border text-accent-red text-xs uppercase">
              <th className="px-2 py-1.5 text-left">Unit</th>
              <th className="px-2 py-1.5 text-left">Dispatched</th>
              <th className="px-2 py-1.5 text-left">Enroute</th>
              <th className="px-2 py-1.5 text-left">Arrived</th>
              <th className="px-2 py-1.5 text-left">Cleared</th>
              <th className="px-2 py-1.5 text-left">Type</th>
            </tr>
          </thead>
          <tbody>
            {formData.cad_units.map((unit, idx) => {
              // Only highlight enroute/arrived for units that count for response times
              const countsForMetrics = unit.counts_for_response_times !== false;
              const isFirstEnroute = countsForMetrics && timesMatch(unit.time_enroute, formData.time_first_enroute);
              const isFirstArrived = countsForMetrics && timesMatch(unit.time_arrived, formData.time_first_on_scene);
              // Cleared highlights for any unit that matches
              const isLastCleared = timesMatch(unit.time_cleared, formData.time_last_cleared);
              
              const highlightClass = 'text-green-400 font-semibold';
              
              return (
                <tr 
                  key={idx} 
                  className={unit.is_mutual_aid ? 'bg-status-completed/10 border-x-2 border-status-completed' : 'bg-status-open/10 border-x-2 border-status-open'}
                >
                  <td className="px-2 py-1.5 border-b border-dark-border">
                    <span className="font-semibold">{unit.unit_id}</span>
                    {unit.is_mutual_aid && (
                      <span className="ml-1.5 bg-status-completed text-white text-[10px] px-1 py-0.5 rounded font-semibold">
                        MA
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 border-b border-dark-border text-gray-400">{formatTime(unit.time_dispatched)}</td>
                  <td className={`px-2 py-1.5 border-b border-dark-border ${isFirstEnroute ? highlightClass : 'text-gray-400'}`}>{formatTime(unit.time_enroute)}</td>
                  <td className={`px-2 py-1.5 border-b border-dark-border ${isFirstArrived ? highlightClass : 'text-gray-400'}`}>{formatTime(unit.time_arrived)}</td>
                  <td className={`px-2 py-1.5 border-b border-dark-border ${isLastCleared ? highlightClass : 'text-gray-400'}`}>{formatTime(unit.time_cleared)}</td>
                  <td className="px-2 py-1.5 border-b border-dark-border text-gray-400">{unit.is_mutual_aid ? 'Mutual Aid' : 'Station 48'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
