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


# =============================================================================
# BRANDING / LOGO ENDPOINTS (must be before generic /{category}/{key} routes)
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
    
    # Validate it's valid base64 and detect actual mime type from bytes
    import base64
    try:
        decoded = base64.b64decode(data)
        # Detect actual mime type from magic bytes (not from data URL header)
        if decoded[:8].startswith(b'\x89PNG'):
            logo.mime_type = 'image/png'
        elif decoded[:2] == b'\xff\xd8':
            logo.mime_type = 'image/jpeg'
        elif decoded[:6] in (b'GIF87a', b'GIF89a'):
            logo.mime_type = 'image/gif'
        elif decoded[:4] == b'RIFF':
            logo.mime_type = 'image/webp'
        else:
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


# =============================================================================
# GENERIC SETTING GET/PUT (after specific routes)
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
    # Try update first
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
        # Setting doesn't exist, create it
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


# =============================================================================
# PRINT LAYOUT CONFIGURATION (v2 - Page-based block layout)
# =============================================================================

DEFAULT_PRINT_LAYOUT = {
    "version": 2,
    "blocks": [
        # PAGE 1 - Core incident info
        {
            "id": "header",
            "name": "Header",
            "description": "Logo, station name, incident #, CAD #, date, category",
            "enabled": True,
            "page": 1,
            "order": 1,
            "locked": True,
            "config": {
                "showLogo": True,
                "showIncidentNumber": True,
                "showCadNumber": True,
                "showDate": True,
                "showCategory": True
            }
        },
        {
            "id": "location",
            "name": "Location",
            "description": "Address, municipality, ESZ, cross streets",
            "enabled": True,
            "page": 1,
            "order": 2,
            "locked": False,
            "config": {
                "showAddress": True,
                "showMunicipality": True,
                "showEsz": True,
                "showCrossStreets": True
            }
        },
        {
            "id": "dispatchInfo",
            "name": "Dispatch Info",
            "description": "CAD type, subtype, units called",
            "enabled": True,
            "page": 1,
            "order": 3,
            "locked": False,
            "config": {
                "showCadType": True,
                "showCadSubtype": True,
                "showUnitsCalled": True
            }
        },
        {
            "id": "times",
            "name": "Response Times",
            "description": "Dispatched, enroute, on scene, under control, cleared, time in service",
            "enabled": True,
            "page": 1,
            "order": 4,
            "locked": False,
            "config": {
                "showDispatched": True,
                "showEnroute": True,
                "showOnScene": True,
                "showUnderControl": True,
                "showCleared": True,
                "showTimeInService": True
            }
        },
        {
            "id": "callerWeather",
            "name": "Caller & Weather",
            "description": "Caller name, phone, weather conditions",
            "enabled": True,
            "page": 1,
            "order": 5,
            "locked": False,
            "config": {
                "showCallerName": True,
                "showCallerPhone": True,
                "showWeather": True
            }
        },
        {
            "id": "narrative",
            "name": "Narrative",
            "description": "Situation found, services provided, narrative, problems",
            "enabled": True,
            "page": 1,
            "order": 6,
            "locked": False,
            "config": {
                "showSituationFound": True,
                "showExtentOfDamage": True,
                "showServicesProvided": True,
                "showNarrative": True,
                "showProblems": True,
                "overflowToPage2": True,
                "minHeight": 1.5,
                "maxHeight": 4.0
            }
        },
        {
            "id": "personnelGrid",
            "name": "Personnel Grid",
            "description": "Personnel assignments by apparatus",
            "enabled": True,
            "page": 1,
            "order": 7,
            "locked": False,
            "config": {
                "showRanks": True,
                "showOnlyResponded": False,
                "overflowToPage2": True
            }
        },
        {
            "id": "officers",
            "name": "Officers",
            "description": "Officer in Charge, Completed By",
            "enabled": True,
            "page": 1,
            "order": 8,
            "locked": False,
            "config": {
                "showOIC": True,
                "showCompletedBy": True
            }
        },
        # PAGE 2 - Extended details (optional)
        {
            "id": "damageAssessment",
            "name": "Damage Assessment",
            "description": "Property at risk, damages, injuries (FIRE only)",
            "enabled": True,
            "page": 2,
            "order": 1,
            "locked": False,
            "fireOnly": True,
            "config": {
                "showPropertyAtRisk": True,
                "showFireDamages": True,
                "showFFInjuries": True,
                "showCivilianInjuries": True
            }
        },
        {
            "id": "mutualAid",
            "name": "Mutual Aid",
            "description": "Aid direction, type, departments involved",
            "enabled": True,
            "page": 2,
            "order": 2,
            "locked": False,
            "config": {
                "showDirection": True,
                "showType": True,
                "showDepartments": True
            }
        },
        {
            "id": "cadUnitDetails",
            "name": "CAD Unit Details",
            "description": "Full unit timestamps table from CAD",
            "enabled": True,
            "page": 2,
            "order": 3,
            "locked": False,
            "config": {
                "showDispatchTime": True,
                "showEnrouteTime": True,
                "showArrivedTime": True,
                "showClearedTime": True,
                "showMutualAidFlag": True,
                "highlightFirstTimes": True
            }
        },
        {
            "id": "nerisClassification",
            "name": "NERIS - Classification",
            "description": "Incident types, location use, actions taken",
            "enabled": False,
            "page": 2,
            "order": 4,
            "locked": False,
            "fireOnly": True,
            "config": {
                "showIncidentTypes": True,
                "showLocationUse": True,
                "showActions": True,
                "showNoActionReason": True,
                "showPeoplePresent": True,
                "showDisplaced": True
            }
        },
        {
            "id": "nerisRiskReduction",
            "name": "NERIS - Risk Reduction",
            "description": "Smoke alarms, fire alarms, sprinklers",
            "enabled": False,
            "page": 2,
            "order": 5,
            "locked": False,
            "fireOnly": True,
            "config": {
                "showSmokeAlarms": True,
                "showFireAlarms": True,
                "showSprinklers": True,
                "showCookingSuppression": True
            }
        },
        {
            "id": "nerisEmergingHazards",
            "name": "NERIS - Emerging Hazards",
            "description": "EV/battery, solar PV, CSST gas lines",
            "enabled": False,
            "page": 2,
            "order": 6,
            "locked": False,
            "fireOnly": True,
            "config": {
                "showEvBattery": True,
                "showSolarPv": True,
                "showCsst": True
            }
        },
        {
            "id": "nerisExposures",
            "name": "NERIS - Exposures",
            "description": "Fire exposures to adjacent structures",
            "enabled": False,
            "page": 2,
            "order": 7,
            "locked": False,
            "fireOnly": True,
            "config": {}
        },
        {
            "id": "nerisFireModule",
            "name": "NERIS - Fire Module",
            "description": "Investigation, arrival conditions, damage, cause",
            "enabled": False,
            "page": 2,
            "order": 8,
            "locked": False,
            "fireOnly": True,
            "config": {
                "showInvestigation": True,
                "showArrivalConditions": True,
                "showStructureDamage": True,
                "showFloorRoom": True,
                "showCause": True
            }
        },
        {
            "id": "nerisMedicalModule",
            "name": "NERIS - Medical Module",
            "description": "Patient evaluation and care",
            "enabled": False,
            "page": 2,
            "order": 9,
            "locked": False,
            "config": {
                "showPatientCare": True
            }
        },
        {
            "id": "nerisHazmatModule",
            "name": "NERIS - Hazmat Module",
            "description": "Disposition, evacuations, chemicals",
            "enabled": False,
            "page": 2,
            "order": 10,
            "locked": False,
            "config": {
                "showDisposition": True,
                "showEvacuated": True,
                "showChemicals": True
            }
        },
        {
            "id": "nerisNarratives",
            "name": "NERIS - Narratives",
            "description": "Impedance and outcome narratives",
            "enabled": False,
            "page": 2,
            "order": 11,
            "locked": False,
            "fireOnly": True,
            "config": {
                "showImpedance": True,
                "showOutcome": True
            }
        },
        {
            "id": "footer",
            "name": "Footer",
            "description": "Station info, generation timestamp",
            "enabled": True,
            "page": 1,
            "order": 99,
            "locked": True,
            "config": {
                "showStationName": True,
                "showGeneratedTime": True
            }
        }
    ]
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


@router.get("/print/layout")
async def get_print_layout(db: Session = Depends(get_db)):
    """
    Get the print layout configuration (v2 page-based blocks).
    Returns stored layout or default if not configured.
    """
    result = db.execute(
        text("SELECT value FROM settings WHERE category = 'print' AND key = 'layout'")
    ).fetchone()
    
    if result and result[0]:
        try:
            layout = json.loads(result[0])
            # Merge with defaults to handle new blocks added after initial save
            return _merge_layout_with_defaults(layout)
        except json.JSONDecodeError:
            pass
    
    # Return default layout
    return dict(DEFAULT_PRINT_LAYOUT)


@router.put("/print/layout")
async def update_print_layout(
    layout: dict,
    db: Session = Depends(get_db)
):
    """
    Update the print layout configuration.
    Validates and stores the complete layout structure.
    """
    # Validate basic structure
    if "version" not in layout or "blocks" not in layout:
        raise HTTPException(status_code=400, detail="Invalid layout: missing version or blocks")
    
    if not isinstance(layout["blocks"], list):
        raise HTTPException(status_code=400, detail="Invalid layout: blocks must be a list")
    
    # Validate each block has required fields
    required_fields = ["id", "enabled", "page", "order"]
    for block in layout["blocks"]:
        for field in required_fields:
            if field not in block:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid block: missing '{field}' in block '{block.get('id', 'unknown')}'"
                )
        
        # Validate page is 1 or 2
        if block["page"] not in [1, 2]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid block: page must be 1 or 2 for block '{block['id']}'"
            )
        
        # Validate locked blocks stay on page 1
        if block.get("locked", False) and block["page"] != 1:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid block: locked block '{block['id']}' cannot be moved to page 2"
            )
    
    # Store as JSON
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
            text("INSERT INTO settings (category, key, value, value_type, description) VALUES ('print', 'layout', :value, 'json', 'Print layout configuration v2')"),
            {"value": layout_json}
        )
    
    db.commit()
    return {"status": "ok", "message": "Layout saved successfully"}


