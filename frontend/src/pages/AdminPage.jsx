import { useState, useEffect, useRef } from 'react';
import { verifyAdminPassword, setAdminAuthenticated, changeAdminPassword, getAuditLog, getRanks, createRank, updateRank, deleteRank, getPrintSettings, updatePrintSettings } from '../api';
import './AdminPage.css';
import PersonnelPage from './PersonnelPage';
import ApparatusPage from './ApparatusPage';
import MunicipalitiesPage from './MunicipalitiesPage';

const API_BASE = '';

// US Timezone options for dropdown
const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
];

// ============================================================================
// SETTINGS TAB COMPONENT
// ============================================================================

function SettingsTab() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  // editingUnits and unitsText removed - units now managed in Units tab
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      const data = await res.json();
      setSettings(data);
      // Initialize all categories as collapsed
      const cats = Object.keys(data);
      setCollapsed(cats.reduce((acc, cat) => ({ ...acc, [cat]: true }), {}));
      
      // station_units initialization removed - now managed in Units tab
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (cat) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const formatLabel = (key) => {
    return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const updateSetting = async (category, key, value) => {
    setSaving(`${category}.${key}`);
    try {
      await fetch(`${API_BASE}/api/settings/${category}/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: String(value) }),
      });
      await loadSettings();
    } catch (err) {
      console.error('Failed to update setting:', err);
      alert('Failed to save setting');
    } finally {
      setSaving(null);
    }
  };

  // saveUnits removed - units now managed in Units tab

  const renderSetting = (setting) => {
    const isSaving = saving === `${setting.category}.${setting.key}`;
    
    // Hide station_units - now managed in Admin > Units
    if (setting.key === 'station_units') {
      return (
        <div key={setting.key} className="setting-item setting-units" style={{ opacity: 0.5 }}>
          <div className="setting-header">
            <label>{formatLabel(setting.key)}</label>
            <span className="setting-desc" style={{ color: '#f59e0b' }}>
              ⚠️ Deprecated - Units are now managed in Admin → Units tab
            </span>
          </div>
          <div className="units-display">
            <div className="units-list">
              {Array.isArray(setting.value) 
                ? setting.value.map((u, i) => <span key={i} className="unit-badge">{u}</span>)
                : <span>{setting.raw_value}</span>
              }
            </div>
          </div>
        </div>
      );
    }
    
    if (setting.key === 'types' && setting.category === 'apparatus') {
      const types = Array.isArray(setting.value) ? setting.value : [];
      const groups = types.reduce((acc, t) => {
        if (!acc[t.group]) acc[t.group] = [];
        acc[t.group].push(t);
        return acc;
      }, {});
      
      return (
        <div key={setting.key} className="setting-item setting-apparatus-types">
          <div className="setting-header">
            <label>NFIRS Apparatus Types</label>
            <span className="setting-desc">{setting.description}</span>
          </div>
          <div className="apparatus-types-display">
            {Object.entries(groups).map(([group, items]) => (
              <div key={group} className="apparatus-group">
                <strong>{group}</strong>
                <div className="apparatus-codes">
                  {items.map(t => (
                    <span key={t.code} className="apparatus-code">{t.code}: {t.name}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <small style={{ color: '#666', marginTop: '0.5rem', display: 'block' }}>
            Standard NFIRS codes. Contact admin to modify.
          </small>
        </div>
      );
    }
    
    // Timezone dropdown
    if (setting.key === 'timezone') {
      // Strip quotes from stored value if present
      const currentValue = (setting.raw_value || '').replace(/"/g, '');
      return (
        <div key={setting.key} className="setting-item">
          <div className="setting-header">
            <label>{formatLabel(setting.key)}</label>
            <span className="setting-desc">Station timezone for CAD time parsing</span>
          </div>
          <select
            value={currentValue}
            onChange={(e) => updateSetting(setting.category, setting.key, e.target.value)}
            disabled={isSaving}
          >
            {US_TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
      );
    }
    
    if (setting.value_type === 'boolean') {
      return (
        <div key={setting.key} className="setting-item">
          <div className="setting-header">
            <label>{formatLabel(setting.key)}</label>
            <span className="setting-desc">{setting.description}</span>
          </div>
          <select
            value={setting.value ? 'true' : 'false'}
            onChange={(e) => updateSetting(setting.category, setting.key, e.target.value)}
            disabled={isSaving}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      );
    }
    
    if (setting.value_type === 'number') {
      return (
        <div key={setting.key} className="setting-item">
          <div className="setting-header">
            <label>{formatLabel(setting.key)}</label>
            <span className="setting-desc">{setting.description}</span>
          </div>
          <input
            type="number"
            value={setting.raw_value}
            onChange={(e) => updateSetting(setting.category, setting.key, e.target.value)}
            disabled={isSaving}
          />
        </div>
      );
    }
    
    return (
      <div key={setting.key} className="setting-item">
        <div className="setting-header">
          <label>{formatLabel(setting.key)}</label>
          <span className="setting-desc">{setting.description}</span>
        </div>
        <input
          type="text"
          defaultValue={setting.raw_value || ''}
          onBlur={(e) => {
            if (e.target.value !== (setting.raw_value || '')) {
              updateSetting(setting.category, setting.key, e.target.value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.target.blur();
            }
          }}
          disabled={isSaving}
        />
      </div>
    );
  };

  if (loading) return <div className="loading">Loading settings...</div>;

  const categories = Object.keys(settings).sort();

  return (
    <div className="settings-content">
      <p className="tab-intro">
        Configure RunSheet for your station. Changes are saved automatically.
      </p>
      
      {categories.map(category => (
        <div key={category} className="settings-category">
          <h3 
            className="settings-category-header" 
            onClick={() => toggleCategory(category)}
          >
            <span className={`collapse-icon ${collapsed[category] ? 'collapsed' : ''}`}>▼</span>
            {category.charAt(0).toUpperCase() + category.slice(1)}
            <span className="setting-count">({settings[category].length})</span>
          </h3>
          {!collapsed[category] && (
            <div className="settings-list">
              {settings[category].map(renderSetting)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// ============================================================================
// INCIDENT SEQUENCE TAB COMPONENT
// ============================================================================

function IncidentSequenceTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showConfirm, setShowConfirm] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState(null);

  useEffect(() => {
    loadSequence();
  }, [year]);

  const loadSequence = async () => {
    setLoading(true);
    setFixResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/incidents/admin/sequence?year=${year}`);
      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error('Failed to load sequence:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFixAll = async () => {
    setFixing(true);
    setShowConfirm(false);
    try {
      const res = await fetch(`${API_BASE}/api/incidents/admin/fix-sequence?year=${year}`, {
        method: 'POST',
      });
      const result = await res.json();
      setFixResult(result);
      await loadSequence();
    } catch (err) {
      console.error('Failed to fix sequence:', err);
      setFixResult({ status: 'error', message: 'Failed to fix sequence' });
    } finally {
      setFixing(false);
    }
  };

  if (loading) return <div className="loading">Loading incident sequence...</div>;

  const hasIssues = data?.out_of_sequence_count > 0;

  return (
    <div className="sequence-content">
      <div className="sequence-header">
        <div className="sequence-year-selector">
          <label>Year:</label>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
            {[...Array(5)].map((_, i) => {
              const y = new Date().getFullYear() - i;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
        </div>
        
        {hasIssues && (
          <button 
            className="btn btn-fix" 
            onClick={() => setShowConfirm(true)}
            disabled={fixing}
          >
            {fixing ? 'Fixing...' : `Fix All (${data.out_of_sequence_count})`}
          </button>
        )}
      </div>

      {/* Status Banner */}
      {hasIssues ? (
        <div className="sequence-banner warning">
          ⚠️ {data.out_of_sequence_count} incident{data.out_of_sequence_count !== 1 ? 's' : ''} out of sequence
        </div>
      ) : (
        <div className="sequence-banner success">
          ✓ All {data?.total_incidents || 0} incidents are in correct sequence
        </div>
      )}

      {/* Fix Result */}
      {fixResult && (
        <div className={`sequence-banner ${fixResult.status === 'ok' ? 'success' : 'error'}`}>
          {fixResult.status === 'ok' 
            ? `✓ Fixed ${fixResult.changes_applied} incident${fixResult.changes_applied !== 1 ? 's' : ''}`
            : `✗ ${fixResult.message || 'Error fixing sequence'}`
          }
        </div>
      )}

      {/* Incidents Table */}
      <div className="sequence-table-container">
        <table className="sequence-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>CAD #</th>
              <th>Address</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.incidents?.map((inc) => (
              <tr key={inc.id} className={inc.needs_fix ? 'row-out-of-sequence' : ''}>
                <td className="number-cell">
                  {inc.number}
                  {inc.needs_fix && (
                    <span className="should-be">→ {inc.should_be_number}</span>
                  )}
                </td>
                <td>{inc.date || '-'}</td>
                <td>{inc.cad_event_number || '-'}</td>
                <td className="address-cell">{inc.address || '-'}</td>
                <td className="status-cell">
                  {inc.needs_fix ? (
                    <span className="badge-warning">⚠️</span>
                  ) : (
                    <span className="badge-ok">✓</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Fix Incident Sequence</h3>
            <p>This will renumber the following incidents:</p>
            
            <div className="changes-preview">
              {data.changes_preview?.map((change, idx) => (
                <div key={idx} className="change-item">
                  <span className="change-number">{change.current_number}</span>
                  <span className="change-arrow">→</span>
                  <span className="change-number new">{change.new_number}</span>
                  <span className="change-date">({change.date})</span>
                </div>
              ))}
            </div>
            
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleFixAll}>
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================================
// NERIS CODES TAB COMPONENT
// ============================================================================

function NerisCodesTab() {
  const [activeSubTab, setActiveSubTab] = useState('browse');
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Import state
  const [importCategory, setImportCategory] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [importMode, setImportMode] = useState('merge');
  const fileInputRef = useRef(null);
  
  // Validation state
  const [validationYear, setValidationYear] = useState(new Date().getFullYear());
  const [validationResults, setValidationResults] = useState(null);
  const [apparatusIssues, setApparatusIssues] = useState(null);
  
  // Update state
  const [updateField, setUpdateField] = useState('incident_type');
  const [oldCode, setOldCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [updateYear, setUpdateYear] = useState('');
  const [updateResult, setUpdateResult] = useState(null);

  const priorityCategories = ['type_unit', 'type_incident', 'type_location_use', 'type_action_tactic'];

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/neris-codes/categories`);
      if (res.ok) setCategories(await res.json());
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const loadCodes = async (category) => {
    setLoading(true);
    setSelectedCategory(category);
    try {
      const res = await fetch(`${API_BASE}/api/neris-codes/categories/${category}?include_inactive=true`);
      if (res.ok) setCodes(await res.json());
    } catch (err) {
      console.error('Failed to load codes:', err);
    }
    setLoading(false);
  };

  const handleImport = async (e) => {
    e.preventDefault();
    const file = fileInputRef.current?.files[0];
    if (!file || !importCategory) return;

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    setImportResult(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/neris-codes/import?category=${importCategory}&mode=${importMode}`,
        { method: 'POST', body: formData }
      );
      const result = await res.json();
      setImportResult(result);
      if (res.ok) {
        loadCategories();
      }
    } catch (err) {
      setImportResult({ error: err.message });
    }
    setLoading(false);
  };

  const handleValidate = async () => {
    setLoading(true);
    setValidationResults(null);
    setApparatusIssues(null);
    try {
      const [incidents, apparatus] = await Promise.all([
        fetch(`${API_BASE}/api/neris-codes/validate?year=${validationYear}`).then(r => r.json()),
        fetch(`${API_BASE}/api/neris-codes/validate/apparatus`).then(r => r.json())
      ]);
      setValidationResults(incidents);
      setApparatusIssues(apparatus);
    } catch (err) {
      console.error('Validation failed:', err);
    }
    setLoading(false);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!oldCode || !newCode) return;

    setLoading(true);
    setUpdateResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/neris-codes/update-incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: updateField,
          old_code: oldCode,
          new_code: newCode,
          year: updateYear ? parseInt(updateYear) : null
        })
      });
      setUpdateResult(await res.json());
      if (res.ok) {
        setOldCode('');
        setNewCode('');
      }
    } catch (err) {
      setUpdateResult({ error: err.message });
    }
    setLoading(false);
  };

  const toggleCodeActive = async (codeId, currentActive) => {
    try {
      await fetch(`${API_BASE}/api/neris-codes/codes/${codeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive })
      });
      loadCodes(selectedCategory);
    } catch (err) {
      console.error('Failed to update code:', err);
    }
  };

  const getCategoryName = (cat) => {
    const names = {
      'type_unit': 'Apparatus Types',
      'type_incident': 'Incident Types',
      'type_location_use': 'Property Use',
      'type_action_tactic': 'Actions Taken'
    };
    return names[cat] || cat.replace('type_', '').replace(/_/g, ' ');
  };

  const years = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);

  return (
    <div className="neris-content">
      <div className="neris-subtabs">
        <button className={activeSubTab === 'browse' ? 'active' : ''} onClick={() => setActiveSubTab('browse')}>
          Browse
        </button>
        <button className={activeSubTab === 'import' ? 'active' : ''} onClick={() => setActiveSubTab('import')}>
          Import
        </button>
        <button className={activeSubTab === 'validate' ? 'active' : ''} onClick={() => setActiveSubTab('validate')}>
          Validate
        </button>
        <button className={activeSubTab === 'update' ? 'active' : ''} onClick={() => setActiveSubTab('update')}>
          Update Incidents
        </button>
      </div>

      {/* BROWSE */}
      {activeSubTab === 'browse' && (
        <div className="neris-browse">
          <div className="neris-sidebar">
            <h4>Categories</h4>
            {priorityCategories.map(cat => {
              const catData = categories.find(c => c.category === cat);
              return (
                <button
                  key={cat}
                  className={`neris-cat-btn ${selectedCategory === cat ? 'selected' : ''}`}
                  onClick={() => loadCodes(cat)}
                >
                  <span>{getCategoryName(cat)}</span>
                  <span className="neris-count">{catData ? `${catData.active}/${catData.total}` : '0'}</span>
                </button>
              );
            })}
            {categories.filter(c => !priorityCategories.includes(c.category)).length > 0 && (
              <>
                <h4 style={{marginTop: '1rem'}}>Other</h4>
                {categories.filter(c => !priorityCategories.includes(c.category)).map(cat => (
                  <button
                    key={cat.category}
                    className={`neris-cat-btn ${selectedCategory === cat.category ? 'selected' : ''}`}
                    onClick={() => loadCodes(cat.category)}
                  >
                    <span>{getCategoryName(cat.category)}</span>
                    <span className="neris-count">{cat.active}</span>
                  </button>
                ))}
              </>
            )}
          </div>
          <div className="neris-codes-list">
            {selectedCategory ? (
              <>
                <h4>{getCategoryName(selectedCategory)} <span style={{color:'#888', fontWeight:'normal'}}>({codes.filter(c=>c.active).length} active / {codes.length} total)</span></h4>
                {loading ? <p className="loading">Loading...</p> : (
                  <div className="table-container" style={{maxHeight:'400px', overflowY:'auto'}}>
                    <table>
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Description</th>
                          <th style={{width:'80px'}}>Active</th>
                        </tr>
                      </thead>
                      <tbody>
                        {codes.map(code => (
                          <tr key={code.id} className={!code.active ? 'inactive-row' : ''}>
                            <td><code>{code.value}</code></td>
                            <td>{code.display_text}</td>
                            <td>
                              <button
                                className={`btn btn-sm ${code.active ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => toggleCodeActive(code.id, code.active)}
                              >
                                {code.active ? '✓' : '✗'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <p style={{color:'#666'}}>Select a category to view codes</p>
            )}
          </div>
        </div>
      )}

      {/* IMPORT */}
      {activeSubTab === 'import' && (
        <div className="neris-import">
          <p className="tab-intro">
            Import NERIS codes from official CSV files. Download from{' '}
            <a href="https://github.com/ulfsri/neris-framework/tree/main/core_schemas/value_sets/csv" target="_blank" rel="noreferrer" style={{color:'#4ecdc4'}}>
              github.com/ulfsri/neris-framework
            </a>
          </p>
          
          <form onSubmit={handleImport} className="neris-import-form">
            <div className="form-group">
              <label>Category</label>
              <select value={importCategory} onChange={(e) => setImportCategory(e.target.value)} required>
                <option value="">Select category...</option>
                <option value="type_unit">Apparatus Types (type_unit)</option>
                <option value="type_incident">Incident Types (type_incident)</option>
                <option value="type_location_use">Property Use (type_location_use)</option>
                <option value="type_action_tactic">Actions Taken (type_action_tactic)</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Import Mode</label>
              <select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                <option value="merge">Merge (add new, update existing)</option>
                <option value="replace">Replace (delete all, import fresh)</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>CSV File</label>
              <input type="file" ref={fileInputRef} accept=".csv" required />
            </div>
            
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Importing...' : 'Import'}
            </button>
          </form>

          {importResult && (
            <div className={`neris-result ${importResult.error ? 'error' : 'success'}`}>
              {importResult.error ? (
                <p>Error: {importResult.error}</p>
              ) : (
                <>
                  <p>✓ Imported: {importResult.rows_imported}</p>
                  <p>✓ Updated: {importResult.rows_updated}</p>
                  {importResult.rows_removed > 0 && <p>✓ Removed: {importResult.rows_removed}</p>}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* VALIDATE */}
      {activeSubTab === 'validate' && (
        <div className="neris-validate">
          <p className="tab-intro">Find incidents using codes that don't exist in the current NERIS code set.</p>
          
          <div className="neris-validate-controls">
            <div className="form-group" style={{display:'inline-block', marginRight:'1rem'}}>
              <label>Year</label>
              <select value={validationYear} onChange={(e) => setValidationYear(e.target.value)}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleValidate} disabled={loading}>
              {loading ? 'Validating...' : 'Run Validation'}
            </button>
          </div>

          {validationResults && (
            <div className="neris-validation-results">
              {validationResults.total_issues === 0 ? (
                <div className="sequence-banner success">✓ All incidents have valid codes</div>
              ) : (
                <>
                  {validationResults.issues.incident_type.length > 0 && (
                    <div className="neris-issue-group">
                      <h5>Invalid Incident Types ({validationResults.issues.incident_type.length})</h5>
                      <div className="table-container">
                        <table>
                          <thead><tr><th>Incident</th><th>Invalid Code</th></tr></thead>
                          <tbody>
                            {validationResults.issues.incident_type.map((i, idx) => (
                              <tr key={idx}>
                                <td>{i.incident_number}</td>
                                <td><code>{i.code}</code></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {validationResults.issues.location_use.length > 0 && (
                    <div className="neris-issue-group">
                      <h5>Invalid Property Use ({validationResults.issues.location_use.length})</h5>
                      <div className="table-container">
                        <table>
                          <thead><tr><th>Incident</th><th>Invalid Code</th></tr></thead>
                          <tbody>
                            {validationResults.issues.location_use.map((i, idx) => (
                              <tr key={idx}>
                                <td>{i.incident_number}</td>
                                <td><code>{i.code}</code></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {validationResults.issues.action.length > 0 && (
                    <div className="neris-issue-group">
                      <h5>Invalid Actions ({validationResults.issues.action.length})</h5>
                      <div className="table-container">
                        <table>
                          <thead><tr><th>Incident</th><th>Invalid Code</th></tr></thead>
                          <tbody>
                            {validationResults.issues.action.map((i, idx) => (
                              <tr key={idx}>
                                <td>{i.incident_number}</td>
                                <td><code>{i.code}</code></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {apparatusIssues && apparatusIssues.length > 0 && (
            <div className="neris-issue-group">
              <h5>Invalid Apparatus Types ({apparatusIssues.length})</h5>
              <div className="table-container">
                <table>
                  <thead><tr><th>Unit</th><th>Name</th><th>Invalid Type</th></tr></thead>
                  <tbody>
                    {apparatusIssues.map(a => (
                      <tr key={a.apparatus_id}>
                        <td>{a.unit_designator}</td>
                        <td>{a.name}</td>
                        <td><code>{a.neris_unit_type}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* UPDATE */}
      {activeSubTab === 'update' && (
        <div className="neris-update">
          <p className="tab-intro">Replace an old/invalid code with a new valid code across multiple incidents.</p>
          
          <form onSubmit={handleUpdate} className="neris-update-form">
            <div className="form-group">
              <label>Field</label>
              <select value={updateField} onChange={(e) => setUpdateField(e.target.value)}>
                <option value="incident_type">Incident Type</option>
                <option value="location_use">Property Use</option>
                <option value="action">Action Taken</option>
              </select>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Old Code</label>
                <input 
                  type="text" 
                  value={oldCode} 
                  onChange={(e) => setOldCode(e.target.value)}
                  placeholder="Code to replace"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>New Code</label>
                <input 
                  type="text" 
                  value={newCode} 
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="New valid code"
                  required
                />
              </div>
            </div>
            
            <div className="form-group">
              <label>Year (optional)</label>
              <select value={updateYear} onChange={(e) => setUpdateYear(e.target.value)}>
                <option value="">All years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Updating...' : 'Update Incidents'}
            </button>
          </form>

          {updateResult && (
            <div className={`neris-result ${updateResult.error ? 'error' : 'success'}`}>
              {updateResult.error ? (
                <p>Error: {updateResult.error}</p>
              ) : (
                <p>✓ Updated {updateResult.incidents_updated} incident(s)</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ============================================================================
// RANKS TAB COMPONENT
// ============================================================================

function RanksTab() {
  const [ranks, setRanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    rank_name: '',
    abbreviation: '',
    display_order: 100,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    loadRanks();
  }, []);

  const loadRanks = async () => {
    try {
      const res = await getRanks();
      setRanks(res.data);
    } catch (err) {
      console.error('Failed to load ranks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditing(null);
    setFormData({ rank_name: '', abbreviation: '', display_order: 100 });
    setError('');
    setShowModal(true);
  };

  const handleEdit = (rank) => {
    setEditing(rank);
    setFormData({
      rank_name: rank.rank_name,
      abbreviation: rank.abbreviation || '',
      display_order: rank.display_order,
    });
    setError('');
    setShowModal(true);
  };

  const handleDelete = async (rank) => {
    if (!confirm(`Deactivate rank "${rank.rank_name}"?`)) return;
    
    try {
      await deleteRank(rank.id);
      loadRanks();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete rank');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      if (editing) {
        await updateRank(editing.id, formData);
      } else {
        await createRank(formData);
      }
      setShowModal(false);
      loadRanks();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save rank');
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="ranks-tab">
      <div className="ranks-header">
        <h3>Ranks</h3>
        <button className="btn btn-primary" onClick={handleAdd}>+ Add Rank</button>
      </div>
      <p className="tab-intro">
        Configure ranks for personnel. Lower display order = higher rank (Chief should be 1, FF should be 100).
      </p>

      <table className="ranks-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Rank Name</th>
            <th>Abbreviation</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {ranks.length === 0 ? (
            <tr>
              <td colSpan="5" style={{ textAlign: 'center', color: '#888' }}>
                No ranks configured
              </td>
            </tr>
          ) : (
            ranks.map(rank => (
              <tr key={rank.id} className={!rank.active ? 'inactive-row' : ''}>
                <td>{rank.display_order}</td>
                <td>{rank.rank_name}</td>
                <td>{rank.abbreviation || '-'}</td>
                <td>
                  <span className={`badge ${rank.active ? 'badge-open' : 'badge-closed'}`}>
                    {rank.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(rank)}>
                      Edit
                    </button>
                    {rank.active && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(rank)}>
                        Deactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? 'Edit Rank' : 'Add Rank'}</h3>
            <form onSubmit={handleSubmit}>
              {error && <div className="form-error">{error}</div>}
              
              <div className="form-group">
                <label>Rank Name *</label>
                <input
                  type="text"
                  value={formData.rank_name}
                  onChange={(e) => handleChange('rank_name', e.target.value)}
                  placeholder="Firefighter"
                  required
                />
              </div>

              <div className="form-group">
                <label>Abbreviation</label>
                <input
                  type="text"
                  value={formData.abbreviation}
                  onChange={(e) => handleChange('abbreviation', e.target.value)}
                  placeholder="FF"
                  maxLength={10}
                />
              </div>

              <div className="form-group">
                <label>Display Order</label>
                <input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => handleChange('display_order', parseInt(e.target.value) || 100)}
                  min={1}
                  max={999}
                />
                <small>Lower number = higher rank (Chief=1, Captain=10, FF=100)</small>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editing ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================================
// PASSWORD TAB COMPONENT
// ============================================================================

function PasswordTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }

    setSaving(true);
    try {
      await changeAdminPassword(currentPassword, newPassword);
      setMessage({ type: 'success', text: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to change password' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="password-tab">
      <h3>Change Admin Password</h3>
      <form onSubmit={handleSubmit} className="password-form">
        {message && (
          <div className={`message ${message.type}`}>{message.text}</div>
        )}
        <div className="form-group">
          <label>Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="form-group">
          <label>Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}


// ============================================================================
// AUDIT LOG TAB COMPONENT
// ============================================================================

function AuditLogTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadLogs();
  }, [filter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const entityType = filter === 'all' ? null : filter;
      const res = await getAuditLog(100, entityType);
      setLogs(res.data);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return d.toLocaleString();
  };

  return (
    <div className="audit-log-tab">
      <div className="audit-header">
        <h3>Audit Log</h3>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All Actions</option>
          <option value="incident">Incidents Only</option>
        </select>
        <button onClick={loadLogs} disabled={loading}>Refresh</button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="empty">No audit log entries</div>
      ) : (
        <table className="audit-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>What</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td>{formatDate(log.created_at)}</td>
                <td>{log.personnel_name || '-'}</td>
                <td>{log.action}</td>
                <td>{log.entity_display || '-'}</td>
                <td>{log.summary || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}


// ============================================================================
// DATA EXPORT TAB COMPONENT
// ============================================================================

function DataExportTab() {
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [includeCAD, setIncludeCAD] = useState(true);
  const [exportType, setExportType] = useState('full'); // 'full' or 'incidents_only'
  
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const handleExport = async () => {
    setLoading(true);
    try {
      // Use the full export endpoint
      const endpoint = includeCAD 
        ? `/api/backup/full-export?year=${year}`
        : `/api/backup/full-export?year=${year}`;
      
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Export failed');
      
      const data = await response.json();
      
      // If not including CAD, strip the raw HTML fields
      if (!includeCAD && data.incidents) {
        data.incidents = data.incidents.map(inc => {
          const { cad_raw_dispatch, cad_raw_updates, cad_raw_clear, ...rest } = inc;
          return rest;
        });
      }
      
      // Create downloadable file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `department_data_${year}${includeCAD ? '_with_cad' : ''}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportAllYears = async () => {
    setLoading(true);
    try {
      const allData = {
        export_date: new Date().toISOString(),
        export_type: 'full_department_backup',
        years: {}
      };
      
      for (const y of years) {
        const response = await fetch(`/api/backup/full-export?year=${y}`);
        if (response.ok) {
          const data = await response.json();
          if (data.incidents && data.incidents.length > 0) {
            if (!includeCAD) {
              data.incidents = data.incidents.map(inc => {
                const { cad_raw_dispatch, cad_raw_updates, cad_raw_clear, ...rest } = inc;
                return rest;
              });
            }
            allData.years[y] = data;
          }
        }
      }
      
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `department_full_backup_${new Date().toISOString().split('T')[0]}${includeCAD ? '_with_cad' : ''}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="data-export-tab">
      <h3>Export Department Data</h3>
      <p style={{ color: '#888', marginBottom: '1.5rem' }}>
        Download your incident records, personnel assignments, and CAD data. 
        This is your data - export it anytime.
      </p>
      
      <div className="export-options">
        <div className="export-option">
          <label>Year</label>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        
        <div className="export-option">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input 
              type="checkbox" 
              checked={includeCAD} 
              onChange={(e) => setIncludeCAD(e.target.checked)}
            />
            Include raw CAD HTML
          </label>
          <span style={{ color: '#666', fontSize: '0.85rem' }}>
            Original dispatch/clear reports from county CAD system (larger file size)
          </span>
        </div>
      </div>
      
      <div className="export-actions" style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button 
          className="btn btn-primary" 
          onClick={handleExport}
          disabled={loading}
        >
          {loading ? 'Exporting...' : `📥 Export ${year} Data`}
        </button>
        
        <button 
          className="btn btn-secondary" 
          onClick={handleExportAllYears}
          disabled={loading}
        >
          {loading ? 'Exporting...' : '📦 Export All Years'}
        </button>
      </div>
      
      <div style={{ marginTop: '2rem', padding: '1rem', background: '#2a2a2a', borderRadius: '4px' }}>
        <h4 style={{ marginBottom: '0.5rem' }}>What's included:</h4>
        <ul style={{ color: '#888', marginLeft: '1.5rem' }}>
          <li>All incident records with full details</li>
          <li>Personnel assignments per incident</li>
          <li>Unit/apparatus response data</li>
          <li>NERIS classification codes</li>
          <li>Timestamps and audit information</li>
          {includeCAD && <li>Raw CAD dispatch and clear reports (HTML)</li>}
        </ul>
      </div>
    </div>
  );
}


// ============================================================================
// PRINT SETTINGS TAB COMPONENT
// ============================================================================

const PRINT_SETTING_LABELS = {
  showHeader: { label: 'Header', desc: 'Station name and "Incident Report" title' },
  showTimes: { label: 'Response Times', desc: 'Dispatched, Enroute, On Scene, etc.' },
  showLocation: { label: 'Location', desc: 'Address of incident' },
  showCrossStreets: { label: 'Cross Streets', desc: 'Nearby intersections' },
  showDispatchInfo: { label: 'Dispatch Info', desc: 'CAD type and subtype' },
  showCadUnits: { label: 'Units Called', desc: 'List of units dispatched' },
  showSituationFound: { label: 'Situation Found', desc: 'What was found on arrival' },
  showExtentOfDamage: { label: 'Extent of Damage', desc: 'Damage description' },
  showServicesProvided: { label: 'Services Provided', desc: 'Actions taken' },
  showNarrative: { label: 'Narrative', desc: 'Detailed incident description' },
  showEquipmentUsed: { label: 'Equipment Used', desc: 'Tools and equipment list' },
  showPersonnelGrid: { label: 'Personnel Grid', desc: 'Who responded on each unit' },
  showOfficerInfo: { label: 'Officer Info', desc: 'OIC and Report Completed By' },
  showProblemsIssues: { label: 'Problems/Issues', desc: 'Issues encountered' },
  showWeather: { label: 'Weather', desc: 'Weather conditions' },
  showCallerInfo: { label: 'Caller Info', desc: 'Caller name and phone (privacy)' },
  showNerisInfo: { label: 'NERIS Codes', desc: 'Federal reporting classifications' },
};

function PrintSettingsTab() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await getPrintSettings();
      setSettings(res.data);
    } catch (err) {
      console.error('Failed to load print settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updatePrintSettings(settings);
      setMessage({ type: 'success', text: 'Print settings saved' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading print settings...</div>;

  const headerGroup = ['showHeader', 'showWeather'];
  const timesGroup = ['showTimes'];
  const locationGroup = ['showLocation', 'showCrossStreets', 'showDispatchInfo', 'showCadUnits'];
  const narrativeGroup = ['showSituationFound', 'showExtentOfDamage', 'showServicesProvided', 'showNarrative'];
  const personnelGroup = ['showPersonnelGrid', 'showOfficerInfo', 'showEquipmentUsed'];
  const otherGroup = ['showProblemsIssues', 'showCallerInfo', 'showNerisInfo'];

  const renderGroup = (title, keys) => (
    <div className="print-settings-group" style={{ marginBottom: '1rem' }}>
      <h4 style={{ marginBottom: '0.5rem', color: '#888' }}>{title}</h4>
      {keys.map(key => {
        const info = PRINT_SETTING_LABELS[key] || { label: key, desc: '' };
        return (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings[key] ?? true}
              onChange={() => handleToggle(key)}
            />
            <span style={{ fontWeight: '500' }}>{info.label}</span>
            <span style={{ color: '#666', fontSize: '0.85rem' }}>— {info.desc}</span>
          </label>
        );
      })}
    </div>
  );

  return (
    <div className="print-settings-tab">
      <h3>Print Layout Settings</h3>
      <p className="tab-intro">
        Choose which sections appear on printed incident reports. Changes apply to all users.
      </p>

      {message && (
        <div className={`message ${message.type}`} style={{ marginBottom: '1rem' }}>{message.text}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        {renderGroup('Header', headerGroup)}
        {renderGroup('Times', timesGroup)}
        {renderGroup('Location & Dispatch', locationGroup)}
        {renderGroup('Incident Details', narrativeGroup)}
        {renderGroup('Personnel & Equipment', personnelGroup)}
        {renderGroup('Other', otherGroup)}
      </div>

      <button 
        className="btn btn-primary" 
        onClick={handleSave} 
        disabled={saving}
        style={{ marginTop: '1rem' }}
      >
        {saving ? 'Saving...' : 'Save Print Settings'}
      </button>
    </div>
  );
}


// ============================================================================
// ADMIN LOGIN FORM
// ============================================================================

function AdminLoginForm({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await verifyAdminPassword(password);
      setAdminAuthenticated(true);
      onLogin();
    } catch (err) {
      setError('Invalid password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="login-box">
        <h2>Admin Access</h2>
        <p>Enter password to access admin settings</p>
        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}


// ============================================================================
// MAIN ADMIN PAGE COMPONENT
// ============================================================================

function AdminPage({ isAuthenticated, onLogin, onLogout }) {
  const [activeTab, setActiveTab] = useState('settings');

  if (!isAuthenticated) {
    return (
      <div className="admin-page">
        <h2>Admin</h2>
        <AdminLoginForm onLogin={onLogin} />
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>Admin</h2>
        <button className="btn-logout" onClick={onLogout}>Logout</button>
      </div>
      
      <div className="admin-tabs">
        <button 
          className={activeTab === 'settings' ? 'active' : ''} 
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Settings
        </button>
        <button 
          className={activeTab === 'sequence' ? 'active' : ''} 
          onClick={() => setActiveTab('sequence')}
        >
          🔢 Incident Sequence
        </button>
        <button 
          className={activeTab === 'neris' ? 'active' : ''} 
          onClick={() => setActiveTab('neris')}
        >
          📋 NERIS Codes
        </button>
        <button 
          className={activeTab === 'personnel' ? 'active' : ''} 
          onClick={() => setActiveTab('personnel')}
        >
          👥 Personnel
        </button>
        <button 
          className={activeTab === 'ranks' ? 'active' : ''} 
          onClick={() => setActiveTab('ranks')}
        >
          🎖️ Ranks
        </button>
        <button 
          className={activeTab === 'apparatus' ? 'active' : ''} 
          onClick={() => setActiveTab('apparatus')}
        >
          🚒 Units
        </button>
        <button 
          className={activeTab === 'municipalities' ? 'active' : ''} 
          onClick={() => setActiveTab('municipalities')}
        >
          🏘️ Municipalities
        </button>
        <button 
          className={activeTab === 'audit' ? 'active' : ''} 
          onClick={() => setActiveTab('audit')}
        >
          📝 Audit Log
        </button>
        <button 
          className={activeTab === 'password' ? 'active' : ''} 
          onClick={() => setActiveTab('password')}
        >
          🔑 Password
        </button>
        <button 
          className={activeTab === 'export' ? 'active' : ''} 
          onClick={() => setActiveTab('export')}
        >
          📥 Export Data
        </button>
        <button 
          className={activeTab === 'print' ? 'active' : ''} 
          onClick={() => setActiveTab('print')}
        >
          🖨️ Print Layout
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'sequence' && <IncidentSequenceTab />}
        {activeTab === 'neris' && <NerisCodesTab />}
        {activeTab === 'personnel' && <PersonnelPage embedded />}
        {activeTab === 'ranks' && <RanksTab />}
        {activeTab === 'apparatus' && <ApparatusPage embedded />}
        {activeTab === 'municipalities' && <MunicipalitiesPage embedded />}
        {activeTab === 'audit' && <AuditLogTab />}
        {activeTab === 'password' && <PasswordTab />}
        {activeTab === 'export' && <DataExportTab />}
        {activeTab === 'print' && <PrintSettingsTab />}
      </div>
    </div>
  );
}

export default AdminPage;