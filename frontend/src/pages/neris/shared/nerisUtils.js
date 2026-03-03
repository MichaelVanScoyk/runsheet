/**
 * NERIS Page Utilities
 * Extracted from NerisPage.jsx — shared formatting and style constants
 */

export function btnStyle(bg, color, border) {
  return {
    padding: '0.4rem 0.85rem', fontSize: '0.8rem', fontWeight: 500,
    background: bg, color, border: `1px solid ${border}`, borderRadius: '5px',
    cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

export const thStyle = { textAlign: 'left', padding: '0.35rem 0.5rem', color: '#6b7280', fontWeight: 600, fontSize: '0.7rem' };
export const tdStyle = { padding: '0.35rem 0.5rem', color: '#1f2937' };

export function toLocalDatetimeStr(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return '';
  }
}

export function formatTs(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return val;
  }
}

export function formatBool(val) {
  if (val === true) return 'Yes';
  if (val === false) return 'No';
  return '—';
}

export function formatLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function formatNerisCode(val) {
  if (!val) return '—';
  const parts = val.split('||');
  const last = parts[parts.length - 1];
  return last.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
