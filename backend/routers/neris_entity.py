"""
NERIS Entity Router

Manages the department's NERIS Entity profile: the Entity record, its Stations,
and the Units within each Station.

All column names map 1:1 to the NERIS API spec:
  https://api.neris.fsri.org/v1/openapi.json (v1.4.35)

NERIS data model:
  Entity   (neris_entity)   — one per tenant, identified by fd_neris_id
  Station  (neris_stations) — one or more per Entity
  Unit     (neris_units)    — one or more per Station, cad_designation_1 MUST match CAD exactly

Routes:
  GET    /api/neris/entity                  — full entity + stations + units
  PUT    /api/neris/entity                  — update entity fields
  POST   /api/neris/stations                — add a station
  PUT    /api/neris/stations/{id}           — update a station
  DELETE /api/neris/stations/{id}           — remove a station
  POST   /api/neris/stations/{id}/units     — add a unit to a station
  PUT    /api/neris/units/{id}              — update a unit
  DELETE /api/neris/units/{id}             — remove a unit
  POST   /api/neris/entity/validate         — local completeness check
  POST   /api/neris/entity/submit           — build Entity payload + POST to NERIS API
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List, Any, Dict
from pydantic import BaseModel
from datetime import datetime, timezone
import logging

from database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["NERIS Entity"])


# =============================================================================
# PYDANTIC SCHEMAS
# All field names match NERIS spec column names in neris_entity, neris_stations,
# neris_units after migration 044.
# =============================================================================

class EntityUpdate(BaseModel):
    # NERIS identifier — used in URL path for API calls, not request body
    fd_neris_id: Optional[str] = None

    # Top-level fields per DepartmentPayload
    name: Optional[str] = None
    internal_id: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    department_type: Optional[str] = None      # TypeDeptValue: COMBINATION, CAREER, VOLUNTEER
    entity_type: Optional[str] = None          # TypeEntityValue
    rms_software: Optional[str] = None
    time_zone: Optional[str] = None
    continue_edu: Optional[bool] = None
    fips_code: Optional[str] = None

    # Physical address
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    location: Optional[Dict[str, Any]] = None  # { lat, lng }

    # Mailing address
    mail_address_line_1: Optional[str] = None
    mail_address_line_2: Optional[str] = None
    mail_city: Optional[str] = None
    mail_state: Optional[str] = None
    mail_zip_code: Optional[str] = None

    # Services arrays
    fire_services: Optional[List[str]] = None
    ems_services: Optional[List[str]] = None
    investigation_services: Optional[List[str]] = None

    # Nested JSONB objects — stored as-is, submitted to NERIS as nested objects
    dispatch: Optional[Dict[str, Any]] = None      # DepartmentDispatchPayload
    staffing: Optional[Dict[str, Any]] = None      # StaffingPayload
    assessment: Optional[Dict[str, Any]] = None    # AssessmentPayload
    shift: Optional[Dict[str, Any]] = None         # ShiftPayload
    population: Optional[Dict[str, Any]] = None    # PopulationPayload

    # Internal tracking
    neris_annual_renewal_month: Optional[int] = None


class StationCreate(BaseModel):
    # NERIS spec fields per StationPayload
    station_id: Optional[str] = None
    internal_id: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    staffing: Optional[int] = None
    location: Optional[Dict[str, Any]] = None  # { lat, lng }

    # Local display only — not in NERIS spec
    station_name: Optional[str] = None
    display_order: Optional[int] = 0


class StationUpdate(StationCreate):
    pass


class UnitCreate(BaseModel):
    # NERIS spec fields per UnitPayload
    cad_designation_1: Optional[str] = None   # Must match CAD exactly — required by NERIS
    cad_designation_2: Optional[str] = None
    type: Optional[str] = None                # TypeUnitValue — loaded from neris_codes table
    staffing: Optional[int] = None
    dedicated_staffing: Optional[bool] = False
    neris_id: Optional[str] = None            # Assigned by NERIS after submission

    # Internal FK — not submitted to NERIS
    apparatus_id: Optional[int] = None
    display_order: Optional[int] = 0


class UnitUpdate(UnitCreate):
    pass


# =============================================================================
# HELPERS
# =============================================================================

def _get_entity(db: Session) -> dict | None:
    """Get the first (only) entity row for this tenant."""
    row = db.execute(text("""
        SELECT id, fd_neris_id,
               name, internal_id, email, website,
               department_type, entity_type, rms_software,
               time_zone, continue_edu, fips_code,
               address_line_1, address_line_2, city, state, zip_code, location,
               mail_address_line_1, mail_address_line_2, mail_city, mail_state, mail_zip_code,
               fire_services, ems_services, investigation_services,
               dispatch, staffing, assessment, shift, population,
               fd_station_count,
               neris_entity_submitted_at, neris_entity_status,
               neris_annual_renewal_month,
               created_at, updated_at
        FROM neris_entity
        LIMIT 1
    """)).fetchone()

    if not row:
        return None

    cols = [
        "id", "fd_neris_id",
        "name", "internal_id", "email", "website",
        "department_type", "entity_type", "rms_software",
        "time_zone", "continue_edu", "fips_code",
        "address_line_1", "address_line_2", "city", "state", "zip_code", "location",
        "mail_address_line_1", "mail_address_line_2", "mail_city", "mail_state", "mail_zip_code",
        "fire_services", "ems_services", "investigation_services",
        "dispatch", "staffing", "assessment", "shift", "population",
        "fd_station_count",
        "neris_entity_submitted_at", "neris_entity_status",
        "neris_annual_renewal_month",
        "created_at", "updated_at",
    ]

    d = dict(zip(cols, row))
    for k in ("neris_entity_submitted_at", "created_at", "updated_at"):
        if d[k] and hasattr(d[k], "isoformat"):
            d[k] = d[k].isoformat()
    return d


def _get_stations(db: Session, entity_id: int) -> list:
    """Get all stations for an entity, ordered by display_order."""
    rows = db.execute(text("""
        SELECT id, entity_id,
               station_id, internal_id, neris_id,
               address_line_1, address_line_2, city, state, zip_code,
               staffing, location, station_name,
               display_order, created_at, updated_at
        FROM neris_stations
        WHERE entity_id = :entity_id
        ORDER BY display_order, id
    """), {"entity_id": entity_id}).fetchall()

    cols = [
        "id", "entity_id",
        "station_id", "internal_id", "neris_id",
        "address_line_1", "address_line_2", "city", "state", "zip_code",
        "staffing", "location", "station_name",
        "display_order", "created_at", "updated_at",
    ]

    result = []
    for row in rows:
        d = dict(zip(cols, row))
        for k in ("created_at", "updated_at"):
            if d[k] and hasattr(d[k], "isoformat"):
                d[k] = d[k].isoformat()
        d["units"] = _get_units(db, d["id"])
        result.append(d)
    return result


def _get_units(db: Session, station_id: int) -> list:
    """Get all units for a station, joined with apparatus for display."""
    rows = db.execute(text("""
        SELECT nu.id, nu.station_id,
               nu.cad_designation_1, nu.cad_designation_2,
               nu.type, nu.staffing, nu.dedicated_staffing,
               nu.neris_id, nu.apparatus_id, nu.display_order,
               nu.created_at, nu.updated_at,
               a.unit_designator, a.name AS apparatus_name
        FROM neris_units nu
        LEFT JOIN apparatus a ON nu.apparatus_id = a.id
        WHERE nu.station_id = :station_id
        ORDER BY nu.display_order, nu.id
    """), {"station_id": station_id}).fetchall()

    cols = [
        "id", "station_id",
        "cad_designation_1", "cad_designation_2",
        "type", "staffing", "dedicated_staffing",
        "neris_id", "apparatus_id", "display_order",
        "created_at", "updated_at",
        "unit_designator", "apparatus_name",
    ]

    result = []
    for row in rows:
        d = dict(zip(cols, row))
        for k in ("created_at", "updated_at"):
            if d[k] and hasattr(d[k], "isoformat"):
                d[k] = d[k].isoformat()
        result.append(d)
    return result


def _get_apparatus_options(db: Session) -> list:
    """
    Return active APPARATUS-category units for the unit-linking dropdown.
    Only id, unit_designator, name — neris_unit_type does not exist on apparatus.
    The unit type (TypeUnitValue) is set on neris_units.type, not on apparatus.
    """
    rows = db.execute(text("""
        SELECT id, unit_designator, name
        FROM apparatus
        WHERE unit_category = 'APPARATUS' AND active = true
        ORDER BY display_order, unit_designator
    """)).fetchall()
    return [
        {"id": r[0], "unit_designator": r[1], "name": r[2]}
        for r in rows
    ]


def _update_station_count(db: Session):
    """Keep fd_station_count in sync with actual station rows."""
    entity = _get_entity(db)
    if not entity:
        return
    count = db.execute(text(
        "SELECT COUNT(*) FROM neris_stations WHERE entity_id = :eid"
    ), {"eid": entity["id"]}).scalar()
    db.execute(text(
        "UPDATE neris_entity SET fd_station_count = :count WHERE id = :id"
    ), {"count": count, "id": entity["id"]})
    db.commit()


# =============================================================================
# ENTITY ENDPOINTS
# =============================================================================

@router.get("/entity")
async def get_entity(db: Session = Depends(get_db)):
    """Get the full Entity record with nested stations and units."""
    entity = _get_entity(db)
    if not entity:
        return {
            "entity": None,
            "stations": [],
            "apparatus_options": _get_apparatus_options(db),
        }
    entity["stations"] = _get_stations(db, entity["id"])
    return {
        "entity": entity,
        "stations": entity["stations"],
        "apparatus_options": _get_apparatus_options(db),
    }


@router.put("/entity")
async def update_entity(data: EntityUpdate, db: Session = Depends(get_db)):
    """Update Entity fields. Creates a new entity row if none exists."""
    entity = _get_entity(db)

    # Build update dict from non-None fields only
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if entity:
        set_parts = ", ".join(f"{k} = :{k}" for k in updates)
        updates["id"] = entity["id"]
        db.execute(text(f"""
            UPDATE neris_entity
            SET {set_parts}, updated_at = NOW()
            WHERE id = :id
        """), updates)
    else:
        # Insert new entity row
        cols = ", ".join(updates.keys())
        vals = ", ".join(f":{k}" for k in updates.keys())
        db.execute(text(f"""
            INSERT INTO neris_entity ({cols}, rms_software, neris_entity_status, created_at, updated_at)
            VALUES ({vals}, 'CADReport', 'draft', NOW(), NOW())
        """), updates)

    db.commit()
    _update_station_count(db)
    return {"status": "ok", "entity": _get_entity(db)}


# =============================================================================
# STATION ENDPOINTS
# =============================================================================

@router.post("/stations")
async def add_station(data: StationCreate, db: Session = Depends(get_db)):
    """Add a station to the Entity."""
    entity = _get_entity(db)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not configured yet. Set up the Entity first.")

    row = db.execute(text("""
        INSERT INTO neris_stations (
            entity_id, station_id, internal_id,
            address_line_1, address_line_2, city, state, zip_code,
            staffing, location, station_name, display_order
        ) VALUES (
            :entity_id, :station_id, :internal_id,
            :address_line_1, :address_line_2, :city, :state, :zip_code,
            :staffing, :location, :station_name, :display_order
        )
        RETURNING id
    """), {
        "entity_id": entity["id"],
        "station_id": data.station_id,
        "internal_id": data.internal_id,
        "address_line_1": data.address_line_1,
        "address_line_2": data.address_line_2,
        "city": data.city,
        "state": data.state,
        "zip_code": data.zip_code,
        "staffing": data.staffing,
        "location": data.location,
        "station_name": data.station_name,
        "display_order": data.display_order or 0,
    }).fetchone()

    db.commit()
    _update_station_count(db)
    return {"status": "ok", "id": row[0]}


@router.put("/stations/{station_id}")
async def update_station(station_id: int, data: StationUpdate, db: Session = Depends(get_db)):
    """Update a station's fields."""
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_parts = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = station_id
    result = db.execute(text(f"""
        UPDATE neris_stations
        SET {set_parts}, updated_at = NOW()
        WHERE id = :id
        RETURNING id
    """), updates)
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Station not found")
    db.commit()
    return {"status": "ok"}