@router.post("/print/layout/reset")
async def reset_print_layout(db: Session = Depends(get_db)):
    """
    Reset print layout to defaults.
    Deletes stored layout, causing default to be returned on next GET.
    """
    db.execute(
        text("DELETE FROM settings WHERE category = 'print' AND key = 'layout'")
    )
    db.commit()
    return {"status": "ok", "message": "Layout reset to defaults"}


def _merge_layout_with_defaults(stored_layout: dict) -> dict:
    """
    Merge stored layout with defaults to handle new blocks.
    Preserves user's settings while adding any new default blocks.
    """
    result = dict(stored_layout)
    result["version"] = DEFAULT_PRINT_LAYOUT["version"]
    
    # Get IDs of stored blocks
    stored_ids = {b["id"] for b in result.get("blocks", [])}
    
    # Add any new default blocks that don't exist in stored layout
    for default_block in DEFAULT_PRINT_LAYOUT["blocks"]:
        if default_block["id"] not in stored_ids:
            # Add new block with default disabled to not surprise users
            new_block = dict(default_block)
            new_block["enabled"] = False
            result["blocks"].append(new_block)
    
    return result


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


def get_print_layout(db: Session) -> dict:
    """
    Get print layout configuration for use by report generators.
    Returns stored layout merged with defaults, or default layout.
    """
    result = db.execute(
        text("SELECT value FROM settings WHERE category = 'print' AND key = 'layout'")
    ).fetchone()
    
    if result and result[0]:
        try:
            layout = json.loads(result[0])
            return _merge_layout_with_defaults(layout)
        except json.JSONDecodeError:
            pass
    
    return dict(DEFAULT_PRINT_LAYOUT)


def get_page_blocks(db: Session, page: int, call_category: str = 'FIRE') -> list:
    """
    Get enabled blocks for a specific page, filtered by call category.
    Returns blocks sorted by order.
    
    Args:
        db: Database session
        page: Page number (1 or 2)
        call_category: 'FIRE' or 'EMS' - filters fireOnly blocks
    
    Returns:
        List of block configs for the specified page
    """
    layout = get_print_layout(db)
    blocks = []
    
    for block in layout.get('blocks', []):
        # Skip disabled blocks
        if not block.get('enabled', True):
            continue
        
        # Skip if not on requested page
        if block.get('page') != page:
            continue
        
        # Skip fireOnly blocks for EMS calls
        if block.get('fireOnly', False) and call_category != 'FIRE':
            continue
        
        blocks.append(block)
    
    # Sort by order
    blocks.sort(key=lambda b: b.get('order', 99))
    
    return blocks

