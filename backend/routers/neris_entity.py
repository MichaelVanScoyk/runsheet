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
import json

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


# =============================================================================
# NERIS SYNC — SEARCH, PULL, AND APPLY
#
# Three routes:
#   GET  /api/neris/entity/search          — search NERIS by name or neris_id
#   POST /api/neris/entity/pull            — fetch full entity + compute diff
#   POST /api/neris/entity/pull/apply      — write approved selections to DB
#
# Field names used in diff and apply are 1:1 with the NERIS API spec
# (DepartmentPayload, StationPayload, UnitPayload) as documented in:
#   docs/NERIS_ENTITY_FIELD_REFERENCE.md
#   docs/neris_openapi_spec.json v1.4.30
# =============================================================================

# Top-level entity fields that participate in the diff.
# Keys are the exact NERIS API field names from DepartmentPayload.
# Excluded: fd_neris_id (identifier), region_sets (GIS, managed by NERIS),
#           fips_code (framework CSV only — not in DepartmentPayload).
_ENTITY_DIFF_FIELDS = [
    "name", "internal_id", "email", "website", "rms_software",
    "time_zone", "department_type", "entity_type", "continue_edu",
    "address_line_1", "address_line_2", "city", "state", "zip_code", "location",
    "mail_address_line_1", "mail_address_line_2", "mail_city", "mail_state", "mail_zip_code",
    "fire_services", "ems_services", "investigation_services",
    "dispatch", "staffing", "assessment", "shift", "population",
]

# Station fields from StationPayload / StationResponse that participate in diff.
# Excluded: station_name (local-only UI field, not in NERIS spec),
#           display_order (local-only ordering).
_STATION_DIFF_FIELDS = [
    "station_id", "internal_id", "address_line_1", "address_line_2",
    "city", "state", "zip_code", "staffing", "location",
]

# Unit fields from UnitPayload / UnitResponse that participate in diff.
# Excluded: apparatus_id (local FK only), display_order (local-only ordering).
_UNIT_DIFF_FIELDS = [
    "cad_designation_1", "cad_designation_2", "type",
    "staffing", "dedicated_staffing", "neris_id",
]


def _vals_equal(a, b) -> bool:
    """
    Compare two field values for equality.
    Handles None, lists (order-insensitive for service arrays), and scalars.
    """
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    # Treat lists as sets for service array comparisons
    if isinstance(a, list) and isinstance(b, list):
        return sorted(str(x) for x in a) == sorted(str(x) for x in b)
    return a == b


def _build_field_diff(local_obj: dict, neris_obj: dict, fields: list[str]) -> list[dict]:
    """
    Compare local DB values against NERIS API values for a given field list.

    Returns a list of field diff entries:
      [
        {
          "field":   "name",
          "local":   "Glen Moore FC",
          "neris":   "Glen Moore Fire Company",
          "changed": True
        },
        ...
      ]
    All fields are included (changed and unchanged) so the UI can render
    the full side-by-side table. The frontend hides or dims unchanged rows.
    """
    result = []
    for field in fields:
        local_val = local_obj.get(field)
        neris_val = neris_obj.get(field)
        result.append({
            "field":   field,
            "local":   local_val,
            "neris":   neris_val,
            "changed": not _vals_equal(local_val, neris_val),
        })
    return result


