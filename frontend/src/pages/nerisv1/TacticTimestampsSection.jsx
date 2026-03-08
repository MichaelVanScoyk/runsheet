/**
 * nerisv1: TacticTimestampsSection — tactic_timestamps form (Section 8)
 *
 * Schema: IncidentPayload.tactic_timestamps from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * tactic_timestamps: IncidentTacticTimestampsPayload | null
 *
 * IncidentTacticTimestampsPayload (additionalProperties: false, required: none, 9 fields):
 *   - command_established: datetime|null
 *   - completed_sizeup: datetime|null
 *   - suppression_complete: datetime|null
 *   - primary_search_begin: datetime|null
 *   - primary_search_complete: datetime|null
 *   - water_on_fire: datetime|null
 *   - fire_under_control: datetime|null
 *   - fire_knocked_down: datetime|null
 *   - extrication_complete: datetime|null
 *
 * Note: Same 9 fields as DispatchTacticTimestampsPayload (section 3) but a
 * separate schema in the spec. This is the incident-level version.
 *
 * Props:
 *   data: object|null — current tactic_timestamps value (NERIS field names)
 *   onChange: (newData) => void
 */
import React from 'react';

const TIMESTAMP_FIELDS = [
  'command_established',
  'completed_sizeup',
  'suppression_complete',
  'primary_search_begin',
  'primary_search_complete',
  'water_on_fire',
  'fire_under_control',
  'fire_knocked_down',
  'extrication_complete',
];

export default function TacticTimestampsSection({ data = null, onChange }) {
  const tt = data || {};

  const set = (field, value) => {
    const next = { ...tt, [field]: value };
    // If all fields are null/undefined, set the whole thing to null
    const hasAny = TIMESTAMP_FIELDS.some((f) => next[f] != null);
    onChange(hasAny ? next : null);
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">
        Section 8: Tactic Timestamps (Incident-Level)
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {TIMESTAMP_FIELDS.map((field) => (
          <div key={field}>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {field}
            </label>
            <input
              type="datetime-local"
              step="1"
              className="w-full border rounded px-2 py-1 text-sm"
              value={tt[field] ? tt[field].slice(0, 19) : ''}
              onChange={(e) =>
                set(field, e.target.value ? e.target.value + 'Z' : null)
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
