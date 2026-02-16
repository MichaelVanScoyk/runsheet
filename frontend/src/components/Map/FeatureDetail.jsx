/**
 * FeatureDetail.jsx — Feature detail popup (read-only view mode)
 *
 * Shows when a user clicks a feature on the map.
 * Displays all properties, GPS coordinates, layer info.
 * Phase 4 adds edit/delete controls for OFFICER/ADMIN.
 *
 * Props:
 *   feature    - Object with title, description, properties, lat, lng, layer_type, etc.
 *   onClose    - () => void
 */

export default function FeatureDetail({ feature, onClose }) {
  if (!feature) return null;

  const props = feature.properties || {};
  const layerIcon = feature.layer_icon || props.layer_icon || '';
  const layerType = feature.layer_type || props.layer_type || '';
  const color = feature.layer_color || props.layer_color || '#3B82F6';

  // Filter out internal/display properties from the property list
  const internalKeys = new Set([
    'id', 'title', 'description', 'layer_icon', 'layer_color', 'layer_type',
    'radius_meters', 'address',
  ]);
  const displayProps = Object.entries(props).filter(([key]) => !internalKeys.has(key) && props[key] != null && props[key] !== '');

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      padding: '16px',
      maxWidth: '360px',
      fontSize: '0.85rem',
      position: 'relative',
    }}>
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1.1rem',
          color: '#888',
          padding: '2px 6px',
          lineHeight: 1,
        }}
        title="Close"
      >
        ✕
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', paddingRight: '24px' }}>
        <span style={{ fontSize: '1.3rem' }}>{layerIcon}</span>
        <div>
          <div style={{ fontWeight: '600', color: '#111', fontSize: '0.95rem' }}>
            {feature.title || props.title || 'Untitled'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>
            {layerType.replace(/_/g, ' ')}
          </div>
        </div>
      </div>

      {/* Description */}
      {(feature.description || props.description) && (
        <div style={{ color: '#555', marginBottom: '8px', lineHeight: 1.4 }}>
          {feature.description || props.description}
        </div>
      )}

      {/* Address */}
      {(feature.address || props.address) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#444' }}>
          <span style={{ fontSize: '0.8rem' }}>📍</span>
          <span>{feature.address || props.address}</span>
        </div>
      )}

      {/* Radius */}
      {(feature.radius_meters || props.radius_meters) && (
        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '8px' }}>
          Radius: {feature.radius_meters || props.radius_meters}m
          ({Math.round((feature.radius_meters || props.radius_meters) * 3.28084)}ft)
        </div>
      )}

      {/* Properties */}
      {displayProps.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: '600',
            color: '#888',
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}>
            Properties
          </div>
          <div style={{
            background: '#f9fafb',
            border: '1px solid #eee',
            borderRadius: '4px',
            padding: '8px',
          }}>
            {displayProps.map(([key, value]) => (
              <div key={key} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '2px 0',
                borderBottom: '1px solid #f0f0f0',
              }}>
                <span style={{ color: '#666', fontSize: '0.8rem' }}>
                  {key.replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#333', fontSize: '0.8rem', fontWeight: '500', textAlign: 'right', maxWidth: '60%' }}>
                  {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GPS Coordinates */}
      {feature.lat != null && feature.lng != null && (
        <div style={{
          fontSize: '0.75rem',
          color: '#999',
          borderTop: '1px solid #eee',
          paddingTop: '6px',
          fontFamily: 'monospace',
        }}>
          {parseFloat(feature.lat).toFixed(6)}, {parseFloat(feature.lng).toFixed(6)}
        </div>
      )}
    </div>
  );
}
