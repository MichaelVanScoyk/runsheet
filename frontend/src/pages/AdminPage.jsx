import { useState, useEffect, useRef } from 'react';
import { getAuditLog, getRanks, createRank, updateRank, deleteRank, getPrintSettings, updatePrintSettings, getPrintLayout, updatePrintLayout, resetPrintLayout, getIncidentYears, getFeatures, updateFeatures, getCadSettings, updateCadSettings } from '../api';
import { useBranding } from '../contexts/BrandingContext';
import { formatDateTimeLocal } from '../utils/timeUtils';
import './AdminPage.css';
import PersonnelPage from './PersonnelPage';
import ApparatusPage from './ApparatusPage';
import MunicipalitiesPage from './MunicipalitiesPage';
import PrintLayoutTab from './PrintLayoutTab';
import AVAlertsTab from './AVAlertsTab';
import DetailTypesTab from './DetailTypesTab';
import HelpAdminTab from './HelpAdminTab';
import { useHelp } from '../contexts/HelpContext';

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
    
    // Hide station identity fields - now managed in Admin > Branding
    const brandingManagedKeys = ['name', 'number', 'short_name', 'tagline'];
    if (setting.category === 'station' && brandingManagedKeys.includes(setting.key)) {
      return (
        <div key={setting.key} className="setting-item" style={{ opacity: 0.5 }}>
          <div className="setting-header">
            <label>{formatLabel(setting.key)}</label>
            <span className="setting-desc" style={{ color: '#f59e0b' }}>
              ⚠️ Now managed in Admin → Branding tab
            </span>
          </div>
          <input type="text" value={setting.raw_value || ''} disabled style={{ color: '#888' }} />
        </div>
      );
    }
    
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

const CATEGORY_CONFIG = {
  FIRE: { label: 'Fire', color: '#dc2626', icon: '🔥' },
  EMS: { label: 'EMS', color: '#2563eb', icon: '🚑' },
  DETAIL: { label: 'Detail', color: '#8b5cf6', icon: '📋' },
};

