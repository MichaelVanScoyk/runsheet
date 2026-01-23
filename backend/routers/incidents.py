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
from pydantic import BaseModel, Field
import logging

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

# Import WebSocket broadcast helper (deferred to avoid circular imports)
_ws_broadcast = None

def _get_ws_broadcast():
    """Lazy import of WebSocket broadcast function"""
    global _ws_broadcast
    if _ws_broadcast is None:
        try:
            from routers.websocket import broadcast_to_tenant
            _ws_broadcast = broadcast_to_tenant
        except ImportError:
            _ws_broadcast = False  # Mark as unavailable
    return _ws_broadcast if _ws_broadcast else None


async def emit_incident_event(request, event_type: str, incident_data: dict):
    """
    Emit WebSocket event for incident changes.
    
    Args:
        request: FastAPI request (to extract tenant)
        event_type: One of 'incident_created', 'incident_updated', 'incident_closed'
        incident_data: Dict of incident fields to broadcast
    """
    broadcast = _get_ws_broadcast()
    if not broadcast:
        return
    
    # Extract tenant slug (same logic as database routing)
    x_tenant = request.headers.get('x-tenant')
    client_ip = request.client.host if request.client else None
    
    if x_tenant and _is_internal_ip(client_ip):
        tenant_slug = x_tenant
    else:
        tenant_slug = _extract_slug(request.headers.get('host', ''))
    
    try:
        await broadcast(tenant_slug, {
            "type": event_type,
            "incident": incident_data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        logger.debug(f"WebSocket broadcast: {event_type} to {tenant_slug}")
    except Exception as e:
        logger.warning(f"WebSocket broadcast failed: {e}")


# =============================================================================
# COMMENT VALIDATION STATUS HELPER
# =============================================================================

def get_comments_validation_status(cad_event_comments: dict, model_trained_at: str = None) -> str:
    """
    Calculate validation status for CAD event comments.
    
    Returns:
    - "trained" = Officer reviewed AND model trained after review
    - "validated" = Officer has reviewed (clicked Mark Reviewed)
    - "pending" = Has comments but officer hasn't reviewed yet
    - None = No comments at all
    
    Args:
        cad_event_comments: The JSONB field from incident
        model_trained_at: ISO timestamp of when model was last trained (optional)
    """
    if not cad_event_comments:
        return None
    
    comments = cad_event_comments.get("comments", [])
    if not comments:
        return None
    
    # Filter to non-noise comments only
    relevant_comments = [c for c in comments if not c.get("is_noise", False)]
    if not relevant_comments:
        return None
    
    # Status based on officer_reviewed_at timestamp, not individual comment sources
    officer_reviewed_at = cad_event_comments.get("officer_reviewed_at")
    
    if not officer_reviewed_at:
        return "pending"
    
    # Officer has reviewed - check if model trained since
    if model_trained_at and model_trained_at > officer_reviewed_at:
        return "trained"
    
    return "validated"


# =============================================================================
# AUDIT LOGGING HELPER
# =============================================================================

def log_incident_audit(
    db: Session,
    action: str,
    incident: Incident,
    completed_by_id: Optional[int],
    summary: str,
    fields_changed: Optional[dict] = None
):
    """
    Log an incident change to the audit trail.
    Uses completed_by personnel field (honor system).
    """
    personnel_name = None
    if completed_by_id:
        person = db.query(Personnel).filter(Personnel.id == completed_by_id).first()
        if person:
            personnel_name = f"{person.last_name}, {person.first_name}"
    
    log_entry = AuditLog(
        personnel_id=completed_by_id,
        personnel_name=personnel_name,
        action=action,
        entity_type="incident",
        entity_id=incident.id,
        entity_display=f"Incident {incident.internal_incident_number}",
        summary=summary,
        fields_changed=fields_changed,
    )
    db.add(log_entry)


# =============================================================================
# PYDANTIC SCHEMAS - NERIS Compatible
# =============================================================================

# =============================================================================
# PERSONNEL RECONCILIATION HELPER (Phase 2: CAD CLEAR Reconciliation)
# =============================================================================

def reconcile_personnel_on_close(db: Session, incident: Incident) -> dict:
    """
    Reconcile personnel assignments when CAD CLEAR arrives.
    
    Compares assigned units vs CAD CLEAR units. If personnel are assigned to
    units NOT in the CAD CLEAR data, they are automatically moved to STATION.
    A review task is created for officer attention.
    
    This runs during incident close (when CAD CLEAR is received).
    
    Returns:
        dict with 'moved_count', 'moved_personnel', 'orphan_units', 'task_created'
    """
    result = {
        'moved_count': 0,
        'moved_personnel': [],
        'orphan_units': [],
        'task_created': False,
    }
    
    # Get CAD units from the incident (populated by CAD CLEAR)
    cad_units = incident.cad_units or []
    if not cad_units:
        # No CAD units = no reconciliation needed (manual incident or no CLEAR data)
        return result
    
    # Build set of unit IDs that were actually on CAD CLEAR
    cad_unit_ids = set()
    for cu in cad_units:
        unit_id = cu.get('unit_id')
        if unit_id:
            cad_unit_ids.add(unit_id)
    
    if not cad_unit_ids:
        return result
    
    # Find STATION apparatus (where we'll move orphan personnel)
    station_apparatus = db.query(Apparatus).filter(
        Apparatus.unit_category == 'STATION',
        Apparatus.active == True
    ).first()
    
    if not station_apparatus:
        logger.warning(f"No STATION apparatus found for reconciliation on incident {incident.id}")
        return result
    
    # Get all current personnel assignments for this incident
    assignments = db.query(IncidentPersonnel).filter(
        IncidentPersonnel.incident_id == incident.id
    ).all()
    
    if not assignments:
        return result
    
    # Group assignments by unit, identify orphans
    orphan_personnel = []  # Personnel on units not in CAD CLEAR
    
    for assignment in assignments:
        # Get the unit and apparatus for this assignment
        unit = db.query(IncidentUnit).filter(IncidentUnit.id == assignment.incident_unit_id).first()
        if not unit:
            continue
        
        apparatus = db.query(Apparatus).filter(Apparatus.id == unit.apparatus_id).first()
        if not apparatus:
            continue
        
        # Skip STATION and DIRECT - these don't get reconciled against CAD
        if apparatus.unit_category in ('STATION', 'DIRECT'):
            continue
        
        # Check if this unit is in the CAD CLEAR data
        if apparatus.unit_designator not in cad_unit_ids:
            orphan_personnel.append({
                'assignment': assignment,
                'unit': unit,
                'apparatus': apparatus,
                'personnel_id': assignment.personnel_id,
                'personnel_name': f"{assignment.personnel_last_name}, {assignment.personnel_first_name}",
            })
            
            if apparatus.unit_designator not in result['orphan_units']:
                result['orphan_units'].append(apparatus.unit_designator)
    
    if not orphan_personnel:
        return result
    
    # Find or create STATION incident_unit for this incident
    station_unit = db.query(IncidentUnit).filter(
        IncidentUnit.incident_id == incident.id,
        IncidentUnit.apparatus_id == station_apparatus.id
    ).first()
    
    if not station_unit:
        station_unit = IncidentUnit(
            incident_id=incident.id,
            apparatus_id=station_apparatus.id,
            crew_count=0,
        )
        db.add(station_unit)
        db.flush()
    
    # Get current max slot_index in STATION for this incident
    max_slot = db.execute(text("""
        SELECT COALESCE(MAX(slot_index), -1) FROM incident_personnel
        WHERE incident_unit_id = :unit_id
    """), {"unit_id": station_unit.id}).scalar()
    next_slot = (max_slot or -1) + 1
    
    # Move each orphan personnel to STATION
    for orphan in orphan_personnel:
        assignment = orphan['assignment']
        
        # Update assignment to point to STATION
        assignment.incident_unit_id = station_unit.id
        assignment.slot_index = next_slot
        assignment.assignment_source = 'RECONCILED'  # Mark as auto-moved
        
        next_slot += 1
        result['moved_count'] += 1
        result['moved_personnel'].append({
            'personnel_id': orphan['personnel_id'],
            'personnel_name': orphan['personnel_name'],
            'from_unit': orphan['apparatus'].unit_designator,
        })
    
    # Update STATION unit crew count
    station_unit.crew_count = db.query(IncidentPersonnel).filter(
        IncidentPersonnel.incident_unit_id == station_unit.id
    ).count()
    
    # Create review task if we moved anyone
    if result['moved_count'] > 0:
        try:
            from routers.review_tasks import create_review_task_for_incident
            
            personnel_names = [p['personnel_name'] for p in result['moved_personnel']]
            personnel_ids = [p['personnel_id'] for p in result['moved_personnel']]
            
            title = f"{result['moved_count']} personnel moved to STATION"
            description = (
                f"Personnel were assigned to unit(s) {', '.join(result['orphan_units'])} "
                f"which were not in the CAD CLEAR data. They have been automatically "
                f"moved to STATION for review.\n\n"
                f"Personnel moved: {', '.join(personnel_names)}"
            )
            
            create_review_task_for_incident(
                db=db,
                incident_id=incident.id,
                task_type='personnel_reconciliation',
                title=title,
                description=description,
                metadata={
                    'orphan_units': result['orphan_units'],
                    'personnel_ids': personnel_ids,
                    'personnel_names': personnel_names,
                    'moved_to': 'STATION',
                },
                priority='normal',
            )
            result['task_created'] = True
            
            logger.info(
                f"Incident {incident.internal_incident_number}: "
                f"Moved {result['moved_count']} personnel from {result['orphan_units']} to STATION"
            )
            
        except Exception as e:
            logger.error(f"Failed to create review task for reconciliation: {e}")
    
    return result


class NerisLocationUse(BaseModel):
    """NERIS mod_location_use structure"""
    use_type: str                           # "RESIDENTIAL"
    use_subtype: str                        # "SINGLE_FAMILY"
    use_status: bool = True                 # Building in use?
    use_intended: bool = True               # Used as intended?
    use_vacancy: str = "OCCUPIED"           # OCCUPIED, VACANT, UNKNOWN
    use_secondary: bool = False
    use_type_secondary: Optional[str] = None
    use_subtype_secondary: Optional[str] = None


class NerisLocation(BaseModel):
    """NERIS mod_civic_location structure (partial)"""
    an_number: Optional[int] = None         # Address number: 123
    sn_street_name: Optional[str] = None    # Street name: Main
    sn_post_type: Optional[str] = None      # Street type: St, Ave, Blvd
    csop_incorporated_muni: Optional[str] = None  # Municipality
    csop_county: Optional[str] = None
    csop_state: Optional[str] = None
    csop_postal_code: Optional[str] = None


class CadUnit(BaseModel):
    """CAD unit data structure"""
    unit_id: str
    station: Optional[str] = None
    agency: Optional[str] = None
    is_mutual_aid: bool = False
    time_dispatched: Optional[str] = None
    time_enroute: Optional[str] = None
    time_arrived: Optional[str] = None
    time_available: Optional[str] = None
    time_cleared: Optional[str] = None


class IncidentCreate(BaseModel):
    """Create new incident"""
    cad_event_number: str
    cad_event_type: Optional[str] = None
    cad_event_subtype: Optional[str] = None
    cad_raw_dispatch: Optional[str] = None
    address: Optional[str] = None
    municipality_code: Optional[str] = None
    internal_incident_number: Optional[str] = None  # F250001, E250001
    call_category: Optional[str] = 'FIRE'           # FIRE or EMS
    incident_date: Optional[str] = None  # YYYY-MM-DD


class IncidentUpdate(BaseModel):
    """Update incident - all NERIS fields use TEXT codes"""
    
    # Admin-editable fields (via unlock)
    internal_incident_number: Optional[str] = None  # Admin can update this
    cad_event_number: Optional[str] = None  # Admin can update this
    
    # CAD fields (informational, not sent to NERIS)
    cad_event_type: Optional[str] = None
    cad_event_subtype: Optional[str] = None
    cad_raw_dispatch: Optional[str] = None
    cad_raw_updates: Optional[List[str]] = None
    cad_raw_clear: Optional[str] = None
    cad_event_comments: Optional[Dict[str, Any]] = None
    
    # Location - display
    address: Optional[str] = None
    municipality_code: Optional[str] = None
    cross_streets: Optional[str] = None
    esz_box: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None
    
    # Location - NERIS structured
    neris_location: Optional[Dict[str, Any]] = None
    
    # Core times
    time_dispatched: Optional[datetime] = None
    time_first_enroute: Optional[datetime] = None
    time_first_on_scene: Optional[datetime] = None
    time_last_cleared: Optional[datetime] = None
    time_in_service: Optional[datetime] = None
    
    # Tactic timestamps (fire incidents)
    time_command_established: Optional[datetime] = None
    time_sizeup_completed: Optional[datetime] = None
    time_primary_search_begin: Optional[datetime] = None
    time_primary_search_complete: Optional[datetime] = None
    time_water_on_fire: Optional[datetime] = None
    time_fire_under_control: Optional[datetime] = None
    time_fire_knocked_down: Optional[datetime] = None
    time_suppression_complete: Optional[datetime] = None
    time_extrication_complete: Optional[datetime] = None
    
    # Caller
    caller_name: Optional[str] = None
    caller_phone: Optional[str] = None
    caller_source: Optional[str] = None
    
    # Weather
    weather_conditions: Optional[str] = None
    
    # Narrative fields
    companies_called: Optional[str] = None
    situation_found: Optional[str] = None
    extent_of_damage: Optional[str] = None
    services_provided: Optional[str] = None
    narrative: Optional[str] = None
    equipment_used: Optional[List[str]] = None
    problems_issues: Optional[str] = None
    
    # ==========================================================================
    # CHIEFS REPORT FIELDS
    # Simple values for traditional monthly reporting
    # ==========================================================================
    property_value_at_risk: Optional[int] = None   # In cents (divide by 100)
    fire_damages_estimate: Optional[int] = None    # In cents (divide by 100)
    ff_injuries_count: Optional[int] = None        # Firefighter injuries
    civilian_injuries_count: Optional[int] = None  # Civilian injuries
    
    # ==========================================================================
    # NERIS CLASSIFICATION - TEXT CODES (not integers!)
    # ==========================================================================
    
    # Incident types - TEXT array
    # Example: ["FIRE: STRUCTURE_FIRE: RESIDENTIAL_SINGLE"]
    neris_incident_type_codes: Optional[List[str]] = None
    
    # Primary type flags (parallel to above)
    neris_incident_type_primary: Optional[List[bool]] = None
    
    # Location use - full module as dict/JSON
    neris_location_use: Optional[Dict[str, Any]] = None
    
    # Actions taken - TEXT array
    # Example: ["EXTINGUISHMENT: FIRE_CONTROL", "SEARCH: PRIMARY_SEARCH"]
    neris_action_codes: Optional[List[str]] = None
    
    # No action reason
    neris_noaction_code: Optional[str] = None
    
    # Mutual aid
    neris_aid_direction: Optional[str] = None  # GIVEN, RECEIVED, NONE
    neris_aid_type: Optional[str] = None       # AUTOMATIC, MUTUAL, OTHER
    neris_aid_departments: Optional[List[str]] = None
    
    # People present
    neris_people_present: Optional[bool] = None
    
    # Displaced (required) - number of people displaced from residence
    neris_displaced_number: Optional[int] = None
    
    # Risk reduction module (required) - smoke alarms, fire alarms, sprinklers
    # Structure: {smoke_alarm_presence, fire_alarm_presence, fire_suppression_presence, ...}
    neris_risk_reduction: Optional[Dict[str, Any]] = None
    
    # Rescues/casualties (required - can be empty arrays)
    neris_rescue_ff: Optional[List[Dict[str, Any]]] = None      # Firefighter
    neris_rescue_nonff: Optional[List[Dict[str, Any]]] = None   # Civilian
    neris_rescue_animal: Optional[int] = None                   # Animal rescue count
    
    # Narrative fields (recommended)
    neris_narrative_impedance: Optional[str] = None  # Obstacles that impacted incident
    neris_narrative_outcome: Optional[str] = None    # Final disposition description
    
    # NERIS Conditional Module: Fire (shown when incident type starts with FIRE)
    neris_fire_investigation_need: Optional[str] = None        # YES/NO/NOT_EVALUATED/etc
    neris_fire_investigation_type: Optional[List[str]] = None  # Types of investigation
    neris_fire_arrival_conditions: Optional[str] = None        # Structure fire arrival conditions
    neris_fire_structure_damage: Optional[str] = None          # NO_DAMAGE/MINOR/MODERATE/MAJOR
    neris_fire_structure_floor: Optional[int] = None           # Floor of origin
    neris_fire_structure_room: Optional[str] = None            # Room of origin code
    neris_fire_structure_cause: Optional[str] = None           # Structure fire cause
    neris_fire_outside_cause: Optional[str] = None             # Outside fire cause
    
    # NERIS Conditional Module: Medical (shown when incident type starts with MEDICAL)
    neris_medical_patient_care: Optional[str] = None           # Patient evaluation/care outcome
    
    # NERIS Conditional Module: Hazmat (shown when incident type starts with HAZSIT)
    neris_hazmat_disposition: Optional[str] = None             # Final disposition
    neris_hazmat_evacuated: Optional[int] = None               # Number evacuated
    neris_hazmat_chemicals: Optional[List[Dict[str, Any]]] = None  # [{dot_class, name, release_occurred}]
    
    # NERIS Module: Exposures (adjacent/other properties affected)
    neris_exposures: Optional[List[Dict[str, Any]]] = None     # [{exposure_type, exposure_item, address, ...}]
    
    # NERIS Module: Emerging Hazards (EV/battery, solar PV, CSST)
    neris_emerging_hazard: Optional[Dict[str, Any]] = None     # {ev_battery: {...}, solar_pv: {...}, csst: {...}}
    
    # NERIS Risk Reduction Details - Smoke Alarm
    neris_rr_smoke_alarm_type: Optional[List[str]] = None      # type_alarm_smoke (multi)
    neris_rr_smoke_alarm_working: Optional[bool] = None        # Was it working?
    neris_rr_smoke_alarm_operation: Optional[str] = None       # type_alarm_operation
    neris_rr_smoke_alarm_failure: Optional[str] = None         # type_alarm_failure
    neris_rr_smoke_alarm_action: Optional[str] = None          # Occupant action
    
    # NERIS Risk Reduction Details - Fire Alarm
    neris_rr_fire_alarm_type: Optional[List[str]] = None       # type_alarm_fire (multi)
    neris_rr_fire_alarm_operation: Optional[str] = None        # type_alarm_operation
    
    # NERIS Risk Reduction Details - Other Alarm
    neris_rr_other_alarm: Optional[str] = None                 # type_rr_presence
    neris_rr_other_alarm_type: Optional[List[str]] = None      # type_alarm_other (multi)
    
    # NERIS Risk Reduction Details - Sprinkler/Suppression
    neris_rr_sprinkler_type: Optional[List[str]] = None        # type_suppress_fire (multi)
    neris_rr_sprinkler_coverage: Optional[str] = None          # type_full_partial
    neris_rr_sprinkler_operation: Optional[str] = None         # type_suppress_operation
    neris_rr_sprinkler_heads_activated: Optional[int] = None   # Number of heads
    neris_rr_sprinkler_failure: Optional[str] = None           # type_alarm_failure
    
    # NERIS Risk Reduction Details - Cooking Suppression
    neris_rr_cooking_suppression: Optional[str] = None         # type_rr_presence
    neris_rr_cooking_suppression_type: Optional[List[str]] = None  # type_suppress_cooking (multi)
    
    # Audit
    officer_in_charge: Optional[int] = None
    completed_by: Optional[int] = None
    
    # Call category (FIRE or EMS) - changing this reassigns incident number
    call_category: Optional[str] = None
    
    # CAD units
    cad_units: Optional[List[Dict[str, Any]]] = None


class AssignmentsUpdate(BaseModel):
    """Personnel assignments by unit"""
    # Format: { "ENG481": [person_id, person_id, null, null, null, null], ... }
    assignments: Dict[str, List[Optional[int]]]


# =============================================================================
# NERIS ID GENERATION
# =============================================================================

def generate_neris_id(fd_neris_id: str, incident_time: datetime) -> Optional[str]:
    """
    Generate NERIS-format incident ID.
    Format: {fd_neris_id}:{epoch_milliseconds}
    Example: "FD24027000:1714762619000"
    """
    if not fd_neris_id:
        return None
    epoch_ms = int(incident_time.timestamp() * 1000)
    return f"{fd_neris_id}:{epoch_ms}"


def maybe_generate_neris_id(db: Session, incident: Incident) -> Optional[str]:
    """Generate NERIS ID if we have fd_neris_id configured and incident has time"""
    if incident.neris_id:
        return incident.neris_id  # Already has one
    
    if not SETTINGS_AVAILABLE:
        return None
    
    fd_neris_id = get_setting_value(db, 'neris', 'fd_neris_id', '')
    auto_generate = get_setting_value(db, 'neris', 'auto_generate_neris_id', True)
    
    if not fd_neris_id or not auto_generate:
        return None
    
    # Use dispatch time or created_at
    incident_time = incident.time_dispatched or incident.created_at
    if not incident_time:
        return None
    
    return generate_neris_id(fd_neris_id, incident_time)


# =============================================================================
# INCIDENT NUMBER HELPERS
# =============================================================================

# Valid call categories and their prefixes
CATEGORY_PREFIXES = {
    'FIRE': 'F',
    'EMS': 'E',
    'DETAIL': 'D',
}

PREFIX_CATEGORIES = {v: k for k, v in CATEGORY_PREFIXES.items()}  # Reverse lookup


def get_category_prefix(category: str) -> str:
    """Get the incident number prefix for a category."""
    return CATEGORY_PREFIXES.get(category, 'F')


def get_prefix_category(prefix: str) -> str:
    """Get the category for an incident number prefix."""
    return PREFIX_CATEGORIES.get(prefix.upper(), 'FIRE')


def get_next_incident_number(db: Session, year: int, category: str) -> str:
    """
    Get next incident number for year and category based on actual incidents.
    Format: F250001 (Fire), E250001 (EMS), D250001 (Detail)
    Uses MAX(existing) + 1 based on actual incident number patterns.
    """
    prefix = get_category_prefix(category)
    year_short = year % 100  # 2025 -> 25
    number_pattern = f"{prefix}{year_short}%"  # e.g., "F25%", "D25%"
    
    # Find the highest sequence number by matching the actual incident number pattern
    # This is more reliable than year_prefix since manual edits might not update year_prefix
    result = db.execute(text("""
        SELECT MAX(CAST(SUBSTRING(internal_incident_number FROM 4) AS INTEGER))
        FROM incidents
        WHERE internal_incident_number LIKE :pattern
          AND deleted_at IS NULL
    """), {"pattern": number_pattern}).scalar()
    
    next_num = (result or 0) + 1
    return f"{prefix}{year_short}{next_num:04d}"


def claim_incident_number(db: Session, year: int, category: str) -> str:
    """
    Claim the next incident number based on actual incidents (MAX + 1).
    This is now the same as get_next_incident_number since we don't pre-increment.
    The unique constraint on internal_incident_number handles concurrency.
    """
    return get_next_incident_number(db, year, category)


def parse_incident_number(number: str) -> tuple:
    """
    Parse incident number into components.
    F250001 -> ('FIRE', 2025, 1)
    E250015 -> ('EMS', 2025, 15)
    D250003 -> ('DETAIL', 2025, 3)
    """
    if not number or len(number) < 3:
        return (None, None, None)
    
    prefix = number[0].upper()
    category = get_prefix_category(prefix)
    
    try:
        year_short = int(number[1:3])
        year = 2000 + year_short
        seq_num = int(number[3:])
    except ValueError:
        return (None, None, None)
    
    return (category, year, seq_num)


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
        "municipality_code": incident.municipality_code,
        "time_dispatched": format_utc_iso(incident.time_dispatched),
        "cad_units": incident.cad_units or [],
    }


# =============================================================================
# INCIDENT SEQUENCE ADMIN
# =============================================================================

@router.get("/admin/sequence")
async def get_incident_sequence(
    year: Optional[int] = None,
    category: Optional[str] = None,  # FIRE, EMS, or None for both
    db: Session = Depends(get_db)
):
    """Get incident sequence for admin review"""
    if year is None:
        year = datetime.now().year
    
    year_short = year % 100
    results = {"year": year, "fire": None, "ems": None}
    
    categories_to_check = ['FIRE', 'EMS'] if category is None else [category]
    
    for cat in categories_to_check:
        prefix = 'F' if cat == 'FIRE' else 'E'
        
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
        """), {"year": year, "cat": cat}).fetchall()
        
        by_date = db.execute(text("""
            SELECT id, internal_incident_number, incident_date
            FROM incidents
            WHERE year_prefix = :year 
              AND call_category = :cat
              AND deleted_at IS NULL
            ORDER BY incident_date ASC, created_at ASC
        """), {"year": year, "cat": cat}).fetchall()
        
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
        
        cat_result = {
            "category": cat,
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
        
        if cat == 'FIRE':
            results["fire"] = cat_result
        else:
            results["ems"] = cat_result
    
    # Compute totals
    total_incidents = 0
    total_out_of_sequence = 0
    all_incidents = []
    all_changes_preview = []
    
    if results["fire"]:
        total_incidents += results["fire"]["total_incidents"]
        total_out_of_sequence += results["fire"]["out_of_sequence_count"]
        all_incidents.extend(results["fire"]["incidents"])
        all_changes_preview.extend(results["fire"]["changes_preview"])
    if results["ems"]:
        total_incidents += results["ems"]["total_incidents"]
        total_out_of_sequence += results["ems"]["out_of_sequence_count"]
        all_incidents.extend(results["ems"]["incidents"])
        all_changes_preview.extend(results["ems"]["changes_preview"])
    
    results["total_incidents"] = total_incidents
    results["out_of_sequence_count"] = total_out_of_sequence
    # Backward compatible - combined list sorted by number
    results["incidents"] = sorted(all_incidents, key=lambda x: x["number"])
    results["changes_preview"] = all_changes_preview
    
    return results


@router.post("/admin/fix-sequence")
async def fix_incident_sequence(
    year: int = Query(..., description="Year to fix"),
    category: Optional[str] = Query(None, description="Category to fix (FIRE, EMS, or omit for both)"),
    db: Session = Depends(get_db)
):
    """Fix all out-of-sequence incidents for a year"""
    year_short = year % 100
    categories_to_fix = ['FIRE', 'EMS'] if category is None else [category]
    
    all_changes = []
    
    for cat in categories_to_fix:
        prefix = 'F' if cat == 'FIRE' else 'E'
        
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
            db.execute(text("""
                UPDATE incidents 
                SET internal_incident_number = :temp_num 
                WHERE id = :id
            """), {"temp_num": f"TEMP-{change['id']}", "id": change["id"]})
        
        db.flush()
        
        # Final numbers
        for change in changes:
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
        "municipality_code": incident.municipality_code,
        "cross_streets": incident.cross_streets,
        "esz_box": incident.esz_box,
        "latitude": getattr(incident, 'latitude', None),
        "longitude": getattr(incident, 'longitude', None),
        "neris_location": incident.neris_location,
        
        # Core times - ALL UTC with Z suffix
        "time_dispatched": format_utc_iso(incident.time_dispatched),
        "time_first_enroute": format_utc_iso(incident.time_first_enroute),
        "time_first_on_scene": format_utc_iso(incident.time_first_on_scene),
        "time_last_cleared": format_utc_iso(incident.time_last_cleared),
        "time_in_service": format_utc_iso(incident.time_in_service),
        
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
    )
    
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
    
    update_data = data.model_dump(exclude_unset=True)
    
    # IMMUTABLE FIELDS - cannot change after creation (admin can change via unlock)
    # Note: internal_incident_number and cad_event_number CAN be changed by admin
    IMMUTABLE_FIELDS = ['incident_date', 'created_at', 'neris_id']
    for field in IMMUTABLE_FIELDS:
        update_data.pop(field, None)
    
    # Handle internal_incident_number change - update year_prefix to match
    if 'internal_incident_number' in update_data:
        new_number = update_data['internal_incident_number']
        if new_number and new_number != incident.internal_incident_number:
            parsed_cat, parsed_year, _ = parse_incident_number(new_number)
            if parsed_year and parsed_year != incident.year_prefix:
                logger.info(f"Incident number changed: {incident.internal_incident_number} → {new_number}, updating year_prefix {incident.year_prefix} → {parsed_year}")
                incident.year_prefix = parsed_year
    
    # Handle category change (special case - assigns new number)
    category_changed = False
    old_number = None
    new_number = None
    old_category = None
    if 'call_category' in update_data:
        new_category = update_data['call_category']
        if new_category and new_category != incident.call_category and new_category in CATEGORY_PREFIXES:
            category_changed = True
            old_category = incident.call_category
            old_number = incident.internal_incident_number
            
            # Assign new number from target category's sequence
            new_number = claim_incident_number(db, incident.year_prefix, new_category)
            incident.internal_incident_number = new_number
            incident.call_category = new_category
            
            logger.info(f"Category changed: {old_category} → {new_category}, number {old_number} → {new_number}")
            
            # Remove from update_data since we handled it manually
            del update_data['call_category']
    
    # Track changes for audit
    changes = {}
    for field, new_value in update_data.items():
        if hasattr(incident, field):
            old_value = getattr(incident, field)
            if old_value != new_value:
                changes[field] = {"old": str(old_value) if old_value else None, "new": str(new_value) if new_value else None}
    
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
    if changes or category_changed:
        # Summarize what changed
        change_keys = list(changes.keys())
        
        if category_changed:
            changes['call_category'] = {"old": old_category, "new": new_category}
            changes['internal_incident_number'] = {"old": old_number, "new": new_number}
            change_keys.extend(['call_category', 'internal_incident_number'])
        
        if len(change_keys) <= 3:
            summary = f"Updated: {', '.join(change_keys)}"
        else:
            summary = f"Updated {len(change_keys)} fields"
        
        log_incident_audit(
            db=db,
            action="UPDATE",
            incident=incident,
            completed_by_id=audit_user_id,
            summary=summary,
            fields_changed=changes
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
    
    # Audit log - use edited_by (logged-in user) or fall back to completed_by
    unit_count = len([u for u, slots in data.assignments.items() if any(p for p in slots if p)])
    audit_user_id = edited_by or incident.completed_by
    log_incident_audit(
        db=db,
        action="UPDATE",
        incident=incident,
        completed_by_id=audit_user_id,
        summary=f"Updated assignments ({unit_count} units)"
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


# =============================================================================
# ATTENDANCE / DETAIL RECORDS
# =============================================================================

class AttendanceRecordCreate(BaseModel):
    """Create a new attendance record (DETAIL category)"""
    detail_type: str                          # MEETING, WORKNIGHT, TRAINING, DRILL, OTHER
    incident_date: str                        # YYYY-MM-DD
    address: Optional[str] = None             # Default to station address
    time_event_start: Optional[datetime] = None
    time_event_end: Optional[datetime] = None
    narrative: Optional[str] = None
    completed_by: Optional[int] = None


class AttendanceUpdate(BaseModel):
    """Update attendance record fields"""
    detail_type: Optional[str] = None
    address: Optional[str] = None
    time_event_start: Optional[datetime] = None
    time_event_end: Optional[datetime] = None
    narrative: Optional[str] = None
    completed_by: Optional[int] = None


class AttendanceSave(BaseModel):
    """Save attendance list for a DETAIL record"""
    personnel_ids: List[int]                  # List of personnel IDs who attended


@router.post("/attendance")
async def create_attendance_record(
    data: AttendanceRecordCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new attendance record (DETAIL category incident).
    Used for meetings, worknights, training, drills, etc.
    """
    # Parse incident date
    try:
        incident_date = datetime.strptime(data.incident_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    year_prefix = incident_date.year
    
    # Get next DETAIL number
    incident_number = claim_incident_number(db, year_prefix, 'DETAIL')
    
    # Generate a unique CAD event number for DETAIL records
    # Format: D{year}{seq} to avoid conflicts with real CAD numbers
    cad_event_number = incident_number  # Use incident number as CAD number for DETAIL
    
    # Default address to "Station 48" if not provided (tenant-configurable in future)
    address = data.address or "Station 48"
    
    incident = Incident(
        internal_incident_number=incident_number,
        year_prefix=year_prefix,
        call_category='DETAIL',
        detail_type=data.detail_type,
        status='CLOSED',  # Attendance records are created closed
        cad_event_number=cad_event_number,
        cad_event_type='DETAIL',
        cad_event_subtype=data.detail_type,
        address=address,
        incident_date=incident_date,
        time_event_start=data.time_event_start,
        time_event_end=data.time_event_end,
        narrative=data.narrative,
        completed_by=data.completed_by,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    
    db.add(incident)
    db.commit()
    db.refresh(incident)
    
    # Audit log
    log_incident_audit(
        db=db,
        action="CREATE",
        incident=incident,
        completed_by_id=data.completed_by,
        summary=f"Attendance record created: {data.detail_type}"
    )
    db.commit()
    
    logger.info(f"Created attendance record {incident_number} ({data.detail_type})")
    
    return {
        "id": incident.id,
        "internal_incident_number": incident_number,
        "call_category": "DETAIL",
        "detail_type": data.detail_type,
        "incident_date": incident_date.isoformat(),
    }


@router.put("/{incident_id}/attendance")
async def save_attendance(
    incident_id: int,
    data: AttendanceSave,
    edited_by: Optional[int] = Query(None, description="Personnel ID of logged-in user"),
    db: Session = Depends(get_db)
):
    """
    Save attendance list for a DETAIL record.
    Personnel are stored in incident_personnel with incident_unit_id = NULL.
    """
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    if incident.call_category != 'DETAIL':
        raise HTTPException(status_code=400, detail="Attendance can only be saved for DETAIL records")
    
    # Clear existing attendance (personnel with NULL unit)
    db.query(IncidentPersonnel).filter(
        IncidentPersonnel.incident_id == incident_id,
        IncidentPersonnel.incident_unit_id.is_(None)
    ).delete()
    db.flush()
    
    # Add new attendance records
    added_count = 0
    for idx, personnel_id in enumerate(data.personnel_ids):
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
            incident_unit_id=None,  # NULL = attendance, not incident response
            personnel_id=personnel_id,
            personnel_first_name=person.first_name,
            personnel_last_name=person.last_name,
            rank_id=person.rank_id,
            rank_name_snapshot=rank_name,
            slot_index=idx,
            assignment_source='ATTENDANCE',
        )
        db.add(assignment)
        added_count += 1
    
    # Audit log
    audit_user_id = edited_by or incident.completed_by
    log_incident_audit(
        db=db,
        action="UPDATE",
        incident=incident,
        completed_by_id=audit_user_id,
        summary=f"Attendance updated: {added_count} personnel"
    )
    
    incident.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {
        "status": "ok",
        "incident_id": incident_id,
        "attendance_count": added_count
    }


@router.get("/{incident_id}/attendance")
async def get_attendance(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Get attendance list for a DETAIL record.
    Returns personnel assigned with incident_unit_id = NULL.
    """
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Get attendance (personnel with NULL unit)
    attendance = db.query(IncidentPersonnel).filter(
        IncidentPersonnel.incident_id == incident_id,
        IncidentPersonnel.incident_unit_id.is_(None)
    ).order_by(IncidentPersonnel.slot_index).all()
    
    return {
        "incident_id": incident_id,
        "detail_type": getattr(incident, 'detail_type', None),
        "attendance_count": len(attendance),
        "personnel": [
            {
                "id": a.id,
                "personnel_id": a.personnel_id,
                "first_name": a.personnel_first_name,
                "last_name": a.personnel_last_name,
                "rank_name": a.rank_name_snapshot,
            }
            for a in attendance
        ]
    }