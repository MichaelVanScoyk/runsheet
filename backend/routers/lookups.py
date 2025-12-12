"""
Lookups router - NERIS codes and municipalities
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel

from database import get_db

router = APIRouter()


# ============================================================================
# PYDANTIC SCHEMAS
# ============================================================================

class MunicipalityCreate(BaseModel):
    code: str
    name: Optional[str] = None
    display_name: Optional[str] = None
    subdivision_type: Optional[str] = 'Township'

class MunicipalityUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    subdivision_type: Optional[str] = None
    active: Optional[bool] = None


# ============================================================================
# NERIS LOOKUPS
# ============================================================================

@router.get("/neris/incident-types")
async def get_incident_types(db: Session = Depends(get_db)):
    """Get all NERIS incident type codes"""
    result = db.execute(text("SELECT code, description, category FROM neris_incident_types ORDER BY code"))
    return [{"code": r[0], "description": r[1], "category": r[2], "display": f"{r[0]} - {r[1]}"} for r in result]


@router.get("/neris/incident-types/by-category")
async def get_incident_types_by_category(db: Session = Depends(get_db)):
    """Get NERIS incident types grouped by category"""
    result = db.execute(text("SELECT code, description, category FROM neris_incident_types ORDER BY category, code"))
    grouped = {}
    for r in result:
        cat = r[2] or 'Other'
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append({"code": r[0], "description": r[1], "display": f"{r[0]} - {r[1]}"})
    return grouped


@router.get("/neris/property-uses")
async def get_property_uses(db: Session = Depends(get_db)):
    """Get all NERIS property use codes"""
    result = db.execute(text("SELECT code, description, category FROM neris_property_uses ORDER BY code"))
    return [{"code": r[0], "description": r[1], "category": r[2], "display": f"{r[0]} - {r[1]}"} for r in result]


@router.get("/neris/property-uses/by-category")
async def get_property_uses_by_category(db: Session = Depends(get_db)):
    """Get NERIS property uses grouped by category"""
    result = db.execute(text("SELECT code, description, category FROM neris_property_uses ORDER BY category, code"))
    grouped = {}
    for r in result:
        cat = r[2] or 'Other'
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append({"code": r[0], "description": r[1], "display": f"{r[0]} - {r[1]}"})
    return grouped


@router.get("/neris/actions-taken")
async def get_actions_taken(db: Session = Depends(get_db)):
    """Get all NERIS actions taken codes"""
    result = db.execute(text("SELECT code, description, category FROM neris_actions_taken ORDER BY code"))
    return [{"code": r[0], "description": r[1], "category": r[2], "display": f"{r[0]} - {r[1]}"} for r in result]


@router.get("/neris/actions-taken/by-category")
async def get_actions_taken_by_category(db: Session = Depends(get_db)):
    """Get NERIS actions taken grouped by category"""
    result = db.execute(text("SELECT code, description, category FROM neris_actions_taken ORDER BY category, code"))
    grouped = {}
    for r in result:
        cat = r[2] or 'Other'
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append({"code": r[0], "description": r[1], "display": f"{r[0]} - {r[1]}"})
    return grouped


# ============================================================================
# MUNICIPALITIES - Enhanced with display names
# ============================================================================

@router.get("/municipalities")
async def get_municipalities(
    include_inactive: bool = False,
    db: Session = Depends(get_db)
):
    """Get all municipalities with display names"""
    if include_inactive:
        query = """
            SELECT id, code, name, 
                   COALESCE(display_name, name, code) as display_name,
                   COALESCE(subdivision_type, 'Township') as subdivision_type,
                   COALESCE(auto_created, false) as auto_created,
                   COALESCE(active, true) as active
            FROM municipalities 
            ORDER BY display_name
        """
    else:
        query = """
            SELECT id, code, name, 
                   COALESCE(display_name, name, code) as display_name,
                   COALESCE(subdivision_type, 'Township') as subdivision_type,
                   COALESCE(auto_created, false) as auto_created,
                   COALESCE(active, true) as active
            FROM municipalities 
            WHERE COALESCE(active, true) = true
            ORDER BY display_name
        """
    
    result = db.execute(text(query))
    return [
        {
            "id": r[0],
            "code": r[1],
            "name": r[2],
            "display_name": r[3],
            "subdivision_type": r[4],
            "auto_created": r[5],
            "active": r[6],
        }
        for r in result
    ]


@router.get("/municipalities/{code}")
async def get_municipality_by_code(
    code: str,
    db: Session = Depends(get_db)
):
    """Get a single municipality by CAD code"""
    result = db.execute(
        text("""
            SELECT id, code, name, 
                   COALESCE(display_name, name, code) as display_name,
                   COALESCE(subdivision_type, 'Township') as subdivision_type,
                   COALESCE(auto_created, false) as auto_created,
                   COALESCE(active, true) as active
            FROM municipalities 
            WHERE code = :code
        """),
        {"code": code.upper()}
    ).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="Municipality not found")
    
    return {
        "id": result[0],
        "code": result[1],
        "name": result[2],
        "display_name": result[3],
        "subdivision_type": result[4],
        "auto_created": result[5],
        "active": result[6],
    }


@router.post("/municipalities")
async def create_municipality(
    data: MunicipalityCreate,
    db: Session = Depends(get_db)
):
    """Create a new municipality"""
    code = data.code.upper().strip()
    
    # Check if exists
    existing = db.execute(
        text("SELECT id FROM municipalities WHERE code = :code"),
        {"code": code}
    ).fetchone()
    
    if existing:
        raise HTTPException(status_code=400, detail="Municipality with this code already exists")
    
    display_name = data.display_name or data.name or code
    name = data.name or display_name
    
    result = db.execute(
        text("""
            INSERT INTO municipalities (code, name, display_name, subdivision_type, auto_created, active)
            VALUES (:code, :name, :display_name, :subdivision_type, false, true)
            RETURNING id
        """),
        {
            "code": code,
            "name": name,
            "display_name": display_name,
            "subdivision_type": data.subdivision_type or 'Township',
        }
    )
    db.commit()
    new_id = result.fetchone()[0]
    
    return {"id": new_id, "code": code, "display_name": display_name}


@router.put("/municipalities/{municipality_id}")
async def update_municipality(
    municipality_id: int,
    data: MunicipalityUpdate,
    db: Session = Depends(get_db)
):
    """Update a municipality"""
    # Build update query dynamically
    updates = []
    params = {"id": municipality_id}
    
    if data.name is not None:
        updates.append("name = :name")
        params["name"] = data.name
    
    if data.display_name is not None:
        updates.append("display_name = :display_name")
        params["display_name"] = data.display_name
        # Also update name to keep in sync
        if data.name is None:
            updates.append("name = :display_name")
    
    if data.subdivision_type is not None:
        updates.append("subdivision_type = :subdivision_type")
        params["subdivision_type"] = data.subdivision_type
    
    if data.active is not None:
        updates.append("active = :active")
        params["active"] = data.active
    
    # Mark as no longer auto-created once edited
    updates.append("auto_created = false")
    updates.append("updated_at = CURRENT_TIMESTAMP")
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    query = f"UPDATE municipalities SET {', '.join(updates)} WHERE id = :id"
    result = db.execute(text(query), params)
    db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Municipality not found")
    
    return {"status": "ok", "id": municipality_id}


@router.delete("/municipalities/{municipality_id}")
async def delete_municipality(
    municipality_id: int,
    db: Session = Depends(get_db)
):
    """Soft delete (deactivate) a municipality"""
    result = db.execute(
        text("UPDATE municipalities SET active = false, updated_at = CURRENT_TIMESTAMP WHERE id = :id"),
        {"id": municipality_id}
    )
    db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Municipality not found")
    
    return {"status": "ok", "id": municipality_id}


@router.post("/municipalities/auto-create")
async def auto_create_municipality(
    code: str,
    db: Session = Depends(get_db)
):
    """
    Auto-create a municipality from CAD code if it doesn't exist.
    Called internally when processing CAD data.
    Returns the municipality (existing or newly created).
    """
    code = code.upper().strip()
    
    # Check if exists
    existing = db.execute(
        text("""
            SELECT id, code, name, 
                   COALESCE(display_name, name, code) as display_name,
                   COALESCE(subdivision_type, 'Township') as subdivision_type
            FROM municipalities WHERE code = :code
        """),
        {"code": code}
    ).fetchone()
    
    if existing:
        return {
            "id": existing[0],
            "code": existing[1],
            "name": existing[2],
            "display_name": existing[3],
            "subdivision_type": existing[4],
            "created": False,
        }
    
    # Create new with auto_created = true
    result = db.execute(
        text("""
            INSERT INTO municipalities (code, name, display_name, subdivision_type, auto_created, active)
            VALUES (:code, :code, :code, 'Township', true, true)
            RETURNING id
        """),
        {"code": code}
    )
    db.commit()
    new_id = result.fetchone()[0]
    
    return {
        "id": new_id,
        "code": code,
        "name": code,
        "display_name": code,
        "subdivision_type": "Township",
        "created": True,
    }


# ============================================================================
# SETTINGS
# ============================================================================

@router.get("/settings/{key}")
async def get_setting(
    key: str,
    db: Session = Depends(get_db)
):
    """Get a station setting by key"""
    result = db.execute(
        text("SELECT setting_value FROM station_settings WHERE setting_key = :key"),
        {"key": key}
    ).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    return {"key": key, "value": result[0]}


@router.put("/settings/{key}")
async def update_setting(
    key: str,
    value: str,
    db: Session = Depends(get_db)
):
    """Update a station setting"""
    result = db.execute(
        text("""
            INSERT INTO station_settings (setting_key, setting_value, updated_at)
            VALUES (:key, :value, CURRENT_TIMESTAMP)
            ON CONFLICT (setting_key) DO UPDATE SET 
                setting_value = :value,
                updated_at = CURRENT_TIMESTAMP
        """),
        {"key": key, "value": value}
    )
    db.commit()
    
    return {"key": key, "value": value}
