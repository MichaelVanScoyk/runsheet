# CADReport / RunSheet - Multi-Tenant Architecture

## Overview

CADReport is a multi-tenant SaaS platform for fire department incident management. Each fire department (tenant) gets their own isolated environment while sharing the same codebase and infrastructure.

---

## Architecture Diagram

```
                                    INTERNET
                                        │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │              NGINX                     │
                    │         (SSL Termination)              │
                    │                                        │
                    │  cadreport.com → Landing Page          │
                    │  *.cadreport.com → RunSheet App        │
                    └───────────────────┬───────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │                                        │
                    ▼                                        ▼
        ┌───────────────────┐                    ┌───────────────────┐
        │   Landing Page    │                    │   RunSheet API    │
        │   (React SPA)     │                    │    (FastAPI)      │
        │                   │                    │                   │
        │ • Tenant Login    │                    │ Middleware:       │
        │ • Tenant Signup   │                    │ • Read subdomain  │
        │ • Master Admin    │                    │ • Lookup tenant   │
        └───────────────────┘                    │ • Switch database │
                                                 └─────────┬─────────┘
                                                           │
                    ┌──────────────────────────────────────┼──────────────────────────────────────┐
                    │                                      │                                      │
                    ▼                                      ▼                                      ▼
        ┌───────────────────┐                  ┌───────────────────┐                  ┌───────────────────┐
        │  cadreport_master │                  │runsheet_glenmoorefc│                 │ runsheet_otherdept │
        │                   │                  │                   │                  │                   │
        │ • tenants         │                  │ • incidents       │                  │ • incidents       │
        │ • master_admins   │                  │ • personnel       │                  │ • personnel       │
        │ • tenant_sessions │                  │ • apparatus       │                  │ • apparatus       │
        │ • master_sessions │                  │ • settings        │                  │ • settings        │
        │ • audit_log       │                  │ • audit_log       │                  │ • audit_log       │
        └───────────────────┘                  └───────────────────┘                  └───────────────────┘
                                                           ▲
                                                           │
                                               ┌───────────┴───────────┐
                                               │                       │
                                   ┌───────────────────┐   ┌───────────────────┐
                                   │  CAD Listener     │   │  CAD Listener     │
                                   │  Port 19117       │   │  Port 19118       │
                                   │  --tenant         │   │  --tenant         │
                                   │  glenmoorefc      │   │  otherdept        │
                                   └───────────────────┘   └───────────────────┘
                                               ▲                       ▲
                                               │                       │
                                   ┌───────────────────┐   ┌───────────────────┐
                                   │  Chester County   │   │  Other County     │
                                   │  CAD System       │   │  CAD System       │
                                   └───────────────────┘   └───────────────────┘
```

---

## Tenant Lifecycle

### 1. Signup Request

A fire department officer visits `cadreport.com` and fills out the signup form:

| Field | Example |
|-------|---------|
| Department Name | Glen Moore Fire Company |
| Subdomain (slug) | glenmoorefc |
| County | Chester |
| State | PA |
| Contact Name | Mike Smith |
| Contact Email | chief@glenmoorefc.org |
| Contact Phone | 610-555-1234 |

This creates a record in `cadreport_master.tenants` with `status = 'PENDING'`.

### 2. Admin Approval

A master admin reviews the request and:
- Verifies the department is legitimate
- Checks subdomain availability
- Approves or rejects

On approval, the system:
1. Creates database `runsheet_{slug}`
2. Runs schema migrations
3. Seeds initial data (NERIS codes, default settings)
4. Assigns CAD port (if applicable)
5. Updates tenant status to `ACTIVE`
6. Sends welcome email with setup instructions

### 3. Tenant Setup

The department admin logs into their subdomain and:
1. Sets up personnel roster
2. Configures apparatus/units
3. Sets timezone and station location
4. Configures CAD integration (if applicable)

### 4. Ongoing Operations

- Incidents flow in via CAD listener or manual entry
- Officers complete run sheets
- Reports are generated
- Data is backed up per retention policy

---

## Database Architecture

### Master Database: `cadreport_master`

Stores cross-tenant data. Never contains incident or personnel data.

