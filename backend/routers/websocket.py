"""
WebSocket endpoints for real-time updates.

Provides tenant-isolated WebSocket connections:

/ws/incidents - Incident list and modal updates
    - incident_created: New incident created
    - incident_updated: Incident data changed  
    - incident_closed: Incident status changed to CLOSED

/ws/AValerts - Audio/Visual alerts for browser and device notifications
    - dispatch: New dispatch (play alert sound, TTS)
    - close: Incident closed (play close sound)
    - announcement: Custom TTS message

Each tenant's connections are isolated - glenmoorefc browsers
only receive glenmoorefc events.

AV alert connections are tracked as ConnectedDevice instances,
enabling device identification, targeted sends, and management.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set, Optional, List
from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import logging
import asyncio
import uuid
import os

from jwt_auth import extract_token_from_websocket_params, validate_access_token

# PostgreSQL connection info for direct LISTEN connection (bypasses PgBouncer)
_PG_HOST = os.environ.get("PGHOST", "127.0.0.1")
_PG_PORT = int(os.environ.get("PGPORT", "5432"))  # Direct to PostgreSQL, NOT PgBouncer 6432
_PG_USER = os.environ.get("PGUSER", "runsheet")
_PG_PASSWORD = os.environ.get("PGPASSWORD", "runsheet")
_PG_DATABASE = os.environ.get("PGDATABASE", "cadreport_master")
_NOTIFY_CHANNEL = "cadreport_alerts"

logger = logging.getLogger(__name__)

router = APIRouter()

# Tenant-isolated connection pools for /ws/incidents
# Key: tenant_slug, Value: set of WebSocket connections
_connections: Dict[str, Set[WebSocket]] = {}

# =============================================================================
# AV Alerts device registry
# =============================================================================

@dataclass
class ConnectedDevice:
    """Tracked AV alerts connection with device metadata."""
    ws: WebSocket
    connection_id: str
    tenant_slug: str
    device_type: str = "unknown"          # browser, stationbell_mini, stationbell_bay, unknown
    device_name: str = "Unknown"           # Friendly name set via register message
    device_id: Optional[str] = None        # Persistent ID (MAC for StationBell, None for browsers)
    user_agent: str = ""
    ip_address: str = ""
    connected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# Tenant-isolated device registry for /ws/AValerts
# Key: tenant_slug, Value: { connection_id: ConnectedDevice }
_av_devices: Dict[str, Dict[str, ConnectedDevice]] = {}

# Locks for thread-safe connection management
_connections_lock = asyncio.Lock()
_av_connections_lock = asyncio.Lock()

# Server-side ping interval (seconds) - keep under Cloudflare's 100s timeout
SERVER_PING_INTERVAL = 30


def _extract_tenant_from_host(host: str) -> Optional[str]:
    """Extract tenant slug from Host header. Returns None if not determinable."""
    if not host:
        return None
    
    host = host.split(':')[0]  # Remove port
    
    if host.endswith('.cadreport.com'):
        slug = host.replace('.cadreport.com', '')
        if slug and slug != 'www':
            return slug
    
    if host.endswith('.cadreports.com'):
        slug = host.replace('.cadreports.com', '')
        if slug and slug != 'www':
            return slug
    
    return None


# =============================================================================
# /ws/incidents connection management (unchanged)
# =============================================================================

async def _add_connection(tenant_slug: str, websocket: WebSocket):
    """Add a WebSocket connection to the tenant's pool"""
    async with _connections_lock:
        if tenant_slug not in _connections:
            _connections[tenant_slug] = set()
        _connections[tenant_slug].add(websocket)
        logger.info(f"WebSocket /ws/incidents connected: {tenant_slug} (total: {len(_connections[tenant_slug])})")


