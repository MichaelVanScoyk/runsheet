"""
Master Admin Router - System administration for CADReport

Handles:
- Master admin authentication
- Tenant management (approve, suspend, provision)
- System configuration
- Audit logging
"""

from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import secrets
import bcrypt
import subprocess
import os

from master_database import get_master_db, MasterDBSession

router = APIRouter()

# Session duration
SESSION_HOURS = 24


# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class MasterLoginRequest(BaseModel):
    email: str
    password: str


class MasterAdminCreate(BaseModel):
    email: str
    password: str
    name: str
    role: str = 'ADMIN'  # SUPER_ADMIN, ADMIN, SUPPORT, READONLY


class TenantApproveRequest(BaseModel):
    cad_port: Optional[int] = None
    cad_format: str = 'chester_county'
    notes: Optional[str] = None


class TenantSuspendRequest(BaseModel):
    reason: str


class TenantUpdateRequest(BaseModel):
    name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    county: Optional[str] = None
    notes: Optional[str] = None


class TenantCreateRequest(BaseModel):
    name: str
    slug: str
    password: str
    cad_port: Optional[int] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    county: Optional[str] = 'Chester'
    state: Optional[str] = 'PA'


class TenantPasswordResetRequest(BaseModel):
    password: str


class SystemConfigUpdate(BaseModel):
    key: str
    value: dict


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_client_ip(request: Request) -> str:
    """Get client IP from request"""
    forwarded = request.headers.get('X-Forwarded-For')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.client.host if request.client else 'unknown'


def verify_password(plain: str, hashed: str) -> bool:
    """Verify password against hash"""
    return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))


