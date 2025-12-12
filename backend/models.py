"""
SQLAlchemy models for RunSheet
"""

from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey, Date, ARRAY
from sqlalchemy.dialects.postgresql import TIMESTAMP, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class Rank(Base):
    __tablename__ = "ranks"
    
    id = Column(Integer, primary_key=True)
    rank_name = Column(String(50), nullable=False)
    abbreviation = Column(String(10))
    display_order = Column(Integer, default=100)
    active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


class Personnel(Base):
    __tablename__ = "personnel"
    
    id = Column(Integer, primary_key=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    rank_id = Column(Integer, ForeignKey("ranks.id"))
    active = Column(Boolean, default=True)
    dashboard_id = Column(Integer)  # Link to Dashboard if synced
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    
    rank = relationship("Rank")
    
    @property
    def display_name(self):
        return f"{self.last_name}, {self.first_name}"


class Apparatus(Base):
    __tablename__ = "apparatus"
    
    id = Column(Integer, primary_key=True)
    unit_designator = Column(String(20), unique=True, nullable=False)
    name = Column(String(50), nullable=False)
    apparatus_type = Column(String(30))
    is_virtual = Column(Boolean, default=False)
    has_driver = Column(Boolean, default=True)
    has_officer = Column(Boolean, default=True)
    ff_slots = Column(Integer, default=4)
    display_order = Column(Integer, default=100)
    active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


class Municipality(Base):
    __tablename__ = "municipalities"
    
    id = Column(Integer, primary_key=True)
    code = Column(String(10), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    county = Column(String(50), default='Chester')
    state = Column(String(2), default='PA')
    active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


class NerisIncidentType(Base):
    __tablename__ = "neris_incident_types"
    
    code = Column(Integer, primary_key=True)
    description = Column(String(200), nullable=False)
    category = Column(String(100))
    active = Column(Boolean, default=True)
    display_order = Column(Integer)


class NerisPropertyUse(Base):
    __tablename__ = "neris_property_uses"
    
    code = Column(Integer, primary_key=True)
    description = Column(String(200), nullable=False)
    category = Column(String(100))
    active = Column(Boolean, default=True)
    display_order = Column(Integer)


class NerisActionTaken(Base):
    __tablename__ = "neris_actions_taken"
    
    code = Column(Integer, primary_key=True)
    description = Column(String(200), nullable=False)
    category = Column(String(100))
    active = Column(Boolean, default=True)
    display_order = Column(Integer)


class IncidentNumberSequence(Base):
    __tablename__ = "incident_number_sequences"
    
    year = Column(Integer, primary_key=True)
    next_number = Column(Integer, nullable=False, default=1)
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


class Incident(Base):
    __tablename__ = "incidents"
    
    id = Column(Integer, primary_key=True)
    
    # Internal tracking
    internal_incident_number = Column(Integer, unique=True, nullable=False)
    year_prefix = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default='OPEN')
    
    # CAD Data
    cad_event_number = Column(String(20), nullable=False)
    cad_event_id = Column(String(20))
    cad_event_type = Column(String(100))
    cad_raw_dispatch = Column(Text)
    cad_raw_updates = Column(ARRAY(Text))
    cad_raw_clear = Column(Text)
    cad_dispatch_received_at = Column(TIMESTAMP(timezone=True))
    cad_clear_received_at = Column(TIMESTAMP(timezone=True))
    cad_last_updated_at = Column(TIMESTAMP(timezone=True))
    cad_reopen_count = Column(Integer, default=0)
    cad_units = Column(JSONB, default=[])
    
    # Location
    address = Column(String(200))
    municipality_id = Column(Integer, ForeignKey("municipalities.id"))
    municipality_code = Column(String(10))
    cross_streets = Column(String(200))
    esz_box = Column(String(20))
    
    # Times
    incident_date = Column(Date)
    time_dispatched = Column(TIMESTAMP(timezone=True))
    time_first_enroute = Column(TIMESTAMP(timezone=True))
    time_first_on_scene = Column(TIMESTAMP(timezone=True))
    time_fire_under_control = Column(TIMESTAMP(timezone=True))
    time_extrication_complete = Column(TIMESTAMP(timezone=True))
    time_last_cleared = Column(TIMESTAMP(timezone=True))
    time_in_service = Column(TIMESTAMP(timezone=True))
    
    # Caller
    caller_name = Column(String(100))
    caller_phone = Column(String(20))
    caller_source = Column(String(50))
    
    # Weather
    weather_conditions = Column(String(200))
    weather_fetched_at = Column(TIMESTAMP(timezone=True))
    weather_api_data = Column(JSONB)
    
    # Manual fields
    companies_called = Column(Text)
    situation_found = Column(Text)
    extent_of_damage = Column(Text)
    services_provided = Column(Text)
    narrative = Column(Text)
    equipment_used = Column(ARRAY(Text))
    problems_issues = Column(Text)
    
    # NERIS
    neris_incident_types = Column(ARRAY(Integer))
    neris_property_use = Column(Integer)
    neris_actions_taken = Column(ARRAY(Integer))
    neris_additional_data = Column(JSONB)
    neris_submitted_at = Column(TIMESTAMP(timezone=True))
    neris_submission_id = Column(String(50))
    neris_validation_errors = Column(JSONB)
    
    # Audit
    officer_in_charge = Column(Integer, ForeignKey("personnel.id"))
    completed_by = Column(Integer, ForeignKey("personnel.id"))
    out_of_sequence = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    deleted_at = Column(TIMESTAMP(timezone=True))
    
    # Relationships
    municipality = relationship("Municipality")
    units = relationship("IncidentUnit", back_populates="incident", cascade="all, delete-orphan")
    personnel_assignments = relationship("IncidentPersonnel", back_populates="incident", cascade="all, delete-orphan")


class IncidentUnit(Base):
    __tablename__ = "incident_units"
    
    id = Column(Integer, primary_key=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"))
    apparatus_id = Column(Integer, ForeignKey("apparatus.id"))
    cad_unit_id = Column(String(20))
    
    # Times
    time_dispatched = Column(TIMESTAMP(timezone=True))
    time_enroute = Column(TIMESTAMP(timezone=True))
    time_on_scene = Column(TIMESTAMP(timezone=True))
    time_available = Column(TIMESTAMP(timezone=True))
    time_cleared = Column(TIMESTAMP(timezone=True))
    
    # Status
    cancelled = Column(Boolean, default=False)
    crew_count = Column(Integer)
    
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    
    # Relationships
    incident = relationship("Incident", back_populates="units")
    apparatus = relationship("Apparatus")
    personnel = relationship("IncidentPersonnel", back_populates="unit", cascade="all, delete-orphan")


class IncidentPersonnel(Base):
    __tablename__ = "incident_personnel"
    
    id = Column(Integer, primary_key=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"))
    incident_unit_id = Column(Integer, ForeignKey("incident_units.id", ondelete="CASCADE"))
    personnel_id = Column(Integer, ForeignKey("personnel.id"))
    
    # Snapshot
    personnel_first_name = Column(String(50), nullable=False)
    personnel_last_name = Column(String(50), nullable=False)
    rank_id = Column(Integer, ForeignKey("ranks.id"))
    rank_name_snapshot = Column(String(50), nullable=False)
    
    # Role
    role = Column(String(20))  # DRIVER, OFFICER, FF
    slot_index = Column(Integer)
    
    # Source
    assignment_source = Column(String(20), default='MANUAL')
    
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    
    # Relationships
    incident = relationship("Incident", back_populates="personnel_assignments")
    unit = relationship("IncidentUnit", back_populates="personnel")
    rank = relationship("Rank")