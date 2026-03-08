/**
 * nerisv1: FireDetailSection — fire_detail form (Section 12)
 *
 * Schema: IncidentPayload.fire_detail from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * fire_detail: FirePayload | null
 * Conditional: only when incident type starts with FIRE||
 *
 * FirePayload (additionalProperties: false, 5 fields,
 *   required: location_detail, water_supply, investigation_needed, investigation_types):
 *   - location_detail: oneOf StructureFireLocationDetailPayload | OutsideFireLocationDetailPayload
 *     disc=type: STRUCTURE | OUTSIDE
 *   - water_supply: TypeWaterSupplyValue (9 values)
 *   - investigation_needed: TypeFireInvestNeedValue (6 values)
 *   - investigation_types: TypeFireInvestValue[] (8 values)
 *   - suppression_appliances: TypeSuppressApplianceValue[]|null (12 values)
 *
 * StructureFireLocationDetailPayload (additionalProperties: false, 7 fields,
 *   required: floor_of_origin, arrival_condition, damage_type, room_of_origin_type, cause):
 *   - type: const "STRUCTURE"
 *   - progression_evident: boolean|null
 *   - floor_of_origin: integer (required)
 *   - arrival_condition: TypeFireConditionArrivalValue (6 values)
 *   - damage_type: TypeFireBldgDamageValue (4 values)
 *   - room_of_origin_type: TypeRoomValue (14 values)
 *   - cause: TypeFireCauseInValue (13 values)
 *
 * OutsideFireLocationDetailPayload (additionalProperties: false, 3 fields, required: cause):
 *   - type: const "OUTSIDE"
 *   - acres_burned: number|null
 *   - cause: TypeFireCauseOutValue (14 values)
 *
 * Props:
 *   data: object|null — current fire_detail (NERIS field names)
 *   onChange: (newData) => void
 */
import React from 'react';

// Enums from live spec v1.4.38
const WATER_SUPPLY = ['DRAFT_FROM_STATIC_SOURCE', 'FOAM_ADDITIVE', 'HYDRANT_GREATER_500', 'HYDRANT_LESS_500', 'NONE', 'NURSE_OTHER_APPARATUS', 'SUPPLY_FROM_FIRE_BOAT', 'TANK_WATER', 'WATER_TENDER_SHUTTLE'];
const INVEST_NEEDED = ['NO', 'NOT_APPLICABLE', 'NOT_EVALUATED', 'NO_CAUSE_OBVIOUS', 'OTHER', 'YES'];
const INVEST_TYPES = ['INVESTIGATED_BY_ARSON_FIRE_INVESTIGATOR', 'INVESTIGATED_BY_INSURANCE', 'INVESTIGATED_BY_NONFIRE_LAW_ENFORCEMENT', 'INVESTIGATED_BY_OTHER', 'INVESTIGATED_BY_OUTSIDE_AGENCY', 'INVESTIGATED_BY_STATE_FIRE_MARSHAL', 'INVESTIGATED_ON_SCENE_RESOURCE', 'NONE'];
const SUPPRESS_APPLIANCES = ['AIRATTACK_HELITACK', 'BOOSTER_FIRE_HOSE', 'BUILDING_FDC', 'BUILDING_STANDPIPE', 'ELEVATED_MASTER_STREAM_STANDPIPE', 'FIRE_EXTINGUISHER', 'GROUND_MONITOR', 'MASTER_STREAM', 'MEDIUM_DIAMETER_FIRE_HOSE', 'NONE', 'OTHER', 'SMALL_DIAMETER_FIRE_HOSE'];
const CONDITION_ARRIVAL = ['FIRE_OUT_UPON_ARRIVAL', 'FIRE_SPREAD_BEYOND_STRUCTURE', 'NO_SMOKE_FIRE_SHOWING', 'SMOKE_FIRE_SHOWING', 'SMOKE_SHOWING', 'STRUCTURE_INVOLVED'];
const BLDG_DAMAGE = ['MAJOR_DAMAGE', 'MINOR_DAMAGE', 'MODERATE_DAMAGE', 'NO_DAMAGE'];
const ROOM_TYPES = ['ASSEMBLY', 'ATTIC', 'BALCONY_PORCH_DECK', 'BASEMENT', 'BATHROOM', 'BEDROOM', 'GARAGE', 'HALLWAY_FOYER', 'KITCHEN', 'LIVING_SPACE', 'OFFICE', 'OTHER', 'UNKNOWN', 'UTILITY_ROOM'];
const CAUSE_IN = ['ACT_OF_NATURE', 'BATTERY_POWER_STORAGE', 'CHEMICAL', 'COOKING', 'ELECTRICAL', 'EXPLOSIVES_FIREWORKS', 'HEAT_FROM_ANOTHER_OBJECT', 'INCENDIARY', 'OPEN_FLAME', 'OPERATING_EQUIPMENT', 'OTHER_HEAT_SOURCE', 'SMOKING_MATERIALS_ILLICIT_DRUGS', 'UNABLE_TO_BE_DETERMINED'];
const CAUSE_OUT = ['BATTERY_POWER_STORAGE', 'DEBRIS_OPEN_BURNING', 'EQUIPMENT_VEHICLE_USE', 'FIREARMS_EXPLOSIVES', 'FIREWORKS', 'INCENDIARY', 'NATURAL', 'POWER_GEN_TRANS_DIST', 'RAILROAD_OPS_MAINTENANCE', 'RECREATION_CEREMONY', 'SMOKING_MATERIALS_ILLICIT_DRUGS', 'SPREAD_FROM_CONTROLLED_BURN', 'STRUCTURE', 'UNABLE_TO_BE_DETERMINED'];

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

