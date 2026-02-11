"""
SQLAlchemy models for RunSheet
NERIS-Compliant Schema - December 2025

All NERIS fields use the exact data types and formats expected by the NERIS API.
No conversion needed at export time - what you store is what you send.
"""

from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey, Date, ARRAY
from sqlalchemy.dialects.postgresql import TIMESTAMP, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


# =============================================================================
# CORE LOOKUP TABLES
# =============================================================================

class Rank(Base):
    """Fire department ranks (Chief, Captain, Lieutenant, FF, etc.)"""
    __tablename__ = "ranks"
    
    id = Column(Integer, primary_key=True)
    rank_name = Column(String(50), nullable=False)
    abbreviation = Column(String(10))
    display_order = Column(Integer, default=100)  # Lower = higher rank
    active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


class Personnel(Base):
    """Fire department members"""
    __tablename__ = "personnel"
    
    id = Column(Integer, primary_key=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    rank_id = Column(Integer, ForeignKey("ranks.id"))
    active = Column(Boolean, default=True)
    dashboard_id = Column(Integer)  # Link to Dashboard system if synced
    
    # Auth fields
    email = Column(String(255))
    role = Column(String(20))  # ADMIN, OFFICER, MEMBER
    password_hash = Column(String(255))
    email_verified_at = Column(TIMESTAMP(timezone=True))
    approved_at = Column(TIMESTAMP(timezone=True))
    approved_by = Column(Integer, ForeignKey("personnel.id"))
    last_login_at = Column(TIMESTAMP(timezone=True))
    
    # Password reset tokens (expires in 1 hour)
    reset_token = Column(String(100))
    reset_token_expires_at = Column(TIMESTAMP(timezone=True))
    
    # Invitation tokens (expires in 24 hours)
    # If is_self_activation=False: admin-sent invite, auto-approves on accept
    # If is_self_activation=True: user self-registered, does NOT auto-approve
    invite_token = Column(String(100))
    invite_token_expires_at = Column(TIMESTAMP(timezone=True))
    is_self_activation = Column(Boolean, default=False)
    
    # Notification preferences: {"admin_notifications": bool, "incident_notifications": bool}
    notification_preferences = Column(JSONB, default={})
    
    # Pending email change (requires verification before applying)
    pending_email = Column(String(255))
    pending_email_token = Column(String(100))
    pending_email_expires_at = Column(TIMESTAMP(timezone=True))
    
    # Flag for personnel manually added (e.g., during roll call) needing admin review
    needs_profile_review = Column(Boolean, default=False)
    
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    
    rank = relationship("Rank")
    approver = relationship("Personnel", remote_side=[id], foreign_keys=[approved_by])
    
    @property
    def display_name(self):
        return f"{self.last_name}, {self.first_name}"
    
    @property
    def is_registered(self):
        return self.password_hash is not None
    
    @property
    def is_approved(self):
        return self.approved_at is not None


class Apparatus(Base):
    """Fire apparatus (engines, trucks, rescues, ambulances)"""
    __tablename__ = "apparatus"
    
    id = Column(Integer, primary_key=True)
    unit_designator = Column(String(20), unique=True, nullable=False)  # ENG481, RES48
    name = Column(String(50), nullable=False)                          # Engine 48-1
    apparatus_type = Column(String(30))                                # Engine, Rescue (display)
    is_virtual = Column(Boolean, default=False)                        # DEPRECATED - use unit_category
    has_driver = Column(Boolean, default=True)
    has_officer = Column(Boolean, default=True)
    ff_slots = Column(Integer, default=4)
    display_order = Column(Integer, default=100)
    active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    
    # NERIS: Unit type from type_unit lookup
    # Values: "ENGINE", "LADDER", "QUINT", "RESCUE", "AMBULANCE_ALS", "AMBULANCE_BLS", etc.
    neris_unit_type = Column(Text)
    
    # Unit Management (added in migration 002)
    # Categories:
    #   APPARATUS - Physical CAD units (engines, trucks, chief vehicles) with configurable crew slots
    #   DIRECT    - Virtual unit for personnel going directly to scene (POV)
    #   STATION   - Virtual unit for personnel who reported to station (not on scene)
    unit_category = Column(String(20), nullable=False, default='APPARATUS')
    
    # Whether this unit's times count for response metrics (first enroute, first on scene)
    # Configurable for APPARATUS, always false for DIRECT/STATION
    # Chief vehicles (CHF48, etc.) are APPARATUS with 0 crew slots and this set to false
    counts_for_response_times = Column(Boolean, default=True)
    
    # CAD identifier for matching incoming CAD data (usually same as unit_designator)
    cad_unit_id = Column(String(20))
    
    # Alternate CAD identifiers (for inconsistent dispatch center naming)
    # Example: QRS48 is primary, but dispatch sometimes uses 48QRS
    cad_unit_aliases = Column(ARRAY(Text), default=[])
    
    @property
    def is_physical_unit(self):
        """Physical vehicles that have CAD times and export to NERIS"""
        return self.unit_category == 'APPARATUS'
    
    @property
    def is_on_scene(self):
        """Units whose personnel are physically at the incident"""
        return self.unit_category in ('APPARATUS', 'DIRECT')
    
    @property
    def exports_to_neris(self):
        """Units that should be included in NERIS apparatus module"""
        return self.unit_category == 'APPARATUS'


class Municipality(Base):
    """Municipalities (townships, boroughs) served"""
    __tablename__ = "municipalities"
    
    id = Column(Integer, primary_key=True)
    code = Column(String(10), unique=True, nullable=False)  # CAD code: WALLAC
    name = Column(String(100), nullable=False)               # Wallace
    display_name = Column(String(100))                       # Wallace Township
    subdivision_type = Column(String(50), default='Township')
    county = Column(String(50), default='Chester')
    state = Column(String(2), default='PA')
    auto_created = Column(Boolean, default=False)            # Created from CAD, needs review
    active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


class DetailType(Base):
    """
    Configurable event types for DETAIL category records.
    Used for attendance tracking: meetings, worknights, training, drills, etc.
    """
    __tablename__ = "detail_types"
    
    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False)   # MEETING, WORKNIGHT, TRAINING, DRILL, OTHER
    display_name = Column(String(100), nullable=False)       # Meeting, Worknight, Training, Drill, Other
    display_order = Column(Integer, default=100)             # For sorting in dropdowns
    active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


