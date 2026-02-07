/**
 * HelpTourControls.jsx - Guided tour navigation bar
 */

import { useHelp } from '../../contexts/HelpContext';

export default function HelpTourControls() {
  const { tourActive, tourIndex, entries, tourNext, tourPrev, tourExit } = useHelp();

  if (!tourActive || entries.length === 0) return null;

  const current = entries[tourIndex];
  const isFirst = tourIndex === 0;
  const isLast = tourIndex === entries.length - 1;

  return (
    <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '0.5rem 0.75rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#92400e' }}>🎯 Tour: {tourIndex + 1} of {entries.length}</span>
        <button onClick={tourExit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: '0.75rem', fontWeight: 600 }}>✕ Exit Tour</button>
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#333', marginBottom: '0.25rem' }}>{current?.title}</div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={tourPrev} disabled={isFirst} style={{ flex: 1, padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '4px', background: isFirst ? '#f5f5f5' : '#fff', cursor: isFirst ? 'default' : 'pointer', fontSize: '0.8rem', color: isFirst ? '#ccc' : '#555' }}>← Prev</button>
        <button onClick={tourNext} disabled={isLast} style={{ flex: 1, padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '4px', background: isLast ? '#f5f5f5' : '#fff', cursor: isLast ? 'default' : 'pointer', fontSize: '0.8rem', color: isLast ? '#ccc' : '#555' }}>Next →</button>
      </div>
    </div>
  );
}