def _build_station_diff(local_stations: list, neris_stations: list) -> list[dict]:
    """
    Match local stations to NERIS stations by neris_id.
    Produces a list of station diff entries, each with a nested units diff.

    match values:
      "matched"   — found in both local DB and NERIS
      "neris_only" — exists in NERIS but not in local DB (offer import)
      "local_only" — exists locally but not in NERIS (no action)
    """
    # Index local stations by neris_id for fast lookup
    local_by_neris_id = {}
    for s in local_stations:
        if s.get("neris_id"):
            local_by_neris_id[s["neris_id"]] = s

    # Track which NERIS station neris_ids we matched
    matched_neris_ids = set()
    result = []

    # First pass: match NERIS stations to local
    for ns in neris_stations:
        ns_neris_id = ns.get("neris_id")
        local_s = local_by_neris_id.get(ns_neris_id) if ns_neris_id else None

        if local_s:
            matched_neris_ids.add(ns_neris_id)
            result.append({
                "match":       "matched",
                "local_id":    local_s["id"],
                "local":       local_s,
                "neris":       ns,
                "fields":      _build_field_diff(local_s, ns, _STATION_DIFF_FIELDS),
                "units":       _build_unit_diff(local_s.get("units", []), ns.get("units", [])),
                "has_changes": False,  # computed below
            })
        else:
            # NERIS station has no local match — offer import
            result.append({
                "match":       "neris_only",
                "local_id":    None,
                "local":       None,
                "neris":       ns,
                "fields":      _build_field_diff({}, ns, _STATION_DIFF_FIELDS),
                "units":       _build_unit_diff([], ns.get("units", [])),
                "has_changes": True,
            })

    # Second pass: local stations with no NERIS match
    for ls in local_stations:
        if ls.get("neris_id") and ls["neris_id"] in matched_neris_ids:
            continue  # already handled
        if not ls.get("neris_id"):
            # Local station was never submitted — no neris_id to match on
            result.append({
                "match":       "local_only",
                "local_id":    ls["id"],
                "local":       ls,
                "neris":       None,
                "fields":      [],
                "units":       [],
                "has_changes": False,
            })
            continue
        # Has a neris_id but wasn't in the NERIS response
        result.append({
            "match":       "local_only",
            "local_id":    ls["id"],
            "local":       ls,
            "neris":       None,
            "fields":      [],
            "units":       [],
            "has_changes": False,
        })

    # Mark matched stations as having changes if any field or unit changed
    for entry in result:
        if entry["match"] == "matched":
            any_field_changed = any(f["changed"] for f in entry["fields"])
            any_unit_changed  = any(u["has_changes"] for u in entry["units"])
            entry["has_changes"] = any_field_changed or any_unit_changed

    return result


def _build_unit_diff(local_units: list, neris_units: list) -> list[dict]:
    """
    Match local units to NERIS units by neris_id.
    Falls back to cad_designation_1 match if both sides lack a neris_id.

    match values: "matched", "neris_only", "local_only"
    """
    # Index local units by neris_id
    local_by_neris_id = {}
    local_by_cad = {}
    for u in local_units:
        if u.get("neris_id"):
            local_by_neris_id[u["neris_id"]] = u
        elif u.get("cad_designation_1"):
            local_by_cad[u["cad_designation_1"]] = u

    matched_local_ids = set()
    result = []

    for nu in neris_units:
        nu_neris_id = nu.get("neris_id")
        nu_cad      = nu.get("cad_designation_1")

        local_u = None
        if nu_neris_id and nu_neris_id in local_by_neris_id:
            local_u = local_by_neris_id[nu_neris_id]
        elif not nu_neris_id and nu_cad and nu_cad in local_by_cad:
            local_u = local_by_cad[nu_cad]

        if local_u:
            matched_local_ids.add(local_u["id"])
            fields = _build_field_diff(local_u, nu, _UNIT_DIFF_FIELDS)
            result.append({
                "match":       "matched",
                "local_id":    local_u["id"],
                "local":       local_u,
                "neris":       nu,
                "fields":      fields,
                "has_changes": any(f["changed"] for f in fields),
            })
        else:
            fields = _build_field_diff({}, nu, _UNIT_DIFF_FIELDS)
            result.append({
                "match":       "neris_only",
                "local_id":    None,
                "local":       None,
                "neris":       nu,
                "fields":      fields,
                "has_changes": True,
            })

    # Local units with no NERIS match
    for lu in local_units:
        if lu["id"] in matched_local_ids:
            continue
        result.append({
            "match":       "local_only",
            "local_id":    lu["id"],
            "local":       lu,
            "neris":       None,
            "fields":      [],
            "has_changes": False,
        })

    return result


