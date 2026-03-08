/**
 * nerisv1: CsstHazardSection — csst_hazard form (Section 22)
 *
 * Schema: IncidentPayload.csst_hazard from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * csst_hazard: CsstHazardPayload | null
 *
 * CsstHazardPayload (additionalProperties: false, 3 fields, required: none):
 *   - ignition_source: boolean|null
 *   - lightning_suspected: TypeYesNoUnknownValue|null (NO, UNKNOWN, YES)
 *   - grounded: TypeYesNoUnknownValue|null (NO, UNKNOWN, YES)
 *
 * Props:
 *   data: object|null
 *   onChange: (newData) => void
 */
import React from 'react';

const YES_NO_UNKNOWN = ['NO', 'UNKNOWN', 'YES'];

export default function CsstHazardSection({ data = null, onChange }) {
  if (data === null) return null;

  const set = (field, value) => {
    const next = { ...data, [field]: value };
    const hasAny = next.ignition_source != null || next.lightning_suspected != null || next.grounded != null;
    onChange(hasAny ? next : null);
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 22: CSST Hazard</h3>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">ignition_source</label>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={data.ignition_source === true ? 'true' : data.ignition_source === false ? 'false' : ''}
            onChange={(e) => set('ignition_source', e.target.value === '' ? null : e.target.value === 'true')}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">lightning_suspected</label>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={data.lightning_suspected || ''}
            onChange={(e) => set('lightning_suspected', e.target.value || null)}
          >
            <option value="">—</option>
            {YES_NO_UNKNOWN.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">grounded</label>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={data.grounded || ''}
            onChange={(e) => set('grounded', e.target.value || null)}
          >
            <option value="">—</option>
            {YES_NO_UNKNOWN.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
