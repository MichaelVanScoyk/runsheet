"""
Incidents router - CRUD operations for incidents
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List, Dict
from datetime import datetime, timezone
from pydantic import BaseModel
import logging

from database import get_db
from models import Incident, IncidentUnit, IncidentPersonnel, Municipality, Apparatus, Personnel, Rank

# Try to import weather service
try:
    from weather_service import get_weather_for_incident
    WEATHER_AVAILABLE = True
except ImportError:
    WEATHER_AVAILABLE = False

# Import settings helper functions
try:
    from routers.settings import get_setting_value, get_station_coords
    SETTINGS_AVAILABLE = True
except ImportError:
    SETTINGS_AVAILABLE = False

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# PYDANTIC SCHEMAS
# ============================================================================

class IncidentCreate(BaseModel):
    cad_event_number: str
    cad_event_type: Optional[str] = None
    address: Optional[str] = None
    municipality_code: Optional[str] = None
    internal_incident_number: Optional[int] = None
    incident_date: Optional[str] = None  # Allow setting date on creation (for manual entry)

class IncidentUpdate(BaseModel):
    internal_incident_number: Optional[int] = None
    cad_event_type: Optional[str] = None
    incident_date: Optional[str] = None
    address: Optional[str] = None
    municipality_code: Optional[str] = None
    cross_streets: Optional[str] = None
    esz_box: Optional[str] = None
    time_dispatched: Optional[datetime] = None
    time_first_enroute: Optional[datetime] = None
    time_first_on_scene: Optional[datetime] = None
    time_fire_under_control: Optional[datetime] = None
    time_extrication_complete: Optional[datetime] = None
    time_last_cleared: Optional[datetime] = None
    time_in_service: Optional[datetime] = None
    caller_name: Optional[str] = None
    caller_phone: Optional[str] = None
    caller_source: Optional[str] = None
    weather_conditions: Optional[str] = None
    companies_called: Optional[str] = None
    situation_found: Optional[str] = None
    extent_of_damage: Optional[str] = None
    services_provided: Optional[str] = None
    narrative: Optional[str] = None
    equipment_used: Optional[List[str]] = None
    problems_issues: Optional[str] = None
    neris_incident_types: Optional[List[int]] = None
    neris_property_use: Optional[int] = None
    neris_actions_taken: Optional[List[int]] = None
    officer_in_charge: Optional[int] = None
    completed_by: Optional[int] = None
    cad_units: Optional[List[Dict]] = None  # CAD responding units with times

class AssignmentsUpdate(BaseModel):
    # Format: { "ENG481": [person_id, person_id, null, null, null, null], ... }
    assignments: Dict[str, List[Optional[int]]]


# ============================================================================
# INCIDENT NUMBER HELPERS
# ============================================================================

@router.get("/suggest-number")
async def suggest_incident_number(
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get next suggested incident number for given year"""
    result = db.execute(
        text("SELECT suggest_incident_number(:year)"),
        {"year": year}
    ).scalar()
    return {"suggested_number": result}


# ============================================================================
# INCIDENT CRUD
# ============================================================================

