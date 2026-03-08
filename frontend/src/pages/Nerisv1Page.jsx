import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBranding } from '../contexts/BrandingContext';

const API = '/api/nerisv1';

// Section definitions — matches the 23 NERIS IncidentPayload modules
const SECTIONS = [
  { num: 1, key: 'base', label: 'Base', required: true },
  { num: 2, key: 'incident_types', label: 'Incident Types', required: true },
  { num: 3, key: 'dispatch', label: 'Dispatch', required: true },
  { num: 4, key: 'special_modifiers', label: 'Special Modifiers' },
  { num: 5, key: 'aids', label: 'Mutual Aid' },
  { num: 6, key: 'nonfd_aids', label: 'Non-FD Aids' },
  { num: 7, key: 'actions_tactics', label: 'Actions/Tactics' },
  { num: 8, key: 'tactic_timestamps', label: 'Timestamps' },
  { num: 9, key: 'unit_responses', label: 'Unit Responses' },
  { num: 10, key: 'exposures', label: 'Exposures' },
  { num: 11, key: 'casualty_rescues', label: 'Casualties/Rescues' },
  { num: 12, key: 'fire_detail', label: 'Fire Detail' },
  { num: 13, key: 'hazsit_detail', label: 'HazSit Detail' },
  { num: 14, key: 'medical_details', label: 'Medical' },
  { num: 15, key: 'smoke_alarm', label: 'Smoke Alarm' },
  { num: 16, key: 'fire_alarm', label: 'Fire Alarm' },
  { num: 17, key: 'other_alarm', label: 'Other Alarm' },
  { num: 18, key: 'fire_suppression', label: 'Fire Suppression' },
  { num: 19, key: 'cooking_fire_suppression', label: 'Cooking Suppression' },
  { num: 20, key: 'electric_hazards', label: 'Electric Hazards' },
  { num: 21, key: 'powergen_hazards', label: 'Powergen Hazards' },
  { num: 22, key: 'csst_hazard', label: 'CSST Hazard' },
  { num: 23, key: 'medical_oxygen_hazard', label: 'Medical O₂' },
];

