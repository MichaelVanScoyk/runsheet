/**
 * Time utilities for UTC <-> Local conversion
 * 
 * Backend stores all times in true UTC.
 * Frontend displays in browser's local timezone.
 */

/**
 * Format UTC ISO datetime to local display: "YYYY-MM-DD HH:MM:SS"
 */
export const formatDateTimeLocal = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date)) return '';
  
  const pad = n => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * Format UTC ISO datetime to local time only: "HH:MM" or "HH:MM:SS"
 */
export const formatTimeLocal = (isoString, includeSeconds = false) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date)) return '';
  
  const pad = n => n.toString().padStart(2, '0');
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  
  if (includeSeconds) {
    const seconds = pad(date.getSeconds());
    return `${hours}:${minutes}:${seconds}`;
  }
  return `${hours}:${minutes}`;
};

/**
 * Format UTC ISO datetime to local date only: "YYYY-MM-DD"
 */
export const formatDateLocal = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date)) return '';
  
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Parse local display format to UTC ISO for storage
 * Input: "YYYY-MM-DD HH:MM:SS" (local time)
 * Output: "2025-12-26T22:00:00.000Z" (UTC ISO)
 */
export const parseLocalToUtc = (displayString) => {
  if (!displayString) return '';
  
  // Already UTC ISO format - return as-is
  if (displayString.includes('T') && (displayString.includes('Z') || displayString.includes('+'))) {
    return displayString;
  }
  
  // Parse "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS" as local time
  let dateStr = displayString.replace(' ', 'T');
  
  // Handle missing seconds
  if (dateStr.match(/T\d{2}:\d{2}$/) && !dateStr.match(/T\d{2}:\d{2}:\d{2}/)) {
    dateStr += ':00';
  }
  
  // Create date from local time string, then convert to UTC ISO
  const date = new Date(dateStr);
  if (isNaN(date)) return displayString;
  
  return date.toISOString();
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
