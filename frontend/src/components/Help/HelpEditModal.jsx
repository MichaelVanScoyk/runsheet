/**
 * HelpEditModal.jsx - Create/Edit help entry modal
 */

import { useState, useEffect } from 'react';

const ROLE_OPTIONS = [
  { value: '', label: 'Everyone' },
  { value: 'MEMBER', label: 'Members+' },
  { value: 'OFFICER', label: 'Officers+' },
  { value: 'ADMIN', label: 'Admins only' },
];

export default function HelpEditModal({ entry, pageKey, onSave, onCancel }) {
  const isEdit = !!entry?.id;
  const [formData, setFormData] = useState({
    page_key: pageKey || '', element_key: '', title: '', body: '',
    sort_order: 100, min_role: '', is_new: false, version_added: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.page_key.trim() || !formData.element_key.trim() || !formData.title.trim() || !formData.body.trim()) {
      setError('Page key, element key, title, and body are required');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...formData, min_role: formData.min_role || null, version_added: formData.version_added || null }, entry?.id);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div style={{ background: '#fff', borderRadius: '8px', padding: '1.5rem', width: '500px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>{isEdit ? 'Edit Help Entry' : 'Add Help Entry'}</h3>
        {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.5rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontWeight: 500, color: '#555', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Page Key</label>
            <input type="text" value={formData.page_key} onChange={(e) => handleChange('page_key', e.target.value)} disabled={!!pageKey} style={{ ...inputStyle, background: pageKey ? '#f5f5f5' : '#fff' }} />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontWeight: 500, color: '#555', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Element Key (data-help-id)</label>
            <input type="text" value={formData.element_key} onChange={(e) => handleChange('element_key', e.target.value)} disabled={isEdit} style={{ ...inputStyle, background: isEdit ? '#f5f5f5' : '#fff' }} />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontWeight: 500, color: '#555', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Title</label>
            <input type="text" value={formData.title} onChange={(e) => handleChange('title', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontWeight: 500, color: '#555', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Help Text</label>
            <textarea value={formData.body} onChange={(e) => handleChange('body', e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: 500, color: '#555', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Sort Order</label>
              <input type="number" value={formData.sort_order} onChange={(e) => handleChange('sort_order', parseInt(e.target.value) || 100)} min={1} max={9999} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: 500, color: '#555', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Visible To</label>
              <select value={formData.min_role} onChange={(e) => handleChange('min_role', e.target.value)} style={inputStyle}>
                {ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: 500, color: '#555', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Version</label>
              <input type="text" value={formData.version_added} onChange={(e) => handleChange('version_added', e.target.value)} style={inputStyle} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', cursor: 'pointer', fontSize: '0.85rem', color: '#555' }}>
            <input type="checkbox" checked={formData.is_new} onChange={(e) => handleChange('is_new', e.target.checked)} />
            Mark as "NEW"
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" onClick={onCancel} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#666' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '4px', background: '#2563eb', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: '0.85rem' }}>{saving ? 'Saving...' : (isEdit ? 'Update' : 'Create')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
