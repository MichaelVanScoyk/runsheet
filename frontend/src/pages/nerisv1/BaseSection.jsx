/**
 * nerisv1: BaseSection — IncidentBasePayload form (Section 1)
 *
 * Schema: IncidentBasePayload from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 * Fields: 12, Required: 3 (department_neris_id, incident_number, location)
 *
 * Required:
 *   - department_neris_id: string
 *   - incident_number: string
 *   - location: LocationPayload (40 fields)
 *
 * Optional:
 *   - people_present: boolean|null
 *   - animals_rescued: integer|null
 *   - impediment_narrative: string|null (maxLength 100000)
 *   - outcome_narrative: string|null (maxLength 100000)
 *   - displacement_count: integer|null
 *   - displacement_causes: TypeDisplaceCauseValueRelIncident[]|null
 *   - point: GeoPoint|null
 *   - polygon: HighPrecisionGeoMultipolygon|null
 *   - location_use: LocationUsePayload|null
 *
 * Props:
 *   data: object — current IncidentBasePayload values (NERIS field names)
 *   onChange: (newBaseData) => void
 */
import React from 'react';
import LocationFields from './shared/LocationFields';
import GeoPointFields from './shared/GeoPointFields';
import LocationUseFields from './shared/LocationUseFields';

const DISPLACEMENT_CAUSES = [
  'COLLAPSE', 'FIRE', 'HAZARDOUS_SITUATION', 'OTHER', 'SMOKE', 'UTILITIES', 'WATER',
];

export default function BaseSection({ data = {}, onChange }) {
  const set = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  const setEvent = (field) => (e) => set(field, e.target.value || null);
  const setInt = (field) => (e) => set(field, e.target.value === '' ? null : parseInt(e.target.value, 10));
  const setBool = (field) => (e) => set(field, e.target.value === '' ? null : e.target.value === 'true');

  const toggleDisplacementCause = (cause) => {
    const current = data.displacement_causes || [];
    if (current.includes(cause)) {
      const next = current.filter((c) => c !== cause);
      set('displacement_causes', next.length ? next : null);
    } else {
      set('displacement_causes', [...current, cause]);
    }
  };

  return (
    <div className="space-y-6 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 1: Base (IncidentBasePayload)</h3>

      {/* Required fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 font-semibold">department_neris_id *</label>
          <input type="text" value={data.department_neris_id || ''} onChange={setEvent('department_neris_id')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 font-semibold">incident_number *</label>
          <input type="text" value={data.incident_number || ''} onChange={setEvent('incident_number')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>

      {/* people_present: boolean|null */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-gray-500">people_present</label>
          <select value={data.people_present === true ? 'true' : data.people_present === false ? 'false' : ''}
            onChange={setBool('people_present')}
            className="w-full border rounded px-2 py-1 text-sm">
            <option value="">—</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500">animals_rescued</label>
          <input type="number" value={data.animals_rescued ?? ''} onChange={setInt('animals_rescued')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">displacement_count</label>
          <input type="number" value={data.displacement_count ?? ''} onChange={setInt('displacement_count')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>

      {/* impediment_narrative: string|null */}
      <div>
        <label className="block text-xs text-gray-500">impediment_narrative</label>
        <textarea value={data.impediment_narrative || ''} onChange={setEvent('impediment_narrative')}
          className="w-full border rounded px-2 py-1 text-sm" rows={2} maxLength={100000} />
      </div>

      {/* outcome_narrative: string|null */}
      <div>
        <label className="block text-xs text-gray-500">outcome_narrative</label>
        <textarea value={data.outcome_narrative || ''} onChange={setEvent('outcome_narrative')}
          className="w-full border rounded px-2 py-1 text-sm" rows={2} maxLength={100000} />
      </div>

      {/* displacement_causes: TypeDisplaceCauseValueRelIncident[]|null */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">displacement_causes</label>
        <div className="flex flex-wrap gap-2">
          {DISPLACEMENT_CAUSES.map((cause) => (
            <label key={cause} className="flex items-center gap-1 text-xs">
              <input type="checkbox"
                checked={(data.displacement_causes || []).includes(cause)}
                onChange={() => toggleDisplacementCause(cause)} />
              {cause}
            </label>
          ))}
        </div>
      </div>

      {/* point: GeoPoint|null */}
      <GeoPointFields
        data={data.point || {}}
        onChange={(v) => set('point', v)}
        label="point (GeoPoint)"
      />

      {/* polygon: HighPrecisionGeoMultipolygon — complex, placeholder for now */}
      {/* TODO: Build polygon editor if needed */}

      {/* location: LocationPayload (required) */}
      <LocationFields
        data={data.location || {}}
        onChange={(field, value) => {
          set('location', { ...(data.location || {}), [field]: value });
        }}
      />

      {/* location_use: LocationUsePayload|null */}
      <LocationUseFields
        data={data.location_use || {}}
        onChange={(field, value) => {
          set('location_use', { ...(data.location_use || {}), [field]: value });
        }}
      />
    </div>
  );
}
