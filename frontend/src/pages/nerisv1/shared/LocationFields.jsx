/**
 * nerisv1 shared: LocationPayload form fields
 *
 * Source: LocationPayload from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 * Fields: 40, Required: 0
 *
 * Used by: BaseSection, DispatchSection, Exposures
 *
 * Props:
 *   data: object — current LocationPayload values (NERIS field names)
 *   onChange: (field, value) => void — called when any field changes
 */
import React from 'react';

export default function LocationFields({ data = {}, onChange }) {
  const val = (field) => data[field] ?? '';
  const set = (field) => (e) => onChange(field, e.target.value || null);
  const setInt = (field) => (e) => {
    const v = e.target.value;
    onChange(field, v === '' ? null : parseInt(v, 10));
  };

  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-gray-700">Location (LocationPayload)</h4>

      {/* Address Number Components */}
      <div className="grid grid-cols-5 gap-2">
        <div>
          <label className="block text-xs text-gray-500">number_prefix</label>
          <input type="text" value={val('number_prefix')} onChange={set('number_prefix')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">number</label>
          <input type="number" value={val('number')} onChange={setInt('number')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">number_suffix</label>
          <input type="text" value={val('number_suffix')} onChange={set('number_suffix')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">complete_number</label>
          <input type="text" value={val('complete_number')} onChange={set('complete_number')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">distance_marker</label>
          <input type="text" value={val('distance_marker')} onChange={set('distance_marker')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>

      {/* Street Name Components */}
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-xs text-gray-500">street_prefix_modifier</label>
          <input type="text" value={val('street_prefix_modifier')} onChange={set('street_prefix_modifier')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">street_prefix_direction</label>
          <input type="text" value={val('street_prefix_direction')} onChange={set('street_prefix_direction')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">street_prefix</label>
          <input type="text" value={val('street_prefix')} onChange={set('street_prefix')}
            className="w-full border rounded px-2 py-1 text-sm" placeholder="enum: TypeLocSnPrePostValue" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">street_preposition_type_separator</label>
          <input type="text" value={val('street_preposition_type_separator')} onChange={set('street_preposition_type_separator')}
            className="w-full border rounded px-2 py-1 text-sm" placeholder="enum: TypeLocSnPreSepValue" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500">street</label>
          <input type="text" value={val('street')} onChange={set('street')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">street_postfix</label>
          <input type="text" value={val('street_postfix')} onChange={set('street_postfix')}
            className="w-full border rounded px-2 py-1 text-sm" placeholder="enum: TypeLocSnPrePostValue" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">direction_of_travel</label>
          <input type="text" value={val('direction_of_travel')} onChange={set('direction_of_travel')}
            className="w-full border rounded px-2 py-1 text-sm" placeholder="enum: TypeLocSnDirectionValue" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500">street_postfix_direction</label>
          <input type="text" value={val('street_postfix_direction')} onChange={set('street_postfix_direction')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">street_postfix_modifier</label>
          <input type="text" value={val('street_postfix_modifier')} onChange={set('street_postfix_modifier')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>

      {/* Community / Jurisdiction */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-500">postal_community</label>
          <input type="text" value={val('postal_community')} onChange={set('postal_community')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">neighborhood_community</label>
          <input type="text" value={val('neighborhood_community')} onChange={set('neighborhood_community')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">unincorporated_community</label>
          <input type="text" value={val('unincorporated_community')} onChange={set('unincorporated_community')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-500">incorporated_municipality</label>
          <input type="text" value={val('incorporated_municipality')} onChange={set('incorporated_municipality')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">county</label>
          <input type="text" value={val('county')} onChange={set('county')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">state</label>
          <input type="text" value={val('state')} onChange={set('state')}
            className="w-full border rounded px-2 py-1 text-sm" placeholder="2-char code" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-500">postal_code</label>
          <input type="text" value={val('postal_code')} onChange={set('postal_code')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">postal_code_extension</label>
          <input type="text" value={val('postal_code_extension')} onChange={set('postal_code_extension')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">country</label>
          <input type="text" value={val('country')} onChange={set('country')}
            className="w-full border rounded px-2 py-1 text-sm" placeholder="2-char ISO" />
        </div>
      </div>

      {/* Place type */}
      <div>
        <label className="block text-xs text-gray-500">place_type</label>
        <input type="text" value={val('place_type')} onChange={set('place_type')}
          className="w-full border rounded px-2 py-1 text-sm" placeholder="enum: TypeLocPlaceValue" />
      </div>

      {/* Sub-address Components */}
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-xs text-gray-500">structure</label>
          <input type="text" value={val('structure')} onChange={set('structure')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">subsite</label>
          <input type="text" value={val('subsite')} onChange={set('subsite')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">site</label>
          <input type="text" value={val('site')} onChange={set('site')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">wing</label>
          <input type="text" value={val('wing')} onChange={set('wing')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-xs text-gray-500">floor</label>
          <input type="text" value={val('floor')} onChange={set('floor')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">unit_prefix</label>
          <input type="text" value={val('unit_prefix')} onChange={set('unit_prefix')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">unit_value</label>
          <input type="text" value={val('unit_value')} onChange={set('unit_value')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">room</label>
          <input type="text" value={val('room')} onChange={set('room')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-xs text-gray-500">section</label>
          <input type="text" value={val('section')} onChange={set('section')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">row</label>
          <input type="text" value={val('row')} onChange={set('row')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">seat</label>
          <input type="text" value={val('seat')} onChange={set('seat')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">marker</label>
          <input type="text" value={val('marker')} onChange={set('marker')}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>

      {/* Additional info */}
      <div>
        <label className="block text-xs text-gray-500">additional_info</label>
        <input type="text" value={val('additional_info')} onChange={set('additional_info')}
          className="w-full border rounded px-2 py-1 text-sm" />
      </div>

      {/* TODO (nerisv1): cross_streets — array of CrossStreetPayload objects.
          Each CrossStreetPayload has 15 NG911 street fields (street, street_postfix,
          street_prefix_direction, number, cross_street_modifier, etc.).
          Needs a repeatable sub-form component. Data source: CAD cross street
          string parsed through geocode adapter into CrossStreetPayload dicts. */}

      {/* TODO (nerisv1): location_aliases — array of strings.
          Needs an add/remove string list input component. */}

      {/* TODO (nerisv1): polygon (HighPrecisionGeoMultipolygon) lives in BaseSection,
          not here — but noting for completeness. For wildland fires, hazmat evac zones.
          Leverage existing geocoding API infrastructure to build. */}
    </div>
  );
}
