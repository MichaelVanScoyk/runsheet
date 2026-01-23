/**
 * DetailHeader - Header section for attendance records
 * 
 * Shows: Date, Detail Type dropdown, Location, Start/End times
 */

export default function DetailHeader({ formData, detailTypes, incidentDate, onChange, disabled }) {
  return (
    <div className="bg-dark-hover rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">Event Details</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Date (read-only) */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Date</label>
          <input
            type="text"
            value={incidentDate || ''}
            readOnly
            className="form-control bg-dark-border text-gray-300 cursor-not-allowed"
          />
        </div>

        {/* Detail Type */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Event Type *</label>
          <select
            value={formData.detail_type || ''}
            onChange={(e) => onChange('detail_type', e.target.value)}
            className="form-control"
            disabled={disabled}
          >
            <option value="">Select type...</option>
            {detailTypes.map(dt => (
              <option key={dt.id} value={dt.code}>
                {dt.display_name}
              </option>
            ))}
          </select>
        </div>

        {/* Location */}
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-400 mb-1">Location</label>
          <input
            type="text"
            value={formData.address || ''}
            onChange={(e) => onChange('address', e.target.value)}
            placeholder="Station 48"
            className="form-control"
            disabled={disabled}
          />
        </div>

        {/* Start Time */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Start Time</label>
          <input
            type="datetime-local"
            value={formData.time_event_start || ''}
            onChange={(e) => onChange('time_event_start', e.target.value)}
            className="form-control"
            disabled={disabled}
          />
        </div>

        {/* End Time */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">End Time</label>
          <input
            type="datetime-local"
            value={formData.time_event_end || ''}
            onChange={(e) => onChange('time_event_end', e.target.value)}
            className="form-control"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