async def _remove_connection(tenant_slug: str, websocket: WebSocket):
    """Remove a WebSocket connection from the tenant's pool"""
    async with _connections_lock:
        if tenant_slug in _connections:
            _connections[tenant_slug].discard(websocket)
            logger.info(f"WebSocket /ws/incidents disconnected: {tenant_slug} (total: {len(_connections[tenant_slug])})")
            # Clean up empty sets
            if not _connections[tenant_slug]:
                del _connections[tenant_slug]


async def broadcast_to_tenant(tenant_slug: str, message: dict):
    """
    Broadcast a message to all /ws/incidents connections for a specific tenant.
    
    Args:
        tenant_slug: The tenant to broadcast to (e.g., 'glenmoorefc')
        message: Dict with 'type' and payload (will be JSON serialized)
    
    Message types:
        - incident_created: New incident created
        - incident_updated: Incident data changed
        - incident_closed: Incident status changed to CLOSED
    """
    async with _connections_lock:
        if tenant_slug not in _connections:
            return
        
        connections = _connections[tenant_slug].copy()
    
    if not connections:
        return
    
    # Serialize once
    message_json = json.dumps(message)
    
    # Track failed connections for removal
    failed = []
    
    for websocket in connections:
        try:
            await websocket.send_text(message_json)
        except Exception as e:
            logger.warning(f"Failed to send to /ws/incidents WebSocket: {e}")
            failed.append(websocket)
    
    # Remove failed connections
    if failed:
        async with _connections_lock:
            if tenant_slug in _connections:
                for ws in failed:
                    _connections[tenant_slug].discard(ws)


# =============================================================================
# /ws/AValerts device registry management
# =============================================================================

async def _add_av_connection(tenant_slug: str, websocket: WebSocket) -> str:
    """Add a WebSocket connection to the AV alerts device registry. Returns connection_id."""
    connection_id = uuid.uuid4().hex[:8]

    device = ConnectedDevice(
        ws=websocket,
        connection_id=connection_id,
        tenant_slug=tenant_slug,
        user_agent=websocket.headers.get('user-agent', ''),
        ip_address=websocket.client.host if websocket.client else '',
    )

    async with _av_connections_lock:
        if tenant_slug not in _av_devices:
            _av_devices[tenant_slug] = {}
        _av_devices[tenant_slug][connection_id] = device
        count = len(_av_devices[tenant_slug])

    logger.info(f"WebSocket /ws/AValerts connected: {tenant_slug} [{connection_id}] from {device.ip_address} (total: {count})")
    return connection_id


async def _remove_av_connection(tenant_slug: str, connection_id: str):
    """Remove a device from the AV alerts registry by connection_id."""
    async with _av_connections_lock:
        if tenant_slug in _av_devices:
            removed = _av_devices[tenant_slug].pop(connection_id, None)
            count = len(_av_devices[tenant_slug])
            if removed:
                logger.info(f"WebSocket /ws/AValerts disconnected: {tenant_slug} [{connection_id}] {removed.device_name} (total: {count})")
            if not _av_devices[tenant_slug]:
                del _av_devices[tenant_slug]


async def broadcast_av_alert(tenant_slug: str, alert_data: dict):
    """
    Broadcast an AV alert to all /ws/AValerts connections for a specific tenant.
    
    Args:
        tenant_slug: The tenant to broadcast to (e.g., 'glenmoorefc')
        alert_data: Dict with alert info:
            - event_type: "dispatch" or "close"
            - call_category: "FIRE" or "EMS"
            - cad_event_type: e.g., "DWELLING FIRE"
            - cad_event_subtype: e.g., "W/ENTRAPMENT"
            - units_due: ["ENG481", "TWR48", ...]
            - incident_id: int
            - address: str (optional, for TTS)
    """
    async with _av_connections_lock:
        if tenant_slug not in _av_devices:
            return
        
        devices = list(_av_devices[tenant_slug].values())
    
    if not devices:
        return
    
    # Serialize once
    message_json = json.dumps(alert_data)
    
    # Track failed connections for removal
    failed = []
    
    for device in devices:
        try:
            await device.ws.send_text(message_json)
        except Exception as e:
            logger.warning(f"Failed to send to /ws/AValerts [{device.connection_id}] {device.device_name}: {e}")
            failed.append(device.connection_id)
    
    # Remove failed connections
    if failed:
        async with _av_connections_lock:
            if tenant_slug in _av_devices:
                for conn_id in failed:
                    _av_devices[tenant_slug].pop(conn_id, None)


