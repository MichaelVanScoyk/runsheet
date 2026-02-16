/**
 * FeatureEditor.jsx — Place, edit, and delete map features
 *
 * Phase 4: Edit mode for OFFICER / ADMIN users.
 * All placement state (coords, layer) is managed by MapPage and passed as props.
 *
 * Props:
 *   layers           - Array of layers from /api/map/layers
 *   onFeatureCreated - (feature) => void
 *   onFeatureUpdated - (feature) => void
 *   onFeatureDeleted - (featureId) => void
 *   selectedFeature  - Currently selected feature for editing
 *   onClearSelection - () => void
 *   isPlacing        - boolean
 *   onStartPlacing   - (layerId) => void
 *   onCancelPlacing  - () => void
 *   placingLayerId   - number
 *   placementCoords  - { lat, lng } — set by MapPage when map is clicked during placement
 */

import { useState, useEffect, useCallback } from 'react';

export default function FeatureEditor({
  layers = [],
  onFeatureCreated,
  onFeatureUpdated,
  onFeatureDeleted,
  selectedFeature,
  onClearSelection,
  isPlacing,
  onStartPlacing,
  onCancelPlacing,
  placingLayerId,
  placementCoords,
}) {
  const [formTitle, setFormTitle] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formRadius, setFormRadius] = useState('');
  const [formProperties, setFormProperties] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  // Placeable layer types
  const placeableLayers = layers.filter(l =>
    ['hydrant', 'dry_hydrant', 'draft_point', 'hazard', 'closure',
     'informational', 'preplan'].includes(l.layer_type)
  );

  const activeLayer = placingLayerId
    ? layers.find(l => l.id === placingLayerId)
    : selectedFeature
      ? layers.find(l => l.id === selectedFeature.layer_id)
      : null;

  // Populate form when editing existing feature
  useEffect(() => {
    if (selectedFeature && editing) {
      setFormTitle(selectedFeature.title || '');
      setFormNotes(selectedFeature.notes || '');
      setFormAddress(selectedFeature.address || '');
      setFormRadius(selectedFeature.radius_meters ? String(selectedFeature.radius_meters) : '');
      setFormProperties(selectedFeature.properties || {});
    }
  }, [selectedFeature, editing]);

  const resetForm = useCallback(() => {
    setFormTitle('');
    setFormNotes('');
    setFormAddress('');
    setFormRadius('');
    setFormProperties({});
    setError('');
    setEditing(false);
  }, []);

  // Save new or update existing
  const handleSave = async () => {
    if (!formTitle.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError('');

    const body = {
      title: formTitle.trim(),
      notes: formNotes.trim() || null,
      address: formAddress.trim() || null,
      radius_meters: formRadius ? parseInt(formRadius) : null,
      properties: formProperties,
    };

    try {
      if (editing && selectedFeature) {
        body.latitude = selectedFeature.latitude || selectedFeature.lat;
        body.longitude = selectedFeature.longitude || selectedFeature.lng;

        const res = await fetch(`/api/map/features/${selectedFeature.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Update failed');

        const updated = await res.json();
        resetForm();
        onFeatureUpdated?.(updated);
      } else if (placementCoords) {
        body.latitude = placementCoords.lat;
        body.longitude = placementCoords.lng;

        const res = await fetch(`/api/map/layers/${placingLayerId}/features`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Create failed');

        const created = await res.json();
        resetForm();
        onFeatureCreated?.(created);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!selectedFeature) return;
    const isClosure = selectedFeature.layer_type === 'closure';
    const msg = isClosure
      ? `Mark "${selectedFeature.title}" as reopened?`
      : `Delete "${selectedFeature.title}"? This cannot be undone.`;
    if (!window.confirm(msg)) return;

    try {
      const res = await fetch(`/api/map/features/${selectedFeature.id}?hard_delete=true`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).detail || 'Delete failed');
      resetForm();
      onFeatureDeleted?.(selectedFeature.id);
    } catch (e) {
      setError(e.message);
    }
  };

  // Dynamic property fields from layer schema
  const renderPropertyFields = () => {
    if (!activeLayer?.property_schema) return null;
    // Filter out 'notes' key — handled by the column-level Notes textarea above
    const entries = Object.entries(activeLayer.property_schema).filter(([key]) => key !== 'notes');
    if (entries.length === 0) return null;

    return (
      <div style={{ marginTop: '8px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>
          Properties
        </div>
        {entries.map(([key, fieldDef]) => {
          const value = formProperties[key] || '';
          const label = fieldDef.label || key;

          if (fieldDef.type === 'select' && fieldDef.options) {
            return (
              <div key={key} style={{ marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>{label}</label>
                <select
                  value={value}
                  onChange={(e) => setFormProperties(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '5px', fontSize: '0.85rem' }}
                >
                  <option value=""></option>
                  {fieldDef.options.map(opt => (
                    <option key={opt} value={opt}>{opt.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            );
          }
          if (fieldDef.type === 'number') {
            return (
              <div key={key} style={{ marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>{label}</label>
                <input type="number" value={value}
                  onChange={(e) => setFormProperties(prev => ({ ...prev, [key]: e.target.value ? parseFloat(e.target.value) : '' }))}
                  style={{ width: '100%', padding: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>
            );
          }
          if (fieldDef.type === 'date') {
            return (
              <div key={key} style={{ marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>{label}</label>
                <input type="date" value={value}
                  onChange={(e) => setFormProperties(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>
            );
          }
          if (fieldDef.type === 'json') return null;

          return (
            <div key={key} style={{ marginBottom: '6px' }}>
              <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>{label}</label>
              <input type="text" value={value}
                onChange={(e) => setFormProperties(prev => ({ ...prev, [key]: e.target.value }))}
                style={{ width: '100%', padding: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  // =========================================================================
  // RENDER STATES
  // =========================================================================

  // STATE 1: Placing mode, waiting for map click (no coords yet)
  if (isPlacing && !placementCoords) {
    const layer = layers.find(l => l.id === placingLayerId);
    return (
      <div style={{
        background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
        padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: '0.85rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '1.3rem' }}>{layer?.icon}</span>
          <span style={{ fontWeight: '600', color: '#333' }}>Place {layer?.name || 'Feature'}</span>
        </div>
        <div style={{ color: '#666', marginBottom: '12px' }}>Click on the map to place a pin.</div>
        <button onClick={() => { resetForm(); onCancelPlacing?.(); }}
          style={{ width: '100%', padding: '8px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
          Cancel
        </button>
      </div>
    );
  }

  // STATE 2: Placement form (coords received) OR editing existing feature
  if (placementCoords || (selectedFeature && editing)) {
    return (
      <div style={{
        background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
        padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: '0.85rem',
        maxHeight: 'calc(100vh - 80px)', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '1.3rem' }}>{activeLayer?.icon}</span>
          <span style={{ fontWeight: '600', color: '#333' }}>{editing ? 'Edit' : 'New'} {activeLayer?.name || 'Feature'}</span>
        </div>

        <div style={{ marginBottom: '6px' }}>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>Title *</label>
          <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }} autoFocus />
        </div>

        <div style={{ marginBottom: '6px' }}>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>Notes</label>
          <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
            rows={2} style={{ width: '100%', padding: '5px', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: '6px' }}>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>Address</label>
          <input type="text" value={formAddress} onChange={(e) => setFormAddress(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
        </div>

        {activeLayer?.geometry_type === 'point_radius' && (
          <div style={{ marginBottom: '6px' }}>
            <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>Alert Radius (meters)</label>
            <input type="number" value={formRadius} onChange={(e) => setFormRadius(e.target.value)}
              style={{ width: '100%', padding: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
          </div>
        )}

        {renderPropertyFields()}

        {placementCoords && (
          <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '8px', fontFamily: 'monospace' }}>
            {placementCoords.lat.toFixed(6)}, {placementCoords.lng.toFixed(6)}
          </div>
        )}

        {error && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '8px' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button onClick={handleSave} disabled={saving}
            style={{
              flex: 1, padding: '8px', background: activeLayer?.color || '#3B82F6', color: '#fff',
              border: 'none', borderRadius: '4px', cursor: saving ? 'wait' : 'pointer', fontSize: '0.85rem', fontWeight: '500',
            }}>
            {saving ? 'Saving...' : editing ? 'Update' : 'Save'}
          </button>
          <button onClick={() => { resetForm(); if (isPlacing) onCancelPlacing?.(); else onClearSelection?.(); }}
            style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // STATE 3: Feature selected — only show Delete (editing is handled by FeatureDetail inline)
  if (selectedFeature) {
    const isClosure = (selectedFeature.layer_type || selectedFeature.properties?.layer_type) === 'closure';
    return (
      <div style={{
        background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
        padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: '0.85rem',
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleDelete}
            style={{ flex: 1, padding: '7px 14px', background: isClosure ? '#059669' : '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
            {isClosure ? 'Reopened' : 'Delete'}
          </button>
          <button onClick={onClearSelection}
            style={{ padding: '7px 10px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
            ✕
          </button>
        </div>
      </div>
    );
  }

  // STATE 4: Default — Add Feature toolbar
  return (
    <div style={{
      background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
      padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: '0.85rem',
    }}>
      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#888', textTransform: 'uppercase', marginBottom: '8px' }}>
        Add Feature
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {placeableLayers.map(layer => (
          <button key={layer.id} onClick={() => onStartPlacing?.(layer.id)}
            title={`Place ${layer.name}`}
            style={{
              padding: '6px 10px', background: '#f9fafb', border: '1px solid #e5e7eb',
              borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
              display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
            }}>
            <span>{layer.icon}</span>
            <span>{layer.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
