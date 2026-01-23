"""
Detail Types Router - CRUD for configurable attendance event types

Manages the detail_types lookup table for DETAIL category incidents:
- Meeting, Worknight, Training, Drill, Other (defaults)
- Tenants can add/edit/deactivate their own types
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import List, Optional

from database import get_db

router = APIRouter()


# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class DetailTypeCreate(BaseModel):
    code: str
    display_name: str
    display_order: Optional[int] = 100

class DetailTypeUpdate(BaseModel):
    display_name: Optional[str] = None
    display_order: Optional[int] = None
    active: Optional[bool] = None

class DetailTypeResponse(BaseModel):
    id: int
    code: str
    display_name: str
    display_order: int
    active: bool


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("", response_model=List[DetailTypeResponse])
async def get_detail_types(
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """Get all detail types, optionally filtered to active only."""
    if active_only:
        query = text("""
            SELECT id, code, display_name, display_order, active
            FROM detail_types
            WHERE active = true
            ORDER BY display_order, display_name
        """)
    else:
        query = text("""
            SELECT id, code, display_name, display_order, active
            FROM detail_types
            ORDER BY display_order, display_name
        """)
    
    result = db.execute(query)
    return [
        DetailTypeResponse(
            id=row[0],
            code=row[1],
            display_name=row[2],
            display_order=row[3],
            active=row[4]
        )
        for row in result
    ]


@router.get("/{detail_type_id}", response_model=DetailTypeResponse)
async def get_detail_type(
    detail_type_id: int,
    db: Session = Depends(get_db)
):
    """Get a single detail type by ID."""
    result = db.execute(
        text("""
            SELECT id, code, display_name, display_order, active
            FROM detail_types
            WHERE id = :id
        """),
        {"id": detail_type_id}
    ).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="Detail type not found")
    
    return DetailTypeResponse(
        id=result[0],
        code=result[1],
        display_name=result[2],
        display_order=result[3],
        active=result[4]
    )


@router.post("", response_model=DetailTypeResponse)
async def create_detail_type(
    data: DetailTypeCreate,
    db: Session = Depends(get_db)
):
    """Create a new detail type."""
    # Check for duplicate code
    existing = db.execute(
        text("SELECT id FROM detail_types WHERE UPPER(code) = UPPER(:code)"),
        {"code": data.code}
    ).fetchone()
    
    if existing:
        raise HTTPException(status_code=400, detail=f"Detail type with code '{data.code}' already exists")
    
    # Normalize code to uppercase
    code = data.code.upper().replace(" ", "_")
    
    result = db.execute(
        text("""
            INSERT INTO detail_types (code, display_name, display_order)
            VALUES (:code, :display_name, :display_order)
            RETURNING id, code, display_name, display_order, active
        """),
        {
            "code": code,
            "display_name": data.display_name,
            "display_order": data.display_order
        }
    )
    db.commit()
    
    row = result.fetchone()
    return DetailTypeResponse(
        id=row[0],
        code=row[1],
        display_name=row[2],
        display_order=row[3],
        active=row[4]
    )


@router.put("/{detail_type_id}", response_model=DetailTypeResponse)
async def update_detail_type(
    detail_type_id: int,
    data: DetailTypeUpdate,
    db: Session = Depends(get_db)
):
    """Update a detail type."""
    # Check exists
    existing = db.execute(
        text("SELECT id FROM detail_types WHERE id = :id"),
        {"id": detail_type_id}
    ).fetchone()
    
    if not existing:
        raise HTTPException(status_code=404, detail="Detail type not found")
    
    # Build update query dynamically
    updates = []
    params = {"id": detail_type_id}
    
    if data.display_name is not None:
        updates.append("display_name = :display_name")
        params["display_name"] = data.display_name
    
    if data.display_order is not None:
        updates.append("display_order = :display_order")
        params["display_order"] = data.display_order
    
    if data.active is not None:
        updates.append("active = :active")
        params["active"] = data.active
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    query = text(f"""
        UPDATE detail_types
        SET {', '.join(updates)}
        WHERE id = :id
        RETURNING id, code, display_name, display_order, active
    """)
    
    result = db.execute(query, params)
    db.commit()
    
    row = result.fetchone()
    return DetailTypeResponse(
        id=row[0],
        code=row[1],
        display_name=row[2],
        display_order=row[3],
        active=row[4]
    )


@router.delete("/{detail_type_id}")
async def delete_detail_type(
    detail_type_id: int,
    db: Session = Depends(get_db)
):
    """
    Soft-delete a detail type by setting active=false.
    Does not actually delete to preserve historical references.
    """
    existing = db.execute(
        text("SELECT id, code FROM detail_types WHERE id = :id"),
        {"id": detail_type_id}
    ).fetchone()
    
    if not existing:
        raise HTTPException(status_code=404, detail="Detail type not found")
    
    # Check if in use
    in_use = db.execute(
        text("SELECT COUNT(*) FROM incidents WHERE detail_type = :code"),
        {"code": existing[1]}
    ).fetchone()[0]
    
    db.execute(
        text("UPDATE detail_types SET active = false WHERE id = :id"),
        {"id": detail_type_id}
    )
    db.commit()
    
    return {
        "success": True,
        "message": f"Detail type deactivated" + (f" ({in_use} incidents still reference it)" if in_use else "")
    }
