"""
Lookups router - NERIS codes and municipalities
Updated for NERIS TEXT codes - December 2025
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel

from database import get_db
from models import CadTypeMapping
from settings_helper import format_utc_iso

router = APIRouter()


# ============================================================================
# ALL NERIS CODES - SINGLE ENDPOINT
# ============================================================================

@router.get("/neris/all-dropdowns")
async def get_all_neris_dropdowns(db: Session = Depends(get_db)):
    """
    Get ALL NERIS dropdown codes in a single call.
    This replaces 25+ individual API calls with one efficient query.
    
    Returns codes grouped by category for direct use in frontend dropdowns.
    """
    # Get all active codes in one query
    result = db.execute(text("""
        SELECT category, id, value, 
               COALESCE(description, value) as description,
               value_1, value_2, value_3,
               description_1, description_2, description_3
        FROM neris_codes 
        WHERE active = true
        ORDER BY category, COALESCE(display_order, 9999), value_1, value_2, value_3, value
    """))
    
    # Group by category
    categories = {}
    for row in result:
        cat = row[0]
        if cat not in categories:
            categories[cat] = []
        
        categories[cat].append({
            "id": row[1],
            "value": row[2],
            "description": row[3],
            "value_1": row[4],
            "value_2": row[5],
            "value_3": row[6],
            "description_1": row[7],
            "description_2": row[8],
            "description_3": row[9],
        })
    
    return {"categories": categories}


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
# NERIS CODE LOOKUPS (TEXT values)
# 
# All NERIS codes are now TEXT strings in hierarchical format:
#   "FIRE: STRUCTURE_FIRE: RESIDENTIAL_SINGLE"
# 
# Use the neris_codes table for all lookups.
# ============================================================================

@router.get("/neris/incident-types")
async def get_incident_types(
    include_inactive: bool = False,
    db: Session = Depends(get_db)
):
    """
    Get NERIS incident type codes.
    Returns TEXT values (not integers) for direct use in incidents.
    """
    query = """
        SELECT id, value, description_1, description_2, description_3, 
               value_1, value_2, value_3, active
        FROM neris_codes 
        WHERE category = 'type_incident'
    """
    if not include_inactive:
        query += " AND active = true"
    query += " ORDER BY value_1, value_2, value_3"
    
    result = db.execute(text(query))
    
    codes = []
    for r in result:
        # Build display text from descriptions
        if r[4]:  # description_3
            display = f"{r[2]} > {r[3]} > {r[4]}"
        elif r[3]:  # description_2
            display = f"{r[2]} > {r[3]}"
        else:
            display = r[2] or r[1]
        
        codes.append({
            "id": r[0],
            "value": r[1],           # TEXT code for storage
            "display": display,       # Human-readable
            "value_1": r[5],
            "value_2": r[6],
            "value_3": r[7],
            "active": r[8]
        })
    
    return codes


@router.get("/neris/incident-types/by-category")
async def get_incident_types_by_category(db: Session = Depends(get_db)):
    """Get NERIS incident types grouped by top-level category"""
    result = db.execute(text("""
        SELECT value, value_1, value_2, value_3, 
               description_1, description_2, description_3
        FROM neris_codes 
        WHERE category = 'type_incident' AND active = true
        ORDER BY value_1, value_2, value_3
    """))
    
    grouped = {}
    for r in result:
        value, v1, v2, v3, d1, d2, d3 = r
        
        if v1 not in grouped:
            grouped[v1] = {
                "description": d1
            }
        
        if v2:
            if "children" not in grouped[v1]:
                grouped[v1]["children"] = {}
            if v2 not in grouped[v1]["children"]:
                grouped[v1]["children"][v2] = {
                    "description": d2,
                    "codes": []
                }
        
            # Add the code
            if v3:
                grouped[v1]["children"][v2]["codes"].append({
                    "value": value,
                    "description": d3
                })
            else:
                grouped[v1]["children"][v2]["codes"].append({
                    "value": value,
                    "description": d2
                })
    
    return grouped


@router.get("/neris/location-uses")
async def get_location_uses(
    include_inactive: bool = False,
    db: Session = Depends(get_db)
):
    """
    Get NERIS location use codes.
    These form the use_type and use_subtype fields of the location use module.
    """
    query = """
        SELECT id, value, description_1, description_2, 
               value_1, value_2, active
        FROM neris_codes 
        WHERE category = 'type_location_use'
    """
    if not include_inactive:
        query += " AND active = true"
    query += " ORDER BY value_1, value_2"
    
    result = db.execute(text(query))
    
    codes = []
    for r in result:
        if r[3]:
            display = f"{r[2]} > {r[3]}"
        else:
            display = r[2] or r[1]
        
        codes.append({
            "id": r[0],
            "value": r[1],
            "display": display,
            "use_type": r[4],      # For building the module
            "use_subtype": r[5],
            "active": r[6]
        })
    
    return codes


@router.get("/neris/location-uses/by-category")
async def get_location_uses_by_category(db: Session = Depends(get_db)):
    """Get location uses grouped by type"""
    result = db.execute(text("""
        SELECT value, value_1, value_2, description_1, description_2
        FROM neris_codes 
        WHERE category = 'type_location_use' AND active = true
        ORDER BY value_1, value_2
    """))
    
    grouped = {}
    for r in result:
        value, v1, v2, d1, d2 = r
        
        if v1 not in grouped:
            grouped[v1] = {
                "description": d1,
                "subtypes": []
            }
        
        if v2:
            grouped[v1]["subtypes"].append({
                "value": value,
                "use_type": v1,
                "use_subtype": v2,
                "description": d2
            })
    
    return grouped


@router.get("/neris/actions-taken")
async def get_actions_taken(
    include_inactive: bool = False,
    db: Session = Depends(get_db)
):
    """Get NERIS action/tactic codes"""
    query = """
        SELECT id, value, description_1, description_2, description_3,
               value_1, value_2, value_3, active
        FROM neris_codes 
        WHERE category = 'type_action_tactic'
    """
    if not include_inactive:
        query += " AND active = true"
    query += " ORDER BY value_1, value_2, value_3"
    
    result = db.execute(text(query))
    
    codes = []
    for r in result:
        if r[4]:
            display = f"{r[2]} > {r[3]} > {r[4]}"
        elif r[3]:
            display = f"{r[2]} > {r[3]}"
        else:
            display = r[2] or r[1]
        
        codes.append({
            "id": r[0],
            "value": r[1],
            "display": display,
            "value_1": r[5],
            "value_2": r[6],
            "value_3": r[7],
            "active": r[8]
        })
    
    return codes


@router.get("/neris/actions-taken/by-category")
async def get_actions_taken_by_category(db: Session = Depends(get_db)):
    """Get actions grouped by category"""
    result = db.execute(text("""
        SELECT value, value_1, value_2, value_3,
               description_1, description_2, description_3
        FROM neris_codes 
        WHERE category = 'type_action_tactic' AND active = true
        ORDER BY value_1, value_2, value_3
    """))
    
    grouped = {}
    for r in result:
        value, v1, v2, v3, d1, d2, d3 = r
        
        if v1 not in grouped:
            grouped[v1] = {"description": d1}
        
        if v2:
            if "children" not in grouped[v1]:
                grouped[v1]["children"] = {}
            if v2 not in grouped[v1]["children"]:
                grouped[v1]["children"][v2] = {"description": d2, "codes": []}
        
            if v3:
                grouped[v1]["children"][v2]["codes"].append({
                    "value": value,
                    "description": d3
                })
            else:
                grouped[v1]["children"][v2]["codes"].append({
                    "value": value,
                    "description": d2
                })
    
    return grouped


@router.get("/neris/unit-types")
async def get_unit_types(db: Session = Depends(get_db)):
    """Get NERIS unit types for apparatus mapping"""
    result = db.execute(text("""
        SELECT id, value, COALESCE(description, value) as description
        FROM neris_codes 
        WHERE category = 'type_unit' AND active = true
        ORDER BY value
    """))
    
    return [
        {"id": r[0], "value": r[1], "description": r[2]}
        for r in result
    ]


@router.get("/neris/aid-types")
async def get_aid_types(db: Session = Depends(get_db)):
    """Get NERIS mutual aid types"""
    result = db.execute(text("""
        SELECT value, COALESCE(description, value) as description
        FROM neris_codes 
        WHERE category = 'type_aid' AND active = true
        ORDER BY value
    """))
    
    return [{"value": r[0], "description": r[1]} for r in result]


@router.get("/neris/aid-directions")
async def get_aid_directions(db: Session = Depends(get_db)):
    """Get NERIS aid direction codes"""
    result = db.execute(text("""
        SELECT value, COALESCE(description, value) as description
        FROM neris_codes 
        WHERE category = 'type_aid_direction' AND active = true
        ORDER BY value
    """))
    
    return [{"value": r[0], "description": r[1]} for r in result]


@router.get("/neris/vacancy-types")
async def get_vacancy_types(db: Session = Depends(get_db)):
    """Get NERIS vacancy status codes for location use module"""
    result = db.execute(text("""
        SELECT value, COALESCE(description, value) as description
        FROM neris_codes 
        WHERE category = 'type_vacancy' AND active = true
        ORDER BY value
    """))
    
    return [{"value": r[0], "description": r[1]} for r in result]


# ============================================================================
# MUNICIPALITIES
# ============================================================================

@router.get("/municipalities")
async def get_municipalities(
    include_inactive: bool = False,
    db: Session = Depends(get_db)
):
    """Get all municipalities"""
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
    """Get municipality by CAD code"""
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
    """Create municipality"""
    code = data.code.upper().strip()
    
    existing = db.execute(
        text("SELECT id FROM municipalities WHERE code = :code"),
        {"code": code}
    ).fetchone()
    
    if existing:
        raise HTTPException(status_code=400, detail="Municipality already exists")
    
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
    """Update municipality"""
    updates = []
    params = {"id": municipality_id}
    
    if data.name is not None:
        updates.append("name = :name")
        params["name"] = data.name
    
    if data.display_name is not None:
        updates.append("display_name = :display_name")
        params["display_name"] = data.display_name
        if data.name is None:
            updates.append("name = :display_name")
    
    if data.subdivision_type is not None:
        updates.append("subdivision_type = :subdivision_type")
        params["subdivision_type"] = data.subdivision_type
    
    if data.active is not None:
        updates.append("active = :active")
        params["active"] = data.active
    
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
    """Soft delete municipality"""
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
    """Auto-create municipality from CAD code if it doesn't exist"""
    code = code.upper().strip()
    
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
# CAD TYPE MAPPINGS (Fire/EMS Classification)
# ============================================================================

