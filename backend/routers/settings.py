"""
Settings Router - Generic runtime configuration from database

Handles generic settings CRUD. Specialized settings have their own routers:
- Branding: /api/branding (branding.py)
- Print Layout: /api/print-layout (print_layout.py)
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, Any
from pydantic import BaseModel
import json

from database import get_db

# Import UTC formatting helper
try:
    from settings_helper import format_utc_iso
except ImportError:
    def format_utc_iso(dt):
        if dt is None:
            return None
        if hasattr(dt, 'isoformat'):
            iso = dt.isoformat()
            if not iso.endswith('Z') and '+' not in iso:
                iso += 'Z'
            return iso
        return str(dt)

router = APIRouter()


# =============================================================================
# SCHEMAS
# =============================================================================

class SettingUpdate(BaseModel):
    value: str


class SettingCreate(BaseModel):
    category: str
    key: str
    value: str
    value_type: str = 'string'
    description: Optional[str] = None


# =============================================================================
# SETTINGS CRUD
# =============================================================================

@router.get("")
async def list_all_settings(db: Session = Depends(get_db)):
    """Get all settings grouped by category"""
    result = db.execute(text("""
        SELECT id, category, key, value, value_type, description, updated_at
        FROM settings
        ORDER BY category, key
    """))
    
    settings = {}
    for row in result:
        cat = row[1]
        if cat not in settings:
            settings[cat] = []
        settings[cat].append({
            "id": row[0],
            "category": row[1],
            "key": row[2],
            "value": _parse_value(row[3], row[4]),
            "raw_value": row[3],
            "value_type": row[4],
            "description": row[5],
            "updated_at": format_utc_iso(row[6]),
        })
    
    return settings


@router.get("/flat")
async def list_settings_flat(db: Session = Depends(get_db)):
    """Get all settings as flat list"""
    result = db.execute(text("""
        SELECT id, category, key, value, value_type, description, updated_at
        FROM settings
        ORDER BY category, key
    """))
    
    return [
        {
            "id": row[0],
            "category": row[1],
            "key": row[2],
            "value": _parse_value(row[3], row[4]),
            "raw_value": row[3],
            "value_type": row[4],
            "description": row[5],
            "updated_at": format_utc_iso(row[6]),
        }
        for row in result
    ]


@router.get("/category/{category}")
async def get_settings_by_category(
    category: str,
    db: Session = Depends(get_db)
):
    """Get all settings in a category"""
    result = db.execute(
        text("""
            SELECT id, category, key, value, value_type, description
            FROM settings
            WHERE category = :category
            ORDER BY key
        """),
        {"category": category}
    )
    
    return [
        {
            "id": row[0],
            "category": row[1],
            "key": row[2],
            "value": _parse_value(row[3], row[4]),
            "raw_value": row[3],
            "value_type": row[4],
            "description": row[5],
        }
        for row in result
    ]


# =============================================================================
# PRINT SETTINGS (Legacy compatibility - redirects to print-layout router)
# =============================================================================

DEFAULT_PRINT_SETTINGS = {
    'showHeader': True,
    'showTimes': True,
    'showLocation': True,
    'showDispatchInfo': True,
    'showSituationFound': True,
    'showExtentOfDamage': True,
    'showServicesProvided': True,
    'showNarrative': True,
    'showPersonnelGrid': True,
    'showEquipmentUsed': True,
    'showOfficerInfo': True,
    'showProblemsIssues': True,
    'showCadUnits': True,
    'showNerisInfo': False,
    'showWeather': True,
    'showCrossStreets': True,
    'showCallerInfo': False,
}


@router.get("/print")
async def get_print_settings(db: Session = Depends(get_db)):
    """Get legacy print settings (show/hide toggles)"""
    result = db.execute(
        text("SELECT key, value, value_type FROM settings WHERE category = 'print'")
    )
    
    settings = dict(DEFAULT_PRINT_SETTINGS)
    
    for row in result:
        key = row[0]
        value = _parse_value(row[1], row[2])
        if key in settings:
            settings[key] = value
    
    return settings


@router.put("/print")
async def update_print_settings(
    settings: dict,
    db: Session = Depends(get_db)
):
    """Update legacy print settings"""
    for key, value in settings.items():
        exists = db.execute(
            text("SELECT 1 FROM settings WHERE category = 'print' AND key = :key"),
            {"key": key}
        ).fetchone()
        
        value_str = str(value).lower() if isinstance(value, bool) else str(value)
        value_type = 'boolean' if isinstance(value, bool) else 'string'
        
        if exists:
            db.execute(
                text("UPDATE settings SET value = :value, updated_at = NOW() WHERE category = 'print' AND key = :key"),
                {"key": key, "value": value_str}
            )
        else:
            db.execute(
                text("INSERT INTO settings (category, key, value, value_type) VALUES ('print', :key, :value, :value_type)"),
                {"key": key, "value": value_str, "value_type": value_type}
            )
    
    db.commit()
    return {"status": "ok"}


# Legacy print/layout endpoint - redirects to new location
@router.get("/print/layout")
async def get_print_layout_legacy(db: Session = Depends(get_db)):
    """
    Legacy endpoint - use GET /api/print-layout instead.
    Kept for backward compatibility.
    """
    from report_engine.layout_config import get_layout
    return get_layout(db)


@router.put("/print/layout")
async def update_print_layout_legacy(
    layout: dict,
    db: Session = Depends(get_db)
):
    """
    Legacy endpoint - use PUT /api/print-layout instead.
    Kept for backward compatibility.
    """
    from report_engine.layout_config import validate_layout
    
    errors = validate_layout(layout)
    if errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Invalid layout", "errors": errors}
        )
    
    layout_json = json.dumps(layout)
    
    exists = db.execute(
        text("SELECT 1 FROM settings WHERE category = 'print' AND key = 'layout'")
    ).fetchone()
    
    if exists:
        db.execute(
            text("UPDATE settings SET value = :value, value_type = 'json', updated_at = NOW() WHERE category = 'print' AND key = 'layout'"),
            {"value": layout_json}
        )
    else:
        db.execute(
            text("INSERT INTO settings (category, key, value, value_type, description) VALUES ('print', 'layout', :value, 'json', 'Print layout configuration V4')"),
            {"value": layout_json}
        )
    
    db.commit()
    return {"status": "ok", "message": "Layout saved successfully"}


@router.post("/print/layout/reset")
async def reset_print_layout_legacy(db: Session = Depends(get_db)):
    """
    Legacy endpoint - use POST /api/print-layout/reset instead.
    """
    db.execute(text("DELETE FROM settings WHERE category = 'print' AND key = 'layout'"))
    db.commit()
    return {"status": "ok", "message": "Layout reset to defaults"}


# =============================================================================
# BRANDING LEGACY ENDPOINTS (Kept for backward compatibility)
# Use /api/branding for new code
# =============================================================================

class LogoUpload(BaseModel):
    data: str
    filename: Optional[str] = None
    mime_type: Optional[str] = "image/png"


@router.get("/branding/logo")
async def get_branding_logo_legacy(db: Session = Depends(get_db)):
    """Legacy endpoint - use GET /api/branding/logo instead."""
    result = db.execute(
        text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo'")
    ).fetchone()
    
    if not result or not result[0]:
        return {"has_logo": False, "data": None, "mime_type": None}
    
    mime_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo_mime_type'")
    ).fetchone()
    mime_type = mime_result[0] if mime_result else "image/png"
    
    return {"has_logo": True, "data": result[0], "mime_type": mime_type}


@router.post("/branding/logo")
async def upload_branding_logo_legacy(
    logo: LogoUpload,
    db: Session = Depends(get_db)
):
    """Legacy endpoint - use POST /api/branding/logo instead."""
    import base64
    
    if not logo.data:
        raise HTTPException(status_code=400, detail="No image data provided")
    
    data = logo.data
    if data.startswith('data:'):
        try:
            header, data = data.split(',', 1)
            if 'image/png' in header:
                logo.mime_type = 'image/png'
            elif 'image/jpeg' in header or 'image/jpg' in header:
                logo.mime_type = 'image/jpeg'
            elif 'image/gif' in header:
                logo.mime_type = 'image/gif'
            elif 'image/webp' in header:
                logo.mime_type = 'image/webp'
        except:
            pass
    
    try:
        decoded = base64.b64decode(data)
        if decoded[:8].startswith(b'\x89PNG'):
            logo.mime_type = 'image/png'
        elif decoded[:2] == b'\xff\xd8':
            logo.mime_type = 'image/jpeg'
        elif decoded[:6] in (b'GIF87a', b'GIF89a'):
            logo.mime_type = 'image/gif'
        elif decoded[:4] == b'RIFF':
            logo.mime_type = 'image/webp'
        else:
            raise HTTPException(status_code=400, detail="Invalid image format")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 data")
    
    _upsert_setting(db, 'branding', 'logo', data)
    _upsert_setting(db, 'branding', 'logo_mime_type', logo.mime_type)
    db.commit()
    
    return {"status": "ok", "message": "Logo uploaded successfully"}


@router.delete("/branding/logo")
async def delete_branding_logo_legacy(db: Session = Depends(get_db)):
    """Legacy endpoint - use DELETE /api/branding/logo instead."""
    db.execute(text(
        "DELETE FROM settings WHERE category = 'branding' AND key IN ('logo', 'logo_mime_type')"
    ))
    db.commit()
    return {"status": "ok", "message": "Logo deleted"}


# =============================================================================
# GENERIC SETTING GET/PUT
# =============================================================================

@router.get("/{category}/{key}")
async def get_setting(
    category: str,
    key: str,
    db: Session = Depends(get_db)
):
    """Get a single setting"""
    result = db.execute(
        text("""
            SELECT id, category, key, value, value_type, description
            FROM settings
            WHERE category = :category AND key = :key
        """),
        {"category": category, "key": key}
    ).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    return {
        "id": result[0],
        "category": result[1],
        "key": result[2],
        "value": _parse_value(result[3], result[4]),
        "raw_value": result[3],
        "value_type": result[4],
        "description": result[5],
    }


@router.put("/{category}/{key}")
async def update_setting(
    category: str,
    key: str,
    data: SettingUpdate,
    db: Session = Depends(get_db)
):
    """Update a setting value (creates if not exists)"""
    result = db.execute(
        text("""
            UPDATE settings 
            SET value = :value, updated_at = CURRENT_TIMESTAMP
            WHERE category = :category AND key = :key
            RETURNING id
        """),
        {"category": category, "key": key, "value": data.value}
    )
    row = result.fetchone()
    
    if not row:
        result = db.execute(
            text("""
                INSERT INTO settings (category, key, value, value_type)
                VALUES (:category, :key, :value, 'string')
                RETURNING id
            """),
            {"category": category, "key": key, "value": data.value}
        )
        row = result.fetchone()
    
    db.commit()
    return {"status": "ok", "id": row[0]}


@router.post("")
async def create_setting(
    data: SettingCreate,
    db: Session = Depends(get_db)
):
    """Create a new setting"""
    try:
        result = db.execute(
            text("""
                INSERT INTO settings (category, key, value, value_type, description)
                VALUES (:category, :key, :value, :value_type, :description)
                RETURNING id
            """),
            {
                "category": data.category,
                "key": data.key,
                "value": data.value,
                "value_type": data.value_type,
                "description": data.description,
            }
        )
        db.commit()
        return {"status": "ok", "id": result.fetchone()[0]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Setting already exists or invalid: {e}")


@router.delete("/{category}/{key}")
async def delete_setting(
    category: str,
    key: str,
    db: Session = Depends(get_db)
):
    """Delete a setting"""
    result = db.execute(
        text("DELETE FROM settings WHERE category = :category AND key = :key RETURNING id"),
        {"category": category, "key": key}
    )
    db.commit()
    
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Setting not found")
    
    return {"status": "ok"}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _parse_value(value: str, value_type: str) -> Any:
    """Parse string value to appropriate type"""
    if value is None:
        return None
    
    if value_type == 'number':
        try:
            if '.' in value:
                return float(value)
            return int(value)
        except:
            return value
    elif value_type == 'boolean':
        return value.lower() in ('true', '1', 'yes')
    elif value_type == 'json':
        try:
            return json.loads(value)
        except:
            return value
    return value


def _upsert_setting(db: Session, category: str, key: str, value: str) -> None:
    """Insert or update a setting."""
    exists = db.execute(
        text("SELECT 1 FROM settings WHERE category = :cat AND key = :key"),
        {"cat": category, "key": key}
    ).fetchone()
    
    if exists:
        db.execute(
            text("UPDATE settings SET value = :value, updated_at = NOW() WHERE category = :cat AND key = :key"),
            {"cat": category, "key": key, "value": value}
        )
    else:
        db.execute(
            text("INSERT INTO settings (category, key, value, value_type) VALUES (:cat, :key, :value, 'string')"),
            {"cat": category, "key": key, "value": value}
        )


# =============================================================================
# CONVENIENCE FUNCTIONS (for use by other modules)
# =============================================================================

def get_setting_value(db: Session, category: str, key: str, default: Any = None) -> Any:
    """Get a setting value with type conversion"""
    result = db.execute(
        text("SELECT value, value_type FROM settings WHERE category = :cat AND key = :key"),
        {"cat": category, "key": key}
    ).fetchone()
    
    if not result:
        return default
    
    return _parse_value(result[0], result[1])


def get_station_coords(db: Session) -> tuple:
    """Get station coordinates for weather lookup"""
    lat = get_setting_value(db, 'station', 'latitude', 40.0977)
    lon = get_setting_value(db, 'station', 'longitude', -75.7833)
    return (float(lat), float(lon))


# =============================================================================
# AV ALERTS SETTINGS
# =============================================================================

# Default AV alert settings
DEFAULT_AV_ALERTS = {
    # Master controls
    'enabled': True,                          # Master enable for department
    'tts_enabled': True,                      # Allow TTS department-wide
    
    # Sound file paths
    'dispatch_fire_sound': '/sounds/dispatch-fire.mp3',
    'dispatch_ems_sound': '/sounds/dispatch-ems.mp3',
    'close_sound': '/sounds/close.mp3',
    
    # TTS field order - ordered list of fields to include in announcement
    # Available: units, call_type, subtype, box, address, cross_streets, municipality, development
    'tts_field_order': ['units', 'call_type', 'address'],
    
    # TTS voice settings
    'tts_speed': 1.1,       # Speech rate: 0.8 (fast) to 1.5 (slow), 1.0 = normal
    'tts_pause_style': 'normal',  # 'minimal', 'normal', 'dramatic' - pause duration between sections
    
    # Settings version for cache invalidation
    'settings_version': 0,
}


@router.get("/av-alerts")
async def get_av_alerts_settings(db: Session = Depends(get_db)):
    """
    Get AV alerts settings.
    Returns defaults merged with any custom values.
    """
    result = db.execute(
        text("SELECT key, value, value_type FROM settings WHERE category = 'av_alerts'")
    )
    
    settings = dict(DEFAULT_AV_ALERTS)
    
    for row in result:
        key = row[0]
        value = _parse_value(row[1], row[2])
        if key in settings:
            settings[key] = value
    
    return settings


@router.put("/av-alerts")
async def update_av_alerts_settings(
    settings: dict,
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Update AV alerts settings.
    Only updates keys that are in the allowed list.
    Increments settings_version on any change for cache invalidation.
    """
    allowed_keys = set(DEFAULT_AV_ALERTS.keys())
    changes_made = False
    
    for key, value in settings.items():
        if key not in allowed_keys or key == 'settings_version':
            continue
        
        # Determine value type
        if isinstance(value, bool):
            value_str = str(value).lower()
            value_type = 'boolean'
        elif isinstance(value, int):
            value_str = str(value)
            value_type = 'number'
        elif isinstance(value, list):
            # Handle array values (like tts_field_order)
            value_str = json.dumps(value)
            value_type = 'json'
        else:
            value_str = str(value)
            value_type = 'string'
        
        exists = db.execute(
            text("SELECT value FROM settings WHERE category = 'av_alerts' AND key = :key"),
            {"key": key}
        ).fetchone()
        
        if exists:
            if exists[0] != value_str:
                changes_made = True
            db.execute(
                text("UPDATE settings SET value = :value, value_type = :vtype, updated_at = NOW() WHERE category = 'av_alerts' AND key = :key"),
                {"key": key, "value": value_str, "vtype": value_type}
            )
        else:
            changes_made = True
            db.execute(
                text("INSERT INTO settings (category, key, value, value_type) VALUES ('av_alerts', :key, :value, :vtype)"),
                {"key": key, "value": value_str, "vtype": value_type}
            )
    
    # Increment settings_version if changes were made (for cache busting)
    if changes_made:
        version_result = db.execute(
            text("SELECT value FROM settings WHERE category = 'av_alerts' AND key = 'settings_version'")
        ).fetchone()
        new_version = int(version_result[0]) + 1 if version_result else 1
        _upsert_setting(db, 'av_alerts', 'settings_version', str(new_version))
        
        # Broadcast settings_updated to all clients
        try:
            from routers.websocket import broadcast_av_alert
            from database import _extract_slug
            
            tenant_slug = "glenmoorefc"
            if request:
                host = request.headers.get('host', '')
                tenant_slug = _extract_slug(host) or "glenmoorefc"
            
            await broadcast_av_alert(tenant_slug, {
                "type": "settings_updated",
                "settings_version": new_version,
            })
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to broadcast settings_updated: {e}")
    
    db.commit()
    return {"status": "ok", "changes_made": changes_made}


