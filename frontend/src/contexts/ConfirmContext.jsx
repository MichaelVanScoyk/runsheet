/**
 * ConfirmContext - Replaces all native confirm() calls with styled modals.
 * 
 * Usage:
 *   const confirm = useConfirm();
 *   const ok = await confirm('Close this incident?');
 *   if (ok) { ... }
 * 
 * With options:
 *   const ok = await confirm('Delete permanently?', {
 *     confirmText: 'Delete',
 *     danger: true,
 *     details: 'This action cannot be undone.',
 *   });
 * 
 * The modal matches the existing delete confirmation in ActionBar.jsx:
 * white card, centered, clear message, Cancel/Confirm buttons.
 */
import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        message,
        confirmText: options.confirmText || 'OK',
        cancelText: options.cancelText || 'Cancel',
        danger: options.danger || false,
        details: options.details || null,
      });
    });
  }, []);

  const handleConfirm = () => {
    resolveRef.current?.(true);
    setState(null);
  };

  const handleCancel = () => {
    resolveRef.current?.(false);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
          }}
          onClick={handleCancel}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '420px',
              width: 'calc(100% - 2rem)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{
              color: '#333',
              fontSize: '0.95rem',
              lineHeight: 1.5,
              marginBottom: state.details ? '0.5rem' : '1.25rem',
            }}>
              {state.message}
            </p>

            {state.details && (
              <p style={{
                color: state.danger ? '#dc2626' : '#666',
                fontSize: '0.85rem',
                lineHeight: 1.4,
                marginBottom: '1.25rem',
                fontWeight: state.danger ? 500 : 400,
              }}>
                {state.details}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancel}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  background: '#f5f5f5',
                  color: '#333',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                {state.cancelText}
              </button>
              <button
                onClick={handleConfirm}
                autoFocus
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  border: 'none',
                  background: state.danger ? '#dc2626' : 'var(--primary-color, #1e3a5f)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                }}
              >
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return context;
}
