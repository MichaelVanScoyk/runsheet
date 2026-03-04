/**
 * NerisEntityTab.jsx
 *
 * NERIS Entity Editor — replaces NerisSetupTab.jsx
 *
 * Sub-tabs:
 *   ⚙️ Credentials  — client_id, client_secret, environment (unchanged from old tab)
 *   🏛️ Entity       — department profile, stations, units
 *
 * Entity tab sections (collapsible):
 *   1. Identification    — fd_neris_id, fd_name, fd_id_legacy
 *   2. Address           — fd_address_*, coordinates
 *   3. Contact           — telephone, website
 *   4. Classification    — fd_type, fd_entity, population, ISO rating
 *   5. Services          — fire/ems/investigation services (multi-select)
 *   6. Dispatch / PSAP   — dispatch_center_id, CAD software, PSAP fields
 *   7. Staffing          — staff counts by type
 *   8. Stations & Units  — station cards, each with unit table
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';

const API_BASE = '';

// ─── tiny helpers ─────────────────────────────────────────────────────────────

const api = {
  get: (path) => fetch(`${API_BASE}${path}`).then(r => r.json()),
  put: (path, body) => fetch(`${API_BASE}${path}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()),
  post: (path, body) => fetch(`${API_BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()),
  del: (path) => fetch(`${API_BASE}${path}`, { method: 'DELETE' }).then(r => r.json()),
};

// NERIS enum options — sourced from NERIS spec
const FD_TYPES = [
  { value: 'volunteer',    label: 'All Volunteer' },
  { value: 'career',       label: 'All Career' },
  { value: 'combination',  label: 'Combination (Career + Volunteer)' },
  { value: 'paid_on_call', label: 'Paid On Call' },
];

const FD_ENTITIES = [
  { value: 'fire_department',             label: 'Fire Department' },
  { value: 'fire_district',               label: 'Fire District' },
  { value: 'fire_protection_district',    label: 'Fire Protection District' },
  { value: 'county_fire_department',      label: 'County Fire Department' },
  { value: 'municipal_fire_department',   label: 'Municipal Fire Department' },
  { value: 'volunteer_fire_company',      label: 'Volunteer Fire Company' },
  { value: 'other',                       label: 'Other' },
];

const FIRE_SERVICES = [
  'STRUCTURAL_FIREFIGHTING', 'WILDLAND_FIREFIGHTING', 'AIRCRAFT_FIREFIGHTING',
  'MARINE_FIREFIGHTING', 'VEHICLE_FIREFIGHTING', 'HAZMAT',
  'TECHNICAL_RESCUE', 'SWIFT_WATER_RESCUE', 'ICE_RESCUE',
  'HIGH_ANGLE_RESCUE', 'CONFINED_SPACE_RESCUE', 'TRENCH_RESCUE',
  'BRUSH_FIRE', 'OTHER_FIRE',
];

const EMS_SERVICES = [
  'BASIC_LIFE_SUPPORT', 'ADVANCED_LIFE_SUPPORT', 'CRITICAL_CARE_TRANSPORT',
  'MEDICAL_FIRST_RESPONSE', 'PATIENT_TRANSPORT', 'AIR_MEDICAL', 'OTHER_EMS',
];

const INVESTIGATION_SERVICES = [
  'FIRE_INVESTIGATION', 'ARSON_INVESTIGATION', 'CAUSE_AND_ORIGIN', 'OTHER_INVESTIGATION',
];

const UNIT_CAPABILITIES = [
  { value: 'engine',            label: 'Engine' },
  { value: 'ladder_truck',      label: 'Ladder / Aerial' },
  { value: 'quint',             label: 'Quint' },
  { value: 'rescue',            label: 'Rescue' },
  { value: 'tanker_tender',     label: 'Tanker / Tender' },
  { value: 'brush',             label: 'Brush' },
  { value: 'ambulance',         label: 'Ambulance' },
  { value: 'air_unit',          label: 'Air Unit' },
  { value: 'boat',              label: 'Boat' },
  { value: 'command',           label: 'Command' },
  { value: 'foam_unit',         label: 'Foam Unit' },
  { value: 'haz_mat',           label: 'HazMat' },
  { value: 'investigation',     label: 'Investigation' },
  { value: 'mass_casualty',     label: 'Mass Casualty' },
  { value: 'salvage',           label: 'Salvage' },
  { value: 'technical_rescue',  label: 'Technical Rescue' },
  { value: 'wildland',          label: 'Wildland' },
  { value: 'other',             label: 'Other' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

// ─── Field components ─────────────────────────────────────────────────────────

function Field({ label, hint, children, required }) {
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#555', marginBottom: '0.2rem' }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <small style={{ color: '#888', fontSize: '0.75rem' }}>{hint}</small>}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '0.45rem 0.6rem',
  border: '1px solid #ddd', borderRadius: 4,
  fontSize: '0.9rem', boxSizing: 'border-box',
  background: '#fff', color: '#222',
};

const selectStyle = { ...inputStyle };

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
      {options.map(opt => (
        typeof opt === 'string'
          ? <option key={opt} value={opt}>{opt}</option>
          : <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function MultiCheckbox({ values = [], options, onChange }) {
  const toggle = (val) => {
    const next = values.includes(val) ? values.filter(v => v !== val) : [...values, val];
    onChange(next);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem' }}>
      {options.map(opt => (
        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={values.includes(opt)} onChange={() => toggle(opt)} />
          {opt.replace(/_/g, ' ')}
        </label>
      ))}
    </div>
  );
}

function NumberInput({ value, onChange, onBlur, min, max, placeholder, disabled }) {
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
      style={{ ...inputStyle, width: '120px' }}
    />
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

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

// ─── Row helper ───────────────────────────────────────────────────────────────

function Row({ children, cols = 2 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '0.75rem' }}>
      {children}
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

  if (loading) return <div style={{ padding: '1rem', color: '#666' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 480 }}>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        API credentials for NERIS submission. Get these from your NERIS vendor account.
      </p>

      <Field label="Client ID" required>
        <TextInput
          value={creds.client_id}
          onChange={v => setCreds(p => ({ ...p, client_id: v }))}
          onBlur={() => save('client_id', creds.client_id)}
          disabled={saving === 'client_id'}
        />
      </Field>

      <Field label="Client Secret" required>
        <TextInput
          type="password"
          value={creds.client_secret}
          onChange={v => setCreds(p => ({ ...p, client_secret: v }))}
          onBlur={() => save('client_secret', creds.client_secret)}
          disabled={saving === 'client_secret'}
        />
      </Field>

      <Field label="Environment">
        <SelectInput
          value={creds.environment}
          onChange={v => { setCreds(p => ({ ...p, environment: v })); save('environment', v); }}
          options={[{ value: 'test', label: 'Test / Sandbox' }, { value: 'production', label: 'Production' }]}
        />
      </Field>

      <Field label="Auto-Submit Enabled">
        <SelectInput
          value={creds.submission_enabled ? 'true' : 'false'}
          onChange={v => { const b = v === 'true'; setCreds(p => ({ ...p, submission_enabled: b })); save('submission_enabled', v); }}
          options={[{ value: 'false', label: 'Disabled (manual only)' }, { value: 'true', label: 'Enabled' }]}
        />
      </Field>

      <div style={{ marginTop: '1.5rem', background: '#f0f9ff', borderRadius: 6, padding: '0.75rem 1rem', border: '1px solid #bae6fd', fontSize: '0.85rem', color: '#0c4a6e' }}>
        <strong>NERIS Vendor Account:</strong> VN22773762 &nbsp;|&nbsp;
        <strong>Test Dept:</strong> FD09190828 &nbsp;|&nbsp;
        Ticket: HLPDSK-25587
      </div>
    </div>
  );
}

// ─── Unit row inside a station ────────────────────────────────────────────────

function UnitRow({ unit, stationId, apparatusOptions, onSaved, onDeleted, confirmAction }) {
  const toast = useToast();
  const [data, setData] = useState({ ...unit });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (field, value) => {
    setData(p => ({ ...p, [field]: value }));
    setDirty(true);
  };

  // Auto-fill station_unit_id_1 when apparatus selected
  const selectApparatus = (appId) => {
    const app = apparatusOptions.find(a => a.id === Number(appId));
    setData(p => ({
      ...p,
      apparatus_id: appId ? Number(appId) : null,
      station_unit_id_1: app ? app.unit_designator : p.station_unit_id_1,
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
    const ok = await confirmAction(`Remove unit "${unit.station_unit_id_1 || 'unnamed'}"?`, { confirmText: 'Remove', danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/neris/units/${unit.id}`);
      toast.success('Unit removed');
      onDeleted();
    } catch {
      toast.error('Failed to remove unit');
    }
  };

  const tdStyle = { padding: '0.35rem 0.4rem', verticalAlign: 'middle' };

  return (
    <tr style={{ background: dirty ? '#fffbeb' : 'transparent' }}>
      <td style={tdStyle}>
        <select
          value={data.apparatus_id ?? ''}
          onChange={e => selectApparatus(e.target.value)}
          style={{ ...selectStyle, width: '120px', fontSize: '0.82rem' }}
        >
          <option value="">— none —</option>
          {apparatusOptions.map(a => (
            <option key={a.id} value={a.id}>{a.unit_designator} — {a.name}</option>
          ))}
        </select>
      </td>
      <td style={tdStyle}>
        <input
          type="text"
          value={data.station_unit_id_1 ?? ''}
          onChange={e => update('station_unit_id_1', e.target.value)}
          style={{ ...inputStyle, width: '90px', fontSize: '0.82rem', fontFamily: 'monospace' }}
          placeholder="E48"
        />
      </td>
      <td style={tdStyle}>
        <input
          type="text"
          value={data.station_unit_id_2 ?? ''}
          onChange={e => update('station_unit_id_2', e.target.value)}
          style={{ ...inputStyle, width: '90px', fontSize: '0.82rem', fontFamily: 'monospace' }}
          placeholder="optional"
        />
      </td>
      <td style={tdStyle}>
        <select
          value={data.station_unit_capability ?? ''}
          onChange={e => update('station_unit_capability', e.target.value || null)}
          style={{ ...selectStyle, width: '130px', fontSize: '0.82rem' }}
        >
          <option value="">— select —</option>
          {UNIT_CAPABILITIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </td>
      <td style={tdStyle}>
        <input
          type="number"
          value={data.station_unit_staffing ?? ''}
          onChange={e => update('station_unit_staffing', e.target.value === '' ? null : Number(e.target.value))}
          style={{ ...inputStyle, width: '60px', fontSize: '0.82rem' }}
          min={0}
        />
      </td>
      <td style={tdStyle}>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {dirty && (
            <button
              onClick={save}
              disabled={saving}
              style={{ padding: '0.25rem 0.6rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}
            >
              {saving ? '…' : 'Save'}
            </button>
          )}
          <button
            onClick={del}
            style={{ padding: '0.25rem 0.5rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Station card ─────────────────────────────────────────────────────────────

function StationCard({ station, entityId, apparatusOptions, onChanged, confirmAction }) {
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [data, setData] = useState({ ...station });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnit, setNewUnit] = useState({ station_unit_id_1: '', station_unit_capability: '', apparatus_id: null });

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
    const ok = await confirmAction(`Remove station "${station.station_name || station.station_id}"? All units will be removed.`, { confirmText: 'Remove', danger: true });
    if (!ok) return;
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
      station_unit_id_1: app ? app.unit_designator : p.station_unit_id_1,
    }));
  };

  const addUnit = async () => {
    try {
      await api.post(`/api/neris/stations/${station.id}/units`, newUnit);
      setNewUnit({ station_unit_id_1: '', station_unit_capability: '', apparatus_id: null });
      setAddingUnit(false);
      toast.success('Unit added');
      onChanged();
    } catch {
      toast.error('Failed to add unit');
    }
  };

  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: 6, marginBottom: '0.75rem', overflow: 'hidden' }}>
      {/* Station header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f1f5f9', borderBottom: open ? '1px solid #d1d5db' : 'none' }}>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#1e3a5f', fontSize: '0.9rem' }}>
          {open ? '▼' : '▶'} {data.station_name || data.station_id || `Station #${station.id}`}
          <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: '0.8rem' }}>
            ({station.units?.length ?? 0} units)
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
            <Field label="Station ID" hint="e.g. FD42029593S001" required>
              <TextInput value={data.station_id} onChange={v => update('station_id', v)} />
            </Field>
            <Field label="Station Name" hint="e.g. Station 48">
              <TextInput value={data.station_name} onChange={v => update('station_name', v)} />
            </Field>
          </Row>
          <Row cols={3}>
            <Field label="Address">
              <TextInput value={data.station_address_1} onChange={v => update('station_address_1', v)} />
            </Field>
            <Field label="City">
              <TextInput value={data.station_city} onChange={v => update('station_city', v)} />
            </Field>
            <Field label="State">
              <SelectInput value={data.station_state} onChange={v => update('station_state', v)} options={US_STATES} placeholder="—" />
            </Field>
          </Row>
          <Row cols={2}>
            <Field label="ZIP">
              <TextInput value={data.station_zip} onChange={v => update('station_zip', v)} maxLength={10} />
            </Field>
            <Field label="Min. Staffing">
              <NumberInput value={data.station_staffing} onChange={v => update('station_staffing', v)} min={0} />
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
                      {['Apparatus', 'CAD ID *', 'Alt ID', 'Capability', 'Staffing', ''].map(h => (
                        <th key={h} style={{ padding: '0.3rem 0.4rem', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {station.units?.map(unit => (
                      <UnitRow
                        key={unit.id}
                        unit={unit}
                        stationId={station.id}
                        apparatusOptions={apparatusOptions}
                        onSaved={onChanged}
                        onDeleted={onChanged}
                        confirmAction={confirmAction}
                      />
                    ))}

                    {/* Add unit row */}
                    {addingUnit && (
                      <tr style={{ background: '#f0fdf4' }}>
                        <td style={{ padding: '0.35rem 0.4rem' }}>
                          <select
                            value={newUnit.apparatus_id ?? ''}
                            onChange={e => selectNewApparatus(e.target.value)}
                            style={{ ...selectStyle, width: '120px', fontSize: '0.82rem' }}
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
                            value={newUnit.station_unit_id_1}
                            onChange={e => setNewUnit(p => ({ ...p, station_unit_id_1: e.target.value }))}
                            style={{ ...inputStyle, width: '90px', fontSize: '0.82rem', fontFamily: 'monospace' }}
                            placeholder="E48"
                            autoFocus
                          />
                        </td>
                        <td style={{ padding: '0.35rem 0.4rem' }}>—</td>
                        <td style={{ padding: '0.35rem 0.4rem' }}>
                          <select
                            value={newUnit.station_unit_capability ?? ''}
                            onChange={e => setNewUnit(p => ({ ...p, station_unit_capability: e.target.value || null }))}
                            style={{ ...selectStyle, width: '130px', fontSize: '0.82rem' }}
                          >
                            <option value="">— select —</option>
                            {UNIT_CAPABILITIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '0.35rem 0.4rem' }}>—</td>
                        <td style={{ padding: '0.35rem 0.4rem' }}>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button onClick={addUnit} style={{ padding: '0.25rem 0.6rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}>
                              Add
                            </button>
                            <button onClick={() => setAddingUnit(false)} style={{ padding: '0.25rem 0.5rem', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}>
                              Cancel
                            </button>
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
  const [entity, setEntity] = useState(null);
  const [stations, setStations] = useState([]);
  const [apparatusOptions, setApparatusOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/neris/entity');
      setEntity(data.entity || {});
      setStations(data.stations || []);
      setApparatusOptions(data.apparatus_options || []);
    } catch (e) {
      toast.error('Failed to load entity data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateField = (field, value) => {
    setEntity(p => ({ ...p, [field]: value }));
  };

  const saveField = async (field) => {
    if (!entity) return;
    setSaving(true);
    try {
      await api.put('/api/neris/entity', { [field]: entity[field] });
    } catch {
      toast.error(`Failed to save ${field}`);
    } finally {
      setSaving(false);
    }
  };

  const saveArrayField = async (field, value) => {
    updateField(field, value);
    setSaving(true);
    try {
      await api.put('/api/neris/entity', { [field]: value });
    } catch {
      toast.error(`Failed to save ${field}`);
    } finally {
      setSaving(false);
    }
  };

  const addStation = async () => {
    try {
      await api.post('/api/neris/stations', {
        station_id: '',
        station_name: 'New Station',
        station_state: entity?.fd_state || '',
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
      toast.error('Validation failed');
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

  // Simple confirm shim (reuse window.confirm since we don't have useConfirm imported)
  const confirmAction = (message, opts) => {
    return Promise.resolve(window.confirm(message));
  };

  const blurSave = (field) => () => saveField(field);

  if (loading) return <div style={{ padding: '1rem', color: '#666' }}>Loading entity data…</div>;

  return (
    <div style={{ maxWidth: 700 }}>

      {/* Validation result banner */}
      {validationResult && (
        <div style={{
          marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 6,
          background: validationResult.valid ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${validationResult.valid ? '#86efac' : '#fca5a5'}`,
        }}>
          {validationResult.valid
            ? <span style={{ color: '#15803d', fontWeight: 600 }}>✓ Entity is complete — ready to submit</span>
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

      {/* Section 1: Identification */}
      <Section title="1. Identification" defaultOpen>
        <Row cols={2}>
          <Field label="NERIS Department ID (fd_neris_id)" required hint="Assigned by NERIS — e.g. FD42029593">
            <TextInput value={entity?.fd_neris_id} onChange={v => updateField('fd_neris_id', v)} onBlur={blurSave('fd_neris_id')} />
          </Field>
          <Field label="Legacy ID (fd_id_legacy)" hint="NFIRS / state ID if applicable">
            <TextInput value={entity?.fd_id_legacy} onChange={v => updateField('fd_id_legacy', v)} onBlur={blurSave('fd_id_legacy')} />
          </Field>
        </Row>
        <Field label="Department Name (fd_name)" required>
          <TextInput value={entity?.fd_name} onChange={v => updateField('fd_name', v)} onBlur={blurSave('fd_name')} />
        </Field>
      </Section>

      {/* Section 2: Address */}
      <Section title="2. Address">
        <Row cols={2}>
          <Field label="Street Address" required>
            <TextInput value={entity?.fd_address_1} onChange={v => updateField('fd_address_1', v)} onBlur={blurSave('fd_address_1')} />
          </Field>
          <Field label="Suite / Building">
            <TextInput value={entity?.fd_address_2} onChange={v => updateField('fd_address_2', v)} onBlur={blurSave('fd_address_2')} />
          </Field>
        </Row>
        <Row cols={3}>
          <Field label="City" required>
            <TextInput value={entity?.fd_city} onChange={v => updateField('fd_city', v)} onBlur={blurSave('fd_city')} />
          </Field>
          <Field label="State" required>
            <SelectInput value={entity?.fd_state} onChange={v => { updateField('fd_state', v); saveField('fd_state'); }} options={US_STATES} placeholder="—" />
          </Field>
          <Field label="ZIP" required>
            <TextInput value={entity?.fd_zip} onChange={v => updateField('fd_zip', v)} onBlur={blurSave('fd_zip')} maxLength={10} />
          </Field>
        </Row>
      </Section>

      {/* Section 3: Contact */}
      <Section title="3. Contact">
        <Row cols={2}>
          <Field label="Phone">
            <TextInput value={entity?.fd_telephone} onChange={v => updateField('fd_telephone', v)} onBlur={blurSave('fd_telephone')} placeholder="555-555-5555" />
          </Field>
          <Field label="Website">
            <TextInput value={entity?.fd_website} onChange={v => updateField('fd_website', v)} onBlur={blurSave('fd_website')} placeholder="https://..." />
          </Field>
        </Row>
      </Section>

      {/* Section 4: Classification */}
      <Section title="4. Classification">
        <Row cols={2}>
          <Field label="Staffing Type (fd_type)">
            <SelectInput value={entity?.fd_type} onChange={v => { updateField('fd_type', v); saveField('fd_type'); }} options={FD_TYPES} placeholder="— select —" />
          </Field>
          <Field label="Authority Type (fd_entity)">
            <SelectInput value={entity?.fd_entity} onChange={v => { updateField('fd_entity', v); saveField('fd_entity'); }} options={FD_ENTITIES} placeholder="— select —" />
          </Field>
        </Row>
        <Row cols={3}>
          <Field label="Population Protected">
            <NumberInput value={entity?.fd_population_protected} onChange={v => updateField('fd_population_protected', v)} onBlur={blurSave('fd_population_protected')} min={0} />
          </Field>
          <Field label="ISO Rating">
            <NumberInput value={entity?.assess_iso_rating} onChange={v => updateField('assess_iso_rating', v)} onBlur={blurSave('assess_iso_rating')} min={1} max={10} />
          </Field>
        </Row>
      </Section>

      {/* Section 5: Services */}
      <Section title="5. Services Provided">
        <Field label="Fire Services">
          <MultiCheckbox
            values={entity?.fd_fire_services || []}
            options={FIRE_SERVICES}
            onChange={v => saveArrayField('fd_fire_services', v)}
          />
        </Field>
        <Field label="EMS Services" hint="(if applicable)">
          <MultiCheckbox
            values={entity?.fd_ems_services || []}
            options={EMS_SERVICES}
            onChange={v => saveArrayField('fd_ems_services', v)}
          />
        </Field>
        <Field label="Investigation Services" hint="(if applicable)">
          <MultiCheckbox
            values={entity?.fd_investigation_services || []}
            options={INVESTIGATION_SERVICES}
            onChange={v => saveArrayField('fd_investigation_services', v)}
          />
        </Field>
      </Section>

      {/* Section 6: Dispatch / PSAP */}
      <Section title="6. Dispatch / PSAP">
        <Row cols={2}>
          <Field label="PSAP Center ID (FCC)" hint="dispatch_center_id — e.g. PA1234567890">
            <TextInput value={entity?.dispatch_center_id} onChange={v => updateField('dispatch_center_id', v)} onBlur={blurSave('dispatch_center_id')} />
          </Field>
          <Field label="CAD Software">
            <TextInput value={entity?.dispatch_cad_software} onChange={v => updateField('dispatch_cad_software', v)} onBlur={blurSave('dispatch_cad_software')} placeholder="e.g. StationCAD" />
          </Field>
        </Row>
        <Row cols={2}>
          <Field label="RMS Software">
            <TextInput value={entity?.rms_software} onChange={v => updateField('rms_software', v)} onBlur={blurSave('rms_software')} />
          </Field>
          <Field label="AVL Usage">
            <SelectInput
              value={entity?.dispatch_avl_usage ? 'true' : 'false'}
              onChange={v => { updateField('dispatch_avl_usage', v === 'true'); saveField('dispatch_avl_usage'); }}
              options={[{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }]}
            />
          </Field>
        </Row>
        <Row cols={2}>
          <Field label="Fire Dispatch Protocol">
            <TextInput value={entity?.dispatch_protocol_fire} onChange={v => updateField('dispatch_protocol_fire', v)} onBlur={blurSave('dispatch_protocol_fire')} placeholder="e.g. IAED EFD" />
          </Field>
          <Field label="Medical Dispatch Protocol">
            <TextInput value={entity?.dispatch_protocol_medical} onChange={v => updateField('dispatch_protocol_medical', v)} onBlur={blurSave('dispatch_protocol_medical')} placeholder="e.g. IAED EMD" />
          </Field>
        </Row>
      </Section>

      {/* Section 7: Staffing */}
      <Section title="7. Staffing">
        <Row cols={3}>
          <Field label="Total Personnel">
            <NumberInput value={entity?.staff_total} onChange={v => updateField('staff_total', v)} onBlur={blurSave('staff_total')} min={0} />
          </Field>
          <Field label="FF Volunteer">
            <NumberInput value={entity?.staff_active_ff_volunteer} onChange={v => updateField('staff_active_ff_volunteer', v)} onBlur={blurSave('staff_active_ff_volunteer')} min={0} />
          </Field>
          <Field label="FF Career FT">
            <NumberInput value={entity?.staff_active_ff_career_ft} onChange={v => updateField('staff_active_ff_career_ft', v)} onBlur={blurSave('staff_active_ff_career_ft')} min={0} />
          </Field>
          <Field label="FF Career PT">
            <NumberInput value={entity?.staff_active_ff_career_pt} onChange={v => updateField('staff_active_ff_career_pt', v)} onBlur={blurSave('staff_active_ff_career_pt')} min={0} />
          </Field>
          <Field label="EMS Only Volunteer">
            <NumberInput value={entity?.staff_active_ems_only_volunteer} onChange={v => updateField('staff_active_ems_only_volunteer', v)} onBlur={blurSave('staff_active_ems_only_volunteer')} min={0} />
          </Field>
          <Field label="EMS Only Career FT">
            <NumberInput value={entity?.staff_active_ems_only_career_ft} onChange={v => updateField('staff_active_ems_only_career_ft', v)} onBlur={blurSave('staff_active_ems_only_career_ft')} min={0} />
          </Field>
          <Field label="Civilians Career FT">
            <NumberInput value={entity?.staff_active_civilians_career_ft} onChange={v => updateField('staff_active_civilians_career_ft', v)} onBlur={blurSave('staff_active_civilians_career_ft')} min={0} />
          </Field>
          <Field label="Civilians Volunteer">
            <NumberInput value={entity?.staff_active_civilians_volunteer} onChange={v => updateField('staff_active_civilians_volunteer', v)} onBlur={blurSave('staff_active_civilians_volunteer')} min={0} />
          </Field>
        </Row>
      </Section>

      {/* Section 8: Stations & Units */}
      <Section title="8. Stations & Units" defaultOpen badge={`${stations.length} station${stations.length !== 1 ? 's' : ''}`}>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Each station must have at least one unit. The <strong>CAD ID</strong> must exactly match the unit designator in your CAD system.
        </p>

        {stations.map(station => (
          <StationCard
            key={station.id}
            station={station}
            entityId={entity?.id}
            apparatusOptions={apparatusOptions}
            onChanged={load}
            confirmAction={confirmAction}
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
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
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
        {entity?.neris_entity_status && (
          <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: entity.neris_entity_status === 'submitted' ? '#15803d' : '#6b7280' }}>
            Status: {entity.neris_entity_status}
            {entity.neris_entity_submitted_at && ` · ${new Date(entity.neris_entity_submitted_at).toLocaleDateString()}`}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NerisEntityTab() {
  const [subTab, setSubTab] = useState('entity');

  const tabBtn = (key, label) => (
    <button
      key={key}
      onClick={() => setSubTab(key)}
      style={{
        padding: '0.4rem 1rem',
        border: 'none', borderBottom: subTab === key ? '2px solid #1d4ed8' : '2px solid transparent',
        background: 'none', cursor: 'pointer',
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
      {subTab === 'entity' && <EntityTab />}
      {subTab === 'credentials' && <CredentialsTab />}
    </div>
  );
}
