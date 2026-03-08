/**
 * nerisv1: AidsSection — aids form (Section 5)
 *
 * Schema: IncidentPayload.aids from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * aids: AidPayload[] | null
 *
 * AidPayload (additionalProperties: false, all 3 required):
 *   - department_neris_id: string (required, pattern ^FD\d{8}$ or ^FM\d{8}$)
 *   - aid_type: TypeAidValue (required) — ACTING_AS_AID, IN_LIEU_AID, SUPPORT_AID
 *   - aid_direction: TypeAidDirectionValue (required) — GIVEN, RECEIVED
 *
 * Props:
 *   data: array|null — current aids list
 *   onChange: (newList) => void
 */
import React from 'react';

const AID_TYPES = ['ACTING_AS_AID', 'IN_LIEU_AID', 'SUPPORT_AID'];
const AID_DIRECTIONS = ['GIVEN', 'RECEIVED'];

export default function AidsSection({ data = null, onChange }) {
  const aids = data || [];

  const setItem = (index, field, value) => {
    const next = aids.map((item, i) => (i === index ? { ...item, [field]: value } : item));
    onChange(next);
  };

  const addAid = () => {
    onChange([...aids, { department_neris_id: '', aid_type: '', aid_direction: '' }]);
  };

  const removeAid = (index) => {
    const next = aids.filter((_, i) => i !== index);
    onChange(next.length ? next : null);
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">Section 5: Aids</h3>
        <button type="button" className="text-sm text-blue-600 hover:underline" onClick={addAid}>
          + Add aid
        </button>
      </div>

      {aids.map((item, index) => (
        <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded">
          <div className="flex-1 grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">department_neris_id *</label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={item.department_neris_id || ''}
                onChange={(e) => setItem(index, 'department_neris_id', e.target.value || '')}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">aid_type *</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={item.aid_type || ''}
                onChange={(e) => setItem(index, 'aid_type', e.target.value || '')}
              >
                <option value="">— select —</option>
                {AID_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">aid_direction *</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={item.aid_direction || ''}
                onChange={(e) => setItem(index, 'aid_direction', e.target.value || '')}
              >
                <option value="">— select —</option>
                {AID_DIRECTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="button" className="mt-5 text-red-500 text-xs hover:underline" onClick={() => removeAid(index)}>
            remove
          </button>
        </div>
      ))}
    </div>
  );
}
