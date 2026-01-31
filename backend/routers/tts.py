"""
TTS Router - Manage TTS unit mappings and field settings

Handles:
- Unit pronunciation mappings (auto-created from CAD, admin configurable)
- Field-level TTS settings (pause durations, prefixes, etc.)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from pydantic import BaseModel
import json

from database import get_db
from services.tts_preprocessing import tts_preprocessor, generate_spoken_guess

router = APIRouter()


# =============================================================================
# SCHEMAS
# =============================================================================

class UnitMappingUpdate(BaseModel):
    spoken_as: str


class UnitMappingCreate(BaseModel):
    cad_unit_id: str
    spoken_as: str


class FieldSettingsUpdate(BaseModel):
    pause_after: Optional[str] = None  # 'none', 'short', 'medium', 'long'
    prefix: Optional[str] = None
    suffix: Optional[str] = None
    options: Optional[dict] = None


# =============================================================================
# UNIT MAPPINGS CRUD
# =============================================================================

@router.get("/units")
async def list_unit_mappings(
    needs_review: Optional[bool] = Query(None, description="Filter by review status"),
    search: Optional[str] = Query(None, description="Search by CAD unit ID"),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    """
    List TTS unit mappings.
    
    Returns units that have been seen in CAD data, with their pronunciations.
    Units flagged needs_review=true need admin configuration.
    """
    # Build query
    query = """
        SELECT 
            m.id,
            m.cad_unit_id,
            m.spoken_as,
            m.needs_review,
            m.first_seen_at,
            m.updated_at,
            m.apparatus_id,
            m.first_seen_incident_id,
            a.name as apparatus_name
        FROM tts_unit_mappings m
        LEFT JOIN apparatus a ON m.apparatus_id = a.id
        WHERE 1=1
    """
    params = {}
    
    if needs_review is not None:
        query += " AND m.needs_review = :needs_review"
        params["needs_review"] = needs_review
    
    if search:
        query += " AND m.cad_unit_id ILIKE :search"
        params["search"] = f"%{search}%"
    
    query += " ORDER BY m.needs_review DESC, m.first_seen_at DESC"
    query += " LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset
    
    result = db.execute(text(query), params)
    
    units = []
    for row in result:
        units.append({
            "id": row[0],
            "cad_unit_id": row[1],
            "spoken_as": row[2],
            "needs_review": row[3],
            "first_seen_at": row[4].isoformat() if row[4] else None,
            "updated_at": row[5].isoformat() if row[5] else None,
            "apparatus_id": row[6],
            "first_seen_incident_id": row[7],
            "apparatus_name": row[8],
            "is_ours": row[6] is not None,
        })
    
    # Get counts
    count_query = "SELECT COUNT(*) FROM tts_unit_mappings WHERE 1=1"
    count_params = {}
    if needs_review is not None:
        count_query += " AND needs_review = :needs_review"
        count_params["needs_review"] = needs_review
    if search:
        count_query += " AND cad_unit_id ILIKE :search"
        count_params["search"] = f"%{search}%"
    
    total = db.execute(text(count_query), count_params).scalar()
    
    # Get needs_review count
    review_count = db.execute(
        text("SELECT COUNT(*) FROM tts_unit_mappings WHERE needs_review = true")
    ).scalar()
    
    return {
        "units": units,
        "total": total,
        "needs_review_count": review_count,
        "limit": limit,
        "offset": offset,
    }


@router.get("/units/needs-review-count")
async def get_needs_review_count(db: Session = Depends(get_db)):
    """Get count of unit mappings needing review."""
    count = db.execute(
        text("SELECT COUNT(*) FROM tts_unit_mappings WHERE needs_review = true")
    ).scalar()
    return {"count": count}


@router.get("/units/{unit_id}")
async def get_unit_mapping(
    unit_id: str,
    db: Session = Depends(get_db),
):
    """Get a single unit mapping by CAD unit ID."""
    result = db.execute(text("""
        SELECT 
            m.id,
            m.cad_unit_id,
            m.spoken_as,
            m.needs_review,
            m.first_seen_at,
            m.updated_at,
            m.apparatus_id,
            m.first_seen_incident_id,
            a.name as apparatus_name
        FROM tts_unit_mappings m
        LEFT JOIN apparatus a ON m.apparatus_id = a.id
        WHERE m.cad_unit_id = :unit_id
    """), {"unit_id": unit_id.upper()}).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="Unit mapping not found")
    
    return {
        "id": result[0],
        "cad_unit_id": result[1],
        "spoken_as": result[2],
        "needs_review": result[3],
        "first_seen_at": result[4].isoformat() if result[4] else None,
        "updated_at": result[5].isoformat() if result[5] else None,
        "apparatus_id": result[6],
        "first_seen_incident_id": result[7],
        "apparatus_name": result[8],
        "is_ours": result[6] is not None,
    }


@router.put("/units/{unit_id}")
async def update_unit_mapping(
    unit_id: str,
    data: UnitMappingUpdate,
    db: Session = Depends(get_db),
):
    """
    Update a unit mapping pronunciation.
    Clears needs_review flag when updated.
    """
    result = db.execute(text("""
        UPDATE tts_unit_mappings
        SET spoken_as = :spoken_as,
            needs_review = false,
            updated_at = NOW()
        WHERE cad_unit_id = :unit_id
        RETURNING id
    """), {
        "unit_id": unit_id.upper(),
        "spoken_as": data.spoken_as.strip(),
    })
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Unit mapping not found")
    
    db.commit()
    return {"status": "ok", "id": row[0]}


@router.post("/units")
async def create_unit_mapping(
    data: UnitMappingCreate,
    db: Session = Depends(get_db),
):
    """
    Manually create a unit mapping.
    Useful for pre-configuring units before they're seen in CAD.
    """
    cad_unit_id = data.cad_unit_id.upper().strip()
    
    # Check if already exists
    existing = db.execute(
        text("SELECT id FROM tts_unit_mappings WHERE cad_unit_id = :unit_id"),
        {"unit_id": cad_unit_id}
    ).fetchone()
    
    if existing:
        raise HTTPException(status_code=400, detail="Unit mapping already exists")
    
    # Check if this unit is one of ours
    apparatus_result = db.execute(text("""
        SELECT id FROM apparatus 
        WHERE UPPER(cad_unit_id) = :unit_id 
           OR UPPER(unit_designator) = :unit_id
           OR :unit_id = ANY(SELECT UPPER(unnest(cad_unit_aliases)))
        LIMIT 1
    """), {"unit_id": cad_unit_id}).fetchone()
    apparatus_id = apparatus_result[0] if apparatus_result else None
    
    result = db.execute(text("""
        INSERT INTO tts_unit_mappings (cad_unit_id, spoken_as, needs_review, apparatus_id)
        VALUES (:unit_id, :spoken_as, false, :apparatus_id)
        RETURNING id
    """), {
        "unit_id": cad_unit_id,
        "spoken_as": data.spoken_as.strip(),
        "apparatus_id": apparatus_id,
    })
    
    db.commit()
    return {"status": "ok", "id": result.fetchone()[0]}


@router.delete("/units/{unit_id}")
async def delete_unit_mapping(
    unit_id: str,
    db: Session = Depends(get_db),
):
    """Delete a unit mapping."""
    result = db.execute(text("""
        DELETE FROM tts_unit_mappings
        WHERE cad_unit_id = :unit_id
        RETURNING id
    """), {"unit_id": unit_id.upper()})
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Unit mapping not found")
    
    db.commit()
    return {"status": "ok"}


@router.post("/units/{unit_id}/regenerate")
async def regenerate_unit_pronunciation(
    unit_id: str,
    station_digits: int = Query(2, ge=1, le=4, description="Number of digits in station number"),
    db: Session = Depends(get_db),
):
    """
    Regenerate the auto-guess pronunciation for a unit.
    Useful if you want to try a different station_digits setting.
    """
    cad_unit_id = unit_id.upper().strip()
    
    # Check exists
    existing = db.execute(
        text("SELECT id FROM tts_unit_mappings WHERE cad_unit_id = :unit_id"),
        {"unit_id": cad_unit_id}
    ).fetchone()
    
    if not existing:
        raise HTTPException(status_code=404, detail="Unit mapping not found")
    
    # Generate new guess
    spoken_as = generate_spoken_guess(cad_unit_id, station_digits=station_digits)
    
    db.execute(text("""
        UPDATE tts_unit_mappings
        SET spoken_as = :spoken_as, updated_at = NOW()
        WHERE cad_unit_id = :unit_id
    """), {"unit_id": cad_unit_id, "spoken_as": spoken_as})
    
    db.commit()
    
    return {
        "status": "ok",
        "cad_unit_id": cad_unit_id,
        "spoken_as": spoken_as,
        "station_digits": station_digits,
    }


@router.post("/units/preview-pronunciation")
async def preview_pronunciation(
    cad_unit_id: str = Query(..., description="CAD unit ID to preview"),
    station_digits: int = Query(2, ge=1, le=4, description="Number of digits in station number"),
):
    """
    Preview what the auto-generated pronunciation would be for a unit.
    Does not save to database.
    """
    spoken_as = generate_spoken_guess(cad_unit_id.upper().strip(), station_digits=station_digits)
    return {
        "cad_unit_id": cad_unit_id.upper().strip(),
        "spoken_as": spoken_as,
        "station_digits": station_digits,
    }


@router.post("/units/mark-all-reviewed")
async def mark_all_reviewed(db: Session = Depends(get_db)):
    """
    Mark all units as reviewed (accept auto-generated pronunciations).
    Useful for bulk-accepting the defaults.
    """
    result = db.execute(text("""
        UPDATE tts_unit_mappings
        SET needs_review = false, updated_at = NOW()
        WHERE needs_review = true
        RETURNING id
    """))
    
    count = len(result.fetchall())
    db.commit()
    
    return {"status": "ok", "count": count}


# =============================================================================
# FIELD SETTINGS CRUD
# =============================================================================

@router.get("/fields")
async def list_field_settings(db: Session = Depends(get_db)):
    """
    Get all TTS field settings.
    Returns settings for each available field (units, call_type, address, etc.)
    """
    result = db.execute(text("""
        SELECT field_id, pause_after, prefix, suffix, options, updated_at
        FROM tts_field_settings
        ORDER BY field_id
    """))
    
    fields = {}
    for row in result:
        fields[row[0]] = {
            "field_id": row[0],
            "pause_after": row[1],
            "prefix": row[2],
            "suffix": row[3],
            "options": json.loads(row[4]) if row[4] else {},
            "updated_at": row[5].isoformat() if row[5] else None,
        }
    
    return {"fields": fields}


@router.get("/fields/{field_id}")
async def get_field_settings(
    field_id: str,
    db: Session = Depends(get_db),
):
    """Get settings for a single field."""
    result = db.execute(text("""
        SELECT field_id, pause_after, prefix, suffix, options, updated_at
        FROM tts_field_settings
        WHERE field_id = :field_id
    """), {"field_id": field_id}).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="Field settings not found")
    
    return {
        "field_id": result[0],
        "pause_after": result[1],
        "prefix": result[2],
        "suffix": result[3],
        "options": json.loads(result[4]) if result[4] else {},
        "updated_at": result[5].isoformat() if result[5] else None,
    }


@router.put("/fields/{field_id}")
async def update_field_settings(
    field_id: str,
    data: FieldSettingsUpdate,
    db: Session = Depends(get_db),
):
    """Update settings for a field."""
    # Build update query dynamically based on provided fields
    updates = []
    params = {"field_id": field_id}
    
    if data.pause_after is not None:
        if data.pause_after not in ('none', 'short', 'medium', 'long'):
            raise HTTPException(status_code=400, detail="Invalid pause_after value")
        updates.append("pause_after = :pause_after")
        params["pause_after"] = data.pause_after
    
    if data.prefix is not None:
        updates.append("prefix = :prefix")
        params["prefix"] = data.prefix if data.prefix else None
    
    if data.suffix is not None:
        updates.append("suffix = :suffix")
        params["suffix"] = data.suffix if data.suffix else None
    
    if data.options is not None:
        updates.append("options = :options")
        params["options"] = json.dumps(data.options)
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    updates.append("updated_at = NOW()")
    
    query = f"""
        UPDATE tts_field_settings
        SET {', '.join(updates)}
        WHERE field_id = :field_id
        RETURNING field_id
    """
    
    result = db.execute(text(query), params)
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="Field settings not found")
    
    db.commit()
    return {"status": "ok", "field_id": field_id}


# =============================================================================
# PREVIEW / TEST
# =============================================================================

@router.post("/preview")
async def preview_tts_text(
    units: List[str] = [],
    call_type: str = "",
    address: str = "",
    subtype: str = "",
    box: str = "",
    municipality: str = "",
    db: Session = Depends(get_db),
):
    """
    Preview what the TTS text would be for given incident data.
    Does not generate audio, just returns the formatted text.
    """
    from services.tts_service import tts_service, _get_tts_settings
    
    settings = _get_tts_settings(db)
    
    text = await tts_service.format_announcement(
        units=units,
        call_type=call_type,
        address=address,
        subtype=subtype,
        box=box,
        municipality=municipality,
        settings=settings,
        db=db,
    )
    
    return {
        "tts_text": text,
        "field_order": settings.get('tts_field_order', []),
    }