@router.post("/av-alerts/upload-sound")
async def upload_av_alert_sound(
    sound_type: str,  # 'dispatch_fire', 'dispatch_ems', 'close'
    data: dict,       # {"data": "base64...", "filename": "alert.mp3"}
    db: Session = Depends(get_db),
    request: Request = None,
):
    """
    Upload a custom sound file for AV alerts.
    Stores as base64 in settings (simple approach for small audio files).
    Broadcasts sound_updated message to all connected StationBells via WebSocket.
    """
    import base64
    
    valid_types = ['dispatch_fire', 'dispatch_ems', 'close']
    if sound_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid sound type. Must be one of: {valid_types}")
    
    sound_data = data.get('data', '')
    filename = data.get('filename', f'{sound_type}.mp3')
    
    if not sound_data:
        raise HTTPException(status_code=400, detail="No audio data provided")
    
    # Strip data URL prefix if present
    if sound_data.startswith('data:'):
        try:
            _, sound_data = sound_data.split(',', 1)
        except:
            pass
    
    # Validate it's valid base64
    try:
        decoded = base64.b64decode(sound_data)
        # Basic check for audio file signatures
        # MP3: starts with ID3 or 0xFF 0xFB
        # WAV: starts with RIFF
        # OGG: starts with OggS
        valid_audio = (
            decoded[:3] == b'ID3' or
            decoded[:2] == b'\xff\xfb' or
            decoded[:2] == b'\xff\xfa' or
            decoded[:4] == b'RIFF' or
            decoded[:4] == b'OggS' or
            decoded[:4] == b'fLaC'  # FLAC
        )
        if not valid_audio:
            raise HTTPException(status_code=400, detail="Invalid audio format. Supported: MP3, WAV, OGG, FLAC")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 data")
    
    # Store the sound data
    sound_key = f'{sound_type}_sound_data'
    _upsert_setting(db, 'av_alerts', sound_key, sound_data)
    
    # Store filename for reference
    filename_key = f'{sound_type}_sound_filename'
    _upsert_setting(db, 'av_alerts', filename_key, filename)
    
    # Update the sound path to indicate custom sound
    path_key = f'{sound_type}_sound'
    _upsert_setting(db, 'av_alerts', path_key, f'/api/settings/av-alerts/sound/{sound_type}')
    
    db.commit()
    
    # Broadcast sound_updated to all connected StationBells via WebSocket
    # This notifies ESP32 devices to re-download the updated sound file
    try:
        from routers.websocket import broadcast_av_alert
        from database import _extract_slug
        
        # Extract tenant from request host header
        tenant_slug = "glenmoorefc"  # Default
        if request:
            host = request.headers.get('host', '')
            tenant_slug = _extract_slug(host) or "glenmoorefc"
        
        await broadcast_av_alert(tenant_slug, {
            "type": "sound_updated",
            "sound_type": sound_type,
            "path": f'/api/settings/av-alerts/sound/{sound_type}',
            "filename": filename,
        })
    except Exception as e:
        # Don't fail the upload if broadcast fails
        import logging
        logging.getLogger(__name__).warning(f"Failed to broadcast sound_updated: {e}")
    
    return {
        "status": "ok",
        "message": f"Uploaded {filename} for {sound_type}",
        "path": f'/api/settings/av-alerts/sound/{sound_type}'
    }


