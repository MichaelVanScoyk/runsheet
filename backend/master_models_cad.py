"""
CAD Infrastructure Models for CADReport Master Database

These models manage the CAD data reception infrastructure across the platform.
They live in cadreport_master alongside Tenant, MasterAdmin, etc.

Architecture Overview:
    Server Nodes → CAD Listeners → Forwarding Destinations
                   ↑
            Parser Templates

    - A ServerNode is a physical/virtual host that runs listener processes
    - A CADListener is a per-tenant inbound connection (TCP, Email, Webhook, etc.)
    - A ParserTemplate defines how to parse a specific CAD vendor's data format
    - A ForwardingDestination relays data onward to tenant's other software
    - Migrations move a tenant's listener from one node to another

DATABASE: All tables live in cadreport_master (NOT tenant databases).
This is intentional — CAD infrastructure spans tenants and must be
managed centrally regardless of which server a tenant lives on.

DEPLOYMENT: These models are only used by master-level routers.
Tenant-only servers don't need these tables locally — they just run
listeners that POST parsed data to the tenant API.

FIRST MIGRATION PLAN:
    The geekom (current production, Glen Moore firehouse) will be migrated
    to a production VPS. The geekom then becomes dev/backup only.
    The cad_server_nodes table will have two entries:
    - "GEEKOM" (original, becomes dev after migration)
    - "VPS-PROD" (new production, hosts master + all tenants initially)
    See main.py architecture notes for the full deployment plan.

Design Principles:
    1. Every config needed to spin up a listener is stored here — any server
       can be reconstructed entirely from the master DB
    2. All timestamps are UTC with timezone awareness
    3. JSONB fields hold vendor-specific / type-specific config that varies
       between inbound types (TCP vs Email vs Webhook etc.)
    4. Soft deletes via status fields — never hard delete infrastructure records
    5. Audit trail on all changes via updated_at + master_audit_log

Future Replication Notes:
    - cadreport_master should be the FIRST database to get streaming replication
      to a hot standby, since losing it means losing all tenant routing
    - PostgreSQL streaming replication: set up a standby with
      primary_conninfo pointing to the primary's cadreport_master
    - For read scaling, use logical replication to push cad_server_nodes and
      cad_listeners tables to regional nodes (they need to know the topology)
    - pg_auto_failover or Patroni can automate primary→standby promotion
    - The 'role' field on ServerNode supports primary/standby/replica awareness
      so the admin UI can visualize the replication topology

Migration Script:
    After review, generate with:
        alembic revision --autogenerate -m "add_cad_infrastructure_tables"
    Or manual SQL — see comments at bottom of file for raw CREATE TABLE statements
"""

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, ForeignKey, DateTime, Float,
    UniqueConstraint, Index, CheckConstraint
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from master_database import MasterBase


# =============================================================================
# SERVER NODES
# =============================================================================

