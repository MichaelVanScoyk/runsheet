import { useState, useEffect, useCallback } from 'react';

const API_BASE = '';

// ============================================================================
// NERIS section definitions (from bridge spreadsheet / spec)
// Right side is always the same — the 23 NERIS sections
// ============================================================================

const NERIS_SECTIONS = [
  { num: 1, name: "base", label: "Base", required: true, fields: [
    { path: "base.department_neris_id", type: "string", required: true },
    { path: "base.incident_number", type: "string", required: true },
    { path: "base.location", type: "LocationPayload", required: true, expandable: true },
    { path: "base.people_present", type: "boolean|null" },
    { path: "base.animals_rescued", type: "integer|null" },
    { path: "base.impediment_narrative", type: "string|null" },
    { path: "base.outcome_narrative", type: "string|null" },
    { path: "base.displacement_count", type: "integer|null" },
    { path: "base.displacement_causes", type: "enum[]|null" },
    { path: "base.point", type: "GeoPoint|null", expandable: true },
    { path: "base.polygon", type: "MultiPolygon|null" },
    { path: "base.location_use", type: "LocationUsePayload|null", expandable: true },
  ]},
  { num: 2, name: "incident_types", label: "Incident Types", required: true, fields: [
    { path: "incident_types[].type", type: "TypeIncidentValue", required: true },
    { path: "incident_types[].primary", type: "boolean|null" },
  ]},
  { num: 3, name: "dispatch", label: "Dispatch", required: true, fields: [
    { path: "dispatch.incident_number", type: "string", required: true },
    { path: "dispatch.call_arrival", type: "datetime", required: true },
    { path: "dispatch.call_answered", type: "datetime", required: true },
    { path: "dispatch.call_create", type: "datetime", required: true },
    { path: "dispatch.location", type: "LocationPayload", required: true, expandable: true },
    { path: "dispatch.unit_responses[]", type: "UnitResponse[]", required: true, expandable: true },
    { path: "dispatch.center_id", type: "string|null" },
    { path: "dispatch.determinant_code", type: "string|null" },
    { path: "dispatch.incident_code", type: "string|null" },
    { path: "dispatch.disposition", type: "string|null" },
    { path: "dispatch.automatic_alarm", type: "boolean|null" },
    { path: "dispatch.incident_clear", type: "datetime|null" },
    { path: "dispatch.point", type: "GeoPoint|null", expandable: true },
    { path: "dispatch.comments", type: "Comment[]|null" },
    { path: "dispatch.tactic_timestamps", type: "TacticTS|null", expandable: true },
  ]},
  { num: 4, name: "special_modifiers", label: "Special Modifiers", fields: [
    { path: "special_modifiers[]", type: "enum[]|null" },
  ]},
  { num: 5, name: "aids", label: "Aids", fields: [
    { path: "aids[].department_neris_id", type: "string", required: true },
    { path: "aids[].aid_type", type: "enum", required: true },
    { path: "aids[].aid_direction", type: "enum", required: true },
  ]},
  { num: 6, name: "nonfd_aids", label: "Non-FD Aids", fields: [
    { path: "nonfd_aids[]", type: "enum[]|null" },
  ]},
  { num: 7, name: "actions_tactics", label: "Actions/Tactics", fields: [
    { path: "actions_tactics.action_noaction.type", type: "enum", required: true },
    { path: "actions_tactics.action_noaction.actions[]", type: "enum[]|null" },
    { path: "actions_tactics.action_noaction.noaction_type", type: "enum" },
  ]},
  { num: 8, name: "tactic_timestamps", label: "Tactic Timestamps", fields: [
    { path: "tactic_timestamps.command_established", type: "datetime|null" },
    { path: "tactic_timestamps.completed_sizeup", type: "datetime|null" },
    { path: "tactic_timestamps.suppression_complete", type: "datetime|null" },
    { path: "tactic_timestamps.primary_search_begin", type: "datetime|null" },
    { path: "tactic_timestamps.primary_search_complete", type: "datetime|null" },
    { path: "tactic_timestamps.water_on_fire", type: "datetime|null" },
    { path: "tactic_timestamps.fire_under_control", type: "datetime|null" },
    { path: "tactic_timestamps.fire_knocked_down", type: "datetime|null" },
    { path: "tactic_timestamps.extrication_complete", type: "datetime|null" },
  ]},
  { num: 9, name: "unit_responses", label: "Unit Responses (Incident)", fields: [
    { path: "unit_responses[]", type: "UnitResponse[]|null", expandable: true },
  ]},
  { num: 10, name: "exposures", label: "Exposures", fields: [
    { path: "exposures[].location_detail", type: "oneOf", required: true },
    { path: "exposures[].location", type: "LocationPayload", required: true, expandable: true },
    { path: "exposures[].damage_type", type: "enum", required: true },
    { path: "exposures[].people_present", type: "boolean|null" },
    { path: "exposures[].displacement_count", type: "integer|null" },
    { path: "exposures[].location_use", type: "LocationUsePayload|null", expandable: true },
    { path: "exposures[].point", type: "GeoPoint|null", expandable: true },
    { path: "exposures[].polygon", type: "MultiPolygon|null" },
    { path: "exposures[].displacement_causes", type: "enum[]|null" },
  ]},
  { num: 11, name: "casualty_rescues", label: "Casualty/Rescues", fields: [
    { path: "casualty_rescues[].type", type: "enum", required: true },
    { path: "casualty_rescues[].rank", type: "string|null" },
    { path: "casualty_rescues[].years_of_service", type: "number|null" },
    { path: "casualty_rescues[].birth_month_year", type: "string|null" },
    { path: "casualty_rescues[].gender", type: "enum|null" },
    { path: "casualty_rescues[].race", type: "enum|null" },
    { path: "casualty_rescues[].casualty", type: "CasualtyPayload|null", expandable: true },
    { path: "casualty_rescues[].rescue", type: "RescuePayload|null", expandable: true },
  ]},
  { num: 12, name: "fire_detail", label: "Fire Detail", fields: [
    { path: "fire_detail.location_detail", type: "oneOf", required: true, expandable: true },
    { path: "fire_detail.water_supply", type: "enum", required: true },
    { path: "fire_detail.investigation_needed", type: "enum", required: true },
    { path: "fire_detail.investigation_types", type: "enum[]", required: true },
    { path: "fire_detail.suppression_appliances", type: "enum[]|null" },
  ]},
  { num: 13, name: "hazsit_detail", label: "HazSit Detail", fields: [
    { path: "hazsit_detail.evacuated", type: "integer", required: true },
    { path: "hazsit_detail.disposition", type: "enum", required: true },
    { path: "hazsit_detail.chemicals[]", type: "Chemical[]|null", expandable: true },
  ]},
  { num: 14, name: "medical_details", label: "Medical Details", fields: [
    { path: "medical_details[].patient_care_evaluation", type: "enum", required: true },
    { path: "medical_details[].patient_care_report_id", type: "string|null" },
    { path: "medical_details[].patient_status", type: "enum|null" },
    { path: "medical_details[].transport_disposition", type: "enum|null" },
  ]},
  { num: 15, name: "smoke_alarm", label: "Smoke Alarm", fields: [
    { path: "smoke_alarm.presence.type", type: "enum", required: true },
    { path: "smoke_alarm.presence.working", type: "boolean|null" },
    { path: "smoke_alarm.presence.alarm_types[]", type: "enum[]|null" },
    { path: "smoke_alarm.presence.operation", type: "object|null", expandable: true },
  ]},
  { num: 16, name: "fire_alarm", label: "Fire Alarm", fields: [
    { path: "fire_alarm.presence.type", type: "enum", required: true },
    { path: "fire_alarm.presence.alarm_types[]", type: "enum[]|null" },
    { path: "fire_alarm.presence.operation_type", type: "enum|null" },
  ]},
  { num: 17, name: "other_alarm", label: "Other Alarm", fields: [
    { path: "other_alarm.presence.type", type: "enum", required: true },
    { path: "other_alarm.presence.alarm_types[]", type: "enum[]|null" },
  ]},
  { num: 18, name: "fire_suppression", label: "Fire Suppression", fields: [
    { path: "fire_suppression.presence.type", type: "enum", required: true },
    { path: "fire_suppression.presence.suppression_types[]", type: "object[]|null", expandable: true },
    { path: "fire_suppression.presence.operation_type", type: "oneOf|null", expandable: true },
  ]},
  { num: 19, name: "cooking_fire_suppression", label: "Cooking Suppression", fields: [
    { path: "cooking_fire_suppression.presence.type", type: "enum", required: true },
    { path: "cooking_fire_suppression.presence.suppression_types[]", type: "enum[]|null" },
    { path: "cooking_fire_suppression.presence.operation_type", type: "enum|null" },
  ]},
  { num: 20, name: "electric_hazards", label: "Electric Hazards", fields: [
    { path: "electric_hazards[].type", type: "enum", required: true },
    { path: "electric_hazards[].source_or_target", type: "enum|null" },
    { path: "electric_hazards[].involved_in_crash", type: "boolean|null" },
    { path: "electric_hazards[].fire_details", type: "object|null", expandable: true },
  ]},
  { num: 21, name: "powergen_hazards", label: "Powergen Hazards", fields: [
    { path: "powergen_hazards[].pv_other.type", type: "enum", required: true },
    { path: "powergen_hazards[].pv_other.source_or_target", type: "enum|null" },
    { path: "powergen_hazards[].pv_other.pv_type", type: "enum|null" },
  ]},
  { num: 22, name: "csst_hazard", label: "CSST Hazard", fields: [
    { path: "csst_hazard.ignition_source", type: "boolean|null" },
    { path: "csst_hazard.lightning_suspected", type: "enum|null" },
    { path: "csst_hazard.grounded", type: "enum|null" },
  ]},
  { num: 23, name: "medical_oxygen_hazard", label: "Medical O₂ Hazard", fields: [
    { path: "medical_oxygen_hazard.presence.type", type: "enum", required: true },
    { path: "medical_oxygen_hazard.presence.contributed_to_flame_spread", type: "boolean|null" },
  ]},
];

