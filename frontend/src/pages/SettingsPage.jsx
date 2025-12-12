import { useState, useEffect } from 'react';
import './SettingsPage.css';

const API_BASE = 'http://192.168.1.189:8001';

function SettingsPage() {
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
      
      // Initialize units text
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
    
    // Special handling for station_units (JSON array of strings)
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
    
    // Special handling for apparatus types (JSON array of objects) - read-only display
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
    
    // Boolean settings
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
    
    // Number settings
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
    
    // String settings (default)
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
    <div className="settings-page">
      <h2>Settings</h2>
      <p className="settings-intro">
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

export default SettingsPage;
