"""
WebSocket endpoint for real-time incident updates.

Provides tenant-isolated WebSocket connections for:
- New incident notifications (CAD dispatch)
- Incident updates (CAD clear, user edits)
- Status changes

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

# Tenant-isolated connection pools
# Key: tenant_slug, Value: set of WebSocket connections
_connections: Dict[str, Set[WebSocket]] = {}

# Lock for thread-safe connection management
_connections_lock = asyncio.Lock()


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


async def _add_connection(tenant_slug: str, websocket: WebSocket):
    """Add a WebSocket connection to the tenant's pool"""
    async with _connections_lock:
        if tenant_slug not in _connections:
            _connections[tenant_slug] = set()
        _connections[tenant_slug].add(websocket)
        logger.info(f"WebSocket connected: {tenant_slug} (total: {len(_connections[tenant_slug])})")


async def _remove_connection(tenant_slug: str, websocket: WebSocket):
    """Remove a WebSocket connection from the tenant's pool"""
    async with _connections_lock:
        if tenant_slug in _connections:
            _connections[tenant_slug].discard(websocket)
            logger.info(f"WebSocket disconnected: {tenant_slug} (total: {len(_connections[tenant_slug])})")
            # Clean up empty sets
            if not _connections[tenant_slug]:
                del _connections[tenant_slug]


async def broadcast_to_tenant(tenant_slug: str, message: dict):
    """
    Broadcast a message to all WebSocket connections for a specific tenant.
    
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
            logger.warning(f"Failed to send to WebSocket: {e}")
            failed.append(websocket)
    
    # Remove failed connections
    if failed:
        async with _connections_lock:
            if tenant_slug in _connections:
                for ws in failed:
                    _connections[tenant_slug].discard(ws)


def get_connection_count(tenant_slug: str = None) -> dict:
    """Get connection counts for monitoring"""
    if tenant_slug:
        return {
            "tenant": tenant_slug,
            "connections": len(_connections.get(tenant_slug, set()))
        }
    return {
        "total_tenants": len(_connections),
        "by_tenant": {k: len(v) for k, v in _connections.items()}
    }


@router.websocket("/ws/incidents")
async def websocket_incidents(websocket: WebSocket):
    """
    WebSocket endpoint for real-time incident updates.
    
    Connection is automatically associated with tenant based on Host header.
    
    Client -> Server messages:
        - {"type": "ping"} - Keepalive, server responds with {"type": "pong"}
    
    Server -> Client messages:
        - {"type": "incident_created", "incident": {...}, "timestamp": "..."}
        - {"type": "incident_updated", "incident": {...}, "timestamp": "..."}
        - {"type": "incident_closed", "incident": {...}, "timestamp": "..."}
        - {"type": "pong"} - Response to ping
        - {"type": "connected", "tenant": "...", "message": "..."} - Connection confirmed
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
    
    try:
        while True:
            # Wait for client messages (ping/pong keepalive)
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                    
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON received from WebSocket: {data[:100]}")
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected: {tenant_slug}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await _remove_connection(tenant_slug, websocket)


@router.get("/ws/status")
async def websocket_status():
    """Get WebSocket connection status (for monitoring)"""
    return get_connection_count()