@router.delete("/stations/{station_id}")
async def delete_station(station_id: int, db: Session = Depends(get_db)):
    """Remove a station (cascades to its units)."""
    result = db.execute(text(
        "DELETE FROM neris_stations WHERE id = :id RETURNING id"
    ), {"id": station_id})
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Station not found")
    db.commit()
    _update_station_count(db)
    return {"status": "ok"}


# =============================================================================
# UNIT ENDPOINTS
# =============================================================================

@router.post("/stations/{station_id}/units")
async def add_unit(station_id: int, data: UnitCreate, db: Session = Depends(get_db)):
    """Add a unit to a station."""
    exists = db.execute(text(
        "SELECT 1 FROM neris_stations WHERE id = :id"
    ), {"id": station_id}).fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail="Station not found")

    # If apparatus_id provided and cad_designation_1 not set, auto-fill from unit_designator
    cad_1 = data.cad_designation_1
    if data.apparatus_id and not cad_1:
        app = db.execute(text(
            "SELECT unit_designator FROM apparatus WHERE id = :id"
        ), {"id": data.apparatus_id}).fetchone()
        if app:
            cad_1 = app[0]

    row = db.execute(text("""
        INSERT INTO neris_units (
            station_id, cad_designation_1, cad_designation_2,
            type, staffing, dedicated_staffing,
            apparatus_id, display_order
        ) VALUES (
            :station_id, :cad_designation_1, :cad_designation_2,
            :type, :staffing, :dedicated_staffing,
            :apparatus_id, :display_order
        )
        RETURNING id
    """), {
        "station_id": station_id,
        "cad_designation_1": cad_1,
        "cad_designation_2": data.cad_designation_2,
        "type": data.type,
        "staffing": data.staffing,
        "dedicated_staffing": data.dedicated_staffing or False,
        "apparatus_id": data.apparatus_id,
        "display_order": data.display_order or 0,
    }).fetchone()

    db.commit()
    return {"status": "ok", "id": row[0]}