export default function Nerisv1Page() {
  const { id } = useParams();
  const navigate = useNavigate();
  const branding = useBranding();
  const incidentId = parseInt(id);

  const [nerisData, setNerisData] = useState({});
  const [metadata, setMetadata] = useState({ mapped: [], empty: [], errors: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [validateResult, setValidateResult] = useState(null);
  const [showPayload, setShowPayload] = useState(false);

  // Load NERIS data for this incident
  useEffect(() => {
    loadData();
  }, [incidentId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/incident/${incidentId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to load');
      }
      const data = await res.json();
      setNerisData(data.neris_data || {});
      setMetadata({ mapped: data.mapped || [], empty: data.empty || [], errors: data.errors || [] });
      setDirty(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Update a field value in the local state
  const updateField = useCallback((path, value) => {
    setNerisData(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in obj) || typeof obj[keys[i]] !== 'object') {
          obj[keys[i]] = {};
        }
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
    setDirty(true);
  }, []);

  // Get a field value from the nested data
  const getField = useCallback((path) => {
    const keys = path.split('.');
    let obj = nerisData;
    for (const key of keys) {
      if (obj == null || typeof obj !== 'object') return undefined;
      obj = obj[key];
    }
    return obj;
  }, [nerisData]);

  // Save — flatten dirty fields and send to backend
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Flatten nested data to {path: value} pairs
      const flat = {};
      const flatten = (obj, prefix) => {
        for (const [key, val] of Object.entries(obj)) {
          const path = prefix ? prefix + '.' + key : key;
          if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            flatten(val, path);
          } else {
            flat[path] = val;
          }
        }
      };
      flatten(nerisData, '');

      const res = await fetch(`${API}/incident/${incidentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: flat }),
      });
      if (!res.ok) throw new Error('Save failed');
      setDirty(false);
      // Reload to get fresh state
      await loadData();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Validate against NERIS API
  const handleValidate = async () => {
    setValidateResult(null);
    try {
      const res = await fetch(`${API}/incident/${incidentId}/validate`, { method: 'POST' });
      const data = await res.json();
      setValidateResult(data);
    } catch (e) {
      setValidateResult({ valid: false, api_error: e.message });
    }
  };

  const section = SECTIONS[activeSection];

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Loading NERIS data for incident #{incidentId}...</div>;
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '2px solid #e5e7eb' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#6b7280' }}>← Incidents</button>
            <span style={{ color: '#d1d5db' }}>|</span>
            <button onClick={() => {
              navigate('/');
              setTimeout(() => window.dispatchEvent(new CustomEvent('open-incident', { detail: { id: incidentId } })), 100);
            }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#2563eb', fontWeight: 500 }}>📝 Run Sheet</button>
            <h1 style={{ margin: 0, fontSize: '1.2rem', color: '#111' }}>NERISv1 — Incident #{incidentId}</h1>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.25rem', marginLeft: '2rem' }}>
            {metadata.mapped.length} mapped · {metadata.empty.length} empty · {metadata.errors.length} errors
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setShowPayload(!showPayload)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', background: showPayload ? '#f3f4f6' : '#fff' }}>
            {showPayload ? 'Hide JSON' : 'View JSON'}
          </button>
          <button onClick={handleValidate} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
            Validate
          </button>
          <button onClick={handleSave} disabled={!dirty || saving} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', border: 'none', borderRadius: 4, cursor: dirty ? 'pointer' : 'default', background: dirty ? (branding.primaryColor || '#c41e3a') : '#ccc', color: '#fff', fontWeight: 600 }}>
            {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '0.5rem 0.75rem', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, color: '#991b1b', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</div>}

      {/* Validation result */}
      {validateResult && (
        <div style={{ padding: '0.5rem 0.75rem', background: validateResult.valid ? '#f0fdf4' : '#fef2f2', border: '1px solid ' + (validateResult.valid ? '#86efac' : '#fca5a5'), borderRadius: 4, fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          {validateResult.valid ? '✅ Payload is valid' : '❌ Validation failed'}
          {validateResult.build_error && <div style={{ marginTop: '0.25rem', color: '#991b1b' }}>Build error: {validateResult.build_error}</div>}
          {validateResult.api_error && <div style={{ marginTop: '0.25rem', color: '#991b1b' }}>API error: {validateResult.api_error}</div>}
          {validateResult.response && typeof validateResult.response === 'object' && (
            <pre style={{ marginTop: '0.5rem', fontSize: '0.7rem', maxHeight: 200, overflow: 'auto', background: '#fff', padding: '0.5rem', borderRadius: 4 }}>
              {JSON.stringify(validateResult.response, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 2, overflowX: 'auto', borderBottom: '1px solid #e2e4e9', marginBottom: '1rem', paddingBottom: 0 }}>
        {SECTIONS.map((sec, i) => {
          const sectionData = nerisData[sec.key];
          const hasData = sectionData !== undefined && sectionData !== null && (typeof sectionData !== 'object' || Object.keys(sectionData).length > 0);
          return (
            <div key={sec.num} onClick={() => setActiveSection(i)} style={{
              padding: '0.4rem 0.65rem', fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap',
              fontWeight: activeSection === i ? 700 : 500,
              color: activeSection === i ? (branding.primaryColor || '#c41e3a') : hasData ? '#166534' : '#888',
              borderBottom: activeSection === i ? '2px solid ' + (branding.primaryColor || '#c41e3a') : '2px solid transparent',
              background: activeSection === i ? '#fef2f2' : 'transparent',
            }}>
              {sec.label}
              {sec.required && <span style={{ color: '#c41e3a', marginLeft: 2 }}>*</span>}
              {hasData && !sec.required && <span style={{ color: '#16a34a', marginLeft: 3, fontSize: '0.6rem' }}>●</span>}
            </div>
          );
        })}
      </div>

      {/* Content area */}
      <div style={{ display: 'flex', gap: '1rem' }}>
        {/* Form panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionForm
            section={section}
            nerisData={nerisData}
            getField={getField}
            updateField={updateField}
          />
        </div>

        {/* JSON preview panel */}
        {showPayload && (
          <div style={{ width: 400, flexShrink: 0, background: '#1e1e2e', borderRadius: 6, padding: '0.75rem', maxHeight: '70vh', overflow: 'auto' }}>
            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.5rem', fontWeight: 600 }}>
              {section.key} payload
            </div>
            <pre style={{ fontSize: '0.68rem', color: '#a6e3a1', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}>
              {JSON.stringify(nerisData[section.key] || {}, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Generic section form — renders fields based on section data
// ============================================================================

function SectionForm({ section, nerisData, getField, updateField }) {
  const sectionData = nerisData[section.key];

  if (section.key === 'base') return <BaseForm data={sectionData || {}} getField={getField} updateField={updateField} />;
  if (section.key === 'dispatch') return <DispatchForm data={sectionData || {}} getField={getField} updateField={updateField} />;
  if (section.key === 'tactic_timestamps') return <TacticTimestampsForm data={sectionData || {}} getField={getField} updateField={updateField} />;
  if (section.key === 'incident_types') return <GenericJsonForm sectionKey={section.key} data={sectionData} getField={getField} updateField={updateField} />;

  // For sections not yet built out — show raw JSON editor
  return <GenericJsonForm sectionKey={section.key} data={sectionData} getField={getField} updateField={updateField} />;
}

// ============================================================================
// Field components
// ============================================================================

const fieldStyle = { marginBottom: '0.6rem' };
const labelStyle = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#555', marginBottom: '0.2rem' };
const inputStyle = { width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.82rem', border: '1px solid #ddd', borderRadius: 4, boxSizing: 'border-box', fontFamily: 'inherit' };
const textareaStyle = { ...inputStyle, minHeight: 60, resize: 'vertical' };
const hintStyle = { fontSize: '0.65rem', color: '#aaa', marginTop: '0.15rem' };

function TextField({ label, path, getField, updateField, hint, required }) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label} {required && <span style={{ color: '#c41e3a' }}>*</span>}</label>
      <input style={inputStyle} value={getField(path) || ''} onChange={e => updateField(path, e.target.value || null)} />
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  );
}

function TextArea({ label, path, getField, updateField, hint }) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      <textarea style={textareaStyle} value={getField(path) || ''} onChange={e => updateField(path, e.target.value || null)} />
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  );
}

function NumberField({ label, path, getField, updateField, hint }) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      <input type="number" style={inputStyle} value={getField(path) ?? ''} onChange={e => updateField(path, e.target.value ? parseInt(e.target.value) : null)} />
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  );
}

function BoolField({ label, path, getField, updateField }) {
  const val = getField(path);
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {[true, false, null].map(v => (
          <button key={String(v)} type="button" onClick={() => updateField(path, v)} style={{
            padding: '0.3rem 0.7rem', fontSize: '0.75rem', borderRadius: 4, cursor: 'pointer',
            border: val === v ? '2px solid #2563eb' : '1px solid #ddd',
            background: val === v ? '#eff6ff' : '#fff', fontWeight: val === v ? 600 : 400,
          }}>
            {v === true ? 'Yes' : v === false ? 'No' : 'N/A'}
          </button>
        ))}
      </div>
    </div>
  );
}

function DateTimeField({ label, path, getField, updateField, hint }) {
  const val = getField(path) || '';
  // Show as local datetime-local input, store as ISO string
  const displayVal = val ? val.replace('Z', '').replace('T', 'T') : '';
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      <input type="datetime-local" style={inputStyle} value={displayVal.slice(0, 16)} onChange={e => {
        updateField(path, e.target.value ? e.target.value + ':00Z' : null);
      }} />
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  );
}

// ============================================================================
// Section forms
// ============================================================================

function BaseForm({ data, getField, updateField }) {
  return (
    <div>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: '#333' }}>Base (IncidentBasePayload)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
        <TextField label="Department NERIS ID" path="base.department_neris_id" getField={getField} updateField={updateField} required hint="FD/FM + 8 digits" />
        <TextField label="Incident Number" path="base.incident_number" getField={getField} updateField={updateField} required />
      </div>
      <BoolField label="People Present" path="base.people_present" getField={getField} updateField={updateField} />
      <NumberField label="Animals Rescued" path="base.animals_rescued" getField={getField} updateField={updateField} />
      <TextArea label="Impediment Narrative" path="base.impediment_narrative" getField={getField} updateField={updateField} hint="Obstacles that impacted the incident" />
      <TextArea label="Outcome Narrative" path="base.outcome_narrative" getField={getField} updateField={updateField} hint="Final disposition description" />
      <NumberField label="Displacement Count" path="base.displacement_count" getField={getField} updateField={updateField} />
      <div style={fieldStyle}>
        <label style={labelStyle}>Location (LocationPayload)</label>
        <div style={{ padding: '0.5rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: '0.75rem', color: '#888' }}>
          40-field NG911 address — expand to edit individual fields
          <pre style={{ fontSize: '0.65rem', color: '#666', marginTop: '0.25rem', maxHeight: 100, overflow: 'auto' }}>
            {JSON.stringify(getField('base.location') || {}, null, 2)}
          </pre>
        </div>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Point (GeoPoint)</label>
        <div style={{ padding: '0.5rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: '0.75rem', color: '#666' }}>
          {getField('base.point') ? JSON.stringify(getField('base.point')) : 'Not set — will be populated from lat/lng mapping'}
        </div>
      </div>
    </div>
  );
}

function DispatchForm({ data, getField, updateField }) {
  return (
    <div>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: '#333' }}>Dispatch (DispatchPayload)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
        <TextField label="Incident Number" path="dispatch.incident_number" getField={getField} updateField={updateField} required />
        <TextField label="Center ID" path="dispatch.center_id" getField={getField} updateField={updateField} hint="PSAP center identifier" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 1rem' }}>
        <DateTimeField label="Call Arrival" path="dispatch.call_arrival" getField={getField} updateField={updateField} required />
        <DateTimeField label="Call Answered" path="dispatch.call_answered" getField={getField} updateField={updateField} required />
        <DateTimeField label="Call Create (Dispatch)" path="dispatch.call_create" getField={getField} updateField={updateField} required />
      </div>
      <DateTimeField label="Incident Clear" path="dispatch.incident_clear" getField={getField} updateField={updateField} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
        <TextField label="Determinant Code" path="dispatch.determinant_code" getField={getField} updateField={updateField} hint="EMD/EFD code, max 8 chars" />
        <TextField label="Incident Code" path="dispatch.incident_code" getField={getField} updateField={updateField} />
      </div>
      <TextField label="Disposition" path="dispatch.disposition" getField={getField} updateField={updateField} />
      <BoolField label="Automatic Alarm" path="dispatch.automatic_alarm" getField={getField} updateField={updateField} />
      <div style={fieldStyle}>
        <label style={labelStyle}>Unit Responses</label>
        <div style={{ padding: '0.5rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: '0.75rem', color: '#888' }}>
          {Array.isArray(getField('dispatch.unit_responses')) ? getField('dispatch.unit_responses').length + ' units' : 'No unit data — populated from incident_units table via mapping'}
        </div>
      </div>
    </div>
  );
}

function TacticTimestampsForm({ data, getField, updateField }) {
  const fields = [
    ['command_established', 'Command Established'],
    ['completed_sizeup', 'Size-Up Completed'],
    ['suppression_complete', 'Suppression Complete'],
    ['primary_search_begin', 'Primary Search Begin'],
    ['primary_search_complete', 'Primary Search Complete'],
    ['water_on_fire', 'Water on Fire'],
    ['fire_under_control', 'Fire Under Control'],
    ['fire_knocked_down', 'Fire Knocked Down'],
    ['extrication_complete', 'Extrication Complete'],
  ];

  return (
    <div>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: '#333' }}>Tactic Timestamps</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 1rem' }}>
        {fields.map(([key, label]) => (
          <DateTimeField key={key} label={label} path={'tactic_timestamps.' + key} getField={getField} updateField={updateField} />
        ))}
      </div>
    </div>
  );
}

function GenericJsonForm({ sectionKey, data, getField, updateField }) {
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState(null);

  useEffect(() => {
    setJsonText(JSON.stringify(data || {}, null, 2));
    setJsonError(null);
  }, [data]);

  const handleJsonChange = (text) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setJsonError(null);
      updateField(sectionKey, parsed);
    } catch (e) {
      setJsonError(e.message);
    }
  };

  return (
    <div>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: '#333' }}>
        {sectionKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
      </h3>
      <div style={{ fontSize: '0.72rem', color: '#888', marginBottom: '0.5rem' }}>
        Full form for this section coming soon. Edit raw JSON below.
      </div>
      <textarea
        style={{ width: '100%', minHeight: 200, fontFamily: "'Cascadia Code', 'Fira Code', monospace", fontSize: '0.75rem', padding: '0.5rem', border: '1px solid ' + (jsonError ? '#fca5a5' : '#ddd'), borderRadius: 4, boxSizing: 'border-box' }}
        value={jsonText}
        onChange={e => handleJsonChange(e.target.value)}
      />
      {jsonError && <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '0.25rem' }}>{jsonError}</div>}
    </div>
  );
}
