/**
 * LayerToggle.jsx — Layer visibility checkbox panel
 *
 * Shows active layers that have features with icon, name, feature count.
 * Checkboxes control which layers are rendered on the map.
 * Available to ALL authenticated users (view mode).
 * Empty layers (no features) are hidden — admin manages them in the import panel.
 *
 * Props:
 *   layers          - Array from /api/map/layers
 *   visibleLayers   - Set of layer IDs currently visible
 *   onToggleLayer   - (layerId) => void
 *   loading         - boolean
 */

export default function LayerToggle({ layers = [], visibleLayers = new Set(), onToggleLayer, loading = false }) {
  if (loading) {
    return (
      <div style={{ padding: '12px', color: '#888', fontSize: '0.85rem' }}>
        Loading layers...
      </div>
    );
  }

  // Only show layers that have features
  const populatedLayers = layers.filter(l => l.feature_count > 0);

  if (populatedLayers.length === 0) {
    return (
      <div style={{ padding: '12px', color: '#888', fontSize: '0.85rem' }}>
        No map layers with data
      </div>
    );
  }

  // Group layers by category for visual organization
  const groups = {
    'Water Sources': populatedLayers.filter(l => ['hydrant', 'dry_hydrant', 'draft_point'].includes(l.layer_type)),
    'Hazards & Closures': populatedLayers.filter(l => ['hazard', 'closure', 'tri_facility', 'railroad_crossing'].includes(l.layer_type)),
    'Boundaries': populatedLayers.filter(l => l.layer_type === 'boundary'),
    'Preplans & Notes': populatedLayers.filter(l => ['preplan', 'informational'].includes(l.layer_type)),
    'Environmental': populatedLayers.filter(l => ['flood_zone', 'wildfire_risk'].includes(l.layer_type)),
    'Stations': populatedLayers.filter(l => l.layer_type === 'mutual_aid_station'),
  };

  // Filter out empty groups
  const activeGroups = Object.entries(groups).filter(([, items]) => items.length > 0);

  return (
    <div style={{ fontSize: '0.85rem' }}>
      {activeGroups.map(([groupName, groupLayers]) => (
        <div key={groupName} style={{ marginBottom: '12px' }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: '600',
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '4px',
            paddingBottom: '2px',
            borderBottom: '1px solid #eee',
          }}>
            {groupName}
          </div>
          {groupLayers.map(layer => (
            <label
              key={layer.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 0',
                cursor: 'pointer',
                color: '#333',
              }}
            >
              <input
                type="checkbox"
                checked={visibleLayers.has(layer.id)}
                onChange={() => onToggleLayer(layer.id)}
                style={{ margin: 0, accentColor: layer.color }}
              />
              <span style={{ fontSize: '1rem', lineHeight: 1 }}>{layer.icon}</span>
              <span style={{ flex: 1 }}>{layer.name}</span>
              <span style={{
                fontSize: '0.75rem',
                color: '#999',
                minWidth: '24px',
                textAlign: 'right',
              }}>
                {layer.feature_count > 0 ? layer.feature_count.toLocaleString() : ''}
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