def _get_neris_client(db: Session) -> "NerisApiClient":
    """
    Build a NerisApiClient from tenant settings.
    Raises HTTPException 400 if credentials are missing.
    """
    from services.neris.api_client import NerisApiClient
    rows = db.execute(text(
        "SELECT key, value FROM settings WHERE category = 'neris' "
        "AND key IN ('client_id', 'client_secret', 'environment')"
    )).fetchall()
    creds = {r[0]: r[1] for r in rows}
    if not creds.get("client_id") or not creds.get("client_secret"):
        raise HTTPException(
            status_code=400,
            detail="NERIS API credentials not configured (client_id / client_secret missing in settings)",
        )
    return NerisApiClient(
        client_id=creds["client_id"],
        client_secret=creds["client_secret"],
        environment=creds.get("environment", "test"),
    )


# ---- Pydantic schemas for pull/apply ----------------------------------------

class PullRequest(BaseModel):
    fd_neris_id: Optional[str] = None  # Falls back to stored entity neris_id if omitted


class ApplyUnitSelection(BaseModel):
    action: str                          # "update" or "import"
    local_id: Optional[int] = None       # None when action == "import"
    neris_station_neris_id: str          # parent station neris_id — needed for import FK
    neris_unit: dict                     # full unit object from NERIS response
    fields: List[str]                    # field names approved by admin


class ApplyStationSelection(BaseModel):
    action: str                          # "update" or "import"
    local_id: Optional[int] = None       # None when action == "import"
    neris_station: dict                  # full station object from NERIS response
    fields: List[str]                    # field names approved by admin
    units: List[ApplyUnitSelection] = []


class ApplyRequest(BaseModel):
    entity_fields: List[str] = []                    # top-level entity field names approved by admin
    entity_values: Optional[Dict[str, Any]] = None   # NERIS values for each approved entity field
    stations: List[ApplyStationSelection] = []


# ---- Routes -----------------------------------------------------------------

@router.get("/entity/search")
async def search_neris_entities(
    q: str,
    db: Session = Depends(get_db),
):
    """
    Search NERIS for fire departments by name substring or NERIS ID substring.

    Query param:
      q — search term. If it matches the pattern FD\\d+ (case-insensitive) it
          is sent as neris_id param; otherwise sent as name param.

    NERIS constraints (from spec):
      name    — min 3 chars
      neris_id — min 2 chars

    Returns the ListEntitiesSummaryInfoResponse from NERIS.

    NOTE: NERIS marks GET /entity as AuthPassword (OAuth2 password flow).
    Vendor client_credentials may not have access. A 401/403 from NERIS
    is surfaced as a clear error so the admin knows to use the FDID input
    instead.
    """
    from services.neris.api_client import NerisApiError
    import re

    q = q.strip()
    if not q:
        raise HTTPException(status_code=400, detail="Search term is required")

    # Determine whether the query looks like a NERIS ID (FD/VN/FM + digits)
    is_neris_id = bool(re.match(r'^(FD|VN|FM|FA)?\d{2,}', q, re.IGNORECASE))

    # Enforce NERIS minimum lengths
    if is_neris_id and len(q) < 2:
        raise HTTPException(status_code=400, detail="NERIS ID search requires at least 2 characters")
    if not is_neris_id and len(q) < 3:
        raise HTTPException(status_code=400, detail="Name search requires at least 3 characters")

    client = _get_neris_client(db)
    try:
        if is_neris_id:
            result = await client.search_entities(neris_id=q)
        else:
            result = await client.search_entities(name=q)
        return result
    except NerisApiError as e:
        if e.status_code in (401, 403):
            raise HTTPException(
                status_code=403,
                detail=(
                    "NERIS returned access denied for entity search. "
                    "Vendor client_credentials may not have list access. "
                    "Use the FDID field to fetch directly by NERIS ID."
                ),
            )
        raise HTTPException(status_code=502, detail=f"NERIS API error: {e.detail}")


