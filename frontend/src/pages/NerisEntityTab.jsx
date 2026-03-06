/**
 * NerisEntityTab.jsx
 *
 * NERIS Entity Editor — department profile, stations, and units.
 *
 * Sub-tabs:
 *   🏛️ Entity       — department profile, stations, units
 *   ⚙️ Credentials  — client_id, client_secret, environment
 *
 * Entity sections (collapsible):
 *   1. Identification    — fd_neris_id, name, internal_id, time_zone
 *   2. Address           — address_line_1/2, city, state, zip_code, location
 *   3. Contact           — email, website
 *   4. Classification    — department_type, entity_type, fips_code, continue_edu
 *   5. Services          — fire_services, ems_services, investigation_services
 *   6. Dispatch / PSAP   — dispatch JSONB (center_id, cad_software, avl_usage, protocols, etc.)
 *   7. Staffing          — staffing JSONB (career/volunteer/ems/civilian counts)
 *   8. Assessment        — assessment JSONB (iso_rating, cpse_accredited, caas_accredited)
 *   9. Stations & Units  — station cards, each with unit table
 *
 * All field names, enum values, and required fields sourced exclusively from:
 *   https://api.neris.fsri.org/v1/openapi.json (v1.4.35, fetched 2026-03-05)
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';

const API_BASE = '';

// ─── API helpers ──────────────────────────────────────────────────────────────

const api = {
  get:  (path)        => fetch(`${API_BASE}${path}`).then(r => r.json()),
  put:  (path, body)  => fetch(`${API_BASE}${path}`, { method: 'PUT',    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  post: (path, body)  => fetch(`${API_BASE}${path}`, { method: 'POST',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  del:  (path)        => fetch(`${API_BASE}${path}`, { method: 'DELETE' }).then(r => r.json()),
};

// ─── NERIS enum values — sourced from openapi.json 2026-03-05 ─────────────────

// TypeDeptValue
const DEPT_TYPES = [
  { value: 'CAREER',      label: 'Career' },
  { value: 'COMBINATION', label: 'Combination (Career + Volunteer)' },
  { value: 'VOLUNTEER',   label: 'Volunteer' },
];

// TypeEntityValue
const ENTITY_TYPES = [
  { value: 'CONTRACT',      label: 'Contract' },
  { value: 'FEDERAL',       label: 'Federal' },
  { value: 'LOCAL',         label: 'Local' },
  { value: 'OTHER',         label: 'Other' },
  { value: 'PRIVATE',       label: 'Private' },
  { value: 'STATE',         label: 'State' },
  { value: 'TRANSPORTATION', label: 'Transportation' },
  { value: 'TRIBAL',        label: 'Tribal' },
];

// TypeUnitValue — all 49 values
const UNIT_TYPES = [
  { value: 'AIR_EMS',           label: 'Air EMS' },
  { value: 'AIR_LIGHT',         label: 'Air Light' },
  { value: 'AIR_RECON',         label: 'Air Recon' },
  { value: 'AIR_TANKER',        label: 'Air Tanker' },
  { value: 'ALS_AMB',           label: 'ALS Ambulance' },
  { value: 'ARFF',              label: 'ARFF' },
  { value: 'ATV_EMS',           label: 'ATV EMS' },
  { value: 'ATV_FIRE',          label: 'ATV Fire' },
  { value: 'BLS_AMB',           label: 'BLS Ambulance' },
  { value: 'BOAT',              label: 'Boat' },
  { value: 'BOAT_LARGE',        label: 'Boat (Large)' },
  { value: 'CHIEF_STAFF_COMMAND', label: 'Chief / Staff / Command' },
  { value: 'CREW',              label: 'Crew' },
  { value: 'CREW_TRANS',        label: 'Crew Transport' },
  { value: 'DECON',             label: 'Decon' },
  { value: 'DOZER',             label: 'Dozer' },
  { value: 'EMS_NOTRANS',       label: 'EMS (No Transport)' },
  { value: 'EMS_SUPV',          label: 'EMS Supervisor' },
  { value: 'ENGINE_STRUCT',     label: 'Engine (Structural)' },
  { value: 'ENGINE_WUI',        label: 'Engine (WUI)' },
  { value: 'FOAM',              label: 'Foam Unit' },
  { value: 'HAZMAT',            label: 'HazMat' },
  { value: 'HELO_FIRE',         label: 'Helicopter (Fire)' },
  { value: 'HELO_GENERAL',      label: 'Helicopter (General)' },
  { value: 'HELO_RESCUE',       label: 'Helicopter (Rescue)' },
  { value: 'INVEST',            label: 'Investigation' },
  { value: 'LADDER_QUINT',      label: 'Ladder / Quint' },
  { value: 'LADDER_SMALL',      label: 'Ladder (Small)' },
  { value: 'LADDER_TALL',       label: 'Ladder (Tall)' },
  { value: 'LADDER_TILLER',     label: 'Ladder (Tiller)' },
  { value: 'MAB',               label: 'MAB' },
  { value: 'MOBILE_COMMS',      label: 'Mobile Communications' },
  { value: 'MOBILE_ICP',        label: 'Mobile ICP' },
  { value: 'OTHER_GROUND',      label: 'Other Ground' },
  { value: 'PLATFORM',          label: 'Platform' },
  { value: 'PLATFORM_QUINT',    label: 'Platform Quint' },
  { value: 'POV',               label: 'POV' },
  { value: 'QUINT_TALL',        label: 'Quint (Tall)' },
  { value: 'REHAB',             label: 'Rehab' },
  { value: 'RESCUE_HEAVY',      label: 'Rescue (Heavy)' },
  { value: 'RESCUE_LIGHT',      label: 'Rescue (Light)' },
  { value: 'RESCUE_MEDIUM',     label: 'Rescue (Medium)' },
  { value: 'RESCUE_USAR',       label: 'Rescue (USAR)' },
  { value: 'RESCUE_WATER',      label: 'Rescue (Water)' },
  { value: 'SCBA',              label: 'SCBA' },
  { value: 'TENDER',            label: 'Tender' },
  { value: 'UAS_FIRE',          label: 'UAS (Fire)' },
  { value: 'UAS_RECON',         label: 'UAS (Recon)' },
  { value: 'UTIL',              label: 'Utility' },
];

// TypeServFdValue
const FIRE_SERVICES = [
  'ANIMAL_TECHRESCUE', 'ARFF_FIREFIGHTING', 'CAUSE_ORIGIN', 'CAVE_SAR',
  'COLLAPSE_RESCUE', 'CONFINED_SPACE', 'DIVE_SAR', 'FLOOD_SAR',
  'HAZMAT_OPS', 'HAZMAT_TECHNICIAN', 'HELO_SAR', 'HIGHRISE_FIREFIGHTING',
  'ICE_RESCUE', 'MACHINERY_RESCUE', 'MARINE_FIREFIGHTING', 'MINE_SAR',
  'PETROCHEM_FIREFIGHTING', 'REHABILITATION', 'ROPE_RESCUE',
  'RRD_EXISTING', 'RRD_NEWCONST', 'RRD_PLANS', 'RRD_PUBLICED',
  'STRUCTURAL_FIREFIGHTING', 'SURF_RESCUE', 'SWIFTWATER_SAR', 'TOWER_SAR',
  'TRAINING_DRIVER', 'TRAINING_ELF', 'TRAINING_OD', 'TRAINING_VETFF',
  'TRENCH_RESCUE', 'VEHICLE_RESCUE', 'WATERCRAFT_RESCUE', 'WATER_SAR',
  'WILDERNESS_SAR', 'WILDLAND_FIREFIGHTING',
];

// TypeServEmsValue
const EMS_SERVICES = [
  'AERO_TRANSPORT', 'ALS_NO_TRANSPORT', 'ALS_TRANSPORT',
  'BLS_NO_TRANSPORT', 'BLS_TRANSPORT', 'COMMUNITY_MED', 'NO_MEDICAL',
];

// TypeServInvestValue
const INVESTIGATION_SERVICES = [
  'COMPANY_LEVEL', 'DEDICATED', 'K9_DETECT', 'LAW_ENFORCEMENT', 'YOUTH_FIRESETTER',
];

// DepartmentDispatchPayload — TypePsapType
const PSAP_TYPES = [
  { value: 'PRIMARY',   label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
];

// DepartmentDispatchPayload — TypePsapCapability
const PSAP_CAPABILITIES = [
  { value: 'LEGACY', label: 'Legacy' },
  { value: 'NG911',  label: 'NG911' },
];

// DepartmentDispatchPayload — TypePsapDiscipline / TypePsapJurisdiction
const PSAP_MULTI = [
  { value: 'MULTIPLE', label: 'Multiple' },
  { value: 'SINGLE',   label: 'Single' },
];

// DepartmentDispatchPayload — TypeProtocolValue
const DISPATCH_PROTOCOLS = [
  { value: 'APCO',  label: 'APCO' },
  { value: 'IAED',  label: 'IAED' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PROQA', label: 'ProQA' },
];

// US states for address fields
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '0.45rem 0.6rem',
  border: '1px solid #ddd', borderRadius: 4,
  fontSize: '0.9rem', boxSizing: 'border-box',
  background: '#fff', color: '#222',
};

const selectStyle = { ...inputStyle };

// ─── Primitive field components ───────────────────────────────────────────────

function Field({ label, hint, children, required }) {
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#555', marginBottom: '0.2rem' }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <small style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginTop: '0.15rem' }}>{hint}</small>}
    </div>
  );
}

function TextInput({ value, onChange, onBlur, placeholder, type = 'text', maxLength, disabled }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      style={inputStyle}
    />
  );
}

function SelectInput({ value, onChange, onBlur, options, placeholder, disabled }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} onBlur={onBlur} disabled={disabled} style={selectStyle}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(opt =>
        typeof opt === 'string'
          ? <option key={opt} value={opt}>{opt}</option>
          : <option key={opt.value} value={opt.value}>{opt.label}</option>
      )}
    </select>
  );
}

function NumberInput({ value, onChange, onBlur, min, max, placeholder, disabled, width = '120px' }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      onBlur={onBlur}
      min={min}
      max={max}
      placeholder={placeholder}
      disabled={disabled}
      style={{ ...inputStyle, width }}
    />
  );
}

function CheckboxInput({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', cursor: 'pointer', color: '#222' }}>
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function MultiCheckbox({ values = [], options, onChange }) {
  const toggle = (val) => {
    const next = values.includes(val) ? values.filter(v => v !== val) : [...values, val];
    onChange(next);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1.25rem' }}>
      {options.map(opt => (
        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={values.includes(opt)} onChange={() => toggle(opt)} />
          {opt.replace(/_/g, ' ')}
        </label>
      ))}
    </div>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Row({ children, cols = 2 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '0.75rem' }}>
      {children}
    </div>
  );
}

function Section({ title, defaultOpen = false, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: '0.75rem', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.6rem 0.9rem', background: open ? '#f0f9ff' : '#f9fafb',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          borderBottom: open ? '1px solid #e5e7eb' : 'none',
        }}
      >
        <span style={{ fontWeight: 600, color: '#1e40af', fontSize: '0.9rem' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {badge && <span style={{ fontSize: '0.75rem', background: '#dbeafe', color: '#1d4ed8', padding: '0.1rem 0.4rem', borderRadius: 10 }}>{badge}</span>}
          <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && <div style={{ padding: '0.85rem 0.9rem' }}>{children}</div>}
    </div>
  );
}

// ─── Unit row ─────────────────────────────────────────────────────────────────

function UnitRow({ unit, apparatusOptions, onSaved, onDeleted }) {
  const toast = useToast();
  const [data, setData] = useState({ ...unit });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (field, value) => {
    setData(p => ({ ...p, [field]: value }));
    setDirty(true);
  };

  // When apparatus selected, auto-fill cad_designation_1 from unit_designator
  const selectApparatus = (appId) => {
    const app = apparatusOptions.find(a => a.id === Number(appId));
    setData(p => ({
      ...p,
      apparatus_id: appId ? Number(appId) : null,
      cad_designation_1: app ? app.unit_designator : p.cad_designation_1,
    }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/neris/units/${unit.id}`, data);
      setDirty(false);
      toast.success('Unit saved');
      onSaved();
    } catch {
      toast.error('Failed to save unit');
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!window.confirm(`Remove unit "${unit.cad_designation_1 || 'unnamed'}"?`)) return;
    try {
      await api.del(`/api/neris/units/${unit.id}`);
      toast.success('Unit removed');
      onDeleted();
    } catch {
      toast.error('Failed to remove unit');
    }
  };

  const td = { padding: '0.35rem 0.4rem', verticalAlign: 'middle' };

  return (
    <tr style={{ background: dirty ? '#fffbeb' : 'transparent' }}>
      {/* Apparatus link */}
      <td style={td}>
        <select
          value={data.apparatus_id ?? ''}
          onChange={e => selectApparatus(e.target.value)}
          style={{ ...selectStyle, width: '130px', fontSize: '0.82rem' }}
        >
          <option value="">— none —</option>
          {apparatusOptions.map(a => (
            <option key={a.id} value={a.id}>{a.unit_designator} — {a.name}</option>
          ))}
        </select>
      </td>

      {/* cad_designation_1 — must match CAD exactly */}
      <td style={td}>
        <input
          type="text"
          value={data.cad_designation_1 ?? ''}
          onChange={e => update('cad_designation_1', e.target.value)}
          style={{ ...inputStyle, width: '90px', fontSize: '0.82rem', fontFamily: 'monospace' }}
          placeholder="E48"
        />
      </td>

      {/* cad_designation_2 — optional alternate CAD ID */}
      <td style={td}>
        <input
          type="text"
          value={data.cad_designation_2 ?? ''}
          onChange={e => update('cad_designation_2', e.target.value)}
          style={{ ...inputStyle, width: '90px', fontSize: '0.82rem', fontFamily: 'monospace' }}
        />
      </td>

      {/* type — TypeUnitValue */}
      <td style={td}>
        <select
          value={data.type ?? ''}
          onChange={e => update('type', e.target.value || null)}
          style={{ ...selectStyle, width: '170px', fontSize: '0.82rem' }}
        >
          <option value="">— select —</option>
          {UNIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </td>

      {/* staffing */}
      <td style={td}>
        <input
          type="number"
          value={data.staffing ?? ''}
          onChange={e => update('staffing', e.target.value === '' ? null : Number(e.target.value))}
          style={{ ...inputStyle, width: '60px', fontSize: '0.82rem' }}
          min={0}
        />
      </td>

      {/* dedicated_staffing */}
      <td style={td}>
        <input
          type="checkbox"
          checked={!!data.dedicated_staffing}
          onChange={e => update('dedicated_staffing', e.target.checked)}
        />
      </td>

      {/* neris_id — read only, assigned by NERIS after entity submission */}
      <td style={td}>
        <span style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace' }}>
          {data.neris_id || '—'}
        </span>
      </td>

      {/* actions */}
      <td style={td}>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {dirty && (
            <button
              onClick={save}
              disabled={saving}
              style={{ padding: '0.2rem 0.55rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.78rem' }}
            >
              {saving ? '…' : 'Save'}
            </button>
          )}
          <button
            onClick={del}
            style={{ padding: '0.2rem 0.45rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', fontSize: '0.78rem' }}
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Station card ─────────────────────────────────────────────────────────────

function StationCard({ station, apparatusOptions, onChanged }) {
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [data, setData] = useState({ ...station });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnit, setNewUnit] = useState({ cad_designation_1: '', type: '', staffing: '', apparatus_id: null });

  const update = (field, value) => {
    setData(p => ({ ...p, [field]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/neris/stations/${station.id}`, data);
      setDirty(false);
      toast.success('Station saved');
      onChanged();
    } catch {
      toast.error('Failed to save station');
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!window.confirm(`Remove station "${data.station_name || data.station_id}"? All units will be removed.`)) return;
    try {
      await api.del(`/api/neris/stations/${station.id}`);
      toast.success('Station removed');
      onChanged();
    } catch {
      toast.error('Failed to remove station');
    }
  };

  const selectNewApparatus = (appId) => {
    const app = apparatusOptions.find(a => a.id === Number(appId));
    setNewUnit(p => ({
      ...p,
      apparatus_id: appId ? Number(appId) : null,
      cad_designation_1: app ? app.unit_designator : p.cad_designation_1,
    }));
  };

  const addUnit = async () => {
    if (!newUnit.cad_designation_1) { toast.error('CAD Designation 1 is required'); return; }
    try {
      await api.post(`/api/neris/stations/${station.id}/units`, {
        ...newUnit,
        staffing: newUnit.staffing === '' ? null : Number(newUnit.staffing),
      });
      setNewUnit({ cad_designation_1: '', type: '', staffing: '', apparatus_id: null });
      setAddingUnit(false);
      toast.success('Unit added');
      onChanged();
    } catch {
      toast.error('Failed to add unit');
    }
  };

  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: 6, marginBottom: '0.75rem', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f1f5f9', borderBottom: open ? '1px solid #d1d5db' : 'none' }}>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#1e3a5f', fontSize: '0.9rem' }}>
          {open ? '▼' : '▶'} {data.station_name || data.station_id || `Station #${station.id}`}
          <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: '0.8rem' }}>
            ({station.units?.length ?? 0} unit{station.units?.length !== 1 ? 's' : ''})
          </span>
        </button>
        <button onClick={del} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.85rem' }}>
          Remove
        </button>
      </div>

      {open && (
        <div style={{ padding: '0.75rem' }}>

          {/* Station fields — names match neris_stations columns after migration 044 */}
          <Row cols={2}>
            <Field label="Station ID" hint="e.g. 001 — used in NERIS unit_neris_id path" required>
              <TextInput value={data.station_id} onChange={v => update('station_id', v)} />
            </Field>
            <Field label="Station Name" hint="Local display only">
              <TextInput value={data.station_name} onChange={v => update('station_name', v)} />
            </Field>
          </Row>
          <Row cols={3}>
            <Field label="Address">
              <TextInput value={data.address_line_1} onChange={v => update('address_line_1', v)} />
            </Field>
            <Field label="City">
              <TextInput value={data.city} onChange={v => update('city', v)} />
            </Field>
            <Field label="State">
              <SelectInput value={data.state} onChange={v => update('state', v)} options={US_STATES} placeholder="—" />
            </Field>
          </Row>
          <Row cols={2}>
            <Field label="ZIP">
              <TextInput value={data.zip_code} onChange={v => update('zip_code', v)} maxLength={10} />
            </Field>
            <Field label="Min. Staffing">
              <NumberInput value={data.staffing} onChange={v => update('staffing', v)} min={0} width="100px" />
            </Field>
          </Row>

          {dirty && (
            <button
              onClick={save}
              disabled={saving}
              style={{ marginBottom: '0.75rem', padding: '0.35rem 1rem', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              {saving ? 'Saving…' : 'Save Station'}
            </button>
          )}

          {/* Units */}
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Units</span>
              <button
                onClick={() => setAddingUnit(true)}
                style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, cursor: 'pointer', color: '#1d4ed8' }}
              >
                + Add Unit
              </button>
            </div>

            {(station.units?.length > 0 || addingUnit) && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Apparatus', 'CAD ID *', 'Alt ID', 'Type *', 'Staffing *', 'Dedicated', 'NERIS ID', ''].map(h => (
                        <th key={h} style={{ padding: '0.3rem 0.4rem', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {station.units?.map(unit => (
                      <UnitRow
                        key={unit.id}
                        unit={unit}
                        apparatusOptions={apparatusOptions}
                        onSaved={onChanged}
                        onDeleted={onChanged}
                      />
                    ))}

                    {/* Add unit row */}
                    {addingUnit && (
                      <tr style={{ background: '#f0fdf4' }}>
                        <td style={{ padding: '0.35rem 0.4rem' }}>
                          <select
                            value={newUnit.apparatus_id ?? ''}
                            onChange={e => selectNewApparatus(e.target.value)}
                            style={{ ...selectStyle, width: '130px', fontSize: '0.82rem' }}
                          >
                            <option value="">— none —</option>
                            {apparatusOptions.map(a => (
                              <option key={a.id} value={a.id}>{a.unit_designator} — {a.name}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '0.35rem 0.4rem' }}>
                          <input
                            type="text"
                            value={newUnit.cad_designation_1}
                            onChange={e => setNewUnit(p => ({ ...p, cad_designation_1: e.target.value }))}
                            style={{ ...inputStyle, width: '90px', fontSize: '0.82rem', fontFamily: 'monospace' }}
                            placeholder="E48"
                            autoFocus
                          />
                        </td>
                        <td style={{ padding: '0.35rem 0.4rem' }}>—</td>
                        <td style={{ padding: '0.35rem 0.4rem' }}>
                          <select
                            value={newUnit.type ?? ''}
                            onChange={e => setNewUnit(p => ({ ...p, type: e.target.value || null }))}
                            style={{ ...selectStyle, width: '170px', fontSize: '0.82rem' }}
                          >
                            <option value="">— select —</option>
                            {UNIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '0.35rem 0.4rem' }}>
                          <input
                            type="number"
                            value={newUnit.staffing}
                            onChange={e => setNewUnit(p => ({ ...p, staffing: e.target.value }))}
                            style={{ ...inputStyle, width: '60px', fontSize: '0.82rem' }}
                            min={0}
                          />
                        </td>
                        <td style={{ padding: '0.35rem 0.4rem' }}>—</td>
                        <td style={{ padding: '0.35rem 0.4rem' }}>—</td>
                        <td style={{ padding: '0.35rem 0.4rem' }}>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button onClick={addUnit} style={{ padding: '0.25rem 0.6rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}>Add</button>
                            <button onClick={() => setAddingUnit(false)} style={{ padding: '0.25rem 0.5rem', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {!station.units?.length && !addingUnit && (
              <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: '0.25rem 0' }}>No units — click + Add Unit</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Entity sub-tab ───────────────────────────────────────────────────────────

function EntityTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState({});
  const [stations, setStations] = useState([]);
  const [apparatusOptions, setApparatusOptions] = useState([]);
  const [validationResult, setValidationResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/neris/entity');
      setEntity(data.entity || {});
      setStations(data.stations || []);
      setApparatusOptions(data.apparatus_options || []);
    } catch {
      toast.error('Failed to load entity data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Update local state and immediately persist single field
  const saveField = async (field, value) => {
    setEntity(p => ({ ...p, [field]: value }));
    try {
      await api.put('/api/neris/entity', { [field]: value });
    } catch {
      toast.error(`Failed to save ${field}`);
    }
  };

  // Update local state only (used with onBlur to batch)
  const updateField = (field, value) => setEntity(p => ({ ...p, [field]: value }));

  // Persist on blur
  const blurSave = (field) => () => api.put('/api/neris/entity', { [field]: entity[field] }).catch(() => toast.error(`Failed to save ${field}`));

  // Update a JSONB sub-field and persist entire JSONB object
  const saveJsonField = async (jsonKey, subKey, value) => {
    const current = entity[jsonKey] || {};
    const updated = { ...current, [subKey]: value };
    setEntity(p => ({ ...p, [jsonKey]: updated }));
    try {
      await api.put('/api/neris/entity', { [jsonKey]: updated });
    } catch {
      toast.error(`Failed to save ${jsonKey}.${subKey}`);
    }
  };

  const addStation = async () => {
    try {
      await api.post('/api/neris/stations', {
        station_id: '',
        station_name: 'New Station',
        state: entity?.state || '',
        display_order: stations.length,
      });
      toast.success('Station added');
      load();
    } catch {
      toast.error('Failed to add station');
    }
  };

  const validate = async () => {
    setValidationResult(null);
    try {
      const result = await api.post('/api/neris/entity/validate', {});
      setValidationResult(result);
    } catch {
      toast.error('Validation request failed');
    }
  };

  const submitEntity = async () => {
    setSubmitting(true);
    try {
      const result = await api.post('/api/neris/entity/submit', {});
      if (result.success) {
        toast.success('Entity submitted to NERIS');
        load();
      } else {
        toast.error(result.message || 'Submission failed');
        setValidationResult(result);
      }
    } catch {
      toast.error('Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ padding: '1rem', color: '#666' }}>Loading entity data…</div>;

  const dispatch   = entity.dispatch   || {};
  const staffing   = entity.staffing   || {};
  const assessment = entity.assessment || {};

  return (
    <div style={{ maxWidth: 720 }}>

      {/* Validation banner */}
      {validationResult && (
        <div style={{
          marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 6,
          background: validationResult.valid ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${validationResult.valid ? '#86efac' : '#fca5a5'}`,
        }}>
          {validationResult.valid
            ? <span style={{ color: '#15803d', fontWeight: 600 }}>✓ Entity complete — ready to submit</span>
            : <>
                <div style={{ color: '#dc2626', fontWeight: 600, marginBottom: '0.4rem' }}>✗ {validationResult.errors?.length} error(s) must be fixed</div>
                {validationResult.errors?.map((e, i) => <div key={i} style={{ color: '#dc2626', fontSize: '0.85rem' }}>• {e}</div>)}
              </>
          }
          {validationResult.warnings?.length > 0 && (
            <div style={{ marginTop: '0.4rem' }}>
              {validationResult.warnings.map((w, i) => <div key={i} style={{ color: '#b45309', fontSize: '0.85rem' }}>⚠ {w}</div>)}
            </div>
          )}
        </div>
      )}

      {/* 1. Identification */}
      <Section title="1. Identification" defaultOpen>
        <Row cols={2}>
          <Field label="NERIS Department ID" required hint="Assigned by NERIS — e.g. FD42029593">
            <TextInput value={entity.fd_neris_id} onChange={v => updateField('fd_neris_id', v)} onBlur={blurSave('fd_neris_id')} />
          </Field>
          <Field label="Internal / Legacy ID" hint="NFIRS or state ID if applicable">
            <TextInput value={entity.internal_id} onChange={v => updateField('internal_id', v)} onBlur={blurSave('internal_id')} />
          </Field>
        </Row>
        <Field label="Department Name" required>
          <TextInput value={entity.name} onChange={v => updateField('name', v)} onBlur={blurSave('name')} />
        </Field>
        <Row cols={2}>
          <Field label="Time Zone" required hint="IANA format — e.g. America/New_York">
            <TextInput value={entity.time_zone} onChange={v => updateField('time_zone', v)} onBlur={blurSave('time_zone')} placeholder="America/New_York" />
          </Field>
          <Field label="FIPS Code">
            <TextInput value={entity.fips_code} onChange={v => updateField('fips_code', v)} onBlur={blurSave('fips_code')} />
          </Field>
        </Row>
      </Section>

      {/* 2. Address */}
      <Section title="2. Physical Address">
        <Row cols={2}>
          <Field label="Street Address" required>
            <TextInput value={entity.address_line_1} onChange={v => updateField('address_line_1', v)} onBlur={blurSave('address_line_1')} />
          </Field>
          <Field label="Suite / Apt">
            <TextInput value={entity.address_line_2} onChange={v => updateField('address_line_2', v)} onBlur={blurSave('address_line_2')} />
          </Field>
        </Row>
        <Row cols={3}>
          <Field label="City" required>
            <TextInput value={entity.city} onChange={v => updateField('city', v)} onBlur={blurSave('city')} />
          </Field>
          <Field label="State" required>
            <SelectInput value={entity.state} onChange={v => saveField('state', v)} options={US_STATES} placeholder="—" />
          </Field>
          <Field label="ZIP" required>
            <TextInput value={entity.zip_code} onChange={v => updateField('zip_code', v)} onBlur={blurSave('zip_code')} maxLength={10} />
          </Field>
        </Row>
        <Row cols={2}>
          <Field label="Latitude" hint="Decimal degrees">
            <TextInput
              value={entity.location?.lat ?? ''}
              onChange={v => { const loc = { ...(entity.location || {}), lat: v }; setEntity(p => ({ ...p, location: loc })); }}
              onBlur={() => api.put('/api/neris/entity', { location: entity.location }).catch(() => toast.error('Failed to save location'))}
              placeholder="39.9526"
            />
          </Field>
          <Field label="Longitude" hint="Decimal degrees">
            <TextInput
              value={entity.location?.lng ?? ''}
              onChange={v => { const loc = { ...(entity.location || {}), lng: v }; setEntity(p => ({ ...p, location: loc })); }}
              onBlur={() => api.put('/api/neris/entity', { location: entity.location }).catch(() => toast.error('Failed to save location'))}
              placeholder="-75.1652"
            />
          </Field>
        </Row>
      </Section>

      {/* 3. Contact */}
      <Section title="3. Contact">
        <Row cols={2}>
          <Field label="Email">
            <TextInput value={entity.email} onChange={v => updateField('email', v)} onBlur={blurSave('email')} type="email" />
          </Field>
          <Field label="Website">
            <TextInput value={entity.website} onChange={v => updateField('website', v)} onBlur={blurSave('website')} placeholder="https://..." />
          </Field>
        </Row>
      </Section>

      {/* 4. Classification */}
      <Section title="4. Classification">
        <Row cols={2}>
          <Field label="Department Type" hint="TypeDeptValue">
            <SelectInput value={entity.department_type} onChange={v => saveField('department_type', v)} options={DEPT_TYPES} placeholder="— select —" />
          </Field>
          <Field label="Entity Type" hint="TypeEntityValue">
            <SelectInput value={entity.entity_type} onChange={v => saveField('entity_type', v)} options={ENTITY_TYPES} placeholder="— select —" />
          </Field>
        </Row>
        <Row cols={2}>
          <Field label="RMS Software">
            <TextInput value={entity.rms_software} onChange={v => updateField('rms_software', v)} onBlur={blurSave('rms_software')} />
          </Field>
          <Field label="Continuing Education" hint="Whether department participates">
            <CheckboxInput label="Yes" value={entity.continue_edu} onChange={v => saveField('continue_edu', v)} />
          </Field>
        </Row>
      </Section>

      {/* 5. Services */}
      <Section title="5. Services Provided">
        <Field label="Fire Services (TypeServFdValue)">
          <MultiCheckbox
            values={entity.fire_services || []}
            options={FIRE_SERVICES}
            onChange={v => saveField('fire_services', v)}
          />
        </Field>
        <Field label="EMS Services (TypeServEmsValue)">
          <MultiCheckbox
            values={entity.ems_services || []}
            options={EMS_SERVICES}
            onChange={v => saveField('ems_services', v)}
          />
        </Field>
        <Field label="Investigation Services (TypeServInvestValue)">
          <MultiCheckbox
            values={entity.investigation_services || []}
            options={INVESTIGATION_SERVICES}
            onChange={v => saveField('investigation_services', v)}
          />
        </Field>
      </Section>

      {/* 6. Dispatch — DepartmentDispatchPayload */}
      <Section title="6. Dispatch / PSAP">
        <Row cols={2}>
          <Field label="PSAP Center ID (FCC)" hint="dispatch.center_id — e.g. PA1234567890">
            <TextInput
              value={dispatch.center_id}
              onChange={v => setEntity(p => ({ ...p, dispatch: { ...p.dispatch, center_id: v } }))}
              onBlur={() => saveJsonField('dispatch', 'center_id', dispatch.center_id)}
            />
          </Field>
          <Field label="CAD Software" hint="dispatch.cad_software">
            <TextInput
              value={dispatch.cad_software}
              onChange={v => setEntity(p => ({ ...p, dispatch: { ...p.dispatch, cad_software: v } }))}
              onBlur={() => saveJsonField('dispatch', 'cad_software', dispatch.cad_software)}
            />
          </Field>
        </Row>
        <Row cols={2}>
          <Field label="AVL Usage" hint="dispatch.avl_usage">
            <CheckboxInput label="Yes" value={dispatch.avl_usage} onChange={v => saveJsonField('dispatch', 'avl_usage', v)} />
          </Field>
          <Field label="PSAP Type" hint="dispatch.psap_type">
            <SelectInput value={dispatch.psap_type} onChange={v => saveJsonField('dispatch', 'psap_type', v)} options={PSAP_TYPES} placeholder="— select —" />
          </Field>
        </Row>
        <Row cols={2}>
          <Field label="PSAP Capability" hint="dispatch.psap_capability">
            <SelectInput value={dispatch.psap_capability} onChange={v => saveJsonField('dispatch', 'psap_capability', v)} options={PSAP_CAPABILITIES} placeholder="— select —" />
          </Field>
          <Field label="PSAP Discipline" hint="dispatch.psap_discipline">
            <SelectInput value={dispatch.psap_discipline} onChange={v => saveJsonField('dispatch', 'psap_discipline', v)} options={PSAP_MULTI} placeholder="— select —" />
          </Field>
        </Row>
        <Row cols={2}>
          <Field label="PSAP Jurisdiction" hint="dispatch.psap_jurisdiction">
            <SelectInput value={dispatch.psap_jurisdiction} onChange={v => saveJsonField('dispatch', 'psap_jurisdiction', v)} options={PSAP_MULTI} placeholder="— select —" />
          </Field>
        </Row>
        <Row cols={2}>
          <Field label="Fire Dispatch Protocol" hint="dispatch.protocol_fire">
            <SelectInput value={dispatch.protocol_fire} onChange={v => saveJsonField('dispatch', 'protocol_fire', v)} options={DISPATCH_PROTOCOLS} placeholder="— select —" />
          </Field>
          <Field label="Medical Dispatch Protocol" hint="dispatch.protocol_med">
            <SelectInput value={dispatch.protocol_med} onChange={v => saveJsonField('dispatch', 'protocol_med', v)} options={DISPATCH_PROTOCOLS} placeholder="— select —" />
          </Field>
        </Row>
      </Section>

      {/* 7. Staffing — StaffingPayload */}
      <Section title="7. Staffing">
        <Row cols={3}>
          {[
            ['active_firefighters_career_ft',    'FF Career FT'],
            ['active_firefighters_career_pt',    'FF Career PT'],
            ['active_firefighters_volunteer',     'FF Volunteer'],
            ['active_ems_only_career_ft',         'EMS Only Career FT'],
            ['active_ems_only_career_pt',         'EMS Only Career PT'],
            ['active_ems_only_volunteer',         'EMS Only Volunteer'],
            ['active_civilians_career_ft',        'Civilians Career FT'],
            ['active_civilians_career_pt',        'Civilians Career PT'],
            ['active_civilians_volunteer',        'Civilians Volunteer'],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <NumberInput
                value={staffing[key]}
                onChange={v => setEntity(p => ({ ...p, staffing: { ...(p.staffing || {}), [key]: v } }))}
                onBlur={() => saveJsonField('staffing', key, staffing[key])}
                min={0}
                width="100px"
              />
            </Field>
          ))}
        </Row>
      </Section>

      {/* 8. Assessment — AssessmentPayload */}
      <Section title="8. Assessment">
        <Row cols={3}>
          <Field label="ISO Rating" hint="assessment.iso_rating (1–10)">
            <NumberInput
              value={assessment.iso_rating}
              onChange={v => setEntity(p => ({ ...p, assessment: { ...(p.assessment || {}), iso_rating: v } }))}
              onBlur={() => saveJsonField('assessment', 'iso_rating', assessment.iso_rating)}
              min={1} max={10} width="80px"
            />
          </Field>
          <Field label="CPSE Accredited" hint="assessment.cpse_accredited">
            <CheckboxInput label="Yes" value={assessment.cpse_accredited} onChange={v => saveJsonField('assessment', 'cpse_accredited', v)} />
          </Field>
          <Field label="CAAS Accredited" hint="assessment.caas_accredited">
            <CheckboxInput label="Yes" value={assessment.caas_accredited} onChange={v => saveJsonField('assessment', 'caas_accredited', v)} />
          </Field>
        </Row>
      </Section>

      {/* 9. Stations & Units */}
      <Section title="9. Stations & Units" defaultOpen badge={`${stations.length} station${stations.length !== 1 ? 's' : ''}`}>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Each station needs at least one unit. <strong>CAD ID</strong> must exactly match the unit designator in your CAD system. NERIS ID is assigned after entity submission.
        </p>

        {stations.map(station => (
          <StationCard
            key={station.id}
            station={station}
            apparatusOptions={apparatusOptions}
            onChanged={load}
          />
        ))}

        <button
          onClick={addStation}
          style={{ padding: '0.4rem 1rem', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem', marginTop: '0.25rem' }}
        >
          + Add Station
        </button>
      </Section>

      {/* Validate + Submit */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
        <button
          onClick={validate}
          style={{ padding: '0.5rem 1.25rem', background: '#f0f9ff', border: '1px solid #7dd3fc', color: '#0369a1', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
        >
          ✓ Validate
        </button>
        <button
          onClick={submitEntity}
          disabled={submitting}
          style={{ padding: '0.5rem 1.25rem', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
        >
          {submitting ? 'Submitting…' : '🚀 Submit to NERIS'}
        </button>
        {entity.neris_entity_status && (
          <span style={{ fontSize: '0.85rem', color: entity.neris_entity_status === 'submitted' ? '#15803d' : '#6b7280' }}>
            Status: {entity.neris_entity_status}
            {entity.neris_entity_submitted_at && ` · ${new Date(entity.neris_entity_submitted_at).toLocaleDateString()}`}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Credentials sub-tab ─────────────────────────────────────────────────────

function CredentialsTab() {
  const toast = useToast();
  const [creds, setCreds] = useState({ client_id: '', client_secret: '', environment: 'test', submission_enabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/settings`)
      .then(r => r.json())
      .then(data => {
        const neris = (data.neris || []).reduce((acc, s) => ({ ...acc, [s.key]: s.raw_value }), {});
        setCreds({
          client_id: neris.client_id || '',
          client_secret: neris.client_secret || '',
          environment: neris.environment || 'test',
          submission_enabled: neris.submission_enabled === 'true',
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (key, value) => {
    setSaving(key);
    try {
      await fetch(`${API_BASE}/api/settings/neris/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: String(value) }),
      });
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div style={{ padding: '1rem', color: '#666' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 480 }}>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        API credentials for NERIS submission. Obtain from your NERIS vendor account.
      </p>

      <Field label="Client ID" required>
        <TextInput value={creds.client_id} onChange={v => setCreds(p => ({ ...p, client_id: v }))} onBlur={() => save('client_id', creds.client_id)} disabled={saving === 'client_id'} />
      </Field>

      <Field label="Client Secret" required>
        <TextInput type="password" value={creds.client_secret} onChange={v => setCreds(p => ({ ...p, client_secret: v }))} onBlur={() => save('client_secret', creds.client_secret)} disabled={saving === 'client_secret'} />
      </Field>

      <Field label="Environment">
        <SelectInput
          value={creds.environment}
          onChange={v => { setCreds(p => ({ ...p, environment: v })); save('environment', v); }}
          options={[{ value: 'test', label: 'Test / Sandbox' }, { value: 'production', label: 'Production' }]}
        />
      </Field>

      <Field label="Auto-Submit">
        <SelectInput
          value={creds.submission_enabled ? 'true' : 'false'}
          onChange={v => { const b = v === 'true'; setCreds(p => ({ ...p, submission_enabled: b })); save('submission_enabled', v); }}
          options={[{ value: 'false', label: 'Disabled (manual only)' }, { value: 'true', label: 'Enabled' }]}
        />
      </Field>

      <div style={{ marginTop: '1.5rem', background: '#f0f9ff', borderRadius: 6, padding: '0.75rem 1rem', border: '1px solid #bae6fd', fontSize: '0.85rem', color: '#0c4a6e' }}>
        <strong>Vendor:</strong> VN22773762 &nbsp;|&nbsp; <strong>Test Dept:</strong> FD09190828 &nbsp;|&nbsp; Ticket: HLPDSK-25587
      </div>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function NerisEntityTab() {
  const [subTab, setSubTab] = useState('entity');

  const tabBtn = (key, label) => (
    <button
      key={key}
      onClick={() => setSubTab(key)}
      style={{
        padding: '0.4rem 1rem',
        border: 'none',
        borderBottom: subTab === key ? '2px solid #1d4ed8' : '2px solid transparent',
        background: 'none',
        cursor: 'pointer',
        fontWeight: subTab === key ? 700 : 400,
        color: subTab === key ? '#1d4ed8' : '#6b7280',
        fontSize: '0.9rem',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '1.25rem' }}>
        {tabBtn('entity', '🏛️ Entity')}
        {tabBtn('credentials', '⚙️ Credentials')}
      </div>
      {subTab === 'entity'      && <EntityTab />}
      {subTab === 'credentials' && <CredentialsTab />}
    </div>
  );
}
