/**
 * nerisv1: MedicalOxygenHazardSection — medical_oxygen_hazard form (Section 23)
 *
 * Schema: IncidentPayload.medical_oxygen_hazard from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * medical_oxygen_hazard: MedicalOxygenHazardPayload | null
 *
 * MedicalOxygenHazardPayload (additionalProperties: false, required: presence):
 *   - presence: oneOf Present | NotPresent, disc=type (PRESENT, NOT_PRESENT, NOT_APPLICABLE)
 *
 * MedicalOxygenHazardPresentPayload (additionalProperties: false, required: type, 2 fields):
 *   - type: const "PRESENT"
 *   - contributed_to_flame_spread: boolean|null
 *
 * MedicalOxygenHazardNotPresentPayload (additionalProperties: false, required: type):
 *   - type: enum NOT_PRESENT, NOT_APPLICABLE
 *
 * Props:
 *   data: object|null
 *   onChange: (newData) => void
 */
import React from 'react';

const PRESENCE_TYPES = ['PRESENT', 'NOT_PRESENT', 'NOT_APPLICABLE'];

export default function MedicalOxygenHazardSection({ data = null, onChange }) {
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

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 23: Medical Oxygen Hazard</h3>

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
          <label className="block text-xs font-semibold text-gray-600 mb-1">contributed_to_flame_spread</label>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={pres.contributed_to_flame_spread === true ? 'true' : pres.contributed_to_flame_spread === false ? 'false' : ''}
            onChange={(e) => onChange({ presence: { ...pres, contributed_to_flame_spread: e.target.value === '' ? null : e.target.value === 'true' } })}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      )}
    </div>
  );
}
