/**
 * nerisv1: DispatchSection — DispatchPayload form (Section 3)
 *
 * Schema: DispatchPayload from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 * Fields: 15, Required: 6 (incident_number, call_arrival, call_answered, call_create, location, unit_responses)
 * additionalProperties: false
 *
 * Required:
 *   - incident_number: string
 *   - call_arrival: datetime
 *   - call_answered: datetime
 *   - call_create: datetime
 *   - location: LocationPayload
 *   - unit_responses: DispatchUnitResponsePayload[]
 *
 * Optional:
 *   - center_id: string|null (maxLength 255)
 *   - determinant_code: string|null (maxLength 8)
 *   - incident_code: string|null (maxLength 255)
 *   - disposition: string|null (maxLength 255)
 *   - automatic_alarm: boolean|null
 *   - incident_clear: datetime|null
 *   - point: GeoPoint|null
 *   - comments: CommentPayload[]|null
 *   - tactic_timestamps: DispatchTacticTimestampsPayload|null
 *
 * Props:
 *   data: object — current DispatchPayload values (NERIS field names)
 *   onChange: (newDispatchData) => void
 */
import React from 'react';
import LocationFields from './shared/LocationFields';
import GeoPointFields from './shared/GeoPointFields';
import MedResponseFields from './shared/MedResponseFields';

// --- DispatchTacticTimestampsPayload: 9 datetime|null fields, none required ---
const TACTIC_TIMESTAMP_FIELDS = [
  'command_established',
  'completed_sizeup',
  'suppression_complete',
  'primary_search_begin',
  'primary_search_complete',
  'water_on_fire',
  'fire_under_control',
  'fire_knocked_down',
  'extrication_complete',
];

// --- TypeResponseModeValue enum ---
const RESPONSE_MODES = ['EMERGENT', 'NON_EMERGENT'];

export default function DispatchSection({ data = {}, onChange }) {
  const set = (field, value) => onChange({ ...data, [field]: value });
  const setDatetime = (field) => (e) => set(field, e.target.value ? e.target.value + 'Z' : null);

  // --- Comments helpers ---
  const comments = data.comments || [];
  const addComment = () => set('comments', [...comments, { comment: '', timestamp: null }]);
  const removeComment = (i) => {
    const next = comments.filter((_, idx) => idx !== i);
    set('comments', next.length ? next : null);
  };
  const setComment = (i, field, value) => {
    const next = comments.map((c, idx) => (idx === i ? { ...c, [field]: value } : c));
    set('comments', next);
  };

  // --- Tactic timestamps helpers ---
  const tt = data.tactic_timestamps || {};
  const setTT = (field, value) => set('tactic_timestamps', { ...tt, [field]: value });

  // --- Unit responses helpers ---
  const unitResponses = data.unit_responses || [];
  const addUnitResponse = () => set('unit_responses', [...unitResponses, {}]);
  const removeUnitResponse = (i) => {
    const next = unitResponses.filter((_, idx) => idx !== i);
    set('unit_responses', next);
  };
  const setUR = (i, field, value) => {
    const next = unitResponses.map((ur, idx) => (idx === i ? { ...ur, [field]: value } : ur));
    set('unit_responses', next);
  };

  // --- Med responses helpers (within a unit response) ---
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
    <div className="space-y-6 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 3: Dispatch (DispatchPayload)</h3>

      {/* Required string/datetime fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">incident_number *</label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-sm"
            value={data.incident_number || ''}
            onChange={(e) => set('incident_number', e.target.value || '')}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">center_id</label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-sm"
            maxLength={255}
            value={data.center_id || ''}
            onChange={(e) => set('center_id', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">determinant_code</label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-sm"
            maxLength={8}
            value={data.determinant_code || ''}
            onChange={(e) => set('determinant_code', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">incident_code</label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-sm"
            maxLength={255}
            value={data.incident_code || ''}
            onChange={(e) => set('incident_code', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">disposition</label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-sm"
            maxLength={255}
            value={data.disposition || ''}
            onChange={(e) => set('disposition', e.target.value || null)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">automatic_alarm</label>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={data.automatic_alarm === true ? 'true' : data.automatic_alarm === false ? 'false' : ''}
            onChange={(e) => set('automatic_alarm', e.target.value === '' ? null : e.target.value === 'true')}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      </div>

      {/* Required datetime fields */}
      <div className="grid grid-cols-2 gap-4">
        {['call_arrival', 'call_answered', 'call_create', 'incident_clear'].map((field) => (
          <div key={field}>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {field} {field !== 'incident_clear' ? '*' : ''}
            </label>
            <input
              type="datetime-local"
              step="1"
              className="w-full border rounded px-2 py-1 text-sm"
              value={data[field] ? data[field].slice(0, 19) : ''}
              onChange={setDatetime(field)}
            />
          </div>
        ))}
      </div>

      {/* Location (required) */}
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-2">location *</h4>
        <LocationFields
          data={data.location || {}}
          onChange={(loc) => set('location', loc)}
        />
      </div>

      {/* Point (optional GeoPoint) */}
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-2">point</h4>
        <GeoPointFields
          data={data.point || {}}
          onChange={(pt) => set('point', pt)}
        />
      </div>

      {/* Comments (optional array of CommentPayload) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-gray-700">comments</h4>
          <button type="button" className="text-sm text-blue-600 hover:underline" onClick={addComment}>
            + Add comment
          </button>
        </div>
        {comments.map((c, i) => (
          <div key={i} className="flex items-start gap-2 mb-2 p-2 bg-gray-50 rounded">
            <div className="flex-1 space-y-1">
              <textarea
                className="w-full border rounded px-2 py-1 text-sm"
                rows={2}
                maxLength={100000}
                value={c.comment || ''}
                onChange={(e) => setComment(i, 'comment', e.target.value || '')}
                placeholder="comment *"
              />
              <input
                type="datetime-local"
                step="1"
                className="border rounded px-2 py-1 text-sm"
                value={c.timestamp ? c.timestamp.slice(0, 19) : ''}
                onChange={(e) => setComment(i, 'timestamp', e.target.value ? e.target.value + 'Z' : null)}
              />
            </div>
            <button type="button" className="text-red-500 text-xs hover:underline mt-1" onClick={() => removeComment(i)}>
              remove
            </button>
          </div>
        ))}
      </div>

      {/* Tactic Timestamps (optional) */}
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-2">tactic_timestamps</h4>
        <div className="grid grid-cols-3 gap-2">
          {TACTIC_TIMESTAMP_FIELDS.map((field) => (
            <div key={field}>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{field}</label>
              <input
                type="datetime-local"
                step="1"
                className="w-full border rounded px-2 py-1 text-sm"
                value={tt[field] ? tt[field].slice(0, 19) : ''}
                onChange={(e) => setTT(field, e.target.value ? e.target.value + 'Z' : null)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Unit Responses (required array) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-gray-700">unit_responses *</h4>
          <button type="button" className="text-sm text-blue-600 hover:underline" onClick={addUnitResponse}>
            + Add unit response
          </button>
        </div>

        {unitResponses.map((ur, i) => (
          <div key={i} className="mb-4 p-3 bg-gray-50 rounded border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-600">Unit Response #{i + 1}</span>
              <button type="button" className="text-red-500 text-xs hover:underline" onClick={() => removeUnitResponse(i)}>
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

            {/* Unit response datetime fields */}
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

            {/* Unit response point */}
            <div className="mb-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">point</label>
              <GeoPointFields
                data={ur.point || {}}
                onChange={(pt) => setUR(i, 'point', pt)}
              />
            </div>

            {/* Med responses within unit response */}
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
    </div>
  );
}