@router.get("/av-alerts/sound/{sound_type}")
async def get_av_alert_sound(
    sound_type: str,
    db: Session = Depends(get_db)
):
    """
    Get a custom sound file.
    Returns the audio data as a downloadable file.
    """
    import base64
    from fastapi.responses import Response
    
    valid_types = ['dispatch_fire', 'dispatch_ems', 'close']
    if sound_type not in valid_types:
        raise HTTPException(status_code=400, detail="Invalid sound type")
    
    # Get stored sound data
    sound_key = f'{sound_type}_sound_data'
    result = db.execute(
        text("SELECT value FROM settings WHERE category = 'av_alerts' AND key = :key"),
        {"key": sound_key}
    ).fetchone()
    
    if not result or not result[0]:
        raise HTTPException(status_code=404, detail="Custom sound not found")
    
    # Get filename
    filename_key = f'{sound_type}_sound_filename'
    filename_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'av_alerts' AND key = :key"),
        {"key": filename_key}
    ).fetchone()
    filename = filename_result[0] if filename_result else f'{sound_type}.mp3'
    
    # Decode and return
    try:
        audio_data = base64.b64decode(result[0])
    except:
        raise HTTPException(status_code=500, detail="Failed to decode audio data")
    
    # Determine content type from filename
    content_type = 'audio/mpeg'  # default to MP3
    if filename.endswith('.wav'):
        content_type = 'audio/wav'
    elif filename.endswith('.ogg'):
        content_type = 'audio/ogg'
    elif filename.endswith('.flac'):
        content_type = 'audio/flac'
    
    return Response(
        content=audio_data,
        media_type=content_type,
        headers={
            'Content-Disposition': f'inline; filename="{filename}"',
            'Cache-Control': 'public, max-age=86400',  # Cache for 1 day
        }
    )


