/**
 * GoogleMap.jsx — Shared Google Maps component
 *
 * Replaces LocationMap.jsx (Leaflet) with Google Maps JS API.
 * Uses the same Google API key already stored in settings (location.google_api_key).
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
  const dataLayersRef = useRef([]);
  const stationMarkerRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Ref to always have current onMapClick (avoids stale closure in Google Maps listener)
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  
  // Same for onFeatureClick
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
          // The actual key is fetched from settings endpoint
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
            // Subtle styling — keeps it clean for fire service use
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
      // Cleanup is handled by clearing refs
      markersRef.current.forEach(m => m.setMap(null));
      circlesRef.current.forEach(c => c.setMap(null));
      polygonsRef.current.forEach(p => p.setMap(null));
      dataLayersRef.current.forEach(dl => dl.setMap(null));
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

  // Render simple markers
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    // Clear old markers
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

  // Render circles (for point_radius features)
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

  // Render polygons (for boundaries)
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

  // Render GeoJSON data layers
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    // Clear old data layers
    dataLayersRef.current.forEach(dl => dl.setMap(null));
    dataLayersRef.current = [];

    geojsonLayers.forEach(layer => {
      if (!layer.geojson) return;

      const dataLayer = new window.google.maps.Data();
      try {
        dataLayer.addGeoJson(layer.geojson);
      } catch (e) {
        console.warn('Failed to add GeoJSON:', e);
        return;
      }

      // Style features
      dataLayer.setStyle((feature) => {
        const geomType = feature.getGeometry()?.getType();
        const color = feature.getProperty('layer_color') || layer.color || '#3B82F6';

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

        // Polygon / LineString
        return {
          fillColor: color,
          fillOpacity: layer.opacity || 0.2,
          strokeColor: color,
          strokeWeight: 2,
          strokeOpacity: 0.8,
        };
      });

      // Click handler — use ref so callback stays current
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