@router.post("/entity/pull")
async def pull_neris_entity(
    data: PullRequest,
    db: Session = Depends(get_db),
):
    """
    Fetch a department's full record from NERIS and compute a diff
    against the local DB.

    Steps:
      1. Resolve the NERIS ID — from request body or stored entity row
      2. Authenticate with vendor credentials from settings
      3. Call GET /entity/{neris_id_entity}
      4. Compute field-level diffs for entity, stations, and units
      5. Return the raw NERIS response alongside the structured diff

    The diff result is consumed by the SyncModal on the frontend.
    No DB writes occur in this route — writes happen in /pull/apply.
    """
    from services.neris.api_client import NerisApiError

    # Resolve NERIS ID
    entity = _get_entity(db)
    fd_neris_id = data.fd_neris_id or (entity.get("fd_neris_id") if entity else None)
    if not fd_neris_id:
        raise HTTPException(
            status_code=400,
            detail="No NERIS ID provided and none stored in entity record",
        )

    client = _get_neris_client(db)
    try:
        neris_data = await client.get_entity(fd_neris_id)
    except NerisApiError as e:
        raise HTTPException(status_code=502, detail=f"NERIS API error {e.status_code}: {e.detail}")

    # Build local snapshot for diffing
    local_entity   = entity or {}
    local_stations = _get_stations(db, local_entity["id"]) if local_entity.get("id") else []

    # NERIS stations are nested under the entity response
    neris_stations = neris_data.get("stations", [])

    # Compute diffs
    entity_diff  = _build_field_diff(local_entity, neris_data, _ENTITY_DIFF_FIELDS)
    stations_diff = _build_station_diff(local_stations, neris_stations)

    # Summary counts for the UI header
    entity_changes  = sum(1 for f in entity_diff if f["changed"])
    station_changes = sum(1 for s in stations_diff if s["has_changes"])

    return {
        "fd_neris_id":      fd_neris_id,
        "neris":            neris_data,
        "entity_diff":      entity_diff,
        "stations_diff":    stations_diff,
        "summary": {
            "entity_changes":  entity_changes,
            "station_changes": station_changes,
        },
    }


