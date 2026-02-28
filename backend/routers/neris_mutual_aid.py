"""
Mutual Aid Departments & Units Router

CRUD for managing departments this tenant works with and their apparatus.
Supports NERIS API import when NERIS feature is enabled.
Works for all tenants regardless of NERIS toggle.

Endpoints:
    GET    /api/admin/neris-mutual-aid/departments          - List departments with unit counts
    POST   /api/admin/neris-mutual-aid/departments          - Add department
    PUT    /api/admin/neris-mutual-aid/departments/{id}     - Update department
    DELETE /api/admin/neris-mutual-aid/departments/{id}     - Deactivate department

    GET    /api/admin/neris-mutual-aid/departments/{id}/units  - List units for department
    POST   /api/admin/neris-mutual-aid/departments/{id}/units  - Add unit
    PUT    /api/admin/neris-mutual-aid/units/{id}              - Update unit
    DELETE /api/admin/neris-mutual-aid/units/{id}              - Delete unit

    POST   /api/admin/neris-mutual-aid/search-neris            - Search NERIS API for departments
"""

import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# SCHEMAS
# =============================================================================

class DepartmentCreate(BaseModel):
    name: str
    station_number: Optional[str] = None
    neris_entity_id: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    department_type: Optional[str] = None
    import_source: str = "manual"


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    station_number: Optional[str] = None
    neris_entity_id: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    department_type: Optional[str] = None
    is_active: Optional[bool] = None


class UnitCreate(BaseModel):
    unit_designator: str
    neris_unit_type: Optional[str] = None
    cad_prefix: Optional[str] = None


class UnitUpdate(BaseModel):
    unit_designator: Optional[str] = None
    neris_unit_type: Optional[str] = None
    cad_prefix: Optional[str] = None
    is_active: Optional[bool] = None


class NerisImportRequest(BaseModel):
    """Import selected departments from a NERIS search."""
    departments: List[DepartmentCreate]


# =============================================================================
# DEPARTMENTS
# =============================================================================

