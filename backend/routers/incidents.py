"""
Incidents router - CRUD operations for incidents
NERIS-Compliant - December 2025

All NERIS fields use TEXT codes (not integers).
What you store is what you send to NERIS API.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, date
import logging

# Pydantic schemas (extracted for maintainability)
from schemas_incidents import (
    NerisLocationUse, NerisLocation, CadUnit,
    IncidentCreate, IncidentUpdate, AssignmentsUpdate,
    AttendanceRecordCreate, AttendanceUpdate, AttendanceSave,
)

# Helper functions (extracted for maintainability)
from incident_helpers import (
    emit_incident_event,
    get_comments_validation_status,
    log_incident_audit,
    format_audit_changes,
    build_audit_summary,
    reconcile_personnel_on_close,
    generate_neris_id,
    maybe_generate_neris_id,
    CATEGORY_PREFIXES,
    PREFIX_CATEGORIES,
    get_category_prefix,
    get_prefix_category,
    get_next_incident_number,
    claim_incident_number,
    parse_incident_number,
)

from database import get_db, _extract_slug, _is_internal_ip
from models import (
    Incident, IncidentUnit, IncidentPersonnel, 
    Municipality, Apparatus, Personnel, Rank, AuditLog
)
from settings_helper import format_utc_iso, iso_or_none

# Weather service (optional)
try:
    from weather_service import get_weather_for_incident
    WEATHER_AVAILABLE = True
except ImportError:
    WEATHER_AVAILABLE = False

# Settings helper
try:
    from routers.settings import get_setting_value, get_station_coords
    SETTINGS_AVAILABLE = True
except ImportError:
    SETTINGS_AVAILABLE = False

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/years")
async def get_incident_years(db: Session = Depends(get_db)):
    """Get list of years that have incident data, plus current year"""
    result = db.execute(text("""
        SELECT DISTINCT year_prefix 
        FROM incidents 
        WHERE deleted_at IS NULL 
        ORDER BY year_prefix DESC
    """))
    
    years = [row[0] for row in result]
    current_year = datetime.now().year
    
    # Always include current year even if no incidents yet
    if current_year not in years:
        years.insert(0, current_year)
    
    return {"years": years}


@router.get("/suggest-number")
async def suggest_incident_number(
    year: Optional[int] = None,
    category: str = 'FIRE',
    db: Session = Depends(get_db)
):
    """Get next suggested incident number for given year and category"""
    if year is None:
        year = datetime.now().year
    
    # Validate category - DETAIL is valid but CAD never creates it
    if category not in CATEGORY_PREFIXES:
        category = 'FIRE'
    
    suggested = get_next_incident_number(db, year, category)
    return {"suggested_number": suggested, "category": category}


# =============================================================================
# INCIDENT LIST
# =============================================================================

@router.get("")
async def list_incidents(
    year: Optional[int] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,  # FIRE, EMS, DETAIL, or None for all
    limit: int = Query(100, le=1000),
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
    
    # Filter by category if explicitly FIRE, EMS, or DETAIL
    if category and category.upper() in CATEGORY_PREFIXES:
        query = query.filter(Incident.call_category == category.upper())
        # When filtered to one category, order by incident number
        query = query.order_by(Incident.internal_incident_number.desc())
    else:
        # When showing "ALL" (Fire/EMS), exclude DETAIL records
        query = query.filter(Incident.call_category.in_(['FIRE', 'EMS']))
        # Order by date/time (chronological, newest first)
        query = query.order_by(Incident.incident_date.desc(), Incident.time_dispatched.desc(), Incident.created_at.desc())
    
    total = query.count()
    incidents = query.offset(offset).limit(limit).all()
    
    # Get model_trained_at for ComCat status (FIRE incidents only)
    model_trained_at = None
    try:
        import sys
        import os
        _project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if _project_root not in sys.path:
            sys.path.insert(0, _project_root)
        from cad.comcat_model import get_model, SKLEARN_AVAILABLE
        if SKLEARN_AVAILABLE:
            model = get_model()
            if model.is_trained and model.training_stats:
                model_trained_at = model.training_stats.get("trained_at")
    except Exception:
        pass  # ComCat not available
    
    # Build response with municipality display names
    incident_list = []
    for i in incidents:
        # Get municipality display name
        muni_display = i.municipality_code  # Default to code
        if i.municipality_id:
            muni = db.query(Municipality).filter(Municipality.id == i.municipality_id).first()
            if muni:
                muni_display = muni.display_name or muni.name or muni.code
        elif i.municipality_code:
            # Fallback: look up by code if no ID
            muni = db.query(Municipality).filter(Municipality.code == i.municipality_code).first()
            if muni:
                muni_display = muni.display_name or muni.name or muni.code
        
        # ComCat validation status - FIRE incidents only
        comcat_status = None
        if i.call_category == 'FIRE':
            comcat_status = get_comments_validation_status(i.cad_event_comments, model_trained_at)
        
        incident_list.append({
            "id": i.id,
            "internal_incident_number": i.internal_incident_number,
            "call_category": i.call_category,
            "neris_id": i.neris_id,
            "cad_event_number": i.cad_event_number,
            "cad_event_type": i.cad_event_type,
            "cad_event_subtype": i.cad_event_subtype,
            "status": i.status,
            "review_status": getattr(i, 'review_status', None),
            "incident_date": i.incident_date.isoformat() if i.incident_date else None,
            "address": i.address,
            "location_name": getattr(i, 'location_name', None),
            "municipality_code": i.municipality_code,
            "municipality_display_name": muni_display,
            "time_dispatched": format_utc_iso(i.time_dispatched),
            "neris_incident_type_codes": i.neris_incident_type_codes,
            "comcat_status": comcat_status,
        })
    
    return {
        "total": total,
        "year": year,
        "incidents": incident_list
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
    
    return {
        "id": incident.id,
        "internal_incident_number": incident.internal_incident_number,
        "call_category": incident.call_category,
        "neris_id": incident.neris_id,
        "cad_event_number": incident.cad_event_number,
        "cad_event_type": incident.cad_event_type,
        "status": incident.status,
        "incident_date": incident.incident_date.isoformat() if incident.incident_date else None,
        "address": incident.address,
        "location_name": getattr(incident, 'location_name', None),
        "municipality_code": incident.municipality_code,
        "time_dispatched": format_utc_iso(incident.time_dispatched),
        "cad_units": incident.cad_units or [],
    }


# =============================================================================
# GET SINGLE INCIDENT
# =============================================================================

@router.get("/{incident_id}")
async def get_incident(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """Get full incident details"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Build personnel assignments
    personnel_assignments = {}
    for unit in incident.units:
        apparatus = db.query(Apparatus).filter(Apparatus.id == unit.apparatus_id).first()
        if not apparatus:
            continue
        
        unit_key = apparatus.unit_designator
        
        if apparatus.is_virtual:
            slots = [p.personnel_id for p in sorted(unit.personnel, key=lambda x: x.slot_index or 0)]
        else:
            slots = [None] * 6
            for p in unit.personnel:
                if p.slot_index is not None and 0 <= p.slot_index < 6:
                    slots[p.slot_index] = p.personnel_id
        
        personnel_assignments[unit_key] = slots
    
    return {
        "id": incident.id,
        "internal_incident_number": incident.internal_incident_number,
        "year_prefix": incident.year_prefix,
        "call_category": incident.call_category,
        "detail_type": getattr(incident, 'detail_type', None),
        "neris_id": incident.neris_id,
        "cad_event_number": incident.cad_event_number,
        "cad_event_type": incident.cad_event_type,
        "cad_event_subtype": incident.cad_event_subtype,
        "status": incident.status,
        "review_status": getattr(incident, 'review_status', None),
        "incident_date": incident.incident_date.isoformat() if incident.incident_date else None,
        
        # Location
        "address": incident.address,
        "location_name": getattr(incident, 'location_name', None),
        "municipality_code": incident.municipality_code,
        "cross_streets": incident.cross_streets,
        "esz_box": incident.esz_box,
        "latitude": getattr(incident, 'latitude', None),
        "longitude": getattr(incident, 'longitude', None),
        "geocode_data": getattr(incident, 'geocode_data', None),
        "geocode_needs_review": getattr(incident, 'geocode_needs_review', None),
        "route_polyline": getattr(incident, 'route_polyline', None),
        "map_snapshot": getattr(incident, 'map_snapshot', None),
        "neris_location": incident.neris_location,
        
        # Core times - ALL UTC with Z suffix
        "time_dispatched": format_utc_iso(incident.time_dispatched),
        "time_first_enroute": format_utc_iso(incident.time_first_enroute),
        "time_first_on_scene": format_utc_iso(incident.time_first_on_scene),
        "time_last_cleared": format_utc_iso(incident.time_last_cleared),
        "time_in_service": format_utc_iso(incident.time_in_service),
        
        # Scheduled event times (DETAIL records)
        "time_event_start": format_utc_iso(incident.time_event_start),
        "time_event_end": format_utc_iso(incident.time_event_end),
        
        # Tactic timestamps - ALL UTC with Z suffix
        "time_command_established": iso_or_none(incident, 'time_command_established'),
        "time_sizeup_completed": iso_or_none(incident, 'time_sizeup_completed'),
        "time_primary_search_begin": iso_or_none(incident, 'time_primary_search_begin'),
        "time_primary_search_complete": iso_or_none(incident, 'time_primary_search_complete'),
        "time_water_on_fire": iso_or_none(incident, 'time_water_on_fire'),
        "time_fire_under_control": format_utc_iso(incident.time_fire_under_control),
        "time_fire_knocked_down": iso_or_none(incident, 'time_fire_knocked_down'),
        "time_suppression_complete": iso_or_none(incident, 'time_suppression_complete'),
        "time_extrication_complete": format_utc_iso(incident.time_extrication_complete),
        
        # Caller
        "caller_name": incident.caller_name,
        "caller_phone": incident.caller_phone,
        "caller_source": getattr(incident, 'caller_source', None),
        
        # Weather
        "weather_conditions": incident.weather_conditions,
        
        # Narrative
        "companies_called": incident.companies_called,
        "situation_found": incident.situation_found,
        "extent_of_damage": incident.extent_of_damage,
        "services_provided": incident.services_provided,
        "narrative": incident.narrative,
        "equipment_used": incident.equipment_used,
        "problems_issues": incident.problems_issues,
        
        # Chiefs Report Fields
        "property_value_at_risk": getattr(incident, 'property_value_at_risk', 0),
        "fire_damages_estimate": getattr(incident, 'fire_damages_estimate', 0),
        "ff_injuries_count": getattr(incident, 'ff_injuries_count', 0),
        "civilian_injuries_count": getattr(incident, 'civilian_injuries_count', 0),
        
        # NERIS Classification - TEXT codes
        "neris_incident_type_codes": incident.neris_incident_type_codes,
        "neris_incident_type_primary": getattr(incident, 'neris_incident_type_primary', None),
        "neris_location_use": incident.neris_location_use,
        "neris_action_codes": incident.neris_action_codes,
        "neris_noaction_code": getattr(incident, 'neris_noaction_code', None),
        "neris_aid_direction": getattr(incident, 'neris_aid_direction', None),
        "neris_aid_type": getattr(incident, 'neris_aid_type', None),
        "neris_aid_departments": getattr(incident, 'neris_aid_departments', None),
        "neris_people_present": getattr(incident, 'neris_people_present', None),
        "neris_displaced_number": getattr(incident, 'neris_displaced_number', None),
        "neris_risk_reduction": getattr(incident, 'neris_risk_reduction', None),
        "neris_rescue_ff": getattr(incident, 'neris_rescue_ff', None),
        "neris_rescue_nonff": getattr(incident, 'neris_rescue_nonff', None),
        "neris_rescue_animal": getattr(incident, 'neris_rescue_animal', None),
        "neris_narrative_impedance": getattr(incident, 'neris_narrative_impedance', None),
        "neris_narrative_outcome": getattr(incident, 'neris_narrative_outcome', None),
        
        # NERIS Conditional Module: Fire
        "neris_fire_investigation_need": getattr(incident, 'neris_fire_investigation_need', None),
        "neris_fire_investigation_type": getattr(incident, 'neris_fire_investigation_type', []),
        "neris_fire_arrival_conditions": getattr(incident, 'neris_fire_arrival_conditions', None),
        "neris_fire_structure_damage": getattr(incident, 'neris_fire_structure_damage', None),
        "neris_fire_structure_floor": getattr(incident, 'neris_fire_structure_floor', None),
        "neris_fire_structure_room": getattr(incident, 'neris_fire_structure_room', None),
        "neris_fire_structure_cause": getattr(incident, 'neris_fire_structure_cause', None),
        "neris_fire_outside_cause": getattr(incident, 'neris_fire_outside_cause', None),
        
        # NERIS Conditional Module: Medical
        "neris_medical_patient_care": getattr(incident, 'neris_medical_patient_care', None),
        
        # NERIS Conditional Module: Hazmat
        "neris_hazmat_disposition": getattr(incident, 'neris_hazmat_disposition', None),
        "neris_hazmat_evacuated": getattr(incident, 'neris_hazmat_evacuated', 0),
        "neris_hazmat_chemicals": getattr(incident, 'neris_hazmat_chemicals', []),
        
        # NERIS Module: Exposures
        "neris_exposures": getattr(incident, 'neris_exposures', []),
        
        # NERIS Module: Emerging Hazards
        "neris_emerging_hazard": getattr(incident, 'neris_emerging_hazard', None),
        
        # NERIS Risk Reduction Details - Smoke Alarm
        "neris_rr_smoke_alarm_type": getattr(incident, 'neris_rr_smoke_alarm_type', []),
        "neris_rr_smoke_alarm_working": getattr(incident, 'neris_rr_smoke_alarm_working', None),
        "neris_rr_smoke_alarm_operation": getattr(incident, 'neris_rr_smoke_alarm_operation', None),
        "neris_rr_smoke_alarm_failure": getattr(incident, 'neris_rr_smoke_alarm_failure', None),
        "neris_rr_smoke_alarm_action": getattr(incident, 'neris_rr_smoke_alarm_action', None),
        
        # NERIS Risk Reduction Details - Fire Alarm
        "neris_rr_fire_alarm_type": getattr(incident, 'neris_rr_fire_alarm_type', []),
        "neris_rr_fire_alarm_operation": getattr(incident, 'neris_rr_fire_alarm_operation', None),
        
        # NERIS Risk Reduction Details - Other Alarm
        "neris_rr_other_alarm": getattr(incident, 'neris_rr_other_alarm', None),
        "neris_rr_other_alarm_type": getattr(incident, 'neris_rr_other_alarm_type', []),
        
        # NERIS Risk Reduction Details - Sprinkler
        "neris_rr_sprinkler_type": getattr(incident, 'neris_rr_sprinkler_type', []),
        "neris_rr_sprinkler_coverage": getattr(incident, 'neris_rr_sprinkler_coverage', None),
        "neris_rr_sprinkler_operation": getattr(incident, 'neris_rr_sprinkler_operation', None),
        "neris_rr_sprinkler_heads_activated": getattr(incident, 'neris_rr_sprinkler_heads_activated', None),
        "neris_rr_sprinkler_failure": getattr(incident, 'neris_rr_sprinkler_failure', None),
        
        # NERIS Risk Reduction Details - Cooking Suppression
        "neris_rr_cooking_suppression": getattr(incident, 'neris_rr_cooking_suppression', None),
        "neris_rr_cooking_suppression_type": getattr(incident, 'neris_rr_cooking_suppression_type', []),
        
        # Submission status
        "neris_submitted_at": iso_or_none(incident, 'neris_submitted_at'),
        "neris_submission_id": getattr(incident, 'neris_submission_id', None),
        "neris_validation_errors": getattr(incident, 'neris_validation_errors', None),
        
        # Audit
        "officer_in_charge": incident.officer_in_charge,
        "completed_by": incident.completed_by,
        "reviewed_by": getattr(incident, 'reviewed_by', None),
        "reviewed_at": iso_or_none(incident, 'reviewed_at'),
        
        # Assignments
        "personnel_assignments": personnel_assignments,
        "cad_units": incident.cad_units or [],
        
        # CAD Raw Data (for audit/replay)
        "cad_raw_dispatch": incident.cad_raw_dispatch,
        "cad_raw_updates": incident.cad_raw_updates or [],
        "cad_raw_clear": incident.cad_raw_clear,
        "cad_event_comments": incident.cad_event_comments,
        
        # Timestamps - ALL UTC with Z suffix
        "created_at": format_utc_iso(incident.created_at),
        "updated_at": format_utc_iso(incident.updated_at),
        
        # CAD received timestamps (for modal timing logic)
        "cad_dispatch_received_at": format_utc_iso(incident.cad_dispatch_received_at),
        "cad_clear_received_at": format_utc_iso(incident.cad_clear_received_at),
    }


