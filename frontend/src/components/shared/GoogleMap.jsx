/**
 * GoogleMap.jsx — Shared Google Maps component
 *
 * Uses Google's recommended inline bootstrap loader pattern for dynamic library loading.
 * Supports AdvancedMarkerElement when Map ID is configured, falls back to legacy Marker otherwise.
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

// =============================================================================
// GOOGLE MAPS LOADER — Uses Google's inline bootstrap loader pattern
// =============================================================================

let loaderInstalled = false;
let loadPromise = null;

/**
 * Install the Google Maps bootstrap loader (run once).
 * This is Google's recommended inline bootstrap pattern that enables importLibrary().
 */
function installBootstrapLoader(apiKey) {
  if (loaderInstalled) return;
  if (window.google?.maps?.importLibrary) {
    loaderInstalled = true;
    return;
  }
  
  // Google's inline bootstrap loader - creates google.maps.importLibrary()
  ((g) => {
    var h, a, k, p = "The Google Maps JavaScript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window;
    b = b[c] || (b[c] = {});
    var d = b.maps || (b.maps = {}), r = new Set, e = new URLSearchParams;
    var u = () => h || (h = new Promise(async (f, n) => {
      await (a = m.createElement("script"));
      e.set("libraries", [...r] + "");
      for (k in g) e.set(k.replace(/[A-Z]/g, t => "_" + t[0].toLowerCase()), g[k]);
      e.set("callback", c + ".maps." + q);
      a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
      d[q] = f;
      a.onerror = () => h = n(Error(p + " could not load."));
      a.nonce = m.querySelector("script[nonce]")?.nonce || "";
      m.head.append(a);
    }));
    d[l] ? console.warn(p + " only loads once. Ignoring:", g) : d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n));
  })({ key: apiKey, v: "weekly" });
  
  loaderInstalled = true;
}

/**
 * Load Google Maps libraries using importLibrary().
 * Returns { Map, AdvancedMarkerElement (if mapId provided), geometry functions }
 */
async function loadGoogleMaps(apiKey, mapId) {
  if (loadPromise) return loadPromise;
  
  installBootstrapLoader(apiKey);
  
  loadPromise = (async () => {
    // Load required libraries
    const { Map } = await window.google.maps.importLibrary('maps');
    await window.google.maps.importLibrary('geometry');
    
    let AdvancedMarkerElement = null;
    if (mapId) {
      try {
        const markerLib = await window.google.maps.importLibrary('marker');
        AdvancedMarkerElement = markerLib.AdvancedMarkerElement;
      } catch (e) {
        console.warn('Failed to load marker library:', e);
      }
    }
    
    return { Map, AdvancedMarkerElement };
  })();
  
  return loadPromise;
}

// =============================================================================
// MARKER CREATION HELPERS
// =============================================================================

/**
 * Create a DOM element for AdvancedMarkerElement content
 */
function createMarkerContent(svgContent, size) {
  const div = document.createElement('div');
  div.innerHTML = svgContent;
  div.style.width = `${size}px`;
  div.style.height = `${size}px`;
  return div;
}

/**
 * Create SVG for a numbered/colored marker
 */
function createNumberedMarkerSvg(label, color, size = 28) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${color}" stroke="#fff" stroke-width="2"/>
    <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="12" font-weight="600" font-family="Arial,sans-serif">${label}</text>
  </svg>`;
}

/**
 * Create SVG for station marker
 */
function createStationMarkerSvg(size = 16) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="#2563EB" stroke="#fff" stroke-width="2"/>
  </svg>`;
}

/**
 * Create SVG for emoji marker (layer icons)
 */
function createEmojiMarkerSvg(emoji, color, size = 32) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2"/>
    <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central" font-size="18">${emoji}</text>
  </svg>`;
}

/**
 * Create SVG for incident marker (just emoji)
 */
function createIncidentMarkerSvg(emoji, size = 35) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central" font-size="28">${emoji}</text>
  </svg>`;
}

