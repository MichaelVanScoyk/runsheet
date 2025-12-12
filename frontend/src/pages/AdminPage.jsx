import { useState, useEffect } from 'react';
import './AdminPage.css';

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

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      const data = await res.json();
      setSettings(data);
      
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
            <label>{setting.key}</label>
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
            <label>{setting.key}</label>
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
            <label>{setting.key}</label>
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
          <label>{setting.key}</label>
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
          <h3>{category.charAt(0).toUpperCase() + category.slice(1)}</h3>
          <div className="settings-list">
            {settings[category].map(renderSetting)}
          </div>
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
      </div>

      <div className="admin-content">
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'sequence' && <IncidentSequenceTab />}
      </div>
    </div>
  );
}

export default AdminPage;