@router.put("/units/{unit_id}")
async def update_unit(unit_id: int, data: UnitUpdate, db: Session = Depends(get_db)):
    """Update a unit's fields."""
    updates = {k: v for k, v in data.dict().items() if v is not None}

    # If apparatus_id updated and cad_designation_1 not in payload, auto-fill
    if "apparatus_id" in updates and "cad_designation_1" not in updates:
        app = db.execute(text(
            "SELECT unit_designator FROM apparatus WHERE id = :id"
        ), {"id": updates["apparatus_id"]}).fetchone()
        if app:
            updates["cad_designation_1"] = app[0]

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_parts = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = unit_id
    result = db.execute(text(f"""
        UPDATE neris_units
        SET {set_parts}, updated_at = NOW()
        WHERE id = :id
        RETURNING id
    """), updates)
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Unit not found")
    db.commit()
    return {"status": "ok"}


@router.delete("/units/{unit_id}")
async def delete_unit(unit_id: int, db: Session = Depends(get_db)):
    """Remove a unit."""
    result = db.execute(text(
        "DELETE FROM neris_units WHERE id = :id RETURNING id"
    ), {"id": unit_id})
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Unit not found")
    db.commit()
    return {"status": "ok"}


# =============================================================================
# VALIDATION
# =============================================================================

