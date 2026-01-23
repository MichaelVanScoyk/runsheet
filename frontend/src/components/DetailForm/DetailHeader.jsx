/**
 * DetailHeader - Header section for attendance records
 * 
 * Layout: Date → Event Type → Location → Times (with expand checkbox)
 * Required: Event Type, Location
 */

import { useState, useEffect } from 'react';
import { useBranding } from '../../contexts/BrandingContext';

export default function DetailHeader({ formData, detailTypes, onChange, disabled }) {
  const branding = useBranding();
  const [showFullDatetime, setShowFullDatetime] = useState(false);
  
  // Get default location from branding (station name)
  const defaultLocation = branding.stationName || 'Station';
  
  // Set default location if empty on mount
  useEffect(() => {
    if (!formData.address && defaultLocation) {
      onChange('address', defaultLocation);
    }
  }, [defaultLocation]);

  // Check if we need to show full datetime (dates differ from incident_date)
  useEffect(() => {
    if (formData.time_event_start || formData.time_event_end) {
      const incidentDate = formData.incident_date;
      const startDate = formData.time_event_start?.split('T')[0];
      const endDate = formData.time_event_end?.split('T')[0];
      
      // If either date differs from incident_date, expand the datetime view
      if ((startDate && startDate !== incidentDate) || (endDate && endDate !== incidentDate)) {
        setShowFullDatetime(true);
      }
    }
  }, []);

  // Handle time-only input (combines with incident_date)
  const handleTimeChange = (field, timeValue) => {
    if (!timeValue) {
      onChange(field, '');
      return;
    }
    
    // Combine incident_date with the time
    const dateStr = formData.incident_date || new Date().toISOString().split('T')[0];
    onChange(field, `${dateStr}T${timeValue}`);
  };

  // Extract time portion from datetime string
  const getTimeValue = (datetimeStr) => {
    if (!datetimeStr) return '';
    const timePart = datetimeStr.split('T')[1];
    return timePart ? timePart.substring(0, 5) : ''; // HH:MM
  };

  // When incident_date changes and we're in time-only mode, update the datetime values
  const handleDateChange = (newDate) => {
    onChange('incident_date', newDate);
    
    // If not showing full datetime, update the date portion of start/end times
    if (!showFullDatetime) {
      if (formData.time_event_start) {
        const time = getTimeValue(formData.time_event_start);
        if (time) onChange('time_event_start', `${newDate}T${time}`);
      }
      if (formData.time_event_end) {
        const time = getTimeValue(formData.time_event_end);
        if (time) onChange('time_event_end', `${newDate}T${time}`);
      }
    }
  };

  return (
    <div className="bg-dark-hover rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">Event Details</h3>
      
      <div className="space-y-4">
        {/* Row 1: Date */}
        <div className="max-w-xs">
          <label className="block text-xs text-gray-400 mb-1">Date *</label>
          <input
            type="date"
            value={formData.incident_date || ''}
            onChange={(e) => handleDateChange(e.target.value)}
            className="form-control"
            disabled={disabled}
            required
          />
        </div>

        {/* Row 2: Event Type */}
        <div className="max-w-sm">
          <label className="block text-xs text-gray-400 mb-1">Event Type *</label>
          <select
            value={formData.detail_type || ''}
            onChange={(e) => onChange('detail_type', e.target.value)}
            className="form-control"
            disabled={disabled}
            required
          >
            <option value="">Select type...</option>
            {detailTypes.map(dt => (
              <option key={dt.id} value={dt.code}>
                {dt.display_name}
              </option>
            ))}
          </select>
          {!formData.detail_type && (
            <span className="text-xs text-yellow-500 mt-1">Required</span>
          )}
        </div>

        {/* Row 3: Location */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Location *</label>
          <input
            type="text"
            value={formData.address || ''}
            onChange={(e) => onChange('address', e.target.value)}
            placeholder={defaultLocation}
            className="form-control"
            disabled={disabled}
            required
          />
          {!formData.address && (
            <span className="text-xs text-yellow-500 mt-1">Required</span>
          )}
        </div>

        {/* Row 4: Times */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <label className="block text-xs text-gray-400">Times</label>
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showFullDatetime}
                onChange={(e) => setShowFullDatetime(e.target.checked)}
                disabled={disabled}
                className="rounded"
              />
              Program dates (multi-day event)
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {showFullDatetime ? (
              <>
                {/* Full datetime inputs */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start</label>
                  <input
                    type="datetime-local"
                    value={formData.time_event_start || ''}
                    onChange={(e) => onChange('time_event_start', e.target.value)}
                    className="form-control"
                    disabled={disabled}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End</label>
                  <input
                    type="datetime-local"
                    value={formData.time_event_end || ''}
                    onChange={(e) => onChange('time_event_end', e.target.value)}
                    className="form-control"
                    disabled={disabled}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Time-only inputs */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={getTimeValue(formData.time_event_start)}
                    onChange={(e) => handleTimeChange('time_event_start', e.target.value)}
                    className="form-control"
                    disabled={disabled}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Time</label>
                  <input
                    type="time"
                    value={getTimeValue(formData.time_event_end)}
                    onChange={(e) => handleTimeChange('time_event_end', e.target.value)}
                    className="form-control"
                    disabled={disabled}
                  />
                </div>
              </>
            )}
          </div>
          {!showFullDatetime && formData.incident_date && (
            <p className="text-xs text-gray-500 mt-1">
              Times will use date: {formData.incident_date}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