# =============================================================================
# Connection counts and device listing
# =============================================================================

def get_connection_count(tenant_slug: str = None) -> dict:
    """Get connection counts for monitoring"""
    if tenant_slug:
        return {
            "tenant": tenant_slug,
            "incidents_connections": len(_connections.get(tenant_slug, set())),
            "av_alerts_connections": len(_av_devices.get(tenant_slug, {})),
        }
    return {
        "total_tenants": len(set(list(_connections.keys()) + list(_av_devices.keys()))),
        "incidents_by_tenant": {k: len(v) for k, v in _connections.items()},
        "av_alerts_by_tenant": {k: len(v) for k, v in _av_devices.items()},
    }


def get_connected_av_devices(tenant_slug: str) -> List[dict]:
    """Get list of connected AV alert devices for a tenant.
    
    Returns serializable device info for the admin UI.
    Called by devices router (Phase 3+).
    """
    devices = _av_devices.get(tenant_slug, {})
    return [
        {
            "connection_id": d.connection_id,
            "device_type": d.device_type,
            "device_name": d.device_name,
            "device_id": d.device_id,
            "ip_address": d.ip_address,
            "user_agent": d.user_agent,
            "connected_at": d.connected_at.isoformat(),
        }
        for d in devices.values()
    ]


# =============================================================================
# Targeted device commands
# =============================================================================

async def send_to_device(tenant_slug: str, connection_id: str, message: dict) -> bool:
    """Send a message to a specific connected device.
    
    Returns True if sent successfully, False if device not found or send failed.
    Used by device command endpoints (test, identify, disconnect).
    """
    async with _av_connections_lock:
        devices = _av_devices.get(tenant_slug, {})
        device = devices.get(connection_id)
        if not device:
            return False
        ws = device.ws
    
    try:
        await ws.send_json(message)
        return True
    except Exception as e:
        logger.warning(f"Failed to send to device [{connection_id}]: {e}")
        return False


async def disconnect_device(tenant_slug: str, connection_id: str) -> bool:
    """Force-disconnect a specific device by closing its WebSocket.
    
    Returns True if found and closed, False if not found.
    The normal cleanup in the finally block of the endpoint will
    handle removing it from the registry.
    """
    async with _av_connections_lock:
        devices = _av_devices.get(tenant_slug, {})
        device = devices.get(connection_id)
        if not device:
            return False
        ws = device.ws
    
    try:
        await ws.close(code=1000, reason="Disconnected by admin")
    except Exception:
        pass  # Already closed
    return True


# =============================================================================
# Shared ping/pong handlers
# =============================================================================

async def _server_ping_loop(websocket: WebSocket, stop_event: asyncio.Event):
    """Send periodic pings from server to keep connection alive through proxies"""
    try:
        while not stop_event.is_set():
            await asyncio.sleep(SERVER_PING_INTERVAL)
            if stop_event.is_set():
                break
            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                break
    except asyncio.CancelledError:
        pass


async def _receive_loop(
    websocket: WebSocket,
    stop_event: asyncio.Event,
    tenant_slug: str = None,
    connection_id: str = None,
):
    """Handle incoming messages from client.
    
    When tenant_slug and connection_id are provided (AV alerts path),
    also handles 'register' messages to identify the device.
    """
    try:
        while not stop_event.is_set():
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                msg_type = message.get("type")
                
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "pong":
                    # Client responded to our ping - connection is alive
                    pass
                elif msg_type == "register" and tenant_slug and connection_id:
                    await _handle_register(tenant_slug, connection_id, message)
                    
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON received: {e}")
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Receive loop error: {e}")
    finally:
        stop_event.set()


