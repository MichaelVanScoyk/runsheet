/**
 * nerisv1: NonfdAidsSection — nonfd_aids form (Section 6)
 *
 * Schema: IncidentPayload.nonfd_aids from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * nonfd_aids: TypeAidNonfdValue[] | null
 *
 * TypeAidNonfdValue: string enum (7 values):
 *   - ANIMAL_SERVICES
 *   - EMS
 *   - HOUSING_SERVICES
 *   - LAW_ENFORCEMENT
 *   - REMEDIATION_SERVICES
 *   - SOCIAL_SERVICES
 *   - UTILITIES_PUBLIC_WORKS
 *
 * Props:
 *   data: array|null — current nonfd_aids list
 *   onChange: (newList) => void
 */
import React from 'react';

const NONFD_AID_VALUES = [
  'ANIMAL_SERVICES',
  'EMS',
  'HOUSING_SERVICES',
  'LAW_ENFORCEMENT',
  'REMEDIATION_SERVICES',
  'SOCIAL_SERVICES',
  'UTILITIES_PUBLIC_WORKS',
];

export default function NonfdAidsSection({ data = null, onChange }) {
  const selected = data || [];

  const toggle = (value) => {
    if (selected.includes(value)) {
      const next = selected.filter((v) => v !== value);
      onChange(next.length ? next : null);
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="space-y-2 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 6: Non-FD Aids</h3>
      <div className="grid grid-cols-2 gap-2">
        {NONFD_AID_VALUES.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => toggle(value)}
            />
            {value}
          </label>
        ))}
      </div>
    </div>
  );
}
