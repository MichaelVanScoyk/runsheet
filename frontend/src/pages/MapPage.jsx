/**
 * MapPage.jsx — Primary map page (Phase 3 + Phase 4)
 *
 * Phase 3: View Mode
 *   - Layer toggle panel, feature display, click-to-inspect
 * Phase 4: Edit Mode (OFFICER / ADMIN)
 *   - FeatureEditor toolbar: add, edit, delete features
 *   - Click-to-place, dynamic property forms from layer schema
 *   - Closure management (place pin, "Reopened" quick-delete)
 *
 * Uses viewport-based server-side clustering:
 *   - GoogleMap sends bbox + zoom to backend on pan/zoom
 *   - Backend returns clusters at low zoom, individual features at high zoom
 *   - Frontend only holds ~50-200 markers regardless of dataset size
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import GoogleMap from '../components/shared/GoogleMap';
import LayerToggle from '../components/Map/LayerToggle';
import FeatureDetail from '../components/Map/FeatureDetail';
import FeatureEditor from '../components/Map/FeatureEditor';

export default function MapPage({ userSession }) {
  const [config, setConfig] = useState(null);
  const [layers, setLayers] = useState([]);
  const [layersLoading, setLayersLoading] = useState(true);
  const [visibleLayers, setVisibleLayers] = useState(new Set());
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Phase 4: Edit mode state
  const isOfficerOrAdmin = userSession?.role === 'OFFICER' || userSession?.role === 'ADMIN';
  const [isPlacing, setIsPlacing] = useState(false);
  const [placingLayerId, setPlacingLayerId] = useState(null);
  const [placementCoords, setPlacementCoords] = useState(null);

  // Load map config
  useEffect(() => {
    fetch('/api/map/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => setConfig(data))
      .catch(() => {});
  }, []);

  // Load layers
  const loadLayers = useCallback(() => {
    setLayersLoading(true);
    fetch('/api/map/layers')
      .then(r => r.ok ? r.json() : { layers: [] })
      .then(data => {
        setLayers(data.layers || []);
        setVisibleLayers(prev => {
          if (prev.size === 0) {
            const autoVisible = new Set();
            (data.layers || []).forEach(l => {
              if (l.feature_count > 0) autoVisible.add(l.id);
            });
            return autoVisible;
          }
          return prev;
        });
      })
      .catch(() => setLayers([]))
      .finally(() => setLayersLoading(false));
  }, []);

  useEffect(() => { loadLayers(); }, [loadLayers]);

  // Build viewportLayers — tells GoogleMap which layers to fetch via viewport API
  const viewportLayers = useMemo(() => {
    const result = [];
    visibleLayers.forEach(layerId => {
      const layer = layers.find(l => l.id === layerId);
      if (!layer) return;
      result.push({
        layerId: layer.id,
        color: layer.color,
        icon: layer.icon,
        geometryType: layer.geometry_type,
      });
    });
    return result;
  }, [visibleLayers, layers]);

  const handleToggleLayer = useCallback((layerId) => {
    setVisibleLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, []);

  const handleFeatureClick = useCallback((feature) => {
    if (!isPlacing) {
      // Enrich with layer's property_schema so FeatureDetail shows all defined fields
      const layer = layers.find(l => l.layer_type === feature.layer_type);
      if (layer?.property_schema) {
        feature.property_schema = layer.property_schema;
      }
      setSelectedFeature(feature);
    }
  }, [isPlacing, layers]);

  const handleMapClick = useCallback((lat, lng) => {
    if (isPlacing) {
      setPlacementCoords({ lat, lng });
    } else {
      setSelectedFeature(null);
    }
  }, [isPlacing]);

  const handleStartPlacing = useCallback((layerId) => {
    setIsPlacing(true);
    setPlacingLayerId(layerId);
    setPlacementCoords(null);
    setSelectedFeature(null);
  }, []);

  const handleCancelPlacing = useCallback(() => {
    setIsPlacing(false);
    setPlacingLayerId(null);
    setPlacementCoords(null);
  }, []);

  // After feature CRUD — refresh layers (viewport will auto-reload)
  const handleFeatureCreated = useCallback((feature) => {
    loadLayers();
    setIsPlacing(false);
    setPlacingLayerId(null);
    setPlacementCoords(null);
    // Force viewport reload by toggling layer visibility briefly
    setVisibleLayers(prev => {
      const next = new Set(prev);
      return next;
    });
  }, [loadLayers]);

  const handleFeatureUpdated = useCallback((feature) => {
    loadLayers();
    setSelectedFeature(null);
  }, [loadLayers]);

  const handleFeatureDeleted = useCallback((featureId) => {
    loadLayers();
    setSelectedFeature(null);
  }, [loadLayers]);

  const stationCenter = config?.station_lat && config?.station_lng
    ? { lat: config.station_lat, lng: config.station_lng }
    : null;

  if (!config) {
    return <div style={{ padding: '2rem', color: '#888' }}>Loading map configuration...</div>;
  }

  if (!config.google_api_key_configured) {
    return (
      <div style={{ padding: '2rem' }}>
        <h2 style={{ color: '#333', marginBottom: '0.5rem' }}>Map</h2>
        <p style={{ color: '#888' }}>
          Google Maps API key is not configured. Go to Admin → Settings → Location and add your Google Maps API key.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 0px)', position: 'relative' }}>
      {/* Layer toggle sidebar */}
      <div style={{
        width: sidebarOpen ? '260px' : '0px',
        minWidth: sidebarOpen ? '260px' : '0px',
        background: '#fff',
        borderRight: sidebarOpen ? '1px solid #e0e0e0' : 'none',
        overflow: 'hidden',
        transition: 'width 0.2s, min-width 0.2s',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #eee',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: '600', color: '#333', fontSize: '0.95rem' }}>Layers</span>
          <span style={{ fontSize: '0.75rem', color: '#999' }}>{visibleLayers.size} active</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
          <LayerToggle
            layers={layers}
            visibleLayers={visibleLayers}
            onToggleLayer={handleToggleLayer}
            loading={layersLoading}
          />
        </div>
      </div>

      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(prev => !prev)}
        style={{
          position: 'absolute',
          left: sidebarOpen ? '260px' : '0px',
          top: '10px',
          zIndex: 10,
          background: '#fff',
          border: '1px solid #ddd',
          borderLeft: 'none',
          borderRadius: '0 4px 4px 0',
          padding: '8px 4px',
          cursor: 'pointer',
          fontSize: '0.8rem',
          color: '#666',
          boxShadow: '2px 0 4px rgba(0,0,0,0.1)',
          transition: 'left 0.2s',
        }}
        title={sidebarOpen ? 'Hide layers' : 'Show layers'}
      >
        {sidebarOpen ? '◀' : '▶'}
      </button>

      {/* Map area */}
      <div style={{ flex: 1, position: 'relative' }}>
        <GoogleMap
          center={stationCenter}
          zoom={14}
          height="100%"
          interactive={true}
          showStation={true}
          stationCoords={stationCenter}
          viewportLayers={viewportLayers}
          onFeatureClick={handleFeatureClick}
          onMapClick={handleMapClick}
        />

        {/* Feature detail popup (view mode — non-officer) */}
        {selectedFeature && !isOfficerOrAdmin && (
          <div style={{
            position: 'absolute', top: '10px', right: '10px', zIndex: 10,
            maxHeight: 'calc(100vh - 40px)', overflow: 'auto',
          }}>
            <FeatureDetail feature={selectedFeature} onClose={() => setSelectedFeature(null)} />
          </div>
        )}

        {/* Officer/Admin: Feature detail + edit/delete buttons */}
        {selectedFeature && isOfficerOrAdmin && (
          <div style={{
            position: 'absolute', top: '10px', right: '10px', zIndex: 10,
            maxHeight: 'calc(100vh - 40px)', overflow: 'auto',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <FeatureDetail feature={selectedFeature} onClose={() => setSelectedFeature(null)} />
            <FeatureEditor
              layers={layers}
              selectedFeature={selectedFeature}
              onClearSelection={() => setSelectedFeature(null)}
              onFeatureUpdated={handleFeatureUpdated}
              onFeatureDeleted={handleFeatureDeleted}
              isPlacing={false}
              placingLayerId={null}
              placementCoords={null}
            />
          </div>
        )}

        {/* Officer/Admin: Feature editor toolbar OR placement form */}
        {isOfficerOrAdmin && !selectedFeature && (
          <div style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            zIndex: 10,
            maxWidth: '400px',
          }}>
            <FeatureEditor
              layers={layers}
              onFeatureCreated={handleFeatureCreated}
              isPlacing={isPlacing}
              onStartPlacing={handleStartPlacing}
              onCancelPlacing={handleCancelPlacing}
              placingLayerId={placingLayerId}
              placementCoords={placementCoords}
            />
          </div>
        )}

        {/* Placement mode indicator (top center) */}
        {isPlacing && !placementCoords && (
          <div style={{
            position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)',
            background: '#fff', padding: '8px 16px', borderRadius: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)', fontSize: '0.85rem',
            color: '#333', zIndex: 10, display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span>{layers.find(l => l.id === placingLayerId)?.icon}</span>
            <span>Click the map to place</span>
            <button onClick={handleCancelPlacing} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '1rem', color: '#888', padding: '0 4px',
            }}>✕</button>
          </div>
        )}
      </div>
    </div>
  );
}
