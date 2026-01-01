import { useState, useEffect, useCallback, useRef } from 'react';
import { getIncidents, getIncident } from '../../../api';

const POLL_INTERVAL_MS = 5000; // 5 seconds
const ONE_HOUR_MS = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Hook to poll for incidents that qualify for the Incident Hub Modal.
 * 
 * Qualifying incidents:
 * - status === 'OPEN' (active incident)
 * - status === 'CLOSED' AND cad_clear_received_at < 1 hour ago
 * 
 * @returns {Object} { qualifyingIncidents, loading, error, refetch }
 */
export default function useActiveIncidents() {
  const [qualifyingIncidents, setQualifyingIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const lastFetchRef = useRef(null);

  /**
   * Check if an incident qualifies for the modal
   */
  const isQualifying = useCallback((incident) => {
    // OPEN incidents always qualify
    if (incident.status === 'OPEN') {
      return true;
    }

    // CLOSED incidents qualify if closed within the last hour
    if (incident.status === 'CLOSED' && incident.cad_clear_received_at) {
      const clearTime = new Date(incident.cad_clear_received_at).getTime();
      const now = Date.now();
      const hourAgo = now - ONE_HOUR_MS;
      return clearTime > hourAgo;
    }

    return false;
  }, []);

  /**
   * Fetch and filter qualifying incidents
   */
  const fetchQualifyingIncidents = useCallback(async () => {
    try {
      // Fetch current year's incidents
      const year = new Date().getFullYear();
      const res = await getIncidents(year, null, null);
      const allIncidents = res.data.incidents || [];

      // Filter to qualifying incidents
      const qualifying = allIncidents.filter(isQualifying);

      // For qualifying incidents, we need full details (including cad_clear_received_at)
      // The list endpoint may not include all fields, so fetch full details
      const fullIncidents = await Promise.all(
        qualifying.map(async (inc) => {
          try {
            const fullRes = await getIncident(inc.id);
            return fullRes.data;
          } catch (err) {
            console.error(`Failed to fetch incident ${inc.id}:`, err);
            return inc; // Fall back to summary data
          }
        })
      );

      // Re-filter with full data (in case cad_clear_received_at wasn't in summary)
      const finalQualifying = fullIncidents.filter(isQualifying);

      // Sort by dispatch time (newest first)
      finalQualifying.sort((a, b) => {
        const aTime = a.time_dispatched ? new Date(a.time_dispatched).getTime() : 0;
        const bTime = b.time_dispatched ? new Date(b.time_dispatched).getTime() : 0;
        return bTime - aTime;
      });

      setQualifyingIncidents(finalQualifying);
      setError(null);
      lastFetchRef.current = Date.now();
    } catch (err) {
      console.error('Failed to fetch qualifying incidents:', err);
      setError(err.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, [isQualifying]);

  /**
   * Start polling
   */
  useEffect(() => {
    // Initial fetch
    fetchQualifyingIncidents();

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      fetchQualifyingIncidents();
    }, POLL_INTERVAL_MS);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchQualifyingIncidents]);

  /**
   * Manual refetch (e.g., after save)
   */
  const refetch = useCallback(() => {
    return fetchQualifyingIncidents();
  }, [fetchQualifyingIncidents]);

  return {
    qualifyingIncidents,
    loading,
    error,
    refetch,
    lastFetch: lastFetchRef.current,
  };
}

/**
 * Check if a single incident qualifies for the modal.
 * Exported for use in IncidentsPage routing logic.
 */
export function incidentQualifiesForModal(incident) {
  if (!incident) return false;

  // OPEN incidents always qualify
  if (incident.status === 'OPEN') {
    return true;
  }

  // CLOSED incidents qualify if closed within the last hour
  if (incident.status === 'CLOSED' && incident.cad_clear_received_at) {
    const clearTime = new Date(incident.cad_clear_received_at).getTime();
    const now = Date.now();
    const hourAgo = now - ONE_HOUR_MS;
    return clearTime > hourAgo;
  }

  return false;
}
