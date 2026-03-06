/**
 * NerisEntityTab.jsx
 *
 * NERIS Entity Editor — department profile, stations, and units.
 *
 * Sub-tabs:
 *   🏛️ Entity       — department profile (sections 1–8), stations, units
 *   ⚙️ Credentials  — client_id, client_secret, environment
 *
 * All field labels, hints, and enum choices are imported from:
 *   src/constants/nerisFieldDefs.js
 *
 * That file is the single source of truth — sourced from:
 *   core_mod_entity_fd.csv (ulfsri/neris-framework, retrieved 2026-03-05)
 *   https://api.neris.fsri.org/v1/openapi.json (v1.4.35)
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import {
  ENTITY_FIELD_DEFS,
  STATION_FIELD_DEFS,
  UNIT_FIELD_DEFS,
  DEPT_TYPES,
  ENTITY_TYPES,
  UNIT_TYPES,
  FIRE_SERVICES,
  EMS_SERVICES,
  INVESTIGATION_SERVICES,
  PSAP_TYPES,
  PSAP_CAPABILITIES,
  PSAP_DISCIPLINES,
  PSAP_JURISDICTIONS,
  DISPATCH_PROTOCOLS,
  US_STATES,
} from '../constants/nerisFieldDefs';

const API_BASE = '';

// ─── API helpers ──────────────────────────────────────────────────────────────

const api = {
  get:  (path)       => fetch(`${API_BASE}${path}`).then(r => r.json()),
  put:  (path, body) => fetch(`${API_BASE}${path}`, { method: 'PUT',    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  post: (path, body) => fetch(`${API_BASE}${path}`, { method: 'POST',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  del:  (path)       => fetch(`${API_BASE}${path}`, { method: 'DELETE' }).then(r => r.json()),
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '0.45rem 0.6rem',
  border: '1px solid #ddd', borderRadius: 4,
  fontSize: '0.9rem', boxSizing: 'border-box',
  background: '#fff', color: '#222',
};

const selectStyle = { ...inputStyle };

// ─── Primitive field components ───────────────────────────────────────────────

/**
 * Field wrapper — renders label, children, and hint text.
 * Hint text is sourced from nerisFieldDefs.js definitions.
 */
function Field({ def, children }) {
  // def can be a definition object { label, hint, required } or plain props
  const label    = def?.label    ?? '';
  const hint     = def?.hint     ?? null;
  const required = def?.required ?? false;

  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#555', marginBottom: '0.2rem' }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && (
        <small style={{ display: 'block', color: '#888', fontSize: '0.73rem', marginTop: '0.2rem', lineHeight: '1.35' }}>
          {hint}
        </small>
      )}
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

function SelectInput({ value, onChange, onBlur, options, disabled }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} onBlur={onBlur} disabled={disabled} style={selectStyle}>
      <option value=""></option>
      {options.map(opt =>
        typeof opt === 'string'
          ? <option key={opt} value={opt}>{opt}</option>
          : <option key={opt.value} value={opt.value}>{opt.label}</option>
      )}
    </select>
  );
}

function NumberInput({ value, onChange, onBlur, min, max, disabled, width = '120px' }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      onBlur={onBlur}
      min={min}
      max={max}
      disabled={disabled}
      style={{ ...inputStyle, width }}
    />
  );
}

function CheckboxInput({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', cursor: 'pointer', color: '#222', marginTop: '0.2rem' }}>
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
      {label || 'Yes'}
    </label>
  );
}

/**
 * Multi-select checkboxes.
 * choices: array of { value, label }
 * values:  currently selected values array
 */
