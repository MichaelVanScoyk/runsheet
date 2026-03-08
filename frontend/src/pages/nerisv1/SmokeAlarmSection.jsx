/**
 * nerisv1: SmokeAlarmSection — smoke_alarm form (Section 15)
 *
 * Schema: IncidentPayload.smoke_alarm from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * smoke_alarm: SmokeAlarmPayload | null
 * Conditional: required for FIRE||STRUCTURE_FIRE (unless SUPPORT_AID GIVEN)
 *
 * Presence discriminator (PRESENT / NOT_PRESENT / NOT_APPLICABLE)
 *   -> PRESENT: working, alarm_types, operation
 *     -> operation.alerted_failed_other discriminator:
 *       -> OPERATED_ALERTED_OCCUPANT: occupant_action
 *       -> FAILED_TO_OPERATE: failure_reason
 *       -> OPERATED_FAILED_TO_ALERT_OCCUPANT / NO_OCCUPANT_TO_NOTIFY / INSUFFICIENT_SOURCE: type only
 *
 * Props:
 *   data: object|null
 *   onChange: (newData) => void
 */
import React from 'react';

const PRESENCE_TYPES = ['PRESENT', 'NOT_PRESENT', 'NOT_APPLICABLE'];
const ALARM_SMOKE_VALUES = ['BED_SHAKER', 'COMBINATION', 'HARDWIRED', 'HARD_OF_HEARING_WITH_STROBE', 'INTERCONNECTED', 'LONG_LIFE_BATTERY_POWERED', 'REPLACEABLE_BATTERY_POWERED', 'UNKNOWN'];
const OPERATION_TYPES = ['OPERATED_ALERTED_OCCUPANT', 'FAILED_TO_OPERATE', 'OPERATED_FAILED_TO_ALERT_OCCUPANT', 'NO_OCCUPANT_TO_NOTIFY', 'INSUFFICIENT_SOURCE'];
const OCCUPANT_RESPONSE = ['ATTEMPTED_TO_EXTINGUISH', 'ATTEMPTED_TO_RESCUE_ANIMALS', 'ATTEMPTED_TO_RESCUE_OCCUPANTS', 'EVACUATED', 'IGNORED_ALARM', 'UNABLE_TO_RESPOND', 'UNKNOWN'];
const FAILURE_REASONS = ['DEVICE_MALFUNCTION', 'EXPIRED', 'IMPROPER_INSTALLATION', 'NO_BATTERY', 'OTHER_NON_FUNCTIONAL_CAUSE', 'TAMPER', 'UNABLE_TO_DETERMINE'];

function EnumSelect({ label, value, options, onChange, required }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}{required ? ' *' : ''}</label>
      <select className="w-full border rounded px-2 py-1 text-sm" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function CheckboxArray({ label, selected, options, onToggle }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-1 text-xs text-gray-700">
            <input type="checkbox" checked={(selected || []).includes(o)} onChange={() => onToggle(o)} />
            {o}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function SmokeAlarmSection({ data = null, onChange }) {
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

  // Operation
  const op = pres.operation || null;
  const afo = op?.alerted_failed_other || {};
  const afoType = afo.type || '';

  const setAfoType = (t) => {
    if (!t) {
      setPres('operation', null);
      return;
    }
    if (t === 'OPERATED_ALERTED_OCCUPANT') {
      setPres('operation', { alerted_failed_other: { type: t } });
    } else if (t === 'FAILED_TO_OPERATE') {
      setPres('operation', { alerted_failed_other: { type: t } });
    } else {
      setPres('operation', { alerted_failed_other: { type: t } });
    }
  };

  const setAfo = (field, value) => {
    setPres('operation', { alerted_failed_other: { ...afo, [field]: value } });
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 15: Smoke Alarm</h3>

      <EnumSelect label="presence.type * (discriminator)" value={presType} options={PRESENCE_TYPES} onChange={(v) => setPresType(v || '')} required />

      {presType === 'PRESENT' && (
        <div className="p-3 bg-gray-50 rounded border space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">working</label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={pres.working === true ? 'true' : pres.working === false ? 'false' : ''}
              onChange={(e) => setPres('working', e.target.value === '' ? null : e.target.value === 'true')}
            >
              <option value="">—</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          <CheckboxArray label="alarm_types" selected={pres.alarm_types} options={ALARM_SMOKE_VALUES} onToggle={toggleAlarmType} />

          <div className="p-2 border rounded bg-white space-y-2">
            <span className="text-xs font-bold text-gray-500">operation</span>
            <EnumSelect label="alerted_failed_other.type" value={afoType} options={OPERATION_TYPES} onChange={(v) => setAfoType(v)} />

            {afoType === 'OPERATED_ALERTED_OCCUPANT' && (
              <EnumSelect label="occupant_action" value={afo.occupant_action} options={OCCUPANT_RESPONSE} onChange={(v) => setAfo('occupant_action', v)} />
            )}

            {afoType === 'FAILED_TO_OPERATE' && (
              <EnumSelect label="failure_reason" value={afo.failure_reason} options={FAILURE_REASONS} onChange={(v) => setAfo('failure_reason', v)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
