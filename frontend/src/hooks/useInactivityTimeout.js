/**
 * useInactivityTimeout Hook
 * 
 * Handles automatic inactivity timeouts with two tiers:
 * - 10 minutes: Redirect to incidents page ("/")
 * - 15 minutes: Log out user session (personnel login)
 * 
 * Uses react-idle-timer library for robust idle detection.
 * 
 * CROSS-TAB SUPPORT (Updated January 2025):
 * - crossTab: true enables idle timer sync across all browser tabs
 * - Inactivity in one tab = inactivity across all tabs
 * - Timeout triggers simultaneously in all tabs
 * - Uses BroadcastChannel API with localStorage fallback
 * 
 * Behavior:
 * - 10 min idle: Redirect to "/" (incidents page) from any other page
 * - 15 min idle: Clear personnel session (logout)
 * - If already on "/" and not logged in at 15 min: no action
 * 
 * NOTE: This does NOT affect tenant session (department-level login via cookie).
 * Tenant session only expires on explicit logout.
 * 
 * @module hooks/useInactivityTimeout
 */

import { useCallback, useEffect, useRef } from 'react';
import { useIdleTimer } from 'react-idle-timer';
import { useNavigate, useLocation } from 'react-router-dom';
import { clearUserSession, getUserSession, USER_SESSION_KEY } from '../api';

// Timeout values in milliseconds
const REDIRECT_TIMEOUT_MS = 10 * 60 * 1000;  // 10 minutes - redirect to incidents page
const LOGOUT_TIMEOUT_MS = 15 * 60 * 1000;    // 15 minutes - log out user session

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
  const logoutTimerRef = useRef(null);

  /**
   * Clear the logout timer
   */
  const clearLogoutTimer = useCallback(() => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  }, []);

  /**
   * Handle user logout (called at 15 min)
   */
  const handleLogout = useCallback(() => {
    const session = getUserSession();
    if (session) {
      clearUserSession();
      if (onUserLogout) {
        onUserLogout();
      }
      console.log('[InactivityTimeout] User session cleared due to 15 min inactivity');
    }
  }, [onUserLogout]);

  /**
   * Called when user has been idle for 10 minutes (REDIRECT_TIMEOUT_MS)
   * Redirects to incidents page and starts the logout timer for 5 more minutes
   */
  const handleRedirectIdle = useCallback(() => {
    const isOnIncidentsPage = location.pathname === '/';

    // Redirect to incidents page if not already there
    if (!isOnIncidentsPage) {
      console.log('[InactivityTimeout] Redirecting to incidents page due to 10 min inactivity');
      navigate('/');
    }

    // Start the logout timer for the remaining 5 minutes (15 - 10 = 5)
    clearLogoutTimer();
    logoutTimerRef.current = setTimeout(() => {
      handleLogout();
    }, LOGOUT_TIMEOUT_MS - REDIRECT_TIMEOUT_MS);
    
    console.log('[InactivityTimeout] Logout timer started (5 min remaining)');
  }, [location.pathname, navigate, clearLogoutTimer, handleLogout]);

  /**
   * Called when user becomes active again
   * Clears the logout timer if it was running
   */
  const handleActive = useCallback(() => {
    clearLogoutTimer();
  }, [clearLogoutTimer]);

  /**
   * Listen for storage events from other tabs
   * When another tab clears the session, sync this tab's state
   */
  useEffect(() => {
    const handleStorageChange = (event) => {
      // Only react to userSession changes
      if (event.key !== USER_SESSION_KEY) return;
      
      // Session was cleared in another tab
      if (event.newValue === null && event.oldValue !== null) {
        console.log('[InactivityTimeout] Session cleared in another tab, syncing...');
        if (onUserLogout) {
          onUserLogout();
        }
        // Redirect to incidents page if not already there
        if (location.pathname !== '/') {
          navigate('/');
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [location.pathname, navigate, onUserLogout]);

  // Cleanup logout timer on unmount
  useEffect(() => {
    return () => clearLogoutTimer();
  }, [clearLogoutTimer]);

  // Initialize the idle timer with cross-tab support
  // This fires at 10 minutes for the redirect
  const { reset, getRemainingTime, isIdle } = useIdleTimer({
    timeout: REDIRECT_TIMEOUT_MS,
    onIdle: handleRedirectIdle,
    onActive: handleActive,
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
    // CROSS-TAB SUPPORT: Sync idle state across all browser tabs
    crossTab: true,
    // Name for the cross-tab channel (unique per app)
    name: 'cadreport-idle-timer',
    // Sync timers across tabs every 500ms for consistency
    syncTimers: 500,
  });

  // Custom reset that also clears the logout timer
  const resetAll = useCallback(() => {
    clearLogoutTimer();
    reset();
  }, [clearLogoutTimer, reset]);

  return {
    // Expose reset in case we need to manually reset the timer
    resetInactivityTimer: resetAll,
    // Expose these for debugging if needed
    getRemainingTime,
    isIdle,
  };
}

export default useInactivityTimeout;
