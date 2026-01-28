/**
 * AVAlertsTab - Admin settings for Audio/Visual alerts
 * 
 * Allows admins to:
 * - Enable/disable AV alerts and TTS department-wide
 * - Configure which fields are included in TTS announcements
 * - Upload custom sound files (or use defaults)
 * - Test sounds and preview TTS
 * - Send custom announcements
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

const TTS_FIELDS = [
  { key: 'tts_include_units', label: 'Units', description: 'Engine 4 81, Tower 48', example: 'ENG481, TWR48' },
  { key: 'tts_include_call_type', label: 'Call Type', description: 'Structure Fire', example: 'DWELLING FIRE' },
  { key: 'tts_include_subtype', label: 'Subtype', description: 'with entrapment', example: 'W/ENTRAPMENT' },
  { key: 'tts_include_address', label: 'Address', description: '123 Valley Road', example: '123 MAIN ST' },
  { key: 'tts_include_cross_streets', label: 'Cross Streets', description: 'between Main and Oak', example: 'OAK AVE / ELM ST' },
  { key: 'tts_include_box', label: 'Box/ESZ', description: 'Box 48-1', example: '48-1' },
];

function AVAlertsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [previewText, setPreviewText] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  
  const fileInputRefs = useRef({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const timestamp = Date.now();
      const res = await fetch(`${API_BASE}/api/settings/av-alerts?_t=${timestamp}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        loadPreview();
      }
    } catch (err) {
      console.error('Failed to load AV alerts settings:', err);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/test-alerts/settings-preview?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewText(data.sample_text || '');
      }
    } catch (err) {
      console.warn('Failed to load TTS preview:', err);
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
        // Reload preview after TTS field change
        if (key.startsWith('tts_include_')) {
          loadPreview();
        }
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
    
    if (!['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/flac'].includes(file.type)) {
      setMessage({ type: 'error', text: 'Please select an MP3, WAV, OGG, or FLAC audio file' });
      return;
    }
    
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
          setMessage({ type: 'success', text: `Uploaded ${file.name}` });
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
    
    const cacheBustedPath = `${soundPath}${soundPath.includes('?') ? '&' : '?'}_t=${Date.now()}`;
    const audio = new Audio(cacheBustedPath);
    audio.currentTime = 0;
    audio.play().catch(err => {
      console.warn('Audio playback failed:', err);
      setMessage({ type: 'error', text: 'Failed to play sound.' });
    });
  }, [settings]);

  const testTTS = () => {
    if (!previewText || !window.speechSynthesis) {
      setMessage({ type: 'error', text: 'TTS not available' });
      return;
    }
    
    const utterance = new SpeechSynthesisUtterance(previewText);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const sendAnnouncement = async () => {
    if (!customMessage.trim()) {
      setMessage({ type: 'error', text: 'Please enter a message' });
      return;
    }
    
    setSendingAnnouncement(true);
    setMessage(null);
    
    try {
      const res = await fetch(`${API_BASE}/api/test-alerts/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: customMessage.trim() }),
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Announcement sent to all devices' });
        setCustomMessage('');
      } else {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to send announcement');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSendingAnnouncement(false);
    }
  };

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
        Configure alert sounds and text-to-speech announcements for dispatch events.
        Settings apply to both browser alerts and StationBell devices.
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
        <h4 style={{ marginBottom: '1rem', color: '#333' }}>Master Controls</h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <strong style={{ color: '#333' }}>Enable Sound Alerts</strong>
              <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                Master switch for all devices (browser + StationBell)
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
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <strong style={{ color: '#333' }}>Enable Text-to-Speech</strong>
              <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                Read incident details aloud on dispatch
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

      {/* TTS Field Configuration */}
      <div style={{ 
        background: '#f5f5f5', 
        borderRadius: '8px', 
        padding: '1rem',
        marginBottom: '1.5rem',
        border: '1px solid #e0e0e0'
      }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#333' }}>Announcement Content</h4>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Select which incident fields to include in TTS announcements.
          Changes apply to both browser and StationBell devices.
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {TTS_FIELDS.map(({ key, label, description }) => (
            <label 
              key={key}
              style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '0.5rem',
                padding: '0.5rem',
                background: '#fff',
                borderRadius: '4px',
                border: '1px solid #e0e0e0',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={settings?.[key] !== false}
                onChange={(e) => updateSetting(key, e.target.checked)}
                disabled={saving}
                style={{ marginTop: '2px' }}
              />
              <div>
                <div style={{ fontWeight: 500, color: '#333' }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: '#666' }}>{description}</div>
              </div>
            </label>
          ))}
        </div>
        
        {/* TTS Preview */}
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#e8f4f8', borderRadius: '4px', border: '1px solid #b8d4e3' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ color: '#1e3a5f', fontSize: '0.85rem' }}>Preview</strong>
            <button
              className="btn btn-sm btn-secondary"
              onClick={testTTS}
              disabled={!previewText}
              title="Test TTS in browser"
            >
              🔊 Test TTS
            </button>
          </div>
          <div style={{ color: '#333', fontStyle: 'italic', fontSize: '0.9rem' }}>
            "{previewText || 'Loading preview...'}"
          </div>
        </div>
      </div>

      {/* Custom Announcement */}
      <div style={{ 
        background: '#fff9e6', 
        borderRadius: '8px', 
        padding: '1rem',
        marginBottom: '1.5rem',
        border: '1px solid #f0d861'
      }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#7c6a0a' }}>📢 Custom Announcement</h4>
        <p style={{ color: '#8b7a14', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Send a custom message to all connected devices (no klaxon sound).
        </p>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder="Type your announcement..."
            maxLength={500}
            style={{ 
              flex: 1,
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.9rem'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !sendingAnnouncement) {
                sendAnnouncement();
              }
            }}
          />
          <button
            className="btn btn-primary"
            onClick={sendAnnouncement}
            disabled={sendingAnnouncement || !customMessage.trim()}
          >
            {sendingAnnouncement ? '⏳ Sending...' : '📣 Send'}
          </button>
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
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => playSound(key)}
                title="Test sound"
              >
                🔊 Test
              </button>
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
          <li><strong>Unified Settings</strong> - Changes here apply to browser AND StationBell devices</li>
          <li><strong>Consistent Announcements</strong> - Same TTS text on all devices (formatted by server)</li>
          <li><strong>WebSocket Updates</strong> - Devices reload settings automatically when you save</li>
          <li><strong>Browser TTS</strong> - Uses your browser's voice; StationBell uses Piper (server)</li>
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