def hash_password(plain: str) -> str:
    """Hash password with bcrypt"""
    return bcrypt.hashpw(plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def log_audit(db: MasterDBSession, admin_id: int, admin_email: str, action: str, 
              target_type: str = None, target_id: int = None, target_name: str = None,
              details: dict = None, ip_address: str = None):
    """Log admin action to audit table"""
    db.execute("""
        INSERT INTO master_audit_log 
        (admin_id, admin_email, action, target_type, target_id, target_name, details, ip_address)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """, (admin_id, admin_email, action, target_type, target_id, target_name, 
          details if details else None, ip_address))
    db.commit()


async def get_current_admin(request: Request) -> dict:
    """Get current admin from session cookie"""
    session_token = request.cookies.get('master_session')
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    with get_master_db() as db:
        result = db.fetchone("""
            SELECT ms.admin_id, ma.email, ma.name, ma.role
            FROM master_sessions ms
            JOIN master_admins ma ON ma.id = ms.admin_id
            WHERE ms.session_token = %s 
              AND ms.expires_at > NOW()
              AND ma.active = TRUE
        """, (session_token,))
        
        if not result:
            raise HTTPException(status_code=401, detail="Session expired")
        
        return {
            'id': result[0],
            'email': result[1],
            'name': result[2],
            'role': result[3]
        }


def require_role(allowed_roles: List[str]):
    """Dependency to require specific roles"""
    async def check_role(request: Request):
        admin = await get_current_admin(request)
        if admin['role'] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return admin
    return check_role


# =============================================================================
# AUTHENTICATION
# =============================================================================

@router.post("/login")
async def master_login(data: MasterLoginRequest, request: Request, response: Response):
    """Login as master admin"""
    with get_master_db() as db:
        result = db.fetchone("""
            SELECT id, email, password_hash, name, role, active
            FROM master_admins
            WHERE email = %s
        """, (data.email.lower(),))
        
        if not result:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        admin_id, email, password_hash, name, role, active = result
        
        if not active:
            raise HTTPException(status_code=401, detail="Account disabled")
        
        if not verify_password(data.password, password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Create session
        session_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)
        ip_address = get_client_ip(request)
        
        db.execute("""
            INSERT INTO master_sessions (admin_id, session_token, expires_at, ip_address)
            VALUES (%s, %s, %s, %s)
        """, (admin_id, session_token, expires_at, ip_address))
        
        # Update last login
        db.execute("UPDATE master_admins SET last_login = NOW() WHERE id = %s", (admin_id,))
        db.commit()
        
        # Log
        log_audit(db, admin_id, email, 'LOGIN', 'ADMIN', admin_id, name, ip_address=ip_address)
        
        # Set cookie
        response.set_cookie(
            key='master_session',
            value=session_token,
            httponly=True,
            secure=True,
            samesite='lax',
            max_age=SESSION_HOURS * 3600,
            domain='.cadreport.com'
        )
        
        return {
            'status': 'ok',
            'admin': {
                'id': admin_id,
                'email': email,
                'name': name,
                'role': role
            }
        }


@router.post("/logout")
async def master_logout(request: Request, response: Response):
    """Logout master admin"""
    session_token = request.cookies.get('master_session')
    if session_token:
        with get_master_db() as db:
            db.execute("DELETE FROM master_sessions WHERE session_token = %s", (session_token,))
            db.commit()
    
    response.delete_cookie('master_session', domain='.cadreport.com')
    return {'status': 'ok'}


@router.get("/me")
async def get_current_admin_info(request: Request):
    """Get current admin info"""
    admin = await get_current_admin(request)
    return admin


# =============================================================================
# TENANT MANAGEMENT
# =============================================================================

@router.get("/tenants")
async def list_tenants(
    status: Optional[str] = None,
    request: Request = None,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """List all tenants"""
    with get_master_db() as db:
        if status:
            results = db.fetchall("""
                SELECT id, slug, name, status, contact_name, contact_email, 
                       county, state, cad_port, created_at, approved_at
                FROM tenants
                WHERE status = %s
                ORDER BY created_at DESC
            """, (status,))
        else:
            results = db.fetchall("""
                SELECT id, slug, name, status, contact_name, contact_email,
                       county, state, cad_port, created_at, approved_at
                FROM tenants
                ORDER BY created_at DESC
            """)
        
        tenants = []
        for row in results:
            tenants.append({
                'id': row[0],
                'slug': row[1],
                'name': row[2],
                'status': row[3],
                'contact_name': row[4],
                'contact_email': row[5],
                'county': row[6],
                'state': row[7],
                'cad_port': row[8],
                'created_at': row[9].isoformat() if row[9] else None,
                'approved_at': row[10].isoformat() if row[10] else None,
            })
        
        return {'tenants': tenants}


@router.get("/tenants/{tenant_id}")
async def get_tenant(
    tenant_id: int,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """Get tenant details"""
    with get_master_db() as db:
        result = db.fetchone("""
            SELECT id, slug, name, database_name, status, 
                   contact_name, contact_email, contact_phone,
                   county, state, cad_port, cad_format,
                   notes, created_at, approved_at, approved_by,
                   suspended_at, suspended_by, suspended_reason
            FROM tenants
            WHERE id = %s
        """, (tenant_id,))
        
        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        return {
            'id': result[0],
            'slug': result[1],
            'name': result[2],
            'database_name': result[3],
            'status': result[4],
            'contact_name': result[5],
            'contact_email': result[6],
            'contact_phone': result[7],
            'county': result[8],
            'state': result[9],
            'cad_port': result[10],
            'cad_format': result[11],
            'notes': result[12],
            'created_at': result[13].isoformat() if result[13] else None,
            'approved_at': result[14].isoformat() if result[14] else None,
            'approved_by': result[15],
            'suspended_at': result[16].isoformat() if result[16] else None,
            'suspended_by': result[17],
            'suspended_reason': result[18],
        }


@router.post("/tenants/{tenant_id}/approve")
async def approve_tenant(
    tenant_id: int,
    data: TenantApproveRequest,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Approve a pending tenant and provision their database"""
    with get_master_db() as db:
        # Get tenant
        result = db.fetchone("""
            SELECT id, slug, name, status, database_name
            FROM tenants WHERE id = %s
        """, (tenant_id,))
        
        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        tenant_id, slug, name, status, database_name = result
        
        if status != 'PENDING':
            raise HTTPException(status_code=400, detail=f"Tenant is not pending (status: {status})")
        
        # Assign CAD port if not provided
        cad_port = data.cad_port
        if cad_port is None:
            # Get next available port
            config = db.fetchone("SELECT value FROM system_config WHERE key = 'next_cad_port'")
            cad_port = int(config[0]) if config else 19117
            db.execute(
                "UPDATE system_config SET value = %s, updated_at = NOW() WHERE key = 'next_cad_port'",
                (str(cad_port + 1),)
            )
        
        # Update tenant
        db.execute("""
            UPDATE tenants SET
                status = 'ACTIVE',
                cad_port = %s,
                cad_format = %s,
                notes = %s,
                approved_at = NOW(),
                approved_by = %s
            WHERE id = %s
        """, (cad_port, data.cad_format, data.notes, admin['id'], tenant_id))
        db.commit()
        
        # Log
        log_audit(
            db, admin['id'], admin['email'], 'APPROVE_TENANT',
            'TENANT', tenant_id, name,
            {'cad_port': cad_port, 'cad_format': data.cad_format},
            get_client_ip(request)
        )
        
        # TODO: Provision database (run migrations, seed data)
        # For now, just return success - database provisioning would be:
        # 1. createdb runsheet_{slug}
        # 2. Run schema migrations
        # 3. Seed NERIS codes and default settings
        # 4. Create initial admin user
        
        return {
            'status': 'ok',
            'tenant_id': tenant_id,
            'slug': slug,
            'cad_port': cad_port,
            'message': f'Tenant {name} approved. Database provisioning pending.'
        }


@router.post("/tenants/{tenant_id}/suspend")
async def suspend_tenant(
    tenant_id: int,
    data: TenantSuspendRequest,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Suspend an active tenant"""
    with get_master_db() as db:
        result = db.fetchone("SELECT slug, name, status FROM tenants WHERE id = %s", (tenant_id,))
        
        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        slug, name, status = result
        
        if status == 'SUSPENDED':
            raise HTTPException(status_code=400, detail="Tenant is already suspended")
        
        db.execute("""
            UPDATE tenants SET
                status = 'SUSPENDED',
                suspended_at = NOW(),
                suspended_by = %s,
                suspended_reason = %s
            WHERE id = %s
        """, (admin['id'], data.reason, tenant_id))
        db.commit()
        
        log_audit(
            db, admin['id'], admin['email'], 'SUSPEND_TENANT',
            'TENANT', tenant_id, name,
            {'reason': data.reason},
            get_client_ip(request)
        )
        
        return {'status': 'ok', 'message': f'Tenant {name} suspended'}


@router.post("/tenants/{tenant_id}/reactivate")
async def reactivate_tenant(
    tenant_id: int,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Reactivate a suspended tenant"""
    with get_master_db() as db:
        result = db.fetchone("SELECT slug, name, status FROM tenants WHERE id = %s", (tenant_id,))
        
        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        slug, name, status = result
        
        if status != 'SUSPENDED':
            raise HTTPException(status_code=400, detail="Tenant is not suspended")
        
        db.execute("""
            UPDATE tenants SET
                status = 'ACTIVE',
                suspended_at = NULL,
                suspended_by = NULL,
                suspended_reason = NULL
            WHERE id = %s
        """, (tenant_id,))
        db.commit()
        
        log_audit(
            db, admin['id'], admin['email'], 'REACTIVATE_TENANT',
            'TENANT', tenant_id, name,
            ip_address=get_client_ip(request)
        )
        
        return {'status': 'ok', 'message': f'Tenant {name} reactivated'}


@router.post("/tenants/{tenant_id}/reject")
async def reject_tenant(
    tenant_id: int,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Reject a pending tenant signup"""
    with get_master_db() as db:
        result = db.fetchone("SELECT slug, name, status FROM tenants WHERE id = %s", (tenant_id,))
        
        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        slug, name, status = result
        
        if status != 'PENDING':
            raise HTTPException(status_code=400, detail="Can only reject pending tenants")
        
        db.execute("UPDATE tenants SET status = 'REJECTED' WHERE id = %s", (tenant_id,))
        db.commit()
        
        log_audit(
            db, admin['id'], admin['email'], 'REJECT_TENANT',
            'TENANT', tenant_id, name,
            ip_address=get_client_ip(request)
        )
        
        return {'status': 'ok', 'message': f'Tenant {name} rejected'}


@router.put("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: int,
    data: TenantUpdateRequest,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Update tenant details"""
    with get_master_db() as db:
        result = db.fetchone("SELECT slug, name FROM tenants WHERE id = %s", (tenant_id,))
        
        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        slug, old_name = result
        
        # Build update query dynamically
        updates = []
        values = []
        if data.name is not None:
            updates.append("name = %s")
            values.append(data.name)
        if data.contact_name is not None:
            updates.append("contact_name = %s")
            values.append(data.contact_name)
        if data.contact_email is not None:
            updates.append("contact_email = %s")
            values.append(data.contact_email)
        if data.contact_phone is not None:
            updates.append("contact_phone = %s")
            values.append(data.contact_phone)
        if data.county is not None:
            updates.append("county = %s")
            values.append(data.county)
        if data.notes is not None:
            updates.append("notes = %s")
            values.append(data.notes)
        
        if updates:
            values.append(tenant_id)
            db.execute(f"UPDATE tenants SET {', '.join(updates)} WHERE id = %s", tuple(values))
            db.commit()
        
        log_audit(
            db, admin['id'], admin['email'], 'UPDATE_TENANT',
            'TENANT', tenant_id, data.name or old_name,
            ip_address=get_client_ip(request)
        )
        
        return {'status': 'ok', 'message': 'Tenant updated'}


@router.post("/tenants/{tenant_id}/reset-password")
async def reset_tenant_password(
    tenant_id: int,
    data: TenantPasswordResetRequest,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Reset tenant password"""
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    with get_master_db() as db:
        result = db.fetchone("SELECT slug, name FROM tenants WHERE id = %s", (tenant_id,))
        
        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        slug, name = result
        password_hash = hash_password(data.password)
        
        db.execute("UPDATE tenants SET password_hash = %s WHERE id = %s", (password_hash, tenant_id))
        db.commit()
        
        log_audit(
            db, admin['id'], admin['email'], 'RESET_PASSWORD',
            'TENANT', tenant_id, name,
            ip_address=get_client_ip(request)
        )
        
        return {'status': 'ok', 'message': f'Password reset for {name}'}


@router.post("/tenants")
async def create_tenant(
    data: TenantCreateRequest,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Create a new tenant directly (bypassing signup request)"""
    slug = data.slug.lower().strip()
    
    # Validate slug
    if not slug.isalnum():
        raise HTTPException(status_code=400, detail="Slug must be alphanumeric")
    
    with get_master_db() as db:
        # Check if slug exists
        existing = db.fetchone("SELECT id FROM tenants WHERE slug = %s", (slug,))
        if existing:
            raise HTTPException(status_code=400, detail="Slug already exists")
        
        # Assign CAD port if not provided
        cad_port = data.cad_port
        if cad_port is None:
            config = db.fetchone("SELECT value FROM system_config WHERE key = 'next_cad_port'")
            if config:
                cad_port = int(config[0])
                db.execute(
                    "UPDATE system_config SET value = %s, updated_at = NOW() WHERE key = 'next_cad_port'",
                    (str(cad_port + 1),)
                )
            else:
                cad_port = 19118  # Start at 19118 for new tenants
                db.execute(
                    "INSERT INTO system_config (key, value) VALUES ('next_cad_port', '19119')"
                )
        
        password_hash = hash_password(data.password)
        
        db.execute("""
            INSERT INTO tenants (
                slug, name, password_hash, status, cad_port,
                contact_name, contact_email, county, state,
                approved_at, approved_by
            ) VALUES (%s, %s, %s, 'ACTIVE', %s, %s, %s, %s, %s, NOW(), %s)
        """, (
            slug, data.name, password_hash, cad_port,
            data.contact_name, data.contact_email,
            data.county, data.state, admin['id']
        ))
        db.commit()
        
        new_id = db.fetchone("SELECT id FROM tenants WHERE slug = %s", (slug,))[0]
        
        log_audit(
            db, admin['id'], admin['email'], 'CREATE_TENANT',
            'TENANT', new_id, data.name,
            {'slug': slug, 'cad_port': cad_port},
            get_client_ip(request)
        )
        
        return {
            'status': 'ok',
            'id': new_id,
            'slug': slug,
            'cad_port': cad_port
        }


# =============================================================================
# ADMIN MANAGEMENT
# =============================================================================

@router.get("/admins")
async def list_admins(
    admin: dict = Depends(require_role(['SUPER_ADMIN']))
):
    """List all master admins"""
    with get_master_db() as db:
        results = db.fetchall("""
            SELECT id, email, name, role, active, created_at, last_login
            FROM master_admins
            ORDER BY created_at DESC
        """)
        
        return {
            'admins': [{
                'id': r[0],
                'email': r[1],
                'name': r[2],
                'role': r[3],
                'active': r[4],
                'created_at': r[5].isoformat() if r[5] else None,
                'last_login': r[6].isoformat() if r[6] else None,
            } for r in results]
        }


@router.post("/admins")
async def create_admin(
    data: MasterAdminCreate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN']))
):
    """Create new master admin"""
    with get_master_db() as db:
        # Check if email exists
        existing = db.fetchone("SELECT id FROM master_admins WHERE email = %s", (data.email.lower(),))
        if existing:
            raise HTTPException(status_code=400, detail="Email already exists")
        
        password_hash = hash_password(data.password)
        
        db.execute("""
            INSERT INTO master_admins (email, password_hash, name, role)
            VALUES (%s, %s, %s, %s)
        """, (data.email.lower(), password_hash, data.name, data.role))
        db.commit()
        
        new_id = db.fetchone("SELECT id FROM master_admins WHERE email = %s", (data.email.lower(),))[0]
        
        log_audit(
            db, admin['id'], admin['email'], 'CREATE_ADMIN',
            'ADMIN', new_id, data.email,
            {'role': data.role},
            get_client_ip(request)
        )
        
        return {'status': 'ok', 'id': new_id}


# =============================================================================
# SYSTEM
# =============================================================================

@router.get("/system/stats")
async def get_system_stats(
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """Get system statistics"""
    with get_master_db() as db:
        stats = {}
        
        # Tenant counts
        result = db.fetchone("""
            SELECT 
                COUNT(*) FILTER (WHERE status = 'ACTIVE') as active,
                COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
                COUNT(*) FILTER (WHERE status = 'SUSPENDED') as suspended,
                COUNT(*) as total
            FROM tenants
        """)
        stats['tenants'] = {
            'active': result[0],
            'pending': result[1],
            'suspended': result[2],
            'total': result[3]
        }
        
        # Recent signups
        result = db.fetchall("""
            SELECT slug, name, created_at
            FROM tenants
            WHERE status = 'PENDING'
            ORDER BY created_at DESC
            LIMIT 5
        """)
        stats['pending_signups'] = [{
            'slug': r[0],
            'name': r[1],
            'created_at': r[2].isoformat() if r[2] else None
        } for r in result]
        
        return stats


@router.get("/system/config")
async def get_system_config(
    admin: dict = Depends(require_role(['SUPER_ADMIN']))
):
    """Get system configuration"""
    with get_master_db() as db:
        results = db.fetchall("SELECT key, value, updated_at FROM system_config")
        
        return {
            'config': {r[0]: {'value': r[1], 'updated_at': r[2].isoformat() if r[2] else None} for r in results}
        }


@router.put("/system/config")
async def update_system_config(
    data: SystemConfigUpdate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN']))
):
    """Update system configuration"""
    with get_master_db() as db:
        db.execute("""
            INSERT INTO system_config (key, value, updated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        """, (data.key, data.value))
        db.commit()
        
        log_audit(
            db, admin['id'], admin['email'], 'UPDATE_CONFIG',
            'SYSTEM', None, data.key,
            {'value': data.value},
            get_client_ip(request)
        )
        
        return {'status': 'ok'}


@router.get("/audit-log")
async def get_audit_log(
    limit: int = 50,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Get master audit log"""
    with get_master_db() as db:
        results = db.fetchall("""
            SELECT id, admin_email, action, target_type, target_name, details, ip_address, created_at
            FROM master_audit_log
            ORDER BY created_at DESC
            LIMIT %s
        """, (limit,))
        
        return {
            'entries': [{
                'id': r[0],
                'admin_email': r[1],
                'action': r[2],
                'target_type': r[3],
                'target_name': r[4],
                'details': r[5],
                'ip_address': r[6],
                'created_at': r[7].isoformat() if r[7] else None,
            } for r in results]
        }
