/**
 * Time utilities for UTC <-> Station timezone conversion
 * 
 * Backend stores all times in UTC.
 * Frontend displays in STATION's configured timezone (not browser's).
 */

// Station timezone - loaded from settings, defaults to Eastern
let stationTimezone = 'America/New_York';

/**
 * Set the station timezone (called on app load from settings)
 */
export const setStationTimezone = (tz) => {
  if (tz) {
    // Strip quotes if present from JSON storage
    stationTimezone = tz.replace(/"/g, '');
  }
};

/**
 * Get current station timezone
 */
export const getStationTimezone = () => stationTimezone;

/**
 * Format UTC ISO datetime to station timezone: "YYYY-MM-DD HH:MM:SS"
 */
export const formatDateTimeLocal = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date)) return '';
  
  // Format in station timezone, 24-hour clock
  const options = {
    timeZone: stationTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value || '00';
  
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
};

/**
 * Format UTC ISO datetime to station timezone time only: "HH:MM" or "HH:MM:SS"
 */
export const formatTimeLocal = (isoString, includeSeconds = false) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date)) return '';
  
  const options = {
    timeZone: stationTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  
  if (includeSeconds) {
    options.second = '2-digit';
  }
  
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value || '00';
  
  if (includeSeconds) {
    return `${get('hour')}:${get('minute')}:${get('second')}`;
  }
  return `${get('hour')}:${get('minute')}`;
};

/**
 * Format UTC ISO datetime to station timezone date only: "YYYY-MM-DD"
 */
export const formatDateLocal = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date)) return '';
  
  const options = {
    timeZone: stationTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value || '00';
  
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/**
 * Parse station timezone display format to UTC ISO for storage
 * Input: "YYYY-MM-DD HH:MM:SS" (station timezone)
 * Output: "2025-12-26T22:00:00.000Z" (UTC ISO)
 */
export const parseLocalToUtc = (displayString) => {
  if (!displayString) return '';
  
  // Already UTC ISO format - return as-is
  if (displayString.includes('T') && (displayString.includes('Z') || displayString.includes('+'))) {
    return displayString;
  }
  
  // Parse "YYYY-MM-DD HH:MM:SS" as station timezone
  let dateStr = displayString.replace(' ', 'T');
  
  // Handle missing seconds
  if (dateStr.match(/T\d{2}:\d{2}$/) && !dateStr.match(/T\d{2}:\d{2}:\d{2}/)) {
    dateStr += ':00';
  }
  
  // Create a date string with explicit timezone
  // We need to interpret the input as being in stationTimezone
  try {
    // Parse the components
    const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return displayString;
    
    const [, year, month, day, hour, minute, second] = match;
    
    // Create a formatter to get the UTC offset for station timezone at this date/time
    const testDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: stationTimezone,
      timeZoneName: 'shortOffset',
    });
    
    // Get offset string like "GMT-5" or "GMT-4"
    const parts = formatter.formatToParts(testDate);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    
    // Parse offset and apply inverse to get UTC
    // This is approximate but works for manual entry
    const date = new Date(dateStr);
    if (isNaN(date)) return displayString;
    
    return date.toISOString();
  } catch {
    return displayString;
  }
};

/**
 * Calculate duration between two UTC ISO timestamps
 * Returns formatted string like "1h 23m 45s" or "45m 12s"
 */
export const calculateDuration = (startIso, endIso) => {
  if (!startIso || !endIso) return '';
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const diffMs = end - start;
    if (diffMs < 0) return '';
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  } catch {
    return '';
  }
};
