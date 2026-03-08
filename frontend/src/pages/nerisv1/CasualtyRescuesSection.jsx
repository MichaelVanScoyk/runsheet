/**
 * nerisv1: CasualtyRescuesSection — casualty_rescues form (Section 11)
 *
 * Schema: IncidentPayload.casualty_rescues from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 * Deep nesting: CasualtyRescuePayload -> CasualtyPayload -> InjuryPayload -> FfInjuryDetailsPayload
 *               CasualtyRescuePayload -> RescuePayload -> FfRescuePayload -> RemovalPayload -> FireRemovalPayload
 *
 * Props:
 *   data: array|null
 *   onChange: (newList) => void
 */
import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Small enums hardcoded from live spec
const CR_TYPES = ['FF', 'NONFF'];
const GENDERS = ['FEMALE', 'MALE', 'OTHER_GENDER_IDENTITY', 'TRANSGENDER_FEMALE_MALE_TO_FEMALE', 'TRANSGENDER_MALE_FEMALE_TO_MALE', 'UNKNOWN'];
const RACES = ['AMERICAN_INDIAN_ALASKA_NATIVE', 'ASIAN', 'BLACK_AFRICAN_AMERICAN', 'HISPANIC_LATINO', 'MIDDLE_EASTERN_NORTH_AFRICAN', 'NATIVE_HAWAIIAN_PACIFIC_ISLANDER', 'OTHER', 'UNKNOWN', 'WHITE'];
const INJURY_TYPES = ['INJURED_NONFATAL', 'INJURED_FATAL', 'UNINJURED'];
const CASUALTY_CAUSES = ['CAUGHT_TRAPPED_BY_FIRE_EXPLOSION', 'CAUGHT_TRAPPED_BY_OBJECT', 'COLLAPSE', 'EXPOSURE', 'FALL_JUMP', 'OTHER', 'STRESS_OVEREXERTION', 'STRUCK_CONTACT_WITH_OBJECT', 'VEHICLE_COLLISION'];
const JOB_CLASSIFICATIONS = ['CAREER', 'INDUSTRIAL', 'PAID_ON_CALL', 'PART_TIME', 'VOLUNTEER', 'WILDLAND_CONTRACT', 'WILDLAND_FULL_TIME', 'WILDLAND_PART_TIME'];
const DUTY_TYPES = ['AFTER_INCIDENT', 'OTHER_ON_DUTY_INCIDENT', 'RESPONDING_TO_EMERGENCY_INCIDENT', 'RETURNING_FROM_EMERGENCY_INCIDENT', 'TRAINING', 'WORKING_AT_SCENE_OF_FIRE_INCIDENT', 'WORKING_AT_SCENE_OF_NONFIRE_INCIDENT'];
const CASUALTY_ACTIONS = ['ADVANCING_OPERATING_HOSELINE', 'CARRYING_SETTINGUP_EQUIPMENT', 'DURING_INCIDENT_RESPONSE', 'EMS_PATIENT_CARE', 'FORCIBLE_ENTRY', 'INCIDENT_COMMAND', 'OTHER', 'PUMP_OPERATIONS', 'SCENE_SAFETY_DIRECTING_TRAFFIC', 'SEARCH_RESCUE', 'STANDBY', 'VEHICLE_EXTRICATION', 'VENTILATION'];
const CASUALTY_TIMELINES = ['AFTER_CONCLUSION_OF_INCIDENT', 'CONTINUING_OPERATIONS', 'EXTENDED_OPERATIONS', 'INITIAL_RESPONSE', 'RESPONDING', 'UNKNOWN'];
const PPE_ITEMS = ['3_4_BOOTS', 'BRUSH_GEAR', 'BUNKER_PANTS', 'FACE_SHIELD_GOGGLES', 'GLOVES', 'HELMET', 'NONE', 'OTHER_SPECIAL_EQUIPMENT', 'PASS_DEVICE', 'PROTECTIVE_HOOD', 'REFLECTIVE_VEST', 'RUBBER_KNEE_BOOTS', 'SCBA', 'TURNOUT_COAT'];
const SUPPRESS_TIMES = ['DURING_SUPPRESSION', 'POST_SUPPRESSION', 'PRE_SUPPRESSION'];
const PRESENCE_KNOWN_TYPES = ['KNOWN_ARRIVAL', 'KNOWN_DISPATCH', 'KNOWN_DURING'];
const FF_RESCUE_TYPES = ['RESCUED_BY_FIREFIGHTER', 'RESCUED_BY_FF_RIT', 'EVAC_ASSISTED_BY_FIREFIGHTER'];
const NONFF_RESCUE_TYPES = ['RESCUED_BY_NONFIREFIGHTER', 'SELF_EVACUATION', 'NO_RESCUE_NEEDED'];
const RESCUE_ACTIONS = ['BRACE_WALL_INFRASTRUCTURE', 'BREAK_BREACH_WALL', 'HYDRAULIC_TOOL_USE', 'NONE', 'ROPE_RIGGING', 'SUPPLY_AIR', 'TRENCH_SHORING', 'UNDERWATER_DIVE', 'VENTILATION'];
const RESCUE_IMPEDIMENTS = ['ACCESS_LIMITATIONS', 'HOARDING_CONDITIONS', 'IMPAIRED_PERSON', 'NONE', 'OTHER', 'PHYSICAL_MEDICAL_CONDITIONS_PERSON'];
const NONREMOVAL_TYPES = ['EXTRICATION', 'DISENTANGLEMENT', 'RECOVERY', 'OTHER'];
const ROOM_TYPES = ['ASSEMBLY', 'ATTIC', 'BALCONY_PORCH_DECK', 'BASEMENT', 'BATHROOM', 'BEDROOM', 'GARAGE', 'HALLWAY_FOYER', 'KITCHEN', 'LIVING_SPACE', 'OFFICE', 'OTHER', 'UNKNOWN', 'UTILITY_ROOM'];
const ELEVATION_TYPES = ['ON_BED', 'ON_FLOOR', 'ON_FURNITURE', 'OTHER'];
const RESCUE_PATH_TYPES = ['REMOVAL_ALONG_ALT_PATH', 'REMOVAL_ALONG_PRIMARY_PATH'];

