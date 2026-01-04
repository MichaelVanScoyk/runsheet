/**
 * useInactivityTimeout Hook
 * 
 * Handles automatic session timeout after 15 minutes of user inactivity.
 * Uses react-idle-timer library for robust idle detection.
 * 
 * Behavior:
 * - If user is logged in (personnel session) and goes idle: logs them out silently
 * - If user is on any page other than "/" (IncidentsPage) and goes idle: redirects to "/"
 * - If user is already on "/" and not logged in: no action (they're already home)
 * 
 * NOTE: This does NOT affect tenant session (department-level login via cookie).
 * Tenant session only expires on explicit logout.
 * 
 * @module hooks/useInactivityTimeout
 */

import { useCallback } from 'react';
import { useIdleTimer } from 'react-idle-timer';
import { useNavigate, useLocation } from 'react-router-dom';
import { clearUserSession, getUserSession } from '../api';

// 15 minutes in milliseconds
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Custom hook that manages inactivity timeout for the application.
 * 
 * @param {Object} options - Configuration options
 * @param {Function} options.onUserLogout - Callback when user session is cleared (for state sync)
 * @returns {Object} - Object containing reset function for manual timer reset if needed
 */
export function useInactivityTimeout({ onUserLogout } = {}) {
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Called when user has been idle for INACTIVITY_TIMEOUT_MS
   * Silently logs out user session and redirects to incidents page
   */
  const handleIdle = useCallback(() => {
    const session = getUserSession();
    const isOnIncidentsPage = location.pathname === '/';

    // If user is logged in (personnel session), clear it
    if (session) {
      clearUserSession();
      // Notify parent component to sync state
      if (onUserLogout) {
        onUserLogout();
      }
      console.log('[InactivityTimeout] User session cleared due to inactivity');
    }

    // Redirect to incidents page if not already there
    if (!isOnIncidentsPage) {
      console.log('[InactivityTimeout] Redirecting to incidents page due to inactivity');
      navigate('/');
    }
  }, [location.pathname, navigate, onUserLogout]);

  // Initialize the idle timer
  const { reset, getRemainingTime, isIdle } = useIdleTimer({
    timeout: INACTIVITY_TIMEOUT_MS,
    onIdle: handleIdle,
    debounce: 500, // Debounce activity detection by 500ms for performance
    events: [
      'mousemove',
      'keydown',
      'wheel',
      'DOMMouseScroll',
      'mousewheel',
      'mousedown',
      'touchstart',
      'touchmove',
      'MSPointerDown',
      'MSPointerMove',
      'visibilitychange',
      'focus'
    ],
    // Start immediately on mount
    startOnMount: true,
    // Don't stop the timer when idle (we want continuous monitoring)
    stopOnIdle: false,
  });

  return {
    // Expose reset in case we need to manually reset the timer
    resetInactivityTimer: reset,
    // Expose these for debugging if needed
    getRemainingTime,
    isIdle,
  };
}

export default useInactivityTimeout;