@router.post("/entity/validate")
async def validate_entity(db: Session = Depends(get_db)):
    """
    Local completeness check for the Entity before submission to NERIS.
    Returns list of errors and warnings.
    Required fields per NERIS CreateStationPayload and CreateUnitPayload.
    """
    errors = []
    warnings = []

    entity = _get_entity(db)
    if not entity:
        return {"valid": False, "errors": ["Entity not configured"], "warnings": []}

    # Required entity fields
    if not entity.get("fd_neris_id"):
        errors.append("fd_neris_id is required")
    if not entity.get("name"):
        errors.append("name (Department Name) is required")
    if not entity.get("address_line_1"):
        errors.append("address_line_1 is required")
    if not entity.get("city"):
        errors.append("city is required")
    if not entity.get("state"):
        errors.append("state is required")
    if not entity.get("zip_code"):
        errors.append("zip_code is required")

    # Recommended entity fields
    if not entity.get("department_type"):
        warnings.append("department_type (COMBINATION / CAREER / VOLUNTEER) is recommended")
    if not entity.get("entity_type"):
        warnings.append("entity_type is recommended")
    dispatch = entity.get("dispatch") or {}
    if not dispatch.get("center_id"):
        warnings.append("dispatch.center_id (PSAP FCC ID) is recommended")

    # Station checks
    stations = _get_stations(db, entity["id"])
    if not stations:
        errors.append("At least one station is required")
    else:
        for station in stations:
            sid = station.get("station_id") or f"Station #{station['id']}"
            if not station.get("station_id"):
                errors.append(f"{sid}: station_id is required")
            if not station.get("address_line_1"):
                warnings.append(f"{sid}: address_line_1 is recommended")

            units = station.get("units", [])
            if not units:
                errors.append(f"{sid}: at least one unit is required")
            else:
                for unit in units:
                    uid = unit.get("cad_designation_1") or f"Unit #{unit['id']}"
                    # cad_designation_1, staffing, type are required by CreateUnitPayload
                    if not unit.get("cad_designation_1"):
                        errors.append(f"{sid} / {uid}: cad_designation_1 (CAD ID) is required")
                    if unit.get("staffing") is None:
                        errors.append(f"{sid} / {uid}: staffing is required")
                    if not unit.get("type"):
                        errors.append(f"{sid} / {uid}: type (TypeUnitValue) is required")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }


# =============================================================================
# ENTITY SUBMISSION TO NERIS
# =============================================================================

