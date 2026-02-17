/**
 * GoogleMap.jsx — Shared Google Maps component
 *
 * Rendering modes:
 *   1. Simple markers/circles/polygons — for RunSheet, small datasets
 *   2. Viewport-loaded layers — for MapPage with server-side clustering
 *      Frontend sends bbox + zoom → backend returns clusters or features
 *      Only ~50-200 markers exist at any time regardless of dataset size
 *
 * Props:
 *   center        - { lat, lng } — map center
 *   zoom          - number (default 15)
 *   markers       - [{ lat, lng, title, icon, color }] — simple markers
 *   circles       - [{ lat, lng, radius, color, opacity }] — radius circles
 *   polygons      - [{ paths: [{lat,lng}], color, opacity }] — boundary polygons
 *   viewportLayers - [{ layerId, color, icon, geometryType }] — layers loaded on viewport change
 *   geojsonLayers - [{ layerId, geojson, color, opacity, icon }] — static GeoJSON (legacy/small)
 *   onMapClick    - (lat, lng) => void
 *   onFeatureClick - (feature) => void — clicked feature
 *   height        - CSS height string (default '400px')
 *   interactive   - boolean (default true)
 *   showStation   - boolean — show station marker
 *   stationCoords - { lat, lng }
 *   style         - additional CSS
 */

import { useEffect, useRef, useState } from 'react';

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

