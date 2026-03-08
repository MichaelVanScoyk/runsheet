/**
 * nerisv1: OtherAlarmSection — other_alarm form (Section 17)
 *
 * Schema: IncidentPayload.other_alarm from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * other_alarm: OtherAlarmPayload | null
 * Conditional: required for FIRE||STRUCTURE_FIRE (unless SUPPORT_AID GIVEN)
 *
 * OtherAlarmPayload (additionalProperties: false, required: presence):
 *   - presence: oneOf OtherAlarmPresentPayload | OtherAlarmNotPresentPayload
 *     disc=type: PRESENT | NOT_PRESENT | NOT_APPLICABLE
 *
 * OtherAlarmPresentPayload (additionalProperties: false, required: type, 2 fields):
 *   - type: const "PRESENT"
 *   - alarm_types: TypeAlarmOtherValue[]|null (4 values)
 *
 * OtherAlarmNotPresentPayload (additionalProperties: false, required: type):
 *   - type: enum NOT_PRESENT, NOT_APPLICABLE
 *
 * Props:
 *   data: object|null
 *   onChange: (newData) => void
 */
import React from 'react';

const PRESENCE_TYPES = ['PRESENT', 'NOT_PRESENT', 'NOT_APPLICABLE'];
const ALARM_OTHER_VALUES = ['CARBON_MONOXIDE', 'HEAT_DETECTOR', 'NATURAL_GAS', 'OTHER_CHEMICAL_DETECTOR'];

export default function OtherAlarmSection({ data = null, onChange }) {
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

  const toggleAlarmType = (val) => {
    const cur = pres.alarm_types || [];
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
    onChange({ presence: { ...pres, alarm_types: next.length ? next : null } });
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 17: Other Alarm</h3>

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
        <div className="p-3 bg-gray-50 rounded border">
          <label className="block text-xs font-semibold text-gray-600 mb-1">alarm_types</label>
          <div className="flex flex-wrap gap-2">
            {ALARM_OTHER_VALUES.map((v) => (
              <label key={v} className="flex items-center gap-1 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={(pres.alarm_types || []).includes(v)}
                  onChange={() => toggleAlarmType(v)}
                />
                {v}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
