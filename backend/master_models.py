"""
Master Database Models for CADReport Multi-Tenant System

These models live in cadreport_master database, separate from tenant data.
"""

from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from master_database import MasterBase


class Tenant(MasterBase):
    """
    Registered fire department (tenant).
    
    Each tenant has:
    - Their own subdomain (glenmoorefc.cadreport.com)
    - Their own database (runsheet_glenmoorefc)
    - Shared login credentials for the department
    """
    __tablename__ = "tenants"
    
    id = Column(Integer, primary_key=True)
    
    # Identification
    slug = Column(String(50), unique=True, nullable=False)  # Subdomain
    name = Column(String(200), nullable=False)              # Display name
    
    # Authentication (tenant-level, not individual users)
    password_hash = Column(String(255), nullable=False)     # bcrypt
    
    # Database
    database_name = Column(String(100), nullable=False)     # Their data DB
    
    # NERIS
    neris_fd_id = Column(String(50))
    neris_state = Column(String(2), default='PA')
    neris_county = Column(String(50), default='Chester')
    
    # CAD
    cad_connection_type = Column(String(20))
    cad_connection_config = Column(JSONB, default={})
    cad_port = Column(Integer)
    
    # Settings
    timezone = Column(String(50), default='America/New_York')
    settings = Column(JSONB, default={})
    
    # Status
    status = Column(String(20), default='active')  # active, suspended, trial
    trial_ends_at = Column(DateTime(timezone=True))
    
    # Contact
    admin_email = Column(String(255))
    admin_name = Column(String(100))
    
    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True))


class TenantRequest(MasterBase):
    """
    Pending signup request from a fire department.
    
    Flow:
    1. Department fills out form on landing page
    2. Request created with status='pending'
    3. Admin reviews and approves/rejects
    4. If approved, Tenant record created, database provisioned
    """
    __tablename__ = "tenant_requests"
    
    id = Column(Integer, primary_key=True)
    
    # Requested details
    requested_slug = Column(String(50), nullable=False)
    department_name = Column(String(200), nullable=False)
    
    # Contact
    contact_name = Column(String(100), nullable=False)
    contact_email = Column(String(255), nullable=False)
    contact_phone = Column(String(20))
    
    # Location
    county = Column(String(50))
    state = Column(String(2), default='PA')
    
    # Notes
    notes = Column(Text)
    
    # Status
    status = Column(String(20), default='pending')  # pending, approved, rejected
    reviewed_by = Column(String(100))
    reviewed_at = Column(DateTime(timezone=True))
    rejection_reason = Column(Text)
    
    # If approved
    tenant_id = Column(Integer, ForeignKey('tenants.id'))
    
    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TenantSession(MasterBase):
    """
    Active tenant login session.
    
    When a department logs in, we create a session and store the token in a cookie.
    This allows "remember me" functionality - stay logged in until explicit logout.
    """
    __tablename__ = "tenant_sessions"
    
    id = Column(Integer, primary_key=True)
    
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False)
    session_token = Column(String(255), unique=True, nullable=False)
    
    # Session info
    ip_address = Column(String(45))
    user_agent = Column(Text)
    
    # Expiration (null = never, until logout)
    expires_at = Column(DateTime(timezone=True))
    
    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), server_default=func.now())
