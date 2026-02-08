/**
 * AccordionSection - Collapsible section wrapper for mobile RunSheet
 * 
 * Wraps RunSheet sections in a tappable header that expands/collapses content.
 * Shows a title, optional summary text, and expand/collapse indicator.
 * 
 * Used only on mobile — desktop renders sections directly without this wrapper.
 */

import { useState } from 'react';

export default function AccordionSection({ 
  title, 
  summary, 
  defaultOpen = false, 
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '6px',
      marginBottom: '6px',
      border: '1px solid var(--border-color)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          padding: '12px',
          background: open ? 'var(--bg-section)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div>
          <div style={{ 
            fontWeight: '600', 
            fontSize: '0.9rem', 
            color: 'var(--text-primary)',
          }}>
            {title}
          </div>
          {!open && summary && (
            <div style={{ 
              fontSize: '0.78rem', 
              color: 'var(--text-hint)', 
              marginTop: '2px',
            }}>
              {summary}
            </div>
          )}
        </div>
        <span style={{ 
          fontSize: '1.1rem', 
          color: 'var(--text-hint)',
          transition: 'transform 0.2s ease',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>
          ▾
        </span>
      </button>
      {open && (
        <div style={{ padding: '12px', paddingTop: '4px' }}>
          {children}
        </div>
      )}
    </div>
  );
}