class CADServerNode(MasterBase):
    """
    A physical or virtual server that hosts CAD listener processes.
    
    Today this is the geekom mini PC at Glen Moore firehouse.
    Tomorrow it could be VPS instances in different regions.
    
    The node registry is the foundation for:
    - Knowing where listeners run
    - Port allocation (each node has its own port range)
    - Health monitoring (heartbeat tracking)
    - Capacity planning (how many listeners can a node handle)
    - Migration planning (move tenants between nodes)
    
    FUTURE - Replication Topology:
        When PostgreSQL replication is configured, the 'role' field tracks
        whether this node hosts a primary or standby database. The admin UI
        can then show replication lag, failover controls, etc.
        
        Fields reserved for this:
        - role: primary / standby / replica / edge
        - replication_config: connection strings, lag thresholds, etc.
        
    FUTURE - Remote Management:
        When nodes have an agent/API running, the admin UI can:
        - Start/stop individual listeners remotely
        - Pull health metrics (CPU, memory, disk)
        - Trigger backups
        - Deploy parser template updates
        
        Fields reserved for this:
        - agent_url: URL of the management agent on this node
        - agent_auth_config: credentials for the agent API
        - ssh_config: SSH connection details (encrypted)
    """
    __tablename__ = "cad_server_nodes"
    
    id = Column(Integer, primary_key=True)
    
    # --- Identity ---
    name = Column(String(50), unique=True, nullable=False)    # e.g., "GM-PRIMARY", "EAST-01"
    hostname = Column(String(255), nullable=False)             # DNS name or IP used to reach it
    ip_address = Column(String(45))                            # IPv4 or IPv6, for display/reference
    region = Column(String(100))                               # Human-readable location, e.g., "Chester County, PA"
    
    # --- Capacity ---
    port_range_start = Column(Integer, nullable=False, default=19100)
    port_range_end = Column(Integer, nullable=False, default=19300)
    max_listeners = Column(Integer, nullable=False, default=50)
    
    # --- Status ---
    # online:      accepting new listeners, running normally
    # offline:     not reachable, no listeners running
    # maintenance: temporarily down for updates, no new assignments
    # draining:    no new listeners, existing ones being migrated off
    status = Column(String(20), nullable=False, default='offline')
    
    # --- Health Monitoring ---
    last_heartbeat_at = Column(DateTime(timezone=True))
    heartbeat_interval_seconds = Column(Integer, default=30)
    cpu_percent = Column(Float)
    memory_percent = Column(Float)
    disk_percent = Column(Float)
    uptime_seconds = Column(Integer)
    
    # --- Replication (FUTURE) ---
    role = Column(String(20), default='primary')
    replication_source_id = Column(Integer, ForeignKey('cad_server_nodes.id'))
    replication_config = Column(JSONB, default={})
    
    # --- Remote Management (FUTURE) ---
    agent_url = Column(String(500))
    agent_auth_config = Column(JSONB, default={})
    ssh_config = Column(JSONB, default={})
    
    # --- Tags/Labels ---
    tags = Column(JSONB, default={})
    
    # --- Notes ---
    notes = Column(Text)
    
    # --- Audit ---
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey('master_admins.id'))
    
    # --- Relationships ---
    listeners = relationship("CADListener", back_populates="server_node")
    replication_source = relationship("CADServerNode", remote_side=[id])
    
    __table_args__ = (
        CheckConstraint("port_range_start < port_range_end", name="ck_port_range_valid"),
        CheckConstraint("status IN ('online', 'offline', 'maintenance', 'draining')", name="ck_node_status"),
        CheckConstraint("role IN ('primary', 'standby', 'replica', 'edge')", name="ck_node_role"),
    )


# =============================================================================
# PARSER TEMPLATES
# =============================================================================

class CADParserTemplate(MasterBase):
    """
    Reusable parsing configuration for a specific CAD vendor's data format.
    """
    __tablename__ = "cad_parser_templates"
    
    id = Column(Integer, primary_key=True)
    
    name = Column(String(200), nullable=False)
    description = Column(Text)
    vendor_name = Column(String(200))
    vendor_contact = Column(String(500))
    format_type = Column(String(50), nullable=False)
    parsing_config = Column(JSONB, nullable=False, default={})
    version = Column(Integer, nullable=False, default=1)
    cloned_from_id = Column(Integer, ForeignKey('cad_parser_templates.id'))
    test_sample_data = Column(Text)
    last_test_result = Column(JSONB)
    last_tested_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, nullable=False, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey('master_admins.id'))
    
    listeners = relationship("CADListener", back_populates="parser_template")
    cloned_from = relationship("CADParserTemplate", remote_side=[id])
    
    __table_args__ = (
        CheckConstraint(
            "format_type IN ('html_table', 'xml', 'json', 'csv', 'fixed_width', 'pdf', 'email_body', 'plaintext')",
            name="ck_parser_format_type"
        ),
    )


# =============================================================================
# CAD LISTENERS
# =============================================================================