/**
 * Create SVG for incident cluster (emoji with count badge)
 */
function createIncidentClusterSvg(emoji, count, size = 32) {
  const badgeR = 9;
  const label = count > 99 ? '99+' : String(count);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size + badgeR}" height="${size}" viewBox="0 0 ${size + badgeR} ${size}">
    <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central" font-size="22">${emoji}</text>
    <circle cx="${size - 1}" cy="${badgeR + 1}" r="${badgeR}" fill="#333" stroke="#fff" stroke-width="1.5"/>
    <text x="${size - 1}" y="${badgeR + 2}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${label.length > 2 ? 8 : 10}" font-weight="700" font-family="Arial,sans-serif">${label}</text>
  </svg>`;
}

/**
 * Create SVG for hydrant marker (NFPA color system)
 */
function createHydrantMarkerSvg(color, innerColor) {
  if (innerColor) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="10" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="1.5"/>
      <circle cx="11" cy="11" r="6" fill="${innerColor}" stroke="#fff" stroke-width="0.5"/>
    </svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">
    <circle cx="7" cy="7" r="6" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="1.5"/>
  </svg>`;
}

/**
 * Create SVG for cluster marker
 */
function createClusterMarkerSvg(color, count) {
  const size = count < 50 ? 36 : count < 200 ? 42 : count < 1000 ? 48 : 54;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${color}" fill-opacity="0.85" stroke="#fff" stroke-width="2"/>
      <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${size < 42 ? 12 : 13}" font-weight="600" font-family="Arial,sans-serif">${count}</text>
    </svg>`,
    size,
  };
}

/**
 * Resolve hydrant cap/body color to CSS color
 */
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

// =============================================================================
// MAIN COMPONENT
// =============================================================================

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
  routePolyline,
  routeEditPath,
  height = '400px',
  interactive = true,
  showStation = false,
  stationCoords,
  style = {},
  fitBounds,
  apiKey,
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const circlesRef = useRef([]);
  const polygonsRef = useRef([]);
  const dataLayersRef = useRef([]);
  const viewportMarkersRef = useRef([]);
  const stationMarkerRef = useRef(null);
  const idleListenerRef = useRef(null);
  const fetchControllerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const advancedMarkerRef = useRef(null); // Store AdvancedMarkerElement class

  // Refs for callbacks — avoids stale closures in Google Maps listeners
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  const onFeatureClickRef = useRef(onFeatureClick);
  useEffect(() => { onFeatureClickRef.current = onFeatureClick; }, [onFeatureClick]);

  const isPlacingRef = useRef(isPlacing);
  useEffect(() => { isPlacingRef.current = isPlacing; }, [isPlacing]);

  const viewportLayersRef = useRef(viewportLayers);
  useEffect(() => { viewportLayersRef.current = viewportLayers; }, [viewportLayers]);

  // Fetch API key and Map ID from backend
  const [resolvedKey, setResolvedKey] = useState(apiKey || null);
  const [resolvedMapId, setResolvedMapId] = useState(null);
  
  useEffect(() => {
    if (apiKey) { 
      setResolvedKey(apiKey); 
      return; 
    }
    
    fetch('/api/map/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.google_api_key_configured) {
          // Fetch API key
          fetch('/api/settings/location/google_api_key')
            .then(r => r.ok ? r.json() : null)
            .then(setting => {
              if (setting?.raw_value) {
                setResolvedKey(setting.raw_value);
              } else {
                setError('Google Maps API key not configured');
              }
            })
            .catch(() => setError('Failed to load API key'));
          
          // Fetch Map ID if configured
          if (data?.google_map_id_configured) {
            fetch('/api/settings/location/google_map_id')
              .then(r => r.ok ? r.json() : null)
              .then(setting => {
                if (setting?.raw_value) {
                  setResolvedMapId(setting.raw_value);
                }
              })
              .catch(() => {}); // Map ID is optional
          }
        } else {
          setError('Google Maps API key not configured');
        }
      })
      .catch(() => setError('Failed to check map config'));
  }, [apiKey]);

  // Initialize map
  const initialCenter = useRef(center);
  useEffect(() => {
    if (!resolvedKey || !mapRef.current) return;
    if (mapInstanceRef.current) return;
    
    const startCenter = initialCenter.current || center;
    if (!startCenter?.lat || !startCenter?.lng) return;

    setLoading(true);

    const initMap = async () => {
      try {
        // Load Google Maps using bootstrap loader
        const { Map, AdvancedMarkerElement } = await loadGoogleMaps(resolvedKey, resolvedMapId);
        advancedMarkerRef.current = AdvancedMarkerElement;
        
        // Create map options
        const mapOptions = {
          center: { lat: parseFloat(startCenter.lat), lng: parseFloat(startCenter.lng) },
          zoom,
          disableDefaultUI: !interactive,
          zoomControl: interactive,
          scrollwheel: interactive,
          draggable: interactive,
          mapTypeControl: interactive,
          streetViewControl: false,
          fullscreenControl: interactive,
        };
        
        // Add mapId if we have it (required for AdvancedMarkerElement)
        // Disable fractional zoom - vector maps enable it by default, but we need integer zoom
        // for server-side clustering to work correctly
        if (resolvedMapId) {
          mapOptions.mapId = resolvedMapId;
          mapOptions.isFractionalZoomEnabled = false;
        } else {
          // Legacy styling when no mapId
          mapOptions.mapTypeId = 'roadmap';
          mapOptions.styles = [
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          ];
        }
        
        const map = new Map(mapRef.current, mapOptions);

        map.addListener('click', (e) => {
          if (onMapClickRef.current) {
            onMapClickRef.current(e.latLng.lat(), e.latLng.lng());
          }
        });

        mapInstanceRef.current = map;
        setLoading(false);
        setMapReady(true);
      } catch (err) {
        console.error('Map init error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    initMap();

    return () => {
      markersRef.current.forEach(m => {
        if (m.map !== undefined) m.map = null;
        else if (m.setMap) m.setMap(null);
      });
      circlesRef.current.forEach(c => c.setMap(null));
      polygonsRef.current.forEach(p => p.setMap(null));
      dataLayersRef.current.forEach(dl => dl.setMap(null));
      viewportMarkersRef.current.forEach(m => {
        if (m.map !== undefined) m.map = null;
        else if (m.setMap) m.setMap(null);
      });
      if (stationMarkerRef.current) {
        if (stationMarkerRef.current.map !== undefined) stationMarkerRef.current.map = null;
        else if (stationMarkerRef.current.setMap) stationMarkerRef.current.setMap(null);
      }
      if (idleListenerRef.current) window.google?.maps?.event?.removeListener(idleListenerRef.current);
      mapInstanceRef.current = null;
    };
  }, [resolvedKey, resolvedMapId]);

  // Helper to check if we can use advanced markers
  const useAdvancedMarkers = () => {
    return resolvedMapId && advancedMarkerRef.current;
  };

  // Update center/zoom
  useEffect(() => {
    if (!mapReady || !center?.lat || !center?.lng) return;
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setCenter({ lat: parseFloat(center.lat), lng: parseFloat(center.lng) });
    mapInstanceRef.current.setZoom(zoom);
  }, [mapReady, center?.lat, center?.lng, zoom]);

  // Fit bounds (for route display)
  useEffect(() => {
    if (!mapReady || !fitBounds) return;
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.fitBounds(fitBounds, { padding: 40 });
  }, [mapReady, fitBounds]);

  // ==========================================================================
  // RENDER SIMPLE MARKERS
  // ==========================================================================
  useEffect(() => {
    if (!mapReady) return;
    if (!mapInstanceRef.current) return;
    
    // Clear old markers
    markersRef.current.forEach(m => {
      if (m.map !== undefined) m.map = null;
      else if (m.setMap) m.setMap(null);
    });
    markersRef.current = [];

    const map = mapInstanceRef.current;
    const AdvancedMarker = advancedMarkerRef.current;

    markers.forEach((m, idx) => {
      const position = { lat: parseFloat(m.lat), lng: parseFloat(m.lng) };
      
      if (useAdvancedMarkers()) {
        // Modern: AdvancedMarkerElement
        let content;
        if (m.icon) {
          const img = document.createElement('img');
          img.src = m.icon;
          img.style.width = '32px';
          img.style.height = '32px';
          content = img;
        } else if (m.color) {
          const label = m.label || (idx + 1).toString();
          content = createMarkerContent(createNumberedMarkerSvg(label, m.color), 28);
        }
        
        const marker = new AdvancedMarker({
          map,
          position,
          title: m.title || '',
          content,
          zIndex: m.zIndex || 10,
        });
        
        if (m.title) {
          const iw = new window.google.maps.InfoWindow({ content: m.title });
          marker.addListener('click', () => iw.open(map, marker));
        }
        
        markersRef.current.push(marker);
      } else {
        // Legacy: google.maps.Marker
        let markerIcon;
        if (m.icon) {
          markerIcon = { url: m.icon, scaledSize: new window.google.maps.Size(32, 32) };
        } else if (m.color) {
          const label = m.label || (idx + 1).toString();
          const size = 28;
          const svg = createNumberedMarkerSvg(label, m.color, size);
          markerIcon = {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
            scaledSize: new window.google.maps.Size(size, size),
            anchor: new window.google.maps.Point(size / 2, size / 2),
          };
        }

        const marker = new window.google.maps.Marker({
          position,
          map,
          title: m.title || '',
          icon: markerIcon,
          zIndex: m.zIndex || 10,
        });
        
        if (m.title) {
          const iw = new window.google.maps.InfoWindow({ content: m.title });
          marker.addListener('click', () => iw.open(map, marker));
        }
        
        markersRef.current.push(marker);
      }
    });
  }, [mapReady, markers, resolvedMapId]);

  // ==========================================================================
  // RENDER CIRCLES
  // ==========================================================================
  useEffect(() => {
    if (!mapReady) return;
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
  }, [mapReady, circles]);

  // ==========================================================================
  // RENDER POLYGONS
  // ==========================================================================
  useEffect(() => {
    if (!mapReady) return;
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
  }, [mapReady, polygons]);

  // ==========================================================================
  // VIEWPORT-BASED LOADING — server-side clustering
  // ==========================================================================
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map) return;

    if (idleListenerRef.current) {
      window.google.maps.event.removeListener(idleListenerRef.current);
      idleListenerRef.current = null;
    }

    if (!viewportLayers || viewportLayers.length === 0) {
      viewportMarkersRef.current.forEach(m => {
        if (m.map !== undefined) m.map = null;
        else if (m.setMap) m.setMap(null);
      });
      viewportMarkersRef.current = [];
      dataLayersRef.current.forEach(dl => dl.setMap(null));
      dataLayersRef.current = [];
      return;
    }

    const AdvancedMarker = advancedMarkerRef.current;
    const canUseAdvanced = useAdvancedMarkers();

    // Icon cache for legacy mode
    const iconCache = {};

    function getLegacyIcon(svg, size) {
      const key = svg;
      if (iconCache[key]) return iconCache[key];
      iconCache[key] = {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        scaledSize: new window.google.maps.Size(size, size),
        anchor: new window.google.maps.Point(size / 2, size / 2),
      };
      return iconCache[key];
    }

    async function loadViewportData() {
      const bounds = map.getBounds();
      if (!bounds) return;

      const currentLayers = viewportLayersRef.current;
      if (!currentLayers || currentLayers.length === 0) return;

      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }
      fetchControllerRef.current = new AbortController();
      const signal = fetchControllerRef.current.signal;

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const bbox = `${sw.lng()},${sw.lat()},${ne.lng()},${ne.lat()}`;
      const currentZoom = map.getZoom();

      const layerIds = currentLayers.map(l => l.layerId);
      let batchData;
      try {
        const response = await fetch('/api/map/layers/batch/clustered', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ layer_ids: layerIds, bbox, zoom: currentZoom }),
          signal,
        });
        if (!response.ok) return;
        batchData = await response.json();
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('Viewport batch fetch failed:', e);
        return;
      }

      if (signal.aborted) return;

      const results = layerIds.map(lid => batchData.layers?.[String(lid)] || null);

      // Clear old markers
      viewportMarkersRef.current.forEach(m => {
        if (m.map !== undefined) m.map = null;
        else if (m.setMap) m.setMap(null);
      });
      viewportMarkersRef.current = [];

      dataLayersRef.current.forEach(dl => dl.setMap(null));
      dataLayersRef.current = [];

      // Render results
      results.forEach(data => {
        if (!data?.items) return;

        const color = data.layer_color || '#DC2626';
        const layerStyle = data.layer_style || {};

        // Polygon layers
        const hasPolygons = data.items.some(item => item.geometry);
        if (hasPolygons) {
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
              fillColor: layerStyle.fill_color || color,
              fillOpacity: layerStyle.fill_opacity != null ? layerStyle.fill_opacity : 0.2,
              strokeColor: layerStyle.stroke_color || color,
              strokeWeight: layerStyle.stroke_weight || 2,
              strokeOpacity: layerStyle.stroke_opacity != null ? layerStyle.stroke_opacity : 0.8,
            }));
            dataLayer.addListener('click', (event) => {
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

        // Point items
        const isIncidentLayer = data.layer_type?.startsWith('incident_');
        const incidentEmoji = data.layer_type === 'incident_fire' ? '🔥' : '🚑';

        data.items.forEach(item => {
          if (item.geometry) return;

          const position = { lat: item.lat, lng: item.lng };
          let marker;

          if (canUseAdvanced) {
            let content;
            let hoverTitle = item.title || '';

            if (item.type === 'cluster') {
              if (isIncidentLayer) {
                const size = 41;
                content = createMarkerContent(createIncidentClusterSvg(incidentEmoji, item.count), size);
                hoverTitle = `${item.count} incidents`;
              } else {
                const { svg, size } = createClusterMarkerSvg(color, item.count);
                content = createMarkerContent(svg, size);
              }
            } else {
              const isHydrant = data.layer_type === 'hydrant';
              
              if (isIncidentLayer) {
                content = createMarkerContent(createIncidentMarkerSvg(incidentEmoji), 35);
                const props = item.properties || {};
                const parts = [props.incident_number];
                if (props.cad_event_type) parts.push(props.cad_event_type);
                if (props.cad_event_subtype) parts.push(props.cad_event_subtype);
                if (props.address) parts.push(props.address);
                hoverTitle = parts.filter(Boolean).join(' — ');
              } else if (isHydrant) {
                const innerColor = resolveHydrantColor(item.properties);
                const size = innerColor ? 22 : 14;
                content = createMarkerContent(createHydrantMarkerSvg(color, innerColor), size);
                const capColor = item.properties?.CAP_COLOR || item.properties?.BODY_COLOR;
                hoverTitle = (hoverTitle ? hoverTitle + ' — ' : '') + (capColor || 'Color not supplied');
              } else {
                const emoji = data.layer_icon || 'ℹ️';
                content = createMarkerContent(createEmojiMarkerSvg(emoji, color), 32);
              }
            }

            marker = new AdvancedMarker({
              map,
              position,
              title: hoverTitle,
              content,
              zIndex: item.type === 'cluster' ? 100 + (item.count || 0) : (isIncidentLayer ? 20 : 10),
            });

            // Click handlers
            if (item.type === 'cluster' && isIncidentLayer) {
              marker.addListener('click', () => {
                if (item.incidents && item.incidents.length > 0) {
                  const listHtml = item.incidents.map(inc => {
                    const typeStr = [inc.cad_event_type, inc.cad_event_subtype].filter(Boolean).join(' / ');
                    return `<a href="/?incident=${inc.id}" style="display:block;padding:4px 0;border-bottom:1px solid #eee;text-decoration:none;color:#333">
                      <div style="font-weight:600;font-size:12px;color:${color}">${inc.incident_number || ''}</div>
                      ${typeStr ? `<div style="font-size:11px;color:#666">${typeStr}</div>` : ''}
                      ${inc.address ? `<div style="font-size:11px;color:#888">${inc.address}</div>` : ''}
                      ${inc.incident_date ? `<div style="font-size:10px;color:#aaa">${inc.incident_date}</div>` : ''}
                    </a>`;
                  }).join('');
                  const content = `<div style="font-family:system-ui,sans-serif;min-width:220px;max-width:300px;max-height:300px;overflow-y:auto;padding:2px">
                    <div style="font-weight:700;font-size:13px;color:#333;margin-bottom:6px;border-bottom:2px solid ${color};padding-bottom:4px">${item.count} Incidents</div>
                    ${listHtml}
                  </div>`;
                  if (map.__activeInfoWindow) map.__activeInfoWindow.close();
                  const iw = new window.google.maps.InfoWindow({ content });
                  iw.open(map, marker);
                  map.__activeInfoWindow = iw;
                } else {
                  map.setZoom(map.getZoom() + 2);
                  map.panTo(position);
                }
              });
            } else if (isIncidentLayer && item.type !== 'cluster') {
              marker.addListener('click', () => {
                const props = item.properties || {};
                const typeDisplay = [props.cad_event_type, props.cad_event_subtype].filter(Boolean).join(' / ');
                const dateDisplay = props.incident_date || '';
                const iwContent = `
                  <div style="font-family:system-ui,sans-serif;min-width:200px;max-width:280px;padding:2px">
                    <div style="font-weight:700;font-size:14px;color:${color};margin-bottom:4px">
                      ${props.incident_number || item.title || ''}
                    </div>
                    ${typeDisplay ? `<div style="font-size:12px;color:#555;margin-bottom:2px">${typeDisplay}</div>` : ''}
                    ${props.address ? `<div style="font-size:12px;color:#333;margin-bottom:2px">${props.address}</div>` : ''}
                    ${props.location_name ? `<div style="font-size:11px;color:#777;margin-bottom:2px">${props.location_name}</div>` : ''}
                    ${dateDisplay ? `<div style="font-size:11px;color:#888;margin-bottom:6px">${dateDisplay}</div>` : ''}
                    <a href="/?incident=${item.id}"
                       style="display:inline-block;font-size:12px;font-weight:600;color:#fff;background:${color};padding:4px 10px;border-radius:4px;text-decoration:none;margin-top:2px"
                       >View Run Sheet</a>
                  </div>
                `;
                if (map.__activeInfoWindow) map.__activeInfoWindow.close();
                const iw = new window.google.maps.InfoWindow({ content: iwContent });
                iw.open(map, marker);
                map.__activeInfoWindow = iw;
              });
            } else if (item.type !== 'cluster') {
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

          } else {
            // Legacy mode
            let markerIcon;
            let hoverTitle = item.title || '';

            if (item.type === 'cluster') {
              if (isIncidentLayer) {
                const size = 41;
                markerIcon = getLegacyIcon(createIncidentClusterSvg(incidentEmoji, item.count, 32), size);
                hoverTitle = `${item.count} incidents`;
              } else {
                const { svg, size } = createClusterMarkerSvg(color, item.count);
                markerIcon = getLegacyIcon(svg, size);
              }
            } else {
              const isHydrant = data.layer_type === 'hydrant';
              
              if (isIncidentLayer) {
                markerIcon = getLegacyIcon(createIncidentMarkerSvg(incidentEmoji), 35);
                const props = item.properties || {};
                const parts = [props.incident_number];
                if (props.cad_event_type) parts.push(props.cad_event_type);
                if (props.cad_event_subtype) parts.push(props.cad_event_subtype);
                if (props.address) parts.push(props.address);
                hoverTitle = parts.filter(Boolean).join(' — ');
              } else if (isHydrant) {
                const innerColor = resolveHydrantColor(item.properties);
                const size = innerColor ? 22 : 14;
                markerIcon = getLegacyIcon(createHydrantMarkerSvg(color, innerColor), size);
                const capColor = item.properties?.CAP_COLOR || item.properties?.BODY_COLOR;
                hoverTitle = (hoverTitle ? hoverTitle + ' — ' : '') + (capColor || 'Color not supplied');
              } else {
                const emoji = data.layer_icon || 'ℹ️';
                markerIcon = getLegacyIcon(createEmojiMarkerSvg(emoji, color), 32);
              }
            }

            marker = new window.google.maps.Marker({
              position,
              map,
              icon: markerIcon,
              title: hoverTitle,
              zIndex: item.type === 'cluster' ? 100 + (item.count || 0) : (isIncidentLayer ? 20 : 10),
              clickable: item.type === 'cluster' ? isIncidentLayer : true,
            });

            // Click handlers (same logic as advanced mode)
            if (item.type === 'cluster' && isIncidentLayer) {
              marker.addListener('click', () => {
                if (item.incidents && item.incidents.length > 0) {
                  const listHtml = item.incidents.map(inc => {
                    const typeStr = [inc.cad_event_type, inc.cad_event_subtype].filter(Boolean).join(' / ');
                    return `<a href="/?incident=${inc.id}" style="display:block;padding:4px 0;border-bottom:1px solid #eee;text-decoration:none;color:#333">
                      <div style="font-weight:600;font-size:12px;color:${color}">${inc.incident_number || ''}</div>
                      ${typeStr ? `<div style="font-size:11px;color:#666">${typeStr}</div>` : ''}
                      ${inc.address ? `<div style="font-size:11px;color:#888">${inc.address}</div>` : ''}
                      ${inc.incident_date ? `<div style="font-size:10px;color:#aaa">${inc.incident_date}</div>` : ''}
                    </a>`;
                  }).join('');
                  const iwContent = `<div style="font-family:system-ui,sans-serif;min-width:220px;max-width:300px;max-height:300px;overflow-y:auto;padding:2px">
                    <div style="font-weight:700;font-size:13px;color:#333;margin-bottom:6px;border-bottom:2px solid ${color};padding-bottom:4px">${item.count} Incidents</div>
                    ${listHtml}
                  </div>`;
                  if (map.__activeInfoWindow) map.__activeInfoWindow.close();
                  const iw = new window.google.maps.InfoWindow({ content: iwContent });
                  iw.open(map, marker);
                  map.__activeInfoWindow = iw;
                } else {
                  map.setZoom(map.getZoom() + 2);
                  map.panTo(position);
                }
              });
            } else if (isIncidentLayer && item.type !== 'cluster') {
              marker.addListener('click', () => {
                const props = item.properties || {};
                const typeDisplay = [props.cad_event_type, props.cad_event_subtype].filter(Boolean).join(' / ');
                const dateDisplay = props.incident_date || '';
                const iwContent = `
                  <div style="font-family:system-ui,sans-serif;min-width:200px;max-width:280px;padding:2px">
                    <div style="font-weight:700;font-size:14px;color:${color};margin-bottom:4px">
                      ${props.incident_number || item.title || ''}
                    </div>
                    ${typeDisplay ? `<div style="font-size:12px;color:#555;margin-bottom:2px">${typeDisplay}</div>` : ''}
                    ${props.address ? `<div style="font-size:12px;color:#333;margin-bottom:2px">${props.address}</div>` : ''}
                    ${props.location_name ? `<div style="font-size:11px;color:#777;margin-bottom:2px">${props.location_name}</div>` : ''}
                    ${dateDisplay ? `<div style="font-size:11px;color:#888;margin-bottom:6px">${dateDisplay}</div>` : ''}
                    <a href="/?incident=${item.id}"
                       style="display:inline-block;font-size:12px;font-weight:600;color:#fff;background:${color};padding:4px 10px;border-radius:4px;text-decoration:none;margin-top:2px"
                       >View Run Sheet</a>
                  </div>
                `;
                if (map.__activeInfoWindow) map.__activeInfoWindow.close();
                const iw = new window.google.maps.InfoWindow({ content: iwContent });
                iw.open(map, marker);
                map.__activeInfoWindow = iw;
              });
            } else if (item.type !== 'cluster') {
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
          }

          viewportMarkersRef.current.push(marker);
        });
      });
    }

    idleListenerRef.current = map.addListener('idle', () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(loadViewportData, 300);
    });

    if (map.getBounds()) {
      loadViewportData();
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (idleListenerRef.current) {
        window.google.maps.event.removeListener(idleListenerRef.current);
        idleListenerRef.current = null;
      }
    };
  }, [viewportLayers, mapReady, resolvedMapId]);

  // ==========================================================================
  // STATIC GEOJSON — legacy path for small datasets
  // ==========================================================================
  useEffect(() => {
    if (!mapReady || !geojsonLayers?.length) return;

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
  }, [mapReady, geojsonLayers]);

  // ==========================================================================
  // ROUTE POLYLINES
  // ==========================================================================
  const routeLineRef = useRef(null);
  useEffect(() => {
    if (!mapReady) return;
    if (routeLineRef.current) { routeLineRef.current.setMap(null); routeLineRef.current = null; }
    if (!routePolyline) return;

    try {
      const path = window.google.maps.geometry.encoding.decodePath(routePolyline);
      routeLineRef.current = new window.google.maps.Polyline({
        path,
        map: mapInstanceRef.current,
        strokeColor: '#2563EB',
        strokeOpacity: 0.8,
        strokeWeight: 4,
        zIndex: 5,
      });
      if (path.length > 1) {
        const bounds = new window.google.maps.LatLngBounds();
        path.forEach(p => bounds.extend(p));
        mapInstanceRef.current.fitBounds(bounds, { padding: 40 });
      }
    } catch (e) {
      console.warn('Failed to decode route polyline:', e);
    }
  }, [mapReady, routePolyline]);

  const routeEditLineRef = useRef(null);
  useEffect(() => {
    if (!mapReady) return;
    if (routeEditLineRef.current) { routeEditLineRef.current.setMap(null); routeEditLineRef.current = null; }
    if (!routeEditPath || routeEditPath.length < 2) return;

    const path = routeEditPath.map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }));
    routeEditLineRef.current = new window.google.maps.Polyline({
      path,
      map: mapInstanceRef.current,
      strokeColor: '#2563EB',
      strokeOpacity: 0.9,
      strokeWeight: 4,
      zIndex: 5,
    });
  }, [mapReady, routeEditPath]);

  // ==========================================================================
  // STATION MARKER
  // ==========================================================================
  useEffect(() => {
    if (!mapReady || !showStation || !stationCoords) return;
    
    // Clear old marker
    if (stationMarkerRef.current) {
      if (stationMarkerRef.current.map !== undefined) stationMarkerRef.current.map = null;
      else if (stationMarkerRef.current.setMap) stationMarkerRef.current.setMap(null);
    }

    const position = { lat: parseFloat(stationCoords.lat), lng: parseFloat(stationCoords.lng) };
    const AdvancedMarker = advancedMarkerRef.current;

    if (useAdvancedMarkers()) {
      const content = createMarkerContent(createStationMarkerSvg(16), 16);
      
      stationMarkerRef.current = new AdvancedMarker({
        map: mapInstanceRef.current,
        position,
        title: 'Station',
        content,
        zIndex: 1000,
      });
    } else {
      stationMarkerRef.current = new window.google.maps.Marker({
        position,
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
    }
  }, [mapReady, showStation, stationCoords?.lat, stationCoords?.lng, resolvedMapId]);

  // ==========================================================================
  // RENDER
  // ==========================================================================
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
