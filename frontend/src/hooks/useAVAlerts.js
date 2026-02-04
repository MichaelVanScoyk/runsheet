/**
 * useAVAlerts - Audio/Visual alerts via WebSocket
 * 
 * Provides:
 * - Connection to /ws/AValerts for dispatch/close/announcement alerts
 * - Sound playback based on call category (FIRE/EMS)
 * - TTS using server-provided tts_text (consistent across all devices)
 * - Auto-reload of settings when admin changes them
 * 
 * The server formats tts_text based on admin-configured field toggles,
 * ensuring the same announcement on browser and StationBell devices.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_RECONNECT_BASE_DELAY = 1000;
const WS_RECONNECT_MAX_DELAY = 30000;
const WS_PING_INTERVAL = 25000;
const WS_PONG_TIMEOUT = 10000;

// Default sound paths (used if settings not loaded)
const DEFAULT_SOUNDS = {
  dispatch_fire_sound: '/sounds/dispatch-fire.mp3',
  dispatch_ems_sound: '/sounds/dispatch-ems.mp3',
  close_sound: '/sounds/close.mp3',
};

// Try to unlock audio context
const tryUnlockAudio = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    }
  } catch (e) {
    // Ignore errors
  }
};

export function useAVAlerts({
  enabled = false,
  enableTTS = false,
  onAlert,
}) {
  const ws = useRef(null);
  const pingInterval = useRef(null);
  const pongTimeout = useRef(null);
  const reconnectTimeout = useRef(null);
  const reconnectAttempts = useRef(0);
  const enabledRef = useRef(enabled);
  const enableTTSRef = useRef(enableTTS);
  
  const [connected, setConnected] = useState(false);
  const [lastAlert, setLastAlert] = useState(null);
  const [settings, setSettings] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  const audioRefs = useRef({});
  const onAlertRef = useRef(onAlert);

  // Load settings with cache-busting
  const loadSettings = useCallback(async () => {
    try {
      const timestamp = Date.now();
      const res = await fetch(`/api/settings/av-alerts?_t=${timestamp}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setSettingsLoaded(true);
        return data;
      }
    } catch (err) {
      console.warn('Failed to load AV alerts settings:', err);
    }
    setSettings(DEFAULT_SOUNDS);
    setSettingsLoaded(true);
    return DEFAULT_SOUNDS;
  }, []);

  // Reload a specific sound
  const reloadSound = useCallback((soundType) => {
    const soundTypeMap = {
      'dispatch_fire': { key: 'dispatch_fire', settingsKey: 'dispatch_fire_sound' },
      'dispatch_ems': { key: 'dispatch_ems', settingsKey: 'dispatch_ems_sound' },
      'close': { key: 'close', settingsKey: 'close_sound' },
    };
    
    const mapping = soundTypeMap[soundType];
    if (!mapping) return;
    
    // Reload settings and update audio element
    loadSettings().then(data => {
      const newUrl = data[mapping.settingsKey];
      if (newUrl) {
        const urlWithCacheBust = `${newUrl}${newUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
        console.log(`AV Alerts: Reloading ${soundType} from ${urlWithCacheBust}`);
        const audio = new Audio(urlWithCacheBust);
        audio.preload = 'auto';
        audioRefs.current[mapping.key] = audio;
      }
    });
  }, [loadSettings]);
  
  const reloadSoundRef = useRef(reloadSound);
  useEffect(() => {
    reloadSoundRef.current = reloadSound;
  }, [reloadSound]);

  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    enableTTSRef.current = enableTTS;
  }, [enableTTS]);

  // Unlock audio on mount if enabled
  useEffect(() => {
    if (enabled) {
      tryUnlockAudio();
    }
  }, [enabled]);

  // Load settings on enable
  useEffect(() => {
    if (!enabled) return;
    loadSettings();
  }, [enabled, loadSettings]);

  // Initialize audio elements when settings load
  useEffect(() => {
    if (!enabled || !settingsLoaded) return;
    
    const soundConfig = settings || DEFAULT_SOUNDS;
    
    if (soundConfig.enabled === false) {
      console.log('AV alerts disabled by admin');
      return;
    }
    
    const soundMap = {
      dispatch_fire: soundConfig.dispatch_fire_sound || DEFAULT_SOUNDS.dispatch_fire_sound,
      dispatch_ems: soundConfig.dispatch_ems_sound || DEFAULT_SOUNDS.dispatch_ems_sound,
      close: soundConfig.close_sound || DEFAULT_SOUNDS.close_sound,
    };
    
    const cacheBust = Date.now();
    
    Object.entries(soundMap).forEach(([key, src]) => {
      const srcWithCacheBust = `${src}${src.includes('?') ? '&' : '?'}_t=${cacheBust}`;
      const audio = new Audio(srcWithCacheBust);
      audio.preload = 'auto';
      audioRefs.current[key] = audio;
    });
  }, [enabled, settingsLoaded, settings]);

  // Play sound based on alert type
  const playSound = useCallback((eventType, callCategory) => {
    if (!enabledRef.current) return;
    if (settings?.enabled === false) return;
    
    let soundKey;
    if (eventType === 'dispatch') {
      soundKey = callCategory === 'EMS' ? 'dispatch_ems' : 'dispatch_fire';
    } else if (eventType === 'close') {
      soundKey = 'close';
    }
    // Announcements don't play klaxon
    
    if (!soundKey) return;
    
    const audio = audioRefs.current[soundKey];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.warn('Audio playback failed:', err);
      });
    }
  }, [settings]);

  // Play server-generated audio (from Piper TTS)
  const playServerAudio = useCallback((audioUrl) => {
    if (!audioUrl) return Promise.resolve(false);
    
    return new Promise((resolve) => {
      const audio = new Audio(audioUrl);
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      audio.play().catch(() => resolve(false));
    });
  }, []);

  // TTS using server-provided audio_url (preferred) or browser TTS (fallback)
  const speakAlert = useCallback(async (alert) => {
    if (!enableTTSRef.current) return;
    
    // Check if admin disabled TTS
    if (settings?.tts_enabled === false) return;
    
    // Prefer server-generated audio (Piper TTS) if available
    if (alert.audio_url) {
      const played = await playServerAudio(alert.audio_url);
      if (played) return; // Server audio played successfully
    }
    
    // Fallback to browser TTS if no audio_url or playback failed
    if (!window.speechSynthesis) return;
    
    const text = alert.tts_text;
    if (!text) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [settings, playServerAudio]);

  // Handle incoming alert
  const handleAlert = useCallback((alert) => {
    setLastAlert(alert);
    
    // Play sound (dispatch/close only, not announcements)
    if (alert.event_type !== 'announcement') {
      playSound(alert.event_type, alert.call_category);
    }
    
    // TTS for dispatch and announcement
    if (alert.event_type === 'dispatch' || alert.event_type === 'announcement') {
      speakAlert(alert);
    }
    
    onAlertRef.current?.(alert);
  }, [playSound, speakAlert]);

  // WebSocket connection
  useEffect(() => {
    if (!enabled) return;
    
    if (settingsLoaded && settings?.enabled === false) {
      console.log('AV alerts disabled by admin - not connecting WebSocket');
      return;
    }

    let isMounted = true;
    let connectionDelayTimeout = null;

    const cleanup = () => {
      if (pingInterval.current) {
        clearInterval(pingInterval.current);
        pingInterval.current = null;
      }
      if (pongTimeout.current) {
        clearTimeout(pongTimeout.current);
        pongTimeout.current = null;
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      if (connectionDelayTimeout) {
        clearTimeout(connectionDelayTimeout);
        connectionDelayTimeout = null;
      }
    };

    const scheduleReconnect = () => {
      if (!isMounted || !enabledRef.current) return;
      
      cleanup();
      
      const delay = Math.min(
        WS_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts.current) + Math.random() * 1000,
        WS_RECONNECT_MAX_DELAY
      );
      
      console.log(`AV Alerts WebSocket reconnecting in ${Math.round(delay/1000)}s`);
      
      reconnectTimeout.current = setTimeout(() => {
        if (isMounted && enabledRef.current) {
          reconnectAttempts.current++;
          connect();
        }
      }, delay);
    };

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'ping':
            if (ws.current?.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify({ type: 'pong' }));
            }
            break;
            
          case 'pong':
            if (pongTimeout.current) {
              clearTimeout(pongTimeout.current);
              pongTimeout.current = null;
            }
            break;
            
          case 'connected':
            console.log(`AV Alerts connected to ${data.tenant} [${data.connection_id}]`);
            // Register this browser so the server can identify it in the device list
            if (ws.current?.readyState === WebSocket.OPEN) {
              const ua = navigator.userAgent;
              const browserName = ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : 'Browser';
              const osName = ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'Mac' : ua.includes('Linux') ? 'Linux' : ua.includes('Android') ? 'Android' : ua.includes('iPhone') ? 'iPhone' : '';
              ws.current.send(JSON.stringify({
                type: 'register',
                device_type: 'browser',
                name: osName ? `${browserName} - ${osName}` : browserName,
              }));
            }
            break;
          
          case 'sound_updated':
            console.log(`AV Alerts: Sound updated - ${data.sound_type}`);
            if (data.sound_type && reloadSoundRef.current) {
              reloadSoundRef.current(data.sound_type);
            }
            break;
          
          case 'settings_updated':
            console.log(`AV Alerts: Settings updated (v${data.settings_version})`);
            loadSettings();
            break;
            
          default:
            // Alert message (dispatch, close, or announcement)
            if (data.event_type) {
              handleAlert(data);
            }
        }
      } catch (e) {
        console.error('AV Alerts message parse error:', e);
      }
    };

    const connect = () => {
      if (!isMounted || !enabledRef.current) return;
      
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
        ws.current = null;
      }
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/AValerts`;
      
      console.log('AV Alerts WebSocket connecting to:', wsUrl);
      
      try {
        ws.current = new WebSocket(wsUrl);
      } catch (e) {
        console.error('AV Alerts WebSocket creation failed:', e);
        scheduleReconnect();
        return;
      }
      
      ws.current.onopen = () => {
        if (!isMounted) return;
        console.log('AV Alerts WebSocket connected');
        setConnected(true);
        reconnectAttempts.current = 0;
        
        pingInterval.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping' }));
            
            pongTimeout.current = setTimeout(() => {
              console.warn('AV Alerts pong timeout - reconnecting');
              ws.current?.close();
            }, WS_PONG_TIMEOUT);
          }
        }, WS_PING_INTERVAL);
      };
      
      ws.current.onmessage = handleMessage;
      
      ws.current.onclose = (event) => {
        if (!isMounted) return;
        console.log('AV Alerts WebSocket disconnected:', event.code);
        setConnected(false);
        cleanup();
        
        if (event.code !== 1000 && enabledRef.current) {
          scheduleReconnect();
        }
      };
      
      ws.current.onerror = (error) => {
        console.error('AV Alerts WebSocket error:', error);
      };
    };

    connectionDelayTimeout = setTimeout(() => {
      connectionDelayTimeout = null;
      if (isMounted && enabledRef.current) {
        connect();
      }
    }, 50);

    return () => {
      isMounted = false;
      cleanup();
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close(1000, 'Component unmounting');
        ws.current = null;
      }
    };
  }, [enabled, settingsLoaded, settings, handleAlert, loadSettings]);

  // Test sound function
  const testSound = useCallback((soundKey) => {
    const audio = audioRefs.current[soundKey];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.warn('Test sound failed:', err);
      });
    }
  }, []);

  const adminDisabled = settingsLoaded && settings?.enabled === false;

  return {
    connected,
    lastAlert,
    testSound,
    settings,
    settingsLoaded,
    adminDisabled,
    reloadSettings: loadSettings,
  };
}

export default useAVAlerts;