@router.get("")
async def list_incidents(
    year: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """List incidents with filters"""
    query = db.query(Incident).filter(Incident.deleted_at.is_(None))
    
    if year is None:
        year = datetime.now().year
    query = query.filter(Incident.year_prefix == year)
    
    if status:
        query = query.filter(Incident.status == status)
    
    total = query.count()
    incidents = query.order_by(Incident.internal_incident_number.desc()).offset(offset).limit(limit).all()
    
    return {
        "total": total,
        "year": year,
        "incidents": [
            {
                "id": i.id,
                "internal_incident_number": i.internal_incident_number,
                "cad_event_number": i.cad_event_number,
                "cad_event_type": i.cad_event_type,
                "status": i.status,
                "incident_date": i.incident_date.isoformat() if i.incident_date else None,
                "address": i.address,
                "municipality_code": i.municipality_code,
                "time_dispatched": i.time_dispatched.isoformat() if i.time_dispatched else None,
            }
            for i in incidents
        ]
    }


@router.get("/by-cad/{cad_event_number}")
async def get_incident_by_cad(
    cad_event_number: str,
    db: Session = Depends(get_db)
):
    """Get incident by CAD event number"""
    incident = db.query(Incident).filter(
        Incident.cad_event_number == cad_event_number,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Get cad_units from JSONB column
    cad_units = []
    if hasattr(incident, 'cad_units') and incident.cad_units:
        cad_units = incident.cad_units
    
    return {
        "id": incident.id,
        "internal_incident_number": incident.internal_incident_number,
        "cad_event_number": incident.cad_event_number,
        "cad_event_type": incident.cad_event_type,
        "status": incident.status,
        "incident_date": incident.incident_date.isoformat() if incident.incident_date else None,
        "address": incident.address,
        "municipality_code": incident.municipality_code,
        "cad_units": cad_units,
    }


# ============================================================================
# INCIDENT SEQUENCE ADMIN FUNCTIONS
# These must be defined BEFORE /{incident_id} to avoid route conflicts
# ============================================================================

@router.get("/admin/sequence")
async def get_incident_sequence(
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get incident sequence for admin review.
    Returns incidents sorted by number with out_of_sequence flags.
    """
    if year is None:
        year = datetime.now().year
    
    # Get all incidents ordered by internal number
    incidents = db.execute(text("""
        SELECT 
            id, 
            internal_incident_number, 
            incident_date, 
            cad_event_number, 
            address,
            COALESCE(out_of_sequence, FALSE) as out_of_sequence
        FROM incidents
        WHERE year_prefix = :year AND deleted_at IS NULL
        ORDER BY internal_incident_number ASC
    """), {"year": year}).fetchall()
    
    # Also get what the correct order should be (by date)
    by_date = db.execute(text("""
        SELECT id, internal_incident_number, incident_date
        FROM incidents
        WHERE year_prefix = :year AND deleted_at IS NULL
        ORDER BY incident_date ASC, created_at ASC
    """), {"year": year}).fetchall()
    
    # Build the correct number assignment
    correct_order = {}
    base_number = year * 1000 + 1
    for i, row in enumerate(by_date):
        correct_order[row[0]] = base_number + i  # incident_id -> should-be number
    
    # Count out of sequence
    out_of_sequence_count = sum(1 for i in incidents if i[5])
    
    # Build response with what each incident's number should be
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
    
    # Calculate what changes would be needed
    changes_needed = [i for i in incident_list if i["needs_fix"]]
    
    return {
        "year": year,
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
    db: Session = Depends(get_db)
):
    """
    Fix all out-of-sequence incidents for a year.
    Renumbers incidents so internal_incident_number matches chronological date order.
    """
    # Get incidents ordered by date (the correct order)
    by_date = db.execute(text("""
        SELECT id, internal_incident_number, incident_date, cad_event_number
        FROM incidents
        WHERE year_prefix = :year AND deleted_at IS NULL
        ORDER BY incident_date ASC, created_at ASC
    """), {"year": year}).fetchall()
    
    if not by_date:
        return {"status": "ok", "message": f"No incidents found for year {year}", "changes": []}
    
    # Calculate what changes are needed
    base_number = year * 1000 + 1
    changes = []
    
    for i, inc in enumerate(by_date):
        new_number = base_number + i
        if inc[1] != new_number:
            changes.append({
                "id": inc[0],
                "old_number": inc[1],
                "new_number": new_number,
                "date": str(inc[2]) if inc[2] else None,
                "cad": inc[3],
            })
    
    if not changes:
        return {"status": "ok", "message": "All incidents already in correct sequence", "changes": []}
    
    logger.warning(f"ADMIN: Fixing sequence for {len(changes)} incidents in year {year}")
    
    # Step 1: Set all affected incidents to negative temporary numbers
    # This avoids unique constraint violations during the swap
    for change in changes:
        db.execute(text("""
            UPDATE incidents 
            SET internal_incident_number = :temp_num 
            WHERE id = :id
        """), {"temp_num": -change["id"], "id": change["id"]})
    
    db.flush()
    
    # Step 2: Set to final correct numbers
    for change in changes:
        db.execute(text("""
            UPDATE incidents 
            SET internal_incident_number = :new_num,
                out_of_sequence = FALSE,
                updated_at = NOW()
            WHERE id = :id
        """), {"new_num": change["new_number"], "id": change["id"]})
    
    db.commit()
    
    logger.warning(f"ADMIN: Fixed {len(changes)} incidents for year {year}")
    
    return {
        "status": "ok",
        "year": year,
        "changes_applied": len(changes),
        "changes": changes
    }


# ============================================================================
# INCIDENT DETAIL ROUTES
# ============================================================================

@router.get("/{incident_id}")
async def get_incident(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """Get full incident details including personnel assignments"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Build personnel_assignments in simple format
    # { "ENG481": [person_id, person_id, null, null, null, null], ... }
    personnel_assignments = {}
    
    for unit in incident.units:
        # Get apparatus info
        apparatus = db.query(Apparatus).filter(Apparatus.id == unit.apparatus_id).first()
        if not apparatus:
            continue
        
        unit_key = apparatus.unit_designator
        
        if apparatus.is_virtual:
            # Virtual units: dynamic list, just personnel IDs in order
            slots = []
            for p in sorted(unit.personnel, key=lambda x: x.slot_index or 0):
                slots.append(p.personnel_id)
        else:
            # Real trucks: fixed 6 slots
            slots = [None, None, None, None, None, None]
            for p in unit.personnel:
                slot_idx = p.slot_index
                if slot_idx is not None and 0 <= slot_idx < 6:
                    slots[slot_idx] = p.personnel_id
        
        personnel_assignments[unit_key] = slots
    
    return {
        "id": incident.id,
        "internal_incident_number": incident.internal_incident_number,
        "year_prefix": incident.year_prefix,
        "cad_event_number": incident.cad_event_number,
        "cad_event_type": incident.cad_event_type,
        "status": incident.status,
        "incident_date": incident.incident_date.isoformat() if incident.incident_date else None,
        "address": incident.address,
        "municipality_code": incident.municipality_code,
        "cross_streets": incident.cross_streets,
        "esz_box": incident.esz_box,
        "time_dispatched": incident.time_dispatched.isoformat() if incident.time_dispatched else None,
        "time_first_enroute": incident.time_first_enroute.isoformat() if incident.time_first_enroute else None,
        "time_first_on_scene": incident.time_first_on_scene.isoformat() if incident.time_first_on_scene else None,
        "time_fire_under_control": incident.time_fire_under_control.isoformat() if incident.time_fire_under_control else None,
        "time_extrication_complete": incident.time_extrication_complete.isoformat() if incident.time_extrication_complete else None,
        "time_last_cleared": incident.time_last_cleared.isoformat() if incident.time_last_cleared else None,
        "time_in_service": incident.time_in_service.isoformat() if incident.time_in_service else None,
        "caller_name": incident.caller_name,
        "caller_phone": incident.caller_phone,
        "weather_conditions": incident.weather_conditions,
        "companies_called": incident.companies_called,
        "situation_found": incident.situation_found,
        "extent_of_damage": incident.extent_of_damage,
        "services_provided": incident.services_provided,
        "narrative": incident.narrative,
        "equipment_used": incident.equipment_used,
        "problems_issues": incident.problems_issues,
        "neris_incident_types": incident.neris_incident_types,
        "neris_property_use": incident.neris_property_use,
        "neris_actions_taken": incident.neris_actions_taken,
        "officer_in_charge": incident.officer_in_charge,
        "completed_by": incident.completed_by,
        "personnel_assignments": personnel_assignments,
        "cad_units": incident.cad_units if hasattr(incident, 'cad_units') and incident.cad_units else [],
        "created_at": incident.created_at.isoformat() if incident.created_at else None,
        "updated_at": incident.updated_at.isoformat() if incident.updated_at else None,
        "closed_at": getattr(incident, 'closed_at', None),
        "neris_submitted_at": getattr(incident, 'neris_submitted_at', None),
    }


@router.post("")
async def create_incident(
    data: IncidentCreate,
    db: Session = Depends(get_db)
):
    """Create new incident"""
    existing = db.query(Incident).filter(
        Incident.cad_event_number == data.cad_event_number,
        Incident.deleted_at.is_(None)
    ).first()
    
    if existing:
        if existing.status == 'CLOSED':
            existing.status = 'OPEN'
            existing.cad_reopen_count += 1
            existing.updated_at = datetime.now(timezone.utc)
            db.commit()
            return {"id": existing.id, "reopened": True}
        else:
            raise HTTPException(status_code=400, detail="Incident already exists")
    
    if data.internal_incident_number:
        incident_number = data.internal_incident_number
    else:
        incident_number = db.execute(text("SELECT suggest_incident_number(NULL)")).scalar()
    
    year_prefix = incident_number // 1000
    
    municipality_id = None
    if data.municipality_code:
        muni = db.query(Municipality).filter(Municipality.code == data.municipality_code).first()
        if not muni:
            muni = Municipality(code=data.municipality_code, name=data.municipality_code)
            db.add(muni)
            db.flush()
        municipality_id = muni.id
    
    # Determine incident_date: use provided date, or default to today
    if data.incident_date:
        try:
            incident_date = datetime.strptime(data.incident_date, "%Y-%m-%d").date()
        except ValueError:
            incident_date = datetime.now(timezone.utc).date()
    else:
        incident_date = datetime.now(timezone.utc).date()
    
    # Check if this incident will be out of sequence
    # (its date is earlier than any incident with a lower internal number)
    out_of_sequence = False
    check_result = db.execute(text("""
        SELECT COUNT(*) FROM incidents 
        WHERE year_prefix = :year 
          AND internal_incident_number < :num 
          AND incident_date > :date
          AND deleted_at IS NULL
    """), {"year": year_prefix, "num": incident_number, "date": incident_date}).scalar()
    
    if check_result and check_result > 0:
        out_of_sequence = True
        logger.warning(
            f"Incident {incident_number} ({incident_date}) is out of sequence - "
            f"{check_result} earlier incidents have later dates"
        )
    
    incident = Incident(
        internal_incident_number=incident_number,
        year_prefix=year_prefix,
        status='OPEN',
        cad_event_number=data.cad_event_number,
        cad_event_type=data.cad_event_type,
        address=data.address,
        municipality_id=municipality_id,
        municipality_code=data.municipality_code,
        incident_date=incident_date,
        out_of_sequence=out_of_sequence,
        created_at=datetime.now(timezone.utc),
    )
    
    db.add(incident)
    db.execute(text("SELECT claim_incident_number(:num)"), {"num": incident_number})
    db.commit()
    db.refresh(incident)
    
    return {
        "id": incident.id, 
        "internal_incident_number": incident_number, 
        "reopened": False,
        "out_of_sequence": out_of_sequence
    }


@router.put("/{incident_id}")
async def update_incident(
    incident_id: int,
    data: IncidentUpdate,
    db: Session = Depends(get_db)
):
    """Update incident fields"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    update_data = data.model_dump(exclude_unset=True)
    
    # IMMUTABLE FIELDS - these cannot be changed after creation
    # incident_date: when the emergency occurred (set at creation, never changes)
    # internal_incident_number: assigned at creation
    # cad_event_number: from CAD system
    # created_at: record creation timestamp
    IMMUTABLE_FIELDS = ['incident_date', 'internal_incident_number', 'cad_event_number', 'created_at']
    
    for field in IMMUTABLE_FIELDS:
        if field in update_data:
            del update_data[field]
    
    # Auto-fetch weather if enabled and dispatch time is set
    weather_auto_fetch = True
    if SETTINGS_AVAILABLE:
        weather_auto_fetch = get_setting_value(db, 'weather', 'auto_fetch', True)
    
    if WEATHER_AVAILABLE and weather_auto_fetch:
        dispatch_time = update_data.get('time_dispatched') or incident.time_dispatched
        current_weather = update_data.get('weather_conditions') or incident.weather_conditions
        
        # Only fetch if we have dispatch time and no weather yet
        if dispatch_time and not current_weather:
            try:
                if isinstance(dispatch_time, str):
                    dispatch_time = datetime.fromisoformat(dispatch_time.replace('Z', '+00:00'))
                
                # Get coords from settings
                lat, lon = None, None
                if SETTINGS_AVAILABLE:
                    lat, lon = get_station_coords(db)
                
                weather = get_weather_for_incident(dispatch_time, latitude=lat, longitude=lon)
                if weather and weather.get('description'):
                    update_data['weather_conditions'] = weather['description']
                    update_data['weather_api_data'] = weather
                    update_data['weather_fetched_at'] = datetime.now(timezone.utc)
                    logger.info(f"Auto-fetched weather for incident {incident_id}: {weather['description']}")
            except Exception as e:
                logger.warning(f"Failed to auto-fetch weather: {e}")
    
    for field, value in update_data.items():
        if hasattr(incident, field):
            setattr(incident, field, value)
    
    incident.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"status": "ok", "id": incident_id}


@router.post("/{incident_id}/close")
async def close_incident(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """Close incident"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    incident.status = 'CLOSED'
    incident.updated_at = datetime.now(timezone.utc)
    if hasattr(incident, 'closed_at'):
        incident.closed_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"status": "ok", "id": incident_id}


# ============================================================================
# SIMPLE PERSONNEL ASSIGNMENTS
# ============================================================================

@router.put("/{incident_id}/assignments")
async def save_assignments(
    incident_id: int,
    data: AssignmentsUpdate,
    db: Session = Depends(get_db)
):
    """
    Save all personnel assignments in simple format.
    Input: { "assignments": { "ENG481": [person_id, null, person_id, null, null, null], ... } }
    """
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Delete all existing assignments for this incident
    db.query(IncidentPersonnel).filter(IncidentPersonnel.incident_id == incident_id).delete()
    db.query(IncidentUnit).filter(IncidentUnit.incident_id == incident_id).delete()
    db.flush()
    
    # Process each apparatus
    for unit_designator, slots in data.assignments.items():
        # Find apparatus by unit_designator
        apparatus = db.query(Apparatus).filter(Apparatus.unit_designator == unit_designator).first()
        if not apparatus:
            continue
        
        # Check if any slots have personnel
        has_personnel = any(pid for pid in slots if pid is not None)
        if not has_personnel:
            continue
        
        # Create incident unit
        unit = IncidentUnit(
            incident_id=incident_id,
            apparatus_id=apparatus.id,
        )
        db.add(unit)
        db.flush()
        
        # Add personnel for each slot
        for slot_idx, personnel_id in enumerate(slots):
            if personnel_id is None:
                continue
            
            # Get personnel info for snapshot
            person = db.query(Personnel).filter(Personnel.id == personnel_id).first()
            if not person:
                continue
            
            rank_name = "Unknown"
            if person.rank_id:
                rank = db.query(Rank).filter(Rank.id == person.rank_id).first()
                if rank:
                    rank_name = rank.rank_name
            
            assignment = IncidentPersonnel(
                incident_id=incident_id,
                incident_unit_id=unit.id,
                personnel_id=personnel_id,
                personnel_first_name=person.first_name,
                personnel_last_name=person.last_name,
                rank_id=person.rank_id,
                rank_name_snapshot=rank_name,
                slot_index=slot_idx,
                assignment_source='MANUAL',
            )
            db.add(assignment)
    
    incident.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"status": "ok", "incident_id": incident_id}

