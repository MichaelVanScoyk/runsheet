"""
TTS Service - Text-to-Speech generation using Piper

Generates MP3 announcements for dispatch alerts.
Shared across all tenants - only the text content varies.

Usage:
    from services.tts_service import tts_service
    
    audio_url = await tts_service.generate_alert_audio(
        tenant="glenmoorefc",
        incident_id=123,
        units=["ENG481", "TWR48"],
        call_type="Structure Fire",
        address="123 Valley Road"
    )
"""

import asyncio
import logging
import os
import re
import shutil
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

# Piper configuration
PIPER_PATH = "/home/dashboard/piper/piper/piper"
MODEL_PATH = "/home/dashboard/piper/en_US-lessac-medium.onnx"
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


def _format_call_type(call_type: str, subtype: Optional[str] = None) -> str:
    """
    Format call type for natural speech.
    DWELLING FIRE -> "Dwelling Fire"
    """
    if not call_type:
        return "Emergency"
    
    # Title case
    result = call_type.strip().title()
    
    # Add subtype if meaningful
    if subtype and subtype.strip():
        subtype_clean = subtype.strip().title()
        # Skip generic subtypes
        if subtype_clean not in ["None", "Unknown", "Other"]:
            result = f"{result}, {subtype_clean}"
    
    return result


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
        subtype: Optional[str] = None
    ) -> str:
        """
        Format the announcement text.
        
        Output format: "Engine 4 81, Tower 48. Structure Fire, 123 Valley Road"
        """
        parts = []
        
        # Units (if any)
        if units:
            expanded_units = [_expand_unit_name(u) for u in units[:5]]  # Limit to 5 units
            parts.append(", ".join(expanded_units))
        
        # Call type
        formatted_type = _format_call_type(call_type, subtype)
        
        # Address
        formatted_address = _format_address(address)
        
        # Combine: "Units. Call Type, Address"
        if parts:
            units_str = parts[0]
            return f"{units_str}. {formatted_type}, {formatted_address}"
        else:
            return f"{formatted_type}, {formatted_address}"
    
    async def generate_alert_audio(
        self,
        tenant: str,
        incident_id: int,
        units: List[str],
        call_type: str,
        address: str,
        subtype: Optional[str] = None
    ) -> Optional[str]:
        """
        Generate MP3 audio for an alert.
        
        Returns:
            URL path to the audio file (e.g., "/alerts/audio/glenmoorefc/123.mp3")
            None if generation fails
        """
        if not self._check_piper():
            return None
        
        # Format the announcement text
        text = self.format_announcement(units, call_type, address, subtype)
        logger.info(f"TTS generating: '{text}' for {tenant}/{incident_id}")
        
        # Ensure directory exists
        tenant_dir = self._ensure_dirs(tenant)
        
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
                    return None
                
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
                    return None
                
                # Remove WAV file
                wav_path.unlink(missing_ok=True)
                
                # Return URL path
                url_path = f"/alerts/audio/{tenant}/{incident_id}.mp3"
                logger.info(f"TTS generated: {url_path} ({mp3_path.stat().st_size} bytes)")
                return url_path
                
            except asyncio.TimeoutError:
                logger.error(f"TTS generation timed out for {tenant}/{incident_id}")
                return None
            except Exception as e:
                logger.error(f"TTS generation error: {e}")
                return None
    
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