// Helper: select dropdown
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

// Helper: checkbox array
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

// --- FfInjuryDetails sub-form ---
function FfInjuryDetailsFields({ data, onChange }) {
  const d = data || {};
  const set = (f, v) => onChange({ ...d, [f]: v });
  const togglePpe = (val) => {
    const cur = d.ppe_items || [];
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
    set('ppe_items', next.length ? next : null);
  };
  return (
    <div className="p-2 border rounded bg-white space-y-2">
      <span className="text-xs font-bold text-gray-500">ff_injury_details</span>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">unit_neris_id</label>
          <input type="text" className="w-full border rounded px-2 py-1 text-sm" value={d.unit_neris_id || ''} onChange={(e) => set('unit_neris_id', e.target.value || null)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">reported_unit_id</label>
          <input type="text" className="w-full border rounded px-2 py-1 text-sm" maxLength={255} value={d.reported_unit_id || ''} onChange={(e) => set('reported_unit_id', e.target.value || null)} />
        </div>
        <EnumSelect label="unit_continuity" value={d.unit_continuity === true ? 'true' : d.unit_continuity === false ? 'false' : ''} options={['true', 'false']} onChange={(v) => set('unit_continuity', v === null ? null : v === 'true')} />
        <EnumSelect label="incident_command" value={d.incident_command === true ? 'true' : d.incident_command === false ? 'false' : ''} options={['true', 'false']} onChange={(v) => set('incident_command', v === null ? null : v === 'true')} />
        <EnumSelect label="job_classification" value={d.job_classification} options={JOB_CLASSIFICATIONS} onChange={(v) => set('job_classification', v)} />
        <EnumSelect label="duty_type" value={d.duty_type} options={DUTY_TYPES} onChange={(v) => set('duty_type', v)} />
        <EnumSelect label="action_type" value={d.action_type} options={CASUALTY_ACTIONS} onChange={(v) => set('action_type', v)} />
        <EnumSelect label="incident_stage" value={d.incident_stage} options={CASUALTY_TIMELINES} onChange={(v) => set('incident_stage', v)} />
      </div>
      <CheckboxArray label="ppe_items" selected={d.ppe_items} options={PPE_ITEMS} onToggle={togglePpe} />
    </div>
  );
}

// --- Casualty sub-form ---
function CasualtyFields({ data, onChange, crType }) {
  const d = data || {};
  const ion = d.injury_or_noninjury || {};
  const setIon = (newIon) => onChange({ ...d, injury_or_noninjury: newIon });
  const injType = ion.type || '';

  const setInjType = (t) => {
    if (t === 'UNINJURED') {
      setIon({ type: 'UNINJURED' });
    } else {
      setIon({ ...ion, type: t });
    }
  };

  return (
    <div className="p-2 border rounded bg-white space-y-2">
      <span className="text-xs font-bold text-gray-500">casualty</span>
      <EnumSelect label="injury_or_noninjury.type *" value={injType} options={INJURY_TYPES} onChange={(v) => setInjType(v || '')} required />
      {(injType === 'INJURED_NONFATAL' || injType === 'INJURED_FATAL') && (
        <>
          <EnumSelect label="cause" value={ion.cause} options={CASUALTY_CAUSES} onChange={(v) => setIon({ ...ion, cause: v })} />
          {crType === 'FF' && (
            <FfInjuryDetailsFields data={ion.ff_injury_details} onChange={(fid) => setIon({ ...ion, ff_injury_details: fid })} />
          )}
        </>
      )}
    </div>
  );
}

// --- Removal sub-form ---
function RemovalFields({ data, onChange }) {
  const d = data || {};
  const set = (f, v) => onChange({ ...d, [f]: v });
  return (
    <div className="p-2 border rounded bg-white space-y-2">
      <span className="text-xs font-bold text-gray-500">removal (REMOVAL_FROM_STRUCTURE)</span>
      <div className="grid grid-cols-2 gap-2">
        <EnumSelect label="gas_isolation" value={d.gas_isolation === true ? 'true' : d.gas_isolation === false ? 'false' : ''} options={['true', 'false']} onChange={(v) => set('gas_isolation', v === null ? null : v === 'true')} />
        <EnumSelect label="room_type" value={d.room_type} options={ROOM_TYPES} onChange={(v) => set('room_type', v)} />
        <EnumSelect label="elevation_type" value={d.elevation_type} options={ELEVATION_TYPES} onChange={(v) => set('elevation_type', v)} />
        <EnumSelect label="rescue_path_type" value={d.rescue_path_type} options={RESCUE_PATH_TYPES} onChange={(v) => set('rescue_path_type', v)} />
      </div>
      <div>
        <span className="text-xs font-bold text-gray-500">fire_removal</span>
        <EnumSelect label="relative_suppression_time" value={d.fire_removal?.relative_suppression_time} options={SUPPRESS_TIMES} onChange={(v) => set('fire_removal', v ? { relative_suppression_time: v } : null)} />
      </div>
    </div>
  );
}

// --- Rescue sub-form ---
function RescueFields({ data, onChange }) {
  const d = data || {};
  const set = (f, v) => onChange({ ...d, [f]: v });
  const fon = d.ffrescue_or_nonffrescue || {};
  const fonType = fon.type || '';
  const isFf = FF_RESCUE_TYPES.includes(fonType);
  const isNonFf = NONFF_RESCUE_TYPES.includes(fonType);

  const setFonType = (t) => {
    if (FF_RESCUE_TYPES.includes(t)) {
      set('ffrescue_or_nonffrescue', { type: t, removal_or_nonremoval: { type: '' }, actions: null, impediments: null });
    } else {
      set('ffrescue_or_nonffrescue', { type: t });
    }
  };

  const setFon = (f, v) => set('ffrescue_or_nonffrescue', { ...fon, [f]: v });

  const ron = fon.removal_or_nonremoval || {};
  const ronType = ron.type || '';

  const setRonType = (t) => {
    if (t === 'REMOVAL_FROM_STRUCTURE') {
      setFon('removal_or_nonremoval', { type: 'REMOVAL_FROM_STRUCTURE' });
    } else {
      setFon('removal_or_nonremoval', { type: t });
    }
  };

  const toggleArr = (field, val) => {
    const cur = fon[field] || [];
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
    setFon(field, next.length ? next : null);
  };

  return (
    <div className="p-2 border rounded bg-white space-y-2">
      <span className="text-xs font-bold text-gray-500">rescue</span>

      {/* presence_known */}
      <EnumSelect label="presence_known.presence_known_type" value={d.presence_known?.presence_known_type} options={PRESENCE_KNOWN_TYPES} onChange={(v) => set('presence_known', v ? { presence_known_type: v } : null)} />

      {/* mayday */}
      <div className="p-2 border rounded space-y-1">
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
          <input type="checkbox" checked={d.mayday != null} onChange={(e) => set('mayday', e.target.checked ? { mayday: true } : null)} />
          mayday
        </label>
        {d.mayday && (
          <div className="grid grid-cols-2 gap-2">
            <EnumSelect label="rit_activated" value={d.mayday.rit_activated === true ? 'true' : d.mayday.rit_activated === false ? 'false' : ''} options={['true', 'false']} onChange={(v) => set('mayday', { ...d.mayday, rit_activated: v === null ? null : v === 'true' })} />
            <EnumSelect label="relative_suppression_time" value={d.mayday.relative_suppression_time} options={SUPPRESS_TIMES} onChange={(v) => set('mayday', { ...d.mayday, relative_suppression_time: v })} />
          </div>
        )}
      </div>

      {/* ffrescue_or_nonffrescue discriminator */}
      <EnumSelect label="ffrescue_or_nonffrescue.type *" value={fonType} options={[...FF_RESCUE_TYPES, ...NONFF_RESCUE_TYPES]} onChange={(v) => setFonType(v || '')} required />

      {isFf && (
        <>
          <CheckboxArray label="actions" selected={fon.actions} options={RESCUE_ACTIONS} onToggle={(v) => toggleArr('actions', v)} />
          <CheckboxArray label="impediments" selected={fon.impediments} options={RESCUE_IMPEDIMENTS} onToggle={(v) => toggleArr('impediments', v)} />

          {/* removal_or_nonremoval */}
          <EnumSelect label="removal_or_nonremoval.type *" value={ronType} options={['REMOVAL_FROM_STRUCTURE', ...NONREMOVAL_TYPES]} onChange={(v) => setRonType(v || '')} required />
          {ronType === 'REMOVAL_FROM_STRUCTURE' && (
            <RemovalFields data={ron} onChange={(newRon) => setFon('removal_or_nonremoval', newRon)} />
          )}
        </>
      )}
    </div>
  );
}

// --- Main component ---
export default function CasualtyRescuesSection({ data = null, onChange }) {
  const items = data || [];

  const add = () => onChange([...items, { type: 'NONFF' }]);
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
        <h3 className="text-lg font-bold text-gray-800">Section 11: Casualty / Rescues</h3>
        <button type="button" className="text-sm text-blue-600 hover:underline" onClick={add}>+ Add</button>
      </div>

      {items.map((item, i) => (
        <div key={i} className="mb-4 p-3 bg-gray-50 rounded border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">Casualty/Rescue #{i + 1}</span>
            <button type="button" className="text-red-500 text-xs hover:underline" onClick={() => remove(i)}>remove</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <EnumSelect label="type *" value={item.type} options={CR_TYPES} onChange={(v) => setItem(i, 'type', v || '')} required />
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">birth_month_year (MM/YYYY)</label>
              <input type="text" className="w-full border rounded px-2 py-1 text-sm" maxLength={7} value={item.birth_month_year || ''} onChange={(e) => setItem(i, 'birth_month_year', e.target.value || null)} />
            </div>
            <EnumSelect label="gender" value={item.gender} options={GENDERS} onChange={(v) => setItem(i, 'gender', v)} />
            <EnumSelect label="race" value={item.race} options={RACES} onChange={(v) => setItem(i, 'race', v)} />
          </div>

          {item.type === 'FF' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">rank</label>
                <input type="text" className="w-full border rounded px-2 py-1 text-sm" maxLength={255} value={item.rank || ''} onChange={(e) => setItem(i, 'rank', e.target.value || null)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">years_of_service</label>
                <input type="number" step="any" className="w-full border rounded px-2 py-1 text-sm" value={item.years_of_service ?? ''} onChange={(e) => setItem(i, 'years_of_service', e.target.value === '' ? null : parseFloat(e.target.value))} />
              </div>
            </div>
          )}

          {/* Casualty */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1">
              <input type="checkbox" checked={item.casualty != null} onChange={(e) => setItem(i, 'casualty', e.target.checked ? { injury_or_noninjury: { type: '' } } : null)} />
              Include casualty
            </label>
            {item.casualty && (
              <CasualtyFields data={item.casualty} onChange={(c) => setItem(i, 'casualty', c)} crType={item.type} />
            )}
          </div>

          {/* Rescue */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1">
              <input type="checkbox" checked={item.rescue != null} onChange={(e) => setItem(i, 'rescue', e.target.checked ? { ffrescue_or_nonffrescue: { type: '' } } : null)} />
              Include rescue
            </label>
            {item.rescue && (
              <RescueFields data={item.rescue} onChange={(r) => setItem(i, 'rescue', r)} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
