"""
Incident Helper Functions
Extracted from incidents.py for maintainability.

Contains:
- WebSocket event emission
- ComCat validation status
- Audit logging
- Personnel reconciliation
- NERIS ID generation
- Incident number utilities
"""

from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import logging

from database import _extract_slug, _is_internal_ip
from models import (
    Incident, IncidentUnit, IncidentPersonnel,
    Apparatus, Personnel, AuditLog
)

logger = logging.getLogger(__name__)


# =============================================================================
# WEBSOCKET HELPERS
# =============================================================================

# Import WebSocket NOTIFY helper (deferred to avoid circular imports)
_ws_notify = None


def _get_ws_notify():
    """Lazy import of NOTIFY function (Phase D — cross-worker broadcasting)"""
    global _ws_notify
    if _ws_notify is None:
        try:
            from routers.websocket import notify_tenant_event
            _ws_notify = notify_tenant_event
        except ImportError:
            _ws_notify = False  # Mark as unavailable
    return _ws_notify if _ws_notify else None


async def emit_incident_event(request, event_type: str, incident_data: dict):
    """
    Emit WebSocket event for incident changes via PostgreSQL NOTIFY.
    
    Phase D: Uses NOTIFY instead of direct broadcast so all workers
    receive the event and broadcast to their local connections.
    
    Args:
        request: FastAPI request (to extract tenant)
        event_type: One of 'incident_created', 'incident_updated', 'incident_closed'
        incident_data: Dict of incident fields to broadcast
    """
    notify = _get_ws_notify()
    if not notify:
        return
    
    # Extract tenant slug (same logic as database routing)
    x_tenant = request.headers.get('x-tenant')
    client_ip = request.client.host if request.client else None
    
    if x_tenant and _is_internal_ip(client_ip):
        tenant_slug = x_tenant
    else:
        tenant_slug = _extract_slug(request.headers.get('host', ''))
    
    try:
        await notify(tenant_slug, "incident", {
            "type": event_type,
            "incident": incident_data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        logger.debug(f"WebSocket NOTIFY: {event_type} to {tenant_slug}")
    except Exception as e:
        logger.warning(f"WebSocket NOTIFY failed: {e}")


# =============================================================================
# COMCAT VALIDATION STATUS HELPER
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

# Human-readable field labels for audit trail display
FIELD_LABELS = {
    'officer_in_charge': 'Officer in charge',
    'completed_by': 'Completed by',
    'reviewed_by': 'Reviewed by',
    'call_category': 'Category',
    'internal_incident_number': 'Incident #',
    'cad_event_number': 'CAD #',
    'incident_date': 'Incident date',
    'address': 'Address',
    'location_name': 'Location name',
    'municipality_code': 'Municipality',
    'cross_streets': 'Cross streets',
    'esz_box': 'ESZ/Box',
    'cad_event_type': 'Event type',
    'cad_event_subtype': 'Event subtype',
    'narrative': 'Narrative',
    'situation_found': 'Situation found',
    'extent_of_damage': 'Extent of damage',
    'services_provided': 'Services provided',
    'companies_called': 'Companies called',
    'equipment_used': 'Equipment used',
    'problems_issues': 'Problems/issues',
    'caller_name': 'Caller name',
    'caller_phone': 'Caller phone',
    'weather_conditions': 'Weather',
    'status': 'Status',
    'time_dispatched': 'Dispatched',
    'time_first_enroute': 'First enroute',
    'time_first_on_scene': 'First on scene',
    'time_last_cleared': 'Last cleared',
    'time_fire_under_control': 'Fire under control',
    'time_in_service': 'In service',
    'time_extrication_complete': 'Extrication complete',
    'time_event_start': 'Event start',
    'time_event_end': 'Event end',
    'time_command_established': 'Command established',
    'time_sizeup_completed': 'Size-up completed',
    'time_primary_search_begin': 'Primary search begin',
    'time_primary_search_complete': 'Primary search complete',
    'time_water_on_fire': 'Water on fire',
    'time_fire_knocked_down': 'Fire knocked down',
    'time_suppression_complete': 'Suppression complete',
    'detail_type': 'Detail type',
    'year_prefix': 'Year',
    'property_value_at_risk': 'Property value at risk',
    'fire_damages_estimate': 'Fire damages estimate',
    'ff_injuries_count': 'FF injuries',
    'civilian_injuries_count': 'Civilian injuries',
    'review_status': 'Review status',
}

# Fields that store personnel IDs and need name resolution
PERSONNEL_ID_FIELDS = {'officer_in_charge', 'completed_by', 'reviewed_by'}

# Fields we skip in audit detail (auto-set, internal, or too noisy)
SKIP_AUDIT_FIELDS = {
    'weather_api_data', 'weather_fetched_at', 'cad_raw_dispatch',
    'cad_raw_clear', 'cad_raw_updates', 'cad_event_comments',
    'neris_location', 'latitude', 'longitude',
}


def _resolve_personnel_name(db: Session, personnel_id) -> Optional[str]:
    """Look up personnel name from ID. Returns 'Last, First' or None."""
    if not personnel_id:
        return None
    try:
        pid = int(personnel_id)
    except (ValueError, TypeError):
        return None
    person = db.query(Personnel).filter(Personnel.id == pid).first()
    if person:
        return f"{person.last_name}, {person.first_name}"
    return None


def format_audit_changes(db: Session, changes: dict) -> dict:
    """
    Format raw field changes into human-readable audit entries.
    
    - Resolves personnel IDs to names
    - Uses human-readable field labels
    - Skips noisy/internal fields
    - Keeps old=null when value was empty (frontend handles display)
    """
    formatted = {}
    
    for field, change in changes.items():
        # Skip internal fields
        if field in SKIP_AUDIT_FIELDS:
            continue
        
        # Skip most NERIS fields (too technical for audit display)
        if field.startswith('neris_') and field not in (
            'neris_incident_type_codes', 'neris_action_codes',
        ):
            continue
        
        # Must be {old, new} format
        if not isinstance(change, dict) or 'new' not in change:
            continue
        
        label = FIELD_LABELS.get(field, field.replace('_', ' ').title())
        old_val = change.get('old')
        new_val = change.get('new')
        
        # Resolve personnel IDs to names
        if field in PERSONNEL_ID_FIELDS:
            old_val = _resolve_personnel_name(db, old_val) if old_val else None
            new_val = _resolve_personnel_name(db, new_val) if new_val else None
        
        formatted[label] = {"old": old_val, "new": new_val}
    
    return formatted


def build_audit_summary(db: Session, changes: dict, category_changed=False, old_category=None, new_category=None) -> str:
    """
    Build a plain-English summary from changes dict.
    
    Examples:
    - "Set officer in charge to VanScoyk, Michael"
    - "Updated narrative, situation found"
    - "Changed category from FIRE to EMS"
    - "Updated 5 fields"
    """
    parts = []
    
    if category_changed:
        parts.append(f"Changed category from {old_category} to {new_category}")
    
    # Collect meaningful field changes (excluding category which is handled above)
    field_labels = []
    set_fields = []  # Fields that went from empty to a value
    
    for field, change in changes.items():
        if field in SKIP_AUDIT_FIELDS:
            continue
        if field.startswith('neris_') and field not in ('neris_incident_type_codes', 'neris_action_codes'):
            continue
        if not isinstance(change, dict):
            continue
        if field in ('call_category', 'internal_incident_number') and category_changed:
            continue  # Already in summary
        
        label = FIELD_LABELS.get(field, field.replace('_', ' '))
        old_val = change.get('old')
        new_val = change.get('new')
        
        # "Set X to Y" for personnel fields going from empty
        if field in PERSONNEL_ID_FIELDS and not old_val and new_val:
            name = _resolve_personnel_name(db, new_val)
            if name:
                set_fields.append(f"Set {label.lower()} to {name}")
                continue
        
        field_labels.append(label.lower())
    
    parts.extend(set_fields)
    
    if field_labels:
        if len(field_labels) <= 3:
            parts.append(f"Updated {', '.join(field_labels)}")
        else:
            parts.append(f"Updated {len(field_labels)} fields")
    
    return '; '.join(parts) if parts else "Updated"


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
# PERSONNEL RECONCILIATION HELPER (CAD CLEAR Reconciliation)
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
    """
    Generate NERIS ID if we have fd_neris_id configured and incident has time.
    """
    if incident.neris_id:
        return incident.neris_id  # Already has one
    
    # Try to import settings
    try:
        from routers.settings import get_setting_value
        settings_available = True
    except ImportError:
        settings_available = False
    
    if not settings_available:
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
