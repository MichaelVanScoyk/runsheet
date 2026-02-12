"""
Incident Admin Routes - Sequence Management
Extracted from incidents.py for maintainability.

Routes:
- GET /admin/sequence-status - Quick status for notification badges
- GET /admin/sequence - Detailed sequence review for single category
- POST /admin/fix-sequence - Fix out-of-sequence incidents
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from datetime import datetime
import logging

from database import get_db
from incident_helpers import (
    CATEGORY_PREFIXES,
    get_category_prefix,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/admin/sequence-status")
async def get_sequence_status(
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get quick status of incident sequences for all categories.
    Used for App.jsx notification badges.
    """
    if year is None:
        year = datetime.now().year
    
    year_short = year % 100
    
    status = {
        "year": year,
        "fire": {"total": 0, "out_of_sequence": 0},
        "ems": {"total": 0, "out_of_sequence": 0},
        "detail": {"total": 0, "out_of_sequence": 0},
    }
    
    for cat in ['FIRE', 'EMS', 'DETAIL']:
        prefix = get_category_prefix(cat)
        
        # Get incidents ordered by number
        incidents = db.execute(text("""
            SELECT id, internal_incident_number, incident_date
            FROM incidents
            WHERE year_prefix = :year 
              AND call_category = :cat
              AND deleted_at IS NULL
            ORDER BY internal_incident_number ASC
        """), {"year": year, "cat": cat}).fetchall()
        
        # Get correct order by date
        by_date = db.execute(text("""
            SELECT id, internal_incident_number
            FROM incidents
            WHERE year_prefix = :year 
              AND call_category = :cat
              AND deleted_at IS NULL
            ORDER BY incident_date ASC, created_at ASC
        """), {"year": year, "cat": cat}).fetchall()
        
        # Build correct number mapping
        correct_order = {}
        for i, row in enumerate(by_date):
            correct_number = f"{prefix}{year_short}{(i+1):04d}"
            correct_order[row[0]] = correct_number
        
        # Count out of sequence
        out_of_sequence = 0
        for inc in incidents:
            should_be = correct_order.get(inc[0], inc[1])
            if inc[1] != should_be:
                out_of_sequence += 1
        
        key = cat.lower()
        status[key] = {
            "total": len(incidents),
            "out_of_sequence": out_of_sequence
        }
    
    return status


@router.get("/admin/sequence")
async def get_incident_sequence(
    year: Optional[int] = None,
    category: str = Query('FIRE', description="Category: FIRE, EMS, or DETAIL"),
    db: Session = Depends(get_db)
):
    """Get incident sequence for admin review - single category at a time"""
    if year is None:
        year = datetime.now().year
    
    # Validate category
    if category not in CATEGORY_PREFIXES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category}")
    
    year_short = year % 100
    prefix = get_category_prefix(category)
    
    incidents = db.execute(text("""
        SELECT 
            id, 
            internal_incident_number, 
            incident_date, 
            cad_event_number, 
            address,
            COALESCE(out_of_sequence, FALSE) as out_of_sequence
        FROM incidents
        WHERE year_prefix = :year 
          AND call_category = :cat
          AND deleted_at IS NULL
        ORDER BY internal_incident_number ASC
    """), {"year": year, "cat": category}).fetchall()
    
    by_date = db.execute(text("""
        SELECT id, internal_incident_number, incident_date
        FROM incidents
        WHERE year_prefix = :year 
          AND call_category = :cat
          AND deleted_at IS NULL
        ORDER BY incident_date ASC, created_at ASC
    """), {"year": year, "cat": category}).fetchall()
    
    correct_order = {}
    for i, row in enumerate(by_date):
        correct_number = f"{prefix}{year_short}{(i+1):04d}"
        correct_order[row[0]] = correct_number
    
    incident_list = []
    for inc in incidents:
        should_be = correct_order.get(inc[0], inc[1])
        incident_list.append({
            "id": inc[0],
            "number": inc[1],
            "date": str(inc[2]) if inc[2] else None,
            "cad_event_number": inc[3],
            "address": inc[4],
            "out_of_sequence": inc[5],
            "should_be_number": should_be,
            "needs_fix": inc[1] != should_be
        })
    
    changes_needed = [i for i in incident_list if i["needs_fix"]]
    
    return {
        "year": year,
        "category": category,
        "total_incidents": len(incidents),
        "out_of_sequence_count": len(changes_needed),
        "incidents": incident_list,
        "changes_preview": [
            {
                "id": c["id"],
                "cad": c["cad_event_number"],
                "date": c["date"],
                "current_number": c["number"],
                "new_number": c["should_be_number"]
            }
            for c in changes_needed
        ]
    }


