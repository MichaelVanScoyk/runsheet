"""
Incident Pydantic Schemas - NERIS Compatible
Extracted from incidents.py for maintainability.

All NERIS fields use TEXT codes (not integers).
What you store is what you send to NERIS API.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# =============================================================================
# NERIS LOCATION STRUCTURES
# =============================================================================

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


# =============================================================================
# CAD DATA STRUCTURES
# =============================================================================

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


# =============================================================================
# INCIDENT CRUD SCHEMAS
# =============================================================================

class IncidentCreate(BaseModel):
    """Create new incident"""
    cad_event_number: str
    cad_event_type: Optional[str] = None
    cad_event_subtype: Optional[str] = None
    cad_raw_dispatch: Optional[str] = None
    address: Optional[str] = None
    location_name: Optional[str] = None
    municipality_code: Optional[str] = None
    internal_incident_number: Optional[str] = None  # F250001, E250001
    call_category: Optional[str] = 'FIRE'           # FIRE or EMS
    incident_date: Optional[str] = None  # YYYY-MM-DD


class IncidentUpdate(BaseModel):
    """Update incident - all NERIS fields use TEXT codes"""
    
    # Admin-editable fields (via unlock)
    internal_incident_number: Optional[str] = None  # Admin can update this
    cad_event_number: Optional[str] = None  # Admin can update this
    
    # Incident date - editable for DETAIL records (backdating)
    incident_date: Optional[str] = None  # YYYY-MM-DD
    
    # CAD fields (informational, not sent to NERIS)
    cad_event_type: Optional[str] = None
    cad_event_subtype: Optional[str] = None
    cad_raw_dispatch: Optional[str] = None
    cad_raw_updates: Optional[List[str]] = None
    cad_raw_clear: Optional[str] = None
    cad_event_comments: Optional[Dict[str, Any]] = None
    
    # Location - display
    address: Optional[str] = None
    location_name: Optional[str] = None
    municipality_code: Optional[str] = None
    cross_streets: Optional[str] = None
    esz_box: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None
    
    # Core times
    time_dispatched: Optional[datetime] = None
    time_first_enroute: Optional[datetime] = None
    time_first_on_scene: Optional[datetime] = None
    time_last_cleared: Optional[datetime] = None
    time_in_service: Optional[datetime] = None
    
    # Scheduled event times (DETAIL records)
    time_event_start: Optional[datetime] = None
    time_event_end: Optional[datetime] = None
    
    # Detail type (DETAIL records only)
    detail_type: Optional[str] = None
    
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
    equipment_used: Optional[str] = None
    problems_issues: Optional[str] = None
    
    # ==========================================================================
    # CHIEFS REPORT FIELDS
    # Simple values for traditional monthly reporting
    # ==========================================================================
    property_value_at_risk: Optional[int] = None   # In cents (divide by 100)
    fire_damages_estimate: Optional[int] = None    # In cents (divide by 100)
    ff_injuries_count: Optional[int] = None        # Firefighter injuries
    civilian_injuries_count: Optional[int] = None  # Civilian injuries
    
    # Audit
    officer_in_charge: Optional[int] = None
    completed_by: Optional[int] = None
    
    # Call category (FIRE or EMS) - changing this reassigns incident number
    call_category: Optional[str] = None
    
    # Mutual Aid
    neris_aid_direction: Optional[str] = None        # NONE, GIVEN, RECEIVED
    neris_aid_type: Optional[str] = None             # AUTOMATIC, MUTUAL, OTHER
    neris_aid_departments: Optional[List[str]] = None  # Legacy station numbers
    mutual_aid_department_ids: Optional[List[int]] = None  # Department table IDs
    
    # CAD units
    cad_units: Optional[List[Dict[str, Any]]] = None
    
    # Original dispatch units snapshot (write-once, set at incident creation)
    dispatched_units: Optional[List[Dict[str, Any]]] = None


# =============================================================================
# ASSIGNMENT SCHEMAS
# =============================================================================

class AssignmentsUpdate(BaseModel):
    """Personnel assignments by unit"""
    # Format: { "ENG481": [person_id, person_id, null, null, null, null], ... }
    assignments: Dict[str, List[Optional[int]]]


# =============================================================================
# ATTENDANCE / DETAIL RECORD SCHEMAS
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


# =============================================================================
# DUPLICATION SCHEMA
# =============================================================================

class IncidentDuplicate(BaseModel):
    """Request to duplicate an incident to a different category"""
    target_category: str  # FIRE, EMS, or DETAIL
