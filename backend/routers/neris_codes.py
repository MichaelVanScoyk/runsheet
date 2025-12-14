"""
NERIS Code Management Router
Import, browse, validate, and update NERIS codes.
Updated for TEXT-based codes - December 2025
"""

import csv
from datetime import datetime
from typing import Optional, List, Dict, Any
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel

from database import get_db

router = APIRouter()


# ============================================================================
# SCHEMAS
# ============================================================================

class CodeUpdate(BaseModel):
    active: Optional[bool] = None
    description: Optional[str] = None
    display_order: Optional[int] = None


class IncidentUpdateRequest(BaseModel):
    """Update incidents from old code to new code"""
    field: str  # 'incident_type', 'location_use', or 'action'
    old_code: str
    new_code: str
    year: Optional[int] = None


# ============================================================================
# HELPERS
# ============================================================================

def parse_csv_row(row: Dict[str, str], is_hierarchical: bool) -> Dict[str, Any]:
    """Parse a CSV row into a code record."""
    row_lower = {k.lower().strip(): v for k, v in row.items() if k}
    
    if is_hierarchical:
        v1 = row_lower.get('value_1', '').strip()
        v2 = row_lower.get('value_2', '').strip()
        v3 = row_lower.get('value_3', '').strip()
        
        # Build composite value with ": " separator (NERIS standard)
        if v3:
            value = f"{v1}: {v2}: {v3}"
        elif v2:
            value = f"{v1}: {v2}"
        else:
            value = v1
        
        return {
            'value': value,
            'active': row_lower.get('active', 'TRUE').upper() == 'TRUE',
            'value_1': v1 or None,
            'value_2': v2 or None,
            'value_3': v3 or None,
            'description_1': row_lower.get('description_1', '').strip() or None,
            'description_2': row_lower.get('description_2', '').strip() or None,
            'description_3': row_lower.get('description_3', '').strip() or None,
            'definition': row_lower.get('definition_1', '').strip() or row_lower.get('definition', '').strip() or None,
            'source': row_lower.get('source', '').strip() or None,
        }
    else:
        return {
            'value': row_lower.get('value', '').strip(),
            'active': row_lower.get('active', 'TRUE').upper() == 'TRUE',
            'description': row_lower.get('description', '').strip() or None,
            'definition': row_lower.get('definition', '').strip() or None,
            'source': row_lower.get('source', '').strip() or None,
        }


# ============================================================================
# CATEGORY ENDPOINTS
# ============================================================================

@router.get("/categories")
async def list_categories(db: Session = Depends(get_db)):
    """Get all NERIS code categories with counts."""
    result = db.execute(text("""
        SELECT 
            category,
            COUNT(*) as total,
            SUM(CASE WHEN active THEN 1 ELSE 0 END) as active_count,
            BOOL_OR(value_1 IS NOT NULL) as is_hierarchical,
            MAX(imported_at) as last_import
        FROM neris_codes
        GROUP BY category
        ORDER BY category
    """))
    
    return [
        {
            "category": r[0],
            "total": r[1],
            "active": r[2],
            "is_hierarchical": r[3],
            "last_import": r[4].isoformat() if r[4] else None
        }
        for r in result
    ]


@router.get("/categories/{category}")
async def get_category_codes(
    category: str,
    include_inactive: bool = False,
    db: Session = Depends(get_db)
):
    """Get all codes for a category."""
    query = """
        SELECT id, value, active, value_1, value_2, value_3,
               description, description_1, description_2, description_3,
               definition, display_order
        FROM neris_codes
        WHERE category = :category
    """
    if not include_inactive:
        query += " AND active = true"
    query += " ORDER BY COALESCE(display_order, 9999), value_1, value_2, value_3, value"
    
    result = db.execute(text(query), {"category": category})
    
    codes = []
    for r in result:
        # Build display text
        if r[9]:  # description_3
            display = f"{r[7]} > {r[8]} > {r[9]}"
        elif r[8]:  # description_2
            display = f"{r[7]} > {r[8]}"
        elif r[6]:  # description
            display = r[6]
        else:
            display = r[1]
        
        codes.append({
            "id": r[0],
            "value": r[1],
            "active": r[2],
            "value_1": r[3],
            "value_2": r[4],
            "value_3": r[5],
            "description": r[6],
            "description_1": r[7],
            "description_2": r[8],
            "description_3": r[9],
            "definition": r[10],
            "display_order": r[11],
            "display_text": display
        })
    
    return codes