@router.delete("/av-alerts/sound/{sound_type}")
async def delete_av_alert_sound(
    sound_type: str,
    db: Session = Depends(get_db)
):
    """
    Delete a custom sound file, reverting to default.
    """
    valid_types = ['dispatch_fire', 'dispatch_ems', 'close']
    if sound_type not in valid_types:
        raise HTTPException(status_code=400, detail="Invalid sound type")
    
    # Delete sound data and filename
    db.execute(
        text("DELETE FROM settings WHERE category = 'av_alerts' AND key IN (:data_key, :filename_key)"),
        {"data_key": f'{sound_type}_sound_data', "filename_key": f'{sound_type}_sound_filename'}
    )
    
    # Reset path to default
    default_path = DEFAULT_AV_ALERTS.get(f'{sound_type}_sound', f'/sounds/{sound_type}.mp3')
    _upsert_setting(db, 'av_alerts', f'{sound_type}_sound', default_path)
    
    db.commit()
    
    return {"status": "ok", "message": f"Reverted {sound_type} to default sound"}


# =============================================================================
# CAD IMPORT SETTINGS
# =============================================================================

"""
CAD Import Settings - Controls how incoming CAD data is processed.

PURPOSE OF force_category:
    Many fire departments only run one type of call (e.g., fire-only or EMS-only).
    Rather than relying on keyword-based auto-detection (which may misclassify),
    departments can force ALL incoming CAD imports to a single category.

    NERIS Consideration:
        This setting affects the operational call_category used for:
        - IncidentList filtering (FIRE/EMS/DETAIL tabs)
        - Incident numbering sequences (separate sequences per category)
        - Station-level workflow routing

        It does NOT affect NERIS classification, which is set separately via
        neris_incident_type_codes[] during runsheet completion. A department
        can force all CAD imports to 'FIRE' operationally while still classifying
        individual incidents as MEDICAL, RESCUE, etc. for federal NERIS reporting.

    Options:
        - null: Auto-detect based on CAD event type keywords (MEDICAL→EMS, else→FIRE)
        - "FIRE": Force all CAD imports to FIRE category
        - "EMS": Force all CAD imports to EMS category
"""