# =============================================================================
# NERIS CODE LOOKUP TABLE
# =============================================================================

class NerisCode(Base):
    """
    Unified NERIS code lookup table.
    
    Stores all NERIS code types with their hierarchical structure:
    - type_incident: Incident classifications
    - type_location_use: Property/location use types
    - type_action_tactic: Actions taken by crews
    - type_unit: Apparatus types
    - type_aid: Mutual aid types
    - etc.
    
    Values are stored as hierarchical TEXT exactly as NERIS expects:
    "FIRE: STRUCTURE_FIRE: RESIDENTIAL_SINGLE"
    """
    __tablename__ = "neris_codes"
    
    id = Column(Integer, primary_key=True)
    category = Column(Text, nullable=False, index=True)  # type_incident, type_location_use
    value = Column(Text, nullable=False)                 # Full hierarchical value
    active = Column(Boolean, default=True)
    
    # Hierarchical components (for filtering/grouping)
    value_1 = Column(Text)          # FIRE
    value_2 = Column(Text)          # STRUCTURE_FIRE
    value_3 = Column(Text)          # RESIDENTIAL_SINGLE
    
    # Human-readable descriptions
    description = Column(Text)      # For flat (non-hierarchical) codes
    description_1 = Column(Text)    # Fire
    description_2 = Column(Text)    # Structure Fire
    description_3 = Column(Text)    # Residential Single Family
    
    definition = Column(Text)       # NERIS definition/explanation
    display_order = Column(Integer)
    source = Column(Text)           # Import source tracking
    imported_at = Column(TIMESTAMP(timezone=True))
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


# =============================================================================
# INCIDENT - MAIN TABLE
# =============================================================================

