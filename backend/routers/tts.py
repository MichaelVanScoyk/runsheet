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
import logging

logger = logging.getLogger(__name__)

from database import get_db
from services.tts_preprocessing import tts_preprocessor

router = APIRouter()

# Piper models directory
PIPER_MODELS_DIR = "/home/dashboard/piper"


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
    
    new_id = result.fetchone()[0]
    db.commit()
    return {"status": "ok", "id": new_id}


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
    
    # Generate new guess using DB-backed prefix map
    spoken_as = tts_preprocessor.generate_spoken_guess(db, cad_unit_id, station_digits=station_digits)
    
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
    db: Session = Depends(get_db),
):
    """
    Preview what the auto-generated pronunciation would be for a unit.
    Does not save to database.
    """
    spoken_as = tts_preprocessor.generate_spoken_guess(db, cad_unit_id.upper().strip(), station_digits=station_digits)
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


# =============================================================================
# VOICE SELECTION
# =============================================================================

@router.get("/voices")
async def list_available_voices():
    """
    List available Piper TTS voice models.
    
    Scans the Piper models directory for .onnx files and returns
    information about each available voice.
    """
    from pathlib import Path
    import logging
    
    logger = logging.getLogger(__name__)
    voices = []
    models_dir = Path(PIPER_MODELS_DIR)
    
    if not models_dir.exists():
        logger.warning(f"Piper models directory not found: {PIPER_MODELS_DIR}")
        return {"voices": [], "error": "Models directory not found"}
    
    for onnx_file in models_dir.glob("*.onnx"):
        # Parse filename: en_US-ryan-medium.onnx -> en_US, ryan, medium
        name = onnx_file.stem  # e.g., "en_US-ryan-medium"
        parts = name.split('-')
        
        if len(parts) >= 2:
            language = parts[0]  # e.g., "en_US"
            voice_name = parts[1] if len(parts) > 1 else "unknown"  # e.g., "ryan"
            quality = parts[2] if len(parts) > 2 else "medium"  # e.g., "medium"
            
            # Make a friendly display name
            display_name = f"{voice_name.title()} ({language.replace('_', ' ')}, {quality})"
            
            voices.append({
                "id": name,
                "name": display_name,
                "voice": voice_name,
                "language": language,
                "quality": quality,
            })
    
    # Sort by language, then voice name
    voices.sort(key=lambda v: (v["language"], v["voice"]))
    
    return {"voices": voices}


# =============================================================================
# SEED FROM RECENT INCIDENTS
# =============================================================================

@router.post("/units/seed-from-incidents")
async def seed_units_from_incidents(
    count: int = Query(10, ge=1, le=50, description="Number of recent incidents to scan"),
    db: Session = Depends(get_db),
):
    """
    Seed unit mappings from recent incidents.
    
    Scans the last N incidents, extracts all unique unit IDs,
    and creates TTS mappings for any that don't already exist.
    
    This pre-populates the pronunciation table so admins can
    configure units before the next dispatch.
    """
    import logging
    
    logger = logging.getLogger(__name__)
    
    # Get units from recent incidents
    result = db.execute(text("""
        SELECT id, cad_units
        FROM incidents
        WHERE cad_units IS NOT NULL
        ORDER BY created_at DESC
        LIMIT :count
    """), {"count": count})
    
    all_units = set()
    incidents_scanned = 0
    
    for row in result:
        incidents_scanned += 1
        cad_units = row[1]
        
        if cad_units:
            try:
                # cad_units is JSONB array: [{"unit_id": "ENG481", ...}, ...]
                if isinstance(cad_units, list):
                    units_list = cad_units
                elif isinstance(cad_units, str):
                    units_list = json.loads(cad_units)
                else:
                    continue
                
                for unit in units_list:
                    if isinstance(unit, dict) and unit.get('unit_id'):
                        all_units.add(unit['unit_id'].upper().strip())
                    elif isinstance(unit, str):
                        all_units.add(unit.upper().strip())
            except Exception as e:
                logger.warning(f"Failed to parse cad_units for incident {row[0]}: {e}")
    
    if not all_units:
        return {
            "status": "ok",
            "message": "No units found in recent incidents",
            "incidents_scanned": incidents_scanned,
            "units_found": 0,
            "units_created": 0,
        }
    
    # Get existing mappings
    existing_result = db.execute(text(
        "SELECT cad_unit_id FROM tts_unit_mappings WHERE cad_unit_id = ANY(:units)"
    ), {"units": list(all_units)})
    existing_units = {row[0] for row in existing_result}
    
    # Create mappings for new units
    new_units = all_units - existing_units
    created = 0
    
    for unit_id in new_units:
        # Generate auto-guess pronunciation using DB-backed prefix map
        spoken_as = tts_preprocessor.generate_spoken_guess(db, unit_id)
        
        # Check if this unit is one of ours (in apparatus table)
        try:
            apparatus_result = db.execute(text("""
                SELECT id FROM apparatus 
                WHERE UPPER(cad_unit_id) = :unit_id 
                   OR UPPER(unit_designator) = :unit_id
                LIMIT 1
            """), {"unit_id": unit_id}).fetchone()
            apparatus_id = apparatus_result[0] if apparatus_result else None
        except:
            apparatus_id = None
        
        # Insert new mapping
        try:
            db.execute(text("""
                INSERT INTO tts_unit_mappings (cad_unit_id, spoken_as, needs_review, apparatus_id)
                VALUES (:unit_id, :spoken, true, :apparatus_id)
                ON CONFLICT (cad_unit_id) DO NOTHING
            """), {
                "unit_id": unit_id,
                "spoken": spoken_as,
                "apparatus_id": apparatus_id,
            })
            created += 1
        except Exception as e:
            logger.warning(f"Failed to create mapping for {unit_id}: {e}")
    
    db.commit()
    
    logger.info(f"Seeded {created} unit mappings from {incidents_scanned} incidents")
    
    return {
        "status": "ok",
        "message": f"Created {created} new unit mappings",
        "incidents_scanned": incidents_scanned,
        "units_found": len(all_units),
        "units_already_existed": len(existing_units),
        "units_created": created,
        "new_units": sorted(list(new_units)),
    }


