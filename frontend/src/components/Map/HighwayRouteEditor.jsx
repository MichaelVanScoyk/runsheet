/**
 * HighwayRouteEditor.jsx — Draw highway routes for mile marker geocoding
 *
 * Full-screen overlay panel for configuring highway routes.
 * Works with the existing GoogleMap in MapPage - receives clicks from parent.
 *
 * Props:
 *   isOpen           - boolean, whether editor is visible
 *   onClose          - () => void, exit editor mode
 *   onRouteSaved     - (route) => void, called after successful save
 *   existingRoute    - route object if editing, null if creating new
 *   points           - array of {lat, lng} from map clicks
 *   onAddPoint       - (lat, lng) => void, called when map clicked in draw mode
 *   onRemovePoint    - (index) => void
 *   onClearPoints    - () => void
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const DIRECTIONS = ['NB', 'SB', 'EB', 'WB'];

export default function HighwayRouteEditor({
  isOpen,
  onClose,
  onRouteSaved,
  existingRoute = null,
  points = [],
  onSetPoints,
  onClearPoints,
  mapClickHandler, // Ref to expose click handler to parent
  onTraceStartChange, // Callback when trace start point changes (for map marker)
  onMmPointChange, // Callback when MM anchor point changes (for special marker color)
}) {
  // Route metadata
  const [name, setName] = useState('');
  const [bidirectional, setBidirectional] = useState(true);
  const [direction, setDirection] = useState('');
  const [limitedAccess, setLimitedAccess] = useState(false);
  const [milesDecreaseToward, setMilesDecreaseToward] = useState('');
  const [aliases, setAliases] = useState([]);
  const [newAlias, setNewAlias] = useState('');

  // Mile marker
  const [mmPointIndex, setMmPointIndex] = useState(null);
  const [mmValue, setMmValue] = useState('');

  // UI state
  const [mode, setMode] = useState('trace'); // 'trace' | 'draw' | 'setMM'
  const [traceStart, setTraceStart] = useState(null); // first click for trace
  const traceStartRef = useRef(null); // ref for closure-safe access
  const [tracing, setTracing] = useState(false); // API call in progress
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(() => {
    try {
      return localStorage.getItem('highway_route_help_dismissed') !== 'true';
    } catch {
      return true;
    }
  });

  // Load existing route if editing
  useEffect(() => {
    if (!isOpen) return;
    
    if (existingRoute) {
      setName(existingRoute.name || '');
      setBidirectional(existingRoute.bidirectional ?? true);
      setDirection(existingRoute.direction || '');
      setLimitedAccess(existingRoute.limited_access ?? false);
      setMilesDecreaseToward(existingRoute.miles_decrease_toward || '');
      setMmPointIndex(existingRoute.mm_point_index);
      onMmPointChange?.(existingRoute.mm_point_index);
      setMmValue(existingRoute.mm_value?.toString() || '');
      setAliases(existingRoute.aliases || []);
      if (existingRoute.points && onSetPoints) {
        onSetPoints(existingRoute.points);
      }
      setMode('draw'); // existing route goes to draw mode
    } else {
      // Reset for new route
      setName('');
      setBidirectional(true);
      setDirection('');
      setLimitedAccess(false);
      setMilesDecreaseToward('');
      setMmPointIndex(null);
      setMmValue('');
      setAliases([]);
      setMode('trace'); // new route starts in trace mode
      traceStartRef.current = null;
      setTraceStart(null);
      onMmPointChange?.(null);
      if (onClearPoints) onClearPoints();
    }
  }, [existingRoute, isOpen, onMmPointChange, onClearPoints, onSetPoints]);

  // Handle clicking existing point to set as MM
  const handleSetMmPoint = useCallback((index) => {
    setMmPointIndex(index);
    onMmPointChange?.(index);
    setMode('draw');
  }, [onMmPointChange]);

  // Handle map click in trace mode
  const handleTraceClick = useCallback(async (lat, lng) => {
    const currentTraceStart = traceStartRef.current;
    
    if (!currentTraceStart) {
      // First click - set start point
      const startPoint = { lat, lng };
      traceStartRef.current = startPoint;
      setTraceStart(startPoint);
      onTraceStartChange?.(startPoint);
      return;
    }
    
    // Second click - trace the road
    setTracing(true);
    setError('');
    
    try {
      const res = await fetch('/api/map/highway-routes/trace-road', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_lat: currentTraceStart.lat,
          start_lng: currentTraceStart.lng,
          end_lat: lat,
          end_lng: lng,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to trace road');
      }
      
      const data = await res.json();
      
      // Set the points from the traced road
      if (onSetPoints && data.points?.length > 0) {
        onSetPoints(data.points);
      }
      
      // Switch to draw mode for fine-tuning
      setMode('draw');
      traceStartRef.current = null;
      setTraceStart(null);
      onTraceStartChange?.(null);
      
    } catch (e) {
      setError(e.message);
    } finally {
      setTracing(false);
    }
  }, [onSetPoints, onTraceStartChange]);

  // Cancel trace mode
  const handleCancelTrace = useCallback(() => {
    traceStartRef.current = null;
    setTraceStart(null);
    onTraceStartChange?.(null);
  }, [onTraceStartChange]);

  // Handle any map click - route to appropriate handler based on mode
  const handleMapClick = useCallback((lat, lng) => {
    if (mode === 'trace') {
      handleTraceClick(lat, lng);
    } else if (mode === 'draw') {
      // Add point in draw mode
      if (onSetPoints) {
        onSetPoints([...points, { lat, lng }]);
      }
    }
    // setMM mode doesn't respond to map clicks
  }, [mode, handleTraceClick, onSetPoints, points]);

  // Expose handleMapClick to parent via ref
  useEffect(() => {
    if (mapClickHandler) {
      mapClickHandler.current = handleMapClick;
    }
  }, [mapClickHandler, handleMapClick]);

  // Remove point
  const handleRemovePoint = useCallback((index) => {
    if (!onSetPoints) return;
    const newPoints = points.filter((_, i) => i !== index);
    onSetPoints(newPoints);
    
    // Adjust MM index if needed
    if (mmPointIndex !== null) {
      if (index === mmPointIndex) {
        setMmPointIndex(null);
        onMmPointChange?.(null);
      } else if (index < mmPointIndex) {
        const newIndex = mmPointIndex - 1;
        setMmPointIndex(newIndex);
        onMmPointChange?.(newIndex);
      }
    }
  }, [points, mmPointIndex, onSetPoints, onMmPointChange]);

  // Add alias
  const handleAddAlias = () => {
    const trimmed = newAlias.trim().toUpperCase();
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases(prev => [...prev, trimmed]);
      setNewAlias('');
    }
  };

  // Remove alias
  const handleRemoveAlias = (alias) => {
    setAliases(prev => prev.filter(a => a !== alias));
  };

  // Dismiss help
  const handleDismissHelp = (dontShowAgain) => {
    setShowHelp(false);
    if (dontShowAgain) {
      try {
        localStorage.setItem('highway_route_help_dismissed', 'true');
      } catch {}
    }
  };

  // Validate before save
  const canSave = () => {
    if (!name.trim()) return false;
    if (points.length < 2) return false;
    if (mmPointIndex === null) return false;
    if (!mmValue || isNaN(parseFloat(mmValue))) return false;
    if (!milesDecreaseToward) return false;
    return true;
  };

  // Save route
  const handleSave = async () => {
    if (!canSave()) {
      setError('Please complete all required fields');
      return;
    }

    setSaving(true);
    setError('');

    const payload = {
      name: name.trim(),
      bidirectional,
      direction: bidirectional ? null : direction,
      limited_access: limitedAccess,
      miles_decrease_toward: milesDecreaseToward,
      mm_point_index: mmPointIndex,
      mm_value: parseFloat(mmValue),
      aliases,
      points: points.map((p, i) => ({
        sequence: i,
        lat: p.lat,
        lng: p.lng,
      })),
    };

    try {
      const url = existingRoute
        ? `/api/map/highway-routes/${existingRoute.id}`
        : '/api/map/highway-routes';
      const method = existingRoute ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Save failed');
      }

      const saved = await res.json();
      onRouteSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (onClearPoints) onClearPoints();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Help overlay */}
      {showHelp && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '400px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>
              📍 Creating a Mile Marker Road
            </h3>
            <ol style={{ margin: '0 0 16px 0', paddingLeft: '20px', lineHeight: '1.6' }}>
              <li><strong>Trace:</strong> Click start point, then end point to auto-trace the road</li>
              <li>Or use "Manual Draw" to click points yourself</li>
              <li>Click a point in the list, then "Set as Mile Marker"</li>
              <li>Enter the mile marker value at that point</li>
              <li>Set which direction miles decrease</li>
              <li>Add names CAD might use for this road</li>
            </ol>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#666' }}>
              <strong>Tip:</strong> Trace mode follows the road perfectly!
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => handleDismissHelp(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                }}
              >
                Got it
              </button>
              <label style={{ fontSize: '0.8rem', color: '#666', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  onChange={(e) => e.target.checked && handleDismissHelp(true)}
                  style={{ marginRight: '4px' }}
                />
                Don't show again
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Left panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: '340px',
        background: '#fff',
        borderRight: '1px solid #ddd',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#f9fafb',
        }}>
          <span style={{ fontSize: '1.2rem' }}>〰️</span>
          <span style={{ fontWeight: '600', color: '#333', flex: 1 }}>
            {existingRoute ? 'Edit' : 'New'} Mile Marker Road
          </span>
          <button
            onClick={() => setShowHelp(true)}
            style={{
              padding: '4px 8px',
              background: 'none',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              color: '#666',
            }}
          >
            ?
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          {/* Route name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#555', marginBottom: '4px' }}>
              Route Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Mode indicator */}
          <div style={{
            padding: '12px',
            background: mode === 'setMM' ? '#dcfce7' : mode === 'trace' ? '#fef3c7' : '#dbeafe',
            borderRadius: '6px',
            fontSize: '0.85rem',
            color: mode === 'setMM' ? '#166534' : mode === 'trace' ? '#92400e' : '#1e40af',
          }}>
            {mode === 'setMM' && '📍 Click a point below to set as mile marker'}
            {mode === 'draw' && '🖱️ Click on the map to add points along the road'}
            {mode === 'trace' && !traceStart && '🛣️ Click the START of the road you want to trace'}
            {mode === 'trace' && traceStart && (tracing 
              ? '⏳ Tracing road...' 
              : '🛣️ Click the END of the road to complete trace')}
          </div>

          {/* Trace mode controls */}
          {mode === 'trace' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {traceStart && (
                <button
                  onClick={handleCancelTrace}
                  disabled={tracing}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: '#f3f4f6',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => {
                  setMode('draw');
                  traceStartRef.current = null;
                  setTraceStart(null);
                  onTraceStartChange?.(null);
                }}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: '#e5e7eb',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                Manual Draw Instead
              </button>
            </div>
          )}

          {/* Points list */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#555' }}>
                Route Points ({points.length})
              </label>
              {mode === 'draw' && (
                <button
                  onClick={() => setMode('setMM')}
                  disabled={points.length === 0}
                  style={{
                    padding: '4px 8px',
                    background: points.length > 0 ? '#16a34a' : '#ccc',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: points.length > 0 ? 'pointer' : 'not-allowed',
                    fontSize: '0.75rem',
                  }}
                >
                  Set Mile Marker
                </button>
              )}
              {mode === 'setMM' && (
                <button
                  onClick={() => setMode('draw')}
                  style={{
                    padding: '4px 8px',
                    background: '#6b7280',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
            
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '4px',
            }}>
              {points.length === 0 ? (
                <div style={{ padding: '12px', color: '#888', fontSize: '0.85rem', textAlign: 'center' }}>
                  Click on the map to add points
                </div>
              ) : (
                points.map((p, i) => (
                  <div
                    key={i}
                    onClick={() => mode === 'setMM' && handleSetMmPoint(i)}
                    style={{
                      padding: '8px 12px',
                      borderBottom: i < points.length - 1 ? '1px solid #e5e7eb' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: mode === 'setMM' ? 'pointer' : 'default',
                      background: mmPointIndex === i ? '#dcfce7' : (mode === 'setMM' ? '#f9fafb' : '#fff'),
                    }}
                  >
                    <span style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: mmPointIndex === i ? '#16a34a' : '#e5e7eb',
                      color: mmPointIndex === i ? '#fff' : '#666',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ flex: 1, fontSize: '0.8rem', color: '#666', fontFamily: 'monospace' }}>
                      {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                    </span>
                    {mmPointIndex === i && (
                      <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: '600' }}>
                        MM
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemovePoint(i); }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#999',
                        fontSize: '1rem',
                        padding: '0 4px',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Mile marker value */}
          {mmPointIndex !== null && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#555', marginBottom: '4px' }}>
                Mile Marker Value *
              </label>
              <input
                type="number"
                step="0.1"
                value={mmValue}
                onChange={(e) => setMmValue(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* Miles decrease toward */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#555', marginBottom: '4px' }}>
              Miles Decrease Toward *
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {DIRECTIONS.map(d => (
                <button
                  key={d}
                  onClick={() => setMilesDecreaseToward(d)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: milesDecreaseToward === d ? '#2563eb' : '#f3f4f6',
                    color: milesDecreaseToward === d ? '#fff' : '#333',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: milesDecreaseToward === d ? '600' : '400',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={bidirectional}
                onChange={(e) => setBidirectional(e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>Bidirectional (serves both directions)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={limitedAccess}
                onChange={(e) => setLimitedAccess(e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>Limited access (no routing)</span>
            </label>
          </div>

          {/* One-way direction */}
          {!bidirectional && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#555', marginBottom: '4px' }}>
                Direction (one-way)
              </label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Select...</option>
                {DIRECTIONS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {/* Aliases */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#555', marginBottom: '4px' }}>
              CAD Aliases
            </label>
            <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 8px 0' }}>
              What might CAD call this road?
            </p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddAlias()}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                }}
              />
              <button
                onClick={handleAddAlias}
                style={{
                  padding: '8px 12px',
                  background: '#f3f4f6',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Add
              </button>
            </div>
            {aliases.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {aliases.map(alias => (
                  <span
                    key={alias}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      background: '#e5e7eb',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                    }}
                  >
                    {alias}
                    <button
                      onClick={() => handleRemoveAlias(alias)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0',
                        fontSize: '0.9rem',
                        color: '#666',
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '4px',
              color: '#dc2626',
              fontSize: '0.85rem',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #ddd',
          display: 'flex',
          gap: '8px',
          background: '#f9fafb',
        }}>
          <button
            onClick={handleCancel}
            style={{
              flex: 1,
              padding: '10px',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave()}
            style={{
              flex: 1,
              padding: '10px',
              background: canSave() ? '#2563eb' : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: canSave() ? 'pointer' : 'not-allowed',
              fontSize: '0.9rem',
              fontWeight: '500',
            }}
          >
            {saving ? 'Saving...' : 'Save Route'}
          </button>
        </div>
      </div>
    </>
  );
}