@router.get("/categories/{category}/grouped")
async def get_category_grouped(category: str, db: Session = Depends(get_db)):
    """Get hierarchical codes grouped for dropdown display."""
    
    check = db.execute(text("""
        SELECT BOOL_OR(value_1 IS NOT NULL) FROM neris_codes WHERE category = :cat
    """), {"cat": category}).fetchone()
    
    if not check or not check[0]:
        codes = await get_category_codes(category, False, db)
        return {"hierarchical": False, "codes": codes}
    
    result = db.execute(text("""
        SELECT value_1, value_2, value_3, description_1, description_2, description_3, value
        FROM neris_codes
        WHERE category = :cat AND active = true
        ORDER BY value_1, value_2, value_3
    """), {"cat": category})
    
    groups = {}
    for r in result:
        v1, v2, v3, d1, d2, d3, value = r
        
        if v1 not in groups:
            groups[v1] = {"description": d1, "children": {}}
        
        if v2:
            if v2 not in groups[v1]["children"]:
                groups[v1]["children"][v2] = {"description": d2, "codes": []}
            
            if v3:
                groups[v1]["children"][v2]["codes"].append({
                    "value": value,
                    "description": d3
                })
    
    return {"hierarchical": True, "groups": groups}


# ============================================================================
# IMPORT ENDPOINTS
# ============================================================================

