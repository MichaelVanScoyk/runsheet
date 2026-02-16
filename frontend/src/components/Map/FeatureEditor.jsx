/**
 * FeatureEditor.jsx — Place, edit, and delete map features
 *
 * Phase 4: Edit mode for OFFICER / ADMIN users.
 * - Select a layer type, click the map to place a feature
 * - Dynamic property form based on layer's property_schema
 * - Edit existing features (click to select, modify properties)
 * - Delete features (with confirmation for non-closures)
 * - Closures get a "Road Reopened" quick-delete
 *
 * Props:
 *   layers           - Array of layers from /api/map/layers
 *   onFeatureCreated - (feature) => void — refresh map data
 *   onFeatureUpdated - (feature) => void
 *   onFeatureDeleted - (featureId) => void
 *   selectedFeature  - Currently selected feature for editing (from map click)
 *   onClearSelection - () => void
 *   isPlacing        - boolean — is user in "click to place" mode?
 *   onStartPlacing   - (layerId) => void
 *   onCancelPlacing  - () => void
 *   placingLayerId   - number — which layer is being placed into
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
}) {
  // Placement form state
  const [placementData, setPlacementData] = useState(null); // { lat, lng, layerId }
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formRadius, setFormRadius] = useState('');
  const [formProperties, setFormProperties] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Edit mode state
  const [editing, setEditing] = useState(false);

  // Placeable layer types (the ones officers manually create)
  const placeableLayers = layers.filter(l =>
    ['hydrant', 'dry_hydrant', 'draft_point', 'hazard', 'closure',
     'informational', 'preplan'].includes(l.layer_type)
  );

  // Get the layer being placed or edited
  const activeLayer = placingLayerId
    ? layers.find(l => l.id === placingLayerId)
    : selectedFeature
      ? layers.find(l => l.id === selectedFeature.layer_id)
      : null;

  // When user clicks the map during placement mode, parent calls this via ref or effect
  // But we handle it through props — MapPage sets placementData when map is clicked
  useEffect(() => {
    if (selectedFeature && editing) {
      // Populate form from selected feature
      setFormTitle(selectedFeature.title || '');
      setFormDescription(selectedFeature.description || '');
      setFormAddress(selectedFeature.address || '');
      setFormRadius(selectedFeature.radius_meters ? String(selectedFeature.radius_meters) : '');
      setFormProperties(selectedFeature.properties || {});
    }
  }, [selectedFeature, editing]);

  // Reset form
  const resetForm = useCallback(() => {
    setFormTitle('');
    setFormDescription('');
    setFormAddress('');
    setFormRadius('');
    setFormProperties({});
    setError('');
    setEditing(false);
    setPlacementData(null);
  }, []);

  // Called by MapPage when map is clicked in placement mode
  // MapPage passes coords through a callback
  const handleMapPlacement = useCallback((lat, lng) => {
    setPlacementData({ lat, lng, layerId: placingLayerId });
    setError('');
  }, [placingLayerId]);

  // Expose handleMapPlacement — parent accesses via this component
  // We use window event for simplicity since refs across components are complex
  useEffect(() => {
    window.__featureEditorPlacement = handleMapPlacement;
    return () => { delete window.__featureEditorPlacement; };
  }, [handleMapPlacement]);

  // Save new feature
  const handleSave = async () => {
    if (!formTitle.trim()) {
      setError('Title is required');
      return;
    }

    const layer = layers.find(l => l.id === (placementData?.layerId || selectedFeature?.layer_id));
    if (!layer) return;

    setSaving(true);
    setError('');

    const body = {
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      address: formAddress.trim() || null,
      radius_meters: formRadius ? parseInt(formRadius) : null,
      properties: formProperties,
    };

    try {
      if (editing && selectedFeature) {
        // Update existing
        body.latitude = selectedFeature.latitude || selectedFeature.lat;
        body.longitude = selectedFeature.longitude || selectedFeature.lng;

        const res = await fetch(`/api/map/features/${selectedFeature.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Update failed');
        }

        const updated = await res.json();
        onFeatureUpdated?.(updated);
        resetForm();
        onClearSelection?.();
      } else if (placementData) {
        // Create new
        body.latitude = placementData.lat;
        body.longitude = placementData.lng;

        const res = await fetch(`/api/map/layers/${placementData.layerId}/features`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Create failed');
        }

        const created = await res.json();
        onFeatureCreated?.(created);
        resetForm();
        onCancelPlacing?.();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete feature
  const handleDelete = async () => {
    if (!selectedFeature) return;

    const layerType = selectedFeature.layer_type;
    const isClosure = layerType === 'closure';
    const confirmMsg = isClosure
      ? `Mark "${selectedFeature.title}" as reopened? This removes the closure.`
      : `Delete "${selectedFeature.title}"? This cannot be undone.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/map/features/${selectedFeature.id}?hard_delete=true`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Delete failed');
      }

      onFeatureDeleted?.(selectedFeature.id);
      resetForm();
      onClearSelection?.();
    } catch (e) {
      setError(e.message);
    }
  };

  // Render property fields from layer's property_schema
  const renderPropertyFields = () => {
    if (!activeLayer?.property_schema) return null;

    const schema = activeLayer.property_schema;
    const entries = Object.entries(schema);
    if (entries.length === 0) return null;

    return (
      <div style={{ marginTop: '8px' }}>
        <div style={{
          fontSize: '0.75rem',
          fontWeight: '600',
          color: '#888',
          textTransform: 'uppercase',
          marginBottom: '4px',
        }}>
          Properties
        </div>
        {entries.map(([key, fieldDef]) => {
          const value = formProperties[key] || '';
          const label = fieldDef.label || key;

          if (fieldDef.type === 'select' && fieldDef.options) {
            return (
              <div key={key} style={{ marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>
                  {label}
                </label>
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
                <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>
                  {label}
                </label>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => setFormProperties(prev => ({ ...prev, [key]: e.target.value ? parseFloat(e.target.value) : '' }))}
                  style={{ width: '100%', padding: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>
            );
          }

          if (fieldDef.type === 'date') {
            return (
              <div key={key} style={{ marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>
                  {label}
                </label>
                <input
                  type="date"
                  value={value}
                  onChange={(e) => setFormProperties(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>
            );
          }

          if (fieldDef.type === 'json') {
            // Skip JSON fields (contacts, chemicals) for now — Phase 4+
            return null;
          }

          // Default: text
          return (
            <div key={key} style={{ marginBottom: '6px' }}>
              <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>
                {label}
              </label>
              <input
                type="text"
                value={value}
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
  // RENDER
  // =========================================================================

  // STATE 1: Placement mode — user picking where to put a new feature
  if (isPlacing && !placementData) {
    const layer = layers.find(l => l.id === placingLayerId);
    return (
      <div style={{
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: '0.85rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '1.3rem' }}>{layer?.icon}</span>
          <span style={{ fontWeight: '600', color: '#333' }}>
            Place {layer?.name || 'Feature'}
          </span>
        </div>
        <div style={{ color: '#666', marginBottom: '12px' }}>
          Click on the map to place a pin.
        </div>
        <button
          onClick={() => { resetForm(); onCancelPlacing?.(); }}
          style={{
            width: '100%',
            padding: '8px',
            background: '#f3f4f6',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // STATE 2: Feature form — new placement or editing existing
  if (placementData || (selectedFeature && editing)) {
    return (
      <div style={{
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: '0.85rem',
        maxHeight: 'calc(100vh - 80px)',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '1.3rem' }}>{activeLayer?.icon}</span>
          <span style={{ fontWeight: '600', color: '#333' }}>
            {editing ? 'Edit' : 'New'} {activeLayer?.name || 'Feature'}
          </span>
        </div>

        {/* Core fields */}
        <div style={{ marginBottom: '6px' }}>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>
            Title *
          </label>
          <input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: '6px' }}>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>
            Description
          </label>
          <textarea
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            rows={2}
            style={{ width: '100%', padding: '5px', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '6px' }}>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>
            Address
          </label>
          <input
            type="text"
            value={formAddress}
            onChange={(e) => setFormAddress(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }}
          />
        </div>

        {/* Radius — only for point_radius layers */}
        {activeLayer?.geometry_type === 'point_radius' && (
          <div style={{ marginBottom: '6px' }}>
            <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '2px' }}>
              Alert Radius (meters)
            </label>
            <input
              type="number"
              value={formRadius}
              onChange={(e) => setFormRadius(e.target.value)}
              style={{ width: '100%', padding: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {/* Dynamic property fields from schema */}
        {renderPropertyFields()}

        {/* GPS coordinates (read-only) */}
        {placementData && (
          <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '8px', fontFamily: 'monospace' }}>
            {placementData.lat.toFixed(6)}, {placementData.lng.toFixed(6)}
          </div>
        )}

        {error && (
          <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '8px' }}>
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: '8px',
              background: activeLayer?.color || '#3B82F6',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: saving ? 'wait' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: '500',
            }}
          >
            {saving ? 'Saving...' : editing ? 'Update' : 'Save'}
          </button>
          <button
            onClick={() => {
              resetForm();
              if (isPlacing) onCancelPlacing?.();
              else onClearSelection?.();
            }}
            style={{
              padding: '8px 16px',
              background: '#f3f4f6',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // STATE 3: Feature selected but not editing — show view + edit/delete buttons
  if (selectedFeature) {
    const isClosure = (selectedFeature.layer_type || selectedFeature.properties?.layer_type) === 'closure';

    return (
      <div style={{
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: '0.85rem',
      }}>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            onClick={() => setEditing(true)}
            style={{
              flex: 1,
              padding: '7px',
              background: '#3B82F6',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            style={{
              padding: '7px 14px',
              background: isClosure ? '#059669' : '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {isClosure ? 'Reopened' : 'Delete'}
          </button>
          <button
            onClick={onClearSelection}
            style={{
              padding: '7px 10px',
              background: '#f3f4f6',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // STATE 4: Default — show "Add Feature" toolbar
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      fontSize: '0.85rem',
    }}>
      <div style={{
        fontSize: '0.75rem',
        fontWeight: '600',
        color: '#888',
        textTransform: 'uppercase',
        marginBottom: '8px',
      }}>
        Add Feature
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {placeableLayers.map(layer => (
          <button
            key={layer.id}
            onClick={() => onStartPlacing?.(layer.id)}
            title={`Place ${layer.name}`}
            style={{
              padding: '6px 10px',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{layer.icon}</span>
            <span>{layer.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
