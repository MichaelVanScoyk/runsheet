"""
Test Alerts Router - Send test AV alerts and custom announcements
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import logging

from routers.av_alerts import emit_av_alert, emit_custom_announcement

logger = logging.getLogger(__name__)

# Lazy import TTS service
_tts_service = None

def _get_tts():
    global _tts_service
    if _tts_service is None:
        try:
            from services.tts_service import tts_service
            _tts_service = tts_service
        except ImportError:
            _tts_service = False
    return _tts_service if _tts_service else None


router = APIRouter()


class TestAlertRequest(BaseModel):
    event_type: str  # "dispatch" or "close"
    call_category: str  # "FIRE" or "EMS"
    cad_event_type: Optional[str] = "TEST ALERT"
    cad_event_subtype: Optional[str] = None
    address: Optional[str] = "123 Test Street"
    units_due: Optional[List[str]] = ["TEST1", "TEST2"]
    cross_streets: Optional[str] = None
    box: Optional[str] = None


class CustomAnnouncementRequest(BaseModel):
    message: str  # The text to announce


@router.get("/tts-test")
async def test_tts_generation():
    """
    Quick test of TTS generation without broadcasting.
    Returns the generated audio URL and formatted text.
    """
    tts = _get_tts()
    if not tts:
        raise HTTPException(status_code=500, detail="TTS service not available")
    
    try:
        result = await tts.generate_alert_audio(
            tenant="test",
            incident_id=0,
            units=["ENG481", "TWR48"],
            call_type="Structure Fire",
            address="123 Valley Road",
            subtype=None,
            db=None,  # Uses default settings
        )
        
        if result:
            return {
                "success": True,
                "audio_url": result.get("audio_url"),
                "tts_text": result.get("tts_text"),
            }
        else:
            raise HTTPException(status_code=500, detail="TTS generation failed")
    
    except Exception as e:
        logger.error(f"TTS test failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-alert")
async def send_test_alert(
    request: Request,
    alert: TestAlertRequest
):
    """
    Send a test AV alert through WebSocket without creating an incident.
    
    Used for testing StationBell hardware and browser alert sounds.
    The tts_text will be formatted according to admin settings.
    """
    try:
        await emit_av_alert(
            request=request,
            event_type=alert.event_type,
            incident_id=99999,  # Fake incident ID
            call_category=alert.call_category,
            cad_event_type=alert.cad_event_type,
            cad_event_subtype=alert.cad_event_subtype,
            address=alert.address,
            units_due=alert.units_due,
            cross_streets=alert.cross_streets,
            box=alert.box,
        )
        
        logger.info(f"Test alert sent: {alert.event_type} / {alert.call_category}")
        
        return {
            "success": True,
            "message": f"Test {alert.event_type} alert sent"
        }
    
    except Exception as e:
        logger.error(f"Failed to send test alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/announce")
async def send_custom_announcement(
    request: Request,
    data: CustomAnnouncementRequest
):
    """
    Send a custom announcement to all AV alert clients.
    
    Used for station paging, test messages, etc.
    No klaxon sound - just voice announcement.
    
    Both web UI and StationBell will receive:
    - audio_url: Server-generated MP3
    - tts_text: The message text (for browser TTS fallback)
    """
    if not data.message or not data.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    if len(data.message) > 500:
        raise HTTPException(status_code=400, detail="Message too long (max 500 characters)")
    
    try:
        result = await emit_custom_announcement(
            request=request,
            message=data.message.strip(),
        )
        
        if result:
            logger.info(f"Custom announcement sent: {data.message[:50]}...")
            return {
                "success": True,
                "audio_url": result.get("audio_url"),
                "tts_text": result.get("tts_text"),
            }
        else:
            raise HTTPException(status_code=500, detail="Announcement generation failed or TTS disabled")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to send custom announcement: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settings-preview")
async def preview_tts_settings(request: Request):
    """
    Preview what the TTS announcement would look like with current settings.
    
    Returns sample announcement text using the admin-configured field order.
    Useful for testing settings changes before a real alert.
    """
    from database import get_db_for_tenant, _extract_slug
    
    tenant_slug = _extract_slug(request.headers.get('host', ''))
    
    db = None
    try:
        db = next(get_db_for_tenant(tenant_slug))
    except Exception:
        pass
    
    tts = _get_tts()
    if not tts:
        if db:
            db.close()
        return {
            "success": False,
            "error": "TTS service not available"
        }
    
    # Import settings getter
    from services.tts_service import _get_tts_settings
    settings = _get_tts_settings(db)
    
    # Generate sample announcement with all possible fields
    sample_text = tts.format_announcement(
        units=["ENG481", "TWR48", "SQ48"],
        call_type="DWELLING FIRE",
        address="123 MAIN ST",
        subtype="GAS LEAK INSIDE",
        cross_streets="OAK AVE / ELM ST",
        box="48-1",
        municipality="WEST NANTMEAL",
        development="EAGLE VIEW",
        settings=settings,
    )
    
    if db:
        db.close()
    
    return {
        "success": True,
        "sample_text": sample_text,
        "settings": {
            "tts_enabled": settings.get("tts_enabled", True),
            "tts_field_order": settings.get("tts_field_order", ["units", "call_type", "address"]),
        }
    }
