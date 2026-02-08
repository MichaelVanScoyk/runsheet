/**
 * useMobile Hook
 * 
 * Detects if the viewport is mobile-sized (<768px).
 * Uses window.matchMedia for efficient, event-driven detection.
 * No resize event listeners — matchMedia fires only on threshold crossing.
 * 
 * Usage:
 *   const isMobile = useMobile();
 *   return isMobile ? <MobileView /> : <DesktopView />;
 */

import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = '(max-width: 767px)';

export function useMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_BREAKPOINT).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const handler = (e) => setIsMobile(e.matches);
    
    // Modern browsers
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    // Safari <14 fallback
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  return isMobile;
}
