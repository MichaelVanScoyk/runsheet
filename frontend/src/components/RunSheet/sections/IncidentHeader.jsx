import { useRunSheet } from '../RunSheetContext';

export default function IncidentHeader() {
  const { incident, formData, formatTimestamp } = useRunSheet();
  
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 pb-3 border-b-2 border-accent-red">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-accent-red text-lg font-semibold m-0">Glen Moore Fire Company — Station 48</h2>
          <h3 className="text-gray-400 text-sm font-normal m-0">Incident Report</h3>
        </div>
        {incident && (
          <span className={`badge badge-${formData.status?.toLowerCase()}`}>
            {formData.status}
          </span>
        )}
      </div>
      {incident && (
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span>Created: {formatTimestamp(formData.created_at)}</span>
          <span>Updated: {formatTimestamp(formData.updated_at)}</span>
          {formData.closed_at && <span>Closed: {formatTimestamp(formData.closed_at)}</span>}
          {formData.neris_submitted_at && <span>NERIS: {formatTimestamp(formData.neris_submitted_at)}</span>}
        </div>
      )}
    </div>
  );
}
