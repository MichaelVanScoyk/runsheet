"""
TTS Service - Text-to-Speech generation using Piper

Generates MP3 announcements for dispatch alerts.
Text formatting is configurable via admin settings.

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
    # result = {"audio_url": "/alerts/audio/...", "tts_text": "Engine 4 81..."}
"""

import asyncio
import logging
import os
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)

# Piper configuration
PIPER_PATH = "/home/dashboard/piper/piper/piper"
MODEL_PATH = "/home/dashboard/piper/en_US-ryan-medium.onnx"
FFMPEG_PATH = "/usr/bin/ffmpeg"

# Output configuration
ALERTS_DIR = "/tmp/tts_alerts"
ALERT_TTL_MINUTES = 10  # Auto-cleanup after this time

# Unit name expansions for natural speech
UNIT_EXPANSIONS = {
    "ENG": "Engine",
    "TWR": "Tower",
    "SQ": "Squad",
    "RES": "Rescue",
    "AMB": "Ambulance",
    "MED": "Medic",
    "BC": "Battalion Chief",
    "FM": "Fire Marshal",
    "UT": "Utility",
    "BR": "Brush",
    "TK": "Tanker",
    "TB": "Tiller",
    "QT": "Quint",
    "LAD": "Ladder",
    "PLT": "Platform",
}


def _expand_unit_name(unit: str) -> str:
    """
    Expand unit designator for natural speech.
    ENG481 -> "Engine 4 81"
    TWR48 -> "Tower 48"
    """
    unit = unit.upper().strip()
    
    for prefix, expansion in UNIT_EXPANSIONS.items():
        if unit.startswith(prefix):
            number = unit[len(prefix):]
            # Add spaces between digits for clearer pronunciation
            # "481" -> "4 81" for "four eighty-one"
            if len(number) == 3:
                number = f"{number[0]} {number[1:]}"
            return f"{expansion} {number}"
    
    # Unknown prefix - return as-is with spaced digits
    return " ".join(unit)


def _format_address(address: str) -> str:
    """
    Format address for natural speech.
    - Expand common abbreviations
    - Clean up formatting
    """
    if not address:
        return ""
    
    address = address.strip()
    
    # Common abbreviations
    replacements = {
        r'\bRD\b': 'Road',
        r'\bST\b': 'Street',
        r'\bAVE\b': 'Avenue',
        r'\bBLVD\b': 'Boulevard',
        r'\bDR\b': 'Drive',
        r'\bLN\b': 'Lane',
        r'\bCT\b': 'Court',
        r'\bPL\b': 'Place',
        r'\bCIR\b': 'Circle',
        r'\bHWY\b': 'Highway',
        r'\bPKWY\b': 'Parkway',
        r'\bN\b': 'North',
        r'\bS\b': 'South',
        r'\bE\b': 'East',
        r'\bW\b': 'West',
        r'\bNE\b': 'Northeast',
        r'\bNW\b': 'Northwest',
        r'\bSE\b': 'Southeast',
        r'\bSW\b': 'Southwest',
    }
    
    for pattern, replacement in replacements.items():
        address = re.sub(pattern, replacement, address, flags=re.IGNORECASE)
    
    return address


def _format_call_type(call_type: str, subtype: Optional[str] = None, include_subtype: bool = False) -> str:
    """
    Format call type for natural speech.
    DWELLING FIRE -> "Dwelling Fire"
    """
    if not call_type:
        return "Emergency"
    
    # Title case
    result = call_type.strip().title()
    
    # Add subtype if enabled and meaningful
    if include_subtype and subtype and subtype.strip():
        subtype_clean = subtype.strip().title()
        # Skip generic subtypes
        if subtype_clean not in ["None", "Unknown", "Other"]:
            result = f"{result}, {subtype_clean}"
    
    return result


