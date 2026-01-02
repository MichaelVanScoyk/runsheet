"""
Branding Router - Tenant branding configuration

Handles logo upload, colors, styles, and other branding settings.
Each tenant has their own branding stored in their settings table.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
import base64

from database import get_db
from report_engine.branding_config import DEFAULT_BRANDING, get_branding

router = APIRouter()


class LogoUpload(BaseModel):
    data: str
    filename: Optional[str] = None
    mime_type: Optional[str] = "image/png"


class BrandingUpdate(BaseModel):
    station_name: Optional[str] = None
    station_number: Optional[str] = None
    station_short_name: Optional[str] = None
    tagline: Optional[str] = None
    
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    text_color: Optional[str] = None
    muted_color: Optional[str] = None
    
    font_family: Optional[str] = None
    header_font_size: Optional[str] = None
    body_font_size: Optional[str] = None
    small_font_size: Optional[str] = None
    
    header_style: Optional[str] = None
    border_style: Optional[str] = None
    badge_style: Optional[str] = None
    
    logo_position: Optional[str] = None
    logo_size: Optional[str] = None
    
    footer_left: Optional[str] = None
    footer_center: Optional[str] = None
    footer_right: Optional[str] = None
    show_cad_in_footer: Optional[bool] = None
    
    watermark_text: Optional[str] = None
    watermark_opacity: Optional[float] = None


@router.get("")
async def get_branding_config(db: Session = Depends(get_db)):
    branding = get_branding(db)
    result = dict(branding)
    result.pop('logo_data', None)
    return result


@router.get("/theme")
async def get_ui_theme(db: Session = Depends(get_db)):
    """
    Get all UI theming data in a single call.
    Used by frontend BrandingContext to apply tenant colors app-wide.
    Includes logo as data URL for immediate use.
    """
    branding = get_branding(db)
    
    # Build logo data URL if available
    logo_url = None
    if branding.get('logo_data'):
        mime = branding.get('logo_mime_type', 'image/png')
        logo_url = f"data:{mime};base64,{branding['logo_data']}"
    
    return {
        # Identity
        "station_name": branding.get('station_name', 'Fire Department'),
        "station_number": branding.get('station_number', ''),
        "station_short_name": branding.get('station_short_name', ''),
        
        # Logo
        "logo_url": logo_url,
        
        # Colors - these become CSS variables
        "primary_color": branding.get('primary_color', '#016a2b'),
        "secondary_color": branding.get('secondary_color', '#eeee01'),
        "text_color": branding.get('text_color', '#1a1a1a'),
        "muted_color": branding.get('muted_color', '#666666'),
        
        # Derived colors (computed for convenience)
        "primary_hover": _darken_color(branding.get('primary_color', '#016a2b'), 15),
        "primary_light": _lighten_color(branding.get('primary_color', '#016a2b'), 90),
    }


def _darken_color(hex_color: str, percent: int) -> str:
    """Darken a hex color by a percentage."""
    try:
        hex_color = hex_color.lstrip('#')
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        
        factor = (100 - percent) / 100
        r = int(r * factor)
        g = int(g * factor)
        b = int(b * factor)
        
        return f"#{r:02x}{g:02x}{b:02x}"
    except:
        return hex_color


def _lighten_color(hex_color: str, percent: int) -> str:
    """Lighten a hex color by a percentage (toward white)."""
    try:
        hex_color = hex_color.lstrip('#')
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        
        factor = percent / 100
        r = int(r + (255 - r) * factor)
        g = int(g + (255 - g) * factor)
        b = int(b + (255 - b) * factor)
        
        return f"#{r:02x}{g:02x}{b:02x}"
    except:
        return hex_color


@router.put("")
async def update_branding_config(updates: BrandingUpdate, db: Session = Depends(get_db)):
    field_mappings = {
        'station_name': ('station', 'name'),
        'station_number': ('station', 'number'),
        'station_short_name': ('station', 'short_name'),
        'tagline': ('station', 'tagline'),
        'primary_color': ('branding', 'primary_color'),
        'secondary_color': ('branding', 'secondary_color'),
        'text_color': ('branding', 'text_color'),
        'muted_color': ('branding', 'muted_color'),
        'font_family': ('branding', 'font_family'),
        'header_font_size': ('branding', 'header_font_size'),
        'body_font_size': ('branding', 'body_font_size'),
        'small_font_size': ('branding', 'small_font_size'),
        'header_style': ('branding', 'header_style'),
        'border_style': ('branding', 'border_style'),
        'badge_style': ('branding', 'badge_style'),
        'logo_position': ('branding', 'logo_position'),
        'logo_size': ('branding', 'logo_size'),
        'footer_left': ('branding', 'footer_left'),
        'footer_center': ('branding', 'footer_center'),
        'footer_right': ('branding', 'footer_right'),
        'show_cad_in_footer': ('branding', 'show_cad_in_footer'),
        'watermark_text': ('branding', 'watermark_text'),
        'watermark_opacity': ('branding', 'watermark_opacity'),
    }
    
    updates_dict = updates.dict(exclude_none=True)
    
    for field, value in updates_dict.items():
        if field in field_mappings:
            category, key = field_mappings[field]
            _upsert_setting(db, category, key, value)
    
    db.commit()
    return {"status": "ok", "updated": list(updates_dict.keys())}


@router.post("/reset")
async def reset_branding(db: Session = Depends(get_db)):
    db.execute(text("""
        DELETE FROM settings 
        WHERE category = 'branding' 
        AND key NOT IN ('logo', 'logo_mime_type')
    """))
    db.execute(text("""
        UPDATE settings SET value = '' 
        WHERE category = 'station' AND key IN ('tagline')
    """))
    db.commit()
    return {"status": "ok", "message": "Branding reset to defaults"}


@router.get("/logo")
async def get_branding_logo(db: Session = Depends(get_db)):
    result = db.execute(
        text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo'")
    ).fetchone()
    
    if not result or not result[0]:
        return {"has_logo": False, "data": None, "mime_type": None}
    
    mime_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo_mime_type'")
    ).fetchone()
    
    return {
        "has_logo": True,
        "data": result[0],
        "mime_type": mime_result[0] if mime_result else "image/png"
    }


@router.post("/logo")
async def upload_branding_logo(logo: LogoUpload, db: Session = Depends(get_db)):
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
    
    return {"status": "ok", "message": "Logo uploaded successfully", "mime_type": logo.mime_type}


@router.delete("/logo")
async def delete_branding_logo(db: Session = Depends(get_db)):
    db.execute(text(
        "DELETE FROM settings WHERE category = 'branding' AND key IN ('logo', 'logo_mime_type')"
    ))
    db.commit()
    return {"status": "ok", "message": "Logo deleted"}


def _upsert_setting(db: Session, category: str, key: str, value) -> None:
    if isinstance(value, bool):
        value_str = 'true' if value else 'false'
        value_type = 'boolean'
    elif isinstance(value, (int, float)):
        value_str = str(value)
        value_type = 'number'
    else:
        value_str = str(value) if value is not None else ''
        value_type = 'string'
    
    exists = db.execute(
        text("SELECT 1 FROM settings WHERE category = :cat AND key = :key"),
        {"cat": category, "key": key}
    ).fetchone()
    
    if exists:
        db.execute(
            text("UPDATE settings SET value = :value, updated_at = NOW() WHERE category = :cat AND key = :key"),
            {"cat": category, "key": key, "value": value_str}
        )
    else:
        db.execute(
            text("INSERT INTO settings (category, key, value, value_type) VALUES (:cat, :key, :value, :value_type)"),
            {"cat": category, "key": key, "value": value_str, "value_type": value_type}
        )
