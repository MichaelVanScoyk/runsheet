/**
 * useAVAlerts - Audio/Visual alerts via WebSocket
 * 
 * Provides:
 * - Connection to /ws/AValerts for dispatch/close alerts
 * - Sound playback based on call category (FIRE/EMS)
 * - Optional TTS for incident details
 * - Fetches sound URLs from settings API (allows admin customization)
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_RECONNECT_BASE_DELAY = 1000;
const WS_RECONNECT_MAX_DELAY = 30000;
const WS_PING_INTERVAL = 25000;
const WS_PONG_TIMEOUT = 10000;

// Default sound paths (used if settings not loaded or admin hasn't customized)
const DEFAULT_SOUNDS = {
  dispatch_fire_sound: '/sounds/dispatch-fire.mp3',
  dispatch_ems_sound: '/sounds/dispatch-ems.mp3',
  close_sound: '/sounds/close.mp3',
};

// Try to unlock audio context - some browsers allow this on any user gesture
// even if it happened before the page was loaded (e.g., clicking to enable sound previously)
const tryUnlockAudio = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      // Create and play a silent buffer to fully unlock
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    }
  } catch (e) {
    // Ignore errors - this is best-effort
  }
};

export function useAVAlerts({
  enabled = false,  // User must explicitly enable (unlocks audio context)
  enableTTS = false,
  onAlert,  // Optional callback for additional handling
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
  
  // Audio elements (created once, reused)
  const audioRefs = useRef({});
  
  // Function to reload a specific sound from server
  const reloadSound = useCallback((soundType) => {
    // Map sound_type from backend to our internal keys and settings keys
    const soundTypeMap = {
      'dispatch_fire': { key: 'dispatch_fire', settingsKey: 'dispatch_fire_sound' },
      'dispatch_ems': { key: 'dispatch_ems', settingsKey: 'dispatch_ems_sound' },
      'close': { key: 'close', settingsKey: 'close_sound' },
    };
    
    const mapping = soundTypeMap[soundType];
    if (!mapping) {
      console.warn(`Unknown sound type: ${soundType}`);
      return;
    }
    
    // Fetch fresh settings to get the new URL
    fetch('/api/settings/av-alerts')
      .then(res => res.json())
      .then(data => {
        const newUrl = data[mapping.settingsKey];
        if (newUrl) {
          // Add cache-busting query param to force reload
          const urlWithCacheBust = `${newUrl}${newUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
          console.log(`AV Alerts: Reloading ${soundType} from ${urlWithCacheBust}`);
          
          const audio = new Audio(urlWithCacheBust);
          audio.preload = 'auto';
          audioRefs.current[mapping.key] = audio;
          
          // Update settings state so UI reflects change
          setSettings(data);
        }
      })
      .catch(err => {
        console.warn(`Failed to reload sound ${soundType}:`, err);
      });
  }, []);
  
  // Store reloadSound in ref for WebSocket handler access
  const reloadSoundRef = useRef(reloadSound);
  useEffect(() => {
    reloadSoundRef.current = reloadSound;
  }, [reloadSound]);
  
  // Store callback in ref
  const onAlertRef = useRef(onAlert);
  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    enableTTSRef.current = enableTTS;
  }, [enableTTS]);

  // Try to unlock audio on mount if enabled (restored from localStorage)
  useEffect(() => {
    if (enabled) {
      tryUnlockAudio();
    }
  }, [enabled]);

  // Fetch AV alerts settings from API
  useEffect(() => {
    if (!enabled) return;
    
    fetch('/api/settings/av-alerts')
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        setSettingsLoaded(true);
      })
      .catch(err => {
        console.warn('Failed to load AV alerts settings, using defaults:', err);
        setSettings(DEFAULT_SOUNDS);
        setSettingsLoaded(true);
      });
  }, [enabled]);

  // Initialize/update audio elements when settings load
  useEffect(() => {
    if (!enabled || !settingsLoaded) return;
    
    const soundConfig = settings || DEFAULT_SOUNDS;
    
    // Check if admin has disabled alerts department-wide
    if (soundConfig.enabled === false) {
      console.log('AV alerts disabled by admin');
      return;
    }
    
    // Create/update audio elements for each sound
    const soundMap = {
      dispatch_fire: soundConfig.dispatch_fire_sound || DEFAULT_SOUNDS.dispatch_fire_sound,
      dispatch_ems: soundConfig.dispatch_ems_sound || DEFAULT_SOUNDS.dispatch_ems_sound,
      close: soundConfig.close_sound || DEFAULT_SOUNDS.close_sound,
    };
    
    // Use a single cache-bust timestamp for this load
    const cacheBust = Date.now();
    
    Object.entries(soundMap).forEach(([key, src]) => {
      // Add cache-busting to avoid stale cached audio
      const srcWithCacheBust = `${src}${src.includes('?') ? '&' : '?'}_t=${cacheBust}`;
      
      // Always create new audio element to ensure fresh content
      const audio = new Audio(srcWithCacheBust);
      audio.preload = 'auto';
      audioRefs.current[key] = audio;
    });
    
  }, [enabled, settingsLoaded, settings]);

  // Play sound based on alert type
  const playSound = useCallback((eventType, callCategory) => {
    if (!enabledRef.current) return;
    
    // Check if admin disabled alerts
    if (settings?.enabled === false) return;
    
    let soundKey;
    if (eventType === 'dispatch') {
      soundKey = callCategory === 'EMS' ? 'dispatch_ems' : 'dispatch_fire';
    } else if (eventType === 'close') {
      soundKey = 'close';
    }
    
    if (!soundKey) return;
    
    const audio = audioRefs.current[soundKey];
    if (audio) {
      // Reset and play
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.warn('Audio playback failed:', err);
      });
    }
  }, [settings]);

  // TTS for dispatch alerts
  const speakAlert = useCallback((alert) => {
    if (!enableTTSRef.current || !window.speechSynthesis) return;
    if (alert.event_type !== 'dispatch') return;  // Only TTS on dispatch
    
    // Check if admin disabled TTS
    if (settings?.tts_enabled === false) return;
    
    // Build speech text
    const parts = [];
    
    // Call type
    if (alert.cad_event_type) {
      parts.push(alert.cad_event_type);
    }
    if (alert.cad_event_subtype) {
      parts.push(alert.cad_event_subtype);
    }
    
    // Address
    if (alert.address) {
      parts.push(`at ${alert.address}`);
    }
    
    // Units
    if (alert.units_due && alert.units_due.length > 0) {
      parts.push(`Units: ${alert.units_due.join(', ')}`);
    }
    
    if (parts.length === 0) return;
    
    const text = parts.join('. ');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;  // Slightly slower for clarity
    utterance.pitch = 1.0;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [settings]);

  // Handle incoming alert
  const handleAlert = useCallback((alert) => {
    setLastAlert(alert);
    
    // Play sound
    playSound(alert.event_type, alert.call_category);
    
    // TTS (dispatch only)
    if (alert.event_type === 'dispatch') {
      speakAlert(alert);
    }
    
    // Callback
    onAlertRef.current?.(alert);
  }, [playSound, speakAlert]);

  // WebSocket connection
  useEffect(() => {
    if (!enabled) return;
    
    // Check if admin disabled alerts
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
      
      console.log(`AV Alerts WebSocket reconnecting in ${Math.round(delay/1000)}s (attempt ${reconnectAttempts.current + 1})`);
      
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
            console.log(`AV Alerts connected to ${data.tenant}`);
            break;
          
          case 'sound_updated':
            // Admin updated a sound - reload it
            console.log(`AV Alerts: Sound updated notification for ${data.sound_type}`);
            if (data.sound_type && reloadSoundRef.current) {
              reloadSoundRef.current(data.sound_type);
            }
            break;
            
          default:
            // Alert message (dispatch or close)
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
      
      // Close existing connection if any
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
        
        // Start ping interval
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
        console.log('AV Alerts WebSocket disconnected:', event.code, event.reason);
        setConnected(false);
        cleanup();
        
        // Reconnect unless it was a clean close
        if (event.code !== 1000 && enabledRef.current) {
          scheduleReconnect();
        }
      };
      
      ws.current.onerror = (error) => {
        console.error('AV Alerts WebSocket error:', error);
      };
    };

    // Initial connection with delay
    connectionDelayTimeout = setTimeout(() => {
      connectionDelayTimeout = null;
      if (isMounted && enabledRef.current) {
        connect();
      }
    }, 50);

    // Cleanup on unmount
    return () => {
      isMounted = false;
      cleanup();
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close(1000, 'Component unmounting');
        ws.current = null;
      }
    };
  }, [enabled, settingsLoaded, settings, handleAlert]);

  // Test sound function (for settings UI)
  const testSound = useCallback((soundKey) => {
    const audio = audioRefs.current[soundKey];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.warn('Test sound failed:', err);
      });
    }
  }, []);

  // Check if admin has disabled alerts
  const adminDisabled = settingsLoaded && settings?.enabled === false;

  return {
    connected,
    lastAlert,
    testSound,
    settings,
    settingsLoaded,
    adminDisabled,
  };
}

export default useAVAlerts;
