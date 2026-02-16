/**
 * FeatureDetail.jsx — Feature detail popup (read-only view mode)
 *
 * Shows when a user clicks a feature on the map.
 * Displays ALL fields from the layer's property_schema (even if null),
 * plus any extra fields from the actual properties data.
 *
 * Props:
 *   feature    - Object with title, description, properties, property_schema, lat, lng, etc.
 *   onClose    - () => void
 */

export default function FeatureDetail({ feature, onClose }) {
  if (!feature) return null;

  const props = feature.properties || {};
  const schema = feature.property_schema || {};
  const layerIcon = feature.layer_icon || props.layer_icon || '';
  const layerType = feature.layer_type || props.layer_type || '';

  // Build merged field list: all schema fields + any extra data fields
  // Schema fields come first with proper labels, then any extras from data
  const schemaKeys = Object.keys(schema);
  const dataKeys = Object.keys(props);
  const extraKeys = dataKeys.filter(k => !schemaKeys.includes(k));

  // Internal keys to skip in the extras (already shown elsewhere)
  const skipKeys = new Set([
    'id', 'title', 'description', 'layer_icon', 'layer_color', 'layer_type',
    'radius_meters', 'address',
  ]);

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

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      padding: '16px',
      maxWidth: '400px',
      fontSize: '0.85rem',
      position: 'relative',
    }}>
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: '8px', right: '8px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '1.1rem', color: '#888', padding: '2px 6px', lineHeight: 1,
        }}
        title="Close"
      >✕</button>

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

      {/* Core fields */}
      <div style={{
        background: '#f9fafb', border: '1px solid #eee',
        borderRadius: '4px', padding: '8px', marginBottom: '8px',
      }}>
        {[
          ['ID', feature.id],
          ['Address', feature.address || props.address],
          ['Description', feature.description || props.description],
          ['Radius (m)', feature.radius_meters],
        ].map(([label, value]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '2px 0', borderBottom: '1px solid #f0f0f0',
          }}>
            <span style={{ color: '#666', fontSize: '0.8rem' }}>{label}</span>
            <span style={{
              color: isNull(value) ? '#ccc' : '#333',
              fontSize: '0.8rem', fontWeight: '500', textAlign: 'right',
              maxWidth: '65%', wordBreak: 'break-word',
              fontStyle: isNull(value) ? 'italic' : 'normal',
            }}>
              {formatValue(value)}
            </span>
          </div>
        ))}
      </div>

      {/* Schema-defined fields — every field from the layer definition */}
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
              const value = props[key];
              return (
                <div key={key} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '2px 0', borderBottom: '1px solid #f0f0f0',
                }}>
                  <span style={{ color: '#666', fontSize: '0.8rem' }}>{label}</span>
                  <span style={{
                    color: isNull(value) ? '#ccc' : '#333',
                    fontSize: '0.8rem', fontWeight: '500', textAlign: 'right',
                    maxWidth: '65%', wordBreak: 'break-word',
                    fontStyle: isNull(value) ? 'italic' : 'normal',
                  }}>
                    {formatValue(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Extra properties from data not in schema */}
      {extraKeys.filter(k => !skipKeys.has(k)).length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{
            fontSize: '0.75rem', fontWeight: '600', color: '#888',
            textTransform: 'uppercase', marginBottom: '4px',
          }}>
            Additional Data ({extraKeys.filter(k => !skipKeys.has(k)).length})
          </div>
          <div style={{
            background: '#f9fafb', border: '1px solid #eee',
            borderRadius: '4px', padding: '8px',
            maxHeight: '200px', overflowY: 'auto',
          }}>
            {extraKeys.filter(k => !skipKeys.has(k)).map(key => (
              <div key={key} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '2px 0', borderBottom: '1px solid #f0f0f0',
              }}>
                <span style={{ color: '#666', fontSize: '0.8rem' }}>
                  {key.replace(/_/g, ' ')}
                </span>
                <span style={{
                  color: isNull(props[key]) ? '#ccc' : '#333',
                  fontSize: '0.8rem', fontWeight: '500', textAlign: 'right',
                  maxWidth: '65%', wordBreak: 'break-word',
                  fontStyle: isNull(props[key]) ? 'italic' : 'normal',
                }}>
                  {formatValue(props[key])}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GPS Coordinates */}
      {feature.lat != null && feature.lng != null && (
        <div style={{
          fontSize: '0.75rem', color: '#999',
          borderTop: '1px solid #eee', paddingTop: '6px',
          fontFamily: 'monospace',
        }}>
          {parseFloat(feature.lat).toFixed(6)}, {parseFloat(feature.lng).toFixed(6)}
        </div>
      )}
    </div>
  );
}
