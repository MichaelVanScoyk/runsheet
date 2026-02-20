"""
TTS Service - Text-to-Speech generation using Piper

Generates MP3 announcements for dispatch alerts.
Text formatting is configurable via admin settings.
Unit pronunciations are managed via tts_unit_mappings table.

Usage:
    from services.tts_service import tts_service
    
    # Generate audio and get both URL and text
    result = await tts_service.generate_alert_audio(
        tenant="glenmoorefc",
        incident_id=123,
        units=["ENG481", "TWR48"],
        call_type="Structure Fire",
        address="123 Valley Road",
        db=db_session  # Pass DB session to read settings
    )
    # result = {"audio_url": "/alerts/audio/...", "tts_text": "Engine forty-eight one..."}
"""

import asyncio
import logging
import os
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any

from services.tts_preprocessing import (
    tts_preprocessor,
    number_to_words,
    preprocess_for_tts,
)

logger = logging.getLogger(__name__)

# Piper configuration
PIPER_PATH = "/home/dashboard/piper/piper/piper"
PIPER_MODELS_DIR = "/home/dashboard/piper"  # Directory containing .onnx voice models
DEFAULT_MODEL = "en_US-ryan-medium"  # Default voice
FFMPEG_PATH = "/usr/bin/ffmpeg"

# Default speech rate (can be overridden by tenant settings)
# 1.0 = normal speed
# > 1.0 = slower (e.g., 1.2 = 20% slower)
# < 1.0 = faster (e.g., 0.8 = 20% faster)
DEFAULT_LENGTH_SCALE = 1.1  # Slightly slower for clarity

# Output configuration
ALERTS_DIR = "/tmp/tts_alerts"
ALERT_TTL_MINUTES = 10  # Auto-cleanup after this time


def get_available_voices() -> List[Dict[str, str]]:
    """
    Scan Piper models directory for available voice models.
    Returns list of {id, name, language, quality} dicts.
    """
    voices = []
    models_dir = Path(PIPER_MODELS_DIR)
    
    if not models_dir.exists():
        logger.warning(f"Piper models directory not found: {PIPER_MODELS_DIR}")
        return voices
    
    for onnx_file in models_dir.glob("*.onnx"):
        # Parse filename: en_US-ryan-medium.onnx -> en_US, ryan, medium
        name = onnx_file.stem  # e.g., "en_US-ryan-medium"
        parts = name.split('-')
        
        if len(parts) >= 2:
            language = parts[0]  # e.g., "en_US"
            voice_name = parts[1] if len(parts) > 1 else "unknown"  # e.g., "ryan"
            quality = parts[2] if len(parts) > 2 else "medium"  # e.g., "medium"
            
            # Make a friendly display name
            display_name = f"{voice_name.title()} ({language}, {quality})"
            
            voices.append({
                "id": name,
                "name": display_name,
                "voice": voice_name,
                "language": language,
                "quality": quality,
                "path": str(onnx_file),
            })
    
    # Sort by language, then voice name
    voices.sort(key=lambda v: (v["language"], v["voice"]))
    
    logger.info(f"Found {len(voices)} Piper voice models")
    return voices


def _get_tts_settings(db) -> Dict[str, Any]:
    """
    Get TTS settings from database.
    Returns defaults merged with stored settings.
    Always fetches fresh from DB - no caching.
    """
    from sqlalchemy import text
    import json
    
    defaults = {
        'tts_enabled': True,
        'tts_field_order': ['units', 'call_type', 'address'],
        'tts_speed': DEFAULT_LENGTH_SCALE,  # Speech rate (Piper length_scale)
        'tts_pause_style': 'normal',  # 'minimal', 'normal', 'dramatic'
        'tts_announce_all_units': False,  # If True, announce all units; if False, only your department's
        'tts_voice': DEFAULT_MODEL,  # Piper voice model name
        'settings_version': 0,
    }
    
    if not db:
        logger.debug("TTS settings: no DB session, using defaults")
        return defaults
    
    try:
        result = db.execute(text(
            "SELECT key, value, value_type FROM settings WHERE category = 'av_alerts'"
        ))
        
        rows_found = 0
        for row in result:
            rows_found += 1
            key, value, value_type = row[0], row[1], row[2]
            if key in defaults:
                # Parse value based on type
                if value_type == 'boolean':
                    defaults[key] = value.lower() in ('true', '1', 'yes')
                elif value_type == 'number':
                    try:
                        defaults[key] = float(value)
                    except:
                        try:
                            defaults[key] = int(value)
                        except:
                            pass
                elif key == 'tts_speed':
                    # Special case: tts_speed might be stored as string type but should be float
                    try:
                        defaults[key] = float(value)
                        logger.debug(f"TTS speed parsed from string: {value} -> {defaults[key]}")
                    except:
                        pass
                elif key == 'tts_pause_style':
                    # tts_pause_style is always a string, just use the value directly
                    if value in ('minimal', 'normal', 'dramatic'):
                        defaults[key] = value
                    else:
                        logger.warning(f"Invalid tts_pause_style '{value}', using default")
                elif value_type == 'json':
                    try:
                        defaults[key] = json.loads(value)
                    except:
                        pass
                else:
                    defaults[key] = value
                logger.debug(f"TTS setting loaded: {key}={defaults[key]} (type={value_type})")
        
        logger.debug(f"TTS settings: loaded {rows_found} rows from DB. speed={defaults.get('tts_speed')}, pause={defaults.get('tts_pause_style')}")
    except Exception as e:
        logger.warning(f"Failed to load TTS settings: {e}")
    
    return defaults


