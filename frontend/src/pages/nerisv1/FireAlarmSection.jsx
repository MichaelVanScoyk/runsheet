/**
 * nerisv1: FireAlarmSection — fire_alarm form (Section 16)
 *
 * Schema: IncidentPayload.fire_alarm from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * fire_alarm: FireAlarmPayload | null
 * Conditional: required for FIRE||STRUCTURE_FIRE (unless SUPPORT_AID GIVEN)
 *
 * FireAlarmPayload (additionalProperties: false, required: presence):
 *   - presence: oneOf FireAlarmPresentPayload | FireAlarmNotPresentPayload
 *     disc=type: PRESENT | NOT_PRESENT | NOT_APPLICABLE
 *
 * FireAlarmPresentPayload (additionalProperties: false, required: type, 3 fields):
 *   - type: const "PRESENT"
 *   - alarm_types: TypeAlarmFireValue[]|null (3 values)
 *   - operation_type: TypeAlarmOperationValue|null (5 values)
 *
 * FireAlarmNotPresentPayload (additionalProperties: false, required: type):
 *   - type: enum NOT_PRESENT, NOT_APPLICABLE
 *
 * Props:
 *   data: object|null
 *   onChange: (newData) => void
 */
import React from 'react';

const PRESENCE_TYPES = ['PRESENT', 'NOT_PRESENT', 'NOT_APPLICABLE'];
const ALARM_FIRE_VALUES = ['AUTOMATIC', 'MANUAL', 'MANUAL_AND_AUTOMATIC'];
const OPERATION_TYPES = ['FAILED_TO_OPERATE', 'INSUFFICIENT_SOURCE', 'NO_OCCUPANT_TO_NOTIFY', 'OPERATED_ALERTED_OCCUPANT', 'OPERATED_FAILED_TO_ALERT_OCCUPANT'];

export default function FireAlarmSection({ data = null, onChange }) {
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

  const toggleAlarmType = (val) => {
    const cur = pres.alarm_types || [];
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
    setPres('alarm_types', next.length ? next : null);
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 16: Fire Alarm</h3>

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
            <label className="block text-xs font-semibold text-gray-600 mb-1">alarm_types</label>
            <div className="flex flex-wrap gap-2">
              {ALARM_FIRE_VALUES.map((v) => (
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