class Incident(Base):
    """
    Fire/EMS incident record.
    
    Schema is designed for 100% NERIS compatibility:
    - All NERIS fields use exact expected data types
    - TEXT arrays for hierarchical codes (not integers)
    - JSONB for complex nested modules
    - No conversion needed at export time
    """
    __tablename__ = "incidents"
    
    id = Column(Integer, primary_key=True)
    
    # =========================================================================
    # INTERNAL TRACKING
    # =========================================================================
    internal_incident_number = Column(String(10), unique=True, nullable=False)  # F250001, E250001, D250001
    year_prefix = Column(Integer, nullable=False)                               # 2025
    call_category = Column(String(10), nullable=False, default='FIRE')          # FIRE, EMS, or DETAIL
    status = Column(String(20), nullable=False, default='OPEN')                 # OPEN, CLOSED, SUBMITTED
    
    # Sub-type for DETAIL category (meetings, worknights, training, drills)
    # NULL for FIRE/EMS incidents and operational DETAIL records
    detail_type = Column(String(50))                                            # MEETING, WORKNIGHT, TRAINING, DRILL, OTHER
    
    # =========================================================================
    # NERIS IDENTIFIERS
    # =========================================================================
    # Globally unique NERIS incident ID
    # Format: {fd_neris_id}:{epoch_milliseconds}
    # Example: "FD24027000:1714762619000"
    # Generated automatically when fd_neris_id is configured
    neris_id = Column(Text, unique=True, index=True)
    
    # =========================================================================
    # CAD DATA (Chester County FDCMS ADI)
    # Raw data from dispatch - preserved for reference, not sent to NERIS
    # =========================================================================
    cad_event_number = Column(String(20), nullable=False, index=True)  # F25066673
    cad_event_id = Column(String(20))                                   # Internal CAD ID
    cad_event_type = Column(String(100))                                # "FIRE", "MEDICAL", "ACCIDENT"
    cad_event_subtype = Column(String(100))                             # "CHIMNEY", "HEART PROBLEMS - ALS"
    cad_raw_dispatch = Column(Text)                                     # Raw HTML
    cad_raw_updates = Column(ARRAY(Text))
    cad_raw_clear = Column(Text)
    cad_dispatch_received_at = Column(TIMESTAMP(timezone=True))
    cad_clear_received_at = Column(TIMESTAMP(timezone=True))
    cad_last_updated_at = Column(TIMESTAMP(timezone=True))
    cad_reopen_count = Column(Integer, default=0)
    
    # CAD responding units - raw from CAD before NERIS mapping
    # Structure: [{"unit_id": "ENG481", "time_dispatched": "...", "is_mutual_aid": false}]
    cad_units = Column(JSONB, default=[])
    
    # Parsed CAD event comments with detected tactical timestamps
    # Structure: {comments: [], detected_timestamps: [], unit_crew_counts: [], parsed_at, parser_version}
    cad_event_comments = Column(JSONB, default={})
    
    # =========================================================================
    # LOCATION - Display Fields
    # =========================================================================
    address = Column(String(200))              # 123 Main St (display)
    location_name = Column(String(200))         # Business/place name (COLONIAL WOODS CARE CENTER)
    municipality_id = Column(Integer, ForeignKey("municipalities.id"))
    municipality_code = Column(String(10))     # CAD code: WALLAC
    cross_streets = Column(String(200))        # Oak Ave / Elm St
    esz_box = Column(String(20))               # Emergency Service Zone
    
    # =========================================================================
    # LOCATION - NERIS Format (mod_civic_location)
    # Parsed address components for NERIS submission
    # =========================================================================
    neris_location = Column(JSONB)
    # Structure:
    # {
    #   "an_number": 123,
    #   "sn_street_name": "Main",
    #   "sn_post_type": "St",
    #   "csop_incorporated_muni": "Wallace Township",
    #   "csop_county": "Chester",
    #   "csop_state": "PA",
    #   "csop_postal_code": "19301"
    # }
    
    # GPS coordinates for NERIS incident_point
    latitude = Column(String(20))
    longitude = Column(String(20))
    
    # =========================================================================
    # TIMES - Core (all TIMESTAMP WITH TIME ZONE, stored as UTC)
    # =========================================================================
    incident_date = Column(Date)                            # Date of incident (immutable)
    time_dispatched = Column(TIMESTAMP(timezone=True))      # â†’ dispatch_time_call_create
    time_first_enroute = Column(TIMESTAMP(timezone=True))   # First unit enroute
    time_first_on_scene = Column(TIMESTAMP(timezone=True))  # First unit on scene
    time_last_cleared = Column(TIMESTAMP(timezone=True))    # Last unit cleared
    time_in_service = Column(TIMESTAMP(timezone=True))      # Back in service
    
    # =========================================================================
    # TIMES - Scheduled Events (meetings, training, drills, etc.)
    # Separate from CAD incident times for clear reporting distinction
    # =========================================================================
    time_event_start = Column(TIMESTAMP(timezone=True))     # Start time for scheduled events
    time_event_end = Column(TIMESTAMP(timezone=True))       # End time for scheduled events
    
    # =========================================================================
    # TIMES - NERIS Tactic Timestamps (mod_tactic_timestamps)
    # Required for fire incidents, optional for others
    # =========================================================================
    time_command_established = Column(TIMESTAMP(timezone=True))
    time_sizeup_completed = Column(TIMESTAMP(timezone=True))
    time_primary_search_begin = Column(TIMESTAMP(timezone=True))
    time_primary_search_complete = Column(TIMESTAMP(timezone=True))
    time_water_on_fire = Column(TIMESTAMP(timezone=True))
    time_fire_under_control = Column(TIMESTAMP(timezone=True))
    time_fire_knocked_down = Column(TIMESTAMP(timezone=True))
    time_suppression_complete = Column(TIMESTAMP(timezone=True))
    time_extrication_complete = Column(TIMESTAMP(timezone=True))  # Rescue incidents
    
    # =========================================================================
    # ADDITIONAL NERIS TACTIC TIMESTAMPS
    # Added in migration 011 for complete NERIS mod_tactic_timestamps coverage
    # =========================================================================
    
    # Search Operations
    time_secondary_search_begin = Column(TIMESTAMP(timezone=True))
    time_secondary_search_complete = Column(TIMESTAMP(timezone=True))
    
    # Ventilation
    time_ventilation_start = Column(TIMESTAMP(timezone=True))
    time_ventilation_complete = Column(TIMESTAMP(timezone=True))
    
    # Overhaul
    time_overhaul_start = Column(TIMESTAMP(timezone=True))
    time_overhaul_complete = Column(TIMESTAMP(timezone=True))
    
    # Safety/RIT
    time_rit_activated = Column(TIMESTAMP(timezone=True))
    time_mayday_declared = Column(TIMESTAMP(timezone=True))
    time_mayday_cleared = Column(TIMESTAMP(timezone=True))
    
    # Rescue/Extrication
    time_extrication_start = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # NERIS EMS TACTIC TIMESTAMPS
    # For medical incident reporting
    # =========================================================================
    time_patient_contact = Column(TIMESTAMP(timezone=True))
    time_patient_assessment_complete = Column(TIMESTAMP(timezone=True))
    time_cpr_started = Column(TIMESTAMP(timezone=True))
    time_aed_applied = Column(TIMESTAMP(timezone=True))
    time_aed_shock_delivered = Column(TIMESTAMP(timezone=True))
    time_rosc_achieved = Column(TIMESTAMP(timezone=True))
    time_airway_secured = Column(TIMESTAMP(timezone=True))
    time_iv_access = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # OPERATIONAL TIMESTAMPS (Chester County / Local)
    # Not direct NERIS fields, but useful for local operations
    # =========================================================================
    time_par_started = Column(TIMESTAMP(timezone=True))
    time_par_complete = Column(TIMESTAMP(timezone=True))
    time_evac_ordered = Column(TIMESTAMP(timezone=True))
    time_water_supply_established = Column(TIMESTAMP(timezone=True))
    time_all_clear = Column(TIMESTAMP(timezone=True))
    time_loss_stop = Column(TIMESTAMP(timezone=True))
    time_utilities_secured = Column(TIMESTAMP(timezone=True))
    time_rehab_established = Column(TIMESTAMP(timezone=True))
    time_investigation_requested = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # HAZMAT TIMESTAMPS (NERIS)
    # =========================================================================
    time_hazmat_identified = Column(TIMESTAMP(timezone=True))
    time_hazmat_contained = Column(TIMESTAMP(timezone=True))
    time_decon_started = Column(TIMESTAMP(timezone=True))
    time_decon_complete = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # TECHNICAL RESCUE TIMESTAMPS (NERIS)
    # =========================================================================
    time_victim_located = Column(TIMESTAMP(timezone=True))
    time_victim_accessed = Column(TIMESTAMP(timezone=True))
    time_victim_freed = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # WILDLAND FIRE TIMESTAMPS (NERIS)
    # =========================================================================
    time_wildland_contained = Column(TIMESTAMP(timezone=True))
    time_wildland_controlled = Column(TIMESTAMP(timezone=True))
    time_wildland_mopup_complete = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # CALLER INFORMATION
    # =========================================================================
    caller_name = Column(String(100))
    caller_phone = Column(String(20))
    caller_source = Column(String(50))  # ANI/ALI, 911, Walk-in
    
    # =========================================================================
    # WEATHER (auto-fetched from Open-Meteo)
    # =========================================================================
    weather_conditions = Column(String(200))    # Display: "Clear, 45Â°F"
    weather_fetched_at = Column(TIMESTAMP(timezone=True))
    weather_api_data = Column(JSONB)            # Full API response
    
    # =========================================================================
    # MANUAL ENTRY / NARRATIVE FIELDS
    # =========================================================================
    companies_called = Column(Text)             # Mutual aid narrative
    situation_found = Column(Text)              # On-arrival conditions
    extent_of_damage = Column(Text)
    services_provided = Column(Text)
    narrative = Column(Text)                    # â†’ incident_narrative_outcome
    equipment_used = Column(Text)
    problems_issues = Column(Text)              # â†’ incident_narrative_impedance
    
    # =========================================================================
    # NERIS CLASSIFICATION - TEXT CODES (not integers!)
    # Store exact values that NERIS API expects
    # =========================================================================
    
    # Incident type(s) - hierarchical TEXT array
    # Example: ["FIRE: STRUCTURE_FIRE: RESIDENTIAL_SINGLE"]
    # Can have multiple types (multi-nature calls)
    neris_incident_type_codes = Column(ARRAY(Text))
    
    # Primary incident type flag (parallel array to above)
    # Example: [true, false] - first type is primary
    neris_incident_type_primary = Column(ARRAY(Boolean))
    
    # =========================================================================
    # NERIS LOCATION USE - Full Module (mod_location_use)
    # =========================================================================
    neris_location_use = Column(JSONB)
    # Structure:
    # {
    #   "use_type": "RESIDENTIAL",           # Required - from type_location_use
    #   "use_subtype": "SINGLE_FAMILY",      # Required
    #   "use_status": true,                  # Required - was building in use
    #   "use_intended": true,                # Required - being used as intended
    #   "use_vacancy": "OCCUPIED",           # Required - OCCUPIED, VACANT, UNKNOWN
    #   "use_secondary": false,              # Optional
    #   "use_type_secondary": null,          # Required if use_secondary=true
    #   "use_subtype_secondary": null        # Required if use_secondary=true
    # }
    
    # =========================================================================
    # NERIS ACTIONS TAKEN - TEXT array
    # =========================================================================
    # Example: ["EXTINGUISHMENT: FIRE_CONTROL", "SEARCH: PRIMARY_SEARCH"]
    neris_action_codes = Column(ARRAY(Text))
    
    # If no action taken, reason code
    # Example: "CANCELLED_ENROUTE"
    neris_noaction_code = Column(Text)
    
    # =========================================================================
    # NERIS MUTUAL AID
    # =========================================================================
    neris_aid_direction = Column(Text)       # "GIVEN", "RECEIVED", "NONE"
    neris_aid_type = Column(Text)            # "AUTOMATIC", "MUTUAL", "OTHER"
    neris_aid_departments = Column(ARRAY(Text))  # Department names
    
    # =========================================================================
    # NERIS ADDITIONAL DATA
    # For fields not yet in dedicated columns
    # =========================================================================
    neris_additional_data = Column(JSONB)
    
    # People present at incident
    neris_people_present = Column(Boolean)   # Were people in the structure
    
    # Displaced (required) - number displaced from residence
    neris_displaced_number = Column(Integer, default=0)
    
    # Risk reduction module (required) - smoke/fire alarms, sprinklers
    neris_risk_reduction = Column(JSONB)
    
    # Rescues/casualties (required - can be empty arrays)
    neris_rescue_ff = Column(JSONB)          # Firefighter injuries/rescues
    neris_rescue_nonff = Column(JSONB)       # Civilian injuries/rescues
    neris_rescue_animal = Column(Integer)    # Animal rescue count
    
    # Narrative fields (recommended)
    neris_narrative_impedance = Column(Text)  # Obstacles that impacted response
    neris_narrative_outcome = Column(Text)    # Final disposition
    
    # =========================================================================
    # NERIS CONDITIONAL MODULE: FIRE
    # Shown when incident type starts with FIRE:
    # =========================================================================
    neris_fire_investigation_need = Column(Text)  # YES/NO/NOT_EVALUATED/etc
    neris_fire_investigation_type = Column(JSONB, default=[])  # Types of investigation
    neris_fire_arrival_conditions = Column(Text)  # Structure fire arrival conditions
    neris_fire_structure_damage = Column(Text)    # NO_DAMAGE/MINOR/MODERATE/MAJOR
    neris_fire_structure_floor = Column(Integer)  # Floor of origin
    neris_fire_structure_room = Column(Text)      # Room of origin code
    neris_fire_structure_cause = Column(Text)     # Structure fire cause
    neris_fire_outside_cause = Column(Text)       # Outside fire cause
    
    # =========================================================================
    # NERIS CONDITIONAL MODULE: MEDICAL
    # Shown when incident type starts with MEDICAL:
    # =========================================================================
    neris_medical_patient_care = Column(Text)     # Patient evaluation/care outcome
    
    # =========================================================================
    # NERIS CONDITIONAL MODULE: HAZMAT
    # Shown when incident type starts with HAZSIT:
    # =========================================================================
    neris_hazmat_disposition = Column(Text)       # Final disposition
    neris_hazmat_evacuated = Column(Integer, default=0)  # Number evacuated
    neris_hazmat_chemicals = Column(JSONB, default=[])   # [{dot_class, name, release_occurred}]
    
    # =========================================================================
    # NERIS MODULE: EXPOSURES
    # Adjacent/other properties affected by incident
    # =========================================================================
    neris_exposures = Column(JSONB, default=[])
    # Structure: [{
    #   "exposure_type": "...",    # type_exposure_loc
    #   "exposure_item": "...",    # type_exposure_item
    #   "address": "...",
    #   "location_use": "...",     # type_location_use
    #   "damage": "...",
    #   "displaced": 0
    # }]
    
    # =========================================================================
    # NERIS MODULE: EMERGING HAZARDS
    # EV/batteries, solar PV, CSST gas incidents
    # =========================================================================
    neris_emerging_hazard = Column(JSONB)
    # Structure: {
    #   "ev_battery": { "present": bool, "type": "...", "crash": bool, ... },
    #   "solar_pv": { "present": bool, "energized": bool, "ignition": "..." },
    #   "csst": { "present": bool, "damage": bool }
    # }
    
    # =========================================================================
    # NERIS MODULE: RISK REDUCTION DETAILS
    # Conditional detail fields based on presence selections
    # =========================================================================
    
    # Smoke Alarm Details (shown when smoke_alarm_presence != NONE/UNKNOWN)
    neris_rr_smoke_alarm_type = Column(JSONB, default=[])        # type_alarm_smoke (multi)
    neris_rr_smoke_alarm_working = Column(Boolean)               # Was it working?
    neris_rr_smoke_alarm_operation = Column(Text)                # type_alarm_operation
    neris_rr_smoke_alarm_failure = Column(Text)                  # type_alarm_failure
    neris_rr_smoke_alarm_action = Column(Text)                   # Occupant action taken
    
    # Fire Alarm Details (shown when fire_alarm_presence != NONE/UNKNOWN)
    neris_rr_fire_alarm_type = Column(JSONB, default=[])         # type_alarm_fire (multi)
    neris_rr_fire_alarm_operation = Column(Text)                 # type_alarm_operation
    
    # Other Alarm Details
    neris_rr_other_alarm = Column(Text)                          # type_rr_presence
    neris_rr_other_alarm_type = Column(JSONB, default=[])        # type_alarm_other (multi)
    
    # Sprinkler/Suppression Details (shown when fire_suppression_presence != NONE/UNKNOWN)
    neris_rr_sprinkler_type = Column(JSONB, default=[])          # type_suppress_fire (multi)
    neris_rr_sprinkler_coverage = Column(Text)                   # type_full_partial
    neris_rr_sprinkler_operation = Column(Text)                  # type_suppress_operation
    neris_rr_sprinkler_heads_activated = Column(Integer)         # Number of heads
    neris_rr_sprinkler_failure = Column(Text)                    # type_alarm_failure
    
    # Cooking Suppression Details (shown for confined cooking fires)
    neris_rr_cooking_suppression = Column(Text)                  # type_rr_presence
    neris_rr_cooking_suppression_type = Column(JSONB, default=[])# type_suppress_cooking (multi)
    
    # =========================================================================
    # NERIS SUBMISSION TRACKING
    # =========================================================================
    neris_submitted_at = Column(TIMESTAMP(timezone=True))
    neris_submission_id = Column(String(50))     # ID from NERIS API response
    neris_validation_errors = Column(JSONB)      # Any validation issues
    neris_last_validated_at = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # CHIEFS REPORT FIELDS
    # Simple fields for traditional monthly reporting (separate from NERIS)
    # =========================================================================
    property_value_at_risk = Column(Integer, default=0)    # In cents (divide by 100)
    fire_damages_estimate = Column(Integer, default=0)     # In cents (divide by 100)
    ff_injuries_count = Column(Integer, default=0)         # Firefighter injuries
    civilian_injuries_count = Column(Integer, default=0)   # Civilian injuries
    
    # =========================================================================
    # REVIEW / AUDIT
    # =========================================================================
    officer_in_charge = Column(Integer, ForeignKey("personnel.id"))
    completed_by = Column(Integer, ForeignKey("personnel.id"))
    review_status = Column(String(20), default='pending')  # pending, reviewed, needs_review
    reviewed_by = Column(Integer, ForeignKey("personnel.id"))
    reviewed_at = Column(TIMESTAMP(timezone=True))
    out_of_sequence = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    deleted_at = Column(TIMESTAMP(timezone=True))  # Soft delete
    
    # =========================================================================
    # RELATIONSHIPS
    # =========================================================================
    municipality = relationship("Municipality")
    units = relationship("IncidentUnit", back_populates="incident", cascade="all, delete-orphan")
    personnel_assignments = relationship("IncidentPersonnel", back_populates="incident", cascade="all, delete-orphan")