class CADListener(MasterBase):
    """
    A per-tenant inbound CAD data receiver.
    
    Each tenant gets their own dedicated listener with its own port/inbox/endpoint.
    The listener configuration stored here contains EVERYTHING needed to launch
    the listener process — any server can be reconstructed from the master DB.
    """
    __tablename__ = "cad_listeners"
    
    id = Column(Integer, primary_key=True)
    
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=False)
    server_node_id = Column(Integer, ForeignKey('cad_server_nodes.id'), nullable=False)
    parser_template_id = Column(Integer, ForeignKey('cad_parser_templates.id'), nullable=False)
    inbound_type = Column(String(20), nullable=False)
    inbound_config = Column(JSONB, nullable=False, default={})
    port = Column(Integer)
    api_url = Column(String(500), nullable=False)
    tenant_slug = Column(String(50), nullable=False)
    timezone = Column(String(50), nullable=False, default='America/New_York')
    auto_start = Column(Boolean, nullable=False, default=True)
    enabled = Column(Boolean, nullable=False, default=True)
    status = Column(String(20), nullable=False, default='stopped')
    status_message = Column(Text)
    status_changed_at = Column(DateTime(timezone=True))
    process_id = Column(Integer)
    process_started_at = Column(DateTime(timezone=True))
    last_received_at = Column(DateTime(timezone=True))
    messages_total = Column(Integer, default=0)
    messages_today = Column(Integer, default=0)
    errors_total = Column(Integer, default=0)
    errors_today = Column(Integer, default=0)
    last_error_at = Column(DateTime(timezone=True))
    last_error_message = Column(Text)
    raw_data_retention_days = Column(Integer, default=90)
    notes = Column(Text)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey('master_admins.id'))
    
    server_node = relationship("CADServerNode", back_populates="listeners")
    parser_template = relationship("CADParserTemplate", back_populates="listeners")
    forwarding_destinations = relationship("CADForwardingDestination", back_populates="listener", cascade="all, delete-orphan")
    events = relationship("CADListenerEvent", back_populates="listener", cascade="all, delete-orphan")
    
    __table_args__ = (
        UniqueConstraint('server_node_id', 'port', name='uq_listener_node_port'),
        UniqueConstraint('tenant_id', 'server_node_id', name='uq_listener_tenant_node'),
        Index('ix_listener_tenant', 'tenant_id'),
        Index('ix_listener_status', 'status'),
        Index('ix_listener_node', 'server_node_id'),
        CheckConstraint(
            "inbound_type IN ('tcp', 'email', 'webhook', 'sftp', 'api_poll', 'file_watch')",
            name="ck_listener_inbound_type"
        ),
        CheckConstraint(
            "status IN ('running', 'stopped', 'error', 'migrating', 'starting', 'stopping')",
            name="ck_listener_status"
        ),
    )


# =============================================================================
# FORWARDING DESTINATIONS
# =============================================================================

class CADForwardingDestination(MasterBase):
    """
    A downstream system that receives a copy of CAD data after CADReport processes it.
    """
    __tablename__ = "cad_forwarding_destinations"
    
    id = Column(Integer, primary_key=True)
    
    listener_id = Column(Integer, ForeignKey('cad_listeners.id', ondelete='CASCADE'), nullable=False)
    name = Column(String(200))
    outbound_type = Column(String(20), nullable=False)
    forward_mode = Column(String(10), nullable=False, default='raw')
    outbound_config = Column(JSONB, nullable=False, default={})
    retry_config = Column(JSONB, default={})
    enabled = Column(Boolean, nullable=False, default=True)
    status = Column(String(20), nullable=False, default='active')
    last_forwarded_at = Column(DateTime(timezone=True))
    forwards_total = Column(Integer, default=0)
    forwards_today = Column(Integer, default=0)
    failures_total = Column(Integer, default=0)
    failures_today = Column(Integer, default=0)
    last_failure_at = Column(DateTime(timezone=True))
    last_failure_message = Column(Text)
    notes = Column(Text)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey('master_admins.id'))
    
    listener = relationship("CADListener", back_populates="forwarding_destinations")
    
    __table_args__ = (
        Index('ix_fwd_listener', 'listener_id'),
        CheckConstraint(
            "outbound_type IN ('tcp', 'email', 'webhook', 'sftp', 'api_push')",
            name="ck_fwd_outbound_type"
        ),
        CheckConstraint(
            "forward_mode IN ('raw', 'parsed', 'both')",
            name="ck_fwd_forward_mode"
        ),
        CheckConstraint(
            "status IN ('active', 'error', 'paused', 'backoff')",
            name="ck_fwd_status"
        ),
    )