# =============================================================================
# CREATE INCIDENT
# =============================================================================

@router.post("")
async def create_incident(
    data: IncidentCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Create new incident"""
    
    # Check for existing
    existing = db.query(Incident).filter(
        Incident.cad_event_number == data.cad_event_number,
        Incident.deleted_at.is_(None)
    ).first()
    
    if existing:
        if existing.status == 'CLOSED':
            # Reopen closed incident
            existing.status = 'OPEN'
            existing.cad_reopen_count = (existing.cad_reopen_count or 0) + 1
            existing.updated_at = datetime.now(timezone.utc)
            db.commit()
            return {"id": existing.id, "reopened": True}
        else:
            raise HTTPException(status_code=400, detail="Incident already exists")
    
    # Determine category (default to FIRE)
    # Note: DETAIL is not valid for creation - incidents become DETAIL via category change only
    call_category = data.call_category or 'FIRE'
    if call_category not in ('FIRE', 'EMS'):
        call_category = 'FIRE'
    
    # Determine incident date first (needed for year)
    if data.incident_date:
        try:
            incident_date = datetime.strptime(data.incident_date, "%Y-%m-%d").date()
        except ValueError:
            incident_date = datetime.now(timezone.utc).date()
    else:
        incident_date = datetime.now(timezone.utc).date()
    
    year_prefix = incident_date.year
    
    # Get incident number
    if data.internal_incident_number:
        incident_number = data.internal_incident_number
        # Parse year from provided number
        _, parsed_year, _ = parse_incident_number(incident_number)
        if parsed_year:
            year_prefix = parsed_year
    else:
        incident_number = claim_incident_number(db, year_prefix, call_category)
    
    # Handle municipality
    municipality_id = None
    if data.municipality_code:
        muni = db.query(Municipality).filter(Municipality.code == data.municipality_code).first()
        if not muni:
            muni = Municipality(code=data.municipality_code, name=data.municipality_code, auto_created=True)
            db.add(muni)
            db.flush()
        municipality_id = muni.id
    
    # Check sequence (compare within same category)
    out_of_sequence = False
    prefix = get_category_prefix(call_category)
    year_short = year_prefix % 100
    
    # Get sequence number from incident_number string
    _, _, seq_num = parse_incident_number(incident_number)
    if seq_num:
        check_result = db.execute(text("""
            SELECT COUNT(*) FROM incidents 
            WHERE year_prefix = :year 
              AND call_category = :cat
              AND CAST(SUBSTRING(internal_incident_number FROM 4) AS INTEGER) < :seq
              AND incident_date > :date
              AND deleted_at IS NULL
        """), {"year": year_prefix, "cat": call_category, "seq": seq_num, "date": incident_date}).scalar()
        
        if check_result and check_result > 0:
            out_of_sequence = True
    
    incident = Incident(
        internal_incident_number=incident_number,
        year_prefix=year_prefix,
        call_category=call_category,
        status='OPEN',
        cad_event_number=data.cad_event_number,
        cad_event_type=data.cad_event_type,
        cad_event_subtype=data.cad_event_subtype,
        cad_raw_dispatch=data.cad_raw_dispatch,
        address=data.address,
        location_name=data.location_name,
        municipality_id=municipality_id,
        municipality_code=data.municipality_code,
        incident_date=incident_date,
        out_of_sequence=out_of_sequence,
        created_at=datetime.now(timezone.utc),
    )
    
    db.add(incident)
    db.commit()
    db.refresh(incident)
    
    # Try to generate NERIS ID
    neris_id = maybe_generate_neris_id(db, incident)
    if neris_id:
        incident.neris_id = neris_id
        db.commit()
    
    # Audit log
    log_incident_audit(
        db=db,
        action="CREATE",
        incident=incident,
        completed_by_id=None,
        summary=f"Incident created: {data.cad_event_type or 'Manual'} ({call_category})"
    )
    db.commit()
    
    # Emit WebSocket event for real-time updates
    background_tasks.add_task(
        emit_incident_event,
        request,
        "incident_created",
        {
            "id": incident.id,
            "internal_incident_number": incident_number,
            "call_category": call_category,
            "cad_event_number": data.cad_event_number,
            "cad_event_type": data.cad_event_type,
            "cad_event_subtype": data.cad_event_subtype,
            "status": "OPEN",
            "incident_date": incident_date.isoformat() if incident_date else None,
            "address": data.address,
            "location_name": data.location_name,
            "municipality_code": data.municipality_code,
            "created_at": format_utc_iso(incident.created_at),
            "updated_at": format_utc_iso(incident.updated_at),
        }
    )
    
    # Emit AV alert for browser sound/TTS notifications
    from routers.av_alerts import emit_av_alert
    background_tasks.add_task(
        emit_av_alert,
        request,
        "dispatch",
        incident.id,
        call_category,
        data.cad_event_type,
        data.cad_event_subtype,
        data.address,
        None,  # units_due not available at creation time
        incident.cross_streets,
        incident.esz_box,
        incident.municipality_code,
        getattr(incident, 'development', None),
    )
    
    # Background location processing (geocode → route → proximity)
    try:
        from services.location.background_task import process_incident_location
        from routers.settings import is_location_enabled
        if is_location_enabled(db):
            tenant_slug = _extract_slug(request.headers.get('host', ''))
            background_tasks.add_task(process_incident_location, incident.id, tenant_slug)
    except ImportError:
        pass
    
    return {
        "id": incident.id, 
        "internal_incident_number": incident_number,
        "call_category": call_category,
        "neris_id": incident.neris_id,
        "reopened": False,
        "out_of_sequence": out_of_sequence
    }


# =============================================================================
# UPDATE INCIDENT
# =============================================================================

@router.put("/{incident_id}")
async def update_incident(
    incident_id: int,
    data: IncidentUpdate,
    request: Request,
    background_tasks: BackgroundTasks,
    edited_by: Optional[int] = Query(None, description="Personnel ID of logged-in user making the edit"),
    db: Session = Depends(get_db)
):
    """Update incident fields"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Check unapproved member edit limit
    if edited_by:
        editor = db.query(Personnel).filter(Personnel.id == edited_by).first()
        if editor and editor.password_hash and not editor.approved_at:
            # Count distinct incidents this unapproved member has saved
            saved_count = db.execute(text(
                "SELECT COUNT(DISTINCT entity_id) FROM audit_log "
                "WHERE personnel_id = :pid AND entity_type = 'incident' AND action = 'UPDATE'"
            ), {"pid": edited_by}).scalar() or 0
            # Allow editing if this is the same incident they already edited, or their first
            already_edited_this = db.execute(text(
                "SELECT COUNT(*) FROM audit_log "
                "WHERE personnel_id = :pid AND entity_type = 'incident' AND entity_id = :iid AND action = 'UPDATE'"
            ), {"pid": edited_by, "iid": incident_id}).scalar() or 0
            if saved_count >= 1 and already_edited_this == 0:
                raise HTTPException(
                    status_code=403,
                    detail="Your account is awaiting approval. Please contact an officer or admin."
                )
    
    update_data = data.model_dump(exclude_unset=True)
    
    # IMMUTABLE FIELDS - cannot change after creation (admin can change via unlock)
    # Note: internal_incident_number, cad_event_number, and incident_date CAN be changed
    IMMUTABLE_FIELDS = ['created_at', 'neris_id']
    for field in IMMUTABLE_FIELDS:
        update_data.pop(field, None)
    
    # Don't allow blanking out cad_event_number - it's set during creation
    if 'cad_event_number' in update_data and not update_data['cad_event_number'] and incident.cad_event_number:
        del update_data['cad_event_number']
    
    # Handle internal_incident_number change - update year_prefix to match
    if 'internal_incident_number' in update_data:
        new_number = update_data['internal_incident_number']
        if new_number and new_number != incident.internal_incident_number:
            parsed_cat, parsed_year, _ = parse_incident_number(new_number)
            if parsed_year and parsed_year != incident.year_prefix:
                logger.info(f"Incident number changed: {incident.internal_incident_number} → {new_number}, updating year_prefix {incident.year_prefix} → {parsed_year}")
                incident.year_prefix = parsed_year
    
    # Handle category change (special case - assigns new number)
    # REQUIRES AUTHENTICATION - category changes affect incident numbering and audit trail
    category_changed = False
    old_number = None
    new_number = None
    old_category = None
    if 'call_category' in update_data:
        new_category = update_data['call_category']
        if new_category and new_category != incident.call_category and new_category in CATEGORY_PREFIXES:
            # Require authentication for category changes
            if not edited_by:
                raise HTTPException(
                    status_code=401,
                    detail="Authentication required to change incident category. Please log in."
                )
            
            # Verify the user exists and has appropriate role
            editor = db.query(Personnel).filter(Personnel.id == edited_by).first()
            if not editor:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid user. Please log in again."
                )
            
            # Only OFFICER and ADMIN roles can change category
            if editor.role not in ('OFFICER', 'ADMIN'):
                raise HTTPException(
                    status_code=403,
                    detail="Only officers and admins can change incident category."
                )
            
            category_changed = True
            old_category = incident.call_category
            old_number = incident.internal_incident_number
            
            # Assign new number from target category's sequence
            new_number = claim_incident_number(db, incident.year_prefix, new_category)
            incident.internal_incident_number = new_number
            incident.call_category = new_category
            
            logger.info(f"Category changed: {old_category} → {new_category}, number {old_number} → {new_number} (by personnel {edited_by})")
            
            # Remove from update_data since we handled it manually
            del update_data['call_category']
    
    # Handle detail_type change - sync to cad_event_subtype for list display
    if 'detail_type' in update_data and incident.call_category == 'DETAIL':
        new_detail_type = update_data['detail_type']
        if new_detail_type:
            update_data['cad_event_subtype'] = new_detail_type
    
    # Handle incident_date change for DETAIL records (year change triggers renumbering)
    detail_date_changed = False
    if 'incident_date' in update_data and incident.call_category == 'DETAIL':
        new_date_str = update_data['incident_date']
        if new_date_str:
            try:
                new_date = datetime.strptime(new_date_str, "%Y-%m-%d").date()
                new_year = new_date.year
                
                # Check if year is different
                if new_year != incident.year_prefix:
                    detail_date_changed = True
                    old_number = incident.internal_incident_number
                    old_year = incident.year_prefix
                    
                    # Assign new number from target year's DETAIL sequence
                    new_number = claim_incident_number(db, new_year, 'DETAIL')
                    incident.internal_incident_number = new_number
                    incident.year_prefix = new_year
                    
                    # Also update cad_event_number for DETAIL (it mirrors incident number)
                    incident.cad_event_number = new_number
                    
                    logger.info(f"DETAIL date changed year: {old_year} → {new_year}, number {old_number} → {new_number}")
            except ValueError:
                pass  # Invalid date format, let normal validation handle it
    
    # Track changes for audit
    changes = {}
    for field, new_value in update_data.items():
        if hasattr(incident, field):
            old_value = getattr(incident, field)
            # Normalize both to strings for comparison to avoid type mismatches
            # (e.g. date object vs "2026-02-09" string, int vs "84")
            old_str = str(old_value) if old_value is not None else None
            new_str = str(new_value) if new_value is not None else None
            if old_str != new_str:
                changes[field] = {"old": old_str, "new": new_str}
    
    # Auto-fetch weather if enabled
    weather_auto_fetch = True
    if SETTINGS_AVAILABLE:
        weather_auto_fetch = get_setting_value(db, 'weather', 'auto_fetch', True)
    
    if WEATHER_AVAILABLE and weather_auto_fetch:
        dispatch_time = update_data.get('time_dispatched') or incident.time_dispatched
        current_weather = update_data.get('weather_conditions') or incident.weather_conditions
        
        if dispatch_time and not current_weather:
            try:
                if isinstance(dispatch_time, str):
                    dispatch_time = datetime.fromisoformat(dispatch_time.replace('Z', '+00:00'))
                
                lat, lon = None, None
                if SETTINGS_AVAILABLE:
                    lat, lon = get_station_coords(db)
                
                weather = get_weather_for_incident(dispatch_time, latitude=lat, longitude=lon)
                if weather and weather.get('description'):
                    update_data['weather_conditions'] = weather['description']
                    update_data['weather_api_data'] = weather
                    update_data['weather_fetched_at'] = datetime.now(timezone.utc)
            except Exception as e:
                logger.warning(f"Failed to auto-fetch weather: {e}")
    
    # Use edited_by (logged-in user) for audit, fall back to completed_by
    audit_user_id = edited_by or update_data.get('completed_by') or incident.completed_by
    
    # Apply updates
    for field, value in update_data.items():
        if hasattr(incident, field):
            setattr(incident, field, value)
    
    incident.updated_at = datetime.now(timezone.utc)
    
    # Generate NERIS ID if we now have enough info
    if not incident.neris_id and incident.time_dispatched:
        neris_id = maybe_generate_neris_id(db, incident)
        if neris_id:
            incident.neris_id = neris_id
    
    # Audit log (only if actual changes)
    if changes or category_changed or detail_date_changed:
        if category_changed:
            changes['call_category'] = {"old": old_category, "new": new_category}
            changes['internal_incident_number'] = {"old": old_number, "new": new_number}
        
        if detail_date_changed:
            changes['year_prefix'] = {"old": str(old_year), "new": str(new_year)}
            changes['internal_incident_number'] = {"old": old_number, "new": new_number}
        
        # Build human-readable summary and format changes with names
        summary = build_audit_summary(
            db, changes,
            category_changed=category_changed,
            old_category=old_category,
            new_category=new_category if category_changed else None,
        )
        formatted_changes = format_audit_changes(db, changes)
        
        log_incident_audit(
            db=db,
            action="UPDATE",
            incident=incident,
            completed_by_id=audit_user_id,
            summary=summary,
            fields_changed=formatted_changes
        )
    
    db.commit()
    
    # Emit WebSocket event for real-time updates
    background_tasks.add_task(
        emit_incident_event,
        request,
        "incident_updated",
        {
            "id": incident.id,
            "internal_incident_number": incident.internal_incident_number,
            "call_category": incident.call_category,
            "cad_event_number": incident.cad_event_number,
            "cad_event_type": incident.cad_event_type,
            "cad_event_subtype": incident.cad_event_subtype,
            "status": incident.status,
            "incident_date": incident.incident_date.isoformat() if incident.incident_date else None,
            "address": incident.address,
            "location_name": getattr(incident, 'location_name', None),
            "municipality_code": incident.municipality_code,
            "time_dispatched": format_utc_iso(incident.time_dispatched),
            "updated_at": format_utc_iso(incident.updated_at),
            "cad_clear_received_at": format_utc_iso(incident.cad_clear_received_at),
        }
    )
    
    # ==========================================================================
    # Run centralized review task checker
    # This creates/resolves tasks based on current incident state
    # ==========================================================================
    try:
        from routers.review_tasks import check_incident_review_tasks
        review_result = check_incident_review_tasks(db, incident)
        if review_result['created'] or review_result['resolved']:
            db.commit()
            logger.debug(f"Review tasks for incident {incident_id}: {review_result}")
    except Exception as e:
        logger.error(f"Review task check failed for incident {incident_id}: {e}")
    
    # ==========================================================================
    # Address change → invalidate cached location data, re-geocode in background
    # ==========================================================================
    if 'address' in changes:
        try:
            db.execute(text("""
                UPDATE incidents SET 
                    latitude = NULL, longitude = NULL,
                    route_polyline = NULL, route_geometry = NULL,
                    map_snapshot = NULL, geocode_data = NULL,
                    geocode_needs_review = false
                WHERE id = :id
            """), {"id": incident_id})
            db.commit()
            
            from services.location.background_task import process_incident_location
            from routers.settings import is_location_enabled
            if is_location_enabled(db):
                tenant_slug = _extract_slug(request.headers.get('host', ''))
                background_tasks.add_task(process_incident_location, incident_id, tenant_slug)
                logger.info(f"Address changed on incident {incident_id} — location data invalidated, re-queued")
        except ImportError:
            pass
        except Exception as e:
            logger.warning(f"Location invalidation failed for incident {incident_id}: {e}")
    
    return {"status": "ok", "id": incident_id, "neris_id": incident.neris_id}


