"""
Devices Router - Connected device management for AV alerts.

Provides endpoints to view and manage devices connected via /ws/AValerts:
- GET  /api/av-alerts/devices                          - List all connected devices
- POST /api/av-alerts/devices/{connection_id}/test      - Send test tone to one device
- POST /api/av-alerts/devices/{connection_id}/identify  - Flash LEDs / play ID tone
- POST /api/av-alerts/devices/{connection_id}/disconnect - Force-disconnect a device
"""

from fastapi import APIRouter, Request, HTTPException
import logging

from database import _extract_slug, _is_internal_ip

logger = logging.getLogger(__name__)

router = APIRouter()


def _extract_tenant(request: Request) -> str:
    """Extract tenant slug from request (consistent with other routers)."""
    x_tenant = request.headers.get('x-tenant')
    client_ip = request.client.host if request.client else None
    
    if x_tenant and _is_internal_ip(client_ip):
        return x_tenant
    
    return _extract_slug(request.headers.get('host', ''))


@router.get("/devices")
async def list_connected_devices(request: Request):
    """
    List all devices currently connected to /ws/AValerts for this tenant.
    
    Returns device info including connection_id, device_type, name, IP, 
    user_agent, and connected_at timestamp. Devices that haven't sent a
    register message show as type "unknown" with name "Unknown".
    """
    tenant_slug = _extract_tenant(request)
    
    from routers.websocket import get_connected_av_devices
    
    devices = get_connected_av_devices(tenant_slug)
    
    return {
        "tenant": tenant_slug,
        "count": len(devices),
        "devices": devices,
    }


@router.post("/devices/{connection_id}/test")
async def test_device(connection_id: str, request: Request):
    """
    Send a test alert to a specific device.
    
    Sends a dispatch-type alert so the device plays its alert tone.
    Useful for verifying a single device is working without alerting all devices.
    """
    tenant_slug = _extract_tenant(request)
    
    from routers.websocket import send_to_device
    
    success = await send_to_device(tenant_slug, connection_id, {
        "event_type": "dispatch",
        "call_category": "FIRE",
        "test": True,
        "cad_event_type": "TEST ALERT",
        "tts_text": "This is a test alert.",
    })
    
    if not success:
        raise HTTPException(status_code=404, detail="Device not found or disconnected")
    
    return {"status": "sent", "connection_id": connection_id}


@router.post("/devices/{connection_id}/identify")
async def identify_device(connection_id: str, request: Request):
    """
    Send an identify command to a specific device.
    
    For StationBell: flashes LEDs in a distinct pattern.
    For browsers: shows a visual indicator / plays a short beep.
    Useful for finding which physical device corresponds to which connection.
    """
    tenant_slug = _extract_tenant(request)
    
    from routers.websocket import send_to_device
    
    success = await send_to_device(tenant_slug, connection_id, {
        "type": "identify",
    })
    
    if not success:
        raise HTTPException(status_code=404, detail="Device not found or disconnected")
    
    return {"status": "sent", "connection_id": connection_id}


@router.post("/devices/{connection_id}/disconnect")
async def disconnect_device_endpoint(connection_id: str, request: Request):
    """
    Force-disconnect a specific device.
    
    Closes the WebSocket connection. The device will likely attempt to reconnect
    automatically. Useful for clearing stale connections or troubleshooting.
    """
    tenant_slug = _extract_tenant(request)
    
    from routers.websocket import disconnect_device
    
    success = await disconnect_device(tenant_slug, connection_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Device not found")
    
    return {"status": "disconnected", "connection_id": connection_id}
