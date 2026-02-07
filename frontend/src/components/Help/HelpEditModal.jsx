/**
 * HelpEditForm.jsx - Inline edit form inside the help panel
 * 
 * Replaces the old modal so admins can see the page while writing help.
 * Scans the DOM for data-help-id attributes to populate element key dropdown.
 * File kept as HelpEditModal.jsx to avoid changing imports.
 */

import { useState, useEffect, useMemo } from 'react';

const ROLE_OPTIONS = [
  { value: '', label: 'Everyone' },
  { value: 'MEMBER', label: 'Members+' },
  { value: 'OFFICER', label: 'Officers+' },
  { value: 'ADMIN', label: 'Admins only' },
];

export default function HelpEditForm({ entry, pageKey, existingKeys, onSave, onCancel }) {
  const isEdit = !!entry?.id;
  const [formData, setFormData] = useState({
    page_key: pageKey || '', element_key: '', title: '', body: '',
    sort_order: 100, min_role: '', is_new: false, version_added: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Scan DOM for all data-help-id attributes
  const availableKeys = useMemo(() => {
    const elements = document.querySelectorAll('[data-help-id]');
    const keys = new Set();
    elements.forEach(el => {
      const key = el.getAttribute('data-help-id');
      if (key) keys.add(key);
    });
    return Array.from(keys).sort();
  }, []);

  // Filter to only show keys that don't already have entries (unless editing)
  const unusedKeys = useMemo(() => {
    if (!existingKeys) return availableKeys;
    const used = new Set(existingKeys);
    return availableKeys.filter(k => !used.has(k));
  }, [availableKeys, existingKeys]);

  useEffect(() => {
    if (entry) {
      setFormData({
        page_key: entry.page_key || pageKey || '',
        element_key: entry.element_key || '',
        title: entry.title || '',
        body: entry.body || '',
        sort_order: entry.sort_order ?? 100,
        min_role: entry.min_role || '',
        is_new: entry.is_new || false,
        version_added: entry.version_added || '',
      });
    }
  }, [entry, pageKey]);

  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    setError('');
    if (!formData.element_key.trim() || !formData.title.trim() || !formData.body.trim()) {
      setError('Element key, title, and help text are required');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...formData,
        min_role: formData.min_role || null,
        version_added: formData.version_added || null,
      }, entry?.id);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '0.4rem', border: '1px solid #d1d5db',
    borderRadius: '4px', fontSize: '0.8rem', boxSizing: 'border-box',
  };

  return (
    <div style={{
      background: '#f0f7ff', borderBottom: '2px solid #2563eb',
      padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
    }}>
      <div style={{ fontWeight: 600, color: '#2563eb', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
        {isEdit ? '✏️ Edit Entry' : '➕ New Entry'}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.4rem', borderRadius: '4px', fontSize: '0.75rem' }}>
          {error}
        </div>
      )}

      {/* Element Key - dropdown from DOM scan */}
      <div>
        <label style={{ display: 'block', color: '#555', fontSize: '0.75rem', marginBottom: '2px' }}>Element</label>
        {isEdit ? (
          <input type="text" value={formData.element_key} disabled style={{ ...inputStyle, background: '#f5f5f5' }} />
        ) : (
          <select
            value={formData.element_key}
            onChange={(e) => handleChange('element_key', e.target.value)}
            style={inputStyle}
          >
            <option value="">-- Select element --</option>
            {unusedKeys.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        )}
      </div>

      {/* Title */}
      <div>
        <label style={{ display: 'block', color: '#555', fontSize: '0.75rem', marginBottom: '2px' }}>Title</label>
        <input type="text" value={formData.title} onChange={(e) => handleChange('title', e.target.value)} style={inputStyle} />
      </div>

      {/* Help Text */}
      <div>
        <label style={{ display: 'block', color: '#555', fontSize: '0.75rem', marginBottom: '2px' }}>Help Text</label>
        <textarea
          value={formData.body}
          onChange={(e) => handleChange('body', e.target.value)}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {/* Sort Order + Visible To - compact row */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', color: '#555', fontSize: '0.75rem', marginBottom: '2px' }}>Order</label>
          <input
            type="number" value={formData.sort_order}
            onChange={(e) => handleChange('sort_order', parseInt(e.target.value) || 100)}
            min={1} max={9999} style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', color: '#555', fontSize: '0.75rem', marginBottom: '2px' }}>Visible To</label>
          <select value={formData.min_role} onChange={(e) => handleChange('min_role', e.target.value)} style={inputStyle}>
            {ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      </div>

      {/* Version + NEW checkbox - compact row */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', color: '#555', fontSize: '0.75rem', marginBottom: '2px' }}>Version</label>
          <input type="text" value={formData.version_added} onChange={(e) => handleChange('version_added', e.target.value)} style={inputStyle} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#555', cursor: 'pointer', paddingBottom: '0.4rem' }}>
          <input type="checkbox" checked={formData.is_new} onChange={(e) => handleChange('is_new', e.target.checked)} />
          NEW
        </label>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', marginTop: '0.25rem' }}>
        <button
          type="button" onClick={onCancel}
          style={{ padding: '0.35rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '0.8rem', color: '#666' }}
        >
          Cancel
        </button>
        <button
          type="button" onClick={handleSubmit} disabled={saving}
          style={{ padding: '0.35rem 0.75rem', border: 'none', borderRadius: '4px', background: '#2563eb', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: '0.8rem' }}
        >
          {saving ? 'Saving...' : (isEdit ? 'Update' : 'Create')}
        </button>
      </div>
    </div>
  );
}
