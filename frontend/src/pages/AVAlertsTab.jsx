/**
 * AVAlertsTab - Admin settings for Audio/Visual alerts
 * 
 * Allows admins to:
 * - Enable/disable AV alerts department-wide
 * - Enable/disable TTS department-wide
 * - Upload custom sound files (or use defaults)
 * - Test sounds
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = '';

// Default sound paths
const DEFAULT_SOUNDS = {
  dispatch_fire_sound: '/sounds/dispatch-fire.mp3',
  dispatch_ems_sound: '/sounds/dispatch-ems.mp3',
  close_sound: '/sounds/close.mp3',
};

const SOUND_TYPES = [
  { key: 'dispatch_fire', label: 'Fire Dispatch', description: 'Plays when a FIRE incident is dispatched' },
  { key: 'dispatch_ems', label: 'EMS Dispatch', description: 'Plays when an EMS incident is dispatched' },
  { key: 'close', label: 'Incident Closed', description: 'Plays when any incident is cleared/closed' },
];

function AVAlertsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [uploading, setUploading] = useState(null); // which sound type is uploading
  
  const fileInputRefs = useRef({});
  const audioRefs = useRef({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/av-alerts`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to load AV alerts settings:', err);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key, value) => {
    setSaving(true);
    setMessage(null);
    
    try {
      const res = await fetch(`${API_BASE}/api/settings/av-alerts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      
      if (res.ok) {
        setSettings(prev => ({ ...prev, [key]: value }));
        setMessage({ type: 'success', text: 'Setting saved' });
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save setting' });
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = async (soundType, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/flac'].includes(file.type)) {
      setMessage({ type: 'error', text: 'Please select an MP3, WAV, OGG, or FLAC audio file' });
      return;
    }
    
    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
      setMessage({ type: 'error', text: 'Audio file must be under 1MB' });
      return;
    }
    
    setUploading(soundType);
    setMessage(null);
    
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        
        const res = await fetch(`${API_BASE}/api/settings/av-alerts/upload-sound?sound_type=${soundType}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: base64, filename: file.name }),
        });
        
        if (res.ok) {
          const data = await res.json();
          setSettings(prev => ({
            ...prev,
            [`${soundType}_sound`]: data.path,
          }));
          setMessage({ type: 'success', text: `Uploaded ${file.name}` });
          // Reload settings to get updated paths
          await loadSettings();
        } else {
          const err = await res.json();
          throw new Error(err.detail || 'Upload failed');
        }
        setUploading(null);
      };
      reader.onerror = () => {
        setMessage({ type: 'error', text: 'Failed to read file' });
        setUploading(null);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      setUploading(null);
    }
  };

  const handleDeleteSound = async (soundType) => {
    if (!confirm('Revert to default sound?')) return;
    
    setUploading(soundType);
    setMessage(null);
    
    try {
      const res = await fetch(`${API_BASE}/api/settings/av-alerts/sound/${soundType}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Reverted to default sound' });
        await loadSettings();
      } else {
        throw new Error('Delete failed');
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete custom sound' });
    } finally {
      setUploading(null);
    }
  };

  const playSound = useCallback((soundType) => {
    const soundKey = `${soundType}_sound`;
    const soundPath = settings?.[soundKey] || DEFAULT_SOUNDS[soundKey];
    
    if (!soundPath) return;
    
    // Create or reuse audio element
    if (!audioRefs.current[soundType]) {
      audioRefs.current[soundType] = new Audio();
    }
    
    const audio = audioRefs.current[soundType];
    audio.src = soundPath;
    audio.currentTime = 0;
    audio.play().catch(err => {
      console.warn('Audio playback failed:', err);
      setMessage({ type: 'error', text: 'Failed to play sound. Make sure the file exists.' });
    });
  }, [settings]);

  const isCustomSound = (soundType) => {
    const path = settings?.[`${soundType}_sound`];
    return path && path.startsWith('/api/');
  };

  if (loading) {
    return <div className="loading">Loading AV alerts settings...</div>;
  }

  return (
    <div className="av-alerts-tab">
      <h3 style={{ color: 'var(--primary-color)' }}>Audio/Visual Alerts</h3>
      <p className="tab-intro">
        Configure browser sound alerts for dispatch and incident close events.
        Users must enable alerts individually in the sidebar toggle.
      </p>

      {message && (
        <div className={`message ${message.type}`} style={{ marginBottom: '1rem' }}>
          {message.text}
        </div>
      )}

      {/* Master Toggles */}
      <div style={{ 
        background: '#f5f5f5', 
        borderRadius: '8px', 
        padding: '1rem', 
        marginBottom: '1.5rem',
        border: '1px solid #e0e0e0'
      }}>
        <h4 style={{ marginBottom: '1rem', color: '#333' }}>Department Settings</h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Enable Alerts */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <strong style={{ color: '#333' }}>Enable Sound Alerts</strong>
              <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                Master switch - disabling this turns off alerts for all users
              </p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings?.enabled !== false}
                onChange={(e) => updateSetting('enabled', e.target.checked)}
                disabled={saving}
                style={{ width: '20px', height: '20px', marginRight: '8px' }}
              />
              <span style={{ color: settings?.enabled !== false ? '#22c55e' : '#666' }}>
                {settings?.enabled !== false ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
          
          {/* Enable TTS */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <strong style={{ color: '#333' }}>Enable Text-to-Speech</strong>
              <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                Allow TTS to read incident type and address on dispatch
              </p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings?.tts_enabled !== false}
                onChange={(e) => updateSetting('tts_enabled', e.target.checked)}
                disabled={saving}
                style={{ width: '20px', height: '20px', marginRight: '8px' }}
              />
              <span style={{ color: settings?.tts_enabled !== false ? '#22c55e' : '#666' }}>
                {settings?.tts_enabled !== false ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Sound Files */}
      <div style={{ 
        background: '#f5f5f5', 
        borderRadius: '8px', 
        padding: '1rem',
        border: '1px solid #e0e0e0'
      }}>
        <h4 style={{ marginBottom: '1rem', color: '#333' }}>Alert Sounds</h4>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Default sounds are included. Upload custom sounds to override them.
        </p>
        
        {SOUND_TYPES.map(({ key, label, description }) => (
          <div 
            key={key}
            style={{ 
              background: '#fff',
              borderRadius: '6px',
              padding: '1rem',
              marginBottom: '1rem',
              border: '1px solid #e0e0e0'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div>
                <strong style={{ color: '#333' }}>{label}</strong>
                <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                  {description}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => playSound(key)}
                  title="Test sound"
                >
                  🔊 Test
                </button>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ 
                color: isCustomSound(key) ? '#22c55e' : '#666',
                fontSize: '0.85rem',
                background: isCustomSound(key) ? '#f0fdf4' : '#f5f5f5',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                border: `1px solid ${isCustomSound(key) ? '#86efac' : '#e0e0e0'}`
              }}>
                {isCustomSound(key) ? '✓ Custom sound' : 'Using default'}
              </span>
              
              <input
                type="file"
                ref={el => fileInputRefs.current[key] = el}
                accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/flac"
                onChange={(e) => handleFileSelect(key, e)}
                style={{ display: 'none' }}
              />
              
              <button
                className="btn btn-sm btn-primary"
                onClick={() => fileInputRefs.current[key]?.click()}
                disabled={uploading === key}
              >
                {uploading === key ? '⏳ Uploading...' : '📤 Upload Custom'}
              </button>
              
              {isCustomSound(key) && (
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDeleteSound(key)}
                  disabled={uploading === key}
                  title="Revert to default"
                >
                  🗑️ Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* How It Works */}
      <div style={{ 
        background: '#f8f8f8', 
        borderRadius: '8px', 
        padding: '1rem', 
        marginTop: '1.5rem',
        border: '1px solid #e0e0e0'
      }}>
        <h4 style={{ marginBottom: '0.75rem', color: '#333' }}>How It Works</h4>
        <ol style={{ color: '#666', margin: 0, paddingLeft: '1.25rem', lineHeight: 1.8 }}>
          <li><strong>User Opt-in</strong> - Each user must enable "Sound Alerts" in the sidebar</li>
          <li><strong>Browser Permission</strong> - Browser audio requires user interaction to unlock</li>
          <li><strong>WebSocket Connection</strong> - Alerts pushed in real-time via /ws/AValerts</li>
          <li><strong>Sound Selection</strong> - Different sounds for Fire dispatch, EMS dispatch, and close</li>
          <li><strong>Optional TTS</strong> - Text-to-speech reads incident details on dispatch</li>
        </ol>
      </div>

      {/* File Guidelines */}
      <div style={{ 
        background: '#fffbeb', 
        borderRadius: '8px', 
        padding: '1rem', 
        marginTop: '1rem',
        border: '1px solid #fcd34d'
      }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#92400e' }}>📁 Sound File Guidelines</h4>
        <ul style={{ color: '#78350f', margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
          <li>Supported formats: MP3, WAV, OGG, FLAC</li>
          <li>Maximum file size: 1MB</li>
          <li>Keep sounds short (1-3 seconds recommended)</li>
          <li>Use distinct tones for Fire vs EMS for easy recognition</li>
        </ul>
      </div>
    </div>
  );
}

export default AVAlertsTab;
