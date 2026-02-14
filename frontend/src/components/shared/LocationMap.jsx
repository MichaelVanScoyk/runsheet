/**
 * LocationMap - Reusable map component for incident locations
 * 
 * Uses Leaflet + OpenStreetMap tiles (free, no API key).
 * Feature-flagged: only renders when location services enabled.
 * 
 * Surfaces:
 *   - RunSheet IncidentInfo section (single pin, officer can verify)
 *   - Analytics dashboard (heatmap/clusters, future)
 *   - NERIS module (confirm geocoded address, future)
 *   - Mobile app (GPS tracking, future)
 * 
 * Dependencies: react-leaflet, leaflet
 *   npm install react-leaflet leaflet
 * 
 * Usage:
 *   <LocationMap 
 *     latitude={40.0977} 
 *     longitude={-75.7833}
 *     markerLabel="1710 Creek Rd"
 *     height="250px"
 *   />
 */

import { useEffect, useRef, useState } from 'react';

// Leaflet CSS must be imported for tiles to render correctly.
// If this import fails, the map will still work but tiles won't display.
// In that case, add to index.html:
//   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
let leafletCssLoaded = false;

function ensureLeafletCss() {
  if (leafletCssLoaded) return;
  if (document.querySelector('link[href*="leaflet.css"]')) {
    leafletCssLoaded = true;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  link.crossOrigin = '';
  document.head.appendChild(link);
  leafletCssLoaded = true;
}

export default function LocationMap({
  latitude,
  longitude,
  stationLatitude,
  stationLongitude,
  markerLabel = '',
  height = '250px',
  zoom = 15,
  showStation = false,
  interactive = true,
  onMapClick,
  style = {},
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const stationMarkerRef = useRef(null);
  const [L, setL] = useState(null);
  const [error, setError] = useState(null);

  // Dynamically import Leaflet (avoids SSR issues and handles missing dep gracefully)
  useEffect(() => {
    ensureLeafletCss();
    
    import('leaflet').then((leaflet) => {
      setL(leaflet.default || leaflet);
    }).catch(() => {
      setError('Map unavailable — install react-leaflet and leaflet');
    });
  }, []);

  // Initialize map
  useEffect(() => {
    if (!L || !mapRef.current || !latitude || !longitude) return;
    if (mapInstanceRef.current) return; // Already initialized

    // Fix Leaflet default icon path issue with bundlers
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    const map = L.map(mapRef.current, {
      center: [parseFloat(latitude), parseFloat(longitude)],
      zoom,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      touchZoom: interactive,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Incident marker (red default)
    const marker = L.marker([parseFloat(latitude), parseFloat(longitude)]).addTo(map);
    if (markerLabel) {
      marker.bindPopup(markerLabel);
    }
    markerRef.current = marker;

    // Station marker (blue, if provided)
    if (showStation && stationLatitude && stationLongitude) {
      const stationIcon = L.divIcon({
        className: 'station-marker',
        html: '<div style="background:#2563eb;color:#fff;border-radius:50%;width:12px;height:12px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const stationMkr = L.marker(
        [parseFloat(stationLatitude), parseFloat(stationLongitude)],
        { icon: stationIcon }
      ).addTo(map);
      stationMkr.bindPopup('Station');
      stationMarkerRef.current = stationMkr;
    }

    if (onMapClick) {
      map.on('click', (e) => {
        onMapClick(e.latlng.lat, e.latlng.lng);
      });
    }

    mapInstanceRef.current = map;

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        stationMarkerRef.current = null;
      }
    };
  }, [L, latitude, longitude]);

  // Update marker position when coords change (without reinitializing map)
  useEffect(() => {
    if (!L || !mapInstanceRef.current || !markerRef.current || !latitude || !longitude) return;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    markerRef.current.setLatLng([lat, lng]);
    mapInstanceRef.current.setView([lat, lng], zoom);
    if (markerLabel) {
      markerRef.current.setPopupContent(markerLabel);
    }
  }, [latitude, longitude, markerLabel]);

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

  if (!latitude || !longitude) {
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
    <div
      ref={mapRef}
      style={{
        height,
        borderRadius: '6px',
        border: '1px solid #e0e0e0',
        ...style,
      }}
    />
  );
}
