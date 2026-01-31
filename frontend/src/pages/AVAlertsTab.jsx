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

// Available TTS fields from CAD data
const AVAILABLE_TTS_FIELDS = [
  { id: 'units', label: 'Units', example: 'Engine 4 81, Tower 48' },
  { id: 'call_type', label: 'Call Type', example: 'Dwelling Fire' },
  { id: 'subtype', label: 'Subtype', example: 'Gas Leak Inside' },
  { id: 'box', label: 'Box/ESZ', example: 'Box 48-1' },
  { id: 'address', label: 'Address', example: '123 Valley Road' },
  { id: 'cross_streets', label: 'Cross Streets', example: 'Main Street and Oak Avenue' },
  { id: 'municipality', label: 'Municipality', example: 'West Nantmeal' },
  { id: 'development', label: 'Development', example: 'Eagle View' },
];

// Default field order
const DEFAULT_TTS_FIELD_ORDER = ['units', 'call_type', 'address'];

function AVAlertsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [previewText, setPreviewText] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  const [ttsFieldOrder, setTtsFieldOrder] = useState(DEFAULT_TTS_FIELD_ORDER);
  const [draggedField, setDraggedField] = useState(null);
  
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
        // Load TTS field order from settings
        if (data.tts_field_order && Array.isArray(data.tts_field_order)) {
          setTtsFieldOrder(data.tts_field_order);
        }
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
        if (key === 'tts_field_order') {
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

  // Drag and drop handlers for TTS field ordering
  const handleDragStart = (e, fieldId) => {
    setDraggedField(fieldId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, fieldId) => {
    e.preventDefault();
    if (draggedField === fieldId) return;
    
    const newOrder = [...ttsFieldOrder];
    const draggedIdx = newOrder.indexOf(draggedField);
    const targetIdx = newOrder.indexOf(fieldId);
    
    if (draggedIdx !== -1 && targetIdx !== -1) {
      newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, draggedField);
      setTtsFieldOrder(newOrder);
    }
  };

  const handleDragEnd = () => {
    setDraggedField(null);
    // Save the new order
    updateSetting('tts_field_order', ttsFieldOrder);
  };

  const toggleFieldEnabled = (fieldId) => {
    let newOrder;
    if (ttsFieldOrder.includes(fieldId)) {
      // Remove from order (disable)
      newOrder = ttsFieldOrder.filter(f => f !== fieldId);
    } else {
      // Add to end of order (enable)
      newOrder = [...ttsFieldOrder, fieldId];
    }
    setTtsFieldOrder(newOrder);
    updateSetting('tts_field_order', newOrder);
  };

  const moveField = (fieldId, direction) => {
    const idx = ttsFieldOrder.indexOf(fieldId);
    if (idx === -1) return;
    
    const newOrder = [...ttsFieldOrder];
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    
    if (newIdx >= 0 && newIdx < newOrder.length) {
      [newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]];
      setTtsFieldOrder(newOrder);
      updateSetting('tts_field_order', newOrder);
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

  // Send test alert to all connected devices
  const sendTestAlert = async (soundType) => {
    setMessage(null);
    
    // Map sound type to test alert parameters
    let eventType, callCategory;
    if (soundType === 'dispatch_fire') {
      eventType = 'dispatch';
      callCategory = 'FIRE';
    } else if (soundType === 'dispatch_ems') {
      eventType = 'dispatch';
      callCategory = 'EMS';
    } else if (soundType === 'close') {
      eventType = 'close';
      callCategory = 'FIRE';
    } else {
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/test-alerts/test-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          call_category: callCategory,
          cad_event_type: 'TEST ALERT',
          address: '123 Test Street',
          units_due: ['TEST1', 'TEST2'],
        }),
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Test alert sent to all connected devices' });
      } else {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to send test alert');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

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

  // Preview custom announcement locally (uses server TTS)
  const [previewingAnnouncement, setPreviewingAnnouncement] = useState(false);
  
  const previewAnnouncement = async () => {
    if (!customMessage.trim()) {
      setMessage({ type: 'error', text: 'Please enter a message' });
      return;
    }
    
    setPreviewingAnnouncement(true);
    setMessage(null);
    
    try {
      // Generate TTS audio without broadcasting
      const res = await fetch(`${API_BASE}/api/test-alerts/tts-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: customMessage.trim() }),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.audio_url) {
          const audio = new Audio(data.audio_url);
          audio.play().catch(err => {
            console.warn('Audio preview failed:', err);
            // Fallback to browser TTS
            if (window.speechSynthesis) {
              const utterance = new SpeechSynthesisUtterance(customMessage.trim());
              utterance.rate = 0.9;
              window.speechSynthesis.speak(utterance);
            }
          });
        } else {
          // No audio_url, use browser TTS fallback
          if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(customMessage.trim());
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
          }
        }
      } else {
        // Fallback to browser TTS on error
        if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(customMessage.trim());
          utterance.rate = 0.9;
          window.speechSynthesis.speak(utterance);
        }
      }
    } catch (err) {
      // Fallback to browser TTS
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(customMessage.trim());
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      }
    } finally {
      setPreviewingAnnouncement(false);
    }
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

      {/* TTS Field Configuration - Ordered List */}
      <div style={{ 
        background: '#f5f5f5', 
        borderRadius: '8px', 
        padding: '1rem',
        marginBottom: '1.5rem',
        border: '1px solid #e0e0e0'
      }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#333' }}>Announcement Content</h4>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Select and order the fields to include in TTS announcements. Drag to reorder.
        </p>
        
        {/* Enabled fields - ordered list */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem', fontWeight: 500 }}>ENABLED (in order)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {ttsFieldOrder.length === 0 ? (
              <div style={{ padding: '1rem', color: '#999', fontStyle: 'italic', textAlign: 'center', background: '#fff', borderRadius: '4px', border: '1px dashed #ccc' }}>
                No fields enabled. Click fields below to add them.
              </div>
            ) : (
              ttsFieldOrder.map((fieldId, index) => {
                const field = AVAILABLE_TTS_FIELDS.find(f => f.id === fieldId);
                if (!field) return null;
                return (
                  <div
                    key={fieldId}
                    draggable
                    onDragStart={(e) => handleDragStart(e, fieldId)}
                    onDragOver={(e) => handleDragOver(e, fieldId)}
                    onDragEnd={handleDragEnd}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.5rem 0.75rem',
                      background: draggedField === fieldId ? '#e3f2fd' : '#fff',
                      borderRadius: '4px',
                      border: '1px solid #ddd',
                      cursor: 'grab',
                      opacity: draggedField === fieldId ? 0.5 : 1,
                    }}
                  >
                    <span style={{ color: '#999', fontSize: '0.8rem', width: '20px' }}>☰</span>
                    <span style={{ fontWeight: 500, color: '#333', minWidth: '100px' }}>{field.label}</span>
                    <span style={{ color: '#666', fontSize: '0.85rem', flex: 1 }}>{field.example}</span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        onClick={() => moveField(fieldId, 'up')}
                        disabled={index === 0 || saving}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', cursor: index === 0 ? 'default' : 'pointer', opacity: index === 0 ? 0.3 : 1, border: '1px solid #ccc', borderRadius: '3px', background: '#f5f5f5' }}
                      >▲</button>
                      <button
                        onClick={() => moveField(fieldId, 'down')}
                        disabled={index === ttsFieldOrder.length - 1 || saving}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', cursor: index === ttsFieldOrder.length - 1 ? 'default' : 'pointer', opacity: index === ttsFieldOrder.length - 1 ? 0.3 : 1, border: '1px solid #ccc', borderRadius: '3px', background: '#f5f5f5' }}
                      >▼</button>
                    </div>
                    <button
                      onClick={() => toggleFieldEnabled(fieldId)}
                      disabled={saving}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '3px', background: '#fef2f2' }}
                    >✕</button>
                  </div>
                );
              })
            )}
          </div>
        </div>
        
        {/* Available fields - not enabled */}
        {AVAILABLE_TTS_FIELDS.filter(f => !ttsFieldOrder.includes(f.id)).length > 0 && (
          <div>
            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem', fontWeight: 500 }}>AVAILABLE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {AVAILABLE_TTS_FIELDS.filter(f => !ttsFieldOrder.includes(f.id)).map(field => (
                <button
                  key={field.id}
                  onClick={() => toggleFieldEnabled(field.id)}
                  disabled={saving}
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    color: '#666',
                  }}
                >
                  + {field.label}
                </button>
              ))}
            </div>
          </div>
        )}
        
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

      {/* TTS Voice Settings */}
      <div style={{ 
        background: '#f5f5f5', 
        borderRadius: '8px', 
        padding: '1rem',
        marginBottom: '1.5rem',
        border: '1px solid #e0e0e0'
      }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#333' }}>Voice Settings</h4>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Adjust how the TTS voice sounds. Changes apply to server-generated announcements.
        </p>
        
        {/* Speech Speed */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 500, color: '#333', marginBottom: '0.5rem' }}>
            Speech Speed
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#666' }}>Fast</span>
            <input
              type="range"
              min="0.8"
              max="1.5"
              step="0.1"
              value={settings?.tts_speed || 1.1}
              onChange={(e) => updateSetting('tts_speed', parseFloat(e.target.value))}
              disabled={saving}
              style={{ flex: 1, cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.85rem', color: '#666' }}>Slow</span>
            <span style={{ 
              minWidth: '50px', 
              textAlign: 'center', 
              padding: '0.25rem 0.5rem', 
              background: '#fff', 
              borderRadius: '4px', 
              border: '1px solid #ddd',
              fontSize: '0.85rem',
              fontWeight: 500
            }}>
              {(settings?.tts_speed || 1.1).toFixed(1)}
            </span>
          </div>
          <p style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            1.0 = normal speed, higher = slower speech
          </p>
        </div>
        
        {/* Pause Style */}
        <div>
          <label style={{ display: 'block', fontWeight: 500, color: '#333', marginBottom: '0.5rem' }}>
            Pause Between Sections
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { value: 'minimal', label: 'Minimal', desc: 'Short pauses (commas)' },
              { value: 'normal', label: 'Normal', desc: 'Medium pauses (periods)' },
              { value: 'dramatic', label: 'Dramatic', desc: 'Long pauses (ellipses)' },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => {
                  updateSetting('tts_pause_style', option.value);
                  // Reload preview to show updated text format
                  setTimeout(loadPreview, 500);
                }}
                disabled={saving}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  border: (settings?.tts_pause_style || 'normal') === option.value 
                    ? '2px solid var(--primary-color)' 
                    : '1px solid #ddd',
                  background: (settings?.tts_pause_style || 'normal') === option.value 
                    ? 'var(--primary-color)' 
                    : '#fff',
                  color: (settings?.tts_pause_style || 'normal') === option.value 
                    ? '#fff' 
                    : '#333',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ fontWeight: 500 }}>{option.label}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{option.desc}</div>
              </button>
            ))}
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
            className="btn btn-secondary"
            onClick={previewAnnouncement}
            disabled={previewingAnnouncement || !customMessage.trim()}
            title="Preview announcement locally (only you hear it)"
          >
            {previewingAnnouncement ? '⏳...' : '🎧 Preview'}
          </button>
          <button
            className="btn btn-primary"
            onClick={sendAnnouncement}
            disabled={sendingAnnouncement || !customMessage.trim()}
            title="Send announcement to all connected devices"
          >
            {sendingAnnouncement ? '⏳ Sending...' : '📡 Send All'}
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
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => playSound(key)}
                  title="Preview sound locally (only you hear it)"
                >
                  🎧 Preview
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => sendTestAlert(key)}
                  title="Send test to all connected devices"
                >
                  📡 Test All
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
