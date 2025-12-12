import { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://192.168.1.189:8001/api';

export default function NerisCodesPage() {
  const [activeTab, setActiveTab] = useState('browse');
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
      const res = await fetch(`${API_BASE}/neris-codes/categories`);
      if (res.ok) setCategories(await res.json());
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const loadCodes = async (category) => {
    setLoading(true);
    setSelectedCategory(category);
    try {
      const res = await fetch(`${API_BASE}/neris-codes/categories/${category}?include_inactive=true`);
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
        `${API_BASE}/neris-codes/import?category=${importCategory}&mode=${importMode}`,
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
        fetch(`${API_BASE}/neris-codes/validate?year=${validationYear}`).then(r => r.json()),
        fetch(`${API_BASE}/neris-codes/validate/apparatus`).then(r => r.json())
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
      const res = await fetch(`${API_BASE}/neris-codes/update-incidents`, {
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
      await fetch(`${API_BASE}/neris-codes/codes/${codeId}`, {
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
    <div className="neris-page">
      <div className="page-header">
        <h2>NERIS Code Management</h2>
      </div>
      
      <div className="neris-tabs">
        <button className={activeTab === 'browse' ? 'active' : ''} onClick={() => setActiveTab('browse')}>
          Browse Codes
        </button>
        <button className={activeTab === 'import' ? 'active' : ''} onClick={() => setActiveTab('import')}>
          Import
        </button>
        <button className={activeTab === 'validate' ? 'active' : ''} onClick={() => setActiveTab('validate')}>
          Validate
        </button>
        <button className={activeTab === 'update' ? 'active' : ''} onClick={() => setActiveTab('update')}>
          Update Incidents
        </button>
      </div>

      {/* BROWSE TAB */}
      {activeTab === 'browse' && (
        <div className="browse-layout">
          <div className="categories-panel">
            <h3>Categories</h3>
            <div className="category-list">
              {priorityCategories.map(cat => {
                const catData = categories.find(c => c.category === cat);
                return (
                  <button
                    key={cat}
                    className={`category-btn ${selectedCategory === cat ? 'selected' : ''}`}
                    onClick={() => loadCodes(cat)}
                  >
                    <span>{getCategoryName(cat)}</span>
                    <span className="count">{catData ? `${catData.active}/${catData.total}` : '0'}</span>
                  </button>
                );
              })}
            </div>
            {categories.filter(c => !priorityCategories.includes(c.category)).length > 0 && (
              <>
                <h4>Other</h4>
                <div className="category-list other">
                  {categories.filter(c => !priorityCategories.includes(c.category)).map(cat => (
                    <button
                      key={cat.category}
                      className={`category-btn ${selectedCategory === cat.category ? 'selected' : ''}`}
                      onClick={() => loadCodes(cat.category)}
                    >
                      <span>{getCategoryName(cat.category)}</span>
                      <span className="count">{cat.active}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="codes-panel">
            {selectedCategory ? (
              <>
                <h3>{getCategoryName(selectedCategory)}</h3>
                <p className="info">{codes.length} codes ({codes.filter(c => c.active).length} active)</p>
                
                {loading ? <p className="loading">Loading...</p> : (
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Description</th>
                          <th>Active</th>
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
                                {code.active ? '✓ On' : '✗ Off'}
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
              <p className="placeholder">Select a category to view codes</p>
            )}
          </div>
        </div>
      )}

      {/* IMPORT TAB */}
      {activeTab === 'import' && (
        <div className="import-section">
          <div className="panel">
            <h3>Import NERIS Codes from CSV</h3>
            <p className="info">
              Download official CSV files from{' '}
              <a href="https://github.com/ulfsri/neris-framework/tree/main/core_schemas/value_sets/csv" target="_blank" rel="noreferrer">
                github.com/ulfsri/neris-framework
              </a>
            </p>
            
            <form onSubmit={handleImport}>
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
              <div className={`result-box ${importResult.error ? 'error' : 'success'}`}>
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
        </div>
      )}

      {/* VALIDATE TAB */}
      {activeTab === 'validate' && (
        <div className="validate-section">
          <div className="panel">
            <h3>Validate Incident Data</h3>
            <p className="info">Find incidents using codes that don't exist in the current NERIS code set.</p>
            
            <div className="form-row">
              <div className="form-group">
                <label>Year</label>
                <select value={validationYear} onChange={(e) => setValidationYear(e.target.value)}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="form-group" style={{display: 'flex', alignItems: 'flex-end'}}>
                <button className="btn btn-primary" onClick={handleValidate} disabled={loading}>
                  {loading ? 'Validating...' : 'Run Validation'}
                </button>
              </div>
            </div>

            {validationResults && (
              <div className="validation-results">
                <h4>Results for {validationResults.year}</h4>
                
                {validationResults.total_issues === 0 ? (
                  <p className="success-msg">✓ All incidents have valid codes</p>
                ) : (
                  <>
                    {validationResults.issues.incident_type.length > 0 && (
                      <div className="issue-group">
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
                      <div className="issue-group">
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
                      <div className="issue-group">
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
              <div className="issue-group">
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
        </div>
      )}

      {/* UPDATE TAB */}
      {activeTab === 'update' && (
        <div className="update-section">
          <div className="panel">
            <h3>Update Incident Codes</h3>
            <p className="info">Replace an old/invalid code with a new valid code across multiple incidents.</p>
            
            <form onSubmit={handleUpdate}>
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
                <label>Year (optional - leave blank for all years)</label>
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
              <div className={`result-box ${updateResult.error ? 'error' : 'success'}`}>
                {updateResult.error ? (
                  <p>Error: {updateResult.error}</p>
                ) : (
                  <p>✓ Updated {updateResult.incidents_updated} incident(s)</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .neris-page {
          color: #ccc;
        }
        
        .neris-tabs {
          display: flex;
          gap: 0;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid #0f3460;
        }
        
        .neris-tabs button {
          padding: 0.75rem 1.25rem;
          border: none;
          background: transparent;
          color: #888;
          cursor: pointer;
          font-size: 0.9rem;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: all 0.2s;
        }
        
        .neris-tabs button:hover {
          color: #ccc;
        }
        
        .neris-tabs button.active {
          color: #e94560;
          border-bottom-color: #e94560;
        }
        
        .browse-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 1.5rem;
        }
        
        .categories-panel {
          background: #16213e;
          border-radius: 8px;
          padding: 1rem;
        }
        
        .categories-panel h3 {
          color: #e94560;
          font-size: 1rem;
          margin-bottom: 1rem;
        }
        
        .categories-panel h4 {
          color: #888;
          font-size: 0.8rem;
          margin: 1rem 0 0.5rem;
          text-transform: uppercase;
        }
        
        .category-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .category-list.other {
          max-height: 200px;
          overflow-y: auto;
        }
        
        .category-btn {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          padding: 0.6rem 0.75rem;
          border: none;
          background: #1a1a2e;
          color: #ccc;
          cursor: pointer;
          border-radius: 4px;
          font-size: 0.85rem;
          text-align: left;
          transition: all 0.2s;
        }
        
        .category-btn:hover {
          background: #0f3460;
        }
        
        .category-btn.selected {
          background: #e94560;
          color: white;
        }
        
        .category-btn .count {
          font-size: 0.75rem;
          opacity: 0.7;
        }
        
        .codes-panel {
          background: #16213e;
          border-radius: 8px;
          padding: 1rem;
        }
        
        .codes-panel h3 {
          color: #e94560;
          font-size: 1rem;
          margin-bottom: 0.25rem;
        }
        
        .info {
          color: #888;
          font-size: 0.85rem;
          margin-bottom: 1rem;
        }
        
        .info a {
          color: #4ecdc4;
        }
        
        .placeholder {
          color: #666;
          text-align: center;
          padding: 3rem;
        }
        
        .panel {
          background: #16213e;
          border-radius: 8px;
          padding: 1.5rem;
          max-width: 600px;
        }
        
        .panel h3 {
          color: #e94560;
          font-size: 1.1rem;
          margin-bottom: 0.5rem;
        }
        
        .result-box {
          margin-top: 1rem;
          padding: 1rem;
          border-radius: 6px;
        }
        
        .result-box.success {
          background: rgba(39, 174, 96, 0.2);
          border: 1px solid #27ae60;
        }
        
        .result-box.error {
          background: rgba(192, 57, 43, 0.2);
          border: 1px solid #c0392b;
        }
        
        .validation-results {
          margin-top: 1.5rem;
        }
        
        .validation-results h4 {
          color: #ccc;
          margin-bottom: 1rem;
        }
        
        .success-msg {
          color: #27ae60;
          font-weight: 500;
        }
        
        .issue-group {
          margin-bottom: 1.5rem;
        }
        
        .issue-group h5 {
          color: #f39c12;
          margin-bottom: 0.5rem;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}