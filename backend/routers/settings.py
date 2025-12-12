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
            "updated_at": row[6].isoformat() if row[6] else None,
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
            "updated_at": row[6].isoformat() if row[6] else None,
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
