/**
 * AVAlertsTab - Admin settings for Audio/Visual alerts
 * 
 * Page order:
 * 1. Master Controls
 * 2. Alert Sounds (klaxon tones)
 * 3. Announcement Content (field selection)
 * 4. Voice Settings (speed, pauses)
 * 5. Unit Pronunciations (how units are spoken)
 * 6. Preview (hear how it sounds)
 * 7. Custom Announcement (send messages)
 * 8. Connected Devices (live device monitoring)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import ConnectedDevices from '../components/ConnectedDevices';

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

// Available TTS fields from CAD data - descriptions only, no hardcoded examples
const AVAILABLE_TTS_FIELDS = [
  { id: 'units', label: 'Units', desc: 'Announces your units on this call', hasAllUnitsOption: true },
  { id: 'call_type', label: 'Call Type', desc: 'The type of incident' },
  { id: 'subtype', label: 'Subtype', desc: 'Additional call details if available' },
  { id: 'box', label: 'Box/ESZ', desc: 'Box number or emergency service zone' },
  { id: 'address', label: 'Address', desc: 'Street address of the incident' },
  { id: 'cross_streets', label: 'Cross Streets', desc: 'Nearest intersecting streets' },
  { id: 'municipality', label: 'Municipality', desc: 'City or township name' },
  { id: 'development', label: 'Development', desc: 'Subdivision or complex name' },
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
  const [previewAudioUrl, setPreviewAudioUrl] = useState(null);
  const [previewIncidentInfo, setPreviewIncidentInfo] = useState(null);
  const [customMessage, setCustomMessage] = useState('');
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  const [ttsFieldOrder, setTtsFieldOrder] = useState(DEFAULT_TTS_FIELD_ORDER);
  const [draggedField, setDraggedField] = useState(null);
  const [playingPreview, setPlayingPreview] = useState(false);
  const [previewingAnnouncement, setPreviewingAnnouncement] = useState(false);
  
  // Unit pronunciations state
  const [unitMappings, setUnitMappings] = useState([]);
  const [unitMappingsLoading, setUnitMappingsLoading] = useState(false);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [editingUnit, setEditingUnit] = useState(null);
  const [editingSpoken, setEditingSpoken] = useState('');
  const [unitSearch, setUnitSearch] = useState('');
  const [showOnlyReview, setShowOnlyReview] = useState(false);
  const [seedingUnits, setSeedingUnits] = useState(false);
  
  // Abbreviations state
  const [abbreviations, setAbbreviations] = useState([]);
  const [abbreviationsLoading, setAbbreviationsLoading] = useState(false);
  const [abbreviationsExpanded, setAbbreviationsExpanded] = useState(false);
  const [editingAbbr, setEditingAbbr] = useState(null);
  const [editingAbbrSpoken, setEditingAbbrSpoken] = useState('');
  const [newAbbr, setNewAbbr] = useState({ category: 'unit_prefix', abbreviation: '', spoken_as: '' });
  const [showAddAbbr, setShowAddAbbr] = useState(false);
  
  // Voice picker state
  const [availableVoices, setAvailableVoices] = useState([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  
  const fileInputRefs = useRef({});

  // Load preview using real last incident data and generate server-side audio
  // Always clears cached audio to force regeneration with current settings
  const loadPreview = async () => {
    setPreviewAudioUrl(null); // Clear cached audio so it regenerates
    try {
      const res = await fetch(`${API_BASE}/api/test-alerts/settings-preview?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewText(data.sample_text || '');
        setPreviewAudioUrl(data.audio_url || null);
        setPreviewIncidentInfo(data.incident_info || null);
      }
    } catch (err) {
      console.warn('Failed to load TTS preview:', err);
    }
  };

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

  // Load unit mappings
  const loadUnitMappings = async () => {
    setUnitMappingsLoading(true);
    try {
      const params = new URLSearchParams();
      if (showOnlyReview) params.append('needs_review', 'true');
      if (unitSearch) params.append('search', unitSearch);
      params.append('limit', '50');
      
      const res = await fetch(`${API_BASE}/api/tts/units?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUnitMappings(data.units || []);
        setNeedsReviewCount(data.needs_review_count || 0);
      }
    } catch (err) {
      console.error('Failed to load unit mappings:', err);
    } finally {
      setUnitMappingsLoading(false);
    }
  };

  // Load available TTS voices
  const loadVoices = async () => {
    setVoicesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tts/voices`);
      if (res.ok) {
        const data = await res.json();
        setAvailableVoices(data.voices || []);
      }
    } catch (err) {
      console.error('Failed to load voices:', err);
    } finally {
      setVoicesLoading(false);
    }
  };

  // Load TTS abbreviations
  const loadAbbreviations = async () => {
    setAbbreviationsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tts/abbreviations`);
      if (res.ok) {
        const data = await res.json();
        setAbbreviations(data.abbreviations || []);
      }
    } catch (err) {
      console.error('Failed to load abbreviations:', err);
    } finally {
      setAbbreviationsLoading(false);
    }
  };

  // Seed unit pronunciations from recent incidents
  const seedFromIncidents = async () => {
    setSeedingUnits(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/tts/units/seed-from-incidents?count=10`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.units_created > 0) {
          setMessage({ 
            type: 'success', 
            text: `Found ${data.units_found} units, created ${data.units_created} new mappings` 
          });
        } else if (data.units_found > 0) {
          setMessage({ type: 'info', text: `All ${data.units_found} units already configured` });
        } else {
          setMessage({ type: 'info', text: 'No units found in recent incidents' });
        }
        loadUnitMappings();
      } else {
        throw new Error('Seed failed');
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to seed units from incidents' });
    } finally {
      setSeedingUnits(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadUnitMappings();
    loadVoices();
    loadAbbreviations();
  }, []);

  // Reload unit mappings when filter changes
  useEffect(() => {
    loadUnitMappings();
  }, [showOnlyReview, unitSearch]);

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
        // Reload preview after any TTS-related change
        if (key === 'tts_field_order' || key === 'tts_pause_style' || key === 'tts_speed' || key === 'tts_announce_all_units' || key === 'tts_voice') {
          // Small delay to let server process the setting, then regenerate preview
          setTimeout(loadPreview, 300);
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

  // Play server-generated TTS preview (Piper audio) - always fetches fresh
  const playServerPreview = async () => {
    setPlayingPreview(true);
    try {
      const res = await fetch(`${API_BASE}/api/test-alerts/settings-preview?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewText(data.sample_text || '');
        setPreviewIncidentInfo(data.incident_info || null);
        
        if (data.audio_url) {
          const audio = new Audio(data.audio_url + '&_t=' + Date.now());
          audio.onended = () => setPlayingPreview(false);
          audio.onerror = () => {
            setPlayingPreview(false);
            setMessage({ type: 'error', text: 'Failed to play audio' });
          };
          audio.play();
          setPreviewAudioUrl(data.audio_url);
        } else {
          setMessage({ type: 'error', text: 'No audio available' });
          setPlayingPreview(false);
        }
      } else {
        setMessage({ type: 'error', text: 'Failed to generate preview' });
        setPlayingPreview(false);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to generate preview' });
      setPlayingPreview(false);
    }
  };

  // Preview custom announcement locally (uses server TTS)
  const previewAnnouncement = async () => {
    if (!customMessage.trim()) {
      setMessage({ type: 'error', text: 'Please enter a message' });
      return;
    }
    
    setPreviewingAnnouncement(true);
    setMessage(null);
    
    try {
      const res = await fetch(`${API_BASE}/api/test-alerts/tts-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: customMessage.trim() }),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.audio_url) {
          const audio = new Audio(data.audio_url);
          audio.onended = () => setPreviewingAnnouncement(false);
          audio.onerror = () => {
            setPreviewingAnnouncement(false);
            setMessage({ type: 'error', text: 'Failed to play audio' });
          };
          audio.play();
        } else {
          setMessage({ type: 'error', text: 'TTS generation failed' });
          setPreviewingAnnouncement(false);
        }
      } else {
        setMessage({ type: 'error', text: 'TTS generation failed' });
        setPreviewingAnnouncement(false);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to generate preview' });
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

  // Unit pronunciation handlers
  const startEditingUnit = (unit) => {
    setEditingUnit(unit.cad_unit_id);
    setEditingSpoken(unit.spoken_as || '');
  };

  // Abbreviation handlers
  const startEditingAbbr = (abbr) => {
    setEditingAbbr(abbr.id);
    setEditingAbbrSpoken(abbr.spoken_as || '');
  };

  const cancelEditingAbbr = () => {
    setEditingAbbr(null);
    setEditingAbbrSpoken('');
  };

  const saveAbbreviation = async (abbrId) => {
    if (!editingAbbrSpoken.trim()) {
      setMessage({ type: 'error', text: 'Pronunciation cannot be empty' });
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/tts/abbreviations/${abbrId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spoken_as: editingAbbrSpoken.trim() }),
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Abbreviation saved' });
        setEditingAbbr(null);
        setEditingAbbrSpoken('');
        loadAbbreviations();
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save abbreviation' });
    }
  };

  const deleteAbbreviation = async (abbrId) => {
    if (!confirm('Delete this abbreviation?')) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/tts/abbreviations/${abbrId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Abbreviation deleted' });
        loadAbbreviations();
      } else {
        throw new Error('Delete failed');
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete abbreviation' });
    }
  };

  const addAbbreviation = async () => {
    if (!newAbbr.abbreviation.trim() || !newAbbr.spoken_as.trim()) {
      setMessage({ type: 'error', text: 'Both fields are required' });
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/tts/abbreviations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAbbr),
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Abbreviation added' });
        setNewAbbr({ category: newAbbr.category, abbreviation: '', spoken_as: '' });
        setShowAddAbbr(false);
        loadAbbreviations();
      } else {
        const err = await res.json();
        throw new Error(err.detail || 'Add failed');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const cancelEditingUnit = () => {
    setEditingUnit(null);
    setEditingSpoken('');
  };

  const saveUnitPronunciation = async (cadUnitId) => {
    if (!editingSpoken.trim()) {
      setMessage({ type: 'error', text: 'Pronunciation cannot be empty' });
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/tts/units/${cadUnitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spoken_as: editingSpoken.trim() }),
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Pronunciation saved' });
        setEditingUnit(null);
        setEditingSpoken('');
        loadUnitMappings();
        loadPreview(); // Refresh preview with new pronunciation
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save pronunciation' });
    }
  };

  const regenerateUnitPronunciation = async (cadUnitId, stationDigits = 2) => {
    try {
      const res = await fetch(`${API_BASE}/api/tts/units/${cadUnitId}/regenerate?station_digits=${stationDigits}`, {
        method: 'POST',
      });
      
      if (res.ok) {
        const data = await res.json();
        setEditingSpoken(data.spoken_as);
        setMessage({ type: 'success', text: `Regenerated: "${data.spoken_as}"` });
      } else {
        throw new Error('Regenerate failed');
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to regenerate pronunciation' });
    }
  };

  const markAllReviewed = async () => {
    if (!confirm('Accept all auto-generated pronunciations?')) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/tts/units/mark-all-reviewed`, {
        method: 'POST',
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessage({ type: 'success', text: `Marked ${data.count} units as reviewed` });
        loadUnitMappings();
      } else {
        throw new Error('Failed');
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to mark units as reviewed' });
    }
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

      {/* 1. Master Toggles */}
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
                Read incident details aloud after alert tone
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

      {/* 2. Alert Sounds */}
      <div style={{ 
        background: '#f5f5f5', 
        borderRadius: '8px', 
        padding: '1rem',
        marginBottom: '1.5rem',
        border: '1px solid #e0e0e0'
      }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#333' }}>Alert Sounds</h4>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Choose the klaxon/tone that plays before the announcement.
        </p>
        
        {SOUND_TYPES.map(({ key, label, description }) => (
          <div 
            key={key}
            style={{ 
              background: '#fff',
              borderRadius: '6px',
              padding: '1rem',
              marginBottom: '0.75rem',
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
                  title="Preview sound locally"
                >
                  🎧 Preview
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
        
        <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          Supported: MP3, WAV, OGG, FLAC • Max 1MB • Keep sounds 1-3 seconds
        </p>
      </div>

      {/* 3. Announcement Content */}
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
                    <span style={{ color: '#666', fontSize: '0.85rem', flex: 1 }}>{field.desc}</span>
                    
                    {/* All Units toggle for Units field */}
                    {field.hasAllUnitsOption && (
                      <label 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.25rem',
                          fontSize: '0.75rem',
                          color: '#666',
                          cursor: 'pointer',
                          background: settings?.tts_announce_all_units ? '#dbeafe' : '#f5f5f5',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '3px',
                          border: '1px solid #ddd',
                        }}
                        title="Announce all units on the call, not just your department's units"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={settings?.tts_announce_all_units || false}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateSetting('tts_announce_all_units', e.target.checked);
                          }}
                          disabled={saving}
                          style={{ width: '14px', height: '14px' }}
                        />
                        All units
                      </label>
                    )}
                    
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
                  title={field.desc}
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
      </div>

      {/* 4. Voice Settings */}
      <div style={{ 
        background: '#f5f5f5', 
        borderRadius: '8px', 
        padding: '1rem',
        marginBottom: '1.5rem',
        border: '1px solid #e0e0e0'
      }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#333' }}>Voice Settings</h4>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Adjust how the TTS voice sounds.
        </p>
        
        {/* Voice Selection */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 500, color: '#333', marginBottom: '0.5rem' }}>
            Voice
          </label>
          {voicesLoading ? (
            <span style={{ color: '#666', fontSize: '0.85rem' }}>Loading voices...</span>
          ) : availableVoices.length === 0 ? (
            <span style={{ color: '#999', fontSize: '0.85rem', fontStyle: 'italic' }}>No voices available on server</span>
          ) : (
            <select
              value={settings?.tts_voice || 'en_US-ryan-medium'}
              onChange={(e) => updateSetting('tts_voice', e.target.value)}
              disabled={saving}
              style={{
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                background: '#fff',
                fontSize: '0.9rem',
                minWidth: '250px',
                cursor: 'pointer',
              }}
            >
              {availableVoices.map(voice => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          )}
          <p style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Download more voices from <a href="https://rhasspy.github.io/piper-samples/" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>Piper Samples</a>
          </p>
        </div>
        
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
              value={parseFloat(settings?.tts_speed) || 1.1}
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
              {(parseFloat(settings?.tts_speed) || 1.1).toFixed(1)}
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
              { value: 'minimal', label: 'Minimal', desc: 'Short pauses' },
              { value: 'normal', label: 'Normal', desc: 'Medium pauses' },
              { value: 'dramatic', label: 'Dramatic', desc: 'Long pauses' },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => updateSetting('tts_pause_style', option.value)}
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

      {/* 5. Unit Pronunciations */}
      <div style={{ 
        background: needsReviewCount > 0 ? '#fff7ed' : '#f5f5f5', 
        borderRadius: '8px', 
        padding: '1rem',
        marginBottom: '1.5rem',
        border: needsReviewCount > 0 ? '1px solid #fed7aa' : '1px solid #e0e0e0'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h4 style={{ margin: 0, color: '#333' }}>
            Unit Pronunciations
            {needsReviewCount > 0 && (
              <span style={{ 
                marginLeft: '0.5rem', 
                background: '#f97316', 
                color: '#fff', 
                padding: '0.15rem 0.5rem', 
                borderRadius: '10px', 
                fontSize: '0.75rem' 
              }}>
                {needsReviewCount} need review
              </span>
            )}
          </h4>
          {needsReviewCount > 0 && (
            <button
              className="btn btn-sm btn-secondary"
              onClick={markAllReviewed}
              title="Accept all auto-generated pronunciations"
            >
              ✓ Accept All
            </button>
          )}
        </div>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Configure how unit IDs from CAD are spoken. New units are auto-detected and flagged for review.
        </p>
        
        {/* Search and filter */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search units..."
            value={unitSearch}
            onChange={(e) => setUnitSearch(e.target.value)}
            style={{ 
              flex: 1, 
              padding: '0.5rem', 
              border: '1px solid #ddd', 
              borderRadius: '4px',
              fontSize: '0.9rem',
              minWidth: '150px'
            }}
          />
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.25rem',
            padding: '0.5rem 0.75rem',
            background: showOnlyReview ? '#fed7aa' : '#fff',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}>
            <input
              type="checkbox"
              checked={showOnlyReview}
              onChange={(e) => setShowOnlyReview(e.target.checked)}
              style={{ width: '14px', height: '14px' }}
            />
            Needs review only
          </label>
          <button
            className="btn btn-sm btn-secondary"
            onClick={seedFromIncidents}
            disabled={seedingUnits}
            title="Pre-populate unit pronunciations from the last 10 incidents"
          >
            {seedingUnits ? '⏳ Scanning...' : '📥 Seed from Incidents'}
          </button>
          <button
            className="btn btn-sm btn-secondary"
            onClick={loadUnitMappings}
            disabled={unitMappingsLoading}
          >
            {unitMappingsLoading ? '⏳' : '🔄'} Refresh
          </button>
        </div>
        
        {/* Unit list */}
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {unitMappingsLoading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>Loading...</div>
          ) : unitMappings.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#999', fontStyle: 'italic' }}>
              {unitSearch || showOnlyReview ? 'No units match your filter' : 'No units recorded yet. Units will appear here after dispatches.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {unitMappings.map(unit => (
                <div
                  key={unit.cad_unit_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    background: unit.needs_review ? '#fff' : '#fafafa',
                    borderRadius: '4px',
                    border: unit.needs_review ? '1px solid #fed7aa' : '1px solid #e5e5e5',
                  }}
                >
                  {/* CAD Unit ID */}
                  <span style={{ 
                    fontFamily: 'monospace', 
                    fontWeight: 600, 
                    color: '#333', 
                    minWidth: '80px',
                    background: unit.is_ours ? '#dbeafe' : '#f5f5f5',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '3px',
                    fontSize: '0.85rem'
                  }}>
                    {unit.cad_unit_id}
                  </span>
                  
                  {/* Arrow */}
                  <span style={{ color: '#999' }}>→</span>
                  
                  {/* Spoken form (editable or display) */}
                  {editingUnit === unit.cad_unit_id ? (
                    <>
                      <input
                        type="text"
                        value={editingSpoken}
                        onChange={(e) => setEditingSpoken(e.target.value)}
                        style={{ 
                          flex: 1, 
                          padding: '0.25rem 0.5rem', 
                          border: '1px solid #3b82f6',
                          borderRadius: '3px',
                          fontSize: '0.9rem'
                        }}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveUnitPronunciation(unit.cad_unit_id);
                          if (e.key === 'Escape') cancelEditingUnit();
                        }}
                      />
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                          className="btn btn-sm"
                          onClick={() => regenerateUnitPronunciation(unit.cad_unit_id, 2)}
                          title="Regenerate with 2-digit station"
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                        >
                          2d
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => regenerateUnitPronunciation(unit.cad_unit_id, 3)}
                          title="Regenerate with 3-digit station"
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                        >
                          3d
                        </button>
                      </div>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => saveUnitPronunciation(unit.cad_unit_id)}
                        style={{ padding: '0.25rem 0.5rem' }}
                      >
                        ✓
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={cancelEditingUnit}
                        style={{ padding: '0.25rem 0.5rem' }}
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ 
                        flex: 1, 
                        color: '#555', 
                        fontStyle: 'italic',
                        fontSize: '0.9rem'
                      }}>
                        "{unit.spoken_as}"
                      </span>
                      
                      {/* Status badges */}
                      {unit.needs_review && (
                        <span style={{ 
                          background: '#f97316', 
                          color: '#fff', 
                          padding: '0.1rem 0.4rem', 
                          borderRadius: '3px', 
                          fontSize: '0.7rem' 
                        }}>
                          NEW
                        </span>
                      )}
                      {unit.is_ours && (
                        <span style={{ 
                          background: '#3b82f6', 
                          color: '#fff', 
                          padding: '0.1rem 0.4rem', 
                          borderRadius: '3px', 
                          fontSize: '0.7rem' 
                        }}>
                          OURS
                        </span>
                      )}
                      
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => startEditingUnit(unit)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        Edit
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5b. TTS Abbreviations (expandable) */}
      <div style={{ 
        background: '#f5f5f5', 
        borderRadius: '8px', 
        marginBottom: '1.5rem',
        border: '1px solid #e0e0e0',
        overflow: 'hidden'
      }}>
        <div 
          onClick={() => setAbbreviationsExpanded(!abbreviationsExpanded)}
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '1rem',
            cursor: 'pointer',
            background: abbreviationsExpanded ? '#f0f0f0' : '#f5f5f5',
          }}
        >
          <div>
            <h4 style={{ margin: 0, color: '#333' }}>TTS Abbreviations</h4>
            <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
              Unit prefixes (ENG → Engine) and street types (RD → Road)
            </p>
          </div>
          <span style={{ fontSize: '1.2rem', color: '#666' }}>
            {abbreviationsExpanded ? '▼' : '▶'}
          </span>
        </div>
        
        {abbreviationsExpanded && (
          <div style={{ padding: '0 1rem 1rem 1rem', borderTop: '1px solid #e0e0e0' }}>
            {/* Add new button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', marginBottom: '0.5rem' }}>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setShowAddAbbr(true)}
              >
                + Add Abbreviation
              </button>
            </div>
            
            {/* Add form */}
            {showAddAbbr && (
              <div style={{ 
                background: '#e8f4f8', 
                padding: '1rem', 
                borderRadius: '4px', 
                marginBottom: '1rem',
                border: '1px solid #b8d4e3'
              }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>Category</label>
                    <select
                      value={newAbbr.category}
                      onChange={(e) => setNewAbbr({ ...newAbbr, category: e.target.value })}
                      style={{ padding: '0.4rem', borderRadius: '3px', border: '1px solid #ddd' }}
                    >
                      <option value="unit_prefix">Unit Prefix</option>
                      <option value="street_type">Street Type</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>Abbreviation</label>
                    <input
                      type="text"
                      value={newAbbr.abbreviation}
                      onChange={(e) => setNewAbbr({ ...newAbbr, abbreviation: e.target.value.toUpperCase() })}
                      placeholder="e.g. ENG"
                      style={{ padding: '0.4rem', borderRadius: '3px', border: '1px solid #ddd', width: '80px' }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>Spoken As</label>
                    <input
                      type="text"
                      value={newAbbr.spoken_as}
                      onChange={(e) => setNewAbbr({ ...newAbbr, spoken_as: e.target.value })}
                      placeholder="e.g. Engine"
                      style={{ padding: '0.4rem', borderRadius: '3px', border: '1px solid #ddd', width: '100%' }}
                    />
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={addAbbreviation}>Add</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => { setShowAddAbbr(false); setNewAbbr({ category: 'unit_prefix', abbreviation: '', spoken_as: '' }); }}>Cancel</button>
                </div>
              </div>
            )}
            
            {/* Unit Prefixes */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem', fontWeight: 500 }}>UNIT PREFIXES</div>
              {abbreviationsLoading ? (
                <div style={{ padding: '0.5rem', color: '#666' }}>Loading...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {abbreviations.filter(a => a.category === 'unit_prefix').map(abbr => (
                    <div
                      key={abbr.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.35rem 0.5rem',
                        background: '#fff',
                        borderRadius: '3px',
                        border: '1px solid #e5e5e5',
                        fontSize: '0.85rem'
                      }}
                    >
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, minWidth: '50px' }}>{abbr.abbreviation}</span>
                      <span style={{ color: '#999' }}>→</span>
                      {editingAbbr === abbr.id ? (
                        <>
                          <input
                            type="text"
                            value={editingAbbrSpoken}
                            onChange={(e) => setEditingAbbrSpoken(e.target.value)}
                            style={{ flex: 1, padding: '0.2rem 0.4rem', border: '1px solid #3b82f6', borderRadius: '3px', fontSize: '0.85rem' }}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveAbbreviation(abbr.id);
                              if (e.key === 'Escape') cancelEditingAbbr();
                            }}
                          />
                          <button className="btn btn-sm btn-primary" onClick={() => saveAbbreviation(abbr.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>✓</button>
                          <button className="btn btn-sm btn-secondary" onClick={cancelEditingAbbr} style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>✕</button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, color: '#555' }}>{abbr.spoken_as}</span>
                          <button className="btn btn-sm btn-secondary" onClick={() => startEditingAbbr(abbr)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>Edit</button>
                          <button className="btn btn-sm" onClick={() => deleteAbbreviation(abbr.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', color: '#dc2626' }}>✕</button>
                        </>
                      )}
                    </div>
                  ))}
                  {abbreviations.filter(a => a.category === 'unit_prefix').length === 0 && (
                    <div style={{ padding: '0.5rem', color: '#999', fontStyle: 'italic' }}>No unit prefixes configured</div>
                  )}
                </div>
              )}
            </div>
            
            {/* Street Types */}
            <div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem', fontWeight: 500 }}>STREET TYPES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {abbreviations.filter(a => a.category === 'street_type').map(abbr => (
                  <div
                    key={abbr.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.35rem 0.5rem',
                      background: '#fff',
                      borderRadius: '3px',
                      border: '1px solid #e5e5e5',
                      fontSize: '0.85rem'
                    }}
                  >
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, minWidth: '50px' }}>{abbr.abbreviation}</span>
                    <span style={{ color: '#999' }}>→</span>
                    {editingAbbr === abbr.id ? (
                      <>
                        <input
                          type="text"
                          value={editingAbbrSpoken}
                          onChange={(e) => setEditingAbbrSpoken(e.target.value)}
                          style={{ flex: 1, padding: '0.2rem 0.4rem', border: '1px solid #3b82f6', borderRadius: '3px', fontSize: '0.85rem' }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveAbbreviation(abbr.id);
                            if (e.key === 'Escape') cancelEditingAbbr();
                          }}
                        />
                        <button className="btn btn-sm btn-primary" onClick={() => saveAbbreviation(abbr.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>✓</button>
                        <button className="btn btn-sm btn-secondary" onClick={cancelEditingAbbr} style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>✕</button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, color: '#555' }}>{abbr.spoken_as}</span>
                        <button className="btn btn-sm btn-secondary" onClick={() => startEditingAbbr(abbr)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>Edit</button>
                        <button className="btn btn-sm" onClick={() => deleteAbbreviation(abbr.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', color: '#dc2626' }}>✕</button>
                      </>
                    )}
                  </div>
                ))}
                {abbreviations.filter(a => a.category === 'street_type').length === 0 && (
                  <div style={{ padding: '0.5rem', color: '#999', fontStyle: 'italic' }}>No street types configured</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6. Preview */}
      <div style={{ 
        background: '#e8f4f8', 
        borderRadius: '8px', 
        padding: '1rem',
        marginBottom: '1.5rem',
        border: '1px solid #b8d4e3'
      }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#1e3a5f' }}>Preview</h4>
        <p style={{ color: '#4a6785', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Hear how your announcement will sound with current settings.
        </p>
        
        <div style={{ 
          background: '#fff', 
          borderRadius: '4px', 
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid #d0e3ed'
        }}>
          <div style={{ color: '#333', fontStyle: 'italic', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
            "{previewText || 'Loading preview...'}"
          </div>
          {previewIncidentInfo ? (
            <div style={{ color: '#666', fontSize: '0.75rem' }}>
              Based on incident #{previewIncidentInfo.id}
            </div>
          ) : previewText && (
            <div style={{ color: '#888', fontSize: '0.75rem' }}>
              Using sample data (no recent incidents)
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-primary"
            onClick={playServerPreview}
            disabled={playingPreview || !previewText}
            title="Play server-generated TTS audio"
          >
            {playingPreview ? '⏳ Playing...' : '🔊 Play Preview'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => sendTestAlert('dispatch_fire')}
            title="Send full test alert (tone + TTS) to all devices"
          >
            📡 Test All Devices
          </button>
        </div>
      </div>

      {/* 7. Custom Announcement */}
      <div style={{ 
        background: '#fff9e6', 
        borderRadius: '8px', 
        padding: '1rem',
        marginBottom: '1.5rem',
        border: '1px solid #f0d861'
      }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#7c6a0a' }}>📢 Custom Announcement</h4>
        <p style={{ color: '#8b7a14', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Send a custom message to all connected devices (TTS only, no klaxon).
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
            title="Preview locally (only you hear it)"
          >
            {previewingAnnouncement ? '⏳...' : '🎧 Preview'}
          </button>
          <button
            className="btn btn-primary"
            onClick={sendAnnouncement}
            disabled={sendingAnnouncement || !customMessage.trim()}
            title="Send to all connected devices"
          >
            {sendingAnnouncement ? '⏳ Sending...' : '📡 Send All'}
          </button>
        </div>
      </div>

      {/* 8. Connected Devices */}
      <ConnectedDevices />

      {/* How It Works */}
      <div style={{ 
        background: '#f8f8f8', 
        borderRadius: '8px', 
        padding: '1rem', 
        border: '1px solid #e0e0e0'
      }}>
        <h4 style={{ marginBottom: '0.75rem', color: '#333' }}>How It Works</h4>
        <ol style={{ color: '#666', margin: 0, paddingLeft: '1.25rem', lineHeight: 1.8 }}>
          <li><strong>Dispatch received</strong> → Alert tone plays (Fire or EMS)</li>
          <li><strong>TTS announcement</strong> → Selected fields read aloud in order</li>
          <li><strong>Unit pronunciation</strong> → Configured mappings applied (ENG481 → "Engine forty-eight one")</li>
          <li><strong>All devices</strong> → Browser and StationBell receive same audio</li>
        </ol>
      </div>
    </div>
  );
}

export default AVAlertsTab;
