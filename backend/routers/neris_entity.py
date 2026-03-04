"""
NERIS Entity Router

Manages the department's NERIS Entity profile: the Entity record, its Stations,
and the Units within each Station.

NERIS data model:
  Entity (neris_entity)     — one per tenant, identified by fd_neris_id
  Station (neris_stations)  — one or more per Entity, e.g. FD42029593S001
  Unit (neris_units)        — one or more per Station, station_unit_id_1 MUST match CAD

Routes:
  GET    /api/neris/entity                  — full entity + stations + units
  PUT    /api/neris/entity                  — update entity fields
  POST   /api/neris/stations                — add a station
  PUT    /api/neris/stations/{id}           — update a station
  DELETE /api/neris/stations/{id}           — remove a station
  POST   /api/neris/stations/{id}/units     — add a unit to a station
  PUT    /api/neris/units/{id}              — update a unit
  DELETE /api/neris/units/{id}              — remove a unit
  POST   /api/neris/entity/validate         — local completeness check
  POST   /api/neris/entity/submit           — build Entity payload + POST to NERIS API
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timezone
import logging

from database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["NERIS Entity"])


# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

class EntityUpdate(BaseModel):
    fd_neris_id: Optional[str] = None
    fd_name: Optional[str] = None
    fd_id_legacy: Optional[str] = None
    fd_address_1: Optional[str] = None
    fd_address_2: Optional[str] = None
    fd_city: Optional[str] = None
    fd_state: Optional[str] = None
    fd_zip: Optional[str] = None
    fd_point_lat: Optional[float] = None
    fd_point_lng: Optional[float] = None
    fd_telephone: Optional[str] = None
    fd_website: Optional[str] = None
    fd_type: Optional[str] = None
    fd_entity: Optional[str] = None
    fd_population_protected: Optional[int] = None
    fd_fire_services: Optional[List[str]] = None
    fd_ems_services: Optional[List[str]] = None
    fd_investigation_services: Optional[List[str]] = None
    dispatch_center_id: Optional[str] = None
    dispatch_cad_software: Optional[str] = None
    rms_software: Optional[str] = None
    dispatch_avl_usage: Optional[bool] = None
    dispatch_psap_capability: Optional[str] = None
    dispatch_psap_discipline: Optional[str] = None
    dispatch_psap_jurisdiction: Optional[str] = None
    dispatch_psap_type: Optional[str] = None
    dispatch_protocol_fire: Optional[str] = None
    dispatch_protocol_medical: Optional[str] = None
    fd_shift_duration: Optional[int] = None
    fd_shift_count: Optional[int] = None
    staff_total: Optional[int] = None
    staff_active_ff_volunteer: Optional[int] = None
    staff_active_ff_career_ft: Optional[int] = None
    staff_active_ff_career_pt: Optional[int] = None
    staff_active_ems_only_volunteer: Optional[int] = None
    staff_active_ems_only_career_ft: Optional[int] = None
    staff_active_ems_only_career_pt: Optional[int] = None
    staff_active_civilians_career_ft: Optional[int] = None
    staff_active_civilians_career_pt: Optional[int] = None
    staff_active_civilians_volunteer: Optional[int] = None
    assess_iso_rating: Optional[int] = None
    neris_annual_renewal_month: Optional[int] = None


class StationCreate(BaseModel):
    station_id: Optional[str] = None
    station_name: Optional[str] = None
    station_address_1: Optional[str] = None
    station_address_2: Optional[str] = None
    station_city: Optional[str] = None
    station_state: Optional[str] = None
    station_zip: Optional[str] = None
    station_point_lat: Optional[float] = None
    station_point_lng: Optional[float] = None
    station_staffing: Optional[int] = None
    display_order: Optional[int] = 0


class StationUpdate(StationCreate):
    pass


class UnitCreate(BaseModel):
    station_unit_id_1: Optional[str] = None
    station_unit_id_2: Optional[str] = None
    station_unit_capability: Optional[str] = None
    station_unit_staffing: Optional[int] = None
    station_unit_dedicated: Optional[bool] = False
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
        SELECT id, fd_neris_id, fd_name, fd_id_legacy,
               fd_address_1, fd_address_2, fd_city, fd_state, fd_zip,
               fd_point_lat, fd_point_lng,
               fd_telephone, fd_website,
               fd_type, fd_entity,
               fd_population_protected, fd_station_count,
               fd_fire_services, fd_ems_services, fd_investigation_services,
               dispatch_center_id, dispatch_cad_software, rms_software,
               dispatch_avl_usage,
               dispatch_psap_capability, dispatch_psap_discipline,
               dispatch_psap_jurisdiction, dispatch_psap_type,
               dispatch_protocol_fire, dispatch_protocol_medical,
               fd_shift_duration, fd_shift_count,
               staff_total,
               staff_active_ff_volunteer,
               staff_active_ff_career_ft, staff_active_ff_career_pt,
               staff_active_ems_only_volunteer,
               staff_active_ems_only_career_ft, staff_active_ems_only_career_pt,
               staff_active_civilians_career_ft, staff_active_civilians_career_pt,
               staff_active_civilians_volunteer,
               assess_iso_rating,
               neris_entity_submitted_at, neris_entity_status,
               neris_annual_renewal_month,
               created_at, updated_at
        FROM neris_entity
        LIMIT 1
    """)).fetchone()
    if not row:
        return None
    cols = [
        "id", "fd_neris_id", "fd_name", "fd_id_legacy",
        "fd_address_1", "fd_address_2", "fd_city", "fd_state", "fd_zip",
        "fd_point_lat", "fd_point_lng",
        "fd_telephone", "fd_website",
        "fd_type", "fd_entity",
        "fd_population_protected", "fd_station_count",
        "fd_fire_services", "fd_ems_services", "fd_investigation_services",
        "dispatch_center_id", "dispatch_cad_software", "rms_software",
        "dispatch_avl_usage",
        "dispatch_psap_capability", "dispatch_psap_discipline",
        "dispatch_psap_jurisdiction", "dispatch_psap_type",
        "dispatch_protocol_fire", "dispatch_protocol_medical",
        "fd_shift_duration", "fd_shift_count",
        "staff_total",
        "staff_active_ff_volunteer",
        "staff_active_ff_career_ft", "staff_active_ff_career_pt",
        "staff_active_ems_only_volunteer",
        "staff_active_ems_only_career_ft", "staff_active_ems_only_career_pt",
        "staff_active_civilians_career_ft", "staff_active_civilians_career_pt",
        "staff_active_civilians_volunteer",
        "assess_iso_rating",
        "neris_entity_submitted_at", "neris_entity_status",
        "neris_annual_renewal_month",
        "created_at", "updated_at",
    ]
    d = dict(zip(cols, row))
    # Serialize datetimes
    for k in ("neris_entity_submitted_at", "created_at", "updated_at"):
        if d[k] and hasattr(d[k], "isoformat"):
            d[k] = d[k].isoformat()
    return d