# =============================================================================
# TTS ABBREVIATIONS CRUD
# =============================================================================

class AbbreviationCreate(BaseModel):
    category: str  # 'unit_prefix' or 'street_type'
    abbreviation: str
    spoken_as: str


class AbbreviationUpdate(BaseModel):
    spoken_as: str


@router.get("/abbreviations")
async def list_abbreviations(
    category: Optional[str] = Query(None, description="Filter by category: unit_prefix, street_type"),
    search: Optional[str] = Query(None, description="Search abbreviations"),
    db: Session = Depends(get_db),
):
    """
    List TTS abbreviations (unit prefixes and street types).
    These are used to generate pronunciations for new units and expand addresses.
    """
    query = """
        SELECT id, category, abbreviation, spoken_as, created_at, updated_at
        FROM tts_abbreviations
        WHERE 1=1
    """
    params = {}
    
    if category:
        query += " AND category = :category"
        params["category"] = category
    
    if search:
        query += " AND (abbreviation ILIKE :search OR spoken_as ILIKE :search)"
        params["search"] = f"%{search}%"
    
    query += " ORDER BY category, abbreviation"
    
    result = db.execute(text(query), params)
    
    abbreviations = []
    for row in result:
        abbreviations.append({
            "id": row[0],
            "category": row[1],
            "abbreviation": row[2],
            "spoken_as": row[3],
            "created_at": row[4].isoformat() if row[4] else None,
            "updated_at": row[5].isoformat() if row[5] else None,
        })
    
    # Group by category for easier UI display
    by_category = {}
    for abbr in abbreviations:
        cat = abbr["category"]
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(abbr)
    
    return {
        "abbreviations": abbreviations,
        "by_category": by_category,
        "total": len(abbreviations),
    }


@router.get("/abbreviations/{abbr_id}")
async def get_abbreviation(
    abbr_id: int,
    db: Session = Depends(get_db),
):
    """Get a single abbreviation by ID."""
    result = db.execute(text("""
        SELECT id, category, abbreviation, spoken_as, created_at, updated_at
        FROM tts_abbreviations
        WHERE id = :id
    """), {"id": abbr_id}).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="Abbreviation not found")
    
    return {
        "id": result[0],
        "category": result[1],
        "abbreviation": result[2],
        "spoken_as": result[3],
        "created_at": result[4].isoformat() if result[4] else None,
        "updated_at": result[5].isoformat() if result[5] else None,
    }


@router.post("/abbreviations")
async def create_abbreviation(
    data: AbbreviationCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new TTS abbreviation.
    
    Categories:
    - unit_prefix: Used when generating pronunciations for CAD unit IDs (e.g., ENG -> Engine)
    - street_type: Used when expanding addresses (e.g., RD -> Road)
    """
    if data.category not in ('unit_prefix', 'street_type'):
        raise HTTPException(status_code=400, detail="Invalid category. Must be 'unit_prefix' or 'street_type'")
    
    abbreviation = data.abbreviation.upper().strip()
    
    # Check if already exists
    existing = db.execute(text(
        "SELECT id FROM tts_abbreviations WHERE category = :category AND abbreviation = :abbr"
    ), {"category": data.category, "abbr": abbreviation}).fetchone()
    
    if existing:
        raise HTTPException(status_code=400, detail="Abbreviation already exists for this category")
    
    try:
        result = db.execute(text("""
            INSERT INTO tts_abbreviations (category, abbreviation, spoken_as)
            VALUES (:category, :abbr, :spoken)
            RETURNING id
        """), {
            "category": data.category,
            "abbr": abbreviation,
            "spoken": data.spoken_as.strip(),
        })
        
        new_id = result.fetchone()[0]
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create abbreviation {abbreviation}: {e}")
        raise HTTPException(status_code=500, detail="Database error creating abbreviation")
    
    # Clear the cache so changes take effect
    tts_preprocessor.clear_cache()
    
    return {"status": "ok", "id": new_id}


@router.put("/abbreviations/{abbr_id}")
async def update_abbreviation(
    abbr_id: int,
    data: AbbreviationUpdate,
    db: Session = Depends(get_db),
):
    """Update an abbreviation's spoken form."""
    result = db.execute(text("""
        UPDATE tts_abbreviations
        SET spoken_as = :spoken, updated_at = NOW()
        WHERE id = :id
        RETURNING id
    """), {
        "id": abbr_id,
        "spoken": data.spoken_as.strip(),
    })
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Abbreviation not found")
    
    db.commit()
    
    # Clear the cache so changes take effect
    tts_preprocessor.clear_cache()
    
    return {"status": "ok", "id": row[0]}


@router.delete("/abbreviations/{abbr_id}")
async def delete_abbreviation(
    abbr_id: int,
    db: Session = Depends(get_db),
):
    """Delete an abbreviation."""
    result = db.execute(text("""
        DELETE FROM tts_abbreviations
        WHERE id = :id
        RETURNING id
    """), {"id": abbr_id})
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Abbreviation not found")
    
    db.commit()
    
    # Clear the cache so changes take effect
    tts_preprocessor.clear_cache()
    
    return {"status": "ok"}
