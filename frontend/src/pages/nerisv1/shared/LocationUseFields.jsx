/**
 * nerisv1 shared: LocationUsePayload form fields
 *
 * Source: LocationUsePayload from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 * Fields: 4, Required: 0
 *   - in_use: InusePayload|null {in_use: boolean (required), intended: boolean|null}
 *   - use_type: TypeLocationUseValue|null (79 enum values)
 *   - vacancy_cause: TypeVacancyValue|null (7 enum values)
 *   - secondary_use: TypeLocationUseValue|null (79 enum values)
 *
 * Used by: BaseSection, Exposures
 *
 * Props:
 *   data: object — current LocationUsePayload values
 *   onChange: (field, value) => void
 */
import React from 'react';

const VACANCY_CAUSES = [
  '', 'ABANDONED', 'DAMAGE_DECAY', 'FORECLOSURE', 'FOR_SALE_LEASE',
  'NEW_CONSTRUCTION_REMODEL', 'SEASONAL_OCCASIONALLY_OCCUPIED', 'UNKNOWN',
];

export default function LocationUseFields({ data = {}, onChange }) {
  const val = (field) => data[field] ?? '';

  const setInUse = (subField) => (e) => {
    const current = data.in_use || {};
    let v;
    if (subField === 'in_use' || subField === 'intended') {
      v = e.target.value === '' ? null : e.target.value === 'true';
    }
    onChange('in_use', { ...current, [subField]: v });
  };

  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-gray-700">Location Use (LocationUsePayload)</h4>

      {/* use_type: TypeLocationUseValue enum — 79 values, text input */}
      <div>
        <label className="block text-xs text-gray-500">use_type</label>
        <input type="text" value={val('use_type')} onChange={(e) => onChange('use_type', e.target.value || null)}
          className="w-full border rounded px-2 py-1 text-sm" placeholder="TypeLocationUseValue enum" />
      </div>

      {/* secondary_use: TypeLocationUseValue enum */}
      <div>
        <label className="block text-xs text-gray-500">secondary_use</label>
        <input type="text" value={val('secondary_use')} onChange={(e) => onChange('secondary_use', e.target.value || null)}
          className="w-full border rounded px-2 py-1 text-sm" placeholder="TypeLocationUseValue enum" />
      </div>

      {/* vacancy_cause: TypeVacancyValue enum — 7 values, dropdown */}
      <div>
        <label className="block text-xs text-gray-500">vacancy_cause</label>
        <select value={val('vacancy_cause')} onChange={(e) => onChange('vacancy_cause', e.target.value || null)}
          className="w-full border rounded px-2 py-1 text-sm">
          {VACANCY_CAUSES.map((v) => (
            <option key={v} value={v}>{v || '—'}</option>
          ))}
        </select>
      </div>

      {/* in_use: InusePayload — in_use (bool required), intended (bool|null) */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500">in_use.in_use</label>
          <select value={data.in_use?.in_use === true ? 'true' : data.in_use?.in_use === false ? 'false' : ''}
            onChange={setInUse('in_use')}
            className="w-full border rounded px-2 py-1 text-sm">
            <option value="">—</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500">in_use.intended</label>
          <select value={data.in_use?.intended === true ? 'true' : data.in_use?.intended === false ? 'false' : ''}
            onChange={setInUse('intended')}
            className="w-full border rounded px-2 py-1 text-sm">
            <option value="">—</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
    </div>
  );
}
