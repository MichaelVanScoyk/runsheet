/**
 * NerisSetupTab
 *
 * Admin tab for NERIS configuration: credentials, department identity,
 * station registration, and unit NERIS IDs.
 *
 * Sub-tab shell is intentional — NERIS Codes tab will nest here later.
 */

import { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';

const API_BASE = '';

const SECTION = {
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '1.25rem 1.5rem',
  marginBottom: '1.25rem',
};

const SECTION_TITLE = {
  fontSize: '0.8rem',
  fontWeight: '600',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#6b7280',
  marginBottom: '1rem',
};

const FIELD = { marginBottom: '0.875rem' };

const LABEL = {
  display: 'block',
  fontSize: '0.85rem',
  fontWeight: '500',
  color: '#374151',
  marginBottom: '0.3rem',
};

const HINT = {
  fontSize: '0.75rem',
  color: '#9ca3af',
  marginTop: '0.2rem',
};

const INPUT = {
  width: '100%',
  padding: '0.45rem 0.6rem',
  border: '1px solid #d1d5db',
  borderRadius: '5px',
  fontSize: '0.875rem',
  background: '#fff',
  color: '#111',
  boxSizing: 'border-box',
};

const BTN_DISABLED = {
  padding: '0.45rem 1.1rem',
  background: '#d1d5db',
  color: '#9ca3af',
  border: 'none',
  borderRadius: '5px',
  fontSize: '0.85rem',
  fontWeight: '500',
  cursor: 'not-allowed',
};

function DisabledButton({ label, tooltip }) {
  const [show, setShow] = useState(false);
  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <button style={BTN_DISABLED} disabled>{label}</button>
      {show && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%',
          transform: 'translateX(-50%)',
          background: '#1f2937', color: '#fff', fontSize: '0.75rem',
          padding: '0.4rem 0.65rem', borderRadius: '4px',
          whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none',
        }}>
          {tooltip}
          <div style={{
            position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            borderWidth: '5px', borderStyle: 'solid',
            borderColor: '#1f2937 transparent transparent transparent',
          }} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SETUP TAB
// ============================================================================

function SetupTab() {
  const toast = useToast();
  const [settings, setSettings] = useState({});
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [unitSaving, setUnitSaving] = useState(null);
  const [unitEdits, setUnitEdits] = useState({});

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [settingsRes, unitsRes] = await Promise.all([
        fetch(`${API_BASE}/api/settings`),
        fetch(`${API_BASE}/api/apparatus?active_only=false&category=APPARATUS`),
      ]);
      const settingsData = await settingsRes.json();
      const unitsData = await unitsRes.json();

      const nerisRows = settingsData?.neris || [];
      const map = {};
      nerisRows.forEach(r => { map[r.key] = r.raw_value || ''; });
      setSettings(map);
      setUnits(Array.isArray(unitsData) ? unitsData : []);
    } catch (err) {
      console.error('Failed to load NERIS setup data', err);
      toast.error('Failed to load NERIS settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSetting = async (key, value) => {
    setSaving(key);
    try {
      const res = await fetch(`${API_BASE}/api/settings/neris/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch {
      toast.error(`Failed to save ${key}`);
    } finally {
      setSaving(null);
    }
  };

  const saveUnitNerisId = async (unitId, value) => {
    setUnitSaving(unitId);
    try {
      const res = await fetch(`${API_BASE}/api/apparatus/${unitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neris_unit_id: value || null }),
      });
      if (!res.ok) throw new Error('Save failed');
      setUnits(prev => prev.map(u =>
        u.id === unitId ? { ...u, neris_unit_id: value || null } : u
      ));
      setUnitEdits(prev => { const n = { ...prev }; delete n[unitId]; return n; });
      toast.success('Unit ID saved');
    } catch {
      toast.error('Failed to save unit NERIS ID');
    } finally {
      setUnitSaving(null);
    }
  };

  const field = (key, label, hint, opts = {}) => {
    const { secret = false, placeholder = '' } = opts;
    const val = settings[key] ?? '';
    return (
      <div style={FIELD} key={key}>
        <label style={LABEL}>{label}</label>
        <input
          type={secret ? 'password' : 'text'}
          style={INPUT}
          defaultValue={val}
          placeholder={placeholder}
          disabled={saving === key}
          onBlur={(e) => { if (e.target.value !== val) saveSetting(key, e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        />
        {hint && <div style={HINT}>{hint}</div>}
      </div>
    );
  };

  const toggle = (key, label, hint) => {
    const val = settings[key] === 'true';
    return (
      <div style={{ ...FIELD, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} key={key}>
        <div>
          <div style={LABEL}>{label}</div>
          {hint && <div style={HINT}>{hint}</div>}
        </div>
        <button
          onClick={() => saveSetting(key, val ? 'false' : 'true')}
          disabled={saving === key}
          style={{
            padding: '0.35rem 0.9rem',
            border: 'none', borderRadius: '4px',
            fontWeight: '600', fontSize: '0.8rem',
            cursor: saving === key ? 'wait' : 'pointer',
            background: val ? '#22c55e' : '#e5e7eb',
            color: val ? '#fff' : '#6b7280',
            minWidth: '52px',
          }}
        >
          {saving === key ? '…' : val ? 'ON' : 'OFF'}
        </button>
      </div>
    );
  };

  if (loading) return <div style={{ padding: '2rem', color: '#6b7280' }}>Loading…</div>;

  const envVal = settings['environment'] || 'test';

  return (
    <div style={{ maxWidth: '640px' }}>

      {/* Credentials */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Credentials</div>

        <div style={FIELD}>
          <label style={LABEL}>Environment</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['test', 'production'].map(env => (
              <button
                key={env}
                onClick={() => saveSetting('environment', env)}
                style={{
                  padding: '0.4rem 1rem',
                  border: `2px solid ${envVal === env
                    ? (env === 'production' ? '#dc2626' : '#2563eb')
                    : '#d1d5db'}`,
                  borderRadius: '5px',
                  background: envVal === env
                    ? (env === 'production' ? '#fef2f2' : '#eff6ff')
                    : '#fff',
                  color: envVal === env
                    ? (env === 'production' ? '#dc2626' : '#2563eb')
                    : '#6b7280',
                  fontWeight: envVal === env ? '600' : '400',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                {env === 'production' ? '⚠ Production' : '🧪 Test (Sandbox)'}
              </button>
            ))}
          </div>
          <div style={HINT}>
            {envVal === 'production'
              ? 'Submissions will be sent to the live NERIS system.'
              : 'Submissions go to the NERIS sandbox — safe for testing.'}
          </div>
        </div>

        {field('client_id', 'OAuth2 Client ID',
          'UUID issued by NERIS during vendor account setup.',
          { placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' })}
        {field('client_secret', 'OAuth2 Client Secret',
          'Keep this secret — never share or commit to git.',
          { secret: true, placeholder: '••••••••' })}
        {toggle('submission_enabled', 'Submission Enabled',
          'Master switch — must be ON to submit incidents to NERIS.')}
      </div>

      {/* Department */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Department</div>
        {field('fd_name', 'Department Name',
          'Official name as it appears in NERIS reports.',
          { placeholder: 'Glen Moore Fire Company' })}
        {field('department_neris_id', 'Department NERIS ID',
          'Assigned by NERIS (e.g. FD09190828). Required for all submissions.',
          { placeholder: 'FD09190828' })}
        {toggle('auto_generate_neris_id', 'Auto-generate Incident NERIS IDs',
          'Auto-assign NERIS IDs to new incidents on creation.')}
      </div>

      {/* Station Registration */}
      <div style={SECTION}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ ...SECTION_TITLE, marginBottom: 0 }}>Station Registration</div>
          <DisabledButton
            label="Register Station with NERIS"
            tooltip="Entity service not yet built — coming soon"
          />
        </div>

        {field('station_neris_id', 'Station NERIS ID',
          'Assigned by NERIS after registration (e.g. FD09190828S001). Leave blank until registered.',
          { placeholder: 'FD09190828S001' })}
        {field('station_name', 'Station Name',
          'Name as it will appear in NERIS.',
          { placeholder: 'Station 48' })}
        {field('station_address_line1', 'Street Address', '', { placeholder: '1443 Cornog Road' })}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ flex: 2 }}>{field('station_city', 'City', '', { placeholder: 'Glenmoore' })}</div>
          <div style={{ flex: 1 }}>{field('station_state', 'State', '', { placeholder: 'PA' })}</div>
          <div style={{ flex: 1 }}>{field('station_zip', 'ZIP', '', { placeholder: '19343' })}</div>
        </div>
      </div>

      {/* Units */}
      <div style={SECTION}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ ...SECTION_TITLE, marginBottom: 0 }}>Units</div>
          <DisabledButton
            label="Register Units with NERIS"
            tooltip="Entity service not yet built — coming soon"
          />
        </div>

        <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.875rem', marginTop: 0 }}>
          NERIS Unit IDs are assigned after entity registration. Enter them here once known.
          Only APPARATUS-category units are included in NERIS reporting.
        </p>

        {units.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>No apparatus units found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: '#6b7280', fontWeight: '600', width: '100px' }}>Unit</th>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: '#6b7280', fontWeight: '600' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: '#6b7280', fontWeight: '600', width: '160px' }}>NERIS Type</th>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: '#6b7280', fontWeight: '600', width: '210px' }}>NERIS Unit ID</th>
                <th style={{ width: '60px' }} />
              </tr>
            </thead>
            <tbody>
              {units.map(u => {
                const editVal = unitEdits[u.id];
                const currentVal = u.neris_unit_id || '';
                const displayVal = editVal !== undefined ? editVal : currentVal;
                const isDirty = editVal !== undefined && editVal !== currentVal;
                const isSavingThis = unitSaving === u.id;

                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.5rem', fontWeight: '600', color: '#111' }}>
                      {u.unit_designator}
                      {!u.active && (
                        <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '0.75rem' }}> (inactive)</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem', color: '#374151' }}>{u.name}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {u.neris_unit_type
                        ? <code style={{ fontSize: '0.75rem', background: '#f3f4f6', padding: '1px 5px', borderRadius: '3px' }}>{u.neris_unit_type}</code>
                        : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input
                        type="text"
                        value={displayVal}
                        placeholder="e.g. FD09190828S001U001"
                        onChange={e => setUnitEdits(prev => ({ ...prev, [u.id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.target.blur();
                          if (e.key === 'Escape') {
                            setUnitEdits(prev => { const n = { ...prev }; delete n[u.id]; return n; });
                          }
                        }}
                        onBlur={e => {
                          if (isDirty) saveUnitNerisId(u.id, e.target.value);
                          else setUnitEdits(prev => { const n = { ...prev }; delete n[u.id]; return n; });
                        }}
                        disabled={isSavingThis}
                        style={{
                          ...INPUT,
                          borderColor: isDirty ? '#f59e0b' : '#d1d5db',
                          fontSize: '0.8rem',
                          padding: '0.3rem 0.5rem',
                        }}
                      />
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      {isSavingThis
                        ? <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>…</span>
                        : isDirty
                          ? <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>unsaved</span>
                          : u.neris_unit_id
                            ? <span style={{ color: '#22c55e', fontSize: '0.75rem' }}>✓</span>
                            : <span style={{ color: '#d1d5db', fontSize: '0.75rem' }}>—</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


// ============================================================================
// SHELL — sub-tab bar ready for Codes to nest in later
// ============================================================================

export default function NerisSetupTab() {
  const [subTab, setSubTab] = useState('setup');

  const tabBtn = (key, label) => (
    <button
      key={key}
      onClick={() => setSubTab(key)}
      style={{
        padding: '0.4rem 1rem',
        border: 'none',
        borderBottom: subTab === key ? '2px solid #2563eb' : '2px solid transparent',
        background: 'none',
        color: subTab === key ? '#2563eb' : '#6b7280',
        fontWeight: subTab === key ? '600' : '400',
        fontSize: '0.875rem',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '1.25rem', gap: '0.25rem' }}>
        {tabBtn('setup', '⚙️ Setup')}
        {/* Future: {tabBtn('codes', '📋 Codes')} */}
      </div>
      {subTab === 'setup' && <SetupTab />}
    </div>
  );
}
