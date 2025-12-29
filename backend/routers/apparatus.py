"""
Apparatus router - manage run sheet apparatus/units

Supports unified unit management with categories:
- APPARATUS: Physical CAD units (engines, trucks, chief vehicles) - configurable crew slots and response time counting
- DIRECT: Virtual unit for personnel going directly to scene (POV)
- STATION: Virtual unit for personnel who reported to the station (not on scene)

Chief vehicles (CHF48, ASST48, DEP48) are APPARATUS with 0 crew slots and counts_for_response_times=false.
The chief person gets assigned to DIRECT.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel

from database import get_db
from models import Apparatus

router = APIRouter()

# Valid unit categories
# APPARATUS = Physical CAD units (engines, trucks, chief vehicles) - configurable crew slots
# DIRECT = Virtual unit for personnel going directly to scene (POV)
# STATION = Virtual unit for personnel who reported to the station (not on scene)
UNIT_CATEGORIES = ['APPARATUS', 'DIRECT', 'STATION']


class ApparatusCreate(BaseModel):
    unit_designator: str
    name: str
    apparatus_type: Optional[str] = None
    neris_unit_type: Optional[str] = None
    is_virtual: bool = False  # DEPRECATED - use unit_category
    unit_category: str = 'APPARATUS'
    counts_for_response_times: Optional[bool] = None  # None = use category default
    cad_unit_id: Optional[str] = None
    cad_unit_aliases: Optional[List[str]] = []  # Alternate CAD identifiers
    has_driver: bool = True
    has_officer: bool = True
    ff_slots: int = 4
    display_order: Optional[int] = 100


class ApparatusUpdate(BaseModel):
    unit_designator: Optional[str] = None
    name: Optional[str] = None
    apparatus_type: Optional[str] = None
    neris_unit_type: Optional[str] = None
    unit_category: Optional[str] = None
    counts_for_response_times: Optional[bool] = None
    cad_unit_id: Optional[str] = None
    cad_unit_aliases: Optional[List[str]] = None  # Alternate CAD identifiers
    has_driver: Optional[bool] = None
    has_officer: Optional[bool] = None
    ff_slots: Optional[int] = None
    display_order: Optional[int] = None
    active: Optional[bool] = None


def apparatus_to_dict(a: Apparatus) -> dict:
    """Convert Apparatus model to dict for API response"""
    category = getattr(a, 'unit_category', 'APPARATUS')
    return {
        "id": a.id,
        "unit_designator": a.unit_designator,
        "name": a.name,
        "apparatus_type": a.apparatus_type,
        "neris_unit_type": a.neris_unit_type,
        "is_virtual": a.is_virtual,  # DEPRECATED but kept for backward compat
        "unit_category": category,
        "counts_for_response_times": getattr(a, 'counts_for_response_times', True),
        "cad_unit_id": getattr(a, 'cad_unit_id', a.unit_designator),
        "cad_unit_aliases": getattr(a, 'cad_unit_aliases', []) or [],
        "has_driver": a.has_driver,
        "has_officer": a.has_officer,
        "ff_slots": a.ff_slots,
        "display_order": a.display_order,
        "active": a.active,
        # Computed properties
        "is_physical_unit": category == 'APPARATUS',
        "is_on_scene": category in ('APPARATUS', 'DIRECT'),
        "exports_to_neris": category == 'APPARATUS',
    }


@router.get("")
async def list_apparatus(
    active_only: bool = True,
    include_virtual: bool = True,
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    List all apparatus/units for run sheet.
    
    Parameters:
    - active_only: Only return active units (default: true)
    - include_virtual: Include DIRECT/STATION units (default: true) - DEPRECATED, use category filter
    - category: Filter by unit_category (APPARATUS, DIRECT, STATION)
    """
    query = db.query(Apparatus)
    
    if active_only:
        query = query.filter(Apparatus.active == True)
    
    # Filter by category if specified
    if category:
        if category.upper() not in UNIT_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {UNIT_CATEGORIES}")
        query = query.filter(Apparatus.unit_category == category.upper())
    elif not include_virtual:
        # Legacy filter - exclude DIRECT/STATION (only show physical units)
        query = query.filter(Apparatus.unit_category == 'APPARATUS')
    
    apparatus = query.order_by(Apparatus.display_order).all()
    
    return [apparatus_to_dict(a) for a in apparatus]


