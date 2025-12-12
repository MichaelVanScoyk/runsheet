"""
Apparatus router - manage run sheet apparatus
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel

from database import get_db
from models import Apparatus

router = APIRouter()


class ApparatusCreate(BaseModel):
    unit_designator: str
    name: str
    apparatus_type: Optional[str] = None
    is_virtual: bool = False
    has_driver: bool = True
    has_officer: bool = True
    ff_slots: int = 4
    display_order: Optional[int] = 100


class ApparatusUpdate(BaseModel):
    name: Optional[str] = None
    apparatus_type: Optional[str] = None
    has_driver: Optional[bool] = None
    has_officer: Optional[bool] = None
    ff_slots: Optional[int] = None
    display_order: Optional[int] = None
    active: Optional[bool] = None


@router.get("")
async def list_apparatus(
    active_only: bool = True,
    include_virtual: bool = True,
    db: Session = Depends(get_db)
):
    """List all apparatus for run sheet"""
    query = db.query(Apparatus)
    
    if active_only:
        query = query.filter(Apparatus.active == True)
    
    if not include_virtual:
        query = query.filter(Apparatus.is_virtual == False)
    
    apparatus = query.order_by(Apparatus.display_order).all()
    
    return [
        {
            "id": a.id,
            "unit_designator": a.unit_designator,
            "name": a.name,
            "apparatus_type": a.apparatus_type,
            "is_virtual": a.is_virtual,
            "has_driver": a.has_driver,
            "has_officer": a.has_officer,
            "ff_slots": a.ff_slots,
            "display_order": a.display_order,
            "active": a.active,
        }
        for a in apparatus
    ]


@router.get("/{id}")
async def get_apparatus(id: int, db: Session = Depends(get_db)):
    """Get single apparatus"""
    apparatus = db.query(Apparatus).filter(Apparatus.id == id).first()
    
    if not apparatus:
        raise HTTPException(status_code=404, detail="Apparatus not found")
    
    return {
        "id": apparatus.id,
        "unit_designator": apparatus.unit_designator,
        "name": apparatus.name,
        "apparatus_type": apparatus.apparatus_type,
        "is_virtual": apparatus.is_virtual,
        "has_driver": apparatus.has_driver,
        "has_officer": apparatus.has_officer,
        "ff_slots": apparatus.ff_slots,
        "display_order": apparatus.display_order,
        "active": apparatus.active,
    }


@router.post("")
async def create_apparatus(
    data: ApparatusCreate,
    db: Session = Depends(get_db)
):
    """Create new apparatus"""
    existing = db.query(Apparatus).filter(
        Apparatus.unit_designator == data.unit_designator
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Unit designator already exists")
    
    apparatus = Apparatus(
        unit_designator=data.unit_designator,
        name=data.name,
        apparatus_type=data.apparatus_type,
        is_virtual=data.is_virtual,
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
    """Update apparatus"""
    apparatus = db.query(Apparatus).filter(Apparatus.id == id).first()
    
    if not apparatus:
        raise HTTPException(status_code=404, detail="Apparatus not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(apparatus, field, value)
    
    db.commit()
    
    return {"id": id, "status": "ok"}


@router.delete("/{id}")
async def delete_apparatus(id: int, db: Session = Depends(get_db)):
    """Deactivate apparatus"""
    apparatus = db.query(Apparatus).filter(Apparatus.id == id).first()
    
    if not apparatus:
        raise HTTPException(status_code=404, detail="Apparatus not found")
    
    apparatus.active = False
    db.commit()
    
    return {"id": id, "status": "ok"}