DEFAULT_CAD_SETTINGS = {
    # force_category: Override auto-detection of call category from CAD event type
    # null = auto-detect (MEDICAL→EMS, else→FIRE), "FIRE" or "EMS" = force that category
    'force_category': None,
}


@router.get("/cad")
async def get_cad_settings(db: Session = Depends(get_db)):
    """
    Get CAD import settings.
    Returns defaults merged with any custom values stored in database.
    """
    result = db.execute(
        text("SELECT key, value, value_type FROM settings WHERE category = 'cad'")
    )
    
    settings = dict(DEFAULT_CAD_SETTINGS)
    
    for row in result:
        key = row[0]
        value = _parse_value(row[1], row[2])
        if key in settings:
            settings[key] = value
    
    return settings


@router.put("/cad")
async def update_cad_settings(
    settings: dict,
    db: Session = Depends(get_db)
):
    """
    Update CAD import settings.
    Only updates keys that are in the allowed list.
    """
    allowed_keys = set(DEFAULT_CAD_SETTINGS.keys())
    
    for key, value in settings.items():
        if key not in allowed_keys:
            continue
        
        # Handle null/None values - store as empty string, parse back as None
        if value is None or value == '' or value == 'null':
            value_str = ''
            value_type = 'string'
        else:
            value_str = str(value)
            value_type = 'string'
        
        exists = db.execute(
            text("SELECT 1 FROM settings WHERE category = 'cad' AND key = :key"),
            {"key": key}
        ).fetchone()
        
        if exists:
            db.execute(
                text("UPDATE settings SET value = :value, value_type = :vtype, updated_at = NOW() WHERE category = 'cad' AND key = :key"),
                {"key": key, "value": value_str, "vtype": value_type}
            )
        else:
            db.execute(
                text("INSERT INTO settings (category, key, value, value_type) VALUES ('cad', :key, :value, :vtype)"),
                {"key": key, "value": value_str, "vtype": value_type}
            )
    
    db.commit()
    return {"status": "ok"}