```sql
-- Tenant registry
CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,      -- "glenmoorefc"
    name VARCHAR(200) NOT NULL,             -- "Glen Moore Fire Company"
    database_name VARCHAR(100) NOT NULL,    -- "runsheet_glenmoorefc"
    
    -- Status
    status VARCHAR(20) DEFAULT 'PENDING',   -- PENDING, ACTIVE, SUSPENDED, DELETED
    
    -- Contact
    contact_name VARCHAR(100),
    contact_email VARCHAR(200),
    contact_phone VARCHAR(20),
    
    -- Location
    county VARCHAR(100),
    state VARCHAR(2),
    
    -- CAD Integration
    cad_port INTEGER,                       -- 19117, 19118, etc.
    cad_format VARCHAR(50),                 -- "chester_county", "montgomery_county"
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    approved_at TIMESTAMP,
    approved_by INTEGER REFERENCES master_admins(id),
    suspended_at TIMESTAMP,
    suspended_by INTEGER REFERENCES master_admins(id),
    suspended_reason TEXT
);

-- Master administrators (CADReport staff)
CREATE TABLE master_admins (
    id SERIAL PRIMARY KEY,
    email VARCHAR(200) UNIQUE NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'ADMIN',       -- SUPER_ADMIN, ADMIN, SUPPORT, READONLY
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

-- Master admin sessions
CREATE TABLE master_sessions (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES master_admins(id),
    session_token VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    ip_address VARCHAR(45)
);

-- Tenant-level sessions (for subdomain login)
CREATE TABLE tenant_sessions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    session_token VARCHAR(100) UNIQUE NOT NULL,
    user_id INTEGER,                        -- References user in tenant DB
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    ip_address VARCHAR(45)
);

-- Master audit log (admin actions)
CREATE TABLE master_audit_log (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES master_admins(id),
    action VARCHAR(50) NOT NULL,            -- APPROVE_TENANT, SUSPEND_TENANT, etc.
    target_type VARCHAR(50),                -- TENANT, ADMIN, SYSTEM
    target_id INTEGER,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW()
);

-- System configuration
CREATE TABLE system_config (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tenant Database: `runsheet_{slug}`

Each tenant gets a complete, isolated database with:

| Table | Purpose |
|-------|---------|
| `incidents` | Incident records with NERIS fields |
| `incident_units` | Units that responded |
| `incident_personnel` | Personnel assignments |
| `personnel` | Roster of firefighters |
| `apparatus` | Units/vehicles |
| `ranks` | Rank definitions |
| `certifications` | Certification tracking |
| `municipalities` | Jurisdiction lookup |
| `cad_type_mappings` | CAD type → FIRE/EMS mapping |
| `neris_codes` | NERIS code lookup tables |
| `settings` | Tenant configuration |
| `users` | Login accounts (officers, admins) |
| `audit_log` | Tenant-level audit trail |

---

## CAD Integration

### How CAD Data Flows

```
County CAD System
    │
    │ TCP connection to assigned port
    ▼
┌─────────────────────────────────────────────────┐
│              CAD Listener Process               │
│                                                 │
│  1. Receive raw data (HTML/XML/JSON)            │
│  2. Save to disk (backup)                       │
│  3. Parse report                                │
│  4. Call tenant API                             │
│                                                 │
│  Arguments:                                     │
│    --port 19117                                 │
│    --tenant glenmoorefc                         │
│    --api-url https://glenmoorefc.cadreport.com  │
│    --timezone America/New_York                  │
└─────────────────────────────────────────────────┘
    │
    │ HTTPS API calls
    ▼
