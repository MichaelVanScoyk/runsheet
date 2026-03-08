/**
 * nerisv1: ElectricHazardsSection — electric_hazards form (Section 20)
 *
 * Schema: IncidentPayload.electric_hazards from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * electric_hazards: ElectricHazardPayload[] | null
 *
 * ElectricHazardPayload (additionalProperties: false, 4 fields, required: type):
 *   - fire_details: ElectricHazardFirePayload|null
 *   - type: TypeEmerghazElecValue (48 values, from codes API)
 *   - source_or_target: TypeSourceTargetValue|null (3 values)
 *   - involved_in_crash: boolean|null
 *
 * ElectricHazardFirePayload (additionalProperties: false, 2 fields, required: none):
 *   - reignition: boolean|null
 *   - suppression_types: TypeEmerghazSuppressionValue[]|null (6 values)
 *
 * Props:
 *   data: array|null
 *   onChange: (newList) => void
 */
import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const SOURCE_TARGET_VALUES = ['SOURCE', 'TARGET', 'UNKNOWN'];
const SUPPRESSION_VALUES = ['BATTERY_PENETRATION', 'FIRE_BLANKET', 'RUN_COURSE', 'SUBMERGE_BURY', 'SUPPRESSION_WATER_ADDITIVE', 'SUPPRESSION_WATER_ONLY'];

export default function ElectricHazardsSection({ data = null, onChange }) {
  const [elecTypeOptions, setElecTypeOptions] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/neris-codes/categories/emerghaz_elec`)
      .then((r) => r.json())
      .then((codes) => setElecTypeOptions(codes.filter((c) => c.active).map((c) => c.value).sort()))
      .catch(() => {});
  }, []);

  const items = data || [];

  const add = () => onChange([...items, { type: '' }]);
  const remove = (i) => {
    const next = items.filter((_, idx) => idx !== i);
    onChange(next.length ? next : null);
  };
  const setItem = (i, field, value) => {
    const next = items.map((item, idx) => (idx === i ? { ...item, [field]: value } : item));
    onChange(next);
  };

  const setFireDetail = (i, field, value) => {
    const fd = items[i].fire_details || {};
    setItem(i, 'fire_details', { ...fd, [field]: value });
  };

  const toggleSuppression = (i, val) => {
    const fd = items[i].fire_details || {};
    const cur = fd.suppression_types || [];
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
    setItem(i, 'fire_details', { ...fd, suppression_types: next.length ? next : null });
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">Section 20: Electric Hazards</h3>
        <button type="button" className="text-sm text-blue-600 hover:underline" onClick={add}>+ Add</button>
      </div>

      {items.map((item, i) => (
        <div key={i} className="p-3 bg-gray-50 rounded border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">Electric Hazard #{i + 1}</span>
            <button type="button" className="text-red-500 text-xs hover:underline" onClick={() => remove(i)}>remove</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">type *</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={item.type || ''}
                onChange={(e) => setItem(i, 'type', e.target.value || '')}
              >
                <option value="">— select —</option>
                {elecTypeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">source_or_target</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={item.source_or_target || ''}
                onChange={(e) => setItem(i, 'source_or_target', e.target.value || null)}
              >
                <option value="">—</option>
                {SOURCE_TARGET_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">involved_in_crash</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={item.involved_in_crash === true ? 'true' : item.involved_in_crash === false ? 'false' : ''}
                onChange={(e) => setItem(i, 'involved_in_crash', e.target.value === '' ? null : e.target.value === 'true')}
              >
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>

          {/* fire_details */}
          <div className="p-2 border rounded bg-white space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <input
                type="checkbox"
                checked={item.fire_details != null}
                onChange={(e) => setItem(i, 'fire_details', e.target.checked ? {} : null)}
              />
              fire_details
            </label>
            {item.fire_details != null && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">reignition</label>
                  <select
                    className="w-full border rounded px-2 py-1 text-sm"
                    value={item.fire_details.reignition === true ? 'true' : item.fire_details.reignition === false ? 'false' : ''}
                    onChange={(e) => setFireDetail(i, 'reignition', e.target.value === '' ? null : e.target.value === 'true')}
                  >
                    <option value="">—</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">suppression_types</label>
                  <div className="flex flex-wrap gap-2">
                    {SUPPRESSION_VALUES.map((v) => (
                      <label key={v} className="flex items-center gap-1 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={(item.fire_details.suppression_types || []).includes(v)}
                          onChange={() => toggleSuppression(i, v)}
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
