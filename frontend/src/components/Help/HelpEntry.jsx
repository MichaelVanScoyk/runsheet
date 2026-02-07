/**
 * HelpEntry.jsx - Single help entry in the help panel
 */

import { useRef, useEffect } from 'react';
import { useHelp } from '../../contexts/HelpContext';

export default function HelpEntry({ entry, onEdit, onDelete }) {
  const { activeElementKey, activeEntryKey, setActiveEntryKey, editMode, tourActive, tourIndex, entries, userSession } = useHelp();
  const ref = useRef(null);

  const isHighlighted = activeElementKey === entry.element_key;
  const isTourActive = tourActive && entries[tourIndex]?.id === entry.id;
  const isActive = isHighlighted || isTourActive;

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);

  const isAdmin = userSession?.role === 'ADMIN' || userSession?.role === 'OFFICER';

  const roleColors = { MEMBER: '#6b7280', OFFICER: '#f59e0b', ADMIN: '#dc2626' };

  return (
    <div
      ref={ref}
      onMouseEnter={() => setActiveEntryKey(entry.element_key)}
      onMouseLeave={() => setActiveEntryKey(null)}
      style={{
        padding: '0.75rem', marginBottom: '0.5rem',
        background: isActive ? '#fffbeb' : '#fff',
        border: isActive ? '2px solid #f59e0b' : '1px solid #e5e7eb',
        borderRadius: '6px', transition: 'all 0.15s ease', cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span style={{ fontWeight: 600, color: '#333', flex: 1, fontSize: '0.9rem' }}>{entry.title}</span>
        {entry.min_role && (
          <span style={{ background: roleColors[entry.min_role] || '#6b7280', color: '#fff', fontSize: '0.6rem', fontWeight: 600, padding: '1px 5px', borderRadius: '3px' }}>{entry.min_role}</span>
        )}
      </div>
      <div style={{ fontSize: '0.85rem', color: '#555', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{entry.body}</div>
      {editMode && isAdmin && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.5rem' }}>
          <button onClick={() => onEdit(entry)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', color: '#666', cursor: 'pointer' }}>✏️ Edit</button>
          <button onClick={() => onDelete(entry)} style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', color: '#dc2626', cursor: 'pointer' }}>🗑️ Delete</button>
        </div>
      )}
    </div>
  );
}