function IncidentSequenceTab() {
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([new Date().getFullYear()]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState(null);

  // Load available years on mount
  useEffect(() => {
    const loadYears = async () => {
      try {
        const res = await getIncidentYears();
        if (res.data.years && res.data.years.length > 0) {
          setAvailableYears(res.data.years);
        }
      } catch (err) {
        console.error('Failed to load years:', err);
      }
    };
    loadYears();
  }, []);

  // Load status for all categories when year changes
  useEffect(() => {
    loadStatus();
  }, [year]);

  const loadStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/incidents/admin/sequence-status?year=${year}`);
      const result = await res.json();
      setStatus(result);
    } catch (err) {
      console.error('Failed to load sequence status:', err);
    } finally {
      setStatusLoading(false);
    }
  };

  // Load sequence for selected category
  useEffect(() => {
    if (selectedCategory) {
      loadSequence(selectedCategory);
    }
  }, [selectedCategory, year]);

  const loadSequence = async (category) => {
    setLoading(true);
    setFixResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/incidents/admin/sequence?year=${year}&category=${category}`);
      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error('Failed to load sequence:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFixAll = async () => {
    if (!selectedCategory) return;
    setFixing(true);
    setShowConfirm(false);
    try {
      const res = await fetch(`${API_BASE}/api/incidents/admin/fix-sequence?year=${year}&category=${selectedCategory}`, {
        method: 'POST',
      });
      const result = await res.json();
      setFixResult(result);
      await loadSequence(selectedCategory);
      await loadStatus();
    } catch (err) {
      console.error('Failed to fix sequence:', err);
      setFixResult({ status: 'error', message: 'Failed to fix sequence' });
    } finally {
      setFixing(false);
    }
  };

  const handleCategoryClick = (category) => {
    setSelectedCategory(category);
    setFixResult(null);
  };

  const hasIssues = data?.out_of_sequence_count > 0;

  return (
    <div className="sequence-content">
      {/* Year Selector */}
      <div className="sequence-header" style={{ marginBottom: '1rem' }}>
        <div className="sequence-year-selector">
          <label>Year:</label>
          <select value={year} onChange={(e) => { setYear(parseInt(e.target.value)); setSelectedCategory(null); setData(null); }}>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Category Buttons with Status */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {Object.entries(CATEGORY_CONFIG).map(([cat, config]) => {
          const catStatus = status?.[cat.toLowerCase()];
          const outOfSeq = catStatus?.out_of_sequence || 0;
          const total = catStatus?.total || 0;
          const isSelected = selectedCategory === cat;
          
          return (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              style={{
                flex: '1',
                minWidth: '150px',
                padding: '1rem',
                background: isSelected ? config.color : '#f5f5f5',
                color: isSelected ? '#fff' : '#333',
                border: `2px solid ${config.color}`,
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{config.icon}</div>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{config.label}</div>
              {statusLoading ? (
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Loading...</div>
              ) : outOfSeq > 0 ? (
                <div style={{ 
                  fontSize: '0.85rem', 
                  color: isSelected ? '#fef2f2' : '#dc2626',
                  fontWeight: 'bold'
                }}>
                  ⚠️ {outOfSeq} out of sequence
                </div>
              ) : (
                <div style={{ 
                  fontSize: '0.85rem', 
                  color: isSelected ? '#d1fae5' : '#22c55e' 
                }}>
                  ✓ {total} in order
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Category Content */}
      {selectedCategory && (
        <>
          {loading ? (
            <div className="loading">Loading {CATEGORY_CONFIG[selectedCategory].label} incidents...</div>
          ) : (
            <>
              {/* Status Banner */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                {hasIssues ? (
                  <div className="sequence-banner warning" style={{ flex: 1, marginRight: '1rem' }}>
                    ⚠️ {data.out_of_sequence_count} {CATEGORY_CONFIG[selectedCategory].label} incident{data.out_of_sequence_count !== 1 ? 's' : ''} out of sequence
                  </div>
                ) : (
                  <div className="sequence-banner success" style={{ flex: 1, marginRight: '1rem' }}>
                    ✓ All {data?.total_incidents || 0} {CATEGORY_CONFIG[selectedCategory].label} incidents are in correct sequence
                  </div>
                )}
                
                {hasIssues && (
                  <button 
                    className="btn btn-fix" 
                    onClick={() => setShowConfirm(true)}
                    disabled={fixing}
                    style={{ background: CATEGORY_CONFIG[selectedCategory].color }}
                  >
                    {fixing ? 'Fixing...' : `Fix All (${data.out_of_sequence_count})`}
                  </button>
                )}
              </div>

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
            </>
          )}
        </>
      )}

      {/* No category selected message */}
      {!selectedCategory && !statusLoading && (
        <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
          Select a category above to view and fix incident sequences
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Fix {CATEGORY_CONFIG[selectedCategory]?.label} Sequence</h3>
            <p style={{ margin: '0 0 1rem 0' }}>This will renumber {data.changes_preview?.length || 0} incident{(data.changes_preview?.length || 0) !== 1 ? 's' : ''}:</p>
            
            <div className="changes-preview" style={{ flex: 1, overflowY: 'auto', maxHeight: '50vh', marginBottom: '1rem', border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem' }}>
              {data.changes_preview?.map((change, idx) => (
                <div key={idx} className="change-item">
                  <span className="change-number">{change.current_number}</span>
                  <span className="change-arrow">→</span>
                  <span className="change-number new">{change.new_number}</span>
                  <span className="change-date">({change.date})</span>
                </div>
              ))}
            </div>
            
            <div className="modal-actions" style={{ flexShrink: 0, paddingTop: '0.5rem', borderTop: '1px solid #eee' }}>
              <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleFixAll} style={{ background: CATEGORY_CONFIG[selectedCategory]?.color }}>
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


// PasswordTab REMOVED - shared admin password eliminated
// Admin page access is now gated by personnel role (OFFICER/ADMIN)
// Users change their own password via Profile > Change Password


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
    return formatDateTimeLocal(isoString);
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
      <h3 style={{ color: 'var(--primary-color)' }}>Export Department Data</h3>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
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
      
      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f8f8f8', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#333' }}>What's included:</h4>
        <ul style={{ color: '#666', marginLeft: '1.5rem' }}>
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
// BRANDING TAB COMPONENT
// ============================================================================

function BrandingTab({ onRefresh }) {
  const [logo, setLogo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [savingColors, setSavingColors] = useState(false);
  const [pickingFor, setPickingFor] = useState(null); // 'primary' or 'secondary'
  
  // Station identity state
  const [stationName, setStationName] = useState('');
  const [stationNumber, setStationNumber] = useState('');
  const [stationShortName, setStationShortName] = useState('');
  const [stationTagline, setStationTagline] = useState('');
  const [savedIdentity, setSavedIdentity] = useState({ name: '', number: '', short_name: '', tagline: '' });
  const [savingIdentity, setSavingIdentity] = useState(false);
  
  // Color state - local until saved
  const [primaryColor, setPrimaryColor] = useState('#016a2b');
  const [secondaryColor, setSecondaryColor] = useState('#eeee01');
  const [savedPrimary, setSavedPrimary] = useState('#016a2b');
  const [savedSecondary, setSavedSecondary] = useState('#eeee01');
  
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    loadBranding();
  }, []);

  const loadBranding = async () => {
    try {
      // Load logo
      const logoRes = await fetch(`${API_BASE}/api/settings/branding/logo`);
      const logoData = await logoRes.json();
      setLogo(logoData);
      
      // Load station identity fields
      const identityKeys = [
        { key: 'name', setter: setStationName },
        { key: 'number', setter: setStationNumber },
        { key: 'short_name', setter: setStationShortName },
        { key: 'tagline', setter: setStationTagline },
      ];
      const identityValues = {};
      for (const { key, setter } of identityKeys) {
        try {
          const res = await fetch(`${API_BASE}/api/settings/station/${key}`);
          if (res.ok) {
            const data = await res.json();
            const val = data.raw_value || '';
            setter(val);
            identityValues[key] = val;
          }
        } catch (e) { /* use default */ }
      }
      setSavedIdentity(identityValues);
      
      // Load colors (404 is OK - means not set yet)
      try {
        const primaryRes = await fetch(`${API_BASE}/api/settings/branding/primary_color`);
        if (primaryRes.ok) {
          const data = await primaryRes.json();
          if (data.raw_value) {
            setPrimaryColor(data.raw_value);
            setSavedPrimary(data.raw_value);
          }
        }
      } catch (e) { /* use default */ }
      
      try {
        const secondaryRes = await fetch(`${API_BASE}/api/settings/branding/secondary_color`);
        if (secondaryRes.ok) {
          const data = await secondaryRes.json();
          if (data.raw_value) {
            setSecondaryColor(data.raw_value);
            setSavedSecondary(data.raw_value);
          }
        }
      } catch (e) { /* use default */ }
      
    } catch (err) {
      console.error('Failed to load branding:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const hasIdentityChanges = stationName !== (savedIdentity.name || '') 
    || stationNumber !== (savedIdentity.number || '') 
    || stationShortName !== (savedIdentity.short_name || '') 
    || stationTagline !== (savedIdentity.tagline || '');

  const saveIdentity = async () => {
    setSavingIdentity(true);
    setMessage(null);
    
    try {
      const fields = [
        { key: 'name', value: stationName },
        { key: 'number', value: stationNumber },
        { key: 'short_name', value: stationShortName },
        { key: 'tagline', value: stationTagline },
      ];
      
      for (const { key, value } of fields) {
        await fetch(`${API_BASE}/api/settings/station/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        });
      }
      
      setSavedIdentity({ name: stationName, number: stationNumber, short_name: stationShortName, tagline: stationTagline });
      setMessage({ type: 'success', text: 'Station identity saved' });
      
      if (onRefresh) onRefresh();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save station identity' });
    } finally {
      setSavingIdentity(false);
    }
  };

  // Draw logo to canvas when logo loads (for eyedropper)
  useEffect(() => {
    if (logo?.has_logo && logo?.data && imgRef.current && canvasRef.current) {
      const img = imgRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      const drawToCanvas = () => {
        console.log('Drawing to canvas:', img.naturalWidth, 'x', img.naturalHeight);
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        console.log('Canvas drawn, dimensions:', canvas.width, 'x', canvas.height);
      };
      
      img.onload = drawToCanvas;
      
      // If already loaded
      if (img.complete && img.naturalWidth > 0) {
        drawToCanvas();
      }
    }
  }, [logo]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setMessage({ type: 'error', text: 'Please select a PNG, JPEG, GIF, or WebP image' });
      return;
    }

    if (file.size > 500 * 1024) {
      setMessage({ type: 'error', text: 'Image must be under 500KB' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        console.log('Uploading logo, data length:', base64.length);
        
        const res = await fetch(`${API_BASE}/api/settings/branding/logo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: base64, filename: file.name })
        });

        if (res.ok) {
          setMessage({ type: 'success', text: 'Logo uploaded successfully' });
          // Reload to get fresh data
          await loadBranding();
        } else {
          const err = await res.json();
          console.error('Upload failed:', err);
          setMessage({ type: 'error', text: err.detail || 'Upload failed' });
        }
        setUploading(false);
      };
      reader.onerror = () => {
        setMessage({ type: 'error', text: 'Failed to read file' });
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Upload error:', err);
      setMessage({ type: 'error', text: 'Upload failed: ' + err.message });
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove the department logo?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/settings/branding/logo`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Logo removed' });
        setLogo({ has_logo: false });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete logo' });
    }
  };

  // Pick color from logo image
  const handleImageClick = (e) => {
    if (!pickingFor || !canvasRef.current || !imgRef.current) return;
    
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const rect = img.getBoundingClientRect();
    
    // Always redraw to ensure canvas has current image
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    
    console.log('Click:', { clientX: e.clientX, clientY: e.clientY });
    console.log('Image rect:', rect);
    console.log('Canvas:', canvas.width, 'x', canvas.height);
    console.log('Pixel coords:', x, y);
    
    // Bounds check
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
      console.log('Click outside image bounds');
      setPickingFor(null);
      return;
    }
    
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    console.log('Pixel RGBA:', pixel[0], pixel[1], pixel[2], pixel[3]);
    
    const hex = '#' + [pixel[0], pixel[1], pixel[2]]
      .map(v => v.toString(16).padStart(2, '0'))
      .join('');
    
    console.log('Picked:', hex);
    
    if (pickingFor === 'primary') {
      setPrimaryColor(hex);
    } else {
      setSecondaryColor(hex);
    }
    setPickingFor(null);
  };

  // Validate and normalize hex input
  const normalizeHex = (value) => {
    let hex = value.replace(/[^0-9a-fA-F#]/g, '');
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (hex.length > 7) hex = hex.slice(0, 7);
    return hex;
  };

  const handleHexInput = (value, setter) => {
    const normalized = normalizeHex(value);
    setter(normalized);
  };

  const saveColors = async () => {
    setSavingColors(true);
    setMessage(null);
    
    try {
      // Save primary color
      await fetch(`${API_BASE}/api/settings/branding/primary_color`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: primaryColor })
      });
      
      // Save secondary color
      await fetch(`${API_BASE}/api/settings/branding/secondary_color`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: secondaryColor })
      });
      
      setSavedPrimary(primaryColor);
      setSavedSecondary(secondaryColor);
      setMessage({ type: 'success', text: 'Colors saved successfully' });
      
      // Refresh branding context to update UI immediately
      if (onRefresh) onRefresh();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save colors' });
    } finally {
      setSavingColors(false);
    }
  };

  const hasColorChanges = primaryColor !== savedPrimary || secondaryColor !== savedSecondary;

  // Build image src
  const logoSrc = logo?.has_logo && logo?.data && logo?.mime_type
    ? `data:${logo.mime_type};base64,${logo.data}`
    : null;

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="branding-tab">
      <h3 style={{ color: 'var(--primary-color)' }}>Department Branding</h3>
      <p className="tab-intro">
        Set your department's identity, logo, and brand colors. These appear throughout the UI and PDF reports.
      </p>

      {message && (
        <div className={`message ${message.type}`} style={{ marginBottom: '1rem' }}>
          {message.text}
        </div>
      )}

      <div className="branding-content" style={{ maxWidth: '500px' }}>

        {/* Station Identity */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ marginBottom: '0.75rem', color: '#333' }}>Identity</h4>
          
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontWeight: '500', color: '#555', marginBottom: '0.25rem' }}>Organization Name</label>
            <input
              type="text"
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
            />
            <small style={{ color: '#888' }}>Sidebar, browser tab, PDF reports</small>
          </div>
          
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ display: 'block', fontWeight: '500', color: '#555', marginBottom: '0.25rem' }}>Station / Unit Number</label>
              <input
                type="text"
                value={stationNumber}
                onChange={(e) => setStationNumber(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
              />
              <small style={{ color: '#888' }}>Browser tab favicon, PDF header</small>
            </div>
            
            <div className="form-group" style={{ flex: 2 }}>
              <label style={{ display: 'block', fontWeight: '500', color: '#555', marginBottom: '0.25rem' }}>Short Name / Abbreviation</label>
              <input
                type="text"
                value={stationShortName}
                onChange={(e) => setStationShortName(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
              />
              <small style={{ color: '#888' }}>Incidents page header, PDF footer</small>
            </div>
          </div>
          
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontWeight: '500', color: '#555', marginBottom: '0.25rem' }}>Tagline</label>
            <input
              type="text"
              value={stationTagline}
              onChange={(e) => setStationTagline(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
            />
            <small style={{ color: '#888' }}>Optional — displayed on PDF reports</small>
          </div>
          
          <button
            className="btn btn-primary"
            onClick={saveIdentity}
            disabled={savingIdentity || !hasIdentityChanges}
          >
            {savingIdentity ? 'Saving...' : 'Save Identity'}
          </button>
          {hasIdentityChanges && (
            <span style={{ marginLeft: '1rem', color: '#f39c12', fontSize: '0.85rem' }}>
              Unsaved changes
            </span>
          )}
        </div>

        <div style={{ borderTop: '1px solid #ddd', paddingTop: '1.5rem' }}>
        <h4 style={{ marginBottom: '0.75rem', color: '#333' }}>Logo</h4>
        </div>
        
        {/* Logo Preview - clickable for eyedropper */}
        <div 
          className="logo-preview" 
          style={{
            background: '#f5f5f5',
            borderRadius: '8px',
            padding: '1.5rem',
            textAlign: 'center',
            border: pickingFor ? '2px solid var(--primary-color)' : '2px dashed #ccc',
            cursor: pickingFor && logo?.has_logo ? 'crosshair' : 'default',
            position: 'relative'
          }}
          onClick={logo?.has_logo ? handleImageClick : undefined}
        >
          {logoSrc ? (
            <>
              <img 
                ref={imgRef}
                src={logoSrc}
                alt="Department Logo"
                style={{ maxWidth: '200px', maxHeight: '200px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <p style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.85rem' }}>
                {pickingFor ? `Click logo to pick ${pickingFor} color` : 'Current logo'}
              </p>
            </>
          ) : (
            <div style={{ color: '#666', padding: '2rem' }}>
              <span style={{ fontSize: '3rem' }}>🏛️</span>
              <p style={{ marginTop: '0.5rem' }}>No logo uploaded</p>
            </div>
          )}
        </div>

        {/* Upload Controls */}
        <div className="logo-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ flex: 1 }}
          >
            {uploading ? 'Uploading...' : (logo?.has_logo ? '📤 Replace Logo' : '📤 Upload Logo')}
          </button>
          {logo?.has_logo && (
            <button
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={uploading}
            >
              🗑️ Remove
            </button>
          )}
        </div>

        {/* Color Pickers */}
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #ddd', paddingTop: '1.5rem' }}>
          <h4 style={{ marginBottom: '1rem', color: '#333' }}>Brand Colors</h4>
          
          {/* Primary Color */}
          <div className="color-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <label style={{ width: '90px', color: '#555' }}>Primary:</label>
            <input
              type="color"
              value={primaryColor.length === 7 ? primaryColor : '#016a2b'}
              onChange={(e) => setPrimaryColor(e.target.value)}
              style={{ width: '50px', height: '36px', padding: 0, border: 'none', cursor: 'pointer' }}
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => handleHexInput(e.target.value, setPrimaryColor)}
              maxLength={7}
              style={{ 
                width: '90px', 
                padding: '0.5rem', 
                background: '#fff', 
                border: '1px solid #ddd', 
                borderRadius: '4px', 
                color: '#333',
                fontFamily: 'monospace'
              }}
            />
            {logo?.has_logo && (
              <button
                className={`btn btn-sm ${pickingFor === 'primary' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPickingFor(pickingFor === 'primary' ? null : 'primary')}
                title="Pick from logo"
              >
                🎯
              </button>
            )}
            <div style={{ 
              width: '24px', 
              height: '24px', 
              background: primaryColor, 
              borderRadius: '4px',
              border: '1px solid #ccc'
            }} />
          </div>
          
          {/* Secondary Color */}
          <div className="color-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <label style={{ width: '90px', color: '#555' }}>Secondary:</label>
            <input
              type="color"
              value={secondaryColor.length === 7 ? secondaryColor : '#eeee01'}
              onChange={(e) => setSecondaryColor(e.target.value)}
              style={{ width: '50px', height: '36px', padding: 0, border: 'none', cursor: 'pointer' }}
            />
            <input
              type="text"
              value={secondaryColor}
              onChange={(e) => handleHexInput(e.target.value, setSecondaryColor)}
              maxLength={7}
              style={{ 
                width: '90px', 
                padding: '0.5rem', 
                background: '#fff', 
                border: '1px solid #ddd', 
                borderRadius: '4px', 
                color: '#333',
                fontFamily: 'monospace'
              }}
            />
            {logo?.has_logo && (
              <button
                className={`btn btn-sm ${pickingFor === 'secondary' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPickingFor(pickingFor === 'secondary' ? null : 'secondary')}
                title="Pick from logo"
              >
                🎯
              </button>
            )}
            <div style={{ 
              width: '24px', 
              height: '24px', 
              background: secondaryColor, 
              borderRadius: '4px',
              border: '1px solid #ccc'
            }} />
          </div>

          {/* Save Button */}
          <button
            className="btn btn-primary"
            onClick={saveColors}
            disabled={savingColors || !hasColorChanges}
            style={{ marginTop: '0.5rem' }}
          >
            {savingColors ? 'Saving...' : 'Save Colors'}
          </button>
          {hasColorChanges && (
            <span style={{ marginLeft: '1rem', color: '#f39c12', fontSize: '0.85rem' }}>
              Unsaved changes
            </span>
          )}
        </div>

        {/* Guidelines */}
        <div style={{ 
          background: '#f8f8f8', 
          borderRadius: '4px', 
          padding: '0.75rem 1rem',
          fontSize: '0.85rem',
          color: '#666',
          marginTop: '1.5rem',
          border: '1px solid #e0e0e0'
        }}>
          <strong style={{ color: '#333' }}>Guidelines:</strong>
          <ul style={{ margin: '0.5rem 0 0 1.2rem', padding: 0 }}>
            <li>PNG or WebP recommended (supports transparency)</li>
            <li>Max size: 500KB</li>
            <li>Click 🎯 then click the logo to pick a color from it</li>
            <li>Colors apply to the web UI and PDF reports</li>
          </ul>
        </div>


      </div>
    </div>
  );
}


// ============================================================================
// COMCAT ML TAB COMPONENT
// ============================================================================

function ComCatTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await fetch('/api/comcat/stats');
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error('Failed to load ComCat stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetrain = async () => {
    if (!confirm('Retrain the ML model with all current training data?\n\nThis includes seed examples plus all officer corrections.')) {
      return;
    }
    
    setRetraining(true);
    setMessage(null);
    
    try {
      const res = await fetch('/api/comcat/retrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Retrain failed');
      }
      
      const data = await res.json();
      setMessage({ 
        type: 'success', 
        text: `Model retrained successfully! ${data.total_examples} examples, ${(data.cv_accuracy * 100).toFixed(1)}% accuracy` 
      });
      
      // Reload stats
      await loadStats();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setRetraining(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading ComCat statistics...</div>;
  }

  const categoryColors = {
    CALLER: '#3b82f6',      // blue
    TACTICAL: '#ef4444',    // red
    OPERATIONS: '#f59e0b',  // amber
    UNIT: '#22c55e',        // green
    OTHER: '#6b7280',       // gray
  };

  return (
    <div className="comcat-tab">
      <h3 style={{ color: 'var(--primary-color)' }}>Comment Categorizer (ComCat) ML</h3>
      <p className="tab-intro">
        Machine learning model that categorizes CAD event comments. Officer corrections improve accuracy over time.
      </p>

      {message && (
        <div className={`message ${message.type}`} style={{ marginBottom: '1rem' }}>
          {message.text}
        </div>
      )}

      {/* Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {/* ML Status */}
        <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '1rem', border: '1px solid #e0e0e0' }}>
          <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.5rem' }}>ML Status</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: stats?.ml_available ? '#22c55e' : '#ef4444' }}>
            {stats?.ml_available ? '✓ Available' : '✗ Unavailable'}
          </div>
          <div style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            sklearn: {stats?.sklearn_installed ? 'installed' : 'missing'}
          </div>
        </div>

        {/* Model Status */}
        <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '1rem', border: '1px solid #e0e0e0' }}>
          <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Model Trained</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: stats?.model_trained ? '#22c55e' : '#f59e0b' }}>
            {stats?.model_trained ? '✓ Yes' : '⚠ No'}
          </div>
          <div style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            {stats?.last_trained_at ? `Last: ${new Date(stats.last_trained_at).toLocaleDateString()}` : 'Never trained'}
          </div>
        </div>

        {/* Accuracy */}
        <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '1rem', border: '1px solid #e0e0e0' }}>
          <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.5rem' }}>CV Accuracy</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
            {stats?.cv_accuracy ? `${(stats.cv_accuracy * 100).toFixed(1)}%` : 'N/A'}
          </div>
          <div style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Cross-validation score
          </div>
        </div>

        {/* Training Data */}
        <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '1rem', border: '1px solid #e0e0e0' }}>
          <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Training Examples</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#333' }}>
            {stats?.total_training_examples || 0}
          </div>
          <div style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            {stats?.seed_examples || 0} seed + {stats?.officer_examples || 0} officer
          </div>
        </div>
      </div>

      {/* Category Distribution */}
      <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', border: '1px solid #e0e0e0' }}>
        <h4 style={{ marginBottom: '1rem', color: '#333' }}>Officer Corrections by Category</h4>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {Object.entries(stats?.category_counts || {}).map(([cat, count]) => (
            <div 
              key={cat} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                background: '#fff',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                borderLeft: `4px solid ${categoryColors[cat] || '#888'}`,
                border: '1px solid #e0e0e0'
              }}
            >
              <span style={{ color: '#666' }}>{cat}:</span>
              <span style={{ fontWeight: 'bold', color: '#333' }}>{count}</span>
            </div>
          ))}
        </div>
        {(stats?.officer_examples || 0) === 0 && (
          <p style={{ color: '#666', marginTop: '1rem', fontSize: '0.9rem' }}>
            No officer corrections yet. Corrections made in the Comment Categorizer modal become training data.
          </p>
        )}
      </div>

      {/* Retrain Section */}
      <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', border: '1px solid #e0e0e0' }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#333' }}>Retrain Model</h4>
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Retrain the ML model with all seed data plus officer corrections. 
          You can batch corrections from multiple incidents before retraining.
        </p>
        <button 
          className="btn btn-primary"
          onClick={handleRetrain}
          disabled={retraining || !stats?.ml_available}
        >
          {retraining ? '⏳ Retraining...' : '🔄 Retrain Model'}
        </button>
        {!stats?.ml_available && (
          <span style={{ marginLeft: '1rem', color: '#f59e0b', fontSize: '0.85rem' }}>
            ML not available - check server dependencies
          </span>
        )}
      </div>

      {/* How It Works */}
      <div style={{ background: '#f8f8f8', borderRadius: '8px', padding: '1rem', border: '1px solid #e0e0e0' }}>
        <h4 style={{ marginBottom: '0.75rem', color: '#333' }}>How ComCat Works</h4>
        <ol style={{ color: '#666', margin: 0, paddingLeft: '1.25rem', lineHeight: 1.8 }}>
          <li><strong>ML Classification</strong> - All comments categorized by Random Forest using text + operator type (calltaker, dispatcher, unit)</li>
          <li><strong>Context-Aware Learning</strong> - Model learns patterns like "calltaker comments tend to be caller info" from your corrections</li>
          <li><strong>Review Flagging</strong> - ML predictions below {((stats?.confidence_threshold || 0.5) * 100).toFixed(0)}% confidence are flagged for officer review</li>
          <li><strong>Officer Corrections</strong> - Corrections made in the modal become training data (source = "OFFICER")</li>
          <li><strong>Model Improvement</strong> - Retraining incorporates officer corrections to improve future predictions</li>
        </ol>
      </div>
    </div>
  );
}


// ============================================================================
// CAD SETTINGS TAB COMPONENT
// ============================================================================

/**
 * CAD Categories Tab - Set how incoming CAD dispatches are categorized.
 * 
 * Options:
 *   - Auto-detect (default): MEDICAL → EMS, else → FIRE
 *   - Force FIRE: All CAD → FIRE (fire-only depts)
 *   - Force EMS: All CAD → EMS (EMS-only agencies)
 */
function CADSettingsTab() {
  const [settings, setSettings] = useState({ force_category: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await getCadSettings();
      setSettings(res.data);
    } catch (err) {
      console.error('Failed to load CAD settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = async (value) => {
    setSaving(true);
    setMessage(null);
    
    // Convert "auto" back to null for storage
    const newValue = value === 'auto' ? null : value;
    
    try {
      await updateCadSettings({ force_category: newValue });
      setSettings(prev => ({ ...prev, force_category: newValue }));
      setMessage({ 
        type: 'success', 
        text: value === 'auto' 
          ? 'Category detection set to auto-detect' 
          : `All CAD imports will now be categorized as ${value}`
      });
    } catch (err) {
      console.error('Failed to save CAD setting:', err);
      setMessage({ type: 'error', text: 'Failed to save setting' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading CAD settings...</div>;

  // Convert null to "auto" for display
  const currentValue = settings.force_category || 'auto';

  return (
    <div className="cad-settings-tab">
      <h3 style={{ color: 'var(--primary-color)' }}>CAD Categories</h3>
      <p className="tab-intro">
        Configure how incoming CAD dispatches are categorized.
      </p>

      {message && (
        <div className={`message ${message.type}`} style={{ marginBottom: '1rem' }}>
          {message.text}
        </div>
      )}

      {/* Force Category Setting */}
      <div style={{ 
        background: '#f5f5f5', 
        borderRadius: '8px', 
        padding: '1.5rem',
        maxWidth: '600px',
        border: '1px solid #e0e0e0'
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: '#333' }}>
            📁 Call Category Assignment
          </label>
          <p style={{ color: '#666', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
            How should incoming CAD dispatches be categorized?
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Auto-detect option */}
            <label style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: currentValue === 'auto' ? '#e8f5e9' : '#fff',
              border: currentValue === 'auto' ? '2px solid #4caf50' : '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer'
            }}>
              <input
                type="radio"
                name="force_category"
                value="auto"
                checked={currentValue === 'auto'}
                onChange={(e) => handleChange(e.target.value)}
                disabled={saving}
                style={{ marginTop: '0.2rem' }}
              />
              <div>
                <div style={{ fontWeight: '500', color: '#333' }}>🔄 Auto-detect (Default)</div>
                <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                  MEDICAL events → EMS, everything else → FIRE
                </div>
              </div>
            </label>

            {/* Force FIRE option */}
            <label style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: currentValue === 'FIRE' ? '#ffebee' : '#fff',
              border: currentValue === 'FIRE' ? '2px solid #dc2626' : '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer'
            }}>
              <input
                type="radio"
                name="force_category"
                value="FIRE"
                checked={currentValue === 'FIRE'}
                onChange={(e) => handleChange(e.target.value)}
                disabled={saving}
                style={{ marginTop: '0.2rem' }}
              />
              <div>
                <div style={{ fontWeight: '500', color: '#333' }}>🔥 Force All to FIRE</div>
                <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                  All CAD imports categorized as FIRE (for fire-only departments)
                </div>
              </div>
            </label>

            {/* Force EMS option */}
            <label style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: currentValue === 'EMS' ? '#e3f2fd' : '#fff',
              border: currentValue === 'EMS' ? '2px solid #2563eb' : '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer'
            }}>
              <input
                type="radio"
                name="force_category"
                value="EMS"
                checked={currentValue === 'EMS'}
                onChange={(e) => handleChange(e.target.value)}
                disabled={saving}
                style={{ marginTop: '0.2rem' }}
              />
              <div>
                <div style={{ fontWeight: '500', color: '#333' }}>🚑 Force All to EMS</div>
                <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                  All CAD imports categorized as EMS (for EMS-only agencies)
                </div>
              </div>
            </label>
          </div>
        </div>

        {saving && (
          <div style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Saving...
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================================
// FEATURES TAB COMPONENT
// ============================================================================

function FeaturesTab() {
  const [features, setFeatures] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadFeatures();
  }, []);

  const loadFeatures = async () => {
    try {
      const res = await getFeatures();
      setFeatures(res.data);
    } catch (err) {
      console.error('Failed to load features:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key, currentValue) => {
    setSaving(key);
    setMessage(null);
    try {
      await updateFeatures({ [key]: !currentValue });
      setFeatures(prev => ({ ...prev, [key]: !currentValue }));
      setMessage({ type: 'success', text: `Feature ${!currentValue ? 'enabled' : 'disabled'}` });
    } catch (err) {
      console.error('Failed to update feature:', err);
      setMessage({ type: 'error', text: 'Failed to save' });
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="loading">Loading features...</div>;

  const featureInfo = {
    allow_incident_duplication: {
      label: 'Incident Duplication',
      description: 'Allow admins to duplicate incidents to different categories (FIRE/EMS/DETAIL). Useful for dual-crediting stats when fire units assist on EMS calls.',
      icon: '📋'
    }
  };

  return (
    <div className="features-tab">
      <h3 style={{ color: 'var(--primary-color)' }}>Feature Flags</h3>
      <p className="tab-intro">
        Enable or disable optional features. These are admin-only capabilities.
      </p>

      {message && (
        <div className={`message ${message.type}`} style={{ marginBottom: '1rem' }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '600px' }}>
        {Object.entries(features).map(([key, value]) => {
          const info = featureInfo[key] || { label: key, description: '', icon: '⚙️' };
          const isSaving = saving === key;
          
          return (
            <div 
              key={key}
              style={{
                background: '#f5f5f5',
                borderRadius: '8px',
                padding: '1rem',
                border: '1px solid #e0e0e0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>{info.icon}</span>
                  <strong style={{ color: '#333' }}>{info.label}</strong>
                </div>
                <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
                  {info.description}
                </p>
              </div>
              <button
                onClick={() => handleToggle(key, value)}
                disabled={isSaving}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: isSaving ? 'wait' : 'pointer',
                  fontWeight: 'bold',
                  minWidth: '80px',
                  background: value ? '#22c55e' : '#e5e7eb',
                  color: value ? '#fff' : '#666'
                }}
              >
                {isSaving ? '...' : (value ? 'ON' : 'OFF')}
              </button>
            </div>
          );
        })}
      </div>

      {Object.keys(features).length === 0 && (
        <p style={{ color: '#666' }}>No feature flags available.</p>
      )}
    </div>
  );
}


// AdminLoginForm REMOVED - admin access now gated by personnel role


// ============================================================================
// MAIN ADMIN PAGE COMPONENT
// ============================================================================

function AdminPage({ userSession }) {
  const { refreshBranding } = useBranding();
  const [activeTab, setActiveTab] = useState('settings');

  // Notify HelpContext of admin tab changes for page-specific help
  const { setAdminTab } = useHelp();
  useEffect(() => {
    setAdminTab(activeTab);
  }, [activeTab, setAdminTab]);

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>Admin</h2>
        <span style={{ fontSize: '0.85rem', color: '#666' }}>Logged in as {userSession?.display_name} ({userSession?.role})</span>
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
          className={activeTab === 'eventtypes' ? 'active' : ''} 
          onClick={() => setActiveTab('eventtypes')}
        >
          📅 Event Types
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
        <button 
          className={activeTab === 'branding' ? 'active' : ''} 
          onClick={() => setActiveTab('branding')}
        >
          🏛️ Branding
        </button>
        <button 
          className={activeTab === 'comcat' ? 'active' : ''} 
          onClick={() => setActiveTab('comcat')}
        >
          🤖 ComCat ML
        </button>
        <button 
          className={activeTab === 'avalerts' ? 'active' : ''} 
          onClick={() => setActiveTab('avalerts')}
        >
          🔔 AV Alerts
        </button>
        <button 
          className={activeTab === 'cad' ? 'active' : ''} 
          onClick={() => setActiveTab('cad')}
        >
          📁 CAD Categories
        </button>
        <button 
          className={activeTab === 'features' ? 'active' : ''} 
          onClick={() => setActiveTab('features')}
        >
          🚀 Features
        </button>
        <button 
          className={activeTab === 'help' ? 'active' : ''} 
          onClick={() => setActiveTab('help')}
        >
          ❓ Help
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'sequence' && <IncidentSequenceTab />}
        {activeTab === 'neris' && <NerisCodesTab />}
        {activeTab === 'personnel' && <PersonnelPage embedded />}
        {activeTab === 'ranks' && <RanksTab />}
        {activeTab === 'eventtypes' && <DetailTypesTab />}
        {activeTab === 'apparatus' && <ApparatusPage embedded />}
        {activeTab === 'municipalities' && <MunicipalitiesPage embedded />}
        {activeTab === 'audit' && <AuditLogTab />}
        {activeTab === 'export' && <DataExportTab />}
        {activeTab === 'print' && <PrintLayoutTab />}
        {activeTab === 'branding' && <BrandingTab onRefresh={refreshBranding} />}
        {activeTab === 'comcat' && <ComCatTab />}
        {activeTab === 'avalerts' && <AVAlertsTab />}
        {activeTab === 'cad' && <CADSettingsTab />}
        {activeTab === 'features' && <FeaturesTab />}
        {activeTab === 'help' && <HelpAdminTab />}
      </div>
    </div>
  );
}

export default AdminPage;