"""
SQLAlchemy models for NERIS Mutual Aid departments and units.

Tables:
    - NerisMutualAidDepartment: Departments this tenant works with
    - NerisMutualAidUnit: Apparatus per department (admin-configured)

These tables are independent from map_features (GIS fire stations).
They serve NERIS reporting and operational mutual aid tracking.
All tenants use these regardless of NERIS toggle — neris_entity_id is nullable.

Unit types reference neris_codes table (category = 'type_unit').
"""

from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.sql import func

from database import Base


class NerisMutualAidDepartment(Base):
    __tablename__ = "neris_mutual_aid_departments"

    id = Column(Integer, primary_key=True)
    neris_entity_id = Column(String(10), unique=True, nullable=True)
    name = Column(Text, nullable=False)
    station_number = Column(String(10))
    address = Column(Text)
    city = Column(Text)
    state = Column(String(2))
    zip_code = Column(String(10))
    department_type = Column(Text)
    import_source = Column(Text, default='manual')
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


class NerisMutualAidUnit(Base):
    __tablename__ = "neris_mutual_aid_units"

    id = Column(Integer, primary_key=True)
    department_id = Column(Integer, ForeignKey("neris_mutual_aid_departments.id", ondelete="CASCADE"), nullable=False)
    unit_designator = Column(String(20), nullable=False)
    neris_unit_type = Column(Text)
    cad_prefix = Column(String(20))
    neris_unit_id = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
