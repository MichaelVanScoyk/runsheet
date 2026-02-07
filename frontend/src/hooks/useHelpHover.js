/**
 * useHelpHover.js - Mouse hover detection for data-help-id elements
 * 
 * When help panel is open, listens for mouseover on the main content area.
 * If hovered element (or ancestor) has data-help-id, sets activeElementKey
 * so the panel can highlight/scroll to the matching entry.
 */

import { useEffect, useCallback } from 'react';
import { useHelp } from '../contexts/HelpContext';

export function useHelpHover() {
  const { helpOpen, setActiveElementKey } = useHelp();

  const handleMouseOver = useCallback((e) => {
    let el = e.target;
    while (el && el !== document.body) {
      const helpId = el.getAttribute('data-help-id');
      if (helpId) {
        setActiveElementKey(helpId);
        return;
      }
      el = el.parentElement;
    }
    setActiveElementKey(null);
  }, [setActiveElementKey]);

  useEffect(() => {
    if (!helpOpen) return;
    const app = document.querySelector('.app');
    if (!app) return;
    app.addEventListener('mouseover', handleMouseOver);
    return () => app.removeEventListener('mouseover', handleMouseOver);
  }, [helpOpen, handleMouseOver]);
}
