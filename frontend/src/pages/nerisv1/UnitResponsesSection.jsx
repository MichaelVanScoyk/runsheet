/**
 * nerisv1: UnitResponsesSection — unit_responses form (Section 9)
 *
 * Schema: IncidentPayload.unit_responses from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * unit_responses: IncidentUnitResponsePayload[] | null
 *
 * IncidentUnitResponsePayload (additionalProperties: false, required: none, 14 fields):
 *   - unit_neris_id: string|null
 *   - reported_unit_id: string|null (maxLength 255)
 *   - staffing: integer|null
 *   - unable_to_dispatch: boolean|null
 *   - dispatch: datetime|null
 *   - enroute_to_scene: datetime|null
 *   - on_scene: datetime|null
 *   - canceled_enroute: datetime|null
 *   - staging: datetime|null
 *   - unit_clear: datetime|null
 *   - med_responses: MedResponsePayload[]|null (shared)
 *   - point: GeoPoint|null (shared)
 *   - response_mode: TypeResponseModeValue|null (EMERGENT, NON_EMERGENT)
 *   - transport_mode: TypeResponseModeValue|null (EMERGENT, NON_EMERGENT)
 *
 * Note: Same 14 fields as DispatchUnitResponsePayload (section 3) but a
 * separate schema in the spec. This is the incident-level version.
 *
 * Props:
 *   data: array|null — current unit_responses list (NERIS field names)
 *   onChange: (newList) => void
 */
import React from 'react';
import GeoPointFields from './shared/GeoPointFields';
import MedResponseFields from './shared/MedResponseFields';

const RESPONSE_MODES = ['EMERGENT', 'NON_EMERGENT'];

export default function UnitResponsesSection({ data = null, onChange }) {
  const unitResponses = data || [];

  const addUR = () => onChange([...unitResponses, {}]);
  const removeUR = (i) => {
    const next = unitResponses.filter((_, idx) => idx !== i);
    onChange(next.length ? next : null);
  };
  const setUR = (i, field, value) => {
    const next = unitResponses.map((ur, idx) => (idx === i ? { ...ur, [field]: value } : ur));
    onChange(next);
  };

  const addMedResponse = (urIdx) => {
    const ur = unitResponses[urIdx];
    const meds = ur.med_responses || [];
    setUR(urIdx, 'med_responses', [...meds, {}]);
  };
  const removeMedResponse = (urIdx, medIdx) => {
    const ur = unitResponses[urIdx];
    const next = (ur.med_responses || []).filter((_, idx) => idx !== medIdx);
    setUR(urIdx, 'med_responses', next.length ? next : null);
  };
  const setMedResponse = (urIdx, medIdx, newMedData) => {
    const ur = unitResponses[urIdx];
    const next = (ur.med_responses || []).map((m, idx) => (idx === medIdx ? newMedData : m));
    setUR(urIdx, 'med_responses', next);
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">Section 9: Unit Responses (Incident-Level)</h3>
        <button type="button" className="text-sm text-blue-600 hover:underline" onClick={addUR}>
          + Add unit response
        </button>
      </div>

      {unitResponses.map((ur, i) => (
        <div key={i} className="mb-4 p-3 bg-gray-50 rounded border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-600">Unit Response #{i + 1}</span>
            <button type="button" className="text-red-500 text-xs hover:underline" onClick={() => removeUR(i)}>
              remove
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">unit_neris_id</label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={ur.unit_neris_id || ''}
                onChange={(e) => setUR(i, 'unit_neris_id', e.target.value || null)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">reported_unit_id</label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                maxLength={255}
                value={ur.reported_unit_id || ''}
                onChange={(e) => setUR(i, 'reported_unit_id', e.target.value || null)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">staffing</label>
              <input
                type="number"
                className="w-full border rounded px-2 py-1 text-sm"
                value={ur.staffing ?? ''}
                onChange={(e) => setUR(i, 'staffing', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">unable_to_dispatch</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={ur.unable_to_dispatch === true ? 'true' : ur.unable_to_dispatch === false ? 'false' : ''}
                onChange={(e) => setUR(i, 'unable_to_dispatch', e.target.value === '' ? null : e.target.value === 'true')}
              >
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">response_mode</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={ur.response_mode || ''}
                onChange={(e) => setUR(i, 'response_mode', e.target.value || null)}
              >
                <option value="">—</option>
                {RESPONSE_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">transport_mode</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={ur.transport_mode || ''}
                onChange={(e) => setUR(i, 'transport_mode', e.target.value || null)}
              >
                <option value="">—</option>
                {RESPONSE_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-2">
            {['dispatch', 'enroute_to_scene', 'on_scene', 'canceled_enroute', 'staging', 'unit_clear'].map((field) => (
              <div key={field}>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{field}</label>
                <input
                  type="datetime-local"
                  step="1"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={ur[field] ? ur[field].slice(0, 19) : ''}
                  onChange={(e) => setUR(i, field, e.target.value ? e.target.value + 'Z' : null)}
                />
              </div>
            ))}
          </div>

          <div className="mb-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">point</label>
            <GeoPointFields
              data={ur.point || {}}
              onChange={(pt) => setUR(i, 'point', pt)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-600">med_responses</label>
              <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => addMedResponse(i)}>
                + Add med response
              </button>
            </div>
            {(ur.med_responses || []).map((med, mi) => (
              <div key={mi} className="mb-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">Med Response #{mi + 1}</span>
                  <button type="button" className="text-red-500 text-xs hover:underline" onClick={() => removeMedResponse(i, mi)}>
                    remove
                  </button>
                </div>
                <MedResponseFields
                  data={med}
                  onChange={(newMed) => setMedResponse(i, mi, newMed)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
