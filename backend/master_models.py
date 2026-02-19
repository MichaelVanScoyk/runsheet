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
    cad_format = Column(String(50), default='chester_county')
    
    # Settings
    timezone = Column(String(50), default='America/New_York')
    settings = Column(JSONB, default={})
    
    # Status
    status = Column(String(20), default='active')  # active, suspended, pending, rejected
    trial_ends_at = Column(DateTime(timezone=True))
    
    # Contact
    contact_name = Column(String(100))
    contact_email = Column(String(255))
    contact_phone = Column(String(20))
    admin_email = Column(String(255))
    admin_name = Column(String(100))
    
    # Location
    county = Column(String(100))
    state = Column(String(2), default='PA')
    
    # Notes
    notes = Column(Text)
    
    # Approval tracking
    approved_at = Column(DateTime(timezone=True))
    approved_by = Column(Integer)
    
    # Suspension tracking
    suspended_at = Column(DateTime(timezone=True))
    suspended_by = Column(Integer)
    suspended_reason = Column(Text)
    
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
    user_id = Column(Integer)  # Optional: specific user within tenant
    
    # Session info
    ip_address = Column(String(45))
    user_agent = Column(Text)
    
    # Expiration (null = never, until logout)
    expires_at = Column(DateTime(timezone=True))
    
    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), server_default=func.now())


class RefreshToken(MasterBase):
    """
    JWT refresh token storage (Phase C).
    
    Access tokens (JWT) are short-lived (15 min) and validated by signature only.
    Refresh tokens are long-lived (30 days) and validated against this table.
    
    One DB hit per 15-minute refresh cycle instead of one per request.
    
    The tenant_sessions table stays in parallel during transition.
    """
    __tablename__ = "refresh_tokens"
    
    id = Column(Integer, primary_key=True)
    
    # Who this token belongs to
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer)               # Null for tenant-level auth
    auth_level = Column(String(20), nullable=False, default='tenant')  # "tenant" or "user"
    
    # The token itself (opaque, not JWT)
    token = Column(String(255), unique=True, nullable=False, index=True)
    
    # Lifecycle
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True))  # Null = active, set = revoked
    
    # Context (for audit / device management)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    device_info = Column(String(200))       # "Chrome - Windows", "StationBell Bay 1", etc.
    
    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), server_default=func.now())


class MasterAdmin(MasterBase):
    """
    System administrator account for CADReport platform.
    
    These are CADReport staff who manage tenants, not fire department users.
    """
    __tablename__ = "master_admins"
    
    id = Column(Integer, primary_key=True)
    email = Column(String(200), unique=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    name = Column(String(100))
    role = Column(String(20), default='ADMIN')  # SUPER_ADMIN, ADMIN, SUPPORT, READONLY
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True))


class MasterSession(MasterBase):
    """
    Active master admin login session.
    """
    __tablename__ = "master_sessions"
    
    id = Column(Integer, primary_key=True)
    admin_id = Column(Integer, ForeignKey('master_admins.id', ondelete='CASCADE'), nullable=False)
    session_token = Column(String(100), unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    ip_address = Column(String(45))


class MasterAuditLog(MasterBase):
    """
    Audit log for master admin actions.
    """
    __tablename__ = "master_audit_log"
    
    id = Column(Integer, primary_key=True)
    admin_id = Column(Integer, ForeignKey('master_admins.id'))
    admin_email = Column(String(200))
    action = Column(String(50), nullable=False)
    target_type = Column(String(50))
    target_id = Column(Integer)
    target_name = Column(String(200))
    details = Column(JSONB)
    ip_address = Column(String(45))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SystemConfig(MasterBase):
    """
    System-wide configuration settings.
    """
    __tablename__ = "system_config"
    
    key = Column(String(100), primary_key=True)
    value = Column(JSONB)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
