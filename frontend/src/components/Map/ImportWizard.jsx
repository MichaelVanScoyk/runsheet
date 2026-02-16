/**
 * ImportWizard.jsx — GIS Import (Phase 5a + 5b)
 *
 * Two import sources:
 *   - ArcGIS REST URL (Phase 5a) — paginated fetch from public endpoints
 *   - File Upload (Phase 5b) — GeoJSON, KML, KMZ, Shapefile (.zip), CSV
 *
 * Zero-config: ALL source fields stored as-is. No mapping screen.
 * Both sources funnel through the same import pipeline + confirm UI.
 */

import { useState, useEffect, useCallback } from 'react';

export default function ImportWizard({ layers = [], onImportComplete, userRole }) {
  const [step, setStep] = useState(0);
  const [sourceType, setSourceType] = useState('arcgis'); // 'arcgis' | 'file'
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
  // File upload state
  const [tempId, setTempId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  // Layer style state for polygon imports
  const [layerStyle, setLayerStyle] = useState({
    fillColor: '#DC2626',
    fillOpacity: 0,
    strokeColor: '#DC2626',
    strokeOpacity: 0.9,
    strokeWeight: 2,
  });

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
      if (match) {
        setTargetLayerId(String(match.id));
        // Load existing style from layer for polygon types
        if (match.geometry_type === 'polygon') {
          setLayerStyle({
            fillColor: match.color || '#DC2626',
            fillOpacity: match.opacity != null ? match.opacity : 0,
            strokeColor: match.stroke_color || '#DC2626',
            strokeOpacity: match.stroke_opacity != null ? match.stroke_opacity : 0.9,
            strokeWeight: match.stroke_weight || 2,
          });
        }
      }
      setStep(2);
    } catch (e) {
      setPreviewError(e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setPreviewLoading(true);
    setPreviewError('');
    setPreview(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/map/gis/file/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'File parse failed');
      }
      const data = await res.json();
      setPreview(data);
      setTempId(data.temp_id);
      setConfigName(data.filename?.replace(/\.[^.]+$/, '') || '');
      // Auto-detect target layer
      const match = layers.find(l => {
        if (data.geometry_type === 'point') return ['hydrant', 'dry_hydrant', 'draft_point', 'hazard', 'closure', 'preplan', 'railroad_crossing', 'informational'].includes(l.layer_type);
        if (data.geometry_type === 'polygon') return ['boundary', 'flood_zone', 'wildfire_risk'].includes(l.layer_type);
        return false;
      });
      if (match) {
        setTargetLayerId(String(match.id));
        if (match.geometry_type === 'polygon') {
          setLayerStyle({
            fillColor: match.color || '#DC2626',
            fillOpacity: match.opacity != null ? match.opacity : 0,
            strokeColor: match.stroke_color || '#DC2626',
            strokeOpacity: match.stroke_opacity != null ? match.stroke_opacity : 0.9,
            strokeWeight: match.stroke_weight || 2,
          });
        }
      }
      setStep(2);
    } catch (e) {
      setPreviewError(e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleImport = async () => {
    if (!targetLayerId || !preview) return;
    setImporting(true);
    setImportError('');
    setImportResult(null);
    setStep(3);
    try {
      // Save layer style if polygon import
      const targetLayer = layers.find(l => String(l.id) === String(targetLayerId));
      if (targetLayer && (targetLayer.geometry_type === 'polygon' || preview.geometry_type === 'polygon')) {
        await fetch(`/api/map/layers/${targetLayerId}/style`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            color: layerStyle.fillColor,
            opacity: layerStyle.fillOpacity,
            stroke_color: layerStyle.strokeColor,
            stroke_opacity: layerStyle.strokeOpacity,
            stroke_weight: layerStyle.strokeWeight,
          }),
        });
      }
      let res;
      if (sourceType === 'file' && tempId) {
        // File upload import
        res = await fetch('/api/map/gis/file/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            temp_id: tempId,
            layer_id: parseInt(targetLayerId),
            field_mapping: {},
            save_config: saveConfig,
            config_name: configName || preview.filename,
          }),
        });
      } else {
        // ArcGIS REST import
        res = await fetch('/api/map/gis/arcgis/import', {
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
      }
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

  const isAdmin = userRole === 'ADMIN';

  const handleDeleteConfig = async (configId, name) => {
    if (!window.confirm(`To check for new data, use Refresh.\n\nTo delete all features of this import AS WELL AS any edits your department has created, click OK to confirm.`)) return;
    try {
      await fetch(`/api/map/gis/configs/${configId}`, { method: 'DELETE' });
      loadConfigs();
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  const resetWizard = () => {
    setStep(0); setSourceType('arcgis'); setUrl(''); setPreview(null); setPreviewError('');
    setTargetLayerId(''); setFilterExpression(''); setConfigName('');
    setImportResult(null); setImportError('');
    setTempId(null); setDragOver(false);
  };

  const panelStyle = {
    background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
    padding: '20px', fontSize: '0.85rem',
  };

  // Normalize URL for comparison (strip trailing slash, query params)
  const normalizeUrl = (u) => (u || '').trim().split('?')[0].replace(/\/+$/, '').toLowerCase();

  // Check if entered URL matches an existing config
  const duplicateConfig = url.trim()
    ? configs.find(c => normalizeUrl(c.source_url) === normalizeUrl(url))
    : null;

  // --- CONFIGS LIST (always visible) ---
  const configsList = (
    <div style={{ marginBottom: step > 0 ? '16px' : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: '#333', fontSize: '1.05rem' }}>GIS Import</h3>
        {step === 0 && (
          <button onClick={() => setStep(1)}
            style={{ padding: '8px 16px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
            + New Import
          </button>
        )}
      </div>
      {configsLoading ? (
        <div style={{ color: '#888' }}>Loading...</div>
      ) : configs.length === 0 ? (
        step === 0 ? <div style={{ color: '#888' }}>No saved imports.</div> : null
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
                    {c.layer_name} · {c.last_refresh_count || 0} features synced
                  </div>
                </div>
                <button onClick={() => handleRefresh(c.id)} disabled={refreshingId === c.id}
                  style={{ padding: '6px 12px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: refreshingId === c.id ? 'wait' : 'pointer', fontSize: '0.8rem' }}>
                  {refreshingId === c.id ? 'Refreshing...' : 'Refresh'}
                </button>
                {isAdmin && (
                  <button onClick={() => handleDeleteConfig(c.id, c.name)}
                    style={{ padding: '6px 10px', background: 'none', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', color: '#888' }}>
                    ✕
                  </button>
                )}
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

  // STEP 0: Just the configs list
  if (step === 0) {
    return <div style={panelStyle}>{configsList}</div>;
  }

  // STEP 1: Source selection — ArcGIS URL or File Upload (configs visible above)
  if (step === 1) {
    const tabStyle = (active) => ({
      flex: 1, padding: '8px', textAlign: 'center', fontSize: '0.85rem',
      cursor: 'pointer', border: 'none', borderBottom: active ? '2px solid #3B82F6' : '2px solid transparent',
      background: 'none', color: active ? '#3B82F6' : '#888', fontWeight: active ? '600' : '400',
    });

    return (
      <div style={panelStyle}>
        {configsList}
        <div style={{ borderTop: '1px solid #eee', paddingTop: '16px' }}>
          <h3 style={{ margin: '0 0 12px', color: '#333', fontSize: '1.05rem' }}>New Import</h3>

          {/* Source type tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: '16px' }}>
            <button style={tabStyle(sourceType === 'arcgis')} onClick={() => { setSourceType('arcgis'); setPreviewError(''); }}>
              ArcGIS URL
            </button>
            <button style={tabStyle(sourceType === 'file')} onClick={() => { setSourceType('file'); setPreviewError(''); }}>
              Upload File
            </button>
          </div>

          {sourceType === 'arcgis' ? (
            /* --- ArcGIS URL tab --- */
            <>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.8rem', color: '#555', display: 'block', marginBottom: '4px' }}>
                  ArcGIS REST Endpoint URL
                </label>
                <input type="text" value={url} onChange={(e) => setUrl(e.target.value)}
                  style={{ width: '100%', padding: '8px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  onKeyDown={(e) => e.key === 'Enter' && !duplicateConfig && handlePreview()} />
                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '4px' }}>
                  Example: https://services.arcgis.com/.../FeatureServer/0
                </div>
              </div>
              {duplicateConfig && (
                <div style={{ padding: '8px 12px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '4px', marginBottom: '12px', fontSize: '0.8rem', color: '#92400E' }}>
                  This source is already imported as <strong>"{duplicateConfig.name}"</strong>. Use its Refresh button to check for new data.
                </div>
              )}
              {previewError && <div style={{ color: '#dc2626', marginBottom: '12px' }}>{previewError}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handlePreview} disabled={previewLoading || !url.trim() || !!duplicateConfig}
                  style={{ flex: 1, padding: '8px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '4px', cursor: (previewLoading || !url.trim() || duplicateConfig) ? 'not-allowed' : 'pointer', fontSize: '0.85rem', opacity: duplicateConfig ? 0.5 : 1 }}>
                  {previewLoading ? 'Fetching...' : 'Preview'}
                </button>
                <button onClick={resetWizard}
                  style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            /* --- File Upload tab --- */
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => document.getElementById('gis-file-input')?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#3B82F6' : '#ddd'}`,
                  borderRadius: '8px', padding: '32px 16px', textAlign: 'center',
                  cursor: previewLoading ? 'wait' : 'pointer',
                  background: dragOver ? '#EFF6FF' : '#f9fafb',
                  marginBottom: '12px', transition: 'all 0.15s',
                }}
              >
                <input id="gis-file-input" type="file" hidden
                  accept=".geojson,.json,.kml,.kmz,.zip,.csv,.tsv"
                  onChange={(e) => handleFileUpload(e.target.files?.[0])} />
                {previewLoading ? (
                  <div style={{ color: '#3B82F6' }}>Parsing file...</div>
                ) : (
                  <>
                    <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>📂</div>
                    <div style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>Drop a file here or click to browse</div>
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>GeoJSON, KML, KMZ, Shapefile (.zip), or CSV with lat/lng</div>
                  </>
                )}
              </div>
              {previewError && <div style={{ color: '#dc2626', marginBottom: '12px', fontSize: '0.85rem' }}>{previewError}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={resetWizard}
                  style={{ flex: 1, padding: '8px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // STEP 2: Confirm — show what will be imported, no mapping
  if (step === 2 && preview) {
    const skipFields = new Set(['OBJECTID', 'SHAPE', 'Shape', 'GlobalID', 'Shape__Area', 'Shape__Length']);
    const dataFields = preview.fields?.filter(f => !skipFields.has(f.name)) || [];
    const displayName = sourceType === 'file' ? (preview.filename || 'Uploaded File') : preview.name;
    const displayMeta = sourceType === 'file'
      ? `${preview.format} · ${preview.geometry_type} · ${preview.feature_count} features`
      : `${preview.geometry_type} · ${preview.feature_count != null ? `${preview.feature_count} features` : 'unknown count'}`;

    return (
      <div style={{ ...panelStyle, maxHeight: 'calc(100vh - 100px)', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 4px', color: '#333', fontSize: '1.05rem' }}>{displayName}</h3>
        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '12px' }}>
          {displayMeta}
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

        {/* Layer style controls — polygon imports only */}
        {preview.geometry_type === 'polygon' && (
          <div style={{ marginBottom: '12px', border: '1px solid #eee', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
              Layer Style
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Fill color */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Fill Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="color" value={layerStyle.fillColor}
                    onChange={(e) => setLayerStyle(s => ({ ...s, fillColor: e.target.value }))}
                    style={{ width: '32px', height: '28px', padding: '1px', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>{layerStyle.fillColor}</span>
                </div>
              </div>
              {/* Fill opacity */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Fill Opacity</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="range" min="0" max="1" step="0.05" value={layerStyle.fillOpacity}
                    onChange={(e) => setLayerStyle(s => ({ ...s, fillOpacity: parseFloat(e.target.value) }))}
                    style={{ flex: 1, cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888', minWidth: '28px' }}>{Math.round(layerStyle.fillOpacity * 100)}%</span>
                </div>
              </div>
              {/* Stroke color */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Border Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="color" value={layerStyle.strokeColor}
                    onChange={(e) => setLayerStyle(s => ({ ...s, strokeColor: e.target.value }))}
                    style={{ width: '32px', height: '28px', padding: '1px', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>{layerStyle.strokeColor}</span>
                </div>
              </div>
              {/* Stroke opacity */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Border Opacity</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="range" min="0" max="1" step="0.05" value={layerStyle.strokeOpacity}
                    onChange={(e) => setLayerStyle(s => ({ ...s, strokeOpacity: parseFloat(e.target.value) }))}
                    style={{ flex: 1, cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888', minWidth: '28px' }}>{Math.round(layerStyle.strokeOpacity * 100)}%</span>
                </div>
              </div>
              {/* Stroke weight */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Border Width</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="range" min="0" max="6" step="1" value={layerStyle.strokeWeight}
                    onChange={(e) => setLayerStyle(s => ({ ...s, strokeWeight: parseInt(e.target.value) }))}
                    style={{ flex: 1, cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888', minWidth: '28px' }}>{layerStyle.strokeWeight}px</span>
                </div>
              </div>
              {/* Preview swatch */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Preview</label>
                <div style={{
                  width: '60px', height: '36px', borderRadius: '4px',
                  backgroundColor: layerStyle.fillColor,
                  opacity: layerStyle.fillOpacity > 0 ? 1 : undefined,
                  background: layerStyle.fillOpacity > 0
                    ? `${layerStyle.fillColor}${Math.round(layerStyle.fillOpacity * 255).toString(16).padStart(2, '0')}`
                    : 'transparent',
                  border: `${layerStyle.strokeWeight}px solid ${layerStyle.strokeColor}${Math.round(layerStyle.strokeOpacity * 255).toString(16).padStart(2, '0')}`,
                }} />
              </div>
            </div>
          </div>
        )}

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

        {/* Filter expression — ArcGIS only */}
        {sourceType === 'arcgis' && (
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
        )}

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
            Import {preview.feature_count != null ? `${preview.feature_count.toLocaleString()} Features` : 'Features'}
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
