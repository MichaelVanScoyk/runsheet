import { useState, useEffect, useRef } from 'react';
import './AdminPage.css';
import PersonnelPage from './PersonnelPage';
import ApparatusPage from './ApparatusPage';
import MunicipalitiesPage from './MunicipalitiesPage';

const API_BASE = 'http://192.168.1.189:8001';

// ============================================================================
// SETTINGS TAB COMPONENT
// ============================================================================

function SettingsTab() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [editingUnits, setEditingUnits] = useState(false);
  const [unitsText, setUnitsText] = useState('');
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
      
      if (data.units?.find(s => s.key === 'station_units')) {
        const unitsVal = data.units.find(s => s.key === 'station_units').value;
        setUnitsText(Array.isArray(unitsVal) ? unitsVal.join(', ') : unitsVal);
      }
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

  const saveUnits = async () => {
    const units = unitsText.split(',').map(u => u.trim()).filter(u => u);
    await updateSetting('units', 'station_units', JSON.stringify(units));
    setEditingUnits(false);
  };

  const renderSetting = (setting) => {
    const isSaving = saving === `${setting.category}.${setting.key}`;
    
    if (setting.key === 'station_units') {
      return (
        <div key={setting.key} className="setting-item setting-units">
          <div className="setting-header">
            <label>{formatLabel(setting.key)}</label>
            <span className="setting-desc">{setting.description}</span>
          </div>
          {editingUnits ? (
            <div className="units-edit">
              <textarea
                value={unitsText}
                onChange={(e) => setUnitsText(e.target.value)}
                placeholder="ENG481, ENG482, CHF48, etc."
                rows={3}
              />
              <div className="units-buttons">
                <button onClick={saveUnits} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setEditingUnits(false)} className="cancel">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="units-display">
              <div className="units-list">
                {Array.isArray(setting.value) 
                  ? setting.value.map((u, i) => <span key={i} className="unit-badge">{u}</span>)
                  : <span>{setting.raw_value}</span>
                }
              </div>
              <button onClick={() => setEditingUnits(true)}>Edit</button>
            </div>
          )}
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
          value={setting.raw_value || ''}
          onChange={(e) => updateSetting(setting.category, setting.key, e.target.value)}
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
// MAIN ADMIN PAGE COMPONENT
// ============================================================================

function AdminPage() {
  const [activeTab, setActiveTab] = useState('settings');

  return (
    <div className="admin-page">
      <h2>Admin</h2>
      
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
          className={activeTab === 'apparatus' ? 'active' : ''} 
          onClick={() => setActiveTab('apparatus')}
        >
          🚒 Apparatus
        </button>
        <button 
          className={activeTab === 'municipalities' ? 'active' : ''} 
          onClick={() => setActiveTab('municipalities')}
        >
          🏘️ Municipalities
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'sequence' && <IncidentSequenceTab />}
        {activeTab === 'neris' && <NerisCodesTab />}
        {activeTab === 'personnel' && <PersonnelPage embedded />}
        {activeTab === 'apparatus' && <ApparatusPage embedded />}
        {activeTab === 'municipalities' && <MunicipalitiesPage embedded />}
      </div>
    </div>
  );
}

export default AdminPage;