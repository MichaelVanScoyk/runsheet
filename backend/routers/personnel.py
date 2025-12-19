"""
Personnel router - manage run sheet personnel
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel

from database import get_db
from models import Personnel, Rank

router = APIRouter()


class PersonnelCreate(BaseModel):
    first_name: str
    last_name: str
    rank_id: Optional[int] = None
    dashboard_id: Optional[int] = None  # Link to Dashboard if syncing


class PersonnelUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    rank_id: Optional[int] = None
    active: Optional[bool] = None


@router.get("")
async def list_personnel(
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """List all personnel, grouped by rank"""
    query = db.query(Personnel)
    
    if active_only:
        query = query.filter(Personnel.active == True)
    
    personnel = query.all()
    
    # Get ranks for sorting
    ranks = {r.id: r for r in db.query(Rank).all()}
    
    result = []
    for p in personnel:
        rank = ranks.get(p.rank_id)
        result.append({
            "id": p.id,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "display_name": f"{p.last_name}, {p.first_name}",
            "rank_id": p.rank_id,
            "rank_name": rank.rank_name if rank else None,
            "rank_abbreviation": rank.abbreviation if rank else None,
            "rank_order": rank.display_order if rank else 999,
            "active": p.active,
            "dashboard_id": p.dashboard_id,
        })
    
    # Sort by rank order, then last name
    result.sort(key=lambda x: (x["rank_order"], x["last_name"]))
    
    return result


@router.get("/by-rank")
async def personnel_by_rank(
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """Get personnel grouped by rank for dropdown"""
    personnel = await list_personnel(active_only, db)
    
    grouped = {}
    for p in personnel:
        rank = p["rank_name"] or "Unassigned"
        if rank not in grouped:
            grouped[rank] = []
        grouped[rank].append({
            "id": p["id"],
            "display_name": p["display_name"],
            "first_name": p["first_name"],
            "last_name": p["last_name"],
        })
    
    return grouped


@router.get("/ranks")
async def list_ranks(
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """List all ranks"""
    query = db.query(Rank)
    
    if active_only:
        query = query.filter(Rank.active == True)
    
    ranks = query.order_by(Rank.display_order).all()
    
    return [
        {
            "id": r.id,
            "rank_name": r.rank_name,
            "abbreviation": r.abbreviation,
            "display_order": r.display_order,
            "active": r.active,
        }
        for r in ranks
    ]


# =============================================================================
# RANKS CRUD
# =============================================================================

class RankCreate(BaseModel):
    rank_name: str
    abbreviation: Optional[str] = None
    display_order: int = 100


class RankUpdate(BaseModel):
    rank_name: Optional[str] = None
    abbreviation: Optional[str] = None
    display_order: Optional[int] = None
    active: Optional[bool] = None


@router.post("/ranks")
async def create_rank(
    data: RankCreate,
    db: Session = Depends(get_db)
):
    """Create a new rank"""
    rank = Rank(
        rank_name=data.rank_name,
        abbreviation=data.abbreviation,
        display_order=data.display_order,
    )
    db.add(rank)
    db.commit()
    db.refresh(rank)
    return {"id": rank.id, "status": "ok"}


@router.put("/ranks/{rank_id}")
async def update_rank(
    rank_id: int,
    data: RankUpdate,
    db: Session = Depends(get_db)
):
    """Update a rank"""
    rank = db.query(Rank).filter(Rank.id == rank_id).first()
    
    if not rank:
        raise HTTPException(status_code=404, detail="Rank not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rank, field, value)
    
    db.commit()
    return {"id": rank_id, "status": "ok"}


@router.delete("/ranks/{rank_id}")
async def delete_rank(
    rank_id: int,
    db: Session = Depends(get_db)
):
    """Deactivate a rank"""
    rank = db.query(Rank).filter(Rank.id == rank_id).first()
    
    if not rank:
        raise HTTPException(status_code=404, detail="Rank not found")
    
    # Check if any personnel use this rank
    personnel_count = db.query(Personnel).filter(Personnel.rank_id == rank_id).count()
    if personnel_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete rank - {personnel_count} personnel assigned"
        )
    
    rank.active = False
    db.commit()
    return {"id": rank_id, "status": "ok"}


@router.get("/{id}")
async def get_personnel(id: int, db: Session = Depends(get_db)):
    """Get single personnel"""
    person = db.query(Personnel).filter(Personnel.id == id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    rank = None
    if person.rank_id:
        rank = db.query(Rank).filter(Rank.id == person.rank_id).first()
    
    return {
        "id": person.id,
        "first_name": person.first_name,
        "last_name": person.last_name,
        "display_name": f"{person.last_name}, {person.first_name}",
        "rank_id": person.rank_id,
        "rank_name": rank.rank_name if rank else None,
        "active": person.active,
        "dashboard_id": person.dashboard_id,
    }


@router.post("")
async def create_personnel(
    data: PersonnelCreate,
    db: Session = Depends(get_db)
):
    """Create new personnel"""
    person = Personnel(
        first_name=data.first_name,
        last_name=data.last_name,
        rank_id=data.rank_id,
        dashboard_id=data.dashboard_id,
    )
    
    db.add(person)
    db.commit()
    db.refresh(person)
    
    return {"id": person.id, "status": "ok"}


@router.put("/{id}")
async def update_personnel(
    id: int,
    data: PersonnelUpdate,
    db: Session = Depends(get_db)
):
    """Update personnel"""
    person = db.query(Personnel).filter(Personnel.id == id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(person, field, value)
    
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"id": id, "status": "ok"}


@router.delete("/{id}")
async def delete_personnel(id: int, db: Session = Depends(get_db)):
    """Deactivate personnel"""
    person = db.query(Personnel).filter(Personnel.id == id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    person.active = False
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"id": id, "status": "ok"}


@router.post("/sync-from-dashboard")
async def sync_from_dashboard(db: Session = Depends(get_db)):
    """
    Placeholder for syncing personnel from Dashboard database.
    Future: Connect to dashboard_db and import personnel.
    """
    # TODO: Implement when ready to connect
    # This would:
    # 1. Connect to dashboard_db
    # 2. Query personnel table
    # 3. Insert/update records here with dashboard_id set
    
    return {"status": "not_implemented", "message": "Dashboard sync not yet configured"}