export default function GoogleMap({
  center,
  zoom = 15,
  markers = [],
  circles = [],
  polygons = [],
  viewportLayers = [],
  geojsonLayers = [],
  onMapClick,
  onFeatureClick,
  isPlacing = false,
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
  const dataLayersRef = useRef([]);
  const viewportMarkersRef = useRef([]); // markers from viewport loading
  const stationMarkerRef = useRef(null);
  const idleListenerRef = useRef(null);
  const fetchControllerRef = useRef(null); // AbortController for in-flight fetches
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);


  // Refs for callbacks — avoids stale closures in Google Maps listeners
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  const onFeatureClickRef = useRef(onFeatureClick);
  useEffect(() => { onFeatureClickRef.current = onFeatureClick; }, [onFeatureClick]);

  const isPlacingRef = useRef(isPlacing);
  useEffect(() => { isPlacingRef.current = isPlacing; }, [isPlacing]);

  // Ref for viewportLayers so idle listener always has current list
  const viewportLayersRef = useRef(viewportLayers);
  useEffect(() => { viewportLayersRef.current = viewportLayers; }, [viewportLayers]);

  // Fetch API key
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
      viewportMarkersRef.current.forEach(m => m.setMap(null));
      if (stationMarkerRef.current) stationMarkerRef.current.setMap(null);
      if (idleListenerRef.current) window.google?.maps?.event?.removeListener(idleListenerRef.current);
      mapInstanceRef.current = null;
    };
  }, [resolvedKey, center?.lat, center?.lng]);

  // Update center/zoom
  useEffect(() => {
    if (!mapInstanceRef.current || !center?.lat || !center?.lng) return;
    mapInstanceRef.current.setCenter({ lat: parseFloat(center.lat), lng: parseFloat(center.lng) });
    mapInstanceRef.current.setZoom(zoom);
  }, [center?.lat, center?.lng, zoom]);

  // Render simple markers
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    markers.forEach(m => {
      const marker = new window.google.maps.Marker({
        position: { lat: parseFloat(m.lat), lng: parseFloat(m.lng) },
        map: mapInstanceRef.current,
        title: m.title || '',
        icon: m.icon ? { url: m.icon, scaledSize: new window.google.maps.Size(32, 32) } : undefined,
      });
      if (m.title) {
        const iw = new window.google.maps.InfoWindow({ content: m.title });
        marker.addListener('click', () => iw.open(mapInstanceRef.current, marker));
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
  // VIEWPORT-BASED LOADING — server-side clustering
  // ==========================================================================
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.google) return;

    // Remove old idle listener
    if (idleListenerRef.current) {
      window.google.maps.event.removeListener(idleListenerRef.current);
      idleListenerRef.current = null;
    }

    // If no viewport layers, clean up and bail
    if (!viewportLayers || viewportLayers.length === 0) {
      viewportMarkersRef.current.forEach(m => m.setMap(null));
      viewportMarkersRef.current = [];
      dataLayersRef.current.forEach(dl => dl.setMap(null));
      dataLayersRef.current = [];
      return;
    }

    // Build icon cache
    const iconCache = {};

    // Emoji marker: colored circle background + emoji on top
    function getEmojiMarkerIcon(emoji, color) {
      const key = `emoji_${emoji}_${color}`;
      if (iconCache[key]) return iconCache[key];
      const size = 32;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2"/>
        <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central" font-size="18">${emoji}</text>
      </svg>`;
      iconCache[key] = {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        scaledSize: new window.google.maps.Size(size, size),
        anchor: new window.google.maps.Point(size / 2, size / 2),
      };
      return iconCache[key];
    }

    // Hydrant-specific: outer ring + inner NFPA color fill
    function getHydrantMarkerIcon(color, innerColor) {
      const key = `hydrant_${color}_${innerColor || 'none'}`;
      if (iconCache[key]) return iconCache[key];
      let svg;
      if (innerColor) {
        svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
          <circle cx="11" cy="11" r="10" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="1.5"/>
          <circle cx="11" cy="11" r="6" fill="${innerColor}" stroke="#fff" stroke-width="0.5"/>
        </svg>`;
        iconCache[key] = {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
          scaledSize: new window.google.maps.Size(22, 22),
          anchor: new window.google.maps.Point(11, 11),
        };
      } else {
        svg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="6" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="1.5"/>
        </svg>`;
        iconCache[key] = {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
          scaledSize: new window.google.maps.Size(14, 14),
          anchor: new window.google.maps.Point(7, 7),
        };
      }
      return iconCache[key];
    }

    // Resolve a color name from hydrant data to a CSS color
    function resolveHydrantColor(props) {
      const raw = (props?.CAP_COLOR || props?.BODY_COLOR || '').toString().toLowerCase().trim();
      if (!raw) return null;
      const colorMap = {
        'red': '#DC2626', 'blue': '#2563EB', 'green': '#16A34A', 'orange': '#EA580C',
        'yellow': '#EAB308', 'white': '#e5e5e5', 'black': '#333', 'silver': '#999',
        'purple': '#9333EA', 'chrome': '#aaa',
      };
      return colorMap[raw] || null;
    }

    function getClusterIcon(color, count) {
      const size = count < 50 ? 36 : count < 200 ? 42 : count < 1000 ? 48 : 54;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${color}" fill-opacity="0.85" stroke="#fff" stroke-width="2"/>
        <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${size < 42 ? 12 : 13}" font-weight="600" font-family="Arial,sans-serif">${count}</text>
      </svg>`;
      return {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        scaledSize: new window.google.maps.Size(size, size),
        anchor: new window.google.maps.Point(size / 2, size / 2),
      };
    }

    async function loadViewportData() {
      const bounds = map.getBounds();
      if (!bounds) return;

      const currentLayers = viewportLayersRef.current;
      if (!currentLayers || currentLayers.length === 0) return;

      // Cancel any in-flight fetches
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }
      fetchControllerRef.current = new AbortController();
      const signal = fetchControllerRef.current.signal;

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const bbox = `${sw.lng()},${sw.lat()},${ne.lng()},${ne.lat()}`;
      const zoom = map.getZoom();

      // Fetch all visible layers in parallel
      const fetches = currentLayers.map(layer =>
        fetch(`/api/map/layers/${layer.layerId}/features/clustered?bbox=${bbox}&zoom=${zoom}`, { signal })
          .then(r => r.ok ? r.json() : null)
          .catch(e => {
            if (e.name !== 'AbortError') console.warn(`Failed to fetch layer ${layer.layerId}:`, e);
            return null;
          })
      );

      let results;
      try {
        results = await Promise.all(fetches);
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('Viewport fetch failed:', e);
        return;
      }

      // Check if we were aborted while awaiting
      if (signal.aborted) return;

      // Clear old viewport markers
      viewportMarkersRef.current.forEach(m => m.setMap(null));
      viewportMarkersRef.current = [];

      // Clear old data layers (for polygon viewport layers)
      dataLayersRef.current.forEach(dl => dl.setMap(null));
      dataLayersRef.current = [];

      // Render results
      results.forEach(data => {
        if (!data?.items) return;

        const color = data.layer_color || '#DC2626';
        const style = data.layer_style || {};

        // Check if any items have polygon geometry (polygon layers)
        const hasPolygons = data.items.some(item => item.geometry);

        if (hasPolygons) {
          // Polygon layer — use Data Layer with per-layer style
          const geojson = {
            type: 'FeatureCollection',
            features: data.items.filter(i => i.geometry).map(item => ({
              type: 'Feature',
              geometry: item.geometry,
              properties: { ...item.properties, id: item.id, title: item.title, layer_type: data.layer_type, layer_icon: data.layer_icon, layer_color: data.layer_color },
            })),
          };

          if (geojson.features.length > 0) {
            const dataLayer = new window.google.maps.Data();
            dataLayer.addGeoJson(geojson);
            dataLayer.setStyle(() => ({
              fillColor: style.fill_color || color,
              fillOpacity: style.fill_opacity != null ? style.fill_opacity : 0.2,
              strokeColor: style.stroke_color || color,
              strokeWeight: style.stroke_weight || 2,
              strokeOpacity: style.stroke_opacity != null ? style.stroke_opacity : 0.8,
            }));
            dataLayer.addListener('click', (event) => {
              // During placement mode, forward click coords to map click handler
              if (isPlacingRef.current && onMapClickRef.current) {
                onMapClickRef.current(event.latLng?.lat(), event.latLng?.lng());
                return;
              }
              if (onFeatureClickRef.current) {
                const props = {};
                event.feature.forEachProperty((val, key) => { props[key] = val; });
                onFeatureClickRef.current({ ...props, lat: event.latLng?.lat(), lng: event.latLng?.lng() });
              }
            });
            dataLayer.setMap(map);
            dataLayersRef.current.push(dataLayer);
          }
        }

        // Point items (clusters + individual features)
        data.items.forEach(item => {
          if (item.geometry) return; // already handled as polygon above

          let marker;
          if (item.type === 'cluster') {
            marker = new window.google.maps.Marker({
              position: { lat: item.lat, lng: item.lng },
              map,
              icon: getClusterIcon(color, item.count),
              zIndex: 100 + item.count,
              clickable: false,
            });
          } else {
            // Choose icon based on layer type
            const isHydrant = data.layer_type === 'hydrant';
            let markerIcon;
            let hoverTitle = item.title || '';

            if (isHydrant) {
              // Hydrants: NFPA color dot system
              const innerColor = resolveHydrantColor(item.properties);
              markerIcon = getHydrantMarkerIcon(color, innerColor);
              const capColor = item.properties?.CAP_COLOR || item.properties?.BODY_COLOR;
              if (capColor) {
                hoverTitle = (hoverTitle ? hoverTitle + ' — ' : '') + capColor;
              } else {
                hoverTitle = (hoverTitle ? hoverTitle + ' — ' : '') + 'Color not supplied';
              }
            } else {
              // All other layers: emoji from layer definition
              const emoji = data.layer_icon || 'ℹ️';
              markerIcon = getEmojiMarkerIcon(emoji, color);
            }

            marker = new window.google.maps.Marker({
              position: { lat: item.lat, lng: item.lng },
              map,
              icon: markerIcon,
              title: hoverTitle,
              zIndex: 10,
            });

            // Click handler for individual features
            marker.addListener('click', () => {
              if (onFeatureClickRef.current) {
                onFeatureClickRef.current({
                  id: item.id,
                  title: item.title,
                  description: item.description,
                  properties: item.properties || {},
                  radius_meters: item.radius_meters,
                  address: item.address,
                  notes: item.notes,
                  lat: item.lat,
                  lng: item.lng,
                  layer_type: data.layer_type,
                  layer_icon: data.layer_icon,
                  layer_color: data.layer_color,
                });
              }
            });
          }

          viewportMarkersRef.current.push(marker);
        });
      });
    }

    // Idle fires after every pan/zoom AND on initial map load
    idleListenerRef.current = map.addListener('idle', loadViewportData);

    // If bounds already available (map was ready before this effect ran), load now
    if (map.getBounds()) {
      loadViewportData();
    }

    return () => {
      if (idleListenerRef.current) {
        window.google.maps.event.removeListener(idleListenerRef.current);
        idleListenerRef.current = null;
      }
    };
  }, [viewportLayers, loading]); // `loading` ensures re-run when map finishes initializing

  // ==========================================================================
  // STATIC GEOJSON — legacy path for small datasets
  // ==========================================================================
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !geojsonLayers?.length) return;

    geojsonLayers.forEach(layer => {
      if (!layer.geojson?.features?.length) return;

      const dataLayer = new window.google.maps.Data();
      try { dataLayer.addGeoJson(layer.geojson); }
      catch (e) { console.warn('Failed to add GeoJSON:', e); return; }

      dataLayer.setStyle((feature) => {
        const color = feature.getProperty('layer_color') || layer.color || '#3B82F6';
        const geomType = feature.getGeometry()?.getType();
        if (geomType === 'Point') {
          return {
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: color,
              fillOpacity: 0.9,
              strokeColor: '#fff',
              strokeWeight: 2,
            },
            title: feature.getProperty('title') || '',
          };
        }
        return {
          fillColor: color,
          fillOpacity: layer.opacity || 0.2,
          strokeColor: color,
          strokeWeight: 2,
          strokeOpacity: 0.8,
        };
      });

      dataLayer.addListener('click', (event) => {
        // During placement mode, forward click coords to map click handler
        if (isPlacingRef.current && onMapClickRef.current) {
          onMapClickRef.current(event.latLng?.lat(), event.latLng?.lng());
          return;
        }
        if (onFeatureClickRef.current) {
          const props = {};
          event.feature.forEachProperty((val, key) => { props[key] = val; });
          onFeatureClickRef.current({ ...props, lat: event.latLng?.lat(), lng: event.latLng?.lng() });
        }
      });

      dataLayer.setMap(mapInstanceRef.current);
      dataLayersRef.current.push(dataLayer);
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
        height, background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#888', fontSize: '0.85rem', ...style,
      }}>
        {error}
      </div>
    );
  }

  if (!center?.lat || !center?.lng) {
    return (
      <div style={{
        height, background: '#f5f5f5', border: '1px dashed #ccc', borderRadius: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#888', fontSize: '0.85rem', ...style,
      }}>
        No coordinates available
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height, ...style }}>
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, background: '#f5f5f5',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '6px', zIndex: 1, color: '#888', fontSize: '0.85rem',
        }}>
          Loading map...
        </div>
      )}
      <div ref={mapRef} style={{ height: '100%', borderRadius: '6px', border: '1px solid #e0e0e0' }} />
    </div>
  );
}
