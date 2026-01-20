"""
WebSocket endpoints for real-time updates.

Provides tenant-isolated WebSocket connections:

/ws/incidents - Incident list and modal updates
    - incident_created: New incident created
    - incident_updated: Incident data changed  
    - incident_closed: Incident status changed to CLOSED

/ws/AValerts - Audio/Visual alerts for browser notifications
    - dispatch: New dispatch (play alert sound, TTS)
    - close: Incident closed (play close sound)

Each tenant's connections are isolated - glenmoorefc browsers
only receive glenmoorefc events.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
import logging
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter()

# Tenant-isolated connection pools for /ws/incidents
# Key: tenant_slug, Value: set of WebSocket connections
_connections: Dict[str, Set[WebSocket]] = {}

# Tenant-isolated connection pools for /ws/AValerts
_av_connections: Dict[str, Set[WebSocket]] = {}

# Locks for thread-safe connection management
_connections_lock = asyncio.Lock()
_av_connections_lock = asyncio.Lock()

# Server-side ping interval (seconds) - keep under Cloudflare's 100s timeout
SERVER_PING_INTERVAL = 30


def _extract_tenant_from_host(host: str) -> str:
    """Extract tenant slug from Host header (same logic as database.py)"""
    if not host:
        return "glenmoorefc"
    
    host = host.split(':')[0]  # Remove port
    
    if host.endswith('.cadreport.com'):
        slug = host.replace('.cadreport.com', '')
        if slug and slug != 'www':
            return slug
    
    if host.endswith('.cadreports.com'):
        slug = host.replace('.cadreports.com', '')
        if slug and slug != 'www':
            return slug
    
    return "glenmoorefc"  # Default


# =============================================================================
# /ws/incidents connection management
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
# /ws/AValerts connection management
# =============================================================================

async def _add_av_connection(tenant_slug: str, websocket: WebSocket):
    """Add a WebSocket connection to the AV alerts pool"""
    async with _av_connections_lock:
        if tenant_slug not in _av_connections:
            _av_connections[tenant_slug] = set()
        _av_connections[tenant_slug].add(websocket)
        logger.info(f"WebSocket /ws/AValerts connected: {tenant_slug} (total: {len(_av_connections[tenant_slug])})")


async def _remove_av_connection(tenant_slug: str, websocket: WebSocket):
    """Remove a WebSocket connection from the AV alerts pool"""
    async with _av_connections_lock:
        if tenant_slug in _av_connections:
            _av_connections[tenant_slug].discard(websocket)
            logger.info(f"WebSocket /ws/AValerts disconnected: {tenant_slug} (total: {len(_av_connections[tenant_slug])})")
            if not _av_connections[tenant_slug]:
                del _av_connections[tenant_slug]


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
        if tenant_slug not in _av_connections:
            return
        
        connections = _av_connections[tenant_slug].copy()
    
    if not connections:
        return
    
    # Serialize once
    message_json = json.dumps(alert_data)
    
    # Track failed connections for removal
    failed = []
    
    for websocket in connections:
        try:
            await websocket.send_text(message_json)
        except Exception as e:
            logger.warning(f"Failed to send to /ws/AValerts WebSocket: {e}")
            failed.append(websocket)
    
    # Remove failed connections
    if failed:
        async with _av_connections_lock:
            if tenant_slug in _av_connections:
                for ws in failed:
                    _av_connections[tenant_slug].discard(ws)


# =============================================================================
# Connection counts for monitoring
# =============================================================================

def get_connection_count(tenant_slug: str = None) -> dict:
    """Get connection counts for monitoring"""
    if tenant_slug:
        return {
            "tenant": tenant_slug,
            "incidents_connections": len(_connections.get(tenant_slug, set())),
            "av_alerts_connections": len(_av_connections.get(tenant_slug, set())),
        }
    return {
        "total_tenants": len(set(list(_connections.keys()) + list(_av_connections.keys()))),
        "incidents_by_tenant": {k: len(v) for k, v in _connections.items()},
        "av_alerts_by_tenant": {k: len(v) for k, v in _av_connections.items()},
    }


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


async def _receive_loop(websocket: WebSocket, stop_event: asyncio.Event):
    """Handle incoming messages from client"""
    try:
        while not stop_event.is_set():
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif message.get("type") == "pong":
                    # Client responded to our ping - connection is alive
                    pass
                    
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON received: {e}")
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Receive loop error: {e}")
    finally:
        stop_event.set()


# =============================================================================
# WebSocket endpoints
# =============================================================================

@router.websocket("/ws/incidents")
async def websocket_incidents(websocket: WebSocket):
    """
    WebSocket endpoint for real-time incident updates.
    
    Connection is automatically associated with tenant based on Host header.
    Server sends periodic pings to keep connection alive through Cloudflare/nginx.
    """
    # Extract tenant from Host header
    host = websocket.headers.get('host', '')
    tenant_slug = _extract_tenant_from_host(host)
    
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
    
    Sends dispatch and close alerts for browser sound/TTS notifications.
    Connection is automatically associated with tenant based on Host header.
    """
    # Extract tenant from Host header
    host = websocket.headers.get('host', '')
    tenant_slug = _extract_tenant_from_host(host)
    
    # Accept the connection
    await websocket.accept()
    
    # Add to AV alerts connection pool
    await _add_av_connection(tenant_slug, websocket)
    
    # Send connection confirmation
    try:
        await websocket.send_json({
            "type": "connected",
            "tenant": tenant_slug,
            "message": f"Connected to {tenant_slug} AV alerts"
        })
    except Exception as e:
        logger.error(f"Failed to send AV alerts connection confirmation: {e}")
        await _remove_av_connection(tenant_slug, websocket)
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
        logger.error(f"WebSocket AV alerts error: {e}")
    finally:
        stop_event.set()
        ping_task.cancel()
        receive_task.cancel()
        await _remove_av_connection(tenant_slug, websocket)


@router.get("/ws/status")
async def websocket_status():
    """Get WebSocket connection status (for monitoring)"""
    return get_connection_count()