async def _handle_register(tenant_slug: str, connection_id: str, message: dict):
    """Update a ConnectedDevice with registration info from the client.
    
    Expected message format:
        { "type": "register", "device_type": "browser", "name": "Chrome - Windows" }
        { "type": "register", "device_type": "stationbell_bay", "device_id": "AA:BB:CC", "name": "Bay 1" }
    
    Devices that never send register still work - they just show as "Unknown".
    """
    async with _av_connections_lock:
        devices = _av_devices.get(tenant_slug, {})
        device = devices.get(connection_id)
        if not device:
            return
        
        device.device_type = message.get("device_type", "unknown")
        device.device_name = message.get("name", "Unknown")
        device.device_id = message.get("device_id")  # MAC for StationBell, None for browsers
    
    logger.info(
        f"WebSocket /ws/AValerts registered: {tenant_slug} [{connection_id}] "
        f"type={device.device_type} name={device.device_name}"
        f"{f' id={device.device_id}' if device.device_id else ''}"
    )


# =============================================================================
# LISTEN/NOTIFY — Cross-Worker Broadcasting (Phase D)
# =============================================================================

# Track the LISTEN subscriber task so lifespan can cancel it
_listen_task: Optional[asyncio.Task] = None
_listen_connection = None  # asyncpg connection for LISTEN


async def notify_tenant_event(tenant_slug: str, event_type: str, payload: dict):
    """
    Issue a PostgreSQL NOTIFY on the shared cadreport_alerts channel.
    
    All workers (including this one) will receive the notification via their
    LISTEN subscriber and broadcast to their local WebSocket connections.
    
    CRITICAL: Callers must NOT also call broadcast_to_tenant() or
    broadcast_av_alert() directly — the LISTEN handler does that.
    Double-calling would deliver the message twice to devices on this worker.
    
    Args:
        tenant_slug: Tenant to broadcast to
        event_type: 'incident' or 'av_alert'
        payload: The message dict to broadcast
    """
    import asyncpg
    
    notify_data = json.dumps({
        "tenant": tenant_slug,
        "event_type": event_type,
        "payload": payload,
    })
    
    # PostgreSQL NOTIFY payload limit is 8000 bytes
    if len(notify_data) > 7500:
        logger.warning(f"NOTIFY payload too large ({len(notify_data)} bytes), truncating")
        # For oversized payloads, strip large fields and send a refresh hint
        payload_slim = {"type": payload.get("type", event_type), "refresh": True}
        notify_data = json.dumps({
            "tenant": tenant_slug,
            "event_type": event_type,
            "payload": payload_slim,
        })
    
    try:
        conn = await asyncpg.connect(
            host=_PG_HOST, port=_PG_PORT,
            user=_PG_USER, password=_PG_PASSWORD,
            database=_PG_DATABASE,
        )
        try:
            await conn.execute(f"NOTIFY {_NOTIFY_CHANNEL}, $1", notify_data)
        finally:
            await conn.close()
    except Exception as e:
        logger.error(f"NOTIFY failed, falling back to direct broadcast: {e}")
        # Fallback: broadcast directly on this worker only (better than silence)
        await _dispatch_notification(tenant_slug, event_type, payload)


async def _dispatch_notification(tenant_slug: str, event_type: str, payload: dict):
    """
    Route a received notification to the appropriate local broadcast function.
    Called by the LISTEN handler on every worker that receives the notification.
    """
    try:
        if event_type == "incident":
            await broadcast_to_tenant(tenant_slug, payload)
        elif event_type == "av_alert":
            await broadcast_av_alert(tenant_slug, payload)
        else:
            logger.warning(f"Unknown NOTIFY event_type: {event_type}")
    except Exception as e:
        logger.error(f"Failed to dispatch notification for {tenant_slug}/{event_type}: {e}")


