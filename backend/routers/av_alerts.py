"""
AV Alerts - Audio/Visual alert broadcasting for browser and device notifications.

Broadcasts alerts to /ws/AValerts WebSocket endpoint when:
- New incident is created (dispatch alert)
- Incident is closed (close alert)

For dispatch alerts, also generates TTS audio announcement.

Frontend/devices receive these alerts and play sounds / TTS based on:
- event_type: "dispatch" or "close"
- call_category: "FIRE" or "EMS"
- audio_url: URL to TTS MP3 (dispatch only)
"""

import logging
from datetime import datetime, timezone
from typing import Optional, List

from database import _extract_slug, _is_internal_ip

logger = logging.getLogger(__name__)

# Lazy imports to avoid circular imports
_ws_av_broadcast = None
_tts_service = None


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


def _get_tts_service():
    """Lazy import of TTS service"""
    global _tts_service
    if _tts_service is None:
        try:
            from services.tts_service import tts_service
            _tts_service = tts_service
        except ImportError as e:
            logger.warning(f"TTS service not available: {e}")
            _tts_service = False  # Mark as unavailable
    return _tts_service if _tts_service else None


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
    
    For dispatch alerts, generates TTS audio and includes audio_url.
    
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
    
    # Generate TTS audio for dispatch alerts
    audio_url = None
    if event_type == "dispatch":
        tts = _get_tts_service()
        if tts:
            try:
                audio_url = await tts.generate_alert_audio(
                    tenant=tenant_slug,
                    incident_id=incident_id,
                    units=units_due or [],
                    call_type=cad_event_type or "Emergency",
                    address=address or "",
                    subtype=cad_event_subtype
                )
                if audio_url:
                    logger.info(f"TTS audio generated: {audio_url}")
            except Exception as e:
                logger.warning(f"TTS generation failed: {e}")
    
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
    
    # Include audio URL if generated
    if audio_url:
        alert_data["audio_url"] = audio_url
    
    try:
        await broadcast(tenant_slug, alert_data)
        logger.debug(f"AV alert broadcast: {event_type} for incident {incident_id} to {tenant_slug}")
    except Exception as e:
        logger.warning(f"AV alert broadcast failed: {e}")