class TTSService:
    """
    Text-to-Speech service using Piper.
    
    Generates MP3 audio files for dispatch alerts.
    Thread-safe for concurrent generation.
    """
    
    def __init__(self):
        self.piper_path = PIPER_PATH
        self.models_dir = Path(PIPER_MODELS_DIR)
        self.alerts_dir = Path(ALERTS_DIR)
        self._semaphore = asyncio.Semaphore(3)  # Max 3 concurrent generations
        self._initialized = False
        
    def _ensure_dirs(self, tenant: str) -> Path:
        """Ensure tenant alert directory exists"""
        tenant_dir = self.alerts_dir / tenant
        tenant_dir.mkdir(parents=True, exist_ok=True)
        return tenant_dir
    
    def _get_model_path(self, voice_id: str = None) -> Path:
        """Get the full path to a voice model."""
        voice = voice_id or DEFAULT_MODEL
        model_path = self.models_dir / f"{voice}.onnx"
        
        # Fallback to default if specified voice not found
        if not model_path.exists():
            logger.warning(f"Voice model {voice} not found, falling back to {DEFAULT_MODEL}")
            model_path = self.models_dir / f"{DEFAULT_MODEL}.onnx"
        
        return model_path
    
    def _check_piper(self, voice_id: str = None) -> bool:
        """Verify Piper is available"""
        if not os.path.exists(self.piper_path):
            logger.error(f"Piper not found at {self.piper_path}")
            return False
        
        model_path = self._get_model_path(voice_id)
        if not model_path.exists():
            logger.error(f"Piper model not found at {model_path}")
            return False
        return True
    
    def _get_pause_style_punctuation(self, style: str) -> str:
        """Map pause style setting to punctuation."""
        # These match the field-level pauses but for the global setting
        STYLE_MAP = {
            'minimal': ',',     # Short pauses everywhere
            'normal': '.',      # Medium pauses
            'dramatic': '...',  # Long pauses
        }
        return STYLE_MAP.get(style, '.')
    
    async def format_announcement(
        self,
        units: List[str],
        call_type: str,
        address: str,
        subtype: Optional[str] = None,
        cross_streets: Optional[str] = None,
        box: Optional[str] = None,
        municipality: Optional[str] = None,
        development: Optional[str] = None,
        settings: Optional[Dict[str, Any]] = None,
        db=None,
        incident_id: int = None,
    ) -> str:
        """
        Format the announcement text based on settings.
        Uses tts_preprocessing for unit pronunciations and field pauses.
        """
        if settings is None:
            settings = {'tts_field_order': ['units', 'call_type', 'address']}
        
        field_order = settings.get('tts_field_order', ['units', 'call_type', 'address'])
        pause_style = settings.get('tts_pause_style', 'normal')
        
        # Get field settings from database
        field_settings = tts_preprocessor.get_field_settings(db)
        
        # Build parts with pause info
        parts = []  # List of (text, pause_style) tuples
        
        for field_id in field_order:
            field_cfg = field_settings.get(field_id, {'pause_after': 'medium'})
            pause_after = field_cfg.get('pause_after', 'medium')
            prefix = field_cfg.get('prefix', '')
            
            text = None
            
            if field_id == 'units' and units:
                # Get spoken pronunciations for each unit
                spoken_units = await tts_preprocessor.get_units_spoken(db, units[:5], incident_id)
                if spoken_units:
                    join_word = field_cfg.get('options', {}).get('join_word', 'and')
                    if len(spoken_units) == 1:
                        text = spoken_units[0]
                    elif len(spoken_units) == 2:
                        text = f"{spoken_units[0]} {join_word} {spoken_units[1]}"
                    else:
                        text = ', '.join(spoken_units[:-1]) + f", {join_word} " + spoken_units[-1]
            
            elif field_id == 'call_type' and call_type:
                # Preprocess: / -> space, <=3 caps spelled, >3 caps title case
                text = preprocess_for_tts(call_type.strip())
            
            elif field_id == 'subtype' and subtype:
                subtype_clean = subtype.strip()
                if subtype_clean.lower() not in ['none', 'unknown', 'other', '']:
                    # Preprocess: / -> space, <=3 caps spelled, >3 caps title case
                    text = preprocess_for_tts(subtype_clean)
            
            elif field_id == 'box' and box:
                box_prefix = prefix or 'Box'
                text = f"{box_prefix} {box.strip()}"
            
            elif field_id == 'address' and address:
                # Expand address abbreviations using DB-backed street types
                expand = field_cfg.get('options', {}).get('expand_street_types', True)
                if expand:
                    text = tts_preprocessor.expand_address(db, address)
                else:
                    text = address
            
            elif field_id == 'cross_streets' and cross_streets:
                streets = cross_streets.replace(" / ", " and ").replace("/", " and ")
                cross_prefix = prefix or 'between'
                text = f"{cross_prefix} {streets.strip()}"
            
            elif field_id == 'municipality' and municipality:
                text = municipality.strip()
            
            elif field_id == 'development' and development:
                text = development.strip()
            
            if text:
                parts.append((text, pause_after))
        
        if not parts:
            return "Alert."
        
        # Format with pauses
        return tts_preprocessor.format_with_pauses(parts)
    
    async def generate_alert_audio(
        self,
        tenant: str,
        incident_id: int,
        units: List[str],
        call_type: str,
        address: str,
        subtype: Optional[str] = None,
        cross_streets: Optional[str] = None,
        box: Optional[str] = None,
        municipality: Optional[str] = None,
        development: Optional[str] = None,
        db=None,
    ) -> Optional[Dict[str, str]]:
        """
        Generate MP3 audio for an alert.
        
        Returns:
            Dict with:
                - audio_url: URL path to the audio file with cache-busting timestamp
                - tts_text: The formatted announcement text (for browser TTS)
            None if generation fails
        """
        # Get settings from database
        settings = _get_tts_settings(db)
        
        # Format the announcement text (now async due to DB lookups)
        text = await self.format_announcement(
            units=units,
            call_type=call_type,
            address=address,
            subtype=subtype,
            cross_streets=cross_streets,
            box=box,
            municipality=municipality,
            development=development,
            settings=settings,
            db=db,
            incident_id=incident_id,
        )
        
        # Get speech rate from settings (Piper length_scale)
        length_scale = settings.get('tts_speed', DEFAULT_LENGTH_SCALE)
        # Clamp to reasonable range
        length_scale = max(0.5, min(2.0, float(length_scale)))
        
        # Get voice from settings
        voice_id = settings.get('tts_voice', DEFAULT_MODEL)
        
        logger.info(f"TTS generating: '{text}' for {tenant}/{incident_id} (speed={length_scale}, voice={voice_id})")
        
        if not self._check_piper(voice_id):
            # Return text only if Piper unavailable
            return {"audio_url": None, "tts_text": text}
        
        # Get model path for selected voice
        model_path = self._get_model_path(voice_id)
        
        # Ensure directory exists
        tenant_dir = self._ensure_dirs(tenant)
        
        # Use timestamp in filename for cache busting
        timestamp = int(time.time() * 1000)
        
        # Output paths
        wav_path = tenant_dir / f"{incident_id}.wav"
        mp3_path = tenant_dir / f"{incident_id}.mp3"
        
        # Use semaphore to limit concurrent generations
        async with self._semaphore:
            try:
                # Generate WAV with Piper
                # --length_scale controls speed (>1 = slower, <1 = faster)
                proc = await asyncio.create_subprocess_exec(
                    self.piper_path,
                    "--model", str(model_path),
                    "--length_scale", str(length_scale),
                    "--output_file", str(wav_path),
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(input=text.encode()),
                    timeout=10.0  # 10 second timeout
                )
                
                if proc.returncode != 0:
                    logger.error(f"Piper failed: {stderr.decode()}")
                    return {"audio_url": None, "tts_text": text}
                
                # Convert WAV to MP3 with ffmpeg
                proc = await asyncio.create_subprocess_exec(
                    FFMPEG_PATH, "-y",
                    "-i", str(wav_path),
                    "-codec:a", "libmp3lame",
                    "-b:a", "64k",  # 64kbps is fine for speech
                    str(mp3_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10.0)
                
                if proc.returncode != 0:
                    logger.error(f"ffmpeg failed for {incident_id}: {stderr.decode() if stderr else 'no stderr'}")
                    return {"audio_url": None, "tts_text": text}
                
                # Remove WAV file
                wav_path.unlink(missing_ok=True)
                
                # Return URL path with cache-busting timestamp
                url_path = f"/alerts/audio/{tenant}/{incident_id}.mp3?t={timestamp}"
                logger.info(f"TTS generated: {url_path} ({mp3_path.stat().st_size} bytes)")
                
                return {
                    "audio_url": url_path,
                    "tts_text": text,
                }
                
            except asyncio.TimeoutError:
                logger.error(f"TTS generation timed out for {tenant}/{incident_id}")
                return {"audio_url": None, "tts_text": text}
            except Exception as e:
                logger.error(f"TTS generation error: {e}")
                return {"audio_url": None, "tts_text": text}
    
    async def generate_custom_announcement(
        self,
        tenant: str,
        message: str,
        db=None,
    ) -> Optional[Dict[str, str]]:
        """
        Generate MP3 audio for a custom announcement.
        Used for station paging, test messages, etc.
        
        Returns:
            Dict with audio_url and tts_text
        """
        if not message or not message.strip():
            return None
        
        text = message.strip()
        
        # Get settings for speed and voice
        settings = _get_tts_settings(db)
        length_scale = settings.get('tts_speed', DEFAULT_LENGTH_SCALE)
        length_scale = max(0.5, min(2.0, float(length_scale)))
        voice_id = settings.get('tts_voice', DEFAULT_MODEL)
        
        logger.info(f"TTS generating custom: '{text}' for {tenant} (voice={voice_id})")
        
        if not self._check_piper(voice_id):
            return {"audio_url": None, "tts_text": text}
        
        # Get model path for selected voice
        model_path = self._get_model_path(voice_id)
        
        # Ensure directory exists
        tenant_dir = self._ensure_dirs(tenant)
        
        # Use timestamp as ID for custom messages
        timestamp = int(time.time() * 1000)
        msg_id = f"custom_{timestamp}"
        
        wav_path = tenant_dir / f"{msg_id}.wav"
        mp3_path = tenant_dir / f"{msg_id}.mp3"
        
        async with self._semaphore:
            try:
                # Generate WAV with Piper
                # --length_scale controls speed (>1 = slower, <1 = faster)
                proc = await asyncio.create_subprocess_exec(
                    self.piper_path,
                    "--model", str(model_path),
                    "--length_scale", str(length_scale),
                    "--output_file", str(wav_path),
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(input=text.encode()),
                    timeout=10.0
                )
                
                if proc.returncode != 0:
                    logger.error(f"Piper failed: {stderr.decode()}")
                    return {"audio_url": None, "tts_text": text}
                
                # Convert WAV to MP3
                proc = await asyncio.create_subprocess_exec(
                    FFMPEG_PATH, "-y",
                    "-i", str(wav_path),
                    "-codec:a", "libmp3lame",
                    "-b:a", "64k",
                    str(mp3_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10.0)
                
                if proc.returncode != 0:
                    logger.error(f"ffmpeg failed for custom message: {stderr.decode() if stderr else 'no stderr'}")
                    return {"audio_url": None, "tts_text": text}
                
                wav_path.unlink(missing_ok=True)
                
                url_path = f"/alerts/audio/{tenant}/{msg_id}.mp3?t={timestamp}"
                logger.info(f"TTS custom generated: {url_path}")
                
                return {
                    "audio_url": url_path,
                    "tts_text": text,
                }
                
            except asyncio.TimeoutError:
                logger.error(f"TTS custom generation timed out")
                return {"audio_url": None, "tts_text": text}
            except Exception as e:
                logger.error(f"TTS custom generation error: {e}")
                return {"audio_url": None, "tts_text": text}
    
    async def cleanup_old_files(self, max_age_minutes: int = ALERT_TTL_MINUTES):
        """Remove alert audio files older than max_age_minutes"""
        if not self.alerts_dir.exists():
            return
        
        cutoff = datetime.now() - timedelta(minutes=max_age_minutes)
        removed = 0
        
        for tenant_dir in self.alerts_dir.iterdir():
            if not tenant_dir.is_dir():
                continue
            for mp3_file in tenant_dir.glob("*.mp3"):
                try:
                    mtime = datetime.fromtimestamp(mp3_file.stat().st_mtime)
                    if mtime < cutoff:
                        mp3_file.unlink()
                        removed += 1
                except Exception as e:
                    logger.warning(f"Failed to remove {mp3_file}: {e}")
        
        if removed:
            logger.info(f"TTS cleanup: removed {removed} old audio files")
    
    def get_audio_path(self, tenant: str, incident_id: int) -> Optional[Path]:
        """Get filesystem path to an audio file (for serving)"""
        mp3_path = self.alerts_dir / tenant / f"{incident_id}.mp3"
        if mp3_path.exists():
            return mp3_path
        return None


# Singleton instance
tts_service = TTSService()