function CheckboxArray({ label, selected, options, onToggle }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-1 text-xs text-gray-700">
            <input type="checkbox" checked={(selected || []).includes(o)} onChange={() => onToggle(o)} />
            {o}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function FireDetailSection({ data = null, onChange }) {
  if (data === null) return null;

  const set = (field, value) => onChange({ ...data, [field]: value });
  const ld = data.location_detail || {};
  const ldType = ld.type || '';

  const setLdType = (t) => {
    if (t === 'STRUCTURE') {
      set('location_detail', { type: 'STRUCTURE', floor_of_origin: '', arrival_condition: '', damage_type: '', room_of_origin_type: '', cause: '' });
    } else if (t === 'OUTSIDE') {
      set('location_detail', { type: 'OUTSIDE', cause: '' });
    }
  };

  const setLd = (field, value) => set('location_detail', { ...ld, [field]: value });

  const toggleInvestType = (val) => {
    const cur = data.investigation_types || [];
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
    set('investigation_types', next);
  };

  const toggleSuppAppliance = (val) => {
    const cur = data.suppression_appliances || [];
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
    set('suppression_appliances', next.length ? next : null);
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 12: Fire Detail</h3>

      {/* location_detail discriminator */}
      <div>
        <EnumSelect label="location_detail.type * (discriminator)" value={ldType} options={['STRUCTURE', 'OUTSIDE']} onChange={(v) => setLdType(v || '')} required />
      </div>

      {ldType === 'STRUCTURE' && (
        <div className="p-3 bg-gray-50 rounded border space-y-3">
          <span className="text-xs font-bold text-gray-500">StructureFireLocationDetailPayload</span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">floor_of_origin *</label>
              <input
                type="number"
                className="w-full border rounded px-2 py-1 text-sm"
                value={ld.floor_of_origin ?? ''}
                onChange={(e) => setLd('floor_of_origin', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              />
            </div>
            <EnumSelect label="arrival_condition *" value={ld.arrival_condition} options={CONDITION_ARRIVAL} onChange={(v) => setLd('arrival_condition', v || '')} required />
            <EnumSelect label="damage_type *" value={ld.damage_type} options={BLDG_DAMAGE} onChange={(v) => setLd('damage_type', v || '')} required />
            <EnumSelect label="room_of_origin_type *" value={ld.room_of_origin_type} options={ROOM_TYPES} onChange={(v) => setLd('room_of_origin_type', v || '')} required />
            <EnumSelect label="cause *" value={ld.cause} options={CAUSE_IN} onChange={(v) => setLd('cause', v || '')} required />
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">progression_evident</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={ld.progression_evident === true ? 'true' : ld.progression_evident === false ? 'false' : ''}
                onChange={(e) => setLd('progression_evident', e.target.value === '' ? null : e.target.value === 'true')}
              >
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {ldType === 'OUTSIDE' && (
        <div className="p-3 bg-gray-50 rounded border space-y-3">
          <span className="text-xs font-bold text-gray-500">OutsideFireLocationDetailPayload</span>
          <div className="grid grid-cols-2 gap-2">
            <EnumSelect label="cause *" value={ld.cause} options={CAUSE_OUT} onChange={(v) => setLd('cause', v || '')} required />
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">acres_burned</label>
              <input
                type="number"
                step="any"
                className="w-full border rounded px-2 py-1 text-sm"
                value={ld.acres_burned ?? ''}
                onChange={(e) => setLd('acres_burned', e.target.value === '' ? null : parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}

      {/* water_supply (required) */}
      <EnumSelect label="water_supply *" value={data.water_supply} options={WATER_SUPPLY} onChange={(v) => set('water_supply', v || '')} required />

      {/* investigation_needed (required) */}
      <EnumSelect label="investigation_needed *" value={data.investigation_needed} options={INVEST_NEEDED} onChange={(v) => set('investigation_needed', v || '')} required />

      {/* investigation_types (required array) */}
      <CheckboxArray label="investigation_types *" selected={data.investigation_types} options={INVEST_TYPES} onToggle={toggleInvestType} />

      {/* suppression_appliances (optional array) */}
      <CheckboxArray label="suppression_appliances" selected={data.suppression_appliances} options={SUPPRESS_APPLIANCES} onToggle={toggleSuppAppliance} />
    </div>
  );
}