@router.get("/cad-type-mappings")
async def list_cad_type_mappings(db: Session = Depends(get_db)):
    """List all CAD type to category mappings"""
    mappings = db.query(CadTypeMapping).order_by(
        CadTypeMapping.cad_event_type,
        CadTypeMapping.cad_event_subtype
    ).all()
    
    return {
        "mappings": [
            {
                "id": m.id,
                "cad_event_type": m.cad_event_type,
                "cad_event_subtype": m.cad_event_subtype,
                "call_category": m.call_category,
                "auto_created": m.auto_created,
                "created_at": format_utc_iso(m.created_at),
                "updated_at": format_utc_iso(m.updated_at),
            }
            for m in mappings
        ]
    }


@router.get("/cad-type-mappings/lookup")
async def lookup_cad_type_mapping(
    event_type: str,
    event_subtype: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Look up or create category mapping for a CAD event type.
    Used by CAD listener to determine Fire vs EMS classification.
    """
    # Try exact match first
    mapping = db.query(CadTypeMapping).filter(
        CadTypeMapping.cad_event_type == event_type,
        CadTypeMapping.cad_event_subtype == event_subtype
    ).first()
    
    if not mapping and event_subtype:
        # Try without subtype
        mapping = db.query(CadTypeMapping).filter(
            CadTypeMapping.cad_event_type == event_type,
            CadTypeMapping.cad_event_subtype.is_(None)
        ).first()
    
    if mapping:
        return {
            "id": mapping.id,
            "cad_event_type": mapping.cad_event_type,
            "cad_event_subtype": mapping.cad_event_subtype,
            "call_category": mapping.call_category,
            "auto_created": mapping.auto_created,
            "found": True
        }
    
    # No mapping found - create one with default logic
    event_type_upper = (event_type or '').upper()
    default_category = 'EMS' if event_type_upper.startswith('MEDICAL') else 'FIRE'
    
    new_mapping = CadTypeMapping(
        cad_event_type=event_type,
        cad_event_subtype=event_subtype,
        call_category=default_category,
        auto_created=True
    )
    db.add(new_mapping)
    db.commit()
    db.refresh(new_mapping)
    
    return {
        "id": new_mapping.id,
        "cad_event_type": new_mapping.cad_event_type,
        "cad_event_subtype": new_mapping.cad_event_subtype,
        "call_category": new_mapping.call_category,
        "auto_created": True,
        "found": False,
        "created": True
    }


@router.put("/cad-type-mappings/{mapping_id}")
async def update_cad_type_mapping(
    mapping_id: int,
    call_category: str,
    db: Session = Depends(get_db)
):
    """Update a CAD type mapping"""
    mapping = db.query(CadTypeMapping).filter(CadTypeMapping.id == mapping_id).first()
    
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    if call_category not in ('FIRE', 'EMS'):
        raise HTTPException(status_code=400, detail="Category must be FIRE or EMS")
    
    mapping.call_category = call_category
    mapping.auto_created = False  # Mark as user-modified
    mapping.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {
        "id": mapping.id,
        "cad_event_type": mapping.cad_event_type,
        "cad_event_subtype": mapping.cad_event_subtype,
        "call_category": mapping.call_category,
        "auto_created": mapping.auto_created
    }


@router.delete("/cad-type-mappings/{mapping_id}")
async def delete_cad_type_mapping(
    mapping_id: int,
    db: Session = Depends(get_db)
):
    """Delete a CAD type mapping"""
    mapping = db.query(CadTypeMapping).filter(CadTypeMapping.id == mapping_id).first()
    
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    db.delete(mapping)
    db.commit()
    
    return {"status": "ok", "deleted_id": mapping_id}