@router.get("/departments")
async def list_departments(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    """List all mutual aid departments with unit counts."""
    active_filter = "" if include_inactive else "WHERE d.is_active = true"

    result = db.execute(text(f"""
        SELECT d.id, d.neris_entity_id, d.name, d.station_number,
               d.address, d.city, d.state, d.zip_code,
               d.department_type, d.import_source, d.is_active,
               d.created_at, d.updated_at,
               COALESCE(u.unit_count, 0) as unit_count
        FROM neris_mutual_aid_departments d
        LEFT JOIN (
            SELECT department_id, COUNT(*) as unit_count
            FROM neris_mutual_aid_units
            WHERE is_active = true
            GROUP BY department_id
        ) u ON u.department_id = d.id
        {active_filter}
        ORDER BY d.name
    """))

    return [
        {
            "id": r[0],
            "neris_entity_id": r[1],
            "name": r[2],
            "station_number": r[3],
            "address": r[4],
            "city": r[5],
            "state": r[6],
            "zip_code": r[7],
            "department_type": r[8],
            "import_source": r[9],
            "is_active": r[10],
            "created_at": r[11].isoformat() if r[11] else None,
            "updated_at": r[12].isoformat() if r[12] else None,
            "unit_count": r[13],
        }
        for r in result
    ]


@router.post("/departments")
async def create_department(
    dept: DepartmentCreate,
    db: Session = Depends(get_db),
):
    """Create a mutual aid department."""
    # Check for duplicate neris_entity_id
    if dept.neris_entity_id:
        existing = db.execute(
            text("SELECT id FROM neris_mutual_aid_departments WHERE neris_entity_id = :eid"),
            {"eid": dept.neris_entity_id}
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail=f"Department with NERIS Entity ID {dept.neris_entity_id} already exists")

    result = db.execute(text("""
        INSERT INTO neris_mutual_aid_departments
            (name, station_number, neris_entity_id, address, city, state, zip_code, department_type, import_source)
        VALUES
            (:name, :station_number, :neris_entity_id, :address, :city, :state, :zip_code, :department_type, :import_source)
        RETURNING id
    """), {
        "name": dept.name.strip(),
        "station_number": (dept.station_number or "").strip() or None,
        "neris_entity_id": (dept.neris_entity_id or "").strip() or None,
        "address": (dept.address or "").strip() or None,
        "city": (dept.city or "").strip() or None,
        "state": (dept.state or "").strip().upper() or None,
        "zip_code": (dept.zip_code or "").strip() or None,
        "department_type": (dept.department_type or "").strip() or None,
        "import_source": dept.import_source,
    })
    new_id = result.fetchone()[0]
    db.commit()

    logger.info(f"Created mutual aid department: {dept.name} (id={new_id})")
    return {"id": new_id, "name": dept.name}


@router.put("/departments/{dept_id}")
async def update_department(
    dept_id: int,
    update: DepartmentUpdate,
    db: Session = Depends(get_db),
):
    """Update a mutual aid department."""
    existing = db.execute(
        text("SELECT id FROM neris_mutual_aid_departments WHERE id = :id"),
        {"id": dept_id}
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Department not found")

    set_clauses = ["updated_at = NOW()"]
    params = {"id": dept_id}

    field_map = {
        "name": update.name,
        "station_number": update.station_number,
        "neris_entity_id": update.neris_entity_id,
        "address": update.address,
        "city": update.city,
        "state": update.state,
        "zip_code": update.zip_code,
        "department_type": update.department_type,
        "is_active": update.is_active,
    }

    for field, value in field_map.items():
        if value is not None:
            set_clauses.append(f"{field} = :{field}")
            params[field] = value.strip() if isinstance(value, str) else value

    db.execute(text(f"UPDATE neris_mutual_aid_departments SET {', '.join(set_clauses)} WHERE id = :id"), params)
    db.commit()

    logger.info(f"Updated mutual aid department {dept_id}")
    return {"id": dept_id, "updated": True}


@router.delete("/departments/{dept_id}")
async def deactivate_department(
    dept_id: int,
    db: Session = Depends(get_db),
):
    """Deactivate a mutual aid department (soft delete)."""
    result = db.execute(
        text("UPDATE neris_mutual_aid_departments SET is_active = false, updated_at = NOW() WHERE id = :id"),
        {"id": dept_id}
    )
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Department not found")

    logger.info(f"Deactivated mutual aid department {dept_id}")
    return {"id": dept_id, "deactivated": True}


# =============================================================================
# UNITS
# =============================================================================

@router.get("/departments/{dept_id}/units")
async def list_units(
    dept_id: int,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    """List units for a department."""
    # Verify department exists
    dept = db.execute(
        text("SELECT id, name FROM neris_mutual_aid_departments WHERE id = :id"),
        {"id": dept_id}
    ).fetchone()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    active_filter = "" if include_inactive else "AND is_active = true"

    result = db.execute(text(f"""
        SELECT id, unit_designator, neris_unit_type, cad_prefix, neris_unit_id,
               is_active, created_at, updated_at
        FROM neris_mutual_aid_units
        WHERE department_id = :dept_id {active_filter}
        ORDER BY unit_designator
    """), {"dept_id": dept_id})

    return {
        "department_id": dept_id,
        "department_name": dept[1],
        "units": [
            {
                "id": r[0],
                "unit_designator": r[1],
                "neris_unit_type": r[2],
                "cad_prefix": r[3],
                "neris_unit_id": r[4],
                "is_active": r[5],
                "created_at": r[6].isoformat() if r[6] else None,
                "updated_at": r[7].isoformat() if r[7] else None,
            }
            for r in result
        ],
    }


@router.post("/departments/{dept_id}/units")
async def create_unit(
    dept_id: int,
    unit: UnitCreate,
    db: Session = Depends(get_db),
):
    """Add a unit to a department."""
    # Verify department exists
    dept = db.execute(
        text("SELECT id FROM neris_mutual_aid_departments WHERE id = :id"),
        {"id": dept_id}
    ).fetchone()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    result = db.execute(text("""
        INSERT INTO neris_mutual_aid_units (department_id, unit_designator, neris_unit_type, cad_prefix)
        VALUES (:dept_id, :unit_designator, :neris_unit_type, :cad_prefix)
        RETURNING id
    """), {
        "dept_id": dept_id,
        "unit_designator": unit.unit_designator.strip(),
        "neris_unit_type": (unit.neris_unit_type or "").strip() or None,
        "cad_prefix": (unit.cad_prefix or "").strip() or None,
    })
    new_id = result.fetchone()[0]
    db.commit()

    logger.info(f"Created unit {unit.unit_designator} for department {dept_id} (id={new_id})")
    return {"id": new_id, "unit_designator": unit.unit_designator}


@router.put("/units/{unit_id}")
async def update_unit(
    unit_id: int,
    update: UnitUpdate,
    db: Session = Depends(get_db),
):
    """Update a mutual aid unit."""
    existing = db.execute(
        text("SELECT id FROM neris_mutual_aid_units WHERE id = :id"),
        {"id": unit_id}
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Unit not found")

    set_clauses = ["updated_at = NOW()"]
    params = {"id": unit_id}

    field_map = {
        "unit_designator": update.unit_designator,
        "neris_unit_type": update.neris_unit_type,
        "cad_prefix": update.cad_prefix,
        "is_active": update.is_active,
    }

    for field, value in field_map.items():
        if value is not None:
            set_clauses.append(f"{field} = :{field}")
            params[field] = value.strip() if isinstance(value, str) else value

    db.execute(text(f"UPDATE neris_mutual_aid_units SET {', '.join(set_clauses)} WHERE id = :id"), params)
    db.commit()

    logger.info(f"Updated mutual aid unit {unit_id}")
    return {"id": unit_id, "updated": True}


@router.delete("/units/{unit_id}")
async def delete_unit(
    unit_id: int,
    db: Session = Depends(get_db),
):
    """Delete a mutual aid unit."""
    existing = db.execute(
        text("SELECT id, unit_designator FROM neris_mutual_aid_units WHERE id = :id"),
        {"id": unit_id}
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Unit not found")

    db.execute(text("DELETE FROM neris_mutual_aid_units WHERE id = :id"), {"id": unit_id})
    db.commit()

    logger.info(f"Deleted mutual aid unit {unit_id} ({existing[1]})")
    return {"id": unit_id, "deleted": True, "unit_designator": existing[1]}


# =============================================================================
# NERIS API IMPORT
# =============================================================================

@router.post("/search-neris")
async def search_neris_departments(
    state: str = Query("PA", description="Two-letter state code"),
    name_filter: Optional[str] = Query(None, description="Filter by department name"),
    db: Session = Depends(get_db),
):
    """
    Search NERIS API for departments by state.
    Returns list for admin to pick from. Requires NERIS credentials in settings.
    """
    import httpx

    # Get NERIS credentials from settings
    creds = _get_neris_credentials(db)
    if not creds:
        raise HTTPException(status_code=400, detail="NERIS API credentials not configured")

    try:
        token = await _get_neris_token(creds)
    except Exception as e:
        logger.error(f"NERIS auth failed: {e}")
        raise HTTPException(status_code=502, detail=f"NERIS authentication failed: {str(e)}")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{creds['base_url']}/entity",
                params={"state": state.upper()},
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"NERIS API error: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NERIS API request failed: {str(e)}")

    # Extract department list from response
    entities = data if isinstance(data, list) else data.get("results", data.get("entities", []))

    results = []
    for entity in entities:
        name = entity.get("name", "")

        # Apply name filter if provided
        if name_filter and name_filter.lower() not in name.lower():
            continue

        # Check if already imported
        neris_id = entity.get("neris_id", "")
        already_imported = False
        if neris_id:
            existing = db.execute(
                text("SELECT id FROM neris_mutual_aid_departments WHERE neris_entity_id = :eid"),
                {"eid": neris_id}
            ).fetchone()
            already_imported = existing is not None

        results.append({
            "neris_entity_id": neris_id,
            "name": name,
            "address": entity.get("address_line_1") or entity.get("address", ""),
            "city": entity.get("city", ""),
            "state": entity.get("state", ""),
            "zip_code": entity.get("zip_code", ""),
            "department_type": entity.get("department_type", ""),
            "already_imported": already_imported,
        })

    return {
        "state": state.upper(),
        "total": len(results),
        "departments": results,
    }


@router.post("/import-neris")
async def import_neris_departments(
    request: NerisImportRequest,
    db: Session = Depends(get_db),
):
    """Import selected departments from NERIS search results."""
    imported = 0
    skipped = 0

    for dept in request.departments:
        # Skip if already exists
        if dept.neris_entity_id:
            existing = db.execute(
                text("SELECT id FROM neris_mutual_aid_departments WHERE neris_entity_id = :eid"),
                {"eid": dept.neris_entity_id}
            ).fetchone()
            if existing:
                skipped += 1
                continue

        db.execute(text("""
            INSERT INTO neris_mutual_aid_departments
                (name, neris_entity_id, address, city, state, zip_code, department_type, import_source)
            VALUES
                (:name, :neris_entity_id, :address, :city, :state, :zip_code, :department_type, 'neris_api')
        """), {
            "name": dept.name.strip(),
            "neris_entity_id": (dept.neris_entity_id or "").strip() or None,
            "address": (dept.address or "").strip() or None,
            "city": (dept.city or "").strip() or None,
            "state": (dept.state or "").strip().upper() or None,
            "zip_code": (dept.zip_code or "").strip() or None,
            "department_type": (dept.department_type or "").strip() or None,
        })
        imported += 1

    db.commit()
    logger.info(f"NERIS import: {imported} imported, {skipped} skipped (already exist)")

    return {"imported": imported, "skipped": skipped}


# =============================================================================
# NERIS AUTH HELPERS
# =============================================================================

def _get_neris_credentials(db: Session) -> Optional[dict]:
    """Pull NERIS API credentials from settings table."""
    from routers.settings import get_setting_value

    base_url = get_setting_value(db, 'neris', 'api_base_url', None)
    client_id = get_setting_value(db, 'neris', 'client_id', None)
    client_secret = get_setting_value(db, 'neris', 'client_secret', None)
    username = get_setting_value(db, 'neris', 'username', None)
    password = get_setting_value(db, 'neris', 'password', None)

    if not all([base_url, client_id, client_secret, username, password]):
        return None

    return {
        "base_url": base_url.rstrip("/"),
        "client_id": client_id,
        "client_secret": client_secret,
        "username": username,
        "password": password,
    }


async def _get_neris_token(creds: dict) -> str:
    """Authenticate with NERIS OAuth2 password grant and return access token."""
    import httpx

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{creds['base_url']}/token",
            data={
                "grant_type": "password",
                "username": creds["username"],
                "password": creds["password"],
                "client_id": creds["client_id"],
                "client_secret": creds["client_secret"],
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]
