/**
 * HelpContext.jsx - Help System Context Provider
 * 
 * Manages:
 * - Help panel toggle (persisted in localStorage)
 * - Current page key detection from route
 * - Help entries for current page (loaded from API)
 * - Active element key (which element is being hovered)
 * - Edit mode state (admin inline editing)
 * - Tour mode state
 * - Help settings (toggle visibility, edit mode from admin)
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { getHelpForPage } from '../api';

const HelpContext = createContext(null);

// Map routes to page keys
function getPageKeyFromPath(pathname) {
  if (pathname === '/' || pathname === '') return 'incidents';
  if (pathname === '/reports') return 'reports';
  if (pathname === '/analytics') return 'analytics';
  if (pathname === '/admin') return 'admin';
  return pathname.replace(/^\//, '').replace(/\//g, '/');
}

export function HelpProvider({ children, userSession }) {
  const [helpOpen, setHelpOpen] = useState(() => {
    try { return localStorage.getItem('helpOpen') === 'true'; } catch { return false; }
  });

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeElementKey, setActiveElementKey] = useState(null);
  const [activeEntryKey, setActiveEntryKey] = useState(null);
  const [adminTab, setAdminTab] = useState('settings');
  const [tourActive, setTourActive] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [helpSettings, setHelpSettings] = useState({
    toggle_visible: true,
    edit_mode: false,
  });

  const location = useLocation();
  const basePage = getPageKeyFromPath(location.pathname);
  const pageKey = basePage === 'admin' ? `admin/${adminTab}` : basePage;

  // Persist help open state
  useEffect(() => {
    try { localStorage.setItem('helpOpen', String(helpOpen)); } catch {}
  }, [helpOpen]);

  // Load help settings from backend
  useEffect(() => {
    fetch('/api/settings/category/help')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const settings = {};
        data.forEach(s => {
          settings[s.key] = s.value_type === 'boolean'
            ? (s.raw_value || s.value + '').toLowerCase() === 'true'
            : s.value;
        });
        setHelpSettings(prev => ({ ...prev, ...settings }));
      })
      .catch(() => {});
  }, []);

  // Load entries when page changes or panel opens
  useEffect(() => {
    if (!helpOpen) return;

    setLoading(true);
    setActiveElementKey(null);
    setActiveEntryKey(null);
    setTourActive(false);
    setTourIndex(0);

    const role = userSession?.role || null;
    getHelpForPage(pageKey, role)
      .then(res => setEntries(res.data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [pageKey, helpOpen, userSession?.role]);

  const toggleHelp = useCallback(() => {
    setHelpOpen(prev => !prev);
  }, []);

  const reloadEntries = useCallback(() => {
    const role = userSession?.role || null;
    getHelpForPage(pageKey, role)
      .then(res => setEntries(res.data))
      .catch(() => setEntries([]));
  }, [pageKey, userSession?.role]);

  const startTour = useCallback(() => {
    if (entries.length === 0) return;
    setTourActive(true);
    setTourIndex(0);
    setActiveEntryKey(entries[0]?.element_key || null);
  }, [entries]);

  const tourNext = useCallback(() => {
    setTourIndex(prev => {
      const next = Math.min(prev + 1, entries.length - 1);
      setActiveEntryKey(entries[next]?.element_key || null);
      return next;
    });
  }, [entries]);

  const tourPrev = useCallback(() => {
    setTourIndex(prev => {
      const next = Math.max(prev - 1, 0);
      setActiveEntryKey(entries[next]?.element_key || null);
      return next;
    });
  }, [entries]);

  const tourExit = useCallback(() => {
    setTourActive(false);
    setTourIndex(0);
    setActiveEntryKey(null);
  }, []);

  const value = {
    helpOpen, entries, loading, activeElementKey, activeEntryKey,
    pageKey, tourActive, tourIndex, editMode: helpSettings.edit_mode, helpSettings,
    setActiveElementKey, setActiveEntryKey, setAdminTab, setHelpSettings,
    toggleHelp, reloadEntries, startTour, tourNext, tourPrev, tourExit,
    userSession,
  };

  return (
    <HelpContext.Provider value={value}>
      {children}
    </HelpContext.Provider>
  );
}

export function useHelp() {
  const ctx = useContext(HelpContext);
  if (!ctx) {
    // Return safe no-op defaults if used outside HelpProvider
    return {
      helpOpen: false, entries: [], loading: false,
      activeElementKey: null, activeEntryKey: null,
      pageKey: '', tourActive: false, tourIndex: 0,
      editMode: false, helpSettings: { toggle_visible: false, edit_mode: false },
      setActiveElementKey: () => {}, setActiveEntryKey: () => {},
      setAdminTab: () => {}, setHelpSettings: () => {},
      toggleHelp: () => {}, reloadEntries: () => {},
      startTour: () => {}, tourNext: () => {}, tourPrev: () => {}, tourExit: () => {},
      userSession: null,
    };
  }
  return ctx;
}
