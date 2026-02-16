/**
 * ImportWizard.jsx — GIS Import (Phase 5a + 5b + 5c Feature Picker)
 *
 * Two import sources:
 *   - ArcGIS REST URL (Phase 5a) — paginated fetch from public endpoints
 *   - File Upload (Phase 5b) — GeoJSON, KML, KMZ, Shapefile (.zip), CSV
 *
 * Phase 5c additions:
 *   - Feature picker: for polygon imports, shows all features with checkboxes
 *     so admin can select which polygons to import (e.g. pick your first due)
 *   - Layer style controls: fill/stroke color/opacity/weight on confirm screen
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
  // Feature picker state — for polygon ArcGIS imports
  const [featureRecords, setFeatureRecords] = useState([]); // [{objectid, value}, ...]
  const [selectedFeatures, setSelectedFeatures] = useState(new Set()); // set of objectids
  const [pickerField, setPickerField] = useState(''); // which field to show in picker
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  // Edit mode state
  const [editingConfig, setEditingConfig] = useState(null); // config object being edited
  const [editSaving, setEditSaving] = useState(false);

  const loadConfigs = useCallback(() => {
    setConfigsLoading(true);
    fetch('/api/map/gis/configs')
      .then(r => r.ok ? r.json() : { configs: [] })
      .then(data => setConfigs(data.configs || []))
      .catch(() => setConfigs([]))
      .finally(() => setConfigsLoading(false));
  }, []);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  // Auto-load feature values when preview loads for polygon ArcGIS imports
  const loadFeatureValues = useCallback(async (previewData, fieldName) => {
    if (!previewData?.url || !fieldName) return;
    setPickerLoading(true);
    try {
      const res = await fetch('/api/map/gis/arcgis/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: previewData.url, field: fieldName }),
      });
      if (!res.ok) throw new Error('Failed to fetch values');
      const data = await res.json();
      setFeatureRecords(data.records || []);
      // Default: nothing selected — user picks what they want
      setSelectedFeatures(new Set());
    } catch (e) {
      console.error('Feature value fetch failed:', e);
      setFeatureRecords([]);
    } finally {
      setPickerLoading(false);
    }
  }, []);

  const handlePreview = async () => {
    if (!url.trim()) return;
    setPreviewLoading(true);
    setPreviewError('');
    setPreview(null);
    setFeatureRecords([]);
    setSelectedFeatures(new Set());
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
      // For polygon layers, auto-detect a good label field and load values
      if (data.geometry_type === 'polygon') {
        const skipFields = new Set(['OBJECTID', 'SHAPE', 'Shape', 'GlobalID', 'Shape__Area', 'Shape__Length']);
        const textFields = (data.fields || []).filter(f =>
          !skipFields.has(f.name) && (f.type === 'text' || f.esri_type === 'esriFieldTypeString')
        );
        const labelField = textFields[0]?.name || '';
        if (labelField) {
          setPickerField(labelField);
          loadFeatureValues(data, labelField);
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

  // Build filter expression from selected features
  const buildFilterFromSelection = () => {
    if (!featureRecords.length || selectedFeatures.size === 0) return null;
    if (selectedFeatures.size === featureRecords.length) return null; // all selected = no filter
    const ids = Array.from(selectedFeatures).join(',');
    return `OBJECTID IN (${ids})`;
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

      // Build filter: use feature picker selection if available, else manual filter
      const pickerFilter = buildFilterFromSelection();
      const effectiveFilter = pickerFilter || filterExpression || null;

      let res;
      if (sourceType === 'file' && tempId) {
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
        res = await fetch('/api/map/gis/arcgis/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: preview.url,
            layer_id: parseInt(targetLayerId),
            field_mapping: { OBJECTID: '__external_id' },
            filter_expression: effectiveFilter,
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

  // Edit layer name/icon state
  const [editLayerName, setEditLayerName] = useState('');
  const [editLayerIcon, setEditLayerIcon] = useState('');

  const handleEditConfig = (config) => {
    // Load the layer's current style into the editor
    const layer = layers.find(l => l.id === config.layer_id);
    if (layer) {
      setLayerStyle({
        fillColor: layer.color || '#DC2626',
        fillOpacity: layer.opacity != null ? layer.opacity : 0,
        strokeColor: layer.stroke_color || '#DC2626',
        strokeOpacity: layer.stroke_opacity != null ? layer.stroke_opacity : 0.9,
        strokeWeight: layer.stroke_weight || 2,
      });
      setEditLayerName(layer.name || '');
      setEditLayerIcon(layer.icon || '');
    }
    setEditingConfig(config);
    setStep(5);
  };

  const handleSaveStyle = async () => {
    if (!editingConfig) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/map/layers/${editingConfig.layer_id}/style`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editLayerName || undefined,
          icon: editLayerIcon || undefined,
          color: layerStyle.fillColor,
          opacity: layerStyle.fillOpacity,
          stroke_color: layerStyle.strokeColor,
          stroke_opacity: layerStyle.strokeOpacity,
          stroke_weight: layerStyle.strokeWeight,
        }),
      });
      if (!res.ok) throw new Error('Failed to save style');
      setEditingConfig(null);
      setStep(0);
      loadConfigs(); // refresh config list to show updated names
      onImportComplete?.(); // refresh map to show new style
    } catch (e) {
      alert(`Save failed: ${e.message}`);
    } finally {
      setEditSaving(false);
    }
  };

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
    setFeatureRecords([]); setSelectedFeatures(new Set()); setPickerField(''); setPickerSearch('');
    setEditingConfig(null);
  };

  const panelStyle = {
    background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
    padding: '20px', fontSize: '0.85rem',
  };

  const normalizeUrl = (u) => (u || '').trim().split('?')[0].replace(/\/+$/, '').toLowerCase();

  // Check for duplicate — only block if targeting the same layer
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
                  <button onClick={() => handleEditConfig(c)}
                    style={{ padding: '6px 10px', background: 'none', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', color: '#3B82F6' }}>
                    Edit
                  </button>
                )}
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

  // Layer manager — show all layers with edit buttons (admin only)
  const layerManager = isAdmin ? (
    <div style={{ marginTop: '16px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
      <h3 style={{ margin: '0 0 12px', color: '#333', fontSize: '1.05rem' }}>Layers</h3>
      {layers.length === 0 ? (
        <div style={{ color: '#888' }}>No layers configured.</div>
      ) : (
        <div>
          {layers.map(l => (
            <div key={l.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 0', borderBottom: '1px solid #f5f5f5',
            }}>
              <span style={{ fontSize: '1rem', width: '24px', textAlign: 'center' }}>{l.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', color: '#333' }}>{l.name}</div>
                <div style={{ fontSize: '0.7rem', color: '#999' }}>
                  {l.layer_type} · {l.geometry_type} · {l.feature_count || 0} features
                </div>
              </div>
              <button onClick={() => handleEditConfig({ layer_id: l.id, name: l.name, last_refresh_count: l.feature_count })}
                style={{ padding: '4px 10px', background: 'none', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', color: '#3B82F6' }}>
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null;

  // STEP 0: Just the configs list + layer manager
  if (step === 0) {
    return <div style={panelStyle}>{configsList}{layerManager}</div>;
  }

  // STEP 1: Source selection — ArcGIS URL or File Upload
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
          <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: '16px' }}>
            <button style={tabStyle(sourceType === 'arcgis')} onClick={() => { setSourceType('arcgis'); setPreviewError(''); }}>
              ArcGIS URL
            </button>
            <button style={tabStyle(sourceType === 'file')} onClick={() => { setSourceType('file'); setPreviewError(''); }}>
              Upload File
            </button>
          </div>

          {sourceType === 'arcgis' ? (
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
                  This source is already imported as <strong>"{duplicateConfig.name}"</strong> into {duplicateConfig.layer_name}. You can still import into a different layer, or use Refresh to update existing data.
                </div>
              )}
              {previewError && <div style={{ color: '#dc2626', marginBottom: '12px' }}>{previewError}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handlePreview} disabled={previewLoading || !url.trim()}
                  style={{ flex: 1, padding: '8px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '4px', cursor: (previewLoading || !url.trim()) ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                  {previewLoading ? 'Fetching...' : 'Preview'}
                </button>
                <button onClick={resetWizard}
                  style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
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

  // STEP 2: Confirm — feature picker + style + fields
  if (step === 2 && preview) {
    const skipFields = new Set(['OBJECTID', 'SHAPE', 'Shape', 'GlobalID', 'Shape__Area', 'Shape__Length']);
    const dataFields = preview.fields?.filter(f => !skipFields.has(f.name)) || [];
    const textFields = dataFields.filter(f => f.type === 'text' || f.esri_type === 'esriFieldTypeString');
    const displayName = sourceType === 'file' ? (preview.filename || 'Uploaded File') : preview.name;
    const displayMeta = sourceType === 'file'
      ? `${preview.format} · ${preview.geometry_type} · ${preview.feature_count} features`
      : `${preview.geometry_type} · ${preview.feature_count != null ? `${preview.feature_count} features` : 'unknown count'}`;

    const isPolygonArcgis = preview.geometry_type === 'polygon' && sourceType === 'arcgis';
    const isPolygon = preview.geometry_type === 'polygon';

    // Filter feature records by search
    const filteredRecords = pickerSearch
      ? featureRecords.filter(r => String(r.value || '').toLowerCase().includes(pickerSearch.toLowerCase()))
      : featureRecords;

    // Get unique values sorted
    const uniqueValues = [...new Map(featureRecords.map(r => [r.value, r])).values()]
      .sort((a, b) => String(a.value || '').localeCompare(String(b.value || '')));
    const filteredUnique = pickerSearch
      ? uniqueValues.filter(r => String(r.value || '').toLowerCase().includes(pickerSearch.toLowerCase()))
      : uniqueValues;

    // Group records by value for "select all with this name"
    const recordsByValue = {};
    featureRecords.forEach(r => {
      const key = String(r.value || '');
      if (!recordsByValue[key]) recordsByValue[key] = [];
      recordsByValue[key].push(r.objectid);
    });

    const toggleValue = (value) => {
      const ids = recordsByValue[String(value || '')] || [];
      setSelectedFeatures(prev => {
        const next = new Set(prev);
        const allSelected = ids.every(id => next.has(id));
        if (allSelected) {
          ids.forEach(id => next.delete(id));
        } else {
          ids.forEach(id => next.add(id));
        }
        return next;
      });
    };

    const selectAll = () => {
      setSelectedFeatures(new Set(featureRecords.map(r => r.objectid)));
    };

    const selectNone = () => {
      setSelectedFeatures(new Set());
    };

    // Import count
    const importCount = isPolygonArcgis && featureRecords.length > 0
      ? selectedFeatures.size
      : preview.feature_count;

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

        {/* Feature Picker — polygon ArcGIS imports */}
        {isPolygonArcgis && (
          <div style={{ marginBottom: '12px', border: '1px solid #eee', borderRadius: '6px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#555' }}>
                Select Features to Import
              </div>
              {textFields.length > 1 && (
                <select value={pickerField} onChange={(e) => { setPickerField(e.target.value); loadFeatureValues(preview, e.target.value); }}
                  style={{ padding: '3px 6px', fontSize: '0.75rem', border: '1px solid #ddd', borderRadius: '3px' }}>
                  {textFields.map(f => (
                    <option key={f.name} value={f.name}>{f.alias || f.name}</option>
                  ))}
                </select>
              )}
            </div>

            {pickerLoading ? (
              <div style={{ color: '#888', padding: '12px', textAlign: 'center' }}>Loading features...</div>
            ) : featureRecords.length > 0 ? (
              <>
                {/* Search + select all/none */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                  <input type="text" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)}
                    style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem', border: '1px solid #ddd', borderRadius: '3px', boxSizing: 'border-box' }} />
                  <button onClick={selectAll}
                    style={{ padding: '3px 8px', fontSize: '0.75rem', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    All
                  </button>
                  <button onClick={selectNone}
                    style={{ padding: '3px 8px', fontSize: '0.75rem', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    None
                  </button>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '4px' }}>
                  {selectedFeatures.size} of {featureRecords.length} selected
                </div>
                {/* Scrollable checkbox list */}
                <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #eee', borderRadius: '4px' }}>
                  {filteredUnique.map(r => {
                    const ids = recordsByValue[String(r.value || '')] || [];
                    const allChecked = ids.every(id => selectedFeatures.has(id));
                    const someChecked = !allChecked && ids.some(id => selectedFeatures.has(id));
                    return (
                      <label key={r.value ?? '__null'}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '4px 8px', cursor: 'pointer',
                          borderBottom: '1px solid #f5f5f5',
                          background: allChecked ? '#F0FDF4' : 'transparent',
                        }}>
                        <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked; }}
                          onChange={() => toggleValue(r.value)}
                          style={{ margin: 0 }} />
                        <span style={{ fontSize: '0.8rem', color: '#333', flex: 1 }}>
                          {r.value || '(empty)'}
                        </span>
                        {ids.length > 1 && (
                          <span style={{ fontSize: '0.7rem', color: '#999' }}>×{ids.length}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ color: '#999', fontSize: '0.8rem' }}>No features found</div>
            )}
          </div>
        )}

        {/* Layer style controls — polygon imports only */}
        {isPolygon && (
          <div style={{ marginBottom: '12px', border: '1px solid #eee', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
              Layer Style
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Fill Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="color" value={layerStyle.fillColor}
                    onChange={(e) => setLayerStyle(s => ({ ...s, fillColor: e.target.value }))}
                    style={{ width: '32px', height: '28px', padding: '1px', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>{layerStyle.fillColor}</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Fill Opacity</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="range" min="0" max="1" step="0.05" value={layerStyle.fillOpacity}
                    onChange={(e) => setLayerStyle(s => ({ ...s, fillOpacity: parseFloat(e.target.value) }))}
                    style={{ flex: 1, cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888', minWidth: '28px' }}>{Math.round(layerStyle.fillOpacity * 100)}%</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Border Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="color" value={layerStyle.strokeColor}
                    onChange={(e) => setLayerStyle(s => ({ ...s, strokeColor: e.target.value }))}
                    style={{ width: '32px', height: '28px', padding: '1px', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>{layerStyle.strokeColor}</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Border Opacity</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="range" min="0" max="1" step="0.05" value={layerStyle.strokeOpacity}
                    onChange={(e) => setLayerStyle(s => ({ ...s, strokeOpacity: parseFloat(e.target.value) }))}
                    style={{ flex: 1, cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888', minWidth: '28px' }}>{Math.round(layerStyle.strokeOpacity * 100)}%</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Border Width</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="range" min="0" max="6" step="1" value={layerStyle.strokeWeight}
                    onChange={(e) => setLayerStyle(s => ({ ...s, strokeWeight: parseInt(e.target.value) }))}
                    style={{ flex: 1, cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888', minWidth: '28px' }}>{layerStyle.strokeWeight}px</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Preview</label>
                <div style={{
                  width: '60px', height: '36px', borderRadius: '4px',
                  background: layerStyle.fillOpacity > 0
                    ? `${layerStyle.fillColor}${Math.round(layerStyle.fillOpacity * 255).toString(16).padStart(2, '0')}`
                    : 'transparent',
                  border: `${layerStyle.strokeWeight}px solid ${layerStyle.strokeColor}${Math.round(layerStyle.strokeOpacity * 255).toString(16).padStart(2, '0')}`,
                }} />
              </div>
            </div>
          </div>
        )}

        {/* Fields — collapsed by default for polygon imports since picker is primary */}
        <details style={{ marginBottom: '12px' }} open={!isPolygonArcgis}>
          <summary style={{ fontSize: '0.8rem', fontWeight: '600', color: '#555', cursor: 'pointer', marginBottom: '6px' }}>
            Fields to Import ({dataFields.length})
          </summary>
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
        </details>

        {/* Manual filter expression — ArcGIS only, hidden when picker is active */}
        {sourceType === 'arcgis' && !isPolygonArcgis && (
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
          <button onClick={handleImport}
            disabled={!targetLayerId || (isPolygonArcgis && featureRecords.length > 0 && selectedFeatures.size === 0)}
            style={{
              flex: 1, padding: '8px', background: '#059669', color: '#fff',
              border: 'none', borderRadius: '4px',
              cursor: (!targetLayerId || (isPolygonArcgis && featureRecords.length > 0 && selectedFeatures.size === 0)) ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem', fontWeight: '500',
              opacity: (!targetLayerId || (isPolygonArcgis && featureRecords.length > 0 && selectedFeatures.size === 0)) ? 0.5 : 1,
            }}>
            Import {importCount != null ? `${importCount.toLocaleString()} Feature${importCount !== 1 ? 's' : ''}` : 'Features'}
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

  // STEP 5: Edit existing import — layer style
  if (step === 5 && editingConfig) {
    const layer = layers.find(l => l.id === editingConfig.layer_id);
    const isPolygon = layer?.geometry_type === 'polygon';

    return (
      <div style={panelStyle}>
        <h3 style={{ margin: '0 0 4px', color: '#333', fontSize: '1.05rem' }}>Edit Layer</h3>
        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '12px' }}>
          {editingConfig.last_refresh_count || 0} features
        </div>

        {/* Layer name and icon */}
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ width: '60px' }}>
            <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Icon</label>
            <input type="text" value={editLayerIcon} onChange={(e) => setEditLayerIcon(e.target.value)}
              style={{ width: '100%', padding: '6px', fontSize: '1.1rem', textAlign: 'center', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Layer Name</label>
            <input type="text" value={editLayerName} onChange={(e) => setEditLayerName(e.target.value)}
              style={{ width: '100%', padding: '6px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Layer style controls */}
        {isPolygon && (
          <div style={{ marginBottom: '12px', border: '1px solid #eee', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
              Layer Style
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Fill Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="color" value={layerStyle.fillColor}
                    onChange={(e) => setLayerStyle(s => ({ ...s, fillColor: e.target.value }))}
                    style={{ width: '32px', height: '28px', padding: '1px', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>{layerStyle.fillColor}</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Fill Opacity</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="range" min="0" max="1" step="0.05" value={layerStyle.fillOpacity}
                    onChange={(e) => setLayerStyle(s => ({ ...s, fillOpacity: parseFloat(e.target.value) }))}
                    style={{ flex: 1, cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888', minWidth: '28px' }}>{Math.round(layerStyle.fillOpacity * 100)}%</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Border Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="color" value={layerStyle.strokeColor}
                    onChange={(e) => setLayerStyle(s => ({ ...s, strokeColor: e.target.value }))}
                    style={{ width: '32px', height: '28px', padding: '1px', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>{layerStyle.strokeColor}</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Border Opacity</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="range" min="0" max="1" step="0.05" value={layerStyle.strokeOpacity}
                    onChange={(e) => setLayerStyle(s => ({ ...s, strokeOpacity: parseFloat(e.target.value) }))}
                    style={{ flex: 1, cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888', minWidth: '28px' }}>{Math.round(layerStyle.strokeOpacity * 100)}%</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Border Width</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="range" min="0" max="6" step="1" value={layerStyle.strokeWeight}
                    onChange={(e) => setLayerStyle(s => ({ ...s, strokeWeight: parseInt(e.target.value) }))}
                    style={{ flex: 1, cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888', minWidth: '28px' }}>{layerStyle.strokeWeight}px</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '2px' }}>Preview</label>
                <div style={{
                  width: '60px', height: '36px', borderRadius: '4px',
                  background: layerStyle.fillOpacity > 0
                    ? `${layerStyle.fillColor}${Math.round(layerStyle.fillOpacity * 255).toString(16).padStart(2, '0')}`
                    : 'transparent',
                  border: `${layerStyle.strokeWeight}px solid ${layerStyle.strokeColor}${Math.round(layerStyle.strokeOpacity * 255).toString(16).padStart(2, '0')}`,
                }} />
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleSaveStyle} disabled={editSaving}
            style={{
              flex: 1, padding: '8px', background: '#059669', color: '#fff',
              border: 'none', borderRadius: '4px',
              cursor: editSaving ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem', fontWeight: '500',
            }}>
            {editSaving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => { setEditingConfig(null); setStep(0); }}
            style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return null;
}
