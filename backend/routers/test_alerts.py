"""
Test Alerts Router - Send test AV alerts without creating incidents
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import logging

from routers.av_alerts import emit_av_alert

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


@router.get("/tts-test")
async def test_tts_generation():
    """
    Quick test of TTS generation without broadcasting.
    Returns the generated audio URL.
    """
    tts = _get_tts()
    if not tts:
        raise HTTPException(status_code=500, detail="TTS service not available")
    
    try:
        # Generate a test audio file
        audio_url = await tts.generate_alert_audio(
            tenant="test",
            incident_id=0,
            units=["ENG481", "TWR48"],
            call_type="Structure Fire",
            address="123 Valley Road",
            subtype=None
        )
        
        if audio_url:
            return {
                "success": True,
                "audio_url": audio_url,
                "text": tts.format_announcement(
                    units=["ENG481", "TWR48"],
                    call_type="Structure Fire",
                    address="123 Valley Road"
                )
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
        )
        
        logger.info(f"Test alert sent: {alert.event_type} / {alert.call_category}")
        
        return {
            "success": True,
            "message": f"Test {alert.event_type} alert sent"
        }
    
    except Exception as e:
        logger.error(f"Failed to send test alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))
