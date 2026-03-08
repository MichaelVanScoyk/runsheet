/**
 * nerisv1: CookingFireSuppressionSection — cooking_fire_suppression form (Section 19)
 *
 * Schema: IncidentPayload.cooking_fire_suppression from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * cooking_fire_suppression: CookingFireSuppressionPayload | null
 * Conditional: required for FIRE||STRUCTURE_FIRE||CONFINED_COOKING_APPLIANCE_FIRE (unless SUPPORT_AID GIVEN)
 *
 * CookingFireSuppressionPayload (additionalProperties: false, required: presence):
 *   - presence: oneOf Present | NotPresent, disc=type (PRESENT, NOT_PRESENT, NOT_APPLICABLE)
 *
 * CookingFireSuppressionPresentPayload (additionalProperties: false, required: type, 3 fields):
 *   - type: const "PRESENT"
 *   - suppression_types: TypeSuppressCookingValue[]|null (5 values)
 *   - operation_type: TypeSuppressOperationValue|null (3 values)
 *
 * CookingFireSuppressionNotPresentPayload (additionalProperties: false, required: type):
 *   - type: enum NOT_PRESENT, NOT_APPLICABLE
 *
 * Props:
 *   data: object|null
 *   onChange: (newData) => void
 */
import React from 'react';

const PRESENCE_TYPES = ['PRESENT', 'NOT_PRESENT', 'NOT_APPLICABLE'];
const COOKING_SUPPRESS_VALUES = [
  'COMMERCIAL_HOOD_SUPPRESSION',
  'ELECTRIC_POWER_CUTOFF_DEVICE',
  'OTHER',
  'RESIDENTIAL_HOOD_MOUNTED',
  'TEMPERATURE_LIMITING_STOVE',
];
const OPERATION_TYPES = ['NO_OPERATION', 'OPERATED_EFFECTIVE', 'OPERATED_NOT_EFFECTIVE'];

export default function CookingFireSuppressionSection({ data = null, onChange }) {
  if (data === null) return null;

  const pres = data.presence || {};
  const presType = pres.type || '';

  const setPresType = (t) => {
    if (t === 'PRESENT') {
      onChange({ presence: { type: 'PRESENT' } });
    } else {
      onChange({ presence: { type: t } });
    }
  };

  const setPres = (field, value) => {
    onChange({ presence: { ...pres, [field]: value } });
  };

  const toggleSuppType = (val) => {
    const cur = pres.suppression_types || [];
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
    setPres('suppression_types', next.length ? next : null);
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 19: Cooking Fire Suppression</h3>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">presence.type * (discriminator)</label>
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={presType}
          onChange={(e) => setPresType(e.target.value || '')}
        >
          <option value="">—</option>
          {PRESENCE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {presType === 'PRESENT' && (
        <div className="p-3 bg-gray-50 rounded border space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">suppression_types</label>
            <div className="flex flex-wrap gap-2">
              {COOKING_SUPPRESS_VALUES.map((v) => (
                <label key={v} className="flex items-center gap-1 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={(pres.suppression_types || []).includes(v)}
                    onChange={() => toggleSuppType(v)}
                  />
                  {v}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">operation_type</label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={pres.operation_type || ''}
              onChange={(e) => setPres('operation_type', e.target.value || null)}
            >
              <option value="">—</option>
              {OPERATION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