# =============================================================================
# FEATURE FLAGS
# =============================================================================

# Default feature flag settings
DEFAULT_FEATURES = {
    'allow_incident_duplication': False,  # Admin-only incident duplication feature
}


@router.get("/features")
async def get_features(db: Session = Depends(get_db)):
    """
    Get all feature flags.
    Returns defaults merged with any custom values.
    """
    result = db.execute(
        text("SELECT key, value, value_type FROM settings WHERE category = 'features'")
    )
    
    features = dict(DEFAULT_FEATURES)
    
    for row in result:
        key = row[0]
        value = _parse_value(row[1], row[2])
        if key in features:
            features[key] = value
    
    return features


@router.put("/features")
async def update_features(
    features: dict,
    db: Session = Depends(get_db)
):
    """
    Update feature flags.
    Only updates keys that are in the allowed list.
    """
    allowed_keys = set(DEFAULT_FEATURES.keys())
    
    for key, value in features.items():
        if key not in allowed_keys:
            continue
        
        # Determine value type
        if isinstance(value, bool):
            value_str = str(value).lower()
            value_type = 'boolean'
        else:
            value_str = str(value)
            value_type = 'string'
        
        exists = db.execute(
            text("SELECT 1 FROM settings WHERE category = 'features' AND key = :key"),
            {"key": key}
        ).fetchone()
        
        if exists:
            db.execute(
                text("UPDATE settings SET value = :value, value_type = :vtype, updated_at = NOW() WHERE category = 'features' AND key = :key"),
                {"key": key, "value": value_str, "vtype": value_type}
            )
        else:
            db.execute(
                text("INSERT INTO settings (category, key, value, value_type) VALUES ('features', :key, :value, :vtype)"),
                {"key": key, "value": value_str, "vtype": value_type}
            )
    
    db.commit()
    return {"status": "ok"}