def _get_stations(db: Session, entity_id: int) -> list:
    rows = db.execute(text("""
        SELECT id, entity_id, station_id, station_name,
               station_address_1, station_address_2,
               station_city, station_state, station_zip,
               station_point_lat, station_point_lng,
               station_staffing, display_order,
               created_at, updated_at
        FROM neris_stations
        WHERE entity_id = :entity_id
        ORDER BY display_order, id
    """), {"entity_id": entity_id}).fetchall()
    cols = [
        "id", "entity_id", "station_id", "station_name",
        "station_address_1", "station_address_2",
        "station_city", "station_state", "station_zip",
        "station_point_lat", "station_point_lng",
        "station_staffing", "display_order",
        "created_at", "updated_at",
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
    rows = db.execute(text("""
        SELECT nu.id, nu.station_id,
               nu.station_unit_id_1, nu.station_unit_id_2,
               nu.station_unit_capability,
               nu.station_unit_staffing, nu.station_unit_dedicated,
               nu.apparatus_id, nu.display_order,
               nu.created_at, nu.updated_at,
               a.unit_designator, a.name as apparatus_name
        FROM neris_units nu
        LEFT JOIN apparatus a ON nu.apparatus_id = a.id
        WHERE nu.station_id = :station_id
        ORDER BY nu.display_order, nu.id
    """), {"station_id": station_id}).fetchall()
    cols = [
        "id", "station_id",
        "station_unit_id_1", "station_unit_id_2",
        "station_unit_capability",
        "station_unit_staffing", "station_unit_dedicated",
        "apparatus_id", "display_order",
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


# =============================================================================
# ENTITY ENDPOINTS
# =============================================================================

@router.get("/entity")
async def get_entity(db: Session = Depends(get_db)):
    """Get the full Entity record with nested stations and units."""
    entity = _get_entity(db)
    if not entity:
        # Return empty structure — UI will prompt user to set up Entity
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


def _get_apparatus_options(db: Session) -> list:
    """Return active APPARATUS-category units for the unit-linking dropdown."""
    rows = db.execute(text("""
        SELECT id, unit_designator, name, neris_unit_type
        FROM apparatus
        WHERE unit_category = 'APPARATUS' AND active = true
        ORDER BY display_order, unit_designator
    """)).fetchall()
    return [
        {"id": r[0], "unit_designator": r[1], "name": r[2], "neris_unit_type": r[3]}
        for r in rows
    ]


@router.put("/entity")
async def update_entity(data: EntityUpdate, db: Session = Depends(get_db)):
    """Update Entity fields. Creates a new entity row if none exists."""
    entity = _get_entity(db)

    # Build SET clause from non-None fields only
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

    # Refresh station count
    _update_station_count(db)

    return {"status": "ok", "entity": _get_entity(db)}


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
            entity_id, station_id, station_name,
            station_address_1, station_address_2,
            station_city, station_state, station_zip,
            station_point_lat, station_point_lng,
            station_staffing, display_order
        ) VALUES (
            :entity_id, :station_id, :station_name,
            :station_address_1, :station_address_2,
            :station_city, :station_state, :station_zip,
            :station_point_lat, :station_point_lng,
            :station_staffing, :display_order
        )
        RETURNING id
    """), {
        "entity_id": entity["id"],
        **data.dict(),
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
    # Verify station exists
    exists = db.execute(text(
        "SELECT 1 FROM neris_stations WHERE id = :id"
    ), {"id": station_id}).fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail="Station not found")

    # If apparatus_id provided and station_unit_id_1 not set, auto-fill from unit_designator
    unit_id_1 = data.station_unit_id_1
    if data.apparatus_id and not unit_id_1:
        app = db.execute(text(
            "SELECT unit_designator FROM apparatus WHERE id = :id"
        ), {"id": data.apparatus_id}).fetchone()
        if app:
            unit_id_1 = app[0]

    row = db.execute(text("""
        INSERT INTO neris_units (
            station_id, station_unit_id_1, station_unit_id_2,
            station_unit_capability, station_unit_staffing,
            station_unit_dedicated, apparatus_id, display_order
        ) VALUES (
            :station_id, :station_unit_id_1, :station_unit_id_2,
            :station_unit_capability, :station_unit_staffing,
            :station_unit_dedicated, :apparatus_id, :display_order
        )
        RETURNING id
    """), {
        "station_id": station_id,
        "station_unit_id_1": unit_id_1,
        "station_unit_id_2": data.station_unit_id_2,
        "station_unit_capability": data.station_unit_capability,
        "station_unit_staffing": data.station_unit_staffing,
        "station_unit_dedicated": data.station_unit_dedicated or False,
        "apparatus_id": data.apparatus_id,
        "display_order": data.display_order or 0,
    }).fetchone()
    db.commit()
    return {"status": "ok", "id": row[0]}


@router.put("/units/{unit_id}")
async def update_unit(unit_id: int, data: UnitUpdate, db: Session = Depends(get_db)):
    """Update a unit's fields."""
    updates = {k: v for k, v in data.dict().items() if v is not None}

    # If apparatus_id updated and station_unit_id_1 not in payload, auto-fill
    if "apparatus_id" in updates and "station_unit_id_1" not in updates:
        app = db.execute(text(
            "SELECT unit_designator FROM apparatus WHERE id = :id"
        ), {"id": updates["apparatus_id"]}).fetchone()
        if app:
            updates["station_unit_id_1"] = app[0]

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
    """
    errors = []
    warnings = []

    entity = _get_entity(db)
    if not entity:
        return {"valid": False, "errors": ["Entity not configured"], "warnings": []}

    # Required entity fields
    if not entity.get("fd_neris_id"):
        errors.append("fd_neris_id is required")
    if not entity.get("fd_name"):
        errors.append("fd_name (Department Name) is required")
    if not entity.get("fd_address_1"):
        errors.append("fd_address_1 (Street Address) is required")
    if not entity.get("fd_city"):
        errors.append("fd_city is required")
    if not entity.get("fd_state"):
        errors.append("fd_state is required")
    if not entity.get("fd_zip"):
        errors.append("fd_zip is required")

    # Recommended fields
    if not entity.get("fd_type"):
        warnings.append("fd_type (Staffing Type: volunteer/career/combination) is recommended")
    if not entity.get("fd_entity"):
        warnings.append("fd_entity (Authority Type: fire_department/fire_district/etc.) is recommended")
    if not entity.get("dispatch_center_id"):
        warnings.append("dispatch_center_id (PSAP FCC ID) is recommended")

    # Station checks
    stations = _get_stations(db, entity["id"])
    if not stations:
        errors.append("At least one station is required")
    else:
        for station in stations:
            sid = station.get("station_id") or f"Station #{station['id']}"
            if not station.get("station_id"):
                errors.append(f"{sid}: station_id is required")
            if not station.get("station_address_1"):
                warnings.append(f"{sid}: station_address_1 is recommended")

            units = station.get("units", [])
            if not units:
                errors.append(f"{sid}: at least one unit is required")
            else:
                for unit in units:
                    uid = unit.get("station_unit_id_1") or f"Unit #{unit['id']}"
                    if not unit.get("station_unit_id_1"):
                        errors.append(f"{sid} / {uid}: station_unit_id_1 (CAD ID) is required")
                    if not unit.get("station_unit_capability"):
                        warnings.append(f"{sid} / {uid}: station_unit_capability is recommended")

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
    # Validate first
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

    # Build NERIS Entity payload
    payload = _build_entity_payload(entity, stations)

    # Load credentials from settings
    from sqlalchemy import text as _text
    creds = {}
    rows = db.execute(_text(
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
        # Record error status
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
    Build the NERIS Entity payload dict from entity + stations data.
    Structure matches NERIS Entity API spec.
    """
    payload = {
        "fd_neris_id": entity.get("fd_neris_id"),
        "fd_name": entity.get("fd_name"),
    }

    # Address
    for f in ("fd_address_1", "fd_address_2", "fd_city", "fd_state", "fd_zip"):
        if entity.get(f):
            payload[f] = entity[f]

    if entity.get("fd_point_lat") and entity.get("fd_point_lng"):
        payload["fd_point"] = {"lat": float(entity["fd_point_lat"]), "lng": float(entity["fd_point_lng"])}

    # Contact
    for f in ("fd_telephone", "fd_website", "fd_id_legacy"):
        if entity.get(f):
            payload[f] = entity[f]

    # Classification
    for f in ("fd_type", "fd_entity", "fd_population_protected", "assess_iso_rating"):
        if entity.get(f) is not None:
            payload[f] = entity[f]

    # Services
    for f in ("fd_fire_services", "fd_ems_services", "fd_investigation_services"):
        if entity.get(f):
            payload[f] = entity[f]

    # Dispatch
    for f in (
        "dispatch_center_id", "dispatch_cad_software", "rms_software",
        "dispatch_avl_usage",
        "dispatch_psap_capability", "dispatch_psap_discipline",
        "dispatch_psap_jurisdiction", "dispatch_psap_type",
        "dispatch_protocol_fire", "dispatch_protocol_medical",
    ):
        if entity.get(f) is not None:
            payload[f] = entity[f]

    # Operations / staffing
    for f in (
        "fd_shift_duration", "fd_shift_count",
        "staff_total",
        "staff_active_ff_volunteer", "staff_active_ff_career_ft", "staff_active_ff_career_pt",
        "staff_active_ems_only_volunteer", "staff_active_ems_only_career_ft", "staff_active_ems_only_career_pt",
        "staff_active_civilians_career_ft", "staff_active_civilians_career_pt", "staff_active_civilians_volunteer",
    ):
        if entity.get(f) is not None:
            payload[f] = entity[f]

    # Stations
    payload["stations"] = []
    for station in stations:
        s = {}
        for f in (
            "station_id", "station_address_1", "station_address_2",
            "station_city", "station_state", "station_zip", "station_staffing",
        ):
            if station.get(f):
                s[f] = station[f]
        if station.get("station_point_lat") and station.get("station_point_lng"):
            s["station_point"] = {
                "lat": float(station["station_point_lat"]),
                "lng": float(station["station_point_lng"]),
            }

        # Units within station
        s["units"] = []
        for unit in station.get("units", []):
            u = {}
            for f in (
                "station_unit_id_1", "station_unit_id_2",
                "station_unit_capability", "station_unit_staffing",
            ):
                if unit.get(f):
                    u[f] = unit[f]
            if unit.get("station_unit_dedicated") is not None:
                u["station_unit_dedicated"] = unit["station_unit_dedicated"]
            if u:
                s["units"].append(u)

        payload["stations"].append(s)

    return payload
