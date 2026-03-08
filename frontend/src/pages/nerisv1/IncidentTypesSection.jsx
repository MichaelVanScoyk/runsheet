/**
 * nerisv1: IncidentTypesSection — incident_types form (Section 2)
 *
 * Schema: IncidentPayload.incident_types from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * incident_types is anyOf:
 *   - IncidentTypePayload[] (minItems 1, maxItems 3)
 *   - IncidentTypeCadPayload[] (minItems 1, maxItems 1)
 *
 * IncidentTypePayload (additionalProperties: false):
 *   - type: TypeIncidentValue (required)
 *   - primary: boolean|null (optional)
 *
 * IncidentTypeCadPayload (additionalProperties: false):
 *   - type: string, const "UNDETERMINED" (required)
 *
 * Props:
 *   data: array — current incident_types list (NERIS field names)
 *   onChange: (newList) => void
 */
import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function IncidentTypesSection({ data = [], onChange }) {
  const [incidentTypeOptions, setIncidentTypeOptions] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/neris-codes/categories/incident_type`)
      .then((r) => r.json())
      .then((codes) => {
        const sorted = codes
          .filter((c) => c.active)
          .map((c) => c.value)
          .sort();
        setIncidentTypeOptions(sorted);
      })
      .catch(() => {});
  }, []);

  const isCadMode = data.length === 1 && data[0]?.type === 'UNDETERMINED';

  const setItem = (index, field, value) => {
    const next = data.map((item, i) => {
      if (i !== index) return item;
      return { ...item, [field]: value };
    });
    onChange(next);
  };

  const setPrimary = (index) => {
    const next = data.map((item, i) => ({
      ...item,
      primary: i === index ? true : null,
    }));
    onChange(next);
  };

  const addType = () => {
    if (data.length >= 3) return;
    onChange([...data, { type: '', primary: null }]);
  };

  const removeType = (index) => {
    if (data.length <= 1) return;
    const next = data.filter((_, i) => i !== index);
    onChange(next);
  };

  const toggleCadMode = () => {
    if (isCadMode) {
      onChange([{ type: '', primary: null }]);
    } else {
      onChange([{ type: 'UNDETERMINED' }]);
    }
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">
          Section 2: Incident Types
        </h3>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={isCadMode}
            onChange={toggleCadMode}
          />
          CAD Undetermined
        </label>
      </div>

      {isCadMode ? (
        <div className="p-3 bg-gray-50 rounded text-sm text-gray-700">
          Type: <strong>UNDETERMINED</strong> (CAD integration only — single
          entry, no primary flag)
        </div>
      ) : (
        <>
          {data.map((item, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 bg-gray-50 rounded"
            >
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  type *
                </label>
                <select
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={item.type || ''}
                  onChange={(e) => setItem(index, 'type', e.target.value || '')}
                >
                  <option value="">— select —</option>
                  {incidentTypeOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-5">
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="radio"
                    name="incident_type_primary"
                    checked={item.primary === true}
                    onChange={() => setPrimary(index)}
                  />
                  primary
                </label>
              </div>

              {data.length > 1 && (
                <button
                  type="button"
                  className="mt-5 text-red-500 text-xs hover:underline"
                  onClick={() => removeType(index)}
                >
                  remove
                </button>
              )}
            </div>
          ))}

          {data.length < 3 && (
            <button
              type="button"
              className="text-sm text-blue-600 hover:underline"
              onClick={addType}
            >
              + Add incident type (max 3)
            </button>
          )}
        </>
      )}
    </div>
  );
}