def _get_tts_settings(db) -> Dict[str, Any]:
    """
    Get TTS settings from database.
    Returns defaults merged with stored settings.
    """
    from sqlalchemy import text
    import json
    
    defaults = {
        'tts_enabled': True,
        'tts_field_order': ['units', 'call_type', 'address'],
        'settings_version': 0,
    }
    
    if not db:
        return defaults
    
    try:
        result = db.execute(text(
            "SELECT key, value, value_type FROM settings WHERE category = 'av_alerts'"
        ))
        
        for row in result:
            key, value, value_type = row[0], row[1], row[2]
            if key in defaults:
                # Parse value based on type
                if value_type == 'boolean':
                    defaults[key] = value.lower() in ('true', '1', 'yes')
                elif value_type == 'number':
                    defaults[key] = int(value)
                elif value_type == 'json':
                    try:
                        defaults[key] = json.loads(value)
                    except:
                        pass
                else:
                    defaults[key] = value
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
        self.model_path = MODEL_PATH
        self.alerts_dir = Path(ALERTS_DIR)
        self._semaphore = asyncio.Semaphore(3)  # Max 3 concurrent generations
        self._initialized = False
        
    def _ensure_dirs(self, tenant: str) -> Path:
        """Ensure tenant alert directory exists"""
        tenant_dir = self.alerts_dir / tenant
        tenant_dir.mkdir(parents=True, exist_ok=True)
        return tenant_dir
    
    def _check_piper(self) -> bool:
        """Verify Piper is available"""
        if not os.path.exists(self.piper_path):
            logger.error(f"Piper not found at {self.piper_path}")
            return False
        if not os.path.exists(self.model_path):
            logger.error(f"Piper model not found at {self.model_path}")
            return False
        return True
    
    def format_announcement(
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
    ) -> str:
        """
        Format the announcement text based on settings.
        
        Settings contains tts_field_order - an ordered list of field IDs:
        - units: "Engine 4 81, Tower 48"
        - call_type: "Structure Fire"
        - subtype: "Gas Leak Inside"
        - address: "123 Valley Road"
        - cross_streets: "Main Street and Oak Avenue"
        - box: "Box 48-1"
        - municipality: "West Nantmeal"
        - development: "Eagle View"
        """
        if settings is None:
            settings = {'tts_field_order': ['units', 'call_type', 'address']}
        
        field_order = settings.get('tts_field_order', ['units', 'call_type', 'address'])
        
        parts = []
        units_first = False
        
        for field_id in field_order:
            if field_id == 'units' and units:
                expanded_units = [_expand_unit_name(u) for u in units[:5]]  # Limit to 5 units
                parts.append(", ".join(expanded_units))
                if len(parts) == 1:
                    units_first = True
            
            elif field_id == 'call_type' and call_type:
                formatted_type = _format_call_type(call_type)
                if formatted_type:
                    parts.append(formatted_type)
            
            elif field_id == 'subtype' and subtype:
                formatted_subtype = subtype.strip().title()
                if formatted_subtype and formatted_subtype not in ["None", "Unknown", "Other"]:
                    parts.append(formatted_subtype)
            
            elif field_id == 'box' and box:
                parts.append(f"Box {box}")
            
            elif field_id == 'address' and address:
                formatted_address = _format_address(address)
                if formatted_address:
                    parts.append(formatted_address)
            
            elif field_id == 'cross_streets' and cross_streets:
                parts.append(f"between {cross_streets}")
            
            elif field_id == 'municipality' and municipality:
                parts.append(municipality.strip().title())
            
            elif field_id == 'development' and development:
                parts.append(development.strip().title())
        
        if not parts:
            return "Alert"
        
        if len(parts) == 1:
            return parts[0]
        
        # If units are first, separate them with a period for pacing
        if units_first:
            units_part = parts[0]
            rest = ", ".join(parts[1:])
            return f"{units_part}. {rest}"
        else:
            return ", ".join(parts)
    
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
        
        # Format the announcement text
        text = self.format_announcement(
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
        
        logger.info(f"TTS generating: '{text}' for {tenant}/{incident_id}")
        
        if not self._check_piper():
            # Return text only if Piper unavailable
            return {"audio_url": None, "tts_text": text}
        
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
                proc = await asyncio.create_subprocess_exec(
                    self.piper_path,
                    "--model", self.model_path,
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
                
                await asyncio.wait_for(proc.communicate(), timeout=10.0)
                
                if proc.returncode != 0:
                    logger.error(f"ffmpeg failed for {incident_id}")
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
        logger.info(f"TTS generating custom: '{text}' for {tenant}")
        
        if not self._check_piper():
            return {"audio_url": None, "tts_text": text}
        
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
                proc = await asyncio.create_subprocess_exec(
                    self.piper_path,
                    "--model", self.model_path,
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
                
                await asyncio.wait_for(proc.communicate(), timeout=10.0)
                
                if proc.returncode != 0:
                    logger.error(f"ffmpeg failed for custom message")
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