┌─────────────────────────────────────────────────┐
│              RunSheet API                       │
│                                                 │
│  POST /api/incidents      (create)              │
│  PUT /api/incidents/{id}  (update)              │
│  POST /api/incidents/{id}/close                 │
│  GET /api/apparatus/lookup?unit_id=ENG481       │
└─────────────────────────────────────────────────┘
```

### CAD Listener Configuration

Each tenant needs:

| Setting | Example | Notes |
|---------|---------|-------|
| Port | 19117 | Unique per tenant, county points CAD here |
| Tenant | glenmoorefc | Determines backup directory |
| API URL | https://glenmoorefc.cadreport.com | Subdomain routes to correct DB |
| Timezone | America/New_York | For timestamp conversion |
| CAD Format | chester_county | Parser to use (future) |

### CAD Port Assignment

| Port Range | Purpose |
|------------|---------|
| 19117-19199 | Production CAD feeds |
| 19200-19299 | Test/staging CAD feeds |

### Backup Directory Structure

```
/opt/runsheet/data/
├── glenmoorefc/
│   ├── cad_backup/
│   │   ├── 2025-12-29_055551_F25070988_DISPATCH.html
│   │   └── 2025-12-29_060134_F25070988_CLEAR.html
│   └── cad_failed/
│       └── 2025-12-29_055551_F25070988_DISPATCH_FAILED.json
├── otherdept/
│   ├── cad_backup/
│   └── cad_failed/
```

---

## Authentication & Authorization

### Three Login Contexts

| Context | URL | Authenticates Against |
|---------|-----|----------------------|
| Master Admin | cadreport.com | `cadreport_master.master_admins` |
| Tenant (Department) | cadreport.com → subdomain | `cadreport_master.tenants` |
| User (Firefighter) | subdomain.cadreport.com | `runsheet_{slug}.users` |

### Session Flow

```
1. User visits glenmoorefc.cadreport.com
2. Middleware extracts subdomain "glenmoorefc"
3. Looks up tenant in cadreport_master
4. Checks for valid session cookie
5. If no session, redirect to login
6. On login success, create session in master + set cookie
7. All subsequent requests use session to identify tenant + user
```

### User Roles (Per Tenant)

| Role | Can Do |
|------|--------|
| ADMIN | Everything - manage users, settings, all incidents |
| OFFICER | Complete/approve run sheets, view reports |
| MEMBER | View incidents, self-assign to roster |
| READONLY | View only |

### Master Admin Roles

| Role | Can Do |
|------|--------|
| SUPER_ADMIN | Everything - manage other admins, system config |
| ADMIN | Manage tenants, view all data |
| SUPPORT | View tenants, reset passwords, view logs |
| READONLY | View only (for auditors) |

---

## Tenant Provisioning

### Automated Steps (On Approval)

```bash
# 1. Create database
createdb runsheet_glenmoorefc

# 2. Run migrations
alembic upgrade head

# 3. Seed NERIS codes
psql runsheet_glenmoorefc < neris_codes.sql

# 4. Create default settings
INSERT INTO settings (category, key, value) VALUES
    ('general', 'station_name', '"Glen Moore Fire Company"'),
    ('general', 'station_number', '"48"'),
    ('general', 'timezone', '"America/New_York"'),
    ...

# 5. Create admin user
INSERT INTO users (email, password_hash, role) VALUES
    ('chief@glenmoorefc.org', '...', 'ADMIN');

# 6. Start CAD listener (if configured)
systemctl enable cad_listener_glenmoorefc
systemctl start cad_listener_glenmoorefc
```

### CAD Listener Systemd Service

Each tenant with CAD integration gets a service file:

```ini
# /etc/systemd/system/cad_listener_glenmoorefc.service

[Unit]
Description=CAD Listener - glenmoorefc
After=network.target

[Service]
Type=simple
User=dashboard
ExecStart=/opt/runsheet/runsheet_env/bin/python /opt/runsheet/cad/cad_listener.py \
    --port 19117 \
    --tenant glenmoorefc \
    --api-url https://glenmoorefc.cadreport.com \
    --timezone America/New_York
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## NERIS Compliance

### What is NERIS?

National Emergency Response Information System - federal standard for fire incident reporting, effective January 2026.

### How CADReport Supports NERIS

| Requirement | Implementation |
|-------------|----------------|
| Incident types | `neris_incident_type_codes` - array of NERIS type codes |
| Location use | `neris_location_use` - structured property use data |
| Actions taken | `neris_action_codes` - what firefighters did |
| Response times | Calculated from CAD unit timestamps |
| Personnel | Tracked per unit with rank snapshots |
| Apparatus | Mapped to NERIS unit types |

### NERIS ID Generation

Format: `{fd_neris_id}:{epoch_milliseconds}`

Example: `FD24027000:1714762619000`

- `FD24027000` = NERIS-assigned department ID
- `1714762619000` = Dispatch time as Unix epoch (ms)

---

## Backup & Recovery

### What Gets Backed Up

| Data | Method | Retention |
|------|--------|-----------|
| CAD raw data | Disk file per report | 1 year |
| Tenant databases | pg_dump nightly | 30 days |
| Master database | pg_dump nightly | 90 days |
| Audit logs | Database (never deleted) | Forever |