function MultiCheckbox({ values = [], choices, onChange }) {
  const toggle = (val) => {
    const next = values.includes(val) ? values.filter(v => v !== val) : [...values, val];
    onChange(next);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 1.25rem', marginTop: '0.15rem' }}>
      {choices.map(opt => (
        <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={values.includes(opt.value)} onChange={() => toggle(opt.value)} />
          {opt.label}
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

  const td = { padding: '0.35rem 0.4rem', verticalAlign: 'top' };

  return (
    <tr style={{ background: dirty ? '#fffbeb' : 'transparent' }}>
      {/* Apparatus link */}
      <td style={td}>
        <select
          value={data.apparatus_id ?? ''}
          onChange={e => selectApparatus(e.target.value)}
          style={{ ...selectStyle, width: '130px', fontSize: '0.82rem' }}
          title={UNIT_FIELD_DEFS.apparatus_id.hint}
        >
          <option value="">— none —</option>
          {apparatusOptions.map(a => (
            <option key={a.id} value={a.id}>{a.unit_designator} — {a.name}</option>
          ))}
        </select>
      </td>

      {/* cad_designation_1 */}
      <td style={td}>
        <input
          type="text"
          value={data.cad_designation_1 ?? ''}
          onChange={e => update('cad_designation_1', e.target.value)}
          style={{ ...inputStyle, width: '90px', fontSize: '0.82rem', fontFamily: 'monospace' }}
          title={UNIT_FIELD_DEFS.cad_designation_1.hint}
          placeholder="E48"
        />
      </td>

      {/* cad_designation_2 */}
      <td style={td}>
        <input
          type="text"
          value={data.cad_designation_2 ?? ''}
          onChange={e => update('cad_designation_2', e.target.value)}
          style={{ ...inputStyle, width: '90px', fontSize: '0.82rem', fontFamily: 'monospace' }}
          title={UNIT_FIELD_DEFS.cad_designation_2.hint}
        />
      </td>

      {/* type — TypeUnitValue */}
      <td style={td}>
        <select
          value={data.type ?? ''}
          onChange={e => update('type', e.target.value || null)}
          style={{ ...selectStyle, width: '185px', fontSize: '0.82rem' }}
          title={UNIT_FIELD_DEFS.type.hint}
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
          title={UNIT_FIELD_DEFS.staffing.hint}
        />
      </td>

      {/* dedicated_staffing */}
      <td style={{ ...td, textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={!!data.dedicated_staffing}
          onChange={e => update('dedicated_staffing', e.target.checked)}
          title={UNIT_FIELD_DEFS.dedicated_staffing.hint}
        />
      </td>

      {/* neris_id — read only */}
      <td style={td}>
        <span style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace' }} title={UNIT_FIELD_DEFS.neris_id.hint}>
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
    if (!newUnit.cad_designation_1) { toast.error('CAD ID is required'); return; }
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

  const F = STATION_FIELD_DEFS;

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

          {/* Station fields */}
          <Row cols={2}>
            <Field def={F.station_id}>
              <TextInput value={data.station_id} onChange={v => update('station_id', v)} />
            </Field>
            <Field def={F.station_name}>
              <TextInput value={data.station_name} onChange={v => update('station_name', v)} />
            </Field>
          </Row>
          <Field def={F.address_line_1}>
            <TextInput value={data.address_line_1} onChange={v => update('address_line_1', v)} />
          </Field>
          <Row cols={3}>
            <Field def={F.city}>
              <TextInput value={data.city} onChange={v => update('city', v)} />
            </Field>
            <Field def={F.state}>
              <SelectInput value={data.state} onChange={v => update('state', v)} options={US_STATES} />
            </Field>
            <Field def={F.zip_code}>
              <TextInput value={data.zip_code} onChange={v => update('zip_code', v)} maxLength={10} />
            </Field>
          </Row>
          <Row cols={3}>
            <Field def={F.location_lat}>
              <TextInput
                value={data.location?.lat ?? ''}
                onChange={v => update('location', { ...(data.location || {}), lat: v })}
              />
            </Field>
            <Field def={F.location_lng}>
              <TextInput
                value={data.location?.lng ?? ''}
                onChange={v => update('location', { ...(data.location || {}), lng: v })}
              />
            </Field>
            <Field def={F.staffing}>
              <NumberInput value={data.staffing} onChange={v => update('staffing', v)} min={0} width="100px" />
            </Field>
          </Row>
          <Field def={F.internal_id}>
            <TextInput value={data.internal_id} onChange={v => update('internal_id', v)} />
          </Field>

          {dirty && (
            <button
              onClick={save}
              disabled={saving}
              style={{ marginBottom: '0.75rem', padding: '0.35rem 1rem', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              {saving ? 'Saving…' : 'Save Station'}
            </button>
          )}

          {/* Units table */}
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
                      {[
                        [UNIT_FIELD_DEFS.apparatus_id.label,       UNIT_FIELD_DEFS.apparatus_id.hint],
                        [UNIT_FIELD_DEFS.cad_designation_1.label + ' *', UNIT_FIELD_DEFS.cad_designation_1.hint],
                        [UNIT_FIELD_DEFS.cad_designation_2.label,  UNIT_FIELD_DEFS.cad_designation_2.hint],
                        [UNIT_FIELD_DEFS.type.label,               UNIT_FIELD_DEFS.type.hint],
                        [UNIT_FIELD_DEFS.staffing.label + ' *',    UNIT_FIELD_DEFS.staffing.hint],
                        [UNIT_FIELD_DEFS.dedicated_staffing.label, UNIT_FIELD_DEFS.dedicated_staffing.hint],
                        [UNIT_FIELD_DEFS.neris_id.label,           UNIT_FIELD_DEFS.neris_id.hint],
                        ['', ''],
                      ].map(([h, title]) => (
                        <th key={h} title={title} style={{ padding: '0.3rem 0.4rem', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.8rem', cursor: title ? 'help' : 'default' }}>{h}</th>
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
                            style={{ ...selectStyle, width: '185px', fontSize: '0.82rem' }}
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

// ─── SyncModal ──────────────────────────────────────────────────────────────

/**
 * SyncTab
 *
 * Two-phase inline page (rendered as a sub-tab, no modal overlay):
 *   Phase 1 (search)  — search NERIS by name or FDID, pick a result, then fetch
 *   Phase 2 (diff)    — side-by-side comparison with per-field checkboxes
 *
 * Field names in diffs are 1:1 with NERIS spec (DepartmentPayload,
 * StationPayload, UnitPayload) as returned by POST /api/neris/entity/pull.
 *
 * Props:
 *   onApplied — called after a successful apply; parent switches to Entity tab
 */
function SyncTab({ onApplied }) {
  const toast = useToast();

  // ---- Phase state ----
  const [phase, setPhase]             = useState('search'); // 'search' | 'diff'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = not searched yet
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError]   = useState(null);
  const [fdidInput, setFdidInput]       = useState('');

  // ---- Diff state ----
  const [diffData, setDiffData]   = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // ---- Selection state (what admin has approved) ----
  // entityChecked: Set of field names
  const [entityChecked, setEntityChecked]     = useState(new Set());
  // stationChecked: { [stationIdx]: Set of field names }
  const [stationChecked, setStationChecked]   = useState({});
  // unitChecked: { [stationIdx]: { [unitIdx]: Set of field names } }
  const [unitChecked, setUnitChecked]         = useState({});
  // stationImport: Set of stationIdx for neris_only stations
  const [stationImport, setStationImport]     = useState(new Set());
  // unitImport: { [stationIdx]: Set of unitIdx } for neris_only units
  const [unitImport, setUnitImport]           = useState({});

  const [applying, setApplying] = useState(false);

  // ---- Search ----
  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      const res = await fetch(`/api/neris/entity/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.detail || 'Search failed');
      } else {
        // NERIS list response: { items: [...], total: N, ... } or array
        const items = Array.isArray(data) ? data : (data.items || data.results || []);
        setSearchResults(items);
      }
    } catch {
      setSearchError('Network error during search');
    } finally {
      setSearchLoading(false);
    }
  };

  // ---- Fetch diff by FDID (from search result click or direct FDID entry) ----
  const fetchDiff = async (fdNerisId) => {
    setDiffLoading(true);
    try {
      const res = await api.post('/api/neris/entity/pull', { fd_neris_id: fdNerisId });
      if (res.detail) throw new Error(res.detail);
      setDiffData(res);
      // Pre-check all changed fields by default
      const eChecked = new Set(
        res.entity_diff.filter(f => f.changed).map(f => f.field)
      );
      setEntityChecked(eChecked);
      const sChecked = {};
      const uChecked = {};
      const sImport  = new Set();
      const uImport  = {};
      res.stations_diff.forEach((s, si) => {
        if (s.match === 'neris_only') {
          sImport.add(si);
        } else if (s.match === 'matched') {
          sChecked[si] = new Set(s.fields.filter(f => f.changed).map(f => f.field));
        }
        uChecked[si] = {};
        uImport[si]  = new Set();
        s.units.forEach((u, ui) => {
          if (u.match === 'neris_only') {
            uImport[si].add(ui);
          } else if (u.match === 'matched') {
            uChecked[si][ui] = new Set(u.fields.filter(f => f.changed).map(f => f.field));
          }
        });
      });
      setStationChecked(sChecked);
      setUnitChecked(uChecked);
      setStationImport(sImport);
      setUnitImport(uImport);
      setPhase('diff');
    } catch (e) {
      toast.error(e.message || 'Failed to fetch NERIS data');
    } finally {
      setDiffLoading(false);
    }
  };

  // ---- Accept All ----
  const acceptAll = () => {
    if (!diffData) return;
    setEntityChecked(new Set(
      diffData.entity_diff.filter(f => f.changed).map(f => f.field)
    ));
    const sChecked = {};
    const uChecked = {};
    const sImport  = new Set();
    const uImport  = {};
    diffData.stations_diff.forEach((s, si) => {
      if (s.match === 'neris_only') {
        sImport.add(si);
      } else if (s.match === 'matched') {
        sChecked[si] = new Set(s.fields.filter(f => f.changed).map(f => f.field));
      }
      uChecked[si] = {};
      uImport[si]  = new Set();
      s.units.forEach((u, ui) => {
        if (u.match === 'neris_only') {
          uImport[si].add(ui);
        } else if (u.match === 'matched') {
          uChecked[si][ui] = new Set(u.fields.filter(f => f.changed).map(f => f.field));
        }
      });
    });
    setStationChecked(sChecked);
    setUnitChecked(uChecked);
    setStationImport(sImport);
    setUnitImport(uImport);
  };

  // ---- Build and submit apply payload ----
  const applySelections = async () => {
    if (!diffData) return;
    setApplying(true);

    // Build entity_values from NERIS diff for approved fields
    const nerisEntityObj = diffData.neris || {};
    const entity_values = {};
    entityChecked.forEach(field => {
      entity_values[field] = nerisEntityObj[field] ?? null;
    });

    // Build stations array
    const stations = [];
    diffData.stations_diff.forEach((s, si) => {
      if (s.match === 'local_only') return; // nothing to do

      if (s.match === 'neris_only' && stationImport.has(si)) {
        // Import entire station + its neris_only units
        const units = [];
        s.units.forEach((u, ui) => {
          if (u.match === 'neris_only' && (uImport[si] || new Set()).has(ui)) {
            units.push({
              action: 'import',
              local_id: null,
              neris_station_neris_id: s.neris?.neris_id || '',
              neris_unit: u.neris || {},
              fields: _UNIT_DIFF_FIELDS_CLIENT,
            });
          }
        });
        stations.push({
          action: 'import',
          local_id: null,
          neris_station: s.neris || {},
          fields: _STATION_DIFF_FIELDS_CLIENT,
          units,
        });
        return;
      }

      if (s.match === 'matched') {
        const approvedFields = Array.from(stationChecked[si] || []);
        const units = [];
        s.units.forEach((u, ui) => {
          if (u.match === 'local_only') return;
          if (u.match === 'neris_only' && (uImport[si] || new Set()).has(ui)) {
            units.push({
              action: 'import',
              local_id: null,
              neris_station_neris_id: s.neris?.neris_id || '',
              neris_unit: u.neris || {},
              fields: _UNIT_DIFF_FIELDS_CLIENT,
            });
          } else if (u.match === 'matched') {
            const uFields = Array.from((uChecked[si] || {})[ui] || []);
            if (uFields.length) {
              units.push({
                action: 'update',
                local_id: u.local_id,
                neris_station_neris_id: s.neris?.neris_id || '',
                neris_unit: u.neris || {},
                fields: uFields,
              });
            }
          }
        });
        if (approvedFields.length || units.length) {
          stations.push({
            action: 'update',
            local_id: s.local_id,
            neris_station: s.neris || {},
            fields: approvedFields,
            units,
          });
        }
      }
    });

    try {
      const res = await api.post('/api/neris/entity/pull/apply', {
        entity_fields: Array.from(entityChecked),
        entity_values,
        stations,
      });
      if (res.detail) throw new Error(res.detail);
      const a = res.applied || {};
      const parts = [];
      if (a.entity_fields)    parts.push(`${a.entity_fields} entity field${a.entity_fields !== 1 ? 's' : ''}`);
      if (a.stations_updated) parts.push(`${a.stations_updated} station${a.stations_updated !== 1 ? 's' : ''} updated`);
      if (a.stations_imported) parts.push(`${a.stations_imported} station${a.stations_imported !== 1 ? 's' : ''} imported`);
      if (a.units_updated)    parts.push(`${a.units_updated} unit${a.units_updated !== 1 ? 's' : ''} updated`);
      if (a.units_imported)   parts.push(`${a.units_imported} unit${a.units_imported !== 1 ? 's' : ''} imported`);
      toast.success(parts.length ? `Applied: ${parts.join(', ')}` : 'Nothing to apply');
      onApplied();
      onClose();
    } catch (e) {
      toast.error(e.message || 'Apply failed');
    } finally {
      setApplying(false);
    }
  };

  // Field lists mirroring backend whitelists (client-side, for import payloads)
  const _STATION_DIFF_FIELDS_CLIENT = [
    'station_id', 'internal_id', 'address_line_1', 'address_line_2',
    'city', 'state', 'zip_code', 'staffing', 'location',
  ];
  const _UNIT_DIFF_FIELDS_CLIENT = [
    'cad_designation_1', 'cad_designation_2', 'type',
    'staffing', 'dedicated_staffing', 'neris_id',
  ];

  // ---- Render helpers ----
  const fieldLabel = (f) => f.replace(/_/g, ' ');
  const renderVal  = (v) => {
    if (v === null || v === undefined) return <span style={{ color: '#9ca3af' }}>—</span>;
    if (typeof v === 'boolean')        return v ? 'Yes' : 'No';
    if (Array.isArray(v))              return v.join(', ') || <span style={{ color: '#9ca3af' }}>—</span>;
    if (typeof v === 'object')         return <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{JSON.stringify(v)}</span>;
    return String(v);
  };

  // ------------------------------------------------------------------ RENDER

  return (
    <div style={{ maxWidth: 860 }}>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <span style={{ fontWeight: 700, color: '#1e3a5f', fontSize: '1rem' }}>
            {phase === 'search' ? 'Sync with NERIS — Find Department' : `Sync with NERIS — ${diffData?.fd_neris_id || ''}`}
          </span>
          {phase === 'diff' && diffData?.summary && (
            <span style={{ marginLeft: '0.75rem', fontSize: '0.82rem', color: '#6b7280' }}>
              {diffData.summary.entity_changes} entity change{diffData.summary.entity_changes !== 1 ? 's' : ''}
              {' · '}
              {diffData.summary.station_changes} station/unit change{diffData.summary.station_changes !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {phase === 'diff' && (
            <>
              <button onClick={() => setPhase('search')} style={{ fontSize: '0.82rem', padding: '0.3rem 0.75rem', border: '1px solid #d1d5db', background: '#f9fafb', borderRadius: 4, cursor: 'pointer', color: '#374151' }}>← Back</button>
              <button onClick={acceptAll} style={{ fontSize: '0.82rem', padding: '0.3rem 0.75rem', border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: 4, cursor: 'pointer', color: '#1d4ed8', fontWeight: 600 }}>Accept All</button>
              <button
                onClick={applySelections}
                disabled={applying}
                style={{ padding: '0.3rem 0.9rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
              >
                {applying ? 'Applying…' : 'Apply Selected'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Page body */}
      <div>

          {/* ===== PHASE 1: Search ===== */}
          {phase === 'search' && (
            <div>
              <p style={{ color: '#6b7280', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Search NERIS by department name (min 3 chars) or NERIS ID (e.g. <code>FD09190828</code>).
                Select a result to preview the full diff, or enter the FDID directly below.
              </p>

              {/* Search input */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runSearch()}
                  placeholder="Department name or NERIS ID"
                  style={{ ...inputStyle, flex: 1 }}
                  autoFocus
                />
                <button
                  onClick={runSearch}
                  disabled={searchLoading || searchQuery.trim().length < 2}
                  style={{ padding: '0.45rem 1rem', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
                >
                  {searchLoading ? 'Searching…' : 'Search'}
                </button>
              </div>

              {/* Search error */}
              {searchError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '0.6rem 0.85rem', marginBottom: '0.75rem', color: '#dc2626', fontSize: '0.85rem' }}>
                  {searchError}
                  {searchError.includes('access denied') && (
                    <div style={{ marginTop: '0.35rem', color: '#b45309' }}>Use the FDID field below to fetch directly.</div>
                  )}
                </div>
              )}

              {/* Search results */}
              {searchResults !== null && (
                <div style={{ marginBottom: '1rem' }}>
                  {searchResults.length === 0
                    ? <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>No results found.</p>
                    : searchResults.map((item, i) => (
                        <div
                          key={item.neris_id || i}
                          onClick={() => fetchDiff(item.neris_id)}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: 5,
                            marginBottom: '0.35rem', cursor: 'pointer', background: '#f9fafb',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                          onMouseLeave={e => e.currentTarget.style.background = '#f9fafb'}
                        >
                          <div>
                            <span style={{ fontWeight: 600, color: '#1e3a5f' }}>{item.name || '(unnamed)'}</span>
                            <span style={{ marginLeft: '0.6rem', fontSize: '0.8rem', color: '#6b7280' }}>{item.city}{item.state ? `, ${item.state}` : ''}</span>
                          </div>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#374151' }}>{item.neris_id}</span>
                        </div>
                      ))
                  }
                </div>
              )}

              {/* Divider */}
              <div style={{ borderTop: '1px solid #e5e7eb', margin: '1rem 0', position: 'relative' }}>
                <span style={{ position: 'absolute', top: '-0.6rem', left: '50%', transform: 'translateX(-50%)', background: '#fff', padding: '0 0.5rem', color: '#9ca3af', fontSize: '0.78rem' }}>or enter FDID directly</span>
              </div>

              {/* Direct FDID input */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={fdidInput}
                  onChange={e => setFdidInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fdidInput.trim() && fetchDiff(fdidInput.trim().toUpperCase())}
                  placeholder="e.g. FD09190828"
                  style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                />
                <button
                  onClick={() => fetchDiff(fdidInput.trim().toUpperCase())}
                  disabled={diffLoading || !fdidInput.trim()}
                  style={{ padding: '0.45rem 1rem', background: '#0369a1', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
                >
                  {diffLoading ? 'Fetching…' : 'Fetch'}
                </button>
              </div>

              {diffLoading && (
                <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.75rem' }}>Fetching from NERIS…</p>
              )}
            </div>
          )}

          {/* ===== PHASE 2: Diff ===== */}
          {phase === 'diff' && diffData && (
            <div>

              {/* --- Entity fields diff --- */}
              <DiffSection
                title="Department Fields"
                changeCount={diffData.entity_diff.filter(f => f.changed).length}
                defaultOpen
              >
                <DiffTable
                  rows={diffData.entity_diff}
                  checked={entityChecked}
                  onToggle={(field) => setEntityChecked(prev => {
                    const next = new Set(prev);
                    next.has(field) ? next.delete(field) : next.add(field);
                    return next;
                  })}
                  onToggleAll={(fields, check) => setEntityChecked(prev => {
                    const next = new Set(prev);
                    fields.forEach(f => check ? next.add(f) : next.delete(f));
                    return next;
                  })}
                />
              </DiffSection>

              {/* --- Stations diff --- */}
              {diffData.stations_diff.length > 0 && (
                <DiffSection
                  title="Stations & Units"
                  changeCount={diffData.stations_diff.filter(s => s.has_changes).length}
                >
                  {diffData.stations_diff.map((s, si) => (
                    <StationDiff
                      key={si}
                      station={s}
                      si={si}
                      stationChecked={stationChecked[si] || new Set()}
                      unitChecked={unitChecked[si] || {}}
                      stationImport={stationImport.has(si)}
                      unitImport={unitImport[si] || new Set()}
                      onToggleStation={(field) => setStationChecked(prev => {
                        const next = { ...prev };
                        const s = new Set(next[si] || []);
                        s.has(field) ? s.delete(field) : s.add(field);
                        next[si] = s;
                        return next;
                      })}
                      onToggleImportStation={(checked) => setStationImport(prev => {
                        const next = new Set(prev);
                        checked ? next.add(si) : next.delete(si);
                        return next;
                      })}
                      onToggleUnit={(ui, field) => setUnitChecked(prev => {
                        const next = { ...prev };
                        const su = { ...(next[si] || {}) };
                        const u = new Set(su[ui] || []);
                        u.has(field) ? u.delete(field) : u.add(field);
                        su[ui] = u;
                        next[si] = su;
                        return next;
                      })}
                      onToggleImportUnit={(ui, checked) => setUnitImport(prev => {
                        const next = { ...prev };
                        const su = new Set(next[si] || []);
                        checked ? su.add(ui) : su.delete(ui);
                        next[si] = su;
                        return next;
                      })}
                    />
                  ))}
                </DiffSection>
              )}

            </div>
          )}

        </div>{/* end body */}

        {/* Footer */}
        <div style={footerStyle}>
          <button onClick={onClose} style={{ padding: '0.45rem 1rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', color: '#374151' }}>Cancel</button>
          {phase === 'diff' && (
            <button
              onClick={applySelections}
              disabled={applying}
              style={{ padding: '0.45rem 1.25rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
            >
              {applying ? 'Applying…' : 'Apply Selected'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ---- DiffSection: collapsible wrapper with change count badge ----
function DiffSection({ title, changeCount, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: '0.75rem', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.55rem 0.85rem', background: open ? '#f0f9ff' : '#f9fafb',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          borderBottom: open ? '1px solid #e5e7eb' : 'none',
        }}
      >
        <span style={{ fontWeight: 600, color: '#1e40af', fontSize: '0.9rem' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {changeCount > 0 && (
            <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', padding: '0.1rem 0.45rem', borderRadius: 10, fontWeight: 600 }}>
              {changeCount} change{changeCount !== 1 ? 's' : ''}
            </span>
          )}
          {changeCount === 0 && (
            <span style={{ fontSize: '0.75rem', background: '#f0fdf4', color: '#15803d', padding: '0.1rem 0.45rem', borderRadius: 10 }}>No changes</span>
          )}
          <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && <div style={{ padding: '0.75rem 0.85rem' }}>{children}</div>}
    </div>
  );
}

// ---- DiffTable: renders a list of field diff rows ----
function DiffTable({ rows, checked, onToggle, onToggleAll }) {
  const changedRows = rows.filter(r => r.changed);
  const allChecked  = changedRows.length > 0 && changedRows.every(r => checked.has(r.field));

  const renderVal = (v) => {
    if (v === null || v === undefined) return <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>—</span>;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return v.length ? v.join(', ') : <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>—</span>;
    if (typeof v === 'object') return <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#374151' }}>{JSON.stringify(v)}</span>;
    return String(v);
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
      <thead>
        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <th style={{ padding: '0.3rem 0.4rem', textAlign: 'left', color: '#64748b', fontWeight: 600, width: 28 }}>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={e => onToggleAll(changedRows.map(r => r.field), e.target.checked)}
              disabled={changedRows.length === 0}
              title="Select/deselect all changed fields"
            />
          </th>
          <th style={{ padding: '0.3rem 0.4rem', textAlign: 'left', color: '#64748b', fontWeight: 600, width: 160 }}>Field</th>
          <th style={{ padding: '0.3rem 0.4rem', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Local</th>
          <th style={{ padding: '0.3rem 0.4rem', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>NERIS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr
            key={row.field}
            style={{
              background: row.changed ? (checked.has(row.field) ? '#fffbeb' : '#fff') : '#fafafa',
              opacity: row.changed ? 1 : 0.55,
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            <td style={{ padding: '0.3rem 0.4rem' }}>
              {row.changed && (
                <input
                  type="checkbox"
                  checked={checked.has(row.field)}
                  onChange={() => onToggle(row.field)}
                />
              )}
            </td>
            <td style={{ padding: '0.3rem 0.4rem', fontWeight: 500, color: '#374151', fontFamily: 'monospace', fontSize: '0.78rem' }}>
              {row.field}
            </td>
            <td style={{ padding: '0.3rem 0.4rem', color: '#374151', maxWidth: 200, wordBreak: 'break-word' }}>
              {renderVal(row.local)}
            </td>
            <td style={{ padding: '0.3rem 0.4rem', maxWidth: 200, wordBreak: 'break-word' }}>
              <span style={{ color: row.changed ? '#b45309' : '#374151', fontWeight: row.changed ? 600 : 400 }}>
                {renderVal(row.neris)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---- StationDiff: renders one station entry with nested units ----
function StationDiff({
  station, si,
  stationChecked, unitChecked, stationImport, unitImport,
  onToggleStation, onToggleImportStation,
  onToggleUnit, onToggleImportUnit,
}) {
  const [open, setOpen] = useState(station.has_changes);

  const matchBadge = {
    matched:    { label: 'matched',    bg: '#f0fdf4', color: '#15803d' },
    neris_only: { label: 'NERIS only', bg: '#fef3c7', color: '#92400e' },
    local_only: { label: 'local only', bg: '#f3f4f6', color: '#6b7280' },
  }[station.match];

  const stationLabel = station.neris?.station_id
    ? `Station ${station.neris.station_id}`
    : station.local?.station_id
    ? `Station ${station.local.station_id}`
    : `Station #${si + 1}`;

  const displayName = station.neris?.station_name || station.local?.station_name || stationLabel;

  const renderVal = (v) => {
    if (v === null || v === undefined) return <span style={{ color: '#9ca3af' }}>—</span>;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return <span style={{ fontSize: '0.73rem', fontFamily: 'monospace' }}>{JSON.stringify(v)}</span>;
    return String(v);
  };

  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: 5, marginBottom: '0.6rem', overflow: 'hidden' }}>

      {/* Station header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.7rem', background: '#f8fafc', borderBottom: open ? '1px solid #d1d5db' : 'none' }}>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#1e3a5f', fontSize: '0.88rem', padding: 0 }}>
          {open ? '▼' : '▶'} {displayName}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.73rem', background: matchBadge.bg, color: matchBadge.color, padding: '0.1rem 0.45rem', borderRadius: 10, fontWeight: 600 }}>
            {matchBadge.label}
          </span>
          {station.match === 'neris_only' && (
            <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', color: '#92400e', fontWeight: 600 }}>
              <input type="checkbox" checked={stationImport} onChange={e => onToggleImportStation(e.target.checked)} />
              Import
            </label>
          )}
        </div>
      </div>

      {open && (
        <div style={{ padding: '0.6rem 0.7rem' }}>

          {/* local_only: no action message */}
          {station.match === 'local_only' && (
            <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: 0 }}>Not found in NERIS — no action available.</p>
          )}

          {/* matched or neris_only: show field table */}
          {(station.match === 'matched' || station.match === 'neris_only') && station.fields.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ width: 24, padding: '0.25rem 0.35rem' }} />
                  <th style={{ padding: '0.25rem 0.35rem', textAlign: 'left', color: '#64748b', fontWeight: 600, width: 140 }}>Field</th>
                  <th style={{ padding: '0.25rem 0.35rem', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Local</th>
                  <th style={{ padding: '0.25rem 0.35rem', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>NERIS</th>
                </tr>
              </thead>
              <tbody>
                {station.fields.map(row => (
                  <tr key={row.field} style={{ background: row.changed ? '#fffbeb' : '#fafafa', opacity: row.changed ? 1 : 0.5, borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.25rem 0.35rem' }}>
                      {row.changed && station.match === 'matched' && (
                        <input type="checkbox" checked={stationChecked.has(row.field)} onChange={() => onToggleStation(row.field)} />
                      )}
                    </td>
                    <td style={{ padding: '0.25rem 0.35rem', fontFamily: 'monospace', fontSize: '0.75rem', color: '#374151' }}>{row.field}</td>
                    <td style={{ padding: '0.25rem 0.35rem', color: '#374151', maxWidth: 160, wordBreak: 'break-word' }}>{renderVal(row.local)}</td>
                    <td style={{ padding: '0.25rem 0.35rem', maxWidth: 160, wordBreak: 'break-word' }}>
                      <span style={{ color: row.changed ? '#b45309' : '#374151', fontWeight: row.changed ? 600 : 400 }}>{renderVal(row.neris)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Units */}
          {station.units.length > 0 && (
            <div style={{ marginTop: '0.4rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '0.3rem' }}>Units</div>
              {station.units.map((u, ui) => {
                const uMatchBadge = {
                  matched:    { label: 'matched',    bg: '#f0fdf4', color: '#15803d' },
                  neris_only: { label: 'NERIS only', bg: '#fef3c7', color: '#92400e' },
                  local_only: { label: 'local only', bg: '#f3f4f6', color: '#6b7280' },
                }[u.match];
                const uLabel = u.neris?.cad_designation_1 || u.local?.cad_designation_1 || `Unit #${ui + 1}`;
                const uImportChecked = (unitImport || new Set()).has(ui);
                const uChecked = (unitChecked || {})[ui] || new Set();

                return (
                  <div key={ui} style={{ border: '1px solid #e5e7eb', borderRadius: 4, marginBottom: '0.4rem', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.55rem', background: '#f9fafb' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#374151', fontFamily: 'monospace' }}>{uLabel}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.7rem', background: uMatchBadge.bg, color: uMatchBadge.color, padding: '0.08rem 0.4rem', borderRadius: 10, fontWeight: 600 }}>
                          {uMatchBadge.label}
                        </span>
                        {u.match === 'neris_only' && (
                          <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer', color: '#92400e', fontWeight: 600 }}>
                            <input type="checkbox" checked={uImportChecked} onChange={e => onToggleImportUnit(ui, e.target.checked)} />
                            Import
                          </label>
                        )}
                        {u.match === 'local_only' && (
                          <span style={{ fontSize: '0.73rem', color: '#9ca3af' }}>Not in NERIS</span>
                        )}
                      </div>
                    </div>
                    {u.match === 'matched' && u.fields.some(f => f.changed) && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <tbody>
                          {u.fields.filter(f => f.changed).map(row => (
                            <tr key={row.field} style={{ borderBottom: '1px solid #f1f5f9', background: '#fffbeb' }}>
                              <td style={{ padding: '0.2rem 0.55rem', width: 22 }}>
                                <input type="checkbox" checked={uChecked.has(row.field)} onChange={() => onToggleUnit(ui, row.field)} />
                              </td>
                              <td style={{ padding: '0.2rem 0.35rem', fontFamily: 'monospace', fontSize: '0.73rem', color: '#374151', width: 140 }}>{row.field}</td>
                              <td style={{ padding: '0.2rem 0.35rem', color: '#374151', maxWidth: 120, wordBreak: 'break-word' }}>{renderVal(row.local)}</td>
                              <td style={{ padding: '0.2rem 0.35rem', maxWidth: 120, wordBreak: 'break-word' }}>
                                <span style={{ color: '#b45309', fontWeight: 600 }}>{renderVal(row.neris)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}

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

  // Update local state and immediately persist a single top-level field
  const saveField = async (field, value) => {
    setEntity(p => ({ ...p, [field]: value }));
    try {
      await api.put('/api/neris/entity', { [field]: value });
    } catch {
      toast.error(`Failed to save ${field}`);
    }
  };

  // Update local state only — persist on blur
  const updateField = (field, value) => setEntity(p => ({ ...p, [field]: value }));
  const blurSave = (field) => () => api.put('/api/neris/entity', { [field]: entity[field] }).catch(() => toast.error(`Failed to save ${field}`));

  // Update a JSONB sub-field and persist the entire JSONB object
  const saveJsonField = async (jsonKey, subKey, value) => {
    const updated = { ...(entity[jsonKey] || {}), [subKey]: value };
    setEntity(p => ({ ...p, [jsonKey]: updated }));
    try {
      await api.put('/api/neris/entity', { [jsonKey]: updated });
    } catch {
      toast.error(`Failed to save ${jsonKey}.${subKey}`);
    }
  };

  // Update a JSONB sub-field locally — persist on blur
  const updateJsonField = (jsonKey, subKey, value) => {
    setEntity(p => ({ ...p, [jsonKey]: { ...(p[jsonKey] || {}), [subKey]: value } }));
  };
  const blurSaveJson = (jsonKey, subKey) => () => {
    const updated = entity[jsonKey] || {};
    api.put('/api/neris/entity', { [jsonKey]: updated }).catch(() => toast.error(`Failed to save ${jsonKey}.${subKey}`));
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

  // Shorthand references to JSONB sub-objects
  const dispatch   = entity.dispatch   || {};
  const staffing   = entity.staffing   || {};
  const assessment = entity.assessment || {};
  const shift      = entity.shift      || {};

  // Field def shorthand
  const F = ENTITY_FIELD_DEFS;

  return (
    <div style={{ maxWidth: 740 }}>

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
                <div style={{ color: '#dc2626', fontWeight: 600, marginBottom: '0.4rem' }}>✗ {validationResult.errors?.length} error(s) must be fixed before submitting</div>
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
          <Field def={F.fd_neris_id}>
            <TextInput value={entity.fd_neris_id} onChange={v => updateField('fd_neris_id', v)} onBlur={blurSave('fd_neris_id')} />
          </Field>
          <Field def={F.internal_id}>
            <TextInput value={entity.internal_id} onChange={v => updateField('internal_id', v)} onBlur={blurSave('internal_id')} />
          </Field>
        </Row>
        <Field def={F.name}>
          <TextInput value={entity.name} onChange={v => updateField('name', v)} onBlur={blurSave('name')} />
        </Field>
        <Row cols={2}>
          <Field def={F.time_zone}>
            <TextInput value={entity.time_zone} onChange={v => updateField('time_zone', v)} onBlur={blurSave('time_zone')} placeholder={F.time_zone.placeholder} />
          </Field>
          <Field def={F.fips_code}>
            <TextInput value={entity.fips_code} onChange={v => updateField('fips_code', v)} onBlur={blurSave('fips_code')} />
          </Field>
        </Row>
      </Section>

      {/* 2. Physical Address */}
      <Section title="2. Physical Address">
        <Row cols={2}>
          <Field def={F.address_line_1}>
            <TextInput value={entity.address_line_1} onChange={v => updateField('address_line_1', v)} onBlur={blurSave('address_line_1')} />
          </Field>
          <Field def={F.address_line_2}>
            <TextInput value={entity.address_line_2} onChange={v => updateField('address_line_2', v)} onBlur={blurSave('address_line_2')} />
          </Field>
        </Row>
        <Row cols={3}>
          <Field def={F.city}>
            <TextInput value={entity.city} onChange={v => updateField('city', v)} onBlur={blurSave('city')} />
          </Field>
          <Field def={F.state}>
            <SelectInput value={entity.state} onChange={v => saveField('state', v)} options={US_STATES} />
          </Field>
          <Field def={F.zip_code}>
            <TextInput value={entity.zip_code} onChange={v => updateField('zip_code', v)} onBlur={blurSave('zip_code')} maxLength={10} />
          </Field>
        </Row>
        <Row cols={2}>
          <Field def={F.location_lat}>
            <TextInput
              value={entity.location?.lat ?? ''}
              onChange={v => setEntity(p => ({ ...p, location: { ...(p.location || {}), lat: v } }))}
              onBlur={() => api.put('/api/neris/entity', { location: entity.location }).catch(() => toast.error('Failed to save location'))}
              placeholder={F.location_lat.placeholder}
            />
          </Field>
          <Field def={F.location_lng}>
            <TextInput
              value={entity.location?.lng ?? ''}
              onChange={v => setEntity(p => ({ ...p, location: { ...(p.location || {}), lng: v } }))}
              onBlur={() => api.put('/api/neris/entity', { location: entity.location }).catch(() => toast.error('Failed to save location'))}
              placeholder={F.location_lng.placeholder}
            />
          </Field>
        </Row>

        {/* Mailing address — collapsed sub-section */}
        <details style={{ marginTop: '0.5rem' }}>
          <summary style={{ fontSize: '0.85rem', color: '#6b7280', cursor: 'pointer', userSelect: 'none' }}>Mailing Address (if different from physical)</summary>
          <div style={{ marginTop: '0.75rem' }}>
            <Row cols={2}>
              <Field def={F.mail_address_line_1}>
                <TextInput value={entity.mail_address_line_1} onChange={v => updateField('mail_address_line_1', v)} onBlur={blurSave('mail_address_line_1')} />
              </Field>
              <Field def={F.mail_address_line_2}>
                <TextInput value={entity.mail_address_line_2} onChange={v => updateField('mail_address_line_2', v)} onBlur={blurSave('mail_address_line_2')} />
              </Field>
            </Row>
            <Row cols={3}>
              <Field def={F.mail_city}>
                <TextInput value={entity.mail_city} onChange={v => updateField('mail_city', v)} onBlur={blurSave('mail_city')} />
              </Field>
              <Field def={F.mail_state}>
                <SelectInput value={entity.mail_state} onChange={v => saveField('mail_state', v)} options={US_STATES} />
              </Field>
              <Field def={F.mail_zip_code}>
                <TextInput value={entity.mail_zip_code} onChange={v => updateField('mail_zip_code', v)} onBlur={blurSave('mail_zip_code')} maxLength={10} />
              </Field>
            </Row>
          </div>
        </details>
      </Section>

      {/* 3. Contact */}
      <Section title="3. Contact">
        <Row cols={2}>
          <Field def={F.email}>
            <TextInput type="email" value={entity.email} onChange={v => updateField('email', v)} onBlur={blurSave('email')} />
          </Field>
          <Field def={F.website}>
            <TextInput value={entity.website} onChange={v => updateField('website', v)} onBlur={blurSave('website')} placeholder={F.website.placeholder} />
          </Field>
        </Row>
      </Section>

      {/* 4. Classification */}
      <Section title="4. Classification">
        <Row cols={2}>
          <Field def={F.department_type}>
            <SelectInput value={entity.department_type} onChange={v => saveField('department_type', v)} options={DEPT_TYPES} />
          </Field>
          <Field def={F.entity_type}>
            <SelectInput value={entity.entity_type} onChange={v => saveField('entity_type', v)} options={ENTITY_TYPES} />
          </Field>
        </Row>
        <Row cols={2}>
          <Field def={F.rms_software}>
            <TextInput value={entity.rms_software} onChange={v => updateField('rms_software', v)} onBlur={blurSave('rms_software')} />
          </Field>
          <Field def={F.continue_edu}>
            <CheckboxInput value={entity.continue_edu} onChange={v => saveField('continue_edu', v)} />
          </Field>
        </Row>
      </Section>

      {/* 5. Services */}
      <Section title="5. Services Provided">
        <Field def={F.fire_services}>
          <MultiCheckbox values={entity.fire_services || []} choices={FIRE_SERVICES} onChange={v => saveField('fire_services', v)} />
        </Field>
        <Field def={F.ems_services}>
          <MultiCheckbox values={entity.ems_services || []} choices={EMS_SERVICES} onChange={v => saveField('ems_services', v)} />
        </Field>
        <Field def={F.investigation_services}>
          <MultiCheckbox values={entity.investigation_services || []} choices={INVESTIGATION_SERVICES} onChange={v => saveField('investigation_services', v)} />
        </Field>
      </Section>

      {/* 6. Dispatch / PSAP */}
      <Section title="6. Dispatch / PSAP">
        <Row cols={2}>
          <Field def={F.dispatch_center_id}>
            <TextInput value={dispatch.center_id} onChange={v => updateJsonField('dispatch', 'center_id', v)} onBlur={blurSaveJson('dispatch', 'center_id')} placeholder={F.dispatch_center_id.placeholder} />
          </Field>
          <Field def={F.dispatch_cad_software}>
            <TextInput value={dispatch.cad_software} onChange={v => updateJsonField('dispatch', 'cad_software', v)} onBlur={blurSaveJson('dispatch', 'cad_software')} />
          </Field>
        </Row>
        <Row cols={2}>
          <Field def={F.dispatch_psap_type}>
            <SelectInput value={dispatch.psap_type} onChange={v => saveJsonField('dispatch', 'psap_type', v)} options={PSAP_TYPES} />
          </Field>
          <Field def={F.dispatch_psap_capability}>
            <SelectInput value={dispatch.psap_capability} onChange={v => saveJsonField('dispatch', 'psap_capability', v)} options={PSAP_CAPABILITIES} />
          </Field>
        </Row>
        <Row cols={2}>
          <Field def={F.dispatch_psap_discipline}>
            <SelectInput value={dispatch.psap_discipline} onChange={v => saveJsonField('dispatch', 'psap_discipline', v)} options={PSAP_DISCIPLINES} />
          </Field>
          <Field def={F.dispatch_psap_jurisdiction}>
            <SelectInput value={dispatch.psap_jurisdiction} onChange={v => saveJsonField('dispatch', 'psap_jurisdiction', v)} options={PSAP_JURISDICTIONS} />
          </Field>
        </Row>
        <Row cols={2}>
          <Field def={F.dispatch_protocol_fire}>
            <SelectInput value={dispatch.protocol_fire} onChange={v => saveJsonField('dispatch', 'protocol_fire', v)} options={DISPATCH_PROTOCOLS} />
          </Field>
          <Field def={F.dispatch_protocol_med}>
            <SelectInput value={dispatch.protocol_med} onChange={v => saveJsonField('dispatch', 'protocol_med', v)} options={DISPATCH_PROTOCOLS} />
          </Field>
        </Row>
        <Field def={F.dispatch_avl_usage}>
          <CheckboxInput value={dispatch.avl_usage} onChange={v => saveJsonField('dispatch', 'avl_usage', v)} />
        </Field>
      </Section>

      {/* 7. Staffing */}
      <Section title="7. Staffing">
        <p style={{ color: '#6b7280', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
          Active personnel only. Total is computed automatically by NERIS from the sum of the nine fields below — do not submit a total separately.
        </p>
        <Row cols={3}>
          {[
            ['active_firefighters_career_ft', 'staff_ff_career_ft'],
            ['active_firefighters_career_pt', 'staff_ff_career_pt'],
            ['active_firefighters_volunteer',  'staff_ff_volunteer'],
            ['active_ems_only_career_ft',      'staff_ems_career_ft'],
            ['active_ems_only_career_pt',      'staff_ems_career_pt'],
            ['active_ems_only_volunteer',      'staff_ems_volunteer'],
            ['active_civilians_career_ft',     'staff_civ_career_ft'],
            ['active_civilians_career_pt',     'staff_civ_career_pt'],
            ['active_civilians_volunteer',     'staff_civ_volunteer'],
          ].map(([apiKey, defKey]) => (
            <Field key={apiKey} def={F[defKey]}>
              <NumberInput
                value={staffing[apiKey]}
                onChange={v => updateJsonField('staffing', apiKey, v)}
                onBlur={blurSaveJson('staffing', apiKey)}
                min={0}
                width="100px"
              />
            </Field>
          ))}
        </Row>
      </Section>

      {/* 8. Assessment */}
      <Section title="8. Assessment">
        <Row cols={3}>
          <Field def={F.assessment_iso_rating}>
            <NumberInput
              value={assessment.iso_rating}
              onChange={v => updateJsonField('assessment', 'iso_rating', v)}
              onBlur={blurSaveJson('assessment', 'iso_rating')}
              min={1} max={10} width="80px"
            />
          </Field>
          <Field def={F.assessment_cpse}>
            <CheckboxInput value={assessment.cpse_accredited} onChange={v => saveJsonField('assessment', 'cpse_accredited', v)} />
          </Field>
          <Field def={F.assessment_caas}>
            <CheckboxInput value={assessment.caas_accredited} onChange={v => saveJsonField('assessment', 'caas_accredited', v)} />
          </Field>
        </Row>
      </Section>

      {/* Shift — shown only for career/combination */}
      {(entity.department_type === 'CAREER' || entity.department_type === 'COMBINATION') && (
        <Section title="Shift Schedule">
          <Row cols={3}>
            <Field def={F.shift_count}>
              <NumberInput value={shift.count} onChange={v => updateJsonField('shift', 'count', v)} onBlur={blurSaveJson('shift', 'count')} min={1} width="100px" />
            </Field>
            <Field def={F.shift_duration}>
              <NumberInput value={shift.duration} onChange={v => updateJsonField('shift', 'duration', v)} onBlur={blurSaveJson('shift', 'duration')} min={1} width="100px" />
            </Field>
            <Field def={F.shift_signup}>
              <NumberInput value={shift.signup} onChange={v => updateJsonField('shift', 'signup', v)} onBlur={blurSaveJson('shift', 'signup')} min={1} width="100px" />
            </Field>
          </Row>
        </Section>
      )}

      {/* 9. Stations & Units */}
      <Section title="9. Stations & Units" defaultOpen badge={`${stations.length} station${stations.length !== 1 ? 's' : ''}`}>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Each station must have at least one unit. <strong>CAD ID</strong> must exactly match the unit designator in the department's CAD system — this is how NERIS links dispatch data to entity units. NERIS ID is assigned automatically after the entity is submitted.
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

      {/* Validate + Submit + Sync */}
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

      <Field def={{ label: 'Client ID', hint: 'OAuth2 client ID from your NERIS vendor account.', required: true }}>
        <TextInput value={creds.client_id} onChange={v => setCreds(p => ({ ...p, client_id: v }))} onBlur={() => save('client_id', creds.client_id)} disabled={saving === 'client_id'} />
      </Field>
      <Field def={{ label: 'Client Secret', hint: 'OAuth2 client secret from your NERIS vendor account.', required: true }}>
        <TextInput type="password" value={creds.client_secret} onChange={v => setCreds(p => ({ ...p, client_secret: v }))} onBlur={() => save('client_secret', creds.client_secret)} disabled={saving === 'client_secret'} />
      </Field>
      <Field def={{ label: 'Environment', hint: 'Use Test/Sandbox during development and certification. Switch to Production only after receiving the NERIS compatibility badge.' }}>
        <SelectInput
          value={creds.environment}
          onChange={v => { setCreds(p => ({ ...p, environment: v })); save('environment', v); }}
          options={[{ value: 'test', label: 'Test / Sandbox' }, { value: 'production', label: 'Production' }]}
        />
      </Field>
      <Field def={{ label: 'Auto-Submit', hint: 'When enabled, incidents are submitted to NERIS automatically on completion. When disabled, submission is manual only.' }}>
        <SelectInput
          value={creds.submission_enabled ? 'true' : 'false'}
          onChange={v => { const b = v === 'true'; setCreds(p => ({ ...p, submission_enabled: b })); save('submission_enabled', v); }}
          options={[{ value: 'false', label: 'Disabled — manual submission only' }, { value: 'true', label: 'Enabled — auto-submit on completion' }]}
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
        {tabBtn('sync', '↓ Sync')}
        {tabBtn('credentials', '⚙️ Credentials')}
      </div>
      {subTab === 'entity'      && <EntityTab />}
      {subTab === 'sync'        && <SyncTab onApplied={() => setSubTab('entity')} />}
      {subTab === 'credentials' && <CredentialsTab />}
    </div>
  );
}
