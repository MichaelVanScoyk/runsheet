"""
Analytics Models for CADReport
Add these to your existing models.py file
"""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Date, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, date
from database import Base


class TenantQueryUsage(Base):
    """Track daily API query usage per tenant for rate limiting"""
    __tablename__ = "tenant_query_usage"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String(100), nullable=False, index=True)
    usage_date = Column(Date, nullable=False, default=date.today)
    query_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class SavedQuery(Base):
    """Saved/cached queries for reuse without API calls"""
    __tablename__ = "saved_queries"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String(100), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    natural_language = Column(Text, nullable=False)
    generated_sql = Column(Text, nullable=False)
    parameters = Column(JSONB, default={})
    result_type = Column(String(50), default='table')  # table, chart, single_value
    chart_config = Column(JSONB)
    created_by = Column(Integer, ForeignKey('personnel.id'))
    is_shared = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)
    use_count = Column(Integer, default=0)
    last_used_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    creator = relationship("Personnel", foreign_keys=[created_by])


class QueryExecutionLog(Base):
    """Audit log for all query executions"""
    __tablename__ = "query_execution_log"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String(100), nullable=False, index=True)
    personnel_id = Column(Integer, ForeignKey('personnel.id'))
    query_type = Column(String(50), nullable=False)  # natural_language, saved, system
    natural_language = Column(Text)
    generated_sql = Column(Text)
    saved_query_id = Column(Integer, ForeignKey('saved_queries.id'))
    execution_time_ms = Column(Integer)
    row_count = Column(Integer)
    success = Column(Boolean, default=True)
    error_message = Column(Text)
    api_tokens_used = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    
    # Relationships
    personnel = relationship("Personnel", foreign_keys=[personnel_id])
    saved_query = relationship("SavedQuery", foreign_keys=[saved_query_id])


class DataQualityIssue(Base):
    """Track data quality issues and outliers"""
    __tablename__ = "data_quality_issues"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String(100), nullable=False, index=True)
    incident_id = Column(Integer, ForeignKey('incidents.id', ondelete='CASCADE'))
    issue_type = Column(String(100), nullable=False)
    severity = Column(String(20), default='warning')  # info, warning, error
    field_name = Column(String(100))
    current_value = Column(Text)
    expected_range = Column(Text)
    description = Column(Text, nullable=False)
    detected_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    resolved_at = Column(DateTime(timezone=True))
    resolved_by = Column(Integer, ForeignKey('personnel.id'))
    resolution_notes = Column(Text)
    auto_detected = Column(Boolean, default=True)
    
    # Relationships
    incident = relationship("Incident", foreign_keys=[incident_id])
    resolver = relationship("Personnel", foreign_keys=[resolved_by])


class AnalyticsCache(Base):
    """Cache for pre-computed analytics"""
    __tablename__ = "analytics_cache"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String(100), nullable=False, index=True)
    cache_key = Column(String(255), nullable=False)
    cache_data = Column(JSONB, nullable=False)
    computed_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    expires_at = Column(DateTime(timezone=True))