@router.post("/import")
async def import_csv(
    category: str = Query(..., description="Category (e.g., 'type_incident')"),
    mode: str = Query("merge", description="'merge' keeps existing, 'replace' deletes first"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Import NERIS codes from CSV file."""
    
    content = await file.read()
    content_str = content.decode('utf-8-sig')
    
    reader = csv.DictReader(StringIO(content_str))
    rows = list(reader)
    
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty")
    
    headers = [h.lower() if h else '' for h in reader.fieldnames]
    is_hierarchical = 'value_1' in headers
    
    rows_imported = 0
    rows_updated = 0
    rows_removed = 0
    
    if mode == 'replace':
        result = db.execute(text("DELETE FROM neris_codes WHERE category = :cat"), {"cat": category})
        rows_removed = result.rowcount
    
    for row in rows:
        parsed = parse_csv_row(row, is_hierarchical)
        if not parsed['value']:
            continue
        
        existing = db.execute(text("""
            SELECT id FROM neris_codes WHERE category = :cat AND value = :val
        """), {"cat": category, "val": parsed['value']}).fetchone()
        
        if existing:
            if mode == 'merge':
                db.execute(text("""
                    UPDATE neris_codes SET
                        active = :active,
                        value_1 = :value_1,
                        value_2 = :value_2,
                        value_3 = :value_3,
                        description = :description,
                        description_1 = :description_1,
                        description_2 = :description_2,
                        description_3 = :description_3,
                        definition = :definition,
                        source = :source,
                        imported_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = :id
                """), {
                    "id": existing[0],
                    "active": parsed['active'],
                    "value_1": parsed.get('value_1'),
                    "value_2": parsed.get('value_2'),
                    "value_3": parsed.get('value_3'),
                    "description": parsed.get('description'),
                    "description_1": parsed.get('description_1'),
                    "description_2": parsed.get('description_2'),
                    "description_3": parsed.get('description_3'),
                    "definition": parsed.get('definition'),
                    "source": parsed.get('source'),
                })
                rows_updated += 1
        else:
            db.execute(text("""
                INSERT INTO neris_codes 
                    (category, value, active, value_1, value_2, value_3,
                     description, description_1, description_2, description_3,
                     definition, source, imported_at)
                VALUES 
                    (:category, :value, :active, :value_1, :value_2, :value_3,
                     :description, :description_1, :description_2, :description_3,
                     :definition, :source, CURRENT_TIMESTAMP)
            """), {
                "category": category,
                "value": parsed['value'],
                "active": parsed['active'],
                "value_1": parsed.get('value_1'),
                "value_2": parsed.get('value_2'),
                "value_3": parsed.get('value_3'),
                "description": parsed.get('description'),
                "description_1": parsed.get('description_1'),
                "description_2": parsed.get('description_2'),
                "description_3": parsed.get('description_3'),
                "definition": parsed.get('definition'),
                "source": parsed.get('source'),
            })
            rows_imported += 1
    
    db.commit()
    
    return {
        "category": category,
        "mode": mode,
        "rows_imported": rows_imported,
        "rows_updated": rows_updated,
        "rows_removed": rows_removed,
        "is_hierarchical": is_hierarchical
    }


# ============================================================================
# SEARCH ENDPOINTS
# ============================================================================

@router.get("/search")
async def search_codes(
    q: str = Query(..., min_length=2),
    category: Optional[str] = None,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db)
):
    """Search codes across categories"""
    
    query = """
        SELECT id, category, value, 
               COALESCE(description, description_1, value) as description,
               active
        FROM neris_codes
        WHERE (
            value ILIKE :search OR
            description ILIKE :search OR
            description_1 ILIKE :search OR
            description_2 ILIKE :search OR
            description_3 ILIKE :search
        )
    """
    params = {"search": f"%{q}%", "limit": limit}
    
    if category:
        query += " AND category = :category"
        params["category"] = category
    
    query += " ORDER BY category, value LIMIT :limit"
    
    result = db.execute(text(query), params)
    
    return [
        {
            "id": r[0],
            "category": r[1],
            "value": r[2],
            "description": r[3],
            "active": r[4]
        }
        for r in result
    ]


# ============================================================================
# VALIDATION ENDPOINTS
# Uses new TEXT column names: neris_incident_type_codes, neris_action_codes
# ============================================================================

@router.get("/validate")
async def validate_incidents(
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Find incidents with codes that don't exist in current NERIS codes.
    Uses new TEXT-based columns.
    """
    
    issues = {
        "incident_type": [],
        "location_use": [],
        "action": []
    }
    
    year_filter = ""
    params = {}
    if year:
        year_filter = " AND year_prefix = :year"
        params["year"] = year
    
    # Check incident types (new column: neris_incident_type_codes TEXT[])
    result = db.execute(text(f"""
        SELECT i.id, i.internal_incident_number, i.year_prefix, 
               unnest(i.neris_incident_type_codes) as code
        FROM incidents i
        WHERE i.deleted_at IS NULL 
        AND i.neris_incident_type_codes IS NOT NULL
        AND array_length(i.neris_incident_type_codes, 1) > 0
        {year_filter}
    """), params)
    
    for r in result:
        code = r[3]
        if code:
            valid = db.execute(text("""
                SELECT 1 FROM neris_codes 
                WHERE category = 'type_incident' AND value = :code AND active = true
            """), {"code": code}).fetchone()
            
            if not valid:
                issues["incident_type"].append({
                    "incident_id": r[0],
                    "incident_number": f"{r[2]}-{r[1]:04d}",
                    "code": code
                })
    
    # Check location use (from JSONB: neris_location_use->>'use_type')
    result = db.execute(text(f"""
        SELECT id, internal_incident_number, year_prefix, 
               neris_location_use->>'use_type' as use_type,
               neris_location_use->>'use_subtype' as use_subtype
        FROM incidents
        WHERE deleted_at IS NULL 
        AND neris_location_use IS NOT NULL
        {year_filter}
    """), params)
    
    for r in result:
        if r[3]:  # use_type exists
            # Build the combined value to check
            if r[4]:  # has subtype
                code = f"{r[3]}: {r[4]}"
            else:
                code = r[3]
            
            valid = db.execute(text("""
                SELECT 1 FROM neris_codes 
                WHERE category = 'type_location_use' AND value = :code AND active = true
            """), {"code": code}).fetchone()
            
            if not valid:
                issues["location_use"].append({
                    "incident_id": r[0],
                    "incident_number": f"{r[2]}-{r[1]:04d}",
                    "code": code
                })
    
    # Check actions (new column: neris_action_codes TEXT[])
    result = db.execute(text(f"""
        SELECT i.id, i.internal_incident_number, i.year_prefix,
               unnest(i.neris_action_codes) as code
        FROM incidents i
        WHERE i.deleted_at IS NULL 
        AND i.neris_action_codes IS NOT NULL
        AND array_length(i.neris_action_codes, 1) > 0
        {year_filter}
    """), params)
    
    for r in result:
        code = r[3]
        if code:
            valid = db.execute(text("""
                SELECT 1 FROM neris_codes 
                WHERE category = 'type_action_tactic' AND value = :code AND active = true
            """), {"code": code}).fetchone()
            
            if not valid:
                issues["action"].append({
                    "incident_id": r[0],
                    "incident_number": f"{r[2]}-{r[1]:04d}",
                    "code": code
                })
    
    return {
        "year": year,
        "issues": issues,
        "total_issues": sum(len(v) for v in issues.values())
    }


@router.get("/validate/apparatus")
async def validate_apparatus(db: Session = Depends(get_db)):
    """Find apparatus with invalid NERIS unit types."""
    
    issues = []
    result = db.execute(text("""
        SELECT id, unit_designator, name, neris_unit_type
        FROM apparatus WHERE neris_unit_type IS NOT NULL AND active = true
    """))
    
    for r in result:
        valid = db.execute(text("""
            SELECT 1 FROM neris_codes 
            WHERE category = 'type_unit' AND value = :code AND active = true
        """), {"code": r[3]}).fetchone()
        
        if not valid:
            issues.append({
                "apparatus_id": r[0],
                "unit_designator": r[1],
                "name": r[2],
                "neris_unit_type": r[3]
            })
    
    return issues


# ============================================================================
# UPDATE INCIDENTS ENDPOINTS
# ============================================================================

@router.post("/update-incidents")
async def update_incident_codes(
    request: IncidentUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    Update incidents from old code to new code.
    Uses new TEXT-based columns.
    """
    
    year_filter = ""
    params = {"old_code": request.old_code, "new_code": request.new_code}
    
    if request.year:
        year_filter = " AND year_prefix = :year"
        params["year"] = request.year
    
    if request.field == "incident_type":
        result = db.execute(text(f"""
            UPDATE incidents
            SET neris_incident_type_codes = array_replace(neris_incident_type_codes, :old_code, :new_code),
                updated_at = CURRENT_TIMESTAMP
            WHERE deleted_at IS NULL
            AND :old_code = ANY(neris_incident_type_codes)
            {year_filter}
        """), params)
        
    elif request.field == "location_use":
        # More complex - need to update JSONB
        # This updates use_type or combined value
        result = db.execute(text(f"""
            UPDATE incidents
            SET neris_location_use = jsonb_set(
                neris_location_use,
                '{{use_type}}',
                to_jsonb(:new_code::text)
            ),
            updated_at = CURRENT_TIMESTAMP
            WHERE deleted_at IS NULL
            AND neris_location_use->>'use_type' = :old_code
            {year_filter}
        """), params)
        
    elif request.field == "action":
        result = db.execute(text(f"""
            UPDATE incidents
            SET neris_action_codes = array_replace(neris_action_codes, :old_code, :new_code),
                updated_at = CURRENT_TIMESTAMP
            WHERE deleted_at IS NULL
            AND :old_code = ANY(neris_action_codes)
            {year_filter}
        """), params)
        
    else:
        raise HTTPException(status_code=400, detail="Invalid field")
    
    db.commit()
    
    return {
        "field": request.field,
        "old_code": request.old_code,
        "new_code": request.new_code,
        "year": request.year,
        "incidents_updated": result.rowcount
    }


# ============================================================================
# CODE CRUD
# ============================================================================

@router.put("/codes/{code_id}")
async def update_code(code_id: int, update: CodeUpdate, db: Session = Depends(get_db)):
    """Update a code's active status, description, or display order."""
    
    updates = []
    params = {"id": code_id}
    
    if update.active is not None:
        updates.append("active = :active")
        params["active"] = update.active
    if update.description is not None:
        updates.append("description = :description")
        params["description"] = update.description
    if update.display_order is not None:
        updates.append("display_order = :display_order")
        params["display_order"] = update.display_order
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    updates.append("updated_at = CURRENT_TIMESTAMP")
    
    result = db.execute(text(f"UPDATE neris_codes SET {', '.join(updates)} WHERE id = :id"), params)
    db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Code not found")
    
    return {"id": code_id, "updated": True}


@router.delete("/codes/{code_id}")
async def deactivate_code(code_id: int, db: Session = Depends(get_db)):
    """Deactivate a code (soft delete)."""
    
    result = db.execute(text("""
        UPDATE neris_codes SET active = false, updated_at = CURRENT_TIMESTAMP WHERE id = :id
    """), {"id": code_id})
    db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Code not found")
    
    return {"id": code_id, "deactivated": True}
