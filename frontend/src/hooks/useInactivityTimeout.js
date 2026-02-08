/**
 * useInactivityTimeout Hook
 * 
 * Handles automatic inactivity timeouts with two tiers:
 * - 10 minutes inactivity: Log out personnel session (user login)
 * - 15 minutes inactivity: Hard page reload to "/" (full fresh state reset)
 * 
 * Uses react-idle-timer library for robust idle detection.
 * 
 * CROSS-TAB SUPPORT:
 * - crossTab: true enables idle timer sync across all browser tabs
 * - Inactivity in one tab = inactivity across all tabs
 * - Timeout triggers simultaneously in all tabs
 * - Uses BroadcastChannel API with localStorage fallback
 * 
 * Behavior:
 * - 10 min idle: Clear personnel session (logout user, keep on current page)
 * - 15 min idle: Hard reload to "/" - guarantees completely fresh state
 *   (current year, no filters, no open forms/modals, as if visiting fresh)
 * 
 * NOTE: This does NOT affect tenant session (department-level login via cookie).
 * Tenant session only expires on explicit logout.
 * 
 * @module hooks/useInactivityTimeout
 */

import { useCallback, useEffect, useRef } from 'react';
import { useIdleTimer } from 'react-idle-timer';
import { clearUserSession, getUserSession, USER_SESSION_KEY } from '../api';

// Timeout values in milliseconds
const LOGOUT_TIMEOUT_MS = 10 * 60 * 1000;     // 10 minutes - log out user session
const FULL_RESET_TIMEOUT_MS = 15 * 60 * 1000;  // 15 minutes - hard reload to fresh state

/**
 * Custom hook that manages inactivity timeout for the application.
 * 
 * @param {Object} options - Configuration options
 * @param {Function} options.onUserLogout - Callback when user session is cleared (for state sync)
 * @returns {Object} - Object containing reset function for manual timer reset if needed
 */
export function useInactivityTimeout({ onUserLogout } = {}) {
  const resetTimerRef = useRef(null);

  /**
   * Clear the full-reset timer
   */
  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  /**
   * Handle full page reset (called at 15 min)
   * Hard reload to "/" guarantees completely fresh state:
   * - Current year selected
   * - No filters active
   * - No forms or modals open
   * - Personnel logged out (already done at 10 min)
   */
  const handleFullReset = useCallback(() => {
    console.log('[InactivityTimeout] Full reset - hard reload to / after 15 min inactivity');
    window.location.href = '/';
  }, []);

  /**
   * Called when user has been idle for 10 minutes (LOGOUT_TIMEOUT_MS)
   * Logs out the personnel session, then starts timer for full reset at 15 min
   */
  const handleLogoutIdle = useCallback(() => {
    // Clear personnel session
    const session = getUserSession();
    if (session) {
      clearUserSession();
      if (onUserLogout) {
        onUserLogout();
      }
      console.log('[InactivityTimeout] User session cleared due to 10 min inactivity');
    }

    // Start the full-reset timer for the remaining 5 minutes (15 - 10 = 5)
    clearResetTimer();
    resetTimerRef.current = setTimeout(() => {
      handleFullReset();
    }, FULL_RESET_TIMEOUT_MS - LOGOUT_TIMEOUT_MS);

    console.log('[InactivityTimeout] Full reset timer started (5 min remaining)');
  }, [onUserLogout, clearResetTimer, handleFullReset]);

  /**
   * Called when user becomes active again
   * Clears the full-reset timer if it was running
   */
  const handleActive = useCallback(() => {
    clearResetTimer();
  }, [clearResetTimer]);

  /**
   * Listen for storage events from other tabs
   * When another tab clears the session, sync this tab's state
   */
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key !== USER_SESSION_KEY) return;

      // Session was cleared in another tab
      if (event.newValue === null && event.oldValue !== null) {
        console.log('[InactivityTimeout] Session cleared in another tab, syncing...');
        if (onUserLogout) {
          onUserLogout();
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [onUserLogout]);

  // Cleanup reset timer on unmount
  useEffect(() => {
    return () => clearResetTimer();
  }, [clearResetTimer]);

  // Initialize the idle timer with cross-tab support
  // This fires at 10 minutes for the logout
  const { reset, getRemainingTime, isIdle } = useIdleTimer({
    timeout: LOGOUT_TIMEOUT_MS,
    onIdle: handleLogoutIdle,
    onActive: handleActive,
    debounce: 500,
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
    startOnMount: true,
    stopOnIdle: false,
    crossTab: true,
    name: 'cadreport-idle-timer',
    syncTimers: 500,
  });

  // Custom reset that also clears the full-reset timer
  const resetAll = useCallback(() => {
    clearResetTimer();
    reset();
  }, [clearResetTimer, reset]);

  return {
    resetInactivityTimer: resetAll,
    getRemainingTime,
    isIdle,
  };
}

export default useInactivityTimeout;
