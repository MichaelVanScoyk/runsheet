"""
Devices Router - Connected device management for AV alerts.

Provides endpoints to view and manage devices connected via /ws/AValerts:
- GET /api/av-alerts/devices - List all connected devices for the tenant

Future phases will add:
- Targeted test alerts to specific devices
- Device reboot, identify, disconnect commands
- Block/unblock persistent device bans
"""

from fastapi import APIRouter, Request
import logging

from database import _extract_slug, _is_internal_ip

logger = logging.getLogger(__name__)

router = APIRouter()


def _extract_tenant(request: Request) -> str:
    """Extract tenant slug from request (consistent with other routers)."""
    # Check X-Tenant header from internal requests first
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
    
    # Lazy import to avoid circular dependency
    from routers.websocket import get_connected_av_devices
    
    devices = get_connected_av_devices(tenant_slug)
    
    return {
        "tenant": tenant_slug,
        "count": len(devices),
        "devices": devices,
    }
