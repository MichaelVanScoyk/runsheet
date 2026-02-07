/**
 * HelpHighlight.jsx - Visual overlay for highlighting targeted page elements
 */

import { useState, useEffect } from 'react';
import { useHelp } from '../../contexts/HelpContext';

export default function HelpHighlight() {
  const { helpOpen, activeEntryKey } = useHelp();
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!helpOpen || !activeEntryKey) { setRect(null); return; }

    const el = document.querySelector(`[data-help-id="${activeEntryKey}"]`);
    if (!el) { setRect(null); return; }

    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const updateRect = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height });
    };
    updateRect();

    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => { window.removeEventListener('scroll', updateRect, true); window.removeEventListener('resize', updateRect); };
  }, [helpOpen, activeEntryKey]);

  if (!rect) return null;

  return (
    <div style={{
      position: 'absolute', top: rect.top - 4, left: rect.left - 4,
      width: rect.width + 8, height: rect.height + 8,
      border: '2px solid #f59e0b', borderRadius: '6px',
      background: 'rgba(245, 158, 11, 0.08)', pointerEvents: 'none',
      zIndex: 9998, transition: 'all 0.2s ease',
      boxShadow: '0 0 12px rgba(245, 158, 11, 0.3)',
    }} />
  );
}