@router.post("/admin/fix-sequence")
async def fix_incident_sequence(
    year: int = Query(..., description="Year to fix"),
    category: str = Query(..., description="Category to fix: FIRE, EMS, or DETAIL"),
    db: Session = Depends(get_db)
):
    """Fix all out-of-sequence incidents for a year and category"""
    # Validate category
    if category not in CATEGORY_PREFIXES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category}")
    
    year_short = year % 100
    prefix = get_category_prefix(category)
    
    all_changes = []
    
    # Single category fix
    for cat in [category]:
        prefix = get_category_prefix(cat)
        
        by_date = db.execute(text("""
            SELECT id, internal_incident_number, incident_date, cad_event_number
            FROM incidents
            WHERE year_prefix = :year 
              AND call_category = :cat
              AND deleted_at IS NULL
            ORDER BY incident_date ASC, created_at ASC
        """), {"year": year, "cat": cat}).fetchall()
        
        if not by_date:
            continue
        
        changes = []
        for i, inc in enumerate(by_date):
            new_number = f"{prefix}{year_short}{(i+1):04d}"
            if inc[1] != new_number:
                changes.append({
                    "id": inc[0],
                    "old_number": inc[1],
                    "new_number": new_number,
                    "date": str(inc[2]) if inc[2] else None,
                    "cad": inc[3],
                    "category": cat
                })
        
        if not changes:
            continue
        
        logger.warning(f"ADMIN: Fixing {cat} sequence for {len(changes)} incidents in year {year}")
        
        # Temporary string numbers to avoid unique constraint
        for change in changes:
            if cat == 'DETAIL' and change['cad'] and change['cad'].startswith('D'):
                # Also temp the cad_event_number to avoid unique constraint on it
                db.execute(text("""
                    UPDATE incidents 
                    SET internal_incident_number = :temp_num,
                        cad_event_number = :temp_cad
                    WHERE id = :id
                """), {"temp_num": f"TEMP-{change['id']}", "temp_cad": f"TEMPCAD-{change['id']}", "id": change["id"]})
            else:
                db.execute(text("""
                    UPDATE incidents 
                    SET internal_incident_number = :temp_num 
                    WHERE id = :id
                """), {"temp_num": f"TEMP-{change['id']}", "id": change["id"]})
        
        db.flush()
        
        # Final numbers
        for change in changes:
            # For DETAIL records with manufactured CAD numbers (D%), sync cad_event_number too
            # Real CAD numbers (e.g., F26001437 from dispatch) are never touched
            if cat == 'DETAIL' and change['cad'] and change['cad'].startswith('D'):
                db.execute(text("""
                    UPDATE incidents 
                    SET internal_incident_number = :new_num,
                        cad_event_number = :new_num,
                        out_of_sequence = FALSE,
                        updated_at = NOW()
                    WHERE id = :id
                """), {"new_num": change["new_number"], "id": change["id"]})
            else:
                db.execute(text("""
                    UPDATE incidents 
                    SET internal_incident_number = :new_num,
                        out_of_sequence = FALSE,
                        updated_at = NOW()
                    WHERE id = :id
                """), {"new_num": change["new_number"], "id": change["id"]})
        
        all_changes.extend(changes)
    
    if not all_changes:
        return {"status": "ok", "message": "All incidents already in correct sequence", "changes": []}
    
    db.commit()
    
    return {
        "status": "ok",
        "year": year,
        "changes_applied": len(all_changes),
        "changes": all_changes
    }
