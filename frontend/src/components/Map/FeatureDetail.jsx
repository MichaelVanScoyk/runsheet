/**
 * FeatureDetail.jsx — Feature detail popup with inline editing
 *
 * Shows when a user clicks a feature on the map.
 * Displays ALL fields from the layer's property_schema (even if null),
 * plus any extra fields from the actual properties data.
 * OFFICER/ADMIN can edit all fields inline and save.
 *
 * Props:
 *   feature         - Object with id, title, properties, property_schema, notes, etc.
 *   onClose         - () => void
 *   canEdit         - boolean — true for OFFICER/ADMIN
 *   onFeatureUpdated - (updatedFeature) => void — called after save
 */

import { useState, useEffect } from 'react';

// Layer types that cannot be deleted from the map (system polygons, imports)
const NON_DELETABLE_TYPES = new Set(['boundary', 'flood_zone', 'wildfire_risk', 'mutual_aid_station']);

export default function FeatureDetail({ feature, onClose, canEdit = false, onFeatureUpdated, onFeatureDeleted }) {
  if (!feature) return null;

  const props = feature.properties || {};
  const schema = feature.property_schema || {};
  const layerIcon = feature.layer_icon || props.layer_icon || '';
  const layerType = feature.layer_type || props.layer_type || '';

  // Schema fields first (excluding 'notes' which is handled by column-level Notes box),
  // then extras from data
  const schemaKeys = Object.keys(schema).filter(k => k !== 'notes');
  const dataKeys = Object.keys(props);
  const skipKeys = new Set(['id', 'title', 'description', 'layer_icon', 'layer_color', 'layer_type', 'radius_meters', 'address', 'notes']);
  const extraKeys = dataKeys.filter(k => !schemaKeys.includes(k) && !skipKeys.has(k));

  // Editing state
  const [editing, setEditing] = useState(false);
  const [editProps, setEditProps] = useState({});
  const [editNotes, setEditNotes] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editRadius, setEditRadius] = useState('');
  const [saving, setSaving] = useState(false);

  const showRadius = feature.layer_type === 'hazard' || feature.layer_type === 'informational' || feature.layer_type === 'tri_facility'
    || (feature.property_schema && Object.keys(feature.property_schema || {}).length === 0 && feature.radius_meters);

  useEffect(() => {
    setEditing(false);
    setEditProps({ ...props });
    setEditNotes(feature.notes || '');
    setEditTitle(feature.title || '');
    setEditAddress(feature.address || '');
    setEditRadius(feature.radius_meters ? String(feature.radius_meters) : '');
  }, [feature?.id]);

  function startEdit() {
    setEditProps({ ...props });
    setEditNotes(feature.notes || '');
    setEditTitle(feature.title || '');
    setEditAddress(feature.address || '');
    setEditRadius(feature.radius_meters ? String(feature.radius_meters) : '');
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  const isClosure = layerType === 'closure';
  const canDelete = canEdit && feature.id && !NON_DELETABLE_TYPES.has(layerType);

  async function handleDelete() {
    const msg = isClosure
      ? `Mark "${feature.title}" as reopened?`
      : `Delete "${feature.title}"? This cannot be undone.`;
    if (!window.confirm(msg)) return;

    try {
      const res = await fetch(`/api/map/features/${feature.id}?hard_delete=true`, { method: 'DELETE' });
      if (res.ok && onFeatureDeleted) {
        onFeatureDeleted(feature.id);
      }
    } catch (e) {
      console.error('Failed to delete feature:', e);
    }
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const body = {
        title: editTitle,
        notes: editNotes,
        address: editAddress || null,
        properties: editProps,
      };
      if (showRadius) {
        body.radius_meters = editRadius ? parseInt(editRadius) : null;
      }
      const resp = await fetch(`/api/map/features/${feature.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        const updated = await resp.json();
        setEditing(false);
        if (onFeatureUpdated) onFeatureUpdated(updated);
      }
    } catch (e) {
      console.error('Failed to save feature:', e);
    }
    setSaving(false);
  }

  function updateProp(key, value) {
    setEditProps(prev => ({ ...prev, [key]: value }));
  }

  function formatValue(value) {
    if (value === null || value === undefined) return '—';
    if (value === '') return '(empty)';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function isNull(value) {
    return value === null || value === undefined;
  }

  function renderField(key, label, value, fieldDef) {
    if (editing) {
      const type = fieldDef?.type || 'text';
      if (type === 'select' && fieldDef?.options) {
        return (
          <select
            value={editProps[key] ?? ''}
            onChange={e => updateProp(key, e.target.value || null)}
            style={{ ...inputStyle, padding: '2px 4px' }}
          >
            <option value="">—</option>
            {fieldDef.options.map(opt => (
              <option key={opt} value={opt}>{opt.replace(/_/g, ' ')}</option>
            ))}
          </select>
        );
      }
      return (
        <input
          type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
          value={editProps[key] ?? ''}
          onChange={e => updateProp(key, type === 'number' ? (e.target.value ? Number(e.target.value) : null) : (e.target.value || null))}
          style={inputStyle}
        />
      );
    }
    return (
      <span style={{
        color: isNull(value) ? '#ccc' : '#333',
        fontSize: '0.8rem', fontWeight: '500', textAlign: 'right',
        maxWidth: '65%', wordBreak: 'break-word',
        fontStyle: isNull(value) ? 'italic' : 'normal',
      }}>
        {formatValue(value)}
      </span>
    );
  }

  const inputStyle = {
    fontSize: '0.8rem', border: '1px solid #ddd', borderRadius: '3px',
    padding: '2px 6px', width: '60%', textAlign: 'right',
    background: '#fff',
  };

  return (
    <div style={{
      background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)', padding: '16px',
      maxWidth: '400px', fontSize: '0.85rem', position: 'relative',
    }}>
      {/* Close */}
      <button onClick={onClose} style={{
        position: 'absolute', top: '8px', right: '8px', background: 'none',
        border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#888',
        padding: '2px 6px', lineHeight: 1,
      }} title="Close">✕</button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', paddingRight: '24px' }}>
        <span style={{ fontSize: '1.3rem' }}>{layerIcon}</span>
        <div style={{ flex: 1 }}>
          {editing ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              style={{ ...inputStyle, width: '100%', textAlign: 'left', fontWeight: '600', fontSize: '0.95rem' }}
            />
          ) : (
            <div style={{ fontWeight: '600', color: '#111', fontSize: '0.95rem' }}>
              {feature.title || 'Untitled'}
            </div>
          )}
          <div style={{ fontSize: '0.75rem', color: '#888' }}>
            {layerType.replace(/_/g, ' ')}
          </div>
        </div>
      </div>

      {/* Notes — always visible, prominent */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#888', textTransform: 'uppercase', marginBottom: '2px' }}>
          Notes
        </div>
        {editing ? (
          <textarea
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            placeholder="Add notes..."
            rows={2}
            style={{
              width: '100%', fontSize: '0.8rem', border: '1px solid #ddd',
              borderRadius: '4px', padding: '6px', resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px',
            padding: '6px 8px', fontSize: '0.8rem', minHeight: '24px',
            color: feature.notes ? '#333' : '#ccc',
            fontStyle: feature.notes ? 'normal' : 'italic',
          }}>
            {feature.notes || '—'}
          </div>
        )}
      </div>

      {/* Address */}
      {(feature.address || editing) && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#888', textTransform: 'uppercase', marginBottom: '2px' }}>
            Address
          </div>
          {editing ? (
            <input
              type="text"
              value={editAddress}
              onChange={e => setEditAddress(e.target.value)}
              style={{ ...inputStyle, width: '100%', textAlign: 'left' }}
            />
          ) : (
            <div style={{ fontSize: '0.8rem', color: '#333' }}>
              {feature.address}
            </div>
          )}
        </div>
      )}

      {/* Alert Radius — for point_radius layers */}
      {(showRadius && (feature.radius_meters || editing)) && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#888', textTransform: 'uppercase', marginBottom: '2px' }}>
            Alert Radius (meters)
          </div>
          {editing ? (
            <input
              type="number"
              value={editRadius}
              onChange={e => setEditRadius(e.target.value)}
              style={{ ...inputStyle, width: '100%', textAlign: 'left' }}
            />
          ) : (
            <div style={{ fontSize: '0.8rem', color: '#333' }}>
              {feature.radius_meters}m
            </div>
          )}
        </div>
      )}

      {/* Schema-defined fields */}
      {schemaKeys.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{
            fontSize: '0.75rem', fontWeight: '600', color: '#888',
            textTransform: 'uppercase', marginBottom: '4px',
          }}>
            Fields
          </div>
          <div style={{
            background: '#f9fafb', border: '1px solid #eee',
            borderRadius: '4px', padding: '8px',
            maxHeight: '300px', overflowY: 'auto',
          }}>
            {schemaKeys.map(key => {
              const fieldDef = schema[key] || {};
              const label = fieldDef.label || key.replace(/_/g, ' ');
              const value = editing ? editProps[key] : props[key];
              return (
                <div key={key} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '3px 0', borderBottom: '1px solid #f0f0f0',
                }}>
                  <span style={{ color: '#666', fontSize: '0.8rem', minWidth: '35%' }}>{label}</span>
                  {renderField(key, label, value, fieldDef)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Extra properties from data not in schema */}
      {extraKeys.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{
            fontSize: '0.75rem', fontWeight: '600', color: '#888',
            textTransform: 'uppercase', marginBottom: '4px',
          }}>
            Additional Data ({extraKeys.length})
          </div>
          <div style={{
            background: '#f9fafb', border: '1px solid #eee',
            borderRadius: '4px', padding: '8px',
            maxHeight: '200px', overflowY: 'auto',
          }}>
            {extraKeys.map(key => {
              const value = editing ? editProps[key] : props[key];
              return (
                <div key={key} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '3px 0', borderBottom: '1px solid #f0f0f0',
                }}>
                  <span style={{ color: '#666', fontSize: '0.8rem' }}>{key.replace(/_/g, ' ')}</span>
                  {renderField(key, key, value, null)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GPS */}
      {feature.lat != null && feature.lng != null && (
        <div style={{
          fontSize: '0.75rem', color: '#999',
          borderTop: '1px solid #eee', paddingTop: '6px',
          fontFamily: 'monospace',
        }}>
          {parseFloat(feature.lat).toFixed(6)}, {parseFloat(feature.lng).toFixed(6)}
        </div>
      )}

      {/* Edit / Save / Cancel / Delete buttons */}
      {canEdit && feature.id && (
        <div style={{
          borderTop: '1px solid #eee', paddingTop: '8px', marginTop: '8px',
          display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center',
        }}>
          {editing ? (
            <>
              <button onClick={cancelEdit} style={btnStyle}>Cancel</button>
              <button onClick={saveEdit} disabled={saving} style={{ ...btnStyle, background: '#2563EB', color: '#fff' }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <>
              {canDelete && (
                <button onClick={handleDelete} style={{
                  ...btnStyle,
                  color: isClosure ? '#059669' : '#dc2626',
                  border: isClosure ? '1px solid #059669' : '1px solid #fca5a5',
                  marginRight: 'auto',
                  fontSize: '0.75rem',
                }}>
                  {isClosure ? 'Reopened' : 'Delete'}
                </button>
              )}
              <button onClick={startEdit} style={{ ...btnStyle, background: '#f3f4f6' }}>
                ✏️ Edit
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  padding: '4px 12px', fontSize: '0.8rem', border: '1px solid #ddd',
  borderRadius: '4px', cursor: 'pointer', background: '#fff',
};