@router.get("/categories")
async def list_categories():
    """
    Get available unit categories with descriptions.
    
    Returns list of category definitions for UI.
    """
    return [
        {
            "value": "APPARATUS",
            "label": "Apparatus",
            "description": "Physical CAD units (engines, trucks, chief vehicles) - configurable crew slots and response time counting",
            "is_physical": True,
            "is_on_scene": True,
            "exports_to_neris": True,
            "default_counts_for_response": True,
        },
        {
            "value": "DIRECT",
            "label": "Direct (POV to Scene)",
            "description": "Personnel going directly to scene in personal vehicles",
            "is_physical": False,
            "is_on_scene": True,
            "exports_to_neris": False,
            "default_counts_for_response": False,
        },
        {
            "value": "STATION",
            "label": "Station",
            "description": "Personnel who reported to the station (not on scene)",
            "is_physical": False,
            "is_on_scene": False,
            "exports_to_neris": False,
            "default_counts_for_response": False,
        },
    ]


@router.get("/lookup")
async def lookup_apparatus(
    unit_id: str,
    db: Session = Depends(get_db)
):
    """
    Look up apparatus/unit by CAD unit ID.
    
    Used by CAD listener to resolve unit info from CAD identifiers.
    Searches: unit_designator, cad_unit_id, cad_unit_aliases
    
    Returns unit info needed for CAD processing:
    - unit_designator: Canonical identifier
    - apparatus_id: Database ID
    - category: Unit category (APPARATUS, DIRECT, STATION)
    - is_ours: Whether this is our department's unit
    - counts_for_response_times: Whether to include in response metrics
    """
    # Normalize input
    unit_id_upper = unit_id.upper().strip()
    
    # Search by unit_designator first (exact match)
    apparatus = db.query(Apparatus).filter(
        Apparatus.unit_designator == unit_id_upper,
        Apparatus.active == True
    ).first()
    
    # Search by cad_unit_id if not found
    if not apparatus:
        apparatus = db.query(Apparatus).filter(
            Apparatus.cad_unit_id == unit_id_upper,
            Apparatus.active == True
        ).first()
    
    # Search by cad_unit_aliases if not found
    if not apparatus:
        all_apparatus = db.query(Apparatus).filter(Apparatus.active == True).all()
        for a in all_apparatus:
            aliases = getattr(a, 'cad_unit_aliases', []) or []
            if unit_id_upper in [alias.upper() for alias in aliases]:
                apparatus = a
                break
    
    if apparatus:
        category = getattr(apparatus, 'unit_category', 'APPARATUS')
        return {
            'unit_designator': apparatus.unit_designator,
            'apparatus_id': apparatus.id,
            'category': category,
            'is_ours': True,  # Found in our apparatus table = our unit
            'counts_for_response_times': getattr(apparatus, 'counts_for_response_times', True),
        }
    else:
        # Unknown unit - treat as mutual aid
        return {
            'unit_designator': unit_id_upper,
            'apparatus_id': None,
            'category': None,
            'is_ours': False,
            'counts_for_response_times': False,
        }


@router.get("/{id}")
async def get_apparatus(id: int, db: Session = Depends(get_db)):
    """Get single apparatus/unit by ID"""
    apparatus = db.query(Apparatus).filter(Apparatus.id == id).first()
    
    if not apparatus:
        raise HTTPException(status_code=404, detail="Apparatus not found")
    
    return apparatus_to_dict(apparatus)