# =============================================================================
# INCIDENT UNIT RESPONSE
# =============================================================================

class IncidentUnit(Base):
    """
    Unit (apparatus) response to an incident.
    Maps directly to NERIS mod_unit_response.
    """
    __tablename__ = "incident_units"
    
    id = Column(Integer, primary_key=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"))
    apparatus_id = Column(Integer, ForeignKey("apparatus.id"))
    cad_unit_id = Column(String(20))  # From CAD: "ENG481"
    
    # NERIS unit identification
    # unit_id_linked: links to registered apparatus in NERIS
    # unit_id_reported: the ID as reported (may differ)
    neris_unit_id_linked = Column(Text)
    neris_unit_id_reported = Column(Text)
    
    # Staffing - NERIS: unit_staffing_reported
    crew_count = Column(Integer)
    
    # Response mode - NERIS: unit_response_mode
    # Values: "EMERGENCY", "NON_EMERGENCY"
    response_mode = Column(Text)
    
    # =========================================================================
    # TIMES (all TIMESTAMP WITH TIME ZONE)
    # Field names match NERIS mod_unit_response
    # =========================================================================
    time_dispatch = Column(TIMESTAMP(timezone=True))           # NERIS: time_dispatch
    time_enroute_to_scene = Column(TIMESTAMP(timezone=True))   # NERIS: time_enroute_to_scene
    time_on_scene = Column(TIMESTAMP(timezone=True))           # NERIS: time_on_scene
    time_canceled_enroute = Column(TIMESTAMP(timezone=True))   # NERIS: time_canceled_enroute
    time_staging = Column(TIMESTAMP(timezone=True))            # NERIS: time_staging
    time_at_patient = Column(TIMESTAMP(timezone=True))         # NERIS: time_at_patient (EMS)
    time_enroute_hospital = Column(TIMESTAMP(timezone=True))   # NERIS: time_enroute_hospital
    time_arrived_hospital = Column(TIMESTAMP(timezone=True))   # NERIS: time_arrived_hospital
    time_hospital_clear = Column(TIMESTAMP(timezone=True))     # NERIS: time_hospital_clear
    time_unit_clear = Column(TIMESTAMP(timezone=True))         # NERIS: time_unit_clear
    
    # Hospital destination (EMS)
    hospital_destination = Column(Text)
    
    # Transport mode - NERIS: unit_transport_mode
    transport_mode = Column(Text)  # "GROUND", "AIR", etc.
    
    # Status flags
    cancelled = Column(Boolean, default=False)
    is_mutual_aid = Column(Boolean, default=False)
    
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    
    # Relationships
    incident = relationship("Incident", back_populates="units")
    apparatus = relationship("Apparatus")
    personnel = relationship("IncidentPersonnel", back_populates="unit", cascade="all, delete-orphan")


# =============================================================================
# INCIDENT PERSONNEL
# =============================================================================

class IncidentPersonnel(Base):
    """
    Personnel assigned to an incident unit.
    Includes snapshot of personnel info at time of incident (immutable record).
    """
    __tablename__ = "incident_personnel"
    
    id = Column(Integer, primary_key=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"))
    incident_unit_id = Column(Integer, ForeignKey("incident_units.id", ondelete="CASCADE"))
    personnel_id = Column(Integer, ForeignKey("personnel.id"))
    
    # Snapshot (immutable - captures who they were at incident time)
    personnel_first_name = Column(String(50), nullable=False)
    personnel_last_name = Column(String(50), nullable=False)
    rank_id = Column(Integer, ForeignKey("ranks.id"))
    rank_name_snapshot = Column(String(50), nullable=False)
    
    # Role on this unit for this incident
    role = Column(String(20))     # DRIVER, OFFICER, FF, EMT
    slot_index = Column(Integer)  # Position in crew roster (0=driver, 1=officer, 2+=FF)
    
    # How this assignment was made
    assignment_source = Column(String(20), default='MANUAL')  # MANUAL, CAD, DASHBOARD
    
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    
    # Relationships
    incident = relationship("Incident", back_populates="personnel_assignments")
    unit = relationship("IncidentUnit", back_populates="personnel")
    rank = relationship("Rank")


# =============================================================================
# SETTINGS
# =============================================================================

class Setting(Base):
    """Runtime configuration stored in database"""
    __tablename__ = "settings"
    
    id = Column(Integer, primary_key=True)
    category = Column(String(50), nullable=False)
    key = Column(String(50), nullable=False)
    value = Column(Text)
    value_type = Column(String(20), default='string')  # string, number, boolean, json
    description = Column(Text)
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    
    __table_args__ = (
        # Unique constraint on category + key
        {'sqlite_autoincrement': True},
    )


# =============================================================================
# REVIEW TASKS
# =============================================================================

class ReviewTask(Base):
    """
    Shared notification/task queue for items requiring officer/admin attention.
    
    Task types:
    - personnel_reconciliation: Personnel assigned to unit not in CAD CLEAR
    - comcat_review: CAD comments need officer categorization review
    - neris_validation: Incident missing required NERIS fields (future)
    - out_of_sequence: Incident number doesn't match date order (future)
    """
    __tablename__ = "review_tasks"
    
    id = Column(Integer, primary_key=True)
    
    # What needs review
    task_type = Column(String(50), nullable=False)
    entity_type = Column(String(50), nullable=False)  # 'incident', 'personnel', etc.
    entity_id = Column(Integer, nullable=False)
    
    # Human-readable details
    title = Column(String(200), nullable=False)
    description = Column(Text)
    
    # Structured data for programmatic use (renamed from 'metadata' which is reserved)
    # Store any data needed for resolution or display
    # Example: {"unit": "ENG485", "personnel_ids": [1, 2, 3], "moved_to": "STATION"}
    task_metadata = Column(JSONB, default={})
    
    # Status tracking
    status = Column(String(20), nullable=False, default='pending')  # pending, resolved, dismissed
    priority = Column(String(20), nullable=False, default='normal')  # low, normal, high
    
    # Required action for resolution
    required_action = Column(JSONB)
    
    # Resolution tracking
    resolved_by = Column(Integer, ForeignKey("personnel.id"))
    resolved_at = Column(TIMESTAMP(timezone=True))
    resolution_notes = Column(Text)
    
    # Audit
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    created_by = Column(Integer, ForeignKey("personnel.id"))
    
    # Relationships
    resolver = relationship("Personnel", foreign_keys=[resolved_by])
    creator = relationship("Personnel", foreign_keys=[created_by])


# =============================================================================
# AUDIT LOG
# =============================================================================

class AuditLog(Base):
    """
    Audit trail for incident changes.
    Uses completed_by personnel field (honor system), not login.
    """
    __tablename__ = "audit_log"
    
    id = Column(Integer, primary_key=True)
    
    # Who (from completed_by personnel)
    personnel_id = Column(Integer, ForeignKey("personnel.id", ondelete="SET NULL"))
    personnel_name = Column(String(100))
    
    # What
    action = Column(String(50), nullable=False)  # CREATE, UPDATE, DELETE, CLOSE
    entity_type = Column(String(50))              # incident, personnel, apparatus
    entity_id = Column(Integer)
    entity_display = Column(String(255))          # "Incident 2025001"
    
    # Details
    summary = Column(Text)
    fields_changed = Column(JSONB)
    
    # Context
    ip_address = Column(String(45))
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    
    # Relationship
    personnel = relationship("Personnel")
