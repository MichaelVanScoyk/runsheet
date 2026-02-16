/**
 * GoogleMap.jsx — Shared Google Maps component
 *
 * Replaces LocationMap.jsx (Leaflet) with Google Maps JS API.
 * Uses the same Google API key already stored in settings (location.google_api_key).
 *
 * Features:
 *   - Point layers rendered as clustered Markers (@googlemaps/markerclusterer)
 *   - Polygon/line layers rendered as GeoJSON Data Layers
 *   - Singleton script loader, ref-based callbacks to avoid stale closures
 *
 * Surfaces:
 *   - MapPage (full map with layers, Phase 3)
 *   - RunSheet LocationSection (single incident pin)
 *   - IncidentHubModal (future)
 *   - Mobile app (future)
 *
 * Props:
 *   center        - { lat, lng } — map center
 *   zoom          - number (default 15)
 *   markers       - [{ lat, lng, title, icon, color }] — simple markers
 *   circles       - [{ lat, lng, radius, color, opacity }] — radius circles
 *   polygons      - [{ paths: [{lat,lng}], color, opacity }] — boundary polygons
 *   geojsonLayers - [{ layerId, geojson, color, opacity, icon }] — GeoJSON data layers
 *   onMapClick    - (lat, lng) => void
 *   onFeatureClick - (feature) => void — clicked GeoJSON feature
 *   height        - CSS height string (default '400px')
 *   interactive   - boolean (default true)
 *   showStation   - boolean — show station marker
 *   stationCoords - { lat, lng }
 *   style         - additional CSS
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer';

// Google Maps script loader — singleton
let googleMapsPromise = null;
let googleMapsLoaded = false;

function loadGoogleMaps(apiKey) {
  if (googleMapsLoaded) return Promise.resolve(window.google);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) {
      googleMapsLoaded = true;
      resolve(window.google);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      googleMapsLoaded = true;
      resolve(window.google);
    };
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

// Custom cluster renderer — colored circle with count
function createClusterRenderer(color) {
  return {
    render: ({ count, position }) => {
      const size = count < 50 ? 36 : count < 200 ? 42 : count < 1000 ? 48 : 54;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${color}" fill-opacity="0.85" stroke="#fff" stroke-width="2"/>
        <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${size < 42 ? 12 : 13}" font-weight="600" font-family="Arial,sans-serif">${count}</text>
      </svg>`;

      return new window.google.maps.Marker({
        position,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
          scaledSize: new window.google.maps.Size(size, size),
          anchor: new window.google.maps.Point(size / 2, size / 2),
        },
        label: { text: ' ', color: 'transparent' }, // suppress default label
        zIndex: Number(window.google.maps.Marker.MAX_ZINDEX) + count,
      });
    },
  };
}

export default function GoogleMap({
  center,
  zoom = 15,
  markers = [],
  circles = [],
  polygons = [],
  geojsonLayers = [],
  onMapClick,
  onFeatureClick,
  height = '400px',
  interactive = true,
  showStation = false,
  stationCoords,
  style = {},
  apiKey,
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const circlesRef = useRef([]);
  const polygonsRef = useRef([]);
  const dataLayersRef = useRef([]);       // polygon/line GeoJSON
  const clusterGroupsRef = useRef([]);    // { clusterer, markers } per point layer
  const stationMarkerRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Refs for callbacks — avoids stale closures in Google Maps listeners
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  const onFeatureClickRef = useRef(onFeatureClick);
  useEffect(() => { onFeatureClickRef.current = onFeatureClick; }, [onFeatureClick]);

  // Fetch API key from config if not provided as prop
  const [resolvedKey, setResolvedKey] = useState(apiKey || null);
  useEffect(() => {
    if (apiKey) { setResolvedKey(apiKey); return; }
    fetch('/api/map/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.google_api_key_configured) {
          fetch('/api/settings/location/google_api_key')
            .then(r => r.ok ? r.json() : null)
            .then(setting => {
              if (setting?.raw_value) setResolvedKey(setting.raw_value);
              else setError('Google Maps API key not configured');
            })
            .catch(() => setError('Failed to load API key'));
        } else {
          setError('Google Maps API key not configured');
        }
      })
      .catch(() => setError('Failed to check map config'));
  }, [apiKey]);

  // Initialize map
  useEffect(() => {
    if (!resolvedKey || !mapRef.current || !center?.lat || !center?.lng) return;
    if (mapInstanceRef.current) return;

    setLoading(true);
    loadGoogleMaps(resolvedKey)
      .then((google) => {
        const map = new google.maps.Map(mapRef.current, {
          center: { lat: parseFloat(center.lat), lng: parseFloat(center.lng) },
          zoom,
          disableDefaultUI: !interactive,
          zoomControl: interactive,
          scrollwheel: interactive,
          draggable: interactive,
          mapTypeControl: interactive,
          streetViewControl: false,
          fullscreenControl: interactive,
          mapTypeId: 'roadmap',
          styles: [
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          ],
        });

        // Always register click listener — use ref so callback stays current
        map.addListener('click', (e) => {
          if (onMapClickRef.current) {
            onMapClickRef.current(e.latLng.lat(), e.latLng.lng());
          }
        });

        mapInstanceRef.current = map;
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });

    return () => {
      markersRef.current.forEach(m => m.setMap(null));
      circlesRef.current.forEach(c => c.setMap(null));
      polygonsRef.current.forEach(p => p.setMap(null));
      dataLayersRef.current.forEach(dl => dl.setMap(null));
      clusterGroupsRef.current.forEach(cg => {
        cg.clusterer.clearMarkers();
        cg.markers.forEach(m => m.setMap(null));
      });
      if (stationMarkerRef.current) stationMarkerRef.current.setMap(null);
      mapInstanceRef.current = null;
    };
  }, [resolvedKey, center?.lat, center?.lng]);

  // Update center/zoom when props change
  useEffect(() => {
    if (!mapInstanceRef.current || !center?.lat || !center?.lng) return;
    mapInstanceRef.current.setCenter({ lat: parseFloat(center.lat), lng: parseFloat(center.lng) });
    mapInstanceRef.current.setZoom(zoom);
  }, [center?.lat, center?.lng, zoom]);

  // Render simple markers (for non-GeoJSON use cases like RunSheet)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    markers.forEach(m => {
      const marker = new window.google.maps.Marker({
        position: { lat: parseFloat(m.lat), lng: parseFloat(m.lng) },
        map: mapInstanceRef.current,
        title: m.title || '',
        icon: m.icon ? {
          url: m.icon,
          scaledSize: new window.google.maps.Size(32, 32),
        } : undefined,
      });

      if (m.title) {
        const infoWindow = new window.google.maps.InfoWindow({ content: m.title });
        marker.addListener('click', () => infoWindow.open(mapInstanceRef.current, marker));
      }

      markersRef.current.push(marker);
    });
  }, [markers]);

  // Render circles
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    circlesRef.current.forEach(c => c.setMap(null));
    circlesRef.current = [];

    circles.forEach(c => {
      const circle = new window.google.maps.Circle({
        center: { lat: parseFloat(c.lat), lng: parseFloat(c.lng) },
        radius: c.radius || 100,
        map: mapInstanceRef.current,
        fillColor: c.color || '#DC2626',
        fillOpacity: c.opacity || 0.15,
        strokeColor: c.color || '#DC2626',
        strokeWeight: 1.5,
        strokeOpacity: 0.6,
        clickable: false,
      });
      circlesRef.current.push(circle);
    });
  }, [circles]);

  // Render polygons
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    polygonsRef.current.forEach(p => p.setMap(null));
    polygonsRef.current = [];

    polygons.forEach(p => {
      const polygon = new window.google.maps.Polygon({
        paths: p.paths,
        map: mapInstanceRef.current,
        fillColor: p.color || '#3B82F6',
        fillOpacity: p.opacity || 0.1,
        strokeColor: p.color || '#3B82F6',
        strokeWeight: 2,
        strokeOpacity: 0.7,
        clickable: false,
      });
      polygonsRef.current.push(polygon);
    });
  }, [polygons]);

  // ==========================================================================
  // Render GeoJSON layers — POINT layers use clustered markers,
  // POLYGON/LINE layers use Data Layers
  // ==========================================================================
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    // Clear old data layers
    dataLayersRef.current.forEach(dl => dl.setMap(null));
    dataLayersRef.current = [];

    // Clear old clustered marker groups
    clusterGroupsRef.current.forEach(cg => {
      cg.clusterer.clearMarkers();
      cg.markers.forEach(m => m.setMap(null));
    });
    clusterGroupsRef.current = [];

    geojsonLayers.forEach(layer => {
      if (!layer.geojson?.features?.length) return;

      // Determine if this is a point layer or polygon/line layer
      const firstGeomType = layer.geojson.features[0]?.geometry?.type;
      const isPointLayer = firstGeomType === 'Point' || firstGeomType === 'MultiPoint';

      if (isPointLayer) {
        // ---- POINT LAYER: Create individual markers + cluster ----
        const color = layer.color || '#DC2626';
        const layerMarkers = [];

        // Build SVG icon for individual markers
        const markerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="6" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="1.5"/>
        </svg>`;
        const markerIcon = {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(markerSvg),
          scaledSize: new window.google.maps.Size(14, 14),
          anchor: new window.google.maps.Point(7, 7),
        };

        layer.geojson.features.forEach(feature => {
          const geom = feature.geometry;
          if (!geom || geom.type !== 'Point') return;

          const [lng, lat] = geom.coordinates;
          const marker = new window.google.maps.Marker({
            position: { lat, lng },
            icon: markerIcon,
            title: feature.properties?.title || '',
          });

          // Click handler — use ref for current callback
          marker.addListener('click', () => {
            if (onFeatureClickRef.current) {
              onFeatureClickRef.current({
                ...feature.properties,
                lat,
                lng,
              });
            }
          });

          layerMarkers.push(marker);
        });

        // Create clusterer for this layer
        if (layerMarkers.length > 0) {
          const clusterer = new MarkerClusterer({
            map: mapInstanceRef.current,
            markers: layerMarkers,
            algorithm: new SuperClusterAlgorithm({ radius: 150, maxZoom: 15 }),
            renderer: createClusterRenderer(color),
          });

          clusterGroupsRef.current.push({ clusterer, markers: layerMarkers });
        }
      } else {
        // ---- POLYGON/LINE LAYER: Use Data Layer (no clustering needed) ----
        const dataLayer = new window.google.maps.Data();
        try {
          dataLayer.addGeoJson(layer.geojson);
        } catch (e) {
          console.warn('Failed to add GeoJSON:', e);
          return;
        }

        dataLayer.setStyle((feature) => {
          const color = feature.getProperty('layer_color') || layer.color || '#3B82F6';
          return {
            fillColor: color,
            fillOpacity: layer.opacity || 0.2,
            strokeColor: color,
            strokeWeight: 2,
            strokeOpacity: 0.8,
          };
        });

        dataLayer.addListener('click', (event) => {
          if (onFeatureClickRef.current) {
            const props = {};
            event.feature.forEachProperty((val, key) => { props[key] = val; });
            onFeatureClickRef.current({
              ...props,
              lat: event.latLng?.lat(),
              lng: event.latLng?.lng(),
            });
          }
        });

        dataLayer.setMap(mapInstanceRef.current);
        dataLayersRef.current.push(dataLayer);
      }
    });
  }, [geojsonLayers]);

  // Station marker
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !showStation || !stationCoords) return;

    if (stationMarkerRef.current) stationMarkerRef.current.setMap(null);

    stationMarkerRef.current = new window.google.maps.Marker({
      position: { lat: parseFloat(stationCoords.lat), lng: parseFloat(stationCoords.lng) },
      map: mapInstanceRef.current,
      title: 'Station',
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#2563EB',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
      },
      zIndex: 1000,
    });
  }, [showStation, stationCoords?.lat, stationCoords?.lng]);

  if (error) {
    return (
      <div style={{
        height,
        background: '#f5f5f5',
        border: '1px solid #e0e0e0',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#888',
        fontSize: '0.85rem',
        ...style,
      }}>
        {error}
      </div>
    );
  }

  if (!center?.lat || !center?.lng) {
    return (
      <div style={{
        height,
        background: '#f5f5f5',
        border: '1px dashed #ccc',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#888',
        fontSize: '0.85rem',
        ...style,
      }}>
        No coordinates available
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height, ...style }}>
      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          zIndex: 1,
          color: '#888',
          fontSize: '0.85rem',
        }}>
          Loading map...
        </div>
      )}
      <div
        ref={mapRef}
        style={{
          height: '100%',
          borderRadius: '6px',
          border: '1px solid #e0e0e0',
        }}
      />
    </div>
  );
}