// Table display colors
const TABLE_COLORS = {
  incidents: '#2563eb',
  incident_units: '#16a34a',
  incident_personnel: '#9333ea',
  municipalities: '#ca8a04',
  apparatus: '#dc2626',
  settings: '#64748b',
};

const TABLE_LABELS = {
  incidents: 'Incidents',
  incident_units: 'Unit Responses',
  incident_personnel: 'Personnel',
  municipalities: 'Municipalities',
  apparatus: 'Apparatus',
  settings: 'Settings',
};

const TRANSFORMS = [
  { value: 'direct', label: 'Direct' },
  { value: 'timestamp_iso', label: 'Timestamp → ISO' },
  { value: 'geo_point', label: 'Lat/Lng → GeoPoint' },
  { value: 'json_extract', label: 'JSON Extract' },
  { value: 'row_per_entry', label: 'Row → Array Item' },
  { value: 'lookup', label: 'Lookup / Join' },
  { value: 'address_parse', label: 'Address Parse' },
  { value: 'enum_map', label: 'Enum Map' },
];

// ============================================================================
// API helpers
// ============================================================================

async function fetchSchema() {
  const res = await fetch(`${API_BASE}/api/nerisv1/mapping/schema`);
  if (!res.ok) throw new Error('Failed to load schema');
  return res.json();
}