# =============================================================================
# LISTENER EVENTS
# =============================================================================

class CADListenerEvent(MasterBase):
    """Event log for CAD listener activity and health tracking."""
    __tablename__ = "cad_listener_events"
    
    id = Column(Integer, primary_key=True)
    listener_id = Column(Integer, ForeignKey('cad_listeners.id', ondelete='CASCADE'), nullable=False)
    event_type = Column(String(30), nullable=False)
    severity = Column(String(10), nullable=False, default='info')
    message = Column(Text)
    details = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    listener = relationship("CADListener", back_populates="events")
    
    __table_args__ = (
        Index('ix_event_listener_created', 'listener_id', 'created_at'),
        Index('ix_event_type', 'event_type'),
        Index('ix_event_severity', 'severity'),
    )


# =============================================================================
# MIGRATIONS
# =============================================================================

class CADMigration(MasterBase):
    """Tracks the migration of a tenant's CAD listener from one server node to another."""
    __tablename__ = "cad_migrations"
    
    id = Column(Integer, primary_key=True)
    
    listener_id = Column(Integer, ForeignKey('cad_listeners.id'), nullable=False)
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=False)
    source_node_id = Column(Integer, ForeignKey('cad_server_nodes.id'), nullable=False)
    destination_node_id = Column(Integer, ForeignKey('cad_server_nodes.id'), nullable=False)
    destination_port = Column(Integer)
    status = Column(String(20), nullable=False, default='scheduled')
    status_message = Column(Text)
    scheduled_at = Column(DateTime(timezone=True))
    maintenance_window_start = Column(DateTime(timezone=True))
    maintenance_window_end = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    rolled_back_at = Column(DateTime(timezone=True))
    created_by = Column(Integer, ForeignKey('master_admins.id'))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    steps = relationship("CADMigrationStep", back_populates="migration", order_by="CADMigrationStep.step_order")
    
    __table_args__ = (
        CheckConstraint(
            "status IN ('scheduled', 'preparing', 'testing', 'cutover', 'verifying', 'completed', 'failed', 'rolled_back')",
            name="ck_migration_status"
        ),
        CheckConstraint(
            "source_node_id != destination_node_id",
            name="ck_migration_different_nodes"
        ),
    )


class CADMigrationStep(MasterBase):
    """Individual step within a migration, for detailed audit trail."""
    __tablename__ = "cad_migration_steps"
    
    id = Column(Integer, primary_key=True)
    migration_id = Column(Integer, ForeignKey('cad_migrations.id', ondelete='CASCADE'), nullable=False)
    step_order = Column(Integer, nullable=False)
    step_name = Column(String(100), nullable=False)
    description = Column(Text)
    status = Column(String(20), nullable=False, default='pending')
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    result_message = Column(Text)
    result_details = Column(JSONB)
    rollback_action = Column(JSONB)
    rolled_back_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    migration = relationship("CADMigration", back_populates="steps")


# =============================================================================
# ALERT RULES
# =============================================================================