### Recovery Scenarios

| Scenario | Recovery Method |
|----------|-----------------|
| Single incident lost | Reparse from CAD backup file |
| Database corruption | Restore from nightly backup |
| CAD listener missed dispatch | Clear report creates incident |
| Tenant accidentally deleted | Restore database, reactivate tenant |

---

## Monitoring & Alerts

### System Health Checks

| Check | Frequency | Alert If |
|-------|-----------|----------|
| API response time | 1 min | > 2 seconds |
| Database connections | 1 min | Pool exhausted |
| Disk space | 5 min | < 10% free |
| CAD listener status | 1 min | Not running |
| CAD data received | 5 min | None in 24 hours (daytime) |
| SSL certificate | Daily | Expires < 14 days |

### Per-Tenant Metrics

| Metric | Purpose |
|--------|---------|
| Incidents this month | Activity level |
| Last CAD received | Integration health |
| Open incidents | Workflow backlog |
| Failed API calls | Integration issues |

---

## Security Considerations

### Data Isolation

- Each tenant has separate database
- No cross-tenant queries possible
- Subdomain routes to exactly one database
- CAD listeners are tenant-specific

### Access Control

- All API endpoints require authentication
- Session cookies are httpOnly, secure, sameSite
- Passwords hashed with bcrypt
- Failed login attempts logged

### Network Security

- All traffic over HTTPS (TLS 1.3)
- CAD data over TCP (no encryption from county)
- Internal API calls (CAD listener) bypass auth by IP check
- Database not exposed to internet

### Audit Trail

- All incident changes logged with user ID
- Master admin actions logged
- Logs cannot be deleted
- Retention: indefinite

---

## Operational Procedures

### Adding a New Tenant

1. Receive and review signup request
2. Verify department identity (call back)
3. Approve in master admin panel
4. System auto-provisions database
5. Send welcome email with login link
6. Schedule onboarding call

### Suspending a Tenant

1. Set status to SUSPENDED in master admin
2. Users see "Account suspended" message
3. Data preserved (not deleted)
4. CAD listener stopped (if running)
5. Can be reactivated anytime

### Handling CAD Issues

1. Check listener status: `systemctl status cad_listener_{tenant}`
2. Check logs: `journalctl -u cad_listener_{tenant} -n 50`
3. Check backup files: `ls -la /opt/runsheet/data/{tenant}/cad_backup/`
4. Reparse if needed: `python reparse_cad.py --file {backup_file}`

### Database Maintenance

```bash
# Vacuum analyze (weekly)
psql runsheet_glenmoorefc -c "VACUUM ANALYZE;"

# Backup verification (monthly)
pg_restore --list backup.dump | head -20

# Index health check
psql runsheet_glenmoorefc -c "SELECT schemaname, tablename, indexname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan;"
```

---

## Configuration Reference

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | Master database connection | `postgresql://user:pass@localhost/cadreport_master` |
| `SECRET_KEY` | Session signing | Random 64-char string |
| `DOMAIN` | Base domain for cookies | `cadreport.com` |
| `DATA_DIR` | Tenant data directory | `/opt/runsheet/data` |

### nginx Configuration

```nginx
# Landing page
server {
    server_name cadreport.com;
    location / {
        proxy_pass http://127.0.0.1:5174;  # Landing page Vite
    }
}

# Tenant subdomains
server {
    server_name ~^(?<tenant>.+)\.cadreport\.com$;
    
    location / {
        proxy_pass http://127.0.0.1:5173;  # RunSheet Vite
    }
    
    location /api {
        proxy_pass http://127.0.0.1:8001;  # FastAPI
        proxy_set_header Host $host;
        proxy_set_header X-Tenant $tenant;
    }
}
```

---

## Glossary

| Term | Definition |
|------|------------|
| Tenant | A fire department using CADReport |
| Slug | URL-safe identifier (e.g., "glenmoorefc") |
| CAD | Computer-Aided Dispatch - county 911 system |
| NERIS | National Emergency Response Information System |
| Run Sheet | Incident report completed after a call |
| Apparatus | Fire truck, engine, or vehicle |
| Mutual Aid | Assistance from neighboring departments |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-29 | Initial multi-tenant architecture |