async function fetchSampleData() {
  const res = await fetch(`${API_BASE}/api/nerisv1/mapping/sample-data`);
  if (!res.ok) throw new Error('Failed to load sample data');
  return res.json();
}

async function fetchMappings() {
  const res = await fetch(`${API_BASE}/api/nerisv1/mapping`);
  if (!res.ok) throw new Error('Failed to load mappings');
  return res.json();
}

async function createMapping(mapping) {
  const res = await fetch(`${API_BASE}/api/nerisv1/mapping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapping),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to create mapping');
  }
  return res.json();
}

async function updateMapping(id, updates) {
  const res = await fetch(`${API_BASE}/api/nerisv1/mapping/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update mapping');
  return res.json();
}

async function deleteMapping(id) {
  const res = await fetch(`${API_BASE}/api/nerisv1/mapping/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete mapping');
  return res.json();
}

async function createColumn(req) {
  const res = await fetch(`${API_BASE}/api/nerisv1/mapping/create-column`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to create column');
  }
  return res.json();
}

// ============================================================================
// Sub-components
// ============================================================================

function CreateColumnModal({ nerisHint, onClose, onCreate, schema }) {
  const [colName, setColName] = useState(nerisHint ? nerisHint.replace(/\./g, '_').replace(/\[\]/g, '') : '');
  const [colType, setColType] = useState('text');
  const [targetTable, setTargetTable] = useState('incidents');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const types = ['text', 'integer', 'boolean', 'timestamp', 'date', 'numeric', 'jsonb'];
  const alterable = ['incidents', 'incident_units', 'incident_personnel'];

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      await onCreate(targetTable, colName, colType, nerisHint);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '1.5rem', width: 400, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem' }}>Create New Column</div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '0.25rem' }}>Table</label>
          <select style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.8rem', border: '1px solid #ddd', borderRadius: 4 }} value={targetTable} onChange={e => setTargetTable(e.target.value)}>
            {alterable.map(t => <option key={t} value={t}>{TABLE_LABELS[t] || t} ({t})</option>)}
          </select>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '0.25rem' }}>Column Name</label>
          <input style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.8rem', border: '1px solid #ddd', borderRadius: 4, fontFamily: 'monospace', boxSizing: 'border-box' }}
            value={colName} onChange={e => setColName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="new_column_name" autoFocus />
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '0.25rem' }}>Data Type</label>
          <select style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.8rem', border: '1px solid #ddd', borderRadius: 4 }} value={colType} onChange={e => setColType(e.target.value)}>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {nerisHint && (
          <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.75rem', padding: '0.4rem 0.6rem', background: '#f9fafb', borderRadius: 4 }}>
            For NERIS field: <span style={{ fontFamily: 'monospace', color: '#555' }}>{nerisHint}</span>
          </div>
        )}

        {error && <div style={{ fontSize: '0.75rem', color: '#dc2626', marginBottom: '0.75rem' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!colName || saving}>
            {saving ? 'Creating...' : 'Create Column'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

function NerisMappingTab() {
  const [schema, setSchema] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [sampleData, setSampleData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState(0);
  const [collapsed, setCollapsed] = useState({});
  const [highlightedCols, setHighlightedCols] = useState([]);
  const [activeField, setActiveField] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createHint, setCreateHint] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [schemaData, mappingData, samples] = await Promise.all([fetchSchema(), fetchMappings(), fetchSampleData()]);
      setSchema(schemaData);
      setMappings(mappingData);
      setSampleData(samples || {});
      // Start with all tables collapsed except incidents
      const c = {};
      schemaData.tables.forEach(t => { c[t.table] = t.table !== 'incidents'; });
      setCollapsed(c);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const section = NERIS_SECTIONS[activeSection];
  const mappedPaths = new Set(mappings.map(m => m.neris_field_path));
  const totalFields = NERIS_SECTIONS.reduce((s, sec) => s + sec.fields.length, 0);
  const requiredUnmapped = NERIS_SECTIONS.flatMap(s => s.fields.filter(f => f.required)).filter(f => !mappedPaths.has(f.path));

  // Infer transform from types
  const inferTransform = (nerisField, sourceType) => {
    if (!nerisField) return 'direct';
    if (nerisField.type?.includes('datetime') || nerisField.type?.includes('datetime|null')) return 'timestamp_iso';
    if (nerisField.type === 'GeoPoint|null') return 'geo_point';
    if (sourceType?.includes('timestamp')) return 'timestamp_iso';
    if (sourceType === 'jsonb') return 'json_extract';
    return 'direct';
  };

  // Handle drag-drop mapping
  const handleDrop = async (nerisPath, sourceKey) => {
    const [table, ...colParts] = sourceKey.split('.');
    const column = colParts.join('.');
    const existingCount = mappings.filter(m => m.neris_field_path === nerisPath).length;
    const nerisField = section?.fields.find(f => f.path === nerisPath);
    const sourceCol = schema?.tables?.find(t => t.table === table)?.columns?.find(c => c.name === column);
    const transform = inferTransform(nerisField, sourceCol?.type);

    setSaving(true);
    try {
      await createMapping({
        neris_section: section.num,
        neris_field_path: nerisPath,
        neris_type: nerisField?.type,
        neris_required: nerisField?.required || false,
        source_table: table,
        source_column: column,
        transform,
        priority: existingCount + 1,
      });
      await loadData();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (mappingId) => {
    setSaving(true);
    try {
      await deleteMapping(mappingId);
      await loadData();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTransform = async (mappingId, newTransform) => {
    try {
      await updateMapping(mappingId, { transform: newTransform });
      await loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCreateColumn = async (table, colName, colType, hint) => {
    await createColumn({ table_name: table, column_name: colName, column_type: colType, neris_field_hint: hint });
    await loadData(); // Refresh schema to show new column
  };

  const handleFieldClick = (path) => {
    setActiveField(activeField === path ? null : path);
    const mapped = mappings.filter(m => m.neris_field_path === path);
    setHighlightedCols(mapped.map(m => `${m.source_table}.${m.source_column}`));
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Loading schema and mappings...</div>;
  if (error && !schema) return <div style={{ padding: '2rem', color: '#dc2626' }}>Error: {error}</div>;

  const sectionMappings = mappings.filter(m => section?.fields.some(f => f.path === m.neris_field_path));

  return (
    <div>
      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '0 0 0.75rem', overflowX: 'auto', borderBottom: '1px solid #e2e4e9', marginBottom: '1rem' }}>
        {NERIS_SECTIONS.map((sec, i) => {
          const secMapped = sec.fields.filter(f => mappedPaths.has(f.path)).length;
          return (
            <div key={sec.num}
              onClick={() => { setActiveSection(i); setActiveField(null); setHighlightedCols([]); }}
              style={{
                padding: '0.4rem 0.7rem', fontSize: '0.73rem', fontWeight: activeSection === i ? 700 : 500,
                color: activeSection === i ? '#c41e3a' : '#555',
                background: activeSection === i ? '#fef2f2' : 'transparent',
                border: `1px solid ${activeSection === i ? '#fca5a5' : 'transparent'}`,
                borderBottom: activeSection === i ? '2px solid #c41e3a' : '2px solid transparent',
                borderRadius: '4px 4px 0 0', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {sec.num}. {sec.label}
              {sec.required && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#c41e3a', display: 'inline-block', marginLeft: 4, verticalAlign: 'middle' }} />}
              <span style={{ fontSize: '0.6rem', color: secMapped === sec.fields.length ? '#16a34a' : '#999', marginLeft: 4 }}>
                {secMapped}/{sec.fields.length}
              </span>
            </div>
          );
        })}
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: '#666', marginBottom: '0.75rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} /> {mappedPaths.size} mapped
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e2e4e9' }} /> {totalFields - mappedPaths.size} unmapped
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: requiredUnmapped.length > 0 ? '#c41e3a' : '#16a34a' }} />
          {requiredUnmapped.length > 0 ? `${requiredUnmapped.length} required unmapped` : 'All required mapped'}
        </span>
        {saving && <span style={{ color: '#ca8a04' }}>Saving...</span>}
      </div>

      {error && <div style={{ fontSize: '0.75rem', color: '#dc2626', marginBottom: '0.5rem' }}>{error}</div>}

      {/* Two-panel layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 30px 1fr', gap: 0, alignItems: 'start' }}>

        {/* LEFT: Source DB */}
        <div style={{ background: '#fff', border: '1px solid #e2e4e9', borderRadius: 6, overflow: 'hidden', maxHeight: '60vh', overflowY: 'auto' }}>
          <div style={{ padding: '0.5rem 0.75rem', background: '#eff6ff', borderBottom: '1px solid #e2e4e9', fontWeight: 700, fontSize: '0.78rem', color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', justifyContent: 'space-between' }}>
            <span>Source Data (Incident / CAD)</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 400, color: '#666' }}>
              {schema?.tables?.reduce((s, t) => s + t.columns.length, 0)} columns
            </span>
          </div>
          {schema?.tables?.map(table => {
            const color = TABLE_COLORS[table.table] || '#888';
            return (
              <div key={table.table} style={{ borderLeft: `3px solid ${color}`, margin: '0.4rem 0.6rem', borderRadius: '0 4px 4px 0' }}>
                <div onClick={() => setCollapsed(p => ({ ...p, [table.table]: !p[table.table] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', background: color + '08', cursor: 'pointer', userSelect: 'none', fontSize: '0.76rem', fontWeight: 600, color }}>
                  <span style={{ fontSize: '0.65rem' }}>{collapsed[table.table] ? '▸' : '▾'}</span>
                  <span>{TABLE_LABELS[table.table] || table.table}</span>
                  <span style={{ fontSize: '0.63rem', fontWeight: 400, color: '#999', marginLeft: 'auto' }}>{table.columns.length}</span>
                </div>
                {!collapsed[table.table] && table.columns.map(col => {
                  const key = `${table.table}.${col.name}`;
                  const isHl = highlightedCols.includes(key);
                  return (
                    <div key={key}
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/plain', key)}
                      title={`${col.type}${col.nullable ? ', nullable' : ''}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.3rem 0.5rem 0.3rem 1rem', fontSize: '0.73rem', cursor: 'grab',
                        background: isHl ? '#fefce8' : 'transparent', borderBottom: '1px solid #f5f5f5',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontFamily: "'Cascadia Code', 'Fira Code', monospace", fontWeight: 500, color, fontSize: '0.71rem' }}>{col.name}</span>
                          <span style={{ fontSize: '0.62rem', color: '#aaa', marginLeft: 'auto', fontFamily: 'monospace' }}>{col.type.replace('character varying', 'varchar').replace('timestamp with time zone', 'timestamptz').replace('timestamp without time zone', 'timestamp')}</span>
                        </div>
                        {sampleData[table.table]?.[col.name] != null && (
                          <div style={{ fontSize: '0.62rem', color: '#888', fontFamily: 'monospace', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                            {sampleData[table.table][col.name]}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* CENTER */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '3rem', gap: '0.5rem' }}>
          <span style={{ color: '#ccc', fontSize: '1.1rem' }}>→</span>
          <span style={{ fontSize: '0.5rem', color: '#bbb', writingMode: 'vertical-rl', letterSpacing: 2 }}>ALIAS</span>
          <span style={{ color: '#ccc', fontSize: '1.1rem' }}>←</span>
        </div>

        {/* RIGHT: NERIS */}
        <div style={{ background: '#fff', border: '1px solid #e2e4e9', borderRadius: 6, overflow: 'hidden', maxHeight: '60vh', overflowY: 'auto' }}>
          <div style={{ padding: '0.5rem 0.75rem', background: '#fef2f2', borderBottom: '1px solid #e2e4e9', fontWeight: 700, fontSize: '0.78rem', color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', justifyContent: 'space-between' }}>
            <span>NERIS — Section {section?.num}: {section?.label}</span>
            {section?.required && <span style={{ fontSize: '0.65rem', background: '#c41e3a', color: '#fff', padding: '0.1rem 0.4rem', borderRadius: 3, fontWeight: 600 }}>REQUIRED</span>}
          </div>
          {section?.fields.map(field => {
            const fieldMappings = mappings.filter(m => m.neris_field_path === field.path);
            const isMapped = fieldMappings.length > 0;
            const isActive = activeField === field.path;
            const shortPath = field.path.split('.').slice(1).join('.');

            return (
              <div key={field.path}
                onClick={() => handleFieldClick(field.path)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleDrop(field.path, e.dataTransfer.getData('text/plain')); }}
                style={{
                  padding: '0.4rem 0.65rem', fontSize: '0.73rem', borderBottom: '1px solid #f0f0f0', cursor: 'pointer',
                  background: isActive ? '#fef9c3' : isMapped ? '#f0fdf4' : field.required ? '#fef2f2' : '#fff',
                  borderLeft: isActive ? '3px solid #c41e3a' : isMapped ? '3px solid #16a34a' : field.required ? '3px solid #fca5a5' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ fontFamily: "'Cascadia Code', 'Fira Code', monospace", fontWeight: 500, color: isMapped ? '#166534' : '#1a1a2e', fontSize: '0.71rem', flex: 1 }}>{shortPath}</span>
                  {field.required && <span style={{ color: '#c41e3a', fontSize: '0.7rem', fontWeight: 700 }}>*</span>}
                  {field.expandable && <span style={{ fontSize: '0.58rem', color: '#888', background: '#f0f0f0', padding: '0 0.25rem', borderRadius: 2 }}>...</span>}
                  <span style={{ fontSize: '0.6rem', color: '#888', fontFamily: 'monospace' }}>{field.type}</span>
                </div>
                {isMapped && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.2rem' }}>
                    {fieldMappings.sort((a, b) => a.priority - b.priority).map((m, i) => {
                      const tColor = TABLE_COLORS[m.source_table] || '#888';
                      return (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {fieldMappings.length > 1 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', fontSize: '0.55rem', fontWeight: 700, background: m.priority === 1 ? '#c41e3a' : '#ca8a04', color: '#fff' }}>{m.priority}</span>
                          )}
                          <span style={{ fontSize: '0.58rem', background: tColor + '18', color: tColor, padding: '0.05rem 0.35rem', borderRadius: 3, fontWeight: 600, fontFamily: 'monospace' }}>
                            {m.source_table}.{m.source_column}
                          </span>
                          {m.transform !== 'direct' && (
                            <span style={{ fontSize: '0.52rem', color: '#888', fontStyle: 'italic' }}>{m.transform}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ padding: '0.4rem 0.6rem', borderTop: '1px solid #e2e4e9' }}>
            <button className="btn" style={{ fontSize: '0.68rem', width: '100%' }}
              onClick={() => { setCreateHint(section?.fields[0]?.path); setShowCreateModal(true); }}>
              + Create Source Column
            </button>
          </div>
        </div>
      </div>

      {/* Mapping detail table */}
      {sectionMappings.length > 0 && (
        <div style={{ marginTop: '1rem', background: '#fff', border: '1px solid #e2e4e9', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ padding: '0.5rem 0.75rem', background: '#fafafa', borderBottom: '1px solid #e2e4e9', fontWeight: 700, fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>Active Mappings — {section?.label}</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 400, color: '#888' }}>{sectionMappings.length}</span>
          </div>
          <div style={{ padding: '0.15rem 0.75rem', background: '#fafafa', borderBottom: '1px solid #eee', display: 'grid', gridTemplateColumns: '2fr 24px 2fr 1fr 60px', gap: '0.4rem', fontSize: '0.63rem', fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <span>Source</span><span /><span>NERIS Field</span><span>Transform</span><span />
          </div>
          {sectionMappings
            .sort((a, b) => a.neris_field_path.localeCompare(b.neris_field_path) || a.priority - b.priority)
            .map(m => {
              const tColor = TABLE_COLORS[m.source_table] || '#888';
              return (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '2fr 24px 2fr 1fr 60px', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', borderBottom: '1px solid #f5f5f5', fontSize: '0.73rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    {m.priority > 1 && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', fontSize: '0.55rem', fontWeight: 700, background: '#ca8a04', color: '#fff' }}>{m.priority}</span>}
                    <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: tColor, fontWeight: 500 }}>{m.source_table}</span>
                    <span style={{ color: '#ccc' }}>.</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{m.source_column}</span>
                  </div>
                  <span style={{ textAlign: 'center', color: '#aaa' }}>→</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#991b1b' }}>
                    {m.neris_field_path.split('.').slice(1).join('.')}
                  </span>
                  <select value={m.transform} onChange={e => handleUpdateTransform(m.id, e.target.value)}
                    style={{ padding: '0.2rem 0.3rem', fontSize: '0.68rem', border: '1px solid #ddd', borderRadius: 4 }}>
                    {TRANSFORMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <button className="btn" style={{ fontSize: '0.65rem', color: '#dc2626', padding: '0.2rem 0.4rem' }}
                    onClick={() => handleDelete(m.id)}>✕</button>
                </div>
              );
            })}
        </div>
      )}

      {showCreateModal && (
        <CreateColumnModal
          nerisHint={createHint}
          schema={schema}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateColumn}
        />
      )}
    </div>
  );
}

export default NerisMappingTab;
