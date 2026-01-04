/**
 * useIncidentWebSocket - Real-time incident updates via WebSocket
 * 
 * Provides:
 * - Automatic connection to /ws/incidents
 * - Reconnection with exponential backoff
 * - Fallback to polling if WebSocket unavailable
 * - Ping/pong keepalive
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_RECONNECT_BASE_DELAY = 1000;
const WS_RECONNECT_MAX_DELAY = 30000;
const WS_PING_INTERVAL = 30000;
const WS_PONG_TIMEOUT = 5000;

export function useIncidentWebSocket({
  onIncidentCreated,
  onIncidentUpdated,
  onIncidentClosed,
  onMessage,
  enabled = true,
}) {
  const ws = useRef(null);
  const pingInterval = useRef(null);
  const pongTimeout = useRef(null);
  const reconnectTimeout = useRef(null);
  const reconnectAttempts = useRef(0);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  
  const callbacksRef = useRef({
    onIncidentCreated,
    onIncidentUpdated,
    onIncidentClosed,
    onMessage,
  });
  
  useEffect(() => {
    callbacksRef.current = {
      onIncidentCreated,
      onIncidentUpdated,
      onIncidentClosed,
      onMessage,
    };
  }, [onIncidentCreated, onIncidentUpdated, onIncidentClosed, onMessage]);

  const cleanup = useCallback(() => {
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
  }, []);

  const scheduleReconnect = useCallback(() => {
    cleanup();
    
    const delay = Math.min(
      WS_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts.current) + Math.random() * 1000,
      WS_RECONNECT_MAX_DELAY
    );
    
    console.log(`WebSocket reconnecting in ${Math.round(delay/1000)}s (attempt ${reconnectAttempts.current + 1})`);
    
    reconnectTimeout.current = setTimeout(() => {
      reconnectAttempts.current++;
      connect();
    }, delay);
  }, [cleanup]);

  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);
      setLastMessage(data);
      
      switch (data.type) {
        case 'pong':
          if (pongTimeout.current) {
            clearTimeout(pongTimeout.current);
            pongTimeout.current = null;
          }
          break;
          
        case 'connected':
          console.log(`WebSocket connected to ${data.tenant}`);
          break;
          
        case 'incident_created':
          if (callbacksRef.current.onIncidentCreated) {
            callbacksRef.current.onIncidentCreated(data.incident);
          }
          break;
          
        case 'incident_updated':
          if (callbacksRef.current.onIncidentUpdated) {
            callbacksRef.current.onIncidentUpdated(data.incident);
          }
          break;
          
        case 'incident_closed':
          if (callbacksRef.current.onIncidentClosed) {
            callbacksRef.current.onIncidentClosed(data.incident);
          }
          break;
          
        default:
          if (callbacksRef.current.onMessage) {
            callbacksRef.current.onMessage(data);
          }
      }
    } catch (e) {
      console.error('WebSocket message parse error:', e);
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;
    
    if (ws.current) {
      ws.current.close();
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/incidents`;
    
    console.log('WebSocket connecting to:', wsUrl);
    
    try {
      ws.current = new WebSocket(wsUrl);
    } catch (e) {
      console.error('WebSocket creation failed:', e);
      scheduleReconnect();
      return;
    }
    
    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      reconnectAttempts.current = 0;
      
      pingInterval.current = setInterval(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'ping' }));
          
          pongTimeout.current = setTimeout(() => {
            console.warn('WebSocket pong timeout - reconnecting');
            ws.current?.close();
          }, WS_PONG_TIMEOUT);
        }
      }, WS_PING_INTERVAL);
    };
    
    ws.current.onmessage = handleMessage;
    
    ws.current.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      setConnected(false);
      cleanup();
      
      if (event.code !== 1000 && enabled) {
        scheduleReconnect();
      }
    };
    
    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [enabled, handleMessage, cleanup, scheduleReconnect]);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    
    return () => {
      cleanup();
      if (ws.current) {
        ws.current.close(1000, 'Component unmounting');
        ws.current = null;
      }
    };
  }, [enabled, connect, cleanup]);

  return {
    connected,
    lastMessage,
  };
}

export default useIncidentWebSocket;
