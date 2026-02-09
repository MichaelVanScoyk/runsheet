/**
 * ToastContext - Replaces all native alert() calls with styled toast notifications.
 * 
 * Usage:
 *   const toast = useToast();
 *   toast.success('Incident saved');
 *   toast.error('Failed to save incident');
 * 
 * Toasts appear bottom-right, auto-dismiss (3s success, 5s error), and stack.
 */
import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

let toastIdCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const removeToast = useCallback((id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'success') => {
    const id = ++toastIdCounter;
    const duration = type === 'error' ? 5000 : 3000;

    setToasts(prev => [...prev, { id, message, type }]);

    timersRef.current[id] = setTimeout(() => {
      removeToast(id);
    }, duration);

    return id;
  }, [removeToast]);

  const toast = useCallback({
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    info: (msg) => addToast(msg, 'info'),
  }, [addToast]);

  // Stable reference
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const stableToast = useRef({
    success: (msg) => toastRef.current.success(msg),
    error: (msg) => toastRef.current.error(msg),
    info: (msg) => toastRef.current.info(msg),
  }).current;

  return (
    <ToastContext.Provider value={stableToast}>
      {children}
      {/* Toast container */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: '0.5rem',
          pointerEvents: 'none',
        }}>
          {toasts.map(t => (
            <div
              key={t.id}
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1rem',
                borderRadius: '6px',
                fontSize: '0.9rem',
                fontWeight: 500,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                cursor: 'pointer',
                animation: 'toast-slide-in 0.2s ease-out',
                maxWidth: '400px',
                ...(t.type === 'success' ? {
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  color: '#166534',
                } : t.type === 'error' ? {
                  background: '#fef2f2',
                  border: '1px solid #fca5a5',
                  color: '#991b1b',
                } : {
                  background: '#eff6ff',
                  border: '1px solid #93c5fd',
                  color: '#1e40af',
                }),
              }}
              onClick={() => removeToast(t.id)}
            >
              <span style={{ flexShrink: 0 }}>
                {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
              </span>
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