@router.post("")
async def create_apparatus(
    data: ApparatusCreate,
    db: Session = Depends(get_db)
):
    """Create new apparatus/unit"""
    existing = db.query(Apparatus).filter(
        Apparatus.unit_designator == data.unit_designator
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Unit designator already exists")
    
    # Validate category
    if data.unit_category.upper() not in UNIT_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {UNIT_CATEGORIES}")
    
    category = data.unit_category.upper()
    
    # Determine counts_for_response_times default based on category
    if data.counts_for_response_times is None:
        counts_for_response = category == 'APPARATUS'  # Only APPARATUS counts by default
    else:
        # DIRECT/STATION never count, override any user input
        if category in ('DIRECT', 'STATION'):
            counts_for_response = False
        else:
            counts_for_response = data.counts_for_response_times
    
    # Set is_virtual based on category for backward compatibility
    is_virtual = category in ('DIRECT', 'STATION')
    
    apparatus = Apparatus(
        unit_designator=data.unit_designator,
        name=data.name,
        apparatus_type=data.apparatus_type,
        neris_unit_type=data.neris_unit_type,
        is_virtual=is_virtual,
        unit_category=category,
        counts_for_response_times=counts_for_response,
        cad_unit_id=data.cad_unit_id or data.unit_designator,
        cad_unit_aliases=data.cad_unit_aliases or [],
        has_driver=data.has_driver,
        has_officer=data.has_officer,
        ff_slots=data.ff_slots,
        display_order=data.display_order,
    )
    
    db.add(apparatus)
    db.commit()
    db.refresh(apparatus)
    
    return {"id": apparatus.id, "status": "ok"}


@router.put("/{id}")
async def update_apparatus(
    id: int,
    data: ApparatusUpdate,
    db: Session = Depends(get_db)
):
    """Update apparatus/unit"""
    apparatus = db.query(Apparatus).filter(Apparatus.id == id).first()
    
    if not apparatus:
        raise HTTPException(status_code=404, detail="Apparatus not found")
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Validate category if being updated
    if 'unit_category' in update_data:
        if update_data['unit_category'].upper() not in UNIT_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {UNIT_CATEGORIES}")
        update_data['unit_category'] = update_data['unit_category'].upper()
        
        # Update is_virtual for backward compatibility
        update_data['is_virtual'] = update_data['unit_category'] in ('DIRECT', 'STATION')
        
        # Force counts_for_response_times = false for DIRECT/STATION
        if update_data['unit_category'] in ('DIRECT', 'STATION'):
            update_data['counts_for_response_times'] = False
    
    # If counts_for_response_times is being set on a DIRECT/STATION unit, ignore it
    current_category = update_data.get('unit_category', getattr(apparatus, 'unit_category', 'APPARATUS'))
    if 'counts_for_response_times' in update_data and current_category in ('DIRECT', 'STATION'):
        update_data['counts_for_response_times'] = False
    
    for field, value in update_data.items():
        setattr(apparatus, field, value)
    
    db.commit()
    
    return {"id": id, "status": "ok"}


@router.delete("/{id}")
async def delete_apparatus(id: int, db: Session = Depends(get_db)):
    """Deactivate apparatus/unit (soft delete)"""
    apparatus = db.query(Apparatus).filter(Apparatus.id == id).first()
    
    if not apparatus:
        raise HTTPException(status_code=404, detail="Apparatus not found")
    
    apparatus.active = False
    db.commit()
    
    return {"id": id, "status": "ok"}


@router.post("/{id}/reactivate")
async def reactivate_apparatus(id: int, db: Session = Depends(get_db)):
    """Reactivate a previously deactivated apparatus/unit"""
    apparatus = db.query(Apparatus).filter(Apparatus.id == id).first()
    
    if not apparatus:
        raise HTTPException(status_code=404, detail="Apparatus not found")
    
    apparatus.active = True
    db.commit()
    
    return {"id": id, "status": "ok"}


@router.delete("/{id}/permanent")
async def hard_delete_apparatus(id: int, db: Session = Depends(get_db)):
    """Permanently delete apparatus/unit from database"""
    apparatus = db.query(Apparatus).filter(Apparatus.id == id).first()
    
    if not apparatus:
        raise HTTPException(status_code=404, detail="Apparatus not found")
    
    db.delete(apparatus)
    db.commit()
    
    return {"id": id, "status": "deleted"}
