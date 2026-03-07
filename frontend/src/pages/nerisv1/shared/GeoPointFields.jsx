/**
 * nerisv1 shared: GeoPoint form fields
 *
 * Source: GeoPoint from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 * Fields: crs (integer|string, default 4326), geometry.coordinates ([lon, lat])
 *
 * Used by: BaseSection, DispatchSection, DispatchUnitResponse, Exposures, IncidentUnitResponse
 *
 * Props:
 *   data: object — current GeoPoint values {crs, geometry: {type, coordinates: [lon, lat]}}
 *   onChange: (newGeoPoint) => void
 *   label: string — section label (default "GeoPoint")
 */
import React from 'react';

export default function GeoPointFields({ data = {}, onChange, label = 'GeoPoint' }) {
  const coords = data?.geometry?.coordinates || ['', ''];
  const crs = data?.crs ?? 4326;

  const setCoord = (idx) => (e) => {
    const v = e.target.value;
    const newCoords = [...coords];
    newCoords[idx] = v === '' ? '' : parseFloat(v);
    onChange({
      crs,
      geometry: {
        type: 'Point',
        coordinates: newCoords,
      },
    });
  };

  return (
    <div className="space-y-1">
      <label className="block text-xs text-gray-500 font-semibold">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500">longitude</label>
          <input type="number" step="any" value={coords[0]} onChange={setCoord(0)}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">latitude</label>
          <input type="number" step="any" value={coords[1]} onChange={setCoord(1)}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>
    </div>
  );
}
