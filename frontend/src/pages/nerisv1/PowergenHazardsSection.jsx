/**
 * nerisv1: PowergenHazardsSection — powergen_hazards form (Section 21)
 *
 * Schema: IncidentPayload.powergen_hazards from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * powergen_hazards: PowergenHazardPayload[] | null
 *
 * PowergenHazardPayload (additionalProperties: false, 1 field, required: pv_other):
 *   - pv_other: oneOf PvPowergenHazardPayload | OtherPowergenHazardPayload
 *     disc=type: PHOTOVOLTAICS | WIND_TURBINE | OTHER | NOT_APPLICABLE
 *
 * PvPowergenHazardPayload (additionalProperties: false, 3 fields, required: type):
 *   - type: const "PHOTOVOLTAICS"
 *   - source_or_target: TypeEmerghazPvIgnValue|null (SOURCE, TARGET)
 *   - pv_type: TypeEmerghazPvValue|null (5 values)
 *
 * OtherPowergenHazardPayload (additionalProperties: false, 1 field, required: type):
 *   - type: enum WIND_TURBINE, OTHER, NOT_APPLICABLE
 *
 * Props:
 *   data: array|null
 *   onChange: (newList) => void
 */
import React from 'react';

const POWERGEN_TYPES = ['PHOTOVOLTAICS', 'WIND_TURBINE', 'OTHER', 'NOT_APPLICABLE'];
const PV_IGN_VALUES = ['SOURCE', 'TARGET'];
const PV_TYPE_VALUES = ['OTHER', 'PANEL_POWER_GENERATION', 'PANEL_WATER_HEATING', 'THIN_FILM_POWER_GENERATION', 'TILE_POWER_GENERATION'];

export default function PowergenHazardsSection({ data = null, onChange }) {
  const items = data || [];

  const add = () => onChange([...items, { pv_other: { type: '' } }]);
  const remove = (i) => {
    const next = items.filter((_, idx) => idx !== i);
    onChange(next.length ? next : null);
  };

  const setPvOtherType = (i, t) => {
    if (t === 'PHOTOVOLTAICS') {
      onChange(items.map((item, idx) => idx === i ? { pv_other: { type: 'PHOTOVOLTAICS' } } : item));
    } else {
      onChange(items.map((item, idx) => idx === i ? { pv_other: { type: t } } : item));
    }
  };

  const setPvField = (i, field, value) => {
    const pv = items[i].pv_other || {};
    onChange(items.map((item, idx) => idx === i ? { pv_other: { ...pv, [field]: value } } : item));
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">Section 21: Powergen Hazards</h3>
        <button type="button" className="text-sm text-blue-600 hover:underline" onClick={add}>+ Add</button>
      </div>

      {items.map((item, i) => {
        const pvo = item.pv_other || {};
        const pvoType = pvo.type || '';
        const isPv = pvoType === 'PHOTOVOLTAICS';

        return (
          <div key={i} className="p-3 bg-gray-50 rounded border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-600">Powergen Hazard #{i + 1}</span>
              <button type="button" className="text-red-500 text-xs hover:underline" onClick={() => remove(i)}>remove</button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">pv_other.type * (discriminator)</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={pvoType}
                onChange={(e) => setPvOtherType(i, e.target.value || '')}
              >
                <option value="">— select —</option>
                {POWERGEN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {isPv && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">source_or_target</label>
                  <select
                    className="w-full border rounded px-2 py-1 text-sm"
                    value={pvo.source_or_target || ''}
                    onChange={(e) => setPvField(i, 'source_or_target', e.target.value || null)}
                  >
                    <option value="">—</option>
                    {PV_IGN_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">pv_type</label>
                  <select
                    className="w-full border rounded px-2 py-1 text-sm"
                    value={pvo.pv_type || ''}
                    onChange={(e) => setPvField(i, 'pv_type', e.target.value || null)}
                  >
                    <option value="">—</option>
                    {PV_TYPE_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