@router.post("/entity/pull/apply")
async def apply_neris_pull(
    data: ApplyRequest,
    db: Session = Depends(get_db),
):
    """
    Write admin-approved NERIS sync selections to the local DB.

    Handles three operation types:
      Entity fields  — UPDATE neris_entity SET field=neris_value
      Station update — UPDATE neris_stations SET field=neris_value WHERE id=local_id
      Station import — INSERT INTO neris_stations (all fields from NERIS)
      Unit update    — UPDATE neris_units SET field=neris_value WHERE id=local_id
      Unit import    — INSERT INTO neris_units (all fields from NERIS)

    All field names are validated against _ENTITY_DIFF_FIELDS / _STATION_DIFF_FIELDS /
    _UNIT_DIFF_FIELDS before writing — no arbitrary column injection.

    Returns counts of changes applied.
    """
    entity = _get_entity(db)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not configured")

    applied = {
        "entity_fields":    0,
        "stations_updated": 0,
        "stations_imported": 0,
        "units_updated":    0,
        "units_imported":   0,
    }

    # ---- 1. Apply entity field updates ----
    # The frontend sends entity_fields=["name","email",...] and
    # entity_values={"name": "Glen Moore Fire Co", "email": "gm@chester.gov",...}
    # — the NERIS values for each approved field from the pull response.
    approved_entity_fields = [
        f for f in data.entity_fields
        if f in _ENTITY_DIFF_FIELDS
    ]
    if approved_entity_fields and data.entity_values:
        updates = {
            f: data.entity_values[f]
            for f in approved_entity_fields
            if f in data.entity_values
        }
        if updates:
            set_parts = ", ".join(f"{k} = :{k}" for k in updates)
            updates["id"] = entity["id"]
            db.execute(text(f"""
                UPDATE neris_entity
                SET {set_parts}, updated_at = NOW()
                WHERE id = :id
            """), updates)
            applied["entity_fields"] = len(updates) - 1  # exclude id

    # ---- 2. Apply station and unit updates/imports ----
    for station_sel in data.stations:

        # Validate approved station fields against whitelist
        approved_station_fields = [
            f for f in station_sel.fields
            if f in _STATION_DIFF_FIELDS
        ]

        if station_sel.action == "update" and station_sel.local_id:
            # UPDATE existing station
            if approved_station_fields:
                updates = {
                    f: station_sel.neris_station.get(f)
                    for f in approved_station_fields
                }
                set_parts = ", ".join(f"{k} = :{k}" for k in updates)
                updates["id"] = station_sel.local_id
                db.execute(text(f"""
                    UPDATE neris_stations
                    SET {set_parts}, updated_at = NOW()
                    WHERE id = :id
                """), updates)
                applied["stations_updated"] += 1

        elif station_sel.action == "import":
            # INSERT new station from NERIS
            ns = station_sel.neris_station
            row = db.execute(text("""
                INSERT INTO neris_stations (
                    entity_id, station_id, internal_id, neris_id,
                    address_line_1, address_line_2, city, state, zip_code,
                    staffing, location, display_order
                ) VALUES (
                    :entity_id, :station_id, :internal_id, :neris_id,
                    :address_line_1, :address_line_2, :city, :state, :zip_code,
                    :staffing, :location, :display_order
                )
                RETURNING id
            """), {
                "entity_id":      entity["id"],
                "station_id":     ns.get("station_id"),
                "internal_id":    ns.get("internal_id"),
                "neris_id":       ns.get("neris_id"),
                "address_line_1": ns.get("address_line_1"),
                "address_line_2": ns.get("address_line_2"),
                "city":           ns.get("city"),
                "state":          ns.get("state"),
                "zip_code":       ns.get("zip_code"),
                "staffing":       ns.get("staffing"),
                "location":       json.dumps(ns["location"]) if ns.get("location") else None,
                "display_order":  0,
            })
            new_station_id = row.fetchone()[0]
            applied["stations_imported"] += 1

            # Import units for this new station
            for unit_sel in station_sel.units:
                if unit_sel.action == "import":
                    nu = unit_sel.neris_unit
                    db.execute(text("""
                        INSERT INTO neris_units (
                            station_id, cad_designation_1, cad_designation_2,
                            type, staffing, dedicated_staffing, neris_id, display_order
                        ) VALUES (
                            :station_id, :cad_designation_1, :cad_designation_2,
                            :type, :staffing, :dedicated_staffing, :neris_id, :display_order
                        )
                    """), {
                        "station_id":        new_station_id,
                        "cad_designation_1": nu.get("cad_designation_1"),
                        "cad_designation_2": nu.get("cad_designation_2"),
                        "type":              nu.get("type"),
                        "staffing":          nu.get("staffing"),
                        "dedicated_staffing": nu.get("dedicated_staffing", False),
                        "neris_id":          nu.get("neris_id"),
                        "display_order":     0,
                    })
                    applied["units_imported"] += 1
            continue  # skip per-unit handling below for imported stations

        # Per-unit handling for matched (non-imported) stations
        for unit_sel in station_sel.units:
            approved_unit_fields = [
                f for f in unit_sel.fields
                if f in _UNIT_DIFF_FIELDS
            ]
            nu = unit_sel.neris_unit

            if unit_sel.action == "update" and unit_sel.local_id:
                if approved_unit_fields:
                    updates = {
                        f: nu.get(f)
                        for f in approved_unit_fields
                    }
                    set_parts = ", ".join(f"{k} = :{k}" for k in updates)
                    updates["id"] = unit_sel.local_id
                    db.execute(text(f"""
                        UPDATE neris_units
                        SET {set_parts}, updated_at = NOW()
                        WHERE id = :id
                    """), updates)
                    applied["units_updated"] += 1

            elif unit_sel.action == "import":
                # Need the local station id — from the station selection
                target_station_id = station_sel.local_id
                if not target_station_id:
                    continue  # safety: should not happen
                db.execute(text("""
                    INSERT INTO neris_units (
                        station_id, cad_designation_1, cad_designation_2,
                        type, staffing, dedicated_staffing, neris_id, display_order
                    ) VALUES (
                        :station_id, :cad_designation_1, :cad_designation_2,
                        :type, :staffing, :dedicated_staffing, :neris_id, :display_order
                    )
                """), {
                    "station_id":        target_station_id,
                    "cad_designation_1": nu.get("cad_designation_1"),
                    "cad_designation_2": nu.get("cad_designation_2"),
                    "type":              nu.get("type"),
                    "staffing":          nu.get("staffing"),
                    "dedicated_staffing": nu.get("dedicated_staffing", False),
                    "neris_id":          nu.get("neris_id"),
                    "display_order":     0,
                })
                applied["units_imported"] += 1

    db.commit()
    _update_station_count(db)

    return {"applied": applied}
