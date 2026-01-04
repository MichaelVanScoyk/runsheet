/**
 * useIncidentWebSocket - Real-time incident updates via WebSocket
 * 
 * Provides:
 * - Automatic connection to /ws/incidents
 * - Reconnection with exponential backoff
 * - Ping/pong keepalive
 */

import { useEffect, useRef, useState } from 'react';

const WS_RECONNECT_BASE_DELAY = 1000;
const WS_RECONNECT_MAX_DELAY = 30000;
const WS_PING_INTERVAL = 25000;
const WS_PONG_TIMEOUT = 10000;

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
  const enabledRef = useRef(enabled);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  
  // Store callbacks in ref to avoid re-renders triggering reconnects
  const callbacksRef = useRef({
    onIncidentCreated,
    onIncidentUpdated,
    onIncidentClosed,
    onMessage,
  });
  
  // Update refs when props change
  useEffect(() => {
    callbacksRef.current = {
      onIncidentCreated,
      onIncidentUpdated,
      onIncidentClosed,
      onMessage,
    };
  }, [onIncidentCreated, onIncidentUpdated, onIncidentClosed, onMessage]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;

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
    };

    const scheduleReconnect = () => {
      if (!isMounted || !enabledRef.current) return;
      
      cleanup();
      
      const delay = Math.min(
        WS_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts.current) + Math.random() * 1000,
        WS_RECONNECT_MAX_DELAY
      );
      
      console.log(`WebSocket reconnecting in ${Math.round(delay/1000)}s (attempt ${reconnectAttempts.current + 1})`);
      
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
        setLastMessage(data);
        
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
            console.log(`WebSocket connected to ${data.tenant}`);
            break;
            
          case 'incident_created':
            callbacksRef.current.onIncidentCreated?.(data.incident);
            break;
            
          case 'incident_updated':
            callbacksRef.current.onIncidentUpdated?.(data.incident);
            break;
            
          case 'incident_closed':
            callbacksRef.current.onIncidentClosed?.(data.incident);
            break;
            
          default:
            callbacksRef.current.onMessage?.(data);
        }
      } catch (e) {
        console.error('WebSocket message parse error:', e);
      }
    };

    const connect = () => {
      if (!isMounted || !enabledRef.current) return;
      
      // Close existing connection if any
      if (ws.current) {
        ws.current.onclose = null; // Prevent triggering reconnect
        ws.current.close();
        ws.current = null;
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
        if (!isMounted) return;
        console.log('WebSocket connected');
        setConnected(true);
        reconnectAttempts.current = 0;
        
        // Start ping interval
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
        if (!isMounted) return;
        console.log('WebSocket disconnected:', event.code, event.reason);
        setConnected(false);
        cleanup();
        
        // Reconnect unless it was a clean close
        if (event.code !== 1000 && enabledRef.current) {
          scheduleReconnect();
        }
      };
      
      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    // Initial connection
    connect();

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
  }, [enabled]); // Only re-run if enabled changes

  return {
    connected,
    lastMessage,
  };
}

export default useIncidentWebSocket;