async def start_listen_subscriber():
    """
    Start the PostgreSQL LISTEN subscriber for this worker.
    Maintains a persistent direct asyncpg connection to PostgreSQL (port 5432,
    bypassing PgBouncer) and dispatches incoming notifications to local
    WebSocket broadcast functions.
    
    Called from main.py lifespan. Runs until cancelled.
    """
    import asyncpg
    global _listen_connection
    
    retry_delay = 1  # Start with 1s, exponential backoff to 30s
    
    while True:
        try:
            logger.info(f"LISTEN subscriber connecting to PostgreSQL {_PG_HOST}:{_PG_PORT}/{_PG_DATABASE}")
            _listen_connection = await asyncpg.connect(
                host=_PG_HOST, port=_PG_PORT,
                user=_PG_USER, password=_PG_PASSWORD,
                database=_PG_DATABASE,
            )
            retry_delay = 1  # Reset on successful connect
            
            # Subscribe to the shared channel
            await _listen_connection.add_listener(
                _NOTIFY_CHANNEL, _on_notification
            )
            logger.info(f"LISTEN subscriber active on channel '{_NOTIFY_CHANNEL}'")
            
            # Keep connection alive — asyncpg handles keepalives internally.
            # We just wait here until the connection drops or task is cancelled.
            while True:
                await asyncio.sleep(60)
                # Periodic health check — if connection is closed, break to reconnect
                if _listen_connection.is_closed():
                    logger.warning("LISTEN connection closed, reconnecting...")
                    break
                    
        except asyncio.CancelledError:
            logger.info("LISTEN subscriber shutting down")
            if _listen_connection and not _listen_connection.is_closed():
                await _listen_connection.close()
            _listen_connection = None
            return
        except Exception as e:
            logger.error(f"LISTEN subscriber error: {e}, reconnecting in {retry_delay}s")
            _listen_connection = None
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 30)


def _on_notification(connection, pid, channel, payload_str):
    """
    Callback for asyncpg LISTEN notifications.
    Called synchronously by asyncpg — schedules async dispatch on the event loop.
    """
    try:
        data = json.loads(payload_str)
        tenant_slug = data.get("tenant")
        event_type = data.get("event_type")
        payload = data.get("payload", {})
        
        if not tenant_slug or not event_type:
            logger.warning(f"Malformed NOTIFY payload: {payload_str[:200]}")
            return
        
        # Schedule async dispatch on the running event loop
        loop = asyncio.get_event_loop()
        loop.create_task(_dispatch_notification(tenant_slug, event_type, payload))
        
    except json.JSONDecodeError:
        logger.warning(f"Invalid JSON in NOTIFY payload: {payload_str[:200]}")
    except Exception as e:
        logger.error(f"Error handling NOTIFY: {e}")


async def stop_listen_subscriber():
    """Stop the LISTEN subscriber. Called from main.py lifespan shutdown."""
    global _listen_task, _listen_connection
    if _listen_task:
        _listen_task.cancel()
        try:
            await _listen_task
        except asyncio.CancelledError:
            pass
        _listen_task = None
    if _listen_connection and not _listen_connection.is_closed():
        await _listen_connection.close()
        _listen_connection = None


# =============================================================================
# WebSocket endpoints
# =============================================================================

