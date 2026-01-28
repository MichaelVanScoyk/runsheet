"""
AV Alerts - Audio/Visual alert broadcasting for browser and device notifications.

Broadcasts alerts to /ws/AValerts WebSocket endpoint when:
- New incident is created (dispatch alert)
- Incident is closed (close alert)

For dispatch alerts, generates TTS audio and formatted text.

All clients (web UI and StationBell) receive:
- event_type: "dispatch" or "close"
- call_category: "FIRE" or "EMS"
- audio_url: URL to server-generated TTS MP3 (dispatch only)
- tts_text: Formatted announcement text (for browser TTS fallback)

The tts_text is formatted server-side based on admin settings,
ensuring consistent announcements across all devices.
"""

import logging
from datetime import datetime, timezone
from typing import Optional, List

from database import _extract_slug, _is_internal_ip, get_db_for_tenant

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


def _get_av_settings(db) -> dict:
    """Get AV alert settings from database"""
    from sqlalchemy import text
    
    defaults = {
        'enabled': True,
        'tts_enabled': True,
    }
    
    if not db:
        return defaults
    
    try:
        result = db.execute(text(
            "SELECT key, value, value_type FROM settings WHERE category = 'av_alerts' AND key IN ('enabled', 'tts_enabled')"
        ))
        
        for row in result:
            key, value, value_type = row[0], row[1], row[2]
            if key in defaults:
                if value_type == 'boolean':
                    defaults[key] = value.lower() in ('true', '1', 'yes')
                else:
                    defaults[key] = value
    except Exception as e:
        logger.warning(f"Failed to load AV settings: {e}")
    
    return defaults


async def emit_av_alert(
    request,
    event_type: str,
    incident_id: int,
    call_category: str,
    cad_event_type: Optional[str] = None,
    cad_event_subtype: Optional[str] = None,
    address: Optional[str] = None,
    units_due: Optional[List[str]] = None,
    cross_streets: Optional[str] = None,
    box: Optional[str] = None,
):
    """
    Emit AV alert to /ws/AValerts WebSocket connections.
    
    Called from incident create (dispatch) and close endpoints.
    
    For dispatch alerts:
    - Checks if alerts are enabled in admin settings
    - Generates TTS audio using admin-configured field toggles
    - Formats tts_text for browser TTS fallback
    - Broadcasts to all connected clients (web UI + StationBell)
    
    Args:
        request: FastAPI request (to extract tenant)
        event_type: "dispatch" or "close"
        incident_id: ID of the incident
        call_category: "FIRE" or "EMS"
        cad_event_type: e.g., "DWELLING FIRE", "MEDICAL EMERGENCY"
        cad_event_subtype: e.g., "W/ENTRAPMENT", "CARDIAC"
        address: Incident address
        units_due: List of unit designators ["ENG481", "TWR48", ...]
        cross_streets: Cross streets (optional)
        box: Box/ESZ number (optional)
    """
    broadcast = _get_av_broadcast()
    if not broadcast:
        return
    
    tenant_slug = _extract_tenant_from_request(request)
    
    # Get database session for settings lookup
    db = None
    try:
        db = next(get_db_for_tenant(tenant_slug))
    except Exception as e:
        logger.warning(f"Could not get DB for tenant {tenant_slug}: {e}")
    
    # Check if alerts are enabled
    settings = _get_av_settings(db)
    if not settings.get('enabled', True):
        logger.debug(f"AV alerts disabled for {tenant_slug}, skipping")
        if db:
            db.close()
        return
    
    # Generate TTS audio and text for dispatch alerts
    audio_url = None
    tts_text = None
    
    if event_type == "dispatch" and settings.get('tts_enabled', True):
        tts = _get_tts_service()
        if tts:
            try:
                result = await tts.generate_alert_audio(
                    tenant=tenant_slug,
                    incident_id=incident_id,
                    units=units_due or [],
                    call_type=cad_event_type or "Emergency",
                    address=address or "",
                    subtype=cad_event_subtype,
                    cross_streets=cross_streets,
                    box=box,
                    db=db,
                )
                if result:
                    audio_url = result.get("audio_url")
                    tts_text = result.get("tts_text")
                    if audio_url:
                        logger.info(f"TTS audio generated: {audio_url}")
            except Exception as e:
                logger.warning(f"TTS generation failed: {e}")
    
    # Close DB session
    if db:
        try:
            db.close()
        except:
            pass
    
    # Build alert data
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
    
    # Include audio URL if generated (with cache-busting timestamp already included)
    if audio_url:
        alert_data["audio_url"] = audio_url
    
    # Include formatted TTS text for browser speech synthesis
    if tts_text:
        alert_data["tts_text"] = tts_text
    
    try:
        await broadcast(tenant_slug, alert_data)
        logger.debug(f"AV alert broadcast: {event_type} for incident {incident_id} to {tenant_slug}")
    except Exception as e:
        logger.warning(f"AV alert broadcast failed: {e}")


async def emit_custom_announcement(
    request,
    message: str,
):
    """
    Emit a custom announcement to all AV alert clients.
    
    Used for station paging, test messages, etc.
    No klaxon sound - just voice announcement.
    
    Args:
        request: FastAPI request (to extract tenant)
        message: The text to announce
        
    Returns:
        Dict with audio_url and tts_text, or None on failure
    """
    broadcast = _get_av_broadcast()
    if not broadcast:
        return None
    
    tenant_slug = _extract_tenant_from_request(request)
    
    # Get database session for settings lookup
    db = None
    try:
        db = next(get_db_for_tenant(tenant_slug))
    except Exception as e:
        logger.warning(f"Could not get DB for tenant {tenant_slug}: {e}")
    
    # Check if alerts/TTS are enabled
    settings = _get_av_settings(db)
    if not settings.get('enabled', True) or not settings.get('tts_enabled', True):
        logger.debug(f"AV alerts or TTS disabled for {tenant_slug}, skipping announcement")
        if db:
            db.close()
        return None
    
    # Generate audio
    tts = _get_tts_service()
    if not tts:
        if db:
            db.close()
        return None
    
    result = None
    try:
        result = await tts.generate_custom_announcement(
            tenant=tenant_slug,
            message=message,
        )
    except Exception as e:
        logger.warning(f"Custom announcement TTS failed: {e}")
    
    if db:
        try:
            db.close()
        except:
            pass
    
    if not result:
        return None
    
    # Broadcast to all clients
    alert_data = {
        "event_type": "announcement",
        "audio_url": result.get("audio_url"),
        "tts_text": result.get("tts_text"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    
    try:
        await broadcast(tenant_slug, alert_data)
        logger.info(f"Custom announcement broadcast to {tenant_slug}: {message[:50]}...")
    except Exception as e:
        logger.warning(f"Custom announcement broadcast failed: {e}")
    
    return result
