/**
 * nerisv1: SpecialModifiersSection — special_modifiers form (Section 4)
 *
 * Schema: IncidentPayload.special_modifiers from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * special_modifiers: TypeSpecialModifierValue[] | null
 *
 * TypeSpecialModifierValue: string enum (7 values):
 *   - ACTIVE_ASSAILANT
 *   - COUNTY_LOCAL_DECLARED_DISASTER
 *   - FEDERAL_DECLARED_DISASTER
 *   - MCI
 *   - STATE_DECLARED_DISASTER
 *   - URBAN_CONFLAGRATION
 *   - VIOLENCE_AGAINST_RESPONDER
 *
 * Props:
 *   data: array|null — current special_modifiers list
 *   onChange: (newList) => void
 */
import React from 'react';

const SPECIAL_MODIFIER_VALUES = [
  'ACTIVE_ASSAILANT',
  'COUNTY_LOCAL_DECLARED_DISASTER',
  'FEDERAL_DECLARED_DISASTER',
  'MCI',
  'STATE_DECLARED_DISASTER',
  'URBAN_CONFLAGRATION',
  'VIOLENCE_AGAINST_RESPONDER',
];

export default function SpecialModifiersSection({ data = null, onChange }) {
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
      <h3 className="text-lg font-bold text-gray-800">Section 4: Special Modifiers</h3>
      <div className="grid grid-cols-2 gap-2">
        {SPECIAL_MODIFIER_VALUES.map((value) => (
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
