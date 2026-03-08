/**
 * nerisv1 shared: MedResponseFields — MedResponsePayload form
 *
 * Schema: MedResponsePayload from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 * Fields: 7, Required: 0, additionalProperties: false
 *
 *   - hospital_destination: string|null (minLength 1, maxLength 255)
 *   - at_patient: datetime|null
 *   - enroute_to_hospital: datetime|null
 *   - arrived_at_hospital: datetime|null
 *   - transferred_to_agency: datetime|null
 *   - transferred_to_facility: datetime|null
 *   - hospital_cleared: datetime|null
 *
 * Used by: DispatchUnitResponsePayload (section 3), IncidentUnitResponsePayload (section 9)
 *
 * Props:
 *   data: object
 *   onChange: (newData) => void
 */
import React from 'react';

const DATETIME_FIELDS = [
  'at_patient',
  'enroute_to_hospital',
  'arrived_at_hospital',
  'transferred_to_agency',
  'transferred_to_facility',
  'hospital_cleared',
];

export default function MedResponseFields({ data = {}, onChange }) {
  const set = (field, value) => onChange({ ...data, [field]: value });

  return (
    <div className="space-y-2 p-2 bg-white rounded border border-gray-200">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">hospital_destination</label>
        <input
          type="text"
          className="w-full border rounded px-2 py-1 text-sm"
          maxLength={255}
          value={data.hospital_destination || ''}
          onChange={(e) => set('hospital_destination', e.target.value || null)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {DATETIME_FIELDS.map((field) => (
          <div key={field}>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{field}</label>
            <input
              type="datetime-local"
              step="1"
              className="w-full border rounded px-2 py-1 text-sm"
              value={data[field] ? data[field].slice(0, 19) : ''}
              onChange={(e) => set(field, e.target.value ? e.target.value + 'Z' : null)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