class CADAlertRule(MasterBase):
    """Configurable alert rules for CAD infrastructure monitoring."""
    __tablename__ = "cad_alert_rules"
    
    id = Column(Integer, primary_key=True)
    
    name = Column(String(200), nullable=False)
    description = Column(Text)
    scope = Column(String(20), nullable=False)
    scope_entity_id = Column(Integer)
    condition_type = Column(String(50), nullable=False)
    threshold_seconds = Column(Integer)
    threshold_count = Column(Integer)
    threshold_percent = Column(Float)
    enabled = Column(Boolean, nullable=False, default=True)
    cooldown_seconds = Column(Integer, default=300)
    last_triggered_at = Column(DateTime(timezone=True))
    alert_config = Column(JSONB, default={})
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey('master_admins.id'))
    
    __table_args__ = (
        CheckConstraint(
            "scope IN ('listener', 'node', 'destination')",
            name="ck_alert_scope"
        ),
    )


# =============================================================================
# RAW SQL FOR MANUAL MIGRATION (if not using Alembic)
# =============================================================================
#
# Run these in order against cadreport_master:
#
# -- 1. Server Nodes
# CREATE TABLE cad_server_nodes (
#     id SERIAL PRIMARY KEY,
#     name VARCHAR(50) UNIQUE NOT NULL,
#     hostname VARCHAR(255) NOT NULL,
#     ip_address VARCHAR(45),
#     region VARCHAR(100),
#     port_range_start INTEGER NOT NULL DEFAULT 19100,
#     port_range_end INTEGER NOT NULL DEFAULT 19300,
#     max_listeners INTEGER NOT NULL DEFAULT 50,
#     status VARCHAR(20) NOT NULL DEFAULT 'offline',
#     last_heartbeat_at TIMESTAMPTZ,
#     heartbeat_interval_seconds INTEGER DEFAULT 30,
#     cpu_percent FLOAT,
#     memory_percent FLOAT,
#     disk_percent FLOAT,
#     uptime_seconds INTEGER,
#     role VARCHAR(20) DEFAULT 'primary',
#     replication_source_id INTEGER REFERENCES cad_server_nodes(id),
#     replication_config JSONB DEFAULT '{}',
#     agent_url VARCHAR(500),
#     agent_auth_config JSONB DEFAULT '{}',
#     ssh_config JSONB DEFAULT '{}',
#     tags JSONB DEFAULT '{}',
#     notes TEXT,
#     created_at TIMESTAMPTZ DEFAULT NOW(),
#     updated_at TIMESTAMPTZ DEFAULT NOW(),
#     created_by INTEGER REFERENCES master_admins(id),
#     CONSTRAINT ck_port_range_valid CHECK (port_range_start < port_range_end),
#     CONSTRAINT ck_node_status CHECK (status IN ('online', 'offline', 'maintenance', 'draining')),
#     CONSTRAINT ck_node_role CHECK (role IN ('primary', 'standby', 'replica', 'edge'))
# );
#
# -- 2. Parser Templates
# CREATE TABLE cad_parser_templates (
#     id SERIAL PRIMARY KEY,
#     name VARCHAR(200) NOT NULL,
#     description TEXT,
#     vendor_name VARCHAR(200),
#     vendor_contact VARCHAR(500),
#     format_type VARCHAR(50) NOT NULL,
#     parsing_config JSONB NOT NULL DEFAULT '{}',
#     version INTEGER NOT NULL DEFAULT 1,
#     cloned_from_id INTEGER REFERENCES cad_parser_templates(id),
#     test_sample_data TEXT,
#     last_test_result JSONB,
#     last_tested_at TIMESTAMPTZ,
#     is_active BOOLEAN NOT NULL DEFAULT TRUE,
#     created_at TIMESTAMPTZ DEFAULT NOW(),
#     updated_at TIMESTAMPTZ DEFAULT NOW(),
#     created_by INTEGER REFERENCES master_admins(id),
#     CONSTRAINT ck_parser_format_type CHECK (format_type IN ('html_table', 'xml', 'json', 'csv', 'fixed_width', 'pdf', 'email_body', 'plaintext'))
# );
#
# -- 3. Listeners
# CREATE TABLE cad_listeners (
#     id SERIAL PRIMARY KEY,
#     tenant_id INTEGER NOT NULL REFERENCES tenants(id),
#     server_node_id INTEGER NOT NULL REFERENCES cad_server_nodes(id),
#     parser_template_id INTEGER NOT NULL REFERENCES cad_parser_templates(id),
#     inbound_type VARCHAR(20) NOT NULL,
#     inbound_config JSONB NOT NULL DEFAULT '{}',
#     port INTEGER,
#     api_url VARCHAR(500) NOT NULL,
#     tenant_slug VARCHAR(50) NOT NULL,
#     timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
#     auto_start BOOLEAN NOT NULL DEFAULT TRUE,
#     enabled BOOLEAN NOT NULL DEFAULT TRUE,
#     status VARCHAR(20) NOT NULL DEFAULT 'stopped',
#     status_message TEXT,
#     status_changed_at TIMESTAMPTZ,
#     process_id INTEGER,
#     process_started_at TIMESTAMPTZ,
#     last_received_at TIMESTAMPTZ,
#     messages_total INTEGER DEFAULT 0,
#     messages_today INTEGER DEFAULT 0,
#     errors_total INTEGER DEFAULT 0,
#     errors_today INTEGER DEFAULT 0,
#     last_error_at TIMESTAMPTZ,
#     last_error_message TEXT,
#     raw_data_retention_days INTEGER DEFAULT 90,
#     notes TEXT,
#     created_at TIMESTAMPTZ DEFAULT NOW(),
#     updated_at TIMESTAMPTZ DEFAULT NOW(),
#     created_by INTEGER REFERENCES master_admins(id),
#     CONSTRAINT uq_listener_node_port UNIQUE (server_node_id, port),
#     CONSTRAINT uq_listener_tenant_node UNIQUE (tenant_id, server_node_id),
#     CONSTRAINT ck_listener_inbound_type CHECK (inbound_type IN ('tcp', 'email', 'webhook', 'sftp', 'api_poll', 'file_watch')),
#     CONSTRAINT ck_listener_status CHECK (status IN ('running', 'stopped', 'error', 'migrating', 'starting', 'stopping'))
# );
# CREATE INDEX ix_listener_tenant ON cad_listeners(tenant_id);
# CREATE INDEX ix_listener_status ON cad_listeners(status);
# CREATE INDEX ix_listener_node ON cad_listeners(server_node_id);
#
# -- 4. Forwarding Destinations
# CREATE TABLE cad_forwarding_destinations (
#     id SERIAL PRIMARY KEY,
#     listener_id INTEGER NOT NULL REFERENCES cad_listeners(id) ON DELETE CASCADE,
#     name VARCHAR(200),
#     outbound_type VARCHAR(20) NOT NULL,
#     forward_mode VARCHAR(10) NOT NULL DEFAULT 'raw',
#     outbound_config JSONB NOT NULL DEFAULT '{}',
#     retry_config JSONB DEFAULT '{}',
#     enabled BOOLEAN NOT NULL DEFAULT TRUE,
#     status VARCHAR(20) NOT NULL DEFAULT 'active',
#     last_forwarded_at TIMESTAMPTZ,
#     forwards_total INTEGER DEFAULT 0,
#     forwards_today INTEGER DEFAULT 0,
#     failures_total INTEGER DEFAULT 0,
#     failures_today INTEGER DEFAULT 0,
#     last_failure_at TIMESTAMPTZ,
#     last_failure_message TEXT,
#     notes TEXT,
#     created_at TIMESTAMPTZ DEFAULT NOW(),
#     updated_at TIMESTAMPTZ DEFAULT NOW(),
#     created_by INTEGER REFERENCES master_admins(id),
#     CONSTRAINT ck_fwd_outbound_type CHECK (outbound_type IN ('tcp', 'email', 'webhook', 'sftp', 'api_push')),
#     CONSTRAINT ck_fwd_forward_mode CHECK (forward_mode IN ('raw', 'parsed', 'both')),
#     CONSTRAINT ck_fwd_status CHECK (status IN ('active', 'error', 'paused', 'backoff'))
# );
# CREATE INDEX ix_fwd_listener ON cad_forwarding_destinations(listener_id);
#
# -- 5. Listener Events
# CREATE TABLE cad_listener_events (
#     id SERIAL PRIMARY KEY,
#     listener_id INTEGER NOT NULL REFERENCES cad_listeners(id) ON DELETE CASCADE,
#     event_type VARCHAR(30) NOT NULL,
#     severity VARCHAR(10) NOT NULL DEFAULT 'info',
#     message TEXT,
#     details JSONB,
#     created_at TIMESTAMPTZ DEFAULT NOW()
# );
# CREATE INDEX ix_event_listener_created ON cad_listener_events(listener_id, created_at);
# CREATE INDEX ix_event_type ON cad_listener_events(event_type);
# CREATE INDEX ix_event_severity ON cad_listener_events(severity);
#
# -- 6. Migrations
# CREATE TABLE cad_migrations (
#     id SERIAL PRIMARY KEY,
#     listener_id INTEGER NOT NULL REFERENCES cad_listeners(id),
#     tenant_id INTEGER NOT NULL REFERENCES tenants(id),
#     source_node_id INTEGER NOT NULL REFERENCES cad_server_nodes(id),
#     destination_node_id INTEGER NOT NULL REFERENCES cad_server_nodes(id),
#     destination_port INTEGER,
#     status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
#     status_message TEXT,
#     scheduled_at TIMESTAMPTZ,
#     maintenance_window_start TIMESTAMPTZ,
#     maintenance_window_end TIMESTAMPTZ,
#     started_at TIMESTAMPTZ,
#     completed_at TIMESTAMPTZ,
#     rolled_back_at TIMESTAMPTZ,
#     created_by INTEGER REFERENCES master_admins(id),
#     created_at TIMESTAMPTZ DEFAULT NOW(),
#     updated_at TIMESTAMPTZ DEFAULT NOW(),
#     CONSTRAINT ck_migration_status CHECK (status IN ('scheduled', 'preparing', 'testing', 'cutover', 'verifying', 'completed', 'failed', 'rolled_back')),
#     CONSTRAINT ck_migration_different_nodes CHECK (source_node_id != destination_node_id)
# );
#
# -- 7. Migration Steps
# CREATE TABLE cad_migration_steps (
#     id SERIAL PRIMARY KEY,
#     migration_id INTEGER NOT NULL REFERENCES cad_migrations(id) ON DELETE CASCADE,
#     step_order INTEGER NOT NULL,
#     step_name VARCHAR(100) NOT NULL,
#     description TEXT,
#     status VARCHAR(20) NOT NULL DEFAULT 'pending',
#     started_at TIMESTAMPTZ,
#     completed_at TIMESTAMPTZ,
#     result_message TEXT,
#     result_details JSONB,
#     rollback_action JSONB,
#     rolled_back_at TIMESTAMPTZ,
#     created_at TIMESTAMPTZ DEFAULT NOW()
# );
#
# -- 8. Alert Rules
# CREATE TABLE cad_alert_rules (
#     id SERIAL PRIMARY KEY,
#     name VARCHAR(200) NOT NULL,
#     description TEXT,
#     scope VARCHAR(20) NOT NULL,
#     scope_entity_id INTEGER,
#     condition_type VARCHAR(50) NOT NULL,
#     threshold_seconds INTEGER,
#     threshold_count INTEGER,
#     threshold_percent FLOAT,
#     enabled BOOLEAN NOT NULL DEFAULT TRUE,
#     cooldown_seconds INTEGER DEFAULT 300,
#     last_triggered_at TIMESTAMPTZ,
#     alert_config JSONB DEFAULT '{}',
#     created_at TIMESTAMPTZ DEFAULT NOW(),
#     updated_at TIMESTAMPTZ DEFAULT NOW(),
#     created_by INTEGER REFERENCES master_admins(id),
#     CONSTRAINT ck_alert_scope CHECK (scope IN ('listener', 'node', 'destination'))
# );
