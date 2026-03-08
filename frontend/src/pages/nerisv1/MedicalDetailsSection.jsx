/**
 * nerisv1: MedicalDetailsSection — medical_details form (Section 14)
 *
 * Schema: IncidentPayload.medical_details from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * medical_details: MedicalPayload[] | null
 * Conditional: only when incident type starts with MEDICAL||
 *
 * MedicalPayload (additionalProperties: false, 4 fields, required: patient_care_evaluation):
 *   - patient_care_report_id: string|null (minLength 1, maxLength 255)
 *   - patient_care_evaluation: TypeMedicalPatientCareValue (6 values, required)
 *   - patient_status: TypeMedicalPatientStatusValue|null (3 values)
 *   - transport_disposition: TypeMedicalTransportValue|null (5 values)
 *
 * Props:
 *   data: array|null — current medical_details list (NERIS field names)
 *   onChange: (newList) => void
 */
import React from 'react';

const PATIENT_CARE_VALUES = [
  'PATIENT_DEAD_ON_ARRIVAL',
  'PATIENT_EVALUATED_CARE_PROVIDED',
  'PATIENT_EVALUATED_NO_CARE_REQUIRED',
  'PATIENT_EVALUATED_REFUSED_CARE',
  'PATIENT_REFUSED_EVALUATION_CARE',
  'PATIENT_SUPPORT_SERVICES_PROVIDED',
];

const PATIENT_STATUS_VALUES = ['IMPROVED', 'UNCHANGED', 'WORSE'];

const TRANSPORT_VALUES = [
  'NONPATIENT_TRANSPORT',
  'NO_TRANSPORT',
  'OTHER_AGENCY_TRANSPORT',
  'PATIENT_REFUSED_TRANSPORT',
  'TRANSPORT_BY_EMS_UNIT',
];

export default function MedicalDetailsSection({ data = null, onChange }) {
  const items = data || [];

  const add = () => {
    onChange([...items, { patient_care_evaluation: '' }]);
  };

  const remove = (i) => {
    const next = items.filter((_, idx) => idx !== i);
    onChange(next.length ? next : null);
  };

  const setItem = (i, field, value) => {
    const next = items.map((item, idx) => (idx === i ? { ...item, [field]: value } : item));
    onChange(next);
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">Section 14: Medical Details</h3>
        <button type="button" className="text-sm text-blue-600 hover:underline" onClick={add}>
          + Add medical record
        </button>
      </div>

      {items.map((item, i) => (
        <div key={i} className="p-3 bg-gray-50 rounded border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">Medical #{i + 1}</span>
            <button type="button" className="text-red-500 text-xs hover:underline" onClick={() => remove(i)}>
              remove
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">patient_care_report_id</label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                maxLength={255}
                value={item.patient_care_report_id || ''}
                onChange={(e) => setItem(i, 'patient_care_report_id', e.target.value || null)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">patient_care_evaluation *</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={item.patient_care_evaluation || ''}
                onChange={(e) => setItem(i, 'patient_care_evaluation', e.target.value || '')}
              >
                <option value="">— select —</option>
                {PATIENT_CARE_VALUES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">patient_status</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={item.patient_status || ''}
                onChange={(e) => setItem(i, 'patient_status', e.target.value || null)}
              >
                <option value="">—</option>
                {PATIENT_STATUS_VALUES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">transport_disposition</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={item.transport_disposition || ''}
                onChange={(e) => setItem(i, 'transport_disposition', e.target.value || null)}
              >
                <option value="">—</option>
                {TRANSPORT_VALUES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
