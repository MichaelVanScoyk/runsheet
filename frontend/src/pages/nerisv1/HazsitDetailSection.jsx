/**
 * nerisv1: HazsitDetailSection — hazsit_detail form (Section 13)
 *
 * Schema: IncidentPayload.hazsit_detail from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * hazsit_detail: HazsitPayload | null
 * Conditional: only when incident type starts with HAZSIT||
 *
 * HazsitPayload (additionalProperties: false, 3 fields, required: evacuated, disposition):
 *   - evacuated: integer (required)
 *   - chemicals: ChemicalPayload[]|null
 *   - disposition: TypeHazardDispositionValue (8 values, required)
 *
 * ChemicalPayload (additionalProperties: false, 4 fields, required: name, release_occurred, dot_class):
 *   - name: string (required)
 *   - release_occurred: boolean (required)
 *   - release: ReleasePayload|null
 *   - dot_class: TypeHazardDotValue (9 values, required)
 *
 * ReleasePayload (additionalProperties: false, 5 fields, required: none):
 *   - estimated_amount: number|null
 *   - unit_of_measurement: TypeHazardUnitValue|null (33 values, from codes API)
 *   - physical_state: TypeHazardPhysicalStateValue|null (5 values)
 *   - released_into: TypeHazardReleasedIntoValue|null (3 values)
 *   - cause: TypeHazardCauseValue|null (5 values)
 *
 * Props:
 *   data: object|null — current hazsit_detail (NERIS field names)
 *   onChange: (newData) => void
 */
import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Small enums hardcoded from live spec
const DISPOSITION_VALUES = ['COMPLETED_FIRE_SERVICE_ONLY', 'COMPLETED_WITH_FIRE_SERVICE_PRESENT', 'RELEASED_TO_COUNTY_AGENCY', 'RELEASED_TO_FEDERAL_AGENCY', 'RELEASED_TO_LOCAL_AGENCY', 'RELEASED_TO_PRIVATE_AGENCY', 'RELEASED_TO_PROPERTY_OWNER', 'RELEASED_TO_STATE_AGENCY'];
const DOT_CLASSES = ['CORROSIVES', 'EXPLOSIVES', 'FLAMMABLE_LIQUIDS', 'FLAMMABLE_SOLIDS', 'GASES', 'MISCELLANEOUS_DANGEROUS_SUBSTANCES', 'OXIDIZERS', 'POISONS_AND_ETIOLOGIC_MATERIALS', 'RADIOACTIVE_MATERIALS'];
const PHYSICAL_STATES = ['GAS', 'LIQUID', 'RADIOACTIVE', 'SOLID', 'UNKNOWN'];
const RELEASED_INTO = ['AIR', 'GROUND', 'WATER'];
const HAZARD_CAUSES = ['ACT_OF_NATURE', 'CAUSE_UNDER_INVESTIGATION', 'CONTAINER_CONTAINMENT_FAILURE', 'INTENTIONAL', 'UNINTENTIONAL'];

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

function ReleaseFields({ data, onChange }) {
  const d = data || {};
  const set = (f, v) => onChange({ ...d, [f]: v });
  const [unitOptions, setUnitOptions] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/neris-codes/categories/hazard_unit`)
      .then((r) => r.json())
      .then((codes) => setUnitOptions(codes.filter((c) => c.active).map((c) => c.value).sort()))
      .catch(() => {});
  }, []);

  return (
    <div className="p-2 border rounded bg-white space-y-2">
      <span className="text-xs font-bold text-gray-500">release</span>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">estimated_amount</label>
          <input
            type="number"
            step="any"
            className="w-full border rounded px-2 py-1 text-sm"
            value={d.estimated_amount ?? ''}
            onChange={(e) => set('estimated_amount', e.target.value === '' ? null : parseFloat(e.target.value))}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">unit_of_measurement</label>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={d.unit_of_measurement || ''}
            onChange={(e) => set('unit_of_measurement', e.target.value || null)}
          >
            <option value="">—</option>
            {unitOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <EnumSelect label="physical_state" value={d.physical_state} options={PHYSICAL_STATES} onChange={(v) => set('physical_state', v)} />
        <EnumSelect label="released_into" value={d.released_into} options={RELEASED_INTO} onChange={(v) => set('released_into', v)} />
        <EnumSelect label="cause" value={d.cause} options={HAZARD_CAUSES} onChange={(v) => set('cause', v)} />
      </div>
    </div>
  );
}

function ChemicalFields({ data, index, onChange, onRemove }) {
  const d = data || {};
  const set = (f, v) => onChange({ ...d, [f]: v });

  return (
    <div className="p-3 bg-gray-50 rounded border space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-600">Chemical #{index + 1}</span>
        <button type="button" className="text-red-500 text-xs hover:underline" onClick={onRemove}>remove</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">name *</label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-sm"
            maxLength={255}
            value={d.name || ''}
            onChange={(e) => set('name', e.target.value || '')}
          />
        </div>
        <EnumSelect label="dot_class *" value={d.dot_class} options={DOT_CLASSES} onChange={(v) => set('dot_class', v || '')} required />
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">release_occurred *</label>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={d.release_occurred === true ? 'true' : d.release_occurred === false ? 'false' : ''}
            onChange={(e) => set('release_occurred', e.target.value === 'true')}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      </div>

      {d.release_occurred === true && (
        <div>
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1">
            <input type="checkbox" checked={d.release != null} onChange={(e) => set('release', e.target.checked ? {} : null)} />
            Include release details
          </label>
          {d.release != null && (
            <ReleaseFields data={d.release} onChange={(r) => set('release', r)} />
          )}
        </div>
      )}
    </div>
  );
}

export default function HazsitDetailSection({ data = null, onChange }) {
  if (data === null) return null;

  const set = (field, value) => onChange({ ...data, [field]: value });
  const chemicals = data.chemicals || [];

  const addChemical = () => set('chemicals', [...chemicals, { name: '', release_occurred: false, dot_class: '' }]);
  const removeChemical = (i) => {
    const next = chemicals.filter((_, idx) => idx !== i);
    set('chemicals', next.length ? next : null);
  };
  const setChemical = (i, newChem) => {
    const next = chemicals.map((c, idx) => (idx === i ? newChem : c));
    set('chemicals', next);
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 13: HazSit Detail</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">evacuated *</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={data.evacuated ?? ''}
            onChange={(e) => set('evacuated', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          />
        </div>
        <EnumSelect label="disposition *" value={data.disposition} options={DISPOSITION_VALUES} onChange={(v) => set('disposition', v || '')} required />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-gray-700">chemicals</h4>
          <button type="button" className="text-sm text-blue-600 hover:underline" onClick={addChemical}>+ Add chemical</button>
        </div>
        {chemicals.map((chem, i) => (
          <div key={i} className="mb-2">
            <ChemicalFields data={chem} index={i} onChange={(c) => setChemical(i, c)} onRemove={() => removeChemical(i)} />
          </div>
        ))}
      </div>
    </div>
  );
}
