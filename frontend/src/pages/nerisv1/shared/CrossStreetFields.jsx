/**
 * nerisv1 shared: CrossStreetPayload form fields
 *
 * Source: CrossStreetPayload from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 * Fields: 15, Required: 0
 *
 * Used by: LocationFields (cross_streets array)
 *
 * Props:
 *   streets: array — current cross_streets array [{street, street_postfix, ...}, ...]
 *   onChange: (newArray) => void
 */
import React from 'react';

const CROSS_STREET_MODIFIERS = ['', 'CLOSEST', 'INCIDENT_IN_INTERSECTION', 'SECOND_CLOSEST'];

const EMPTY_CROSS_STREET = {
  number_prefix: null, number: null, number_suffix: null,
  complete_number: null, distance_marker: null,
  street_prefix_modifier: null, street_prefix_direction: null,
  street: null, street_postfix_direction: null, street_postfix_modifier: null,
  street_prefix: null, street_preposition_type_separator: null,
  street_postfix: null, direction_of_travel: null, cross_street_modifier: null,
};

function CrossStreetRow({ data, index, onUpdate, onRemove }) {
  const val = (field) => data[field] ?? '';
  const set = (field) => (e) => onUpdate(index, { ...data, [field]: e.target.value || null });
  const setInt = (field) => (e) => onUpdate(index, { ...data, [field]: e.target.value === '' ? null : parseInt(e.target.value, 10) });

  return (
    <div className="border rounded p-3 bg-gray-50 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-gray-600">Cross Street {index + 1}</span>
        <button type="button" onClick={() => onRemove(index)}
          className="text-xs text-red-500 hover:text-red-700">Remove</button>
      </div>

      <div className="grid grid-cols-5 gap-1">
        <div>
          <label className="block text-xs text-gray-400">number_prefix</label>
          <input type="text" value={val('number_prefix')} onChange={set('number_prefix')}
            className="w-full border rounded px-1 py-0.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs text-gray-400">number</label>
          <input type="number" value={val('number')} onChange={setInt('number')}
            className="w-full border rounded px-1 py-0.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs text-gray-400">number_suffix</label>
          <input type="text" value={val('number_suffix')} onChange={set('number_suffix')}
            className="w-full border rounded px-1 py-0.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs text-gray-400">complete_number</label>
          <input type="text" value={val('complete_number')} onChange={set('complete_number')}
            className="w-full border rounded px-1 py-0.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs text-gray-400">distance_marker</label>
          <input type="text" value={val('distance_marker')} onChange={set('distance_marker')}
            className="w-full border rounded px-1 py-0.5 text-xs" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1">
        <div>
          <label className="block text-xs text-gray-400">street_prefix_direction</label>
          <input type="text" value={val('street_prefix_direction')} onChange={set('street_prefix_direction')}
            className="w-full border rounded px-1 py-0.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs text-gray-400">street_prefix_modifier</label>
          <input type="text" value={val('street_prefix_modifier')} onChange={set('street_prefix_modifier')}
            className="w-full border rounded px-1 py-0.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs text-gray-400">street_prefix</label>
          <input type="text" value={val('street_prefix')} onChange={set('street_prefix')}
            className="w-full border rounded px-1 py-0.5 text-xs" placeholder="enum" />
        </div>
        <div>
          <label className="block text-xs text-gray-400">street_preposition_type_separator</label>
          <input type="text" value={val('street_preposition_type_separator')} onChange={set('street_preposition_type_separator')}
            className="w-full border rounded px-1 py-0.5 text-xs" placeholder="enum" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1">
        <div className="col-span-2">
          <label className="block text-xs text-gray-400">street</label>
          <input type="text" value={val('street')} onChange={set('street')}
            className="w-full border rounded px-1 py-0.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs text-gray-400">street_postfix</label>
          <input type="text" value={val('street_postfix')} onChange={set('street_postfix')}
            className="w-full border rounded px-1 py-0.5 text-xs" placeholder="enum" />
        </div>
        <div>
          <label className="block text-xs text-gray-400">direction_of_travel</label>
          <input type="text" value={val('direction_of_travel')} onChange={set('direction_of_travel')}
            className="w-full border rounded px-1 py-0.5 text-xs" placeholder="enum" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        <div>
          <label className="block text-xs text-gray-400">street_postfix_direction</label>
          <input type="text" value={val('street_postfix_direction')} onChange={set('street_postfix_direction')}
            className="w-full border rounded px-1 py-0.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs text-gray-400">street_postfix_modifier</label>
          <input type="text" value={val('street_postfix_modifier')} onChange={set('street_postfix_modifier')}
            className="w-full border rounded px-1 py-0.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs text-gray-400">cross_street_modifier</label>
          <select value={val('cross_street_modifier')} onChange={set('cross_street_modifier')}
            className="w-full border rounded px-1 py-0.5 text-xs">
            {CROSS_STREET_MODIFIERS.map((v) => (
              <option key={v} value={v}>{v || '—'}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default function CrossStreetFields({ streets = [], onChange }) {
  const handleUpdate = (index, updated) => {
    const next = [...streets];
    next[index] = updated;
    onChange(next);
  };

  const handleRemove = (index) => {
    const next = streets.filter((_, i) => i !== index);
    onChange(next.length ? next : null);
  };

  const handleAdd = () => {
    onChange([...streets, { ...EMPTY_CROSS_STREET }]);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <h5 className="text-xs font-semibold text-gray-600">cross_streets (CrossStreetPayload[])</h5>
        <button type="button" onClick={handleAdd}
          className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded hover:bg-blue-600">
          + Add Cross Street
        </button>
      </div>
      {streets.map((cs, i) => (
        <CrossStreetRow key={i} data={cs} index={i} onUpdate={handleUpdate} onRemove={handleRemove} />
      ))}
    </div>
  );
}
