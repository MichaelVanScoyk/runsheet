/**
 * ConnectedDevices - Shows devices currently connected to AV alerts WebSocket.
 * 
 * Displays device type, name, IP, and connection duration.
 * Provides per-device actions: test, identify, disconnect.
 * Auto-refreshes every 15 seconds.
 */

import { useState, useEffect, useCallback } from 'react';

const API_BASE = '';

// Device type display config
const DEVICE_TYPES = {
  browser: { icon: '🖥️', label: 'Browser' },
  stationbell_mini: { icon: '🔔', label: 'StationBell Mini' },
  stationbell_bay: { icon: '📢', label: 'StationBell Bay' },
  unknown: { icon: '❓', label: 'Unknown' },
};

function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

function ConnectedDevices() {
  const [devices, setDevices] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [actionStatus, setActionStatus] = useState(null); // { id, msg, type }

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/av-alerts/devices?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
        setCount(data.count || 0);
        setError(null);
      } else {
        setError('Failed to load');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 15000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  const sendCommand = async (connectionId, command, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    
    setActionStatus({ id: connectionId, msg: '...', type: 'info' });
    try {
      const res = await fetch(`${API_BASE}/api/av-alerts/devices/${connectionId}/${command}`, {
        method: 'POST',
      });
      if (res.ok) {
        const label = command === 'test' ? 'Test sent' : command === 'identify' ? 'Identify sent' : 'Disconnected';
        setActionStatus({ id: connectionId, msg: label, type: 'success' });
        if (command === 'disconnect') {
          // Refresh list after a short delay to let the WS close
          setTimeout(fetchDevices, 500);
        }
      } else {
        setActionStatus({ id: connectionId, msg: 'Failed', type: 'error' });
      }
    } catch {
      setActionStatus({ id: connectionId, msg: 'Error', type: 'error' });
    }
    setTimeout(() => setActionStatus(null), 2000);
  };

  // Group devices by type
  const grouped = {};
  devices.forEach(d => {
    const type = d.device_type || 'unknown';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(d);
  });

  const typeConfig = (type) => DEVICE_TYPES[type] || DEVICE_TYPES.unknown;

  return (
    <div style={{
      background: '#f5f5f5',
      borderRadius: '8px',
      padding: '1rem',
      marginBottom: '1.5rem',
      border: '1px solid #e0e0e0'
    }}>
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h4 style={{ margin: 0, color: '#333' }}>Connected Devices</h4>
          <span style={{
            background: count > 0 ? '#22c55e' : '#999',
            color: '#fff',
            borderRadius: '999px',
            padding: '0.15rem 0.6rem',
            fontSize: '0.8rem',
            fontWeight: 'bold',
          }}>
            {loading ? '...' : count}
          </span>
        </div>
        <span style={{ color: '#666', fontSize: '1.2rem' }}>
          {expanded ? '▾' : '▸'}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: '1rem' }}>
          {error && (
            <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>
          )}

          {!loading && devices.length === 0 && (
            <p style={{ color: '#666', fontSize: '0.85rem', margin: 0 }}>
              No devices currently connected.
            </p>
          )}

          {devices.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Summary badges */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {Object.entries(grouped).map(([type, devs]) => {
                  const cfg = typeConfig(type);
                  return (
                    <span key={type} style={{
                      background: '#fff',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.8rem',
                      color: '#555',
                    }}>
                      {cfg.icon} {cfg.label} × {devs.length}
                    </span>
                  );
                })}
              </div>

              {/* Device list */}
              {devices.map(d => {
                const cfg = typeConfig(d.device_type || 'unknown');
                const isActioning = actionStatus?.id === d.connection_id;
                return (
                  <div key={d.connection_id} style={{
                    background: '#fff',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    padding: '0.75rem 1rem',
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.3rem' }}>{cfg.icon}</span>
                        <div>
                          <div style={{ fontWeight: 'bold', color: '#333', fontSize: '0.9rem' }}>
                            {d.device_name || 'Unknown'}
                          </div>
                          <div style={{ color: '#888', fontSize: '0.75rem' }}>
                            {cfg.label} · {d.connection_id}
                            {d.device_id && ` · ${d.device_id}`}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ 
                          color: '#22c55e', 
                          fontSize: '0.8rem', 
                          fontWeight: 'bold' 
                        }}>
                          ● Connected
                        </div>
                        <div style={{ color: '#888', fontSize: '0.75rem' }}>
                          {timeAgo(d.connected_at)}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      marginTop: '0.5rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px solid #f0f0f0',
                      alignItems: 'center',
                    }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => sendCommand(d.connection_id, 'test')}
                        title="Send a test alert to this device only"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      >
                        🔊 Test
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => sendCommand(d.connection_id, 'identify')}
                        title="Flash LEDs or change tab title to identify this device"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      >
                        💡 Identify
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => sendCommand(d.connection_id, 'disconnect', 'Disconnect this device? It will likely reconnect automatically.')}
                        title="Force-disconnect this device"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', color: '#dc2626' }}
                      >
                        ✕ Disconnect
                      </button>
                      {isActioning && (
                        <span style={{
                          fontSize: '0.75rem',
                          color: actionStatus.type === 'success' ? '#22c55e' : actionStatus.type === 'error' ? '#dc2626' : '#666',
                          marginLeft: '0.25rem',
                        }}>
                          {actionStatus.msg}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ 
            marginTop: '0.75rem', 
            display: 'flex', 
            justifyContent: 'flex-end' 
          }}>
            <button
              className="btn btn-sm btn-secondary"
              onClick={(e) => {
                e.stopPropagation();
                setLoading(true);
                fetchDevices();
              }}
              disabled={loading}
              style={{ fontSize: '0.8rem' }}
            >
              {loading ? '⏳...' : '🔄 Refresh'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConnectedDevices;
