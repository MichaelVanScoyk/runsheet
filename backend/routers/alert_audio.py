"""
Alert Audio Router - Serves TTS-generated audio files for StationBell devices.

Endpoints:
    GET /alerts/audio/{tenant}/{incident_id}.mp3 - Get TTS audio for an incident

These are served without auth since StationBell devices use device tokens
and need to fetch audio files directly.
"""

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/alerts", tags=["Alert Audio"])

# TTS audio storage location (matches tts_service.py)
ALERTS_DIR = Path("/tmp/tts_alerts")


@router.get("/audio/{tenant}/{filename}")
async def get_alert_audio(tenant: str, filename: str):
    """
    Serve TTS audio file for an alert.
    
    Called by StationBell ESP32 devices after receiving audio_url in WebSocket alert.
    
    Path: /alerts/audio/{tenant}/{incident_id}.mp3
    """
    # Validate filename (must be {incident_id}.mp3)
    if not filename.endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Invalid file format")
    
    # Sanitize tenant slug (prevent path traversal)
    if "/" in tenant or "\\" in tenant or ".." in tenant:
        raise HTTPException(status_code=400, detail="Invalid tenant")
    
    # Build file path
    audio_path = ALERTS_DIR / tenant / filename
    
    # Check file exists
    if not audio_path.exists():
        logger.warning(f"Audio file not found: {audio_path}")
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    # Serve the file
    return FileResponse(
        path=audio_path,
        media_type="audio/mpeg",
        filename=filename
    )
