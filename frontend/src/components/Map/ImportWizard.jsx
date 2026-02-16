/**
 * ImportWizard.jsx — GIS Import
 *
 * Zero-config: ALL source fields stored as-is. No mapping screen.
 * URL, import date, feature count all visible on saved configs.
 */

import { useState, useEffect, useCallback } from 'react';

export default function ImportWizard({ layers = [], onImportComplete }) {
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [targetLayerId, setTargetLayerId] = useState('');
  const [filterExpression, setFilterExpression] = useState('');
  const [saveConfig, setSaveConfig] = useState(true);
  const [configName, setConfigName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  const [configs, setConfigs] = useState([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);

  const loadConfigs = useCallback(() => {
    setConfigsLoading(true);
    fetch('/api/map/gis/configs')
      .then(r => r.ok ? r.json() : { configs: [] })
      .then(data => setConfigs(data.configs || []))
      .catch(() => setConfigs([]))
      .finally(() => setConfigsLoading(false));
  }, []);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const handlePreview = async () => {
    if (!url.trim()) return;
    setPreviewLoading(true);
    setPreviewError('');
    setPreview(null);
    try {
      const res = await fetch('/api/map/gis/arcgis/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Preview failed');
      }
      const data = await res.json();
      setPreview(data);
      setConfigName(data.name || '');
      // Auto-detect target layer
      const match = layers.find(l => {
        if (data.geometry_type === 'point') return ['hydrant', 'dry_hydrant', 'draft_point', 'hazard', 'closure', 'preplan', 'railroad_crossing', 'informational'].includes(l.layer_type);
        if (data.geometry_type === 'polygon') return ['boundary', 'flood_zone', 'wildfire_risk'].includes(l.layer_type);
        return false;
      });
      if (match) setTargetLayerId(String(match.id));
      setStep(2);
    } catch (e) {
      setPreviewError(e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImport = async () => {
    if (!targetLayerId || !preview) return;
    setImporting(true);
    setImportError('');
    setImportResult(null);
    setStep(3);
    try {
      const res = await fetch('/api/map/gis/arcgis/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: preview.url,
          layer_id: parseInt(targetLayerId),
          field_mapping: { OBJECTID: '__external_id' },
          filter_expression: filterExpression || null,
          save_config: saveConfig,
          config_name: configName || preview.name,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Import failed');
      }
      const data = await res.json();
      setImportResult(data);
      setStep(4);
      onImportComplete?.();
      loadConfigs();
    } catch (e) {
      setImportError(e.message);
      setStep(4);
    } finally {
      setImporting(false);
    }
  };

  const handleRefresh = async (configId) => {
    setRefreshingId(configId);
    try {
      const res = await fetch(`/api/map/gis/configs/${configId}/refresh`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Refresh failed');
      }
      loadConfigs();
      onImportComplete?.();
    } catch (e) {
      alert(`Refresh failed: ${e.message}`);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDeleteConfig = async (configId, name) => {
    if (!window.confirm(`Delete import config "${name}"? This does NOT delete already imported features.`)) return;
    try {
      await fetch(`/api/map/gis/configs/${configId}`, { method: 'DELETE' });
      loadConfigs();
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  const resetWizard = () => {
    setStep(0); setUrl(''); setPreview(null); setPreviewError('');
    setTargetLayerId(''); setFilterExpression(''); setConfigName('');
    setImportResult(null); setImportError('');
  };

  const panelStyle = {
    background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
    padding: '20px', fontSize: '0.85rem',
  };

  // STEP 0: Saved configs — show URL, date, count, everything visible
  if (step === 0) {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#333', fontSize: '1.05rem' }}>GIS Import</h3>
          <button onClick={() => setStep(1)}
            style={{ padding: '8px 16px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
            + New Import
          </button>
        </div>
        {configsLoading ? (
          <div style={{ color: '#888' }}>Loading...</div>
        ) : configs.length === 0 ? (
          <div style={{ color: '#888' }}>No saved imports.</div>
        ) : (
          <div>
            {configs.map(c => (
              <div key={c.id} style={{
                border: '1px solid #eee', borderRadius: '6px', padding: '12px',
                marginBottom: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '1.2rem' }}>{c.layer_icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', color: '#333' }}>{c.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>
                      {c.layer_name} · {c.last_refresh_count || 0} features
                    </div>
                  </div>
                  <button onClick={() => handleRefresh(c.id)} disabled={refreshingId === c.id}
                    style={{ padding: '6px 12px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: refreshingId === c.id ? 'wait' : 'pointer', fontSize: '0.8rem' }}>
                    {refreshingId === c.id ? 'Refreshing...' : 'Refresh'}
                  </button>
                  <button onClick={() => handleDeleteConfig(c.id, c.name)}
                    style={{ padding: '6px 10px', background: 'none', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', color: '#888' }}>
                    ✕
                  </button>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#666', background: '#f9fafb', borderRadius: '4px', padding: '6px 8px' }}>
                  <div style={{ marginBottom: '2px' }}>
                    <span style={{ color: '#888' }}>Source: </span>
                    <span style={{ wordBreak: 'break-all' }}>{c.source_url}</span>
                  </div>
                  <div>
                    <span style={{ color: '#888' }}>Last imported: </span>
                    {c.last_refresh_at
                      ? new Date(c.last_refresh_at).toLocaleString()
                      : 'Never'}
                    {c.last_refresh_status === 'failed' && <span style={{ color: '#dc2626' }}> (Failed)</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // STEP 1: Enter URL
  if (step === 1) {
    return (
      <div style={panelStyle}>
        <h3 style={{ margin: '0 0 12px', color: '#333', fontSize: '1.05rem' }}>Import from ArcGIS</h3>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '4px' }}>
            ArcGIS REST Endpoint URL
          </label>
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)}
            style={{ width: '100%', padding: '8px', fontSize: '0.85rem', boxSizing: 'border-box' }}
            onKeyDown={(e) => e.key === 'Enter' && handlePreview()} />
          <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '4px' }}>
            Example: https://services.arcgis.com/.../FeatureServer/0
          </div>
        </div>
        {previewError && <div style={{ color: '#dc2626', marginBottom: '12px' }}>{previewError}</div>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handlePreview} disabled={previewLoading || !url.trim()}
            style={{ flex: 1, padding: '8px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '4px', cursor: previewLoading ? 'wait' : 'pointer', fontSize: '0.85rem' }}>
            {previewLoading ? 'Fetching...' : 'Preview'}
          </button>
          <button onClick={resetWizard}
            style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // STEP 2: Confirm — show what will be imported, no mapping
  if (step === 2 && preview) {
    const dataFields = preview.fields?.filter(f =>
      f.name !== 'OBJECTID' && f.name !== 'SHAPE' && f.name !== 'Shape' &&
      f.name !== 'GlobalID' && f.name !== 'Shape__Area' && f.name !== 'Shape__Length'
    ) || [];

    return (
      <div style={{ ...panelStyle, maxHeight: 'calc(100vh - 100px)', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 4px', color: '#333', fontSize: '1.05rem' }}>{preview.name}</h3>
        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '12px' }}>
          {preview.geometry_type} · {preview.feature_count != null ? `${preview.feature_count} features` : 'unknown count'}
        </div>

        {/* Target layer */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>
            Import Into Layer
          </label>
          <select value={targetLayerId} onChange={(e) => setTargetLayerId(e.target.value)}
            style={{ width: '100%', padding: '6px', fontSize: '0.85rem' }}>
            <option value="">-- Select Layer --</option>
            {layers.map(l => (
              <option key={l.id} value={l.id}>{l.icon} {l.name} ({l.layer_type})</option>
            ))}
          </select>
        </div>

        {/* Show exactly what fields will be imported — read only, no choices */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
            Fields to Import ({dataFields.length})
          </div>
          <div style={{ border: '1px solid #eee', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0',
              background: '#f9fafb', padding: '6px 8px', fontWeight: '600', fontSize: '0.75rem',
              color: '#666', borderBottom: '1px solid #eee',
            }}>
              <span>Field</span>
              <span>Type</span>
              <span>Sample Value</span>
            </div>
            {dataFields.map(field => (
              <div key={field.name} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0',
                padding: '4px 8px', borderBottom: '1px solid #f0f0f0', alignItems: 'center',
              }}>
                <span style={{ fontSize: '0.8rem', color: '#333' }}>
                  {field.alias || field.name}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#888' }}>
                  {field.type}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {preview.sample_values?.[field.name]?.[0] || '—'}
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '4px' }}>
            All fields stored exactly as shown. All editable after import.
          </div>
        </div>

        {/* Filter expression */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '4px' }}>
            Filter Expression (optional)
          </label>
          <input type="text" value={filterExpression} onChange={(e) => setFilterExpression(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
          <div style={{ fontSize: '0.7rem', color: '#999', marginTop: '2px' }}>
            ArcGIS SQL WHERE clause. Example: MUNI_NUM=60
          </div>
        </div>

        {/* Save config */}
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#555', cursor: 'pointer' }}>
            <input type="checkbox" checked={saveConfig} onChange={(e) => setSaveConfig(e.target.checked)} />
            Save for re-import
          </label>
          {saveConfig && (
            <input type="text" value={configName} onChange={(e) => setConfigName(e.target.value)}
              style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem', boxSizing: 'border-box' }} />
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleImport} disabled={!targetLayerId}
            style={{
              flex: 1, padding: '8px', background: '#059669', color: '#fff',
              border: 'none', borderRadius: '4px',
              cursor: !targetLayerId ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem', fontWeight: '500', opacity: targetLayerId ? 1 : 0.5,
            }}>
            Import {preview.feature_count != null ? `${preview.feature_count} Features` : 'Features'}
          </button>
          <button onClick={() => setStep(1)}
            style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
            Back
          </button>
          <button onClick={resetWizard}
            style={{ padding: '8px 12px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // STEP 3: Importing
  if (step === 3) {
    return (
      <div style={{ ...panelStyle, textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
        <div style={{ fontWeight: '600', color: '#333', marginBottom: '8px' }}>Importing...</div>
        <div style={{ color: '#888' }}>This may take a moment for large datasets.</div>
      </div>
    );
  }

  // STEP 4: Results
  if (step === 4) {
    const stats = importResult?.stats;
    return (
      <div style={panelStyle}>
        {importError ? (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>❌</div>
            <div style={{ fontWeight: '600', color: '#dc2626', marginBottom: '8px' }}>Import Failed</div>
            <div style={{ color: '#666', marginBottom: '16px' }}>{importError}</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✅</div>
            <div style={{ fontWeight: '600', color: '#059669', marginBottom: '8px' }}>Import Complete</div>
            {stats && (
              <div style={{ marginBottom: '16px', fontSize: '0.9rem' }}>
                <div style={{ color: '#333' }}><strong>{stats.imported}</strong> new features imported</div>
                {stats.updated > 0 && <div style={{ color: '#333' }}><strong>{stats.updated}</strong> existing features updated</div>}
                {stats.skipped > 0 && <div style={{ color: '#888' }}>{stats.skipped} skipped (no geometry)</div>}
                {stats.errors > 0 && <div style={{ color: '#dc2626' }}>{stats.errors} errors</div>}
              </div>
            )}
          </>
        )}
        <button onClick={resetWizard}
          style={{ width: '100%', padding: '8px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
          Done
        </button>
      </div>
    );
  }

  return null;
}
