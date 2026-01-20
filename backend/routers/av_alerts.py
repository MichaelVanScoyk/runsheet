"""
AV Alerts - Audio/Visual alert broadcasting for browser notifications.

Broadcasts alerts to /ws/AValerts WebSocket endpoint when:
- New incident is created (dispatch alert)
- Incident is closed (close alert)

Frontend receives these alerts and plays sounds / TTS based on:
- event_type: "dispatch" or "close"
- call_category: "FIRE" or "EMS"
"""

import logging
from datetime import datetime, timezone
from typing import Optional, List

from database import _extract_slug, _is_internal_ip

logger = logging.getLogger(__name__)

# Lazy import to avoid circular imports
_ws_av_broadcast = None


def _get_av_broadcast():
    """Lazy import of AV alert broadcast function"""
    global _ws_av_broadcast
    if _ws_av_broadcast is None:
        try:
            from routers.websocket import broadcast_av_alert
            _ws_av_broadcast = broadcast_av_alert
        except ImportError:
            _ws_av_broadcast = False  # Mark as unavailable
    return _ws_av_broadcast if _ws_av_broadcast else None


def _extract_tenant_from_request(request) -> str:
    """Extract tenant slug from request (same logic as database routing)"""
    x_tenant = request.headers.get('x-tenant')
    client_ip = request.client.host if request.client else None
    
    if x_tenant and _is_internal_ip(client_ip):
        return x_tenant
    
    return _extract_slug(request.headers.get('host', ''))


async def emit_av_alert(
    request,
    event_type: str,
    incident_id: int,
    call_category: str,
    cad_event_type: Optional[str] = None,
    cad_event_subtype: Optional[str] = None,
    address: Optional[str] = None,
    units_due: Optional[List[str]] = None,
):
    """
    Emit AV alert to /ws/AValerts WebSocket connections.
    
    Called from incident create (dispatch) and close endpoints.
    Frontend plays sounds and optionally reads TTS based on this data.
    
    Args:
        request: FastAPI request (to extract tenant)
        event_type: "dispatch" or "close"
        incident_id: ID of the incident
        call_category: "FIRE" or "EMS"
        cad_event_type: e.g., "DWELLING FIRE", "MEDICAL EMERGENCY"
        cad_event_subtype: e.g., "W/ENTRAPMENT", "CARDIAC"
        address: Incident address (for TTS)
        units_due: List of unit designators ["ENG481", "TWR48", ...]
    """
    broadcast = _get_av_broadcast()
    if not broadcast:
        return
    
    tenant_slug = _extract_tenant_from_request(request)
    
    alert_data = {
        "event_type": event_type,
        "incident_id": incident_id,
        "call_category": call_category,
        "cad_event_type": cad_event_type,
        "cad_event_subtype": cad_event_subtype,
        "address": address,
        "units_due": units_due or [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    
    try:
        await broadcast(tenant_slug, alert_data)
        logger.debug(f"AV alert broadcast: {event_type} for incident {incident_id} to {tenant_slug}")
    except Exception as e:
        logger.warning(f"AV alert broadcast failed: {e}")
