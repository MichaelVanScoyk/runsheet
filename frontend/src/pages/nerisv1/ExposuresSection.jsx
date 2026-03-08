/**
 * nerisv1: ExposuresSection — exposures form (Section 10)
 *
 * Schema: IncidentPayload.exposures from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * exposures: ExposurePayload[] | null
 *
 * ExposurePayload (additionalProperties: false, required: location_detail, location, damage_type, 9 fields):
 *   - people_present: boolean|null
 *   - displacement_count: integer|null
 *   - location_detail: oneOf ExternalExposurePayload | InternalExposurePayload
 *     discriminator: type -> EXTERNAL_EXPOSURE | INTERNAL_EXPOSURE
 *   - location: LocationPayload (shared)
 *   - location_use: LocationUsePayload|null (shared)
 *   - point: GeoPoint|null (shared)
 *   - polygon: HighPrecisionGeoMultipolygon|null (shared)
 *   - damage_type: TypeExposureDamageValue (4 values)
 *   - displacement_causes: TypeDisplaceCauseValueRelExposure[]|null (7 values)
 *
 * ExternalExposurePayload (additionalProperties: false, required: type, item_type):
 *   - type: const "EXTERNAL_EXPOSURE"
 *   - item_type: TypeExposureItemValue (4 values)
 *
 * InternalExposurePayload (additionalProperties: false, required: type):
 *   - type: const "INTERNAL_EXPOSURE"
 *
 * Props:
 *   data: array|null — current exposures list (NERIS field names)
 *   onChange: (newList) => void
 */
import React from 'react';
import LocationFields from './shared/LocationFields';
import LocationUseFields from './shared/LocationUseFields';
import GeoPointFields from './shared/GeoPointFields';

const DAMAGE_TYPES = ['MAJOR_DAMAGE', 'MINOR_DAMAGE', 'MODERATE_DAMAGE', 'NO_DAMAGE'];
const EXPOSURE_ITEM_TYPES = ['OBJECT_OTHER', 'OUTDOOR_ENVIRONMENT', 'STRUCTURE', 'VEHICLE'];
const DISPLACEMENT_CAUSES = ['COLLAPSE', 'FIRE', 'HAZARDOUS_SITUATION', 'OTHER', 'SMOKE', 'UTILITIES', 'WATER'];

export default function ExposuresSection({ data = null, onChange }) {
  const exposures = data || [];

  const addExposure = () => {
    onChange([
      ...exposures,
      {
        location_detail: { type: 'INTERNAL_EXPOSURE' },
        location: {},
        damage_type: '',
      },
    ]);
  };

  const removeExposure = (i) => {
    const next = exposures.filter((_, idx) => idx !== i);
    onChange(next.length ? next : null);
  };

  const setExp = (i, field, value) => {
    const next = exposures.map((exp, idx) => (idx === i ? { ...exp, [field]: value } : exp));
    onChange(next);
  };

  const setLocationDetail = (i, newType) => {
    if (newType === 'EXTERNAL_EXPOSURE') {
      setExp(i, 'location_detail', { type: 'EXTERNAL_EXPOSURE', item_type: '' });
    } else {
      setExp(i, 'location_detail', { type: 'INTERNAL_EXPOSURE' });
    }
  };

  const setExternalItemType = (i, value) => {
    setExp(i, 'location_detail', { type: 'EXTERNAL_EXPOSURE', item_type: value || '' });
  };

  const toggleDisplacementCause = (i, cause) => {
    const current = exposures[i].displacement_causes || [];
    let next;
    if (current.includes(cause)) {
      next = current.filter((c) => c !== cause);
    } else {
      next = [...current, cause];
    }
    setExp(i, 'displacement_causes', next.length ? next : null);
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">Section 10: Exposures</h3>
        <button type="button" className="text-sm text-blue-600 hover:underline" onClick={addExposure}>
          + Add exposure
        </button>
      </div>

      {exposures.map((exp, i) => (
        <div key={i} className="mb-4 p-3 bg-gray-50 rounded border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-600">Exposure #{i + 1}</span>
            <button type="button" className="text-red-500 text-xs hover:underline" onClick={() => removeExposure(i)}>
              remove
            </button>
          </div>

          {/* location_detail discriminator */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">location_detail.type * (discriminator)</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={exp.location_detail?.type || ''}
                onChange={(e) => setLocationDetail(i, e.target.value)}
              >
                <option value="INTERNAL_EXPOSURE">INTERNAL_EXPOSURE</option>
                <option value="EXTERNAL_EXPOSURE">EXTERNAL_EXPOSURE</option>
              </select>
            </div>

            {exp.location_detail?.type === 'EXTERNAL_EXPOSURE' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">item_type *</label>
                <select
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={exp.location_detail?.item_type || ''}
                  onChange={(e) => setExternalItemType(i, e.target.value)}
                >
                  <option value="">— select —</option>
                  {EXPOSURE_ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* damage_type (required) */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1">damage_type *</label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={exp.damage_type || ''}
              onChange={(e) => setExp(i, 'damage_type', e.target.value || '')}
            >
              <option value="">— select —</option>
              {DAMAGE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* people_present and displacement_count */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">people_present</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={exp.people_present === true ? 'true' : exp.people_present === false ? 'false' : ''}
                onChange={(e) => setExp(i, 'people_present', e.target.value === '' ? null : e.target.value === 'true')}
              >
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">displacement_count</label>
              <input
                type="number"
                className="w-full border rounded px-2 py-1 text-sm"
                value={exp.displacement_count ?? ''}
                onChange={(e) => setExp(i, 'displacement_count', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              />
            </div>
          </div>

          {/* displacement_causes */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1">displacement_causes</label>
            <div className="flex flex-wrap gap-3">
              {DISPLACEMENT_CAUSES.map((cause) => (
                <label key={cause} className="flex items-center gap-1 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={(exp.displacement_causes || []).includes(cause)}
                    onChange={() => toggleDisplacementCause(i, cause)}
                  />
                  {cause}
                </label>
              ))}
            </div>
          </div>

          {/* location (required) */}
          <div className="mb-3">
            <h4 className="text-xs font-bold text-gray-700 mb-1">location *</h4>
            <LocationFields
              data={exp.location || {}}
              onChange={(loc) => setExp(i, 'location', loc)}
            />
          </div>

          {/* location_use */}
          <div className="mb-3">
            <h4 className="text-xs font-bold text-gray-700 mb-1">location_use</h4>
            <LocationUseFields
              data={exp.location_use || {}}
              onChange={(lu) => setExp(i, 'location_use', lu)}
            />
          </div>

          {/* point */}
          <div className="mb-3">
            <h4 className="text-xs font-bold text-gray-700 mb-1">point</h4>
            <GeoPointFields
              data={exp.point || {}}
              onChange={(pt) => setExp(i, 'point', pt)}
            />
          </div>

          {/* polygon */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">polygon (GeoJSON)</label>
            <textarea
              className="w-full border rounded px-2 py-1 text-sm font-mono"
              rows={3}
              value={exp.polygon ? JSON.stringify(exp.polygon) : ''}
              onChange={(e) => {
                try {
                  setExp(i, 'polygon', e.target.value ? JSON.parse(e.target.value) : null);
                } catch {
                  // invalid JSON, keep raw text
                }
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
