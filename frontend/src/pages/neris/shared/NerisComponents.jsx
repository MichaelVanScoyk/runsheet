/**
 * NERIS Shared UI Components
 * Extracted from NerisPage.jsx — used across all NERIS tabs and sections
 */

export function PayloadSection({ title, children, expanded = true, onToggle, badge, color }) {
  return (
    <div style={{
      marginBottom: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '6px',
      overflow: 'hidden', borderLeft: color ? `3px solid ${color}` : undefined,
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.5rem 0.75rem', background: expanded ? '#f9fafb' : '#fff',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: color || '#374151' }}>
          {title}
          {badge !== undefined && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', fontWeight: 700,
              background: '#e5e7eb', padding: '1px 6px', borderRadius: '999px', color: '#6b7280' }}>{badge}</span>
          )}
        </span>
        <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && <div style={{ padding: '0.5rem 0.75rem', background: '#fff' }}>{children}</div>}
    </div>
  );
}

export function FieldGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.35rem 1rem' }}>{children}</div>;
}

export function Field({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div style={{ fontSize: '0.8rem' }}>
      <span style={{ color: '#6b7280' }}>{label}: </span>
      <span style={{ color: '#1f2937', fontWeight: 500 }}>{String(value)}</span>
    </div>
  );
}

export function FieldBlock({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
      <span style={{ color: '#6b7280', display: 'block', marginBottom: '0.15rem' }}>{label}:</span>
      <div style={{ color: '#1f2937', background: '#f9fafb', padding: '0.5rem', borderRadius: '4px', lineHeight: '1.4' }}>{value}</div>
    </div>
  );
}

export function StatusBadge({ children, color, bg, border }) {
  return (
    <span style={{ fontSize: '0.75rem', fontWeight: 600, color, background: bg, border: `1px solid ${border}`, padding: '0.25rem 0.6rem', borderRadius: '999px' }}>
      {children}
    </span>
  );
}

export function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: active ? 600 : 400,
      color: active ? '#2563eb' : '#6b7280', borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
      background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem',
    }}>
      {children}
    </button>
  );
}

export function Badge({ color, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: '18px', height: '18px', padding: '0 4px', borderRadius: '999px',
      background: color, color: '#fff', fontSize: '0.65rem', fontWeight: 700,
    }}>
      {children}
    </span>
  );
}
