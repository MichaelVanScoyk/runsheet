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
    cad_event_type: Optional[str] = None  # Uses last incident if not provided
    cad_event_subtype: Optional[str] = None
    address: Optional[str] = None  # Uses last incident if not provided
    units_due: Optional[List[str]] = None  # Uses last incident if not provided
    cross_streets: Optional[str] = None
    box: Optional[str] = None


class CustomAnnouncementRequest(BaseModel):
    message: str  # The text to announce


class TTSPreviewRequest(BaseModel):
    message: str  # The text to preview


@router.post("/tts-preview")
async def preview_tts_announcement(
    request: Request,
    data: TTSPreviewRequest
):
    """
    Preview a custom announcement TTS without broadcasting.
    
    Generates the audio file and returns the URL for local playback.
    Does NOT send to connected devices.
    """
    if not data.message or not data.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    if len(data.message) > 500:
        raise HTTPException(status_code=400, detail="Message too long (max 500 characters)")
    
    tts = _get_tts()
    if not tts:
        raise HTTPException(status_code=500, detail="TTS service not available")
    
    from database import _extract_slug, get_db_for_tenant
    tenant_slug = _extract_slug(request.headers.get('host', ''))
    
    # Get db for settings
    db = None
    try:
        db = next(get_db_for_tenant(tenant_slug))
    except Exception:
        pass
    
    try:
        result = await tts.generate_custom_announcement(
            tenant=tenant_slug,
            message=data.message.strip(),
            db=db,
        )
        
        if db:
            db.close()
        
        if result:
            return {
                "success": True,
                "audio_url": result.get("audio_url"),
                "tts_text": result.get("tts_text"),
            }
        else:
            raise HTTPException(status_code=500, detail="TTS generation failed")
    
    except Exception as e:
        if db:
            db.close()
        logger.error(f"TTS preview failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    Uses most recent incident data for realistic test if no data provided.
    """
    from database import get_db_for_tenant, _extract_slug
    from sqlalchemy import text
    
    tenant_slug = _extract_slug(request.headers.get('host', ''))
    
    # Get incident data - use provided values or fetch from last incident
    cad_event_type = alert.cad_event_type
    cad_event_subtype = alert.cad_event_subtype
    address = alert.address
    units_due = alert.units_due
    cross_streets = alert.cross_streets
    box = alert.box
    
    # If no data provided, try to use last incident
    if not cad_event_type or not address or not units_due:
        db = None
        try:
            db = next(get_db_for_tenant(tenant_slug))
            result = db.execute(text("""
                SELECT cad_event_type, cad_event_subtype, address, cross_streets, 
                       box, units_due
                FROM incidents 
                WHERE cad_event_type IS NOT NULL 
                ORDER BY created_at DESC 
                LIMIT 1
            """)).fetchone()
            
            if result:
                import json
                cad_event_type = cad_event_type or result[0] or "TEST ALERT"
                cad_event_subtype = cad_event_subtype or result[1]
                address = address or result[2] or "Test Address"
                cross_streets = cross_streets or result[3]
                box = box or result[4]
                
                if not units_due:
                    units_raw = result[5]
                    if units_raw:
                        try:
                            units_due = json.loads(units_raw) if units_raw.startswith('[') else [u.strip() for u in units_raw.split(',')]
                        except:
                            units_due = ["TEST1", "TEST2"]
                    else:
                        units_due = ["TEST1", "TEST2"]
            else:
                # No incidents found, use defaults
                cad_event_type = cad_event_type or "TEST ALERT"
                address = address or "123 Test Street"
                units_due = units_due or ["TEST1", "TEST2"]
        except Exception as e:
            logger.warning(f"Failed to load incident data for test: {e}")
            cad_event_type = cad_event_type or "TEST ALERT"
            address = address or "123 Test Street"
            units_due = units_due or ["TEST1", "TEST2"]
        finally:
            if db:
                db.close()
    
    try:
        await emit_av_alert(
            request=request,
            event_type=alert.event_type,
            incident_id=99999,  # Fake incident ID for test
            call_category=alert.call_category,
            cad_event_type=cad_event_type,
            cad_event_subtype=cad_event_subtype,
            address=address,
            units_due=units_due,
            cross_streets=cross_streets,
            box=box,
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
    Preview what the TTS announcement would sound like with current settings.
    
    Uses the most recent incident's data for realistic preview.
    Generates actual server-side Piper TTS audio.
    
    Returns:
        - sample_text: Formatted announcement text
        - audio_url: Server-generated MP3 URL
        - incident_info: Info about the source incident (if any)
        - settings: Current TTS settings
    """
    from database import get_db_for_tenant, _extract_slug
    from sqlalchemy import text
    
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
    
    # Try to get the most recent incident for realistic preview data
    incident_info = None
    units = []
    call_type = ""
    subtype = None
    address = ""
    cross_streets = None
    box = None
    municipality = None
    development = None
    
    if db:
        try:
            # Get most recent incident with CAD data
            result = db.execute(text("""
                SELECT id, cad_event_type, cad_event_subtype, address, cross_streets, 
                       box, municipality, development, units_due
                FROM incidents 
                WHERE cad_event_type IS NOT NULL 
                ORDER BY created_at DESC 
                LIMIT 1
            """)).fetchone()
            
            if result:
                incident_info = {"id": result[0]}
                call_type = result[1] or ""
                subtype = result[2]
                address = result[3] or ""
                cross_streets = result[4]
                box = result[5]
                municipality = result[6]
                development = result[7]
                
                # Parse units_due - could be JSON array or comma-separated
                units_raw = result[8]
                if units_raw:
                    import json
                    try:
                        units = json.loads(units_raw) if units_raw.startswith('[') else [u.strip() for u in units_raw.split(',')]
                    except:
                        units = [u.strip() for u in str(units_raw).split(',')]
        except Exception as e:
            logger.warning(f"Failed to load recent incident for preview: {e}")
    
    # Fallback to sample data if no incident found
    if not call_type:
        units = ["ENG481", "TWR48"]
        call_type = "DWELLING FIRE"
        address = "123 MAIN ST"
        incident_info = None  # Clear to indicate sample data
    
    # Generate the announcement text
    sample_text = tts.format_announcement(
        units=units,
        call_type=call_type,
        address=address,
        subtype=subtype,
        cross_streets=cross_streets,
        box=box,
        municipality=municipality,
        development=development,
        settings=settings,
    )
    
    # Generate actual audio for preview (use incident_id=0 for preview files)
    audio_url = None
    try:
        result = await tts.generate_alert_audio(
            tenant=tenant_slug,
            incident_id=0,  # Preview ID
            units=units,
            call_type=call_type,
            address=address,
            subtype=subtype,
            cross_streets=cross_streets,
            box=box,
            municipality=municipality,
            development=development,
            db=db,
        )
        if result:
            audio_url = result.get("audio_url")
    except Exception as e:
        logger.warning(f"Failed to generate preview audio: {e}")
    
    if db:
        db.close()
    
    return {
        "success": True,
        "sample_text": sample_text,
        "audio_url": audio_url,
        "incident_info": incident_info,
        "settings": {
            "tts_enabled": settings.get("tts_enabled", True),
            "tts_field_order": settings.get("tts_field_order", ["units", "call_type", "address"]),
            "tts_speed": settings.get("tts_speed", 1.1),
            "tts_pause_style": settings.get("tts_pause_style", "normal"),
            "tts_announce_all_units": settings.get("tts_announce_all_units", False),
        }
    }
