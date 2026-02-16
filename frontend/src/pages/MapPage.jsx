/**
 * MapPage.jsx — Primary map page (Phase 3 + Phase 4)
 *
 * Phase 3: View Mode
 *   - Layer toggle panel, feature display, click-to-inspect
 * Phase 4: Edit Mode (OFFICER / ADMIN)
 *   - FeatureEditor toolbar: add, edit, delete features
 *   - Click-to-place, dynamic property forms from layer schema
 *   - Closure management (place pin, "Reopened" quick-delete)
 */

import { useState, useEffect, useCallback } from 'react';
import GoogleMap from '../shared/GoogleMap';
import LayerToggle from '../Map/LayerToggle';
import FeatureDetail from '../Map/FeatureDetail';
import FeatureEditor from '../Map/FeatureEditor';

export default function MapPage({ userSession }) {
  const [config, setConfig] = useState(null);
  const [layers, setLayers] = useState([]);
  const [layersLoading, setLayersLoading] = useState(true);
  const [visibleLayers, setVisibleLayers] = useState(new Set());
  const [geojsonCache, setGeojsonCache] = useState({});
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingFeatures, setLoadingFeatures] = useState(new Set());

  // Phase 4: Edit mode state
  const isOfficerOrAdmin = userSession?.role === 'OFFICER' || userSession?.role === 'ADMIN';
  const [isPlacing, setIsPlacing] = useState(false);
  const [placingLayerId, setPlacingLayerId] = useState(null);

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
          // On first load, auto-enable layers with features
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

  // Load GeoJSON for a layer
  const loadLayerGeojson = useCallback(async (layerId, forceRefresh = false) => {
    if (geojsonCache[layerId] && !forceRefresh) return;
    if (loadingFeatures.has(layerId)) return;

    setLoadingFeatures(prev => new Set(prev).add(layerId));
    try {
      const res = await fetch(`/api/map/layers/${layerId}/features/geojson`);
      if (res.ok) {
        const data = await res.json();
        setGeojsonCache(prev => ({ ...prev, [layerId]: data }));
      }
    } catch (e) {
      console.warn(`Failed to load features for layer ${layerId}:`, e);
    } finally {
      setLoadingFeatures(prev => {
        const next = new Set(prev);
        next.delete(layerId);
        return next;
      });
    }
  }, [geojsonCache, loadingFeatures]);

  useEffect(() => {
    visibleLayers.forEach(layerId => {
      if (!geojsonCache[layerId]) loadLayerGeojson(layerId);
    });
  }, [visibleLayers]);

  // Toggle layer visibility
  const handleToggleLayer = useCallback((layerId) => {
    setVisibleLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, []);

  // Handle feature click from map
  const handleFeatureClick = useCallback((feature) => {
    setSelectedFeature(feature);
  }, []);

  // Handle map click — either placement or clear selection
  const handleMapClick = useCallback((lat, lng) => {
    if (isPlacing && window.__featureEditorPlacement) {
      window.__featureEditorPlacement(lat, lng);
    } else {
      setSelectedFeature(null);
    }
  }, [isPlacing]);

  // Phase 4: Start placing
  const handleStartPlacing = useCallback((layerId) => {
    setIsPlacing(true);
    setPlacingLayerId(layerId);
    setSelectedFeature(null);
  }, []);

  const handleCancelPlacing = useCallback(() => {
    setIsPlacing(false);
    setPlacingLayerId(null);
  }, []);

  // Phase 4: After feature CRUD — refresh layer data
  const refreshLayerData = useCallback((layerId) => {
    if (layerId) {
      loadLayerGeojson(layerId, true);
    }
    loadLayers();
  }, [loadLayerGeojson, loadLayers]);

  const handleFeatureCreated = useCallback((feature) => {
    refreshLayerData(feature.layer_id);
  }, [refreshLayerData]);

  const handleFeatureUpdated = useCallback((feature) => {
    refreshLayerData(feature.layer_id);
  }, [refreshLayerData]);

  const handleFeatureDeleted = useCallback((featureId) => {
    // We don't know the layer_id from just featureId, refresh all visible
    visibleLayers.forEach(id => loadLayerGeojson(id, true));
    loadLayers();
  }, [visibleLayers, loadLayerGeojson, loadLayers]);

  // Build geojsonLayers prop
  const geojsonLayers = [];
  visibleLayers.forEach(layerId => {
    const geojson = geojsonCache[layerId];
    if (!geojson || !geojson.features?.length) return;
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    geojsonLayers.push({
      layerId,
      geojson,
      color: layer.color,
      opacity: layer.opacity,
      icon: layer.icon,
    });
  });

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
          geojsonLayers={geojsonLayers}
          onFeatureClick={handleFeatureClick}
          onMapClick={handleMapClick}
          style={{ cursor: isPlacing ? 'crosshair' : undefined }}
        />

        {/* Feature detail popup (view mode) — shown when NOT editing */}
        {selectedFeature && !isOfficerOrAdmin && (
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 10,
            maxHeight: 'calc(100vh - 40px)',
            overflow: 'auto',
          }}>
            <FeatureDetail
              feature={selectedFeature}
              onClose={() => setSelectedFeature(null)}
            />
          </div>
        )}

        {/* Officer/Admin: Feature detail + edit/delete buttons */}
        {selectedFeature && isOfficerOrAdmin && (
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 10,
            maxHeight: 'calc(100vh - 40px)',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <FeatureDetail
              feature={selectedFeature}
              onClose={() => setSelectedFeature(null)}
            />
            <FeatureEditor
              layers={layers}
              selectedFeature={selectedFeature}
              onClearSelection={() => setSelectedFeature(null)}
              onFeatureUpdated={handleFeatureUpdated}
              onFeatureDeleted={handleFeatureDeleted}
              isPlacing={false}
              placingLayerId={null}
            />
          </div>
        )}

        {/* Officer/Admin: Feature editor toolbar (bottom-left) */}
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
            />
          </div>
        )}

        {/* Placement mode indicator */}
        {isPlacing && (
          <div style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#fff',
            padding: '8px 16px',
            borderRadius: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            fontSize: '0.85rem',
            color: '#333',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span>{layers.find(l => l.id === placingLayerId)?.icon}</span>
            <span>Click the map to place</span>
            <button
              onClick={handleCancelPlacing}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1rem',
                color: '#888',
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Loading indicator */}
        {loadingFeatures.size > 0 && (
          <div style={{
            position: 'absolute',
            bottom: isOfficerOrAdmin ? '80px' : '10px',
            left: '10px',
            background: '#fff',
            padding: '6px 12px',
            borderRadius: '4px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            fontSize: '0.8rem',
            color: '#666',
            zIndex: 10,
          }}>
            Loading features...
          </div>
        )}
      </div>
    </div>
  );
}