# =============================================================================
# CLOSE INCIDENT
# =============================================================================

@router.post("/{incident_id}/close")
async def close_incident(
    incident_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    edited_by: Optional[int] = Query(None, description="Personnel ID of logged-in user"),
    db: Session = Depends(get_db)
):
    """Close incident"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    old_status = incident.status
    incident.status = 'CLOSED'
    incident.updated_at = datetime.now(timezone.utc)
    
    # Record when the clear report was received (used for "1 hour after close" modal logic)
    if not incident.cad_clear_received_at:
        incident.cad_clear_received_at = datetime.now(timezone.utc)
    
    # ==========================================================================
    # PHASE 2: CAD CLEAR Personnel Reconciliation
    # Compare assigned units vs CAD CLEAR units, move orphans to STATION
    # ==========================================================================
    reconciliation_result = None
    try:
        reconciliation_result = reconcile_personnel_on_close(db, incident)
        
        if reconciliation_result and reconciliation_result.get('moved_count', 0) > 0:
            # Add reconciliation info to audit log
            moved_names = [p['personnel_name'] for p in reconciliation_result['moved_personnel']]
            orphan_units = reconciliation_result['orphan_units']
            
            log_incident_audit(
                db=db,
                action="RECONCILE",
                incident=incident,
                completed_by_id=None,  # System action
                summary=f"Auto-moved {reconciliation_result['moved_count']} personnel from {', '.join(orphan_units)} to STATION",
                fields_changed={
                    "personnel_moved": moved_names,
                    "orphan_units": orphan_units,
                    "review_task_created": reconciliation_result.get('task_created', False)
                }
            )
    except Exception as e:
        logger.error(f"Personnel reconciliation failed for incident {incident_id}: {e}")
        # Don't fail the close operation if reconciliation fails
    
    # ==========================================================================
    # Run centralized review task checker
    # This handles incomplete_narrative and any other applicable task types
    # ==========================================================================
    try:
        from routers.review_tasks import check_incident_review_tasks
        review_result = check_incident_review_tasks(db, incident)
        if review_result['created'] or review_result['resolved']:
            logger.info(f"Review tasks for incident {incident.internal_incident_number}: created={review_result['created']}, resolved={review_result['resolved']}")
    except Exception as e:
        logger.error(f"Review task check failed for incident {incident_id}: {e}")
    
    # Audit log - use edited_by (logged-in user) or fall back to completed_by
    audit_user_id = edited_by or incident.completed_by
    log_incident_audit(
        db=db,
        action="CLOSE",
        incident=incident,
        completed_by_id=audit_user_id,
        summary=f"Status changed: {old_status} → CLOSED",
        fields_changed={"status": {"old": old_status, "new": "CLOSED"}}
    )
    
    db.commit()
    
    # Emit WebSocket event for real-time updates
    background_tasks.add_task(
        emit_incident_event,
        request,
        "incident_closed",
        {
            "id": incident.id,
            "internal_incident_number": incident.internal_incident_number,
            "call_category": incident.call_category,
            "cad_event_number": incident.cad_event_number,
            "status": "CLOSED",
            "incident_date": incident.incident_date.isoformat() if incident.incident_date else None,
            "address": incident.address,
            "location_name": getattr(incident, 'location_name', None),
            "updated_at": format_utc_iso(incident.updated_at),
            "cad_clear_received_at": format_utc_iso(incident.cad_clear_received_at),
        }
    )
    
    # Emit AV alert for browser sound notifications (close sound)
    from routers.av_alerts import emit_av_alert
    # Extract unit IDs from cad_units for the alert
    units_due = [u.get('unit_id') for u in (incident.cad_units or []) if u.get('unit_id')]
    background_tasks.add_task(
        emit_av_alert,
        request,
        "close",
        incident.id,
        incident.call_category,
        incident.cad_event_type,
        incident.cad_event_subtype,
        incident.address,
        units_due,
        incident.cross_streets,
        incident.esz_box,
        incident.municipality_code,
        getattr(incident, 'development', None),
    )
    
    # Include reconciliation info in response if any personnel were moved
    response = {"status": "ok", "id": incident_id}
    if reconciliation_result and reconciliation_result.get('moved_count', 0) > 0:
        response["reconciliation"] = {
            "moved_count": reconciliation_result['moved_count'],
            "orphan_units": reconciliation_result['orphan_units'],
            "task_created": reconciliation_result.get('task_created', False)
        }
    
    return response


# =============================================================================
# DELETE INCIDENT (hard delete)
# =============================================================================

@router.delete("/{incident_id}")
async def delete_incident(
    incident_id: int,
    edited_by: Optional[int] = Query(None, description="Personnel ID of admin deleting"),
    db: Session = Depends(get_db)
):
    """
    Permanently delete an incident.
    This is a hard delete - the incident and all related data will be removed.
    Only for admin use to remove incidents created in error.
    """
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Capture info for audit log before deletion
    incident_number = incident.internal_incident_number
    cad_number = incident.cad_event_number
    address = incident.address
    
    # Get personnel name for audit
    personnel_name = None
    if edited_by:
        person = db.query(Personnel).filter(Personnel.id == edited_by).first()
        if person:
            personnel_name = f"{person.last_name}, {person.first_name}"
    
    # Delete related records first (cascade should handle this, but be explicit)
    db.query(IncidentPersonnel).filter(IncidentPersonnel.incident_id == incident_id).delete()
    db.query(IncidentUnit).filter(IncidentUnit.incident_id == incident_id).delete()
    
    # Delete review tasks for this incident
    db.execute(text("""
        DELETE FROM review_tasks 
        WHERE entity_type = 'incident' AND entity_id = :incident_id
    """), {"incident_id": incident_id})
    
    # Delete the incident
    db.delete(incident)
    
    # Log to audit trail (the incident is gone, so log independently)
    log_entry = AuditLog(
        personnel_id=edited_by,
        personnel_name=personnel_name,
        action="DELETE",
        entity_type="incident",
        entity_id=incident_id,
        entity_display=f"Incident {incident_number}",
        summary=f"Permanently deleted incident {incident_number} (CAD: {cad_number}, Address: {address})",
    )
    db.add(log_entry)
    
    db.commit()
    
    logger.warning(f"ADMIN: Permanently deleted incident {incident_number} (ID: {incident_id}) by personnel {edited_by}")
    
    return {
        "status": "ok",
        "deleted_id": incident_id,
        "deleted_number": incident_number
    }


# =============================================================================
# PERSONNEL ASSIGNMENTS
# =============================================================================

@router.put("/{incident_id}/assignments")
async def save_assignments(
    incident_id: int,
    data: AssignmentsUpdate,
    edited_by: Optional[int] = Query(None, description="Personnel ID of logged-in user making the edit"),
    db: Session = Depends(get_db)
):
    """Save personnel assignments"""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Check unapproved member edit limit
    if edited_by:
        editor = db.query(Personnel).filter(Personnel.id == edited_by).first()
        if editor and editor.password_hash and not editor.approved_at:
            saved_count = db.execute(text(
                "SELECT COUNT(DISTINCT entity_id) FROM audit_log "
                "WHERE personnel_id = :pid AND entity_type = 'incident' AND action = 'UPDATE'"
            ), {"pid": edited_by}).scalar() or 0
            already_edited_this = db.execute(text(
                "SELECT COUNT(*) FROM audit_log "
                "WHERE personnel_id = :pid AND entity_type = 'incident' AND entity_id = :iid AND action = 'UPDATE'"
            ), {"pid": edited_by, "iid": incident_id}).scalar() or 0
            if saved_count >= 1 and already_edited_this == 0:
                raise HTTPException(
                    status_code=403,
                    detail="Your account is awaiting approval. Please contact an officer or admin."
                )
    
    # Snapshot current assignments BEFORE clearing (for audit diff)
    old_assignments = {}  # {unit_designator: set of personnel_ids}
    existing_units = db.query(IncidentUnit).filter(IncidentUnit.incident_id == incident_id).all()
    for unit in existing_units:
        app = db.query(Apparatus).filter(Apparatus.id == unit.apparatus_id).first()
        if app:
            pids = {p.personnel_id for p in unit.personnel if p.personnel_id}
            if pids:
                old_assignments[app.unit_designator] = pids
    
    # Clear existing
    db.query(IncidentPersonnel).filter(IncidentPersonnel.incident_id == incident_id).delete()
    db.query(IncidentUnit).filter(IncidentUnit.incident_id == incident_id).delete()
    db.flush()
    
    # Process each unit
    for unit_designator, slots in data.assignments.items():
        apparatus = db.query(Apparatus).filter(Apparatus.unit_designator == unit_designator).first()
        if not apparatus:
            continue
        
        if not any(pid for pid in slots if pid is not None):
            continue
        
        unit = IncidentUnit(
            incident_id=incident_id,
            apparatus_id=apparatus.id,
            crew_count=len([p for p in slots if p is not None]),
        )
        db.add(unit)
        db.flush()
        
        for slot_idx, personnel_id in enumerate(slots):
            if personnel_id is None:
                continue
            
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
    
    # Build new assignments snapshot for diff
    new_assignments = {}  # {unit_designator: set of personnel_ids}
    for unit_designator, slots in data.assignments.items():
        pids = {int(pid) for pid in slots if pid is not None}
        if pids:
            new_assignments[unit_designator] = pids
    
    # Diff old vs new assignments
    all_units = set(list(old_assignments.keys()) + list(new_assignments.keys()))
    assignment_changes = {}
    
    for unit_des in sorted(all_units):
        old_pids = old_assignments.get(unit_des, set())
        new_pids = new_assignments.get(unit_des, set())
        
        if old_pids == new_pids:
            continue
        
        added_ids = new_pids - old_pids
        removed_ids = old_pids - new_pids
        
        # Resolve names
        added_names = []
        for pid in added_ids:
            person = db.query(Personnel).filter(Personnel.id == pid).first()
            if person:
                added_names.append(f"{person.last_name}, {person.first_name}")
        
        removed_names = []
        for pid in removed_ids:
            person = db.query(Personnel).filter(Personnel.id == pid).first()
            if person:
                removed_names.append(f"{person.last_name}, {person.first_name}")
        
        change = {}
        if added_names:
            change['added'] = ', '.join(sorted(added_names))
        if removed_names:
            change['removed'] = ', '.join(sorted(removed_names))
        if change:
            assignment_changes[unit_des] = change
    
    # Build summary and fields_changed
    audit_user_id = edited_by or incident.completed_by
    
    if assignment_changes:
        # Build plain English summary
        summary_parts = []
        for unit_des, change in assignment_changes.items():
            if 'added' in change and 'removed' not in change:
                summary_parts.append(f"Added {change['added']} to {unit_des}")
            elif 'removed' in change and 'added' not in change:
                summary_parts.append(f"Removed {change['removed']} from {unit_des}")
            else:
                parts = []
                if 'added' in change:
                    parts.append(f"added {change['added']}")
                if 'removed' in change:
                    parts.append(f"removed {change['removed']}")
                summary_parts.append(f"{unit_des}: {', '.join(parts)}")
        
        if len(summary_parts) <= 2:
            summary = '; '.join(summary_parts)
        else:
            summary = f"Updated assignments on {len(assignment_changes)} units"
        
        # Format fields_changed: each unit is a key with {old, new} showing names
        fields_changed = {}
        for unit_des, change in assignment_changes.items():
            old_display = None
            new_display = None
            if 'removed' in change:
                old_display = change['removed']
            if 'added' in change:
                new_display = change['added']
            fields_changed[unit_des] = {"old": old_display, "new": new_display}
    else:
        summary = "Saved assignments (no changes)"
        fields_changed = None
    
    log_incident_audit(
        db=db,
        action="UPDATE",
        incident=incident,
        completed_by_id=audit_user_id,
        summary=summary,
        fields_changed=fields_changed
    )
    
    incident.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"status": "ok", "incident_id": incident_id}


# =============================================================================
# NERIS VALIDATION
# =============================================================================

@router.get("/{incident_id}/validate-neris")
async def validate_neris(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Validate incident for NERIS submission.
    Returns list of missing/invalid fields.
    """
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    errors = []
    warnings = []
    
    # Required fields
    if not incident.neris_id:
        errors.append({"field": "neris_id", "message": "NERIS ID not generated. Check fd_neris_id setting."})
    
    if not incident.neris_incident_type_codes:
        errors.append({"field": "neris_incident_type_codes", "message": "Incident type required"})
    
    if not incident.neris_location_use:
        errors.append({"field": "neris_location_use", "message": "Location use required"})
    else:
        loc_use = incident.neris_location_use
        if not loc_use.get('use_type'):
            errors.append({"field": "neris_location_use.use_type", "message": "Location use type required"})
        if not loc_use.get('use_subtype'):
            errors.append({"field": "neris_location_use.use_subtype", "message": "Location use subtype required"})
    
    if not incident.neris_action_codes and not getattr(incident, 'neris_noaction_code', None):
        errors.append({"field": "neris_action_codes", "message": "Actions taken or no-action reason required"})
    
    if not incident.narrative:
        errors.append({"field": "narrative", "message": "Narrative/outcome required"})
    
    # Times
    if not incident.time_dispatched:
        errors.append({"field": "time_dispatched", "message": "Dispatch time required"})
    
    # Units
    if not incident.units and not incident.cad_units:
        warnings.append({"field": "units", "message": "No unit responses recorded"})
    
    # Fire-specific
    if incident.neris_incident_type_codes:
        is_fire = any('FIRE' in code for code in incident.neris_incident_type_codes)
        if is_fire:
            if not incident.time_fire_under_control:
                warnings.append({"field": "time_fire_under_control", "message": "Fire under control time recommended for fire incidents"})
    
    # Validate codes exist
    if incident.neris_incident_type_codes:
        for code in incident.neris_incident_type_codes:
            exists = db.execute(text("""
                SELECT 1 FROM neris_codes 
                WHERE category = 'type_incident' AND value = :code AND active = true
            """), {"code": code}).fetchone()
            if not exists:
                errors.append({"field": "neris_incident_type_codes", "message": f"Invalid code: {code}"})
    
    is_valid = len(errors) == 0
    
    return {
        "incident_id": incident_id,
        "neris_id": incident.neris_id,
        "is_valid": is_valid,
        "errors": errors,
        "warnings": warnings
    }


