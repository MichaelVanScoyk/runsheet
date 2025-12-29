"""
Settings router - Runtime configuration from database
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List, Any
from datetime import datetime, timezone
from pydantic import BaseModel
import json

from database import get_db

# Import UTC formatting helper
try:
    from settings_helper import format_utc_iso
except ImportError:
    # Fallback if settings_helper not available (shouldn't happen)
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
    """Update a setting value"""
    result = db.execute(
        text("""
            UPDATE settings 
            SET value = :value, updated_at = CURRENT_TIMESTAMP
            WHERE category = :category AND key = :key
            RETURNING id
        """),
        {"category": category, "key": key, "value": data.value}
    )
    db.commit()
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Setting not found")
    
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


# =============================================================================
# PRINT SETTINGS HELPERS
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
    """Get print settings as a combined object"""
    result = db.execute(
        text("SELECT key, value, value_type FROM settings WHERE category = 'print'")
    )
    
    settings = dict(DEFAULT_PRINT_SETTINGS)  # Start with defaults
    
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
    """Update print settings"""
    for key, value in settings.items():
        # Check if setting exists
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


# =============================================================================
# CONVENIENCE GETTERS (for use by other modules)
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


def get_station_units(db: Session) -> List[str]:
    """Get list of station unit IDs"""
    value = get_setting_value(db, 'units', 'station_units', [])
    if isinstance(value, list):
        return value
    return []


def is_station_unit(db: Session, unit_id: str) -> bool:
    """Check if unit belongs to this station"""
    units = get_station_units(db)
    return unit_id.upper() in [u.upper() for u in units]


def get_station_coords(db: Session) -> tuple:
    """Get station coordinates for weather lookup"""
    lat = get_setting_value(db, 'station', 'latitude', 40.0977)
    lon = get_setting_value(db, 'station', 'longitude', -75.7833)
    return (float(lat), float(lon))


# =============================================================================
# BRANDING / LOGO ENDPOINTS
# =============================================================================

class LogoUpload(BaseModel):
    """Logo upload payload - base64 encoded image"""
    data: str  # base64 encoded image data
    filename: Optional[str] = None
    mime_type: Optional[str] = "image/png"


@router.get("/branding/logo")
async def get_branding_logo(db: Session = Depends(get_db)):
    """Get the tenant's logo as base64"""
    result = db.execute(
        text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo'")
    ).fetchone()
    
    if not result or not result[0]:
        return {"has_logo": False, "data": None, "mime_type": None}
    
    # Get mime type
    mime_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo_mime_type'")
    ).fetchone()
    mime_type = mime_result[0] if mime_result else "image/png"
    
    return {
        "has_logo": True,
        "data": result[0],
        "mime_type": mime_type
    }


@router.post("/branding/logo")
async def upload_branding_logo(
    logo: LogoUpload,
    db: Session = Depends(get_db)
):
    """Upload/update the tenant's logo"""
    # Validate base64 data
    if not logo.data:
        raise HTTPException(status_code=400, detail="No image data provided")
    
    # Strip data URL prefix if present (e.g., "data:image/png;base64,")
    data = logo.data
    if data.startswith('data:'):
        # Extract mime type and data
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
    
    # Validate it's valid base64
    import base64
    try:
        decoded = base64.b64decode(data)
        # Basic image validation - check for common headers
        if not (decoded[:8].startswith(b'\x89PNG') or  # PNG
                decoded[:2] == b'\xff\xd8' or          # JPEG
                decoded[:6] in (b'GIF87a', b'GIF89a') or # GIF
                decoded[:4] == b'RIFF'):                # WebP
            raise HTTPException(status_code=400, detail="Invalid image format. Supported: PNG, JPEG, GIF, WebP")
    except Exception as e:
        if "Invalid image format" in str(e):
            raise
        raise HTTPException(status_code=400, detail="Invalid base64 data")
    
    # Upsert logo data
    exists = db.execute(
        text("SELECT 1 FROM settings WHERE category = 'branding' AND key = 'logo'")
    ).fetchone()
    
    if exists:
        db.execute(
            text("UPDATE settings SET value = :value, updated_at = NOW() WHERE category = 'branding' AND key = 'logo'"),
            {"value": data}
        )
    else:
        db.execute(
            text("INSERT INTO settings (category, key, value, value_type, description) VALUES ('branding', 'logo', :value, 'string', 'Tenant logo (base64)')"),
            {"value": data}
        )
    
    # Upsert mime type
    mime_exists = db.execute(
        text("SELECT 1 FROM settings WHERE category = 'branding' AND key = 'logo_mime_type'")
    ).fetchone()
    
    if mime_exists:
        db.execute(
            text("UPDATE settings SET value = :value, updated_at = NOW() WHERE category = 'branding' AND key = 'logo_mime_type'"),
            {"value": logo.mime_type}
        )
    else:
        db.execute(
            text("INSERT INTO settings (category, key, value, value_type, description) VALUES ('branding', 'logo_mime_type', :value, 'string', 'Logo MIME type')"),
            {"value": logo.mime_type}
        )
    
    db.commit()
    
    return {"status": "ok", "message": "Logo uploaded successfully"}


@router.delete("/branding/logo")
async def delete_branding_logo(db: Session = Depends(get_db)):
    """Delete the tenant's logo"""
    db.execute(text("DELETE FROM settings WHERE category = 'branding' AND key IN ('logo', 'logo_mime_type')"))
    db.commit()
    return {"status": "ok", "message": "Logo deleted"}