@router.post("/entity/submit")
async def submit_entity(db: Session = Depends(get_db)):
    """
    Build the NERIS Entity payload and POST it to the NERIS API.
    Runs local validation first — blocks submission if errors exist.
    """
    validation = await validate_entity(db)
    if not validation["valid"]:
        return {
            "success": False,
            "message": "Validation failed — fix errors before submitting",
            "errors": validation["errors"],
            "warnings": validation["warnings"],
        }

    entity = _get_entity(db)
    stations = _get_stations(db, entity["id"])

    payload = _build_entity_payload(entity, stations)

    # Load NERIS credentials from tenant settings
    creds = {}
    rows = db.execute(text(
        "SELECT key, value FROM settings WHERE category = 'neris' AND key IN ('client_id','client_secret','environment')"
    )).fetchall()
    for row in rows:
        creds[row[0]] = row[1]

    if not creds.get("client_id") or not creds.get("client_secret"):
        return {
            "success": False,
            "message": "NERIS API credentials not configured (client_id / client_secret missing)",
            "errors": ["Missing credentials"],
            "warnings": validation["warnings"],
        }

    from services.neris.api_client import NerisApiClient, NerisApiError
    client = NerisApiClient(
        client_id=creds["client_id"],
        client_secret=creds["client_secret"],
        environment=creds.get("environment", "test"),
    )

    try:
        result = await client.submit_entity(entity["fd_neris_id"], payload)
    except NerisApiError as e:
        db.execute(text("""
            UPDATE neris_entity SET neris_entity_status = 'error', updated_at = NOW() WHERE id = :id
        """), {"id": entity["id"]})
        db.commit()
        return {
            "success": False,
            "api_error": e.detail,
            "body": e.body,
            "errors": [],
            "warnings": validation["warnings"],
        }

    # Record successful submission
    db.execute(text("""
        UPDATE neris_entity
        SET neris_entity_status = 'submitted',
            neris_entity_submitted_at = :now,
            updated_at = NOW()
        WHERE id = :id
    """), {"id": entity["id"], "now": datetime.now(timezone.utc)})
    db.commit()

    return {
        "success": True,
        "body": result,
        "warnings": validation["warnings"],
    }


def _build_entity_payload(entity: dict, stations: list) -> dict:
    """
    Build the NERIS DepartmentPayload dict from entity + stations data.
    Field names match the NERIS spec exactly.
    Source: https://api.neris.fsri.org/v1/openapi.json DepartmentPayload
    """
    payload = {}

    # Top-level scalar fields
    for f in (
        "name", "internal_id", "email", "website",
        "department_type", "entity_type", "rms_software",
        "time_zone", "continue_edu", "fips_code",
    ):
        if entity.get(f) is not None:
            payload[f] = entity[f]

    # Physical address
    for f in ("address_line_1", "address_line_2", "city", "state", "zip_code"):
        if entity.get(f):
            payload[f] = entity[f]

    # location GeoPoint: { lat, lng }
    loc = entity.get("location")
    if loc and loc.get("lat") and loc.get("lng"):
        payload["location"] = {"lat": float(loc["lat"]), "lng": float(loc["lng"])}

    # Mailing address
    for f in ("mail_address_line_1", "mail_address_line_2", "mail_city", "mail_state", "mail_zip_code"):
        if entity.get(f):
            payload[f] = entity[f]

    # Services arrays
    for f in ("fire_services", "ems_services", "investigation_services"):
        if entity.get(f):
            payload[f] = entity[f]

    # Nested JSONB objects — submit as-is if present
    for f in ("dispatch", "staffing", "assessment", "shift", "population"):
        if entity.get(f):
            payload[f] = entity[f]

    # Stations
    payload["stations"] = []
    for station in stations:
        s = {}
        for f in ("station_id", "internal_id", "address_line_1", "address_line_2",
                  "city", "state", "zip_code", "staffing"):
            if station.get(f) is not None:
                s[f] = station[f]

        # station location GeoPoint
        sloc = station.get("location")
        if sloc and sloc.get("lat") and sloc.get("lng"):
            s["location"] = {"lat": float(sloc["lat"]), "lng": float(sloc["lng"])}

        # Units within station
        s["units"] = []
        for unit in station.get("units", []):
            u = {}
            # cad_designation_1, staffing, type are required by CreateUnitPayload
            for f in ("cad_designation_1", "cad_designation_2", "type", "staffing"):
                if unit.get(f) is not None:
                    u[f] = unit[f]
            if unit.get("dedicated_staffing") is not None:
                u["dedicated_staffing"] = unit["dedicated_staffing"]
            if u:
                s["units"].append(u)

        payload["stations"].append(s)

    return payload