# =============================================================================
# AUDIT LOG
# =============================================================================

@router.get("/{incident_id}/audit-log")
async def get_incident_audit_log(
    incident_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """Get audit log entries for a specific incident"""
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    entries = db.query(AuditLog).filter(
        AuditLog.entity_type == "incident",
        AuditLog.entity_id == incident_id
    ).order_by(AuditLog.created_at.desc()).limit(limit).all()
    
    return {
        "incident_id": incident_id,
        "entries": [
            {
                "id": e.id,
                "action": e.action,
                "personnel_id": e.personnel_id,
                "personnel_name": e.personnel_name,
                "summary": e.summary,
                "fields_changed": e.fields_changed,
                "created_at": format_utc_iso(e.created_at),
            }
            for e in entries
        ]
    }


# =============================================================================
# ADJACENT INCIDENTS (for navigation)
# =============================================================================

@router.get("/{incident_id}/adjacent")
async def get_adjacent_incidents(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Get IDs of adjacent incidents in the same category.
    Ordered by incident_date DESC, internal_incident_number DESC (newest first).
    
    Returns:
        newer_id: ID of next newer incident (or null if at newest)
        older_id: ID of next older incident (or null if at oldest)
    """
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    category = incident.call_category
    inc_date = incident.incident_date
    inc_number = incident.internal_incident_number
    
    # Find newer incident (higher date or same date with higher number)
    newer = db.execute(text("""
        SELECT id FROM incidents
        WHERE call_category = :category
          AND deleted_at IS NULL
          AND id != :current_id
          AND (
            incident_date > :inc_date
            OR (incident_date = :inc_date AND internal_incident_number > :inc_number)
          )
        ORDER BY incident_date ASC, internal_incident_number ASC
        LIMIT 1
    """), {
        "category": category,
        "current_id": incident_id,
        "inc_date": inc_date,
        "inc_number": inc_number
    }).fetchone()
    
    # Find older incident (lower date or same date with lower number)
    older = db.execute(text("""
        SELECT id FROM incidents
        WHERE call_category = :category
          AND deleted_at IS NULL
          AND id != :current_id
          AND (
            incident_date < :inc_date
            OR (incident_date = :inc_date AND internal_incident_number < :inc_number)
          )
        ORDER BY incident_date DESC, internal_incident_number DESC
        LIMIT 1
    """), {
        "category": category,
        "current_id": incident_id,
        "inc_date": inc_date,
        "inc_number": inc_number
    }).fetchone()
    
    return {
        "current_id": incident_id,
        "category": category,
        "newer_id": newer[0] if newer else None,
        "older_id": older[0] if older else None
    }