@router.websocket("/ws/incidents")
async def websocket_incidents(websocket: WebSocket):
    """
    WebSocket endpoint for real-time incident updates.
    
    Phase C: JWT validated at handshake before accept(). User-level JWT required.
    Falls back to host-based identification during transition period.
    Server sends periodic pings to keep connection alive through Cloudflare/nginx.
    """
    # Authenticate via JWT (query param or cookie)
    token = extract_token_from_websocket_params(websocket)
    if token:
        claims = validate_access_token(token)
        if not claims:
            await websocket.close(code=4001, reason="Invalid or expired token")
            return
        tenant_slug = claims.tenant_slug
    else:
        # Transition fallback: identify tenant from Host header
        # TODO: Remove this fallback once all clients send JWT
        host = websocket.headers.get('host', '')
        tenant_slug = _extract_tenant_from_host(host)
        if not tenant_slug:
            await websocket.close(code=4002, reason="Cannot determine tenant")
            return
        logger.info(f"WebSocket /ws/incidents connected WITHOUT JWT (transition): {tenant_slug}")
    
    # Accept the connection
    await websocket.accept()
    
    # Add to tenant's connection pool
    await _add_connection(tenant_slug, websocket)
    
    # Send connection confirmation
    try:
        await websocket.send_json({
            "type": "connected",
            "tenant": tenant_slug,
            "message": f"Connected to {tenant_slug} incident stream"
        })
    except Exception as e:
        logger.error(f"Failed to send connection confirmation: {e}")
        await _remove_connection(tenant_slug, websocket)
        return
    
    # Use stop event to coordinate shutdown
    stop_event = asyncio.Event()
    
    # Start server-side ping loop and receive loop concurrently
    ping_task = asyncio.create_task(_server_ping_loop(websocket, stop_event))
    receive_task = asyncio.create_task(_receive_loop(websocket, stop_event))
    
    try:
        # Wait for either task to complete (indicates disconnect)
        done, pending = await asyncio.wait(
            [ping_task, receive_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel pending tasks
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
                
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        stop_event.set()
        ping_task.cancel()
        receive_task.cancel()
        await _remove_connection(tenant_slug, websocket)


@router.websocket("/ws/AValerts")
async def websocket_av_alerts(websocket: WebSocket):
    """
    WebSocket endpoint for Audio/Visual alerts.
    
    Phase C: JWT validated at handshake before accept(). Tenant-level JWT sufficient
    (StationBell devices don't have individual logins).
    Falls back to host-based identification during transition period.
    Tracked in the device registry for identification and management.
    """
    # Authenticate via JWT (query param or cookie)
    token = extract_token_from_websocket_params(websocket)
    if token:
        claims = validate_access_token(token)
        if not claims:
            await websocket.close(code=4001, reason="Invalid or expired token")
            return
        tenant_slug = claims.tenant_slug
    else:
        # Transition fallback: identify tenant from Host header
        # TODO: Remove this fallback once all clients send JWT
        host = websocket.headers.get('host', '')
        tenant_slug = _extract_tenant_from_host(host)
        if not tenant_slug:
            await websocket.close(code=4002, reason="Cannot determine tenant")
            return
        logger.info(f"WebSocket /ws/AValerts connected WITHOUT JWT (transition): {tenant_slug}")
    
    # Accept the connection
    await websocket.accept()
    
    # Add to AV alerts device registry
    connection_id = await _add_av_connection(tenant_slug, websocket)
    
    # Send connection confirmation (includes connection_id for device registration)
    try:
        await websocket.send_json({
            "type": "connected",
            "tenant": tenant_slug,
            "connection_id": connection_id,
            "message": f"Connected to {tenant_slug} AV alerts"
        })
    except Exception as e:
        logger.error(f"Failed to send AV alerts connection confirmation: {e}")
        await _remove_av_connection(tenant_slug, connection_id)
        return
    
    # Use stop event to coordinate shutdown
    stop_event = asyncio.Event()
    
    # Start server-side ping loop and receive loop concurrently
    # Pass tenant_slug + connection_id so register messages can be handled
    ping_task = asyncio.create_task(_server_ping_loop(websocket, stop_event))
    receive_task = asyncio.create_task(
        _receive_loop(websocket, stop_event, tenant_slug=tenant_slug, connection_id=connection_id)
    )
    
    try:
        # Wait for either task to complete (indicates disconnect)
        done, pending = await asyncio.wait(
            [ping_task, receive_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel pending tasks
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
                
    except Exception as e:
        logger.error(f"WebSocket AV alerts error: {e}")
    finally:
        stop_event.set()
        ping_task.cancel()
        receive_task.cancel()
        await _remove_av_connection(tenant_slug, connection_id)


@router.get("/ws/status")
async def websocket_status():
    """Get WebSocket connection status (for monitoring)"""
    return get_connection_count()
