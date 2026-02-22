"""
Master Admin Router - System administration for CADReport

Handles:
- Master admin authentication
- Tenant management (approve, suspend, provision)
- System configuration
- Audit logging

Phase B: Migrated from raw psycopg2 to SQLAlchemy sessions via PgBouncer.
All master DB access uses get_master_db() context manager with text() queries.
Direct psycopg2 retained ONLY for tenant database provisioning (createdb, pg_dump, etc.)
"""

from fastapi import APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from sqlalchemy import text
from sqlalchemy.orm import Session
import secrets
import bcrypt
import subprocess
import os
import json
import logging
import tempfile
import psycopg2  # Retained for tenant DB provisioning only

from master_database import get_master_db

logger = logging.getLogger(__name__)

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
    initial_admin_name: Optional[str] = None
    initial_admin_email: Optional[str] = None


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


def log_audit(db: Session, admin_id: int, admin_email: str, action: str,
              target_type: str = None, target_id: int = None, target_name: str = None,
              details: dict = None, ip_address: str = None):
    """Log admin action to audit table"""
    details_json = json.dumps(details) if details else None
    db.execute(text("""
        INSERT INTO master_audit_log
        (admin_id, admin_email, action, target_type, target_id, target_name, details, ip_address)
        VALUES (:admin_id, :admin_email, :action, :target_type, :target_id, :target_name,
                CAST(:details AS jsonb), :ip_address)
    """), {
        "admin_id": admin_id,
        "admin_email": admin_email,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "target_name": target_name,
        "details": details_json,
        "ip_address": ip_address,
    })
    db.commit()


async def get_current_admin(request: Request) -> dict:
    """Get current admin from session cookie"""
    session_token = request.cookies.get('master_session')
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    with get_master_db() as db:
        result = db.execute(text("""
            SELECT ms.admin_id, ma.email, ma.name, ma.role
            FROM master_sessions ms
            JOIN master_admins ma ON ma.id = ms.admin_id
            WHERE ms.session_token = :token
              AND ms.expires_at > NOW()
              AND ma.active = TRUE
        """), {"token": session_token}).fetchone()

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
        result = db.execute(text("""
            SELECT id, email, password_hash, name, role, active
            FROM master_admins
            WHERE email = :email
        """), {"email": data.email.lower()}).fetchone()

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

        db.execute(text("""
            INSERT INTO master_sessions (admin_id, session_token, expires_at, ip_address)
            VALUES (:admin_id, :token, :expires_at, :ip_address)
        """), {
            "admin_id": admin_id,
            "token": session_token,
            "expires_at": expires_at,
            "ip_address": ip_address,
        })

        # Update last login
        db.execute(text("UPDATE master_admins SET last_login = NOW() WHERE id = :id"),
                   {"id": admin_id})
        db.commit()

        # Log
        log_audit(db, admin_id, email, 'LOGIN', 'ADMIN', admin_id, name, ip_address=ip_address)

        # Set cookie
        response.set_cookie(
            key='master_session',
            value=session_token,
            httponly=True,
            secure=False,  # Set True in production with HTTPS
            samesite='lax',
            max_age=SESSION_HOURS * 3600
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
            db.execute(text("DELETE FROM master_sessions WHERE session_token = :token"),
                       {"token": session_token})
            db.commit()

    response.delete_cookie('master_session')
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
            results = db.execute(text("""
                SELECT id, slug, name, status, contact_name, contact_email,
                       county, state, cad_port, created_at, approved_at
                FROM tenants
                WHERE status = :status
                ORDER BY created_at DESC
            """), {"status": status}).fetchall()
        else:
            results = db.execute(text("""
                SELECT id, slug, name, status, contact_name, contact_email,
                       county, state, cad_port, created_at, approved_at
                FROM tenants
                ORDER BY created_at DESC
            """)).fetchall()

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
        result = db.execute(text("""
            SELECT id, slug, name, database_name, status,
                   contact_name, contact_email, contact_phone,
                   county, state, cad_port, cad_format,
                   notes, created_at, approved_at, approved_by,
                   suspended_at, suspended_by, suspended_reason
            FROM tenants
            WHERE id = :id
        """), {"id": tenant_id}).fetchone()

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
        result = db.execute(text("""
            SELECT id, slug, name, status, database_name
            FROM tenants WHERE id = :id
        """), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        tenant_id, slug, name, status, database_name = result

        if status.upper() != 'PENDING':
            raise HTTPException(status_code=400, detail=f"Tenant is not pending (status: {status})")

        # Assign CAD port if not provided
        cad_port = data.cad_port
        if cad_port is None:
            config = db.execute(text(
                "SELECT value FROM system_config WHERE key = 'next_cad_port'"
            )).fetchone()
            if config and config[0] is not None:
                cad_port = int(config[0]) if not isinstance(config[0], int) else config[0]
            else:
                cad_port = 19117
            db.execute(text(
                "UPDATE system_config SET value = :val::jsonb, updated_at = NOW() WHERE key = 'next_cad_port'"
            ), {"val": str(cad_port + 1)})

        # Update tenant
        db.execute(text("""
            UPDATE tenants SET
                status = 'active',
                cad_port = :cad_port,
                cad_format = :cad_format,
                notes = :notes,
                approved_at = NOW(),
                approved_by = :approved_by
            WHERE id = :id
        """), {
            "cad_port": cad_port,
            "cad_format": data.cad_format,
            "notes": data.notes,
            "approved_by": admin['id'],
            "id": tenant_id,
        })
        db.commit()

        # Log
        log_audit(
            db, admin['id'], admin['email'], 'APPROVE_TENANT',
            'TENANT', tenant_id, name,
            {'cad_port': cad_port, 'cad_format': data.cad_format},
            get_client_ip(request)
        )

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
        result = db.execute(text(
            "SELECT slug, name, status FROM tenants WHERE id = :id"
        ), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        slug, name, status = result

        if status.upper() == 'SUSPENDED':
            raise HTTPException(status_code=400, detail="Tenant is already suspended")

        db.execute(text("""
            UPDATE tenants SET
                status = 'suspended',
                suspended_at = NOW(),
                suspended_by = :suspended_by,
                suspended_reason = :reason
            WHERE id = :id
        """), {
            "suspended_by": admin['id'],
            "reason": data.reason,
            "id": tenant_id,
        })
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
        result = db.execute(text(
            "SELECT slug, name, status FROM tenants WHERE id = :id"
        ), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        slug, name, status = result

        if status.upper() != 'SUSPENDED':
            raise HTTPException(status_code=400, detail="Tenant is not suspended")

        db.execute(text("""
            UPDATE tenants SET
                status = 'active',
                suspended_at = NULL,
                suspended_by = NULL,
                suspended_reason = NULL
            WHERE id = :id
        """), {"id": tenant_id})
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
        result = db.execute(text(
            "SELECT slug, name, status FROM tenants WHERE id = :id"
        ), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        slug, name, status = result

        if status.upper() != 'PENDING':
            raise HTTPException(status_code=400, detail="Can only reject pending tenants")

        db.execute(text("UPDATE tenants SET status = 'rejected' WHERE id = :id"),
                   {"id": tenant_id})
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
        result = db.execute(text(
            "SELECT slug, name FROM tenants WHERE id = :id"
        ), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        slug, old_name = result

        # Build update query dynamically
        updates = []
        params = {"id": tenant_id}
        if data.name is not None:
            updates.append("name = :name")
            params["name"] = data.name
        if data.contact_name is not None:
            updates.append("contact_name = :contact_name")
            params["contact_name"] = data.contact_name
        if data.contact_email is not None:
            updates.append("contact_email = :contact_email")
            params["contact_email"] = data.contact_email
        if data.contact_phone is not None:
            updates.append("contact_phone = :contact_phone")
            params["contact_phone"] = data.contact_phone
        if data.county is not None:
            updates.append("county = :county")
            params["county"] = data.county
        if data.notes is not None:
            updates.append("notes = :notes")
            params["notes"] = data.notes

        if updates:
            db.execute(text(f"UPDATE tenants SET {', '.join(updates)} WHERE id = :id"), params)
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
        result = db.execute(text(
            "SELECT slug, name FROM tenants WHERE id = :id"
        ), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        slug, name = result
        password_hash = hash_password(data.password)

        db.execute(text("UPDATE tenants SET password_hash = :hash WHERE id = :id"),
                   {"hash": password_hash, "id": tenant_id})
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
    """Create a new tenant directly (bypassing signup request) and provision database"""
    slug = data.slug.lower().strip()

    # Validate slug
    if not slug.isalnum():
        raise HTTPException(status_code=400, detail="Slug must be alphanumeric")

    with get_master_db() as db:
        # Check if slug exists
        existing = db.execute(text("SELECT id FROM tenants WHERE slug = :slug"),
                              {"slug": slug}).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Slug already exists")

        # Assign CAD port if not provided
        cad_port = data.cad_port
        if cad_port is None:
            config = db.execute(text(
                "SELECT value FROM system_config WHERE key = 'next_cad_port'"
            )).fetchone()
            if config and config[0] is not None:
                cad_port = int(config[0]) if not isinstance(config[0], int) else config[0]
                db.execute(text(
                    "UPDATE system_config SET value = :val::jsonb, updated_at = NOW() WHERE key = 'next_cad_port'"
                ), {"val": str(cad_port + 1)})
            else:
                cad_port = 19118
                db.execute(text(
                    "INSERT INTO system_config (key, value) VALUES ('next_cad_port', '19119'::jsonb)"
                ))

        password_hash = hash_password(data.password)
        db_name = f"runsheet_{slug}"

        db.execute(text("""
            INSERT INTO tenants (
                slug, name, password_hash, database_name, status, cad_port,
                contact_name, contact_email, county, state,
                approved_at, approved_by
            ) VALUES (:slug, :name, :password_hash, :db_name, 'active', :cad_port,
                      :contact_name, :contact_email, :county, :state, NOW(), :approved_by)
        """), {
            "slug": slug,
            "name": data.name,
            "password_hash": password_hash,
            "db_name": db_name,
            "cad_port": cad_port,
            "contact_name": data.contact_name,
            "contact_email": data.contact_email,
            "county": data.county,
            "state": data.state,
            "approved_by": admin['id'],
        })
        db.commit()

        new_id = db.execute(text("SELECT id FROM tenants WHERE slug = :slug"),
                            {"slug": slug}).fetchone()[0]

    # Provision the database (outside the master db context)
    initial_admin_name = data.initial_admin_name or data.contact_name
    initial_admin_email = data.initial_admin_email or data.contact_email
    provision_result = provision_tenant_database(slug, db_name, initial_admin_name, initial_admin_email)

    if not provision_result['success']:
        logger.error(f"Database provisioning failed for {slug}: {provision_result['error']}")
        with get_master_db() as db:
            log_audit(
                db, admin['id'], admin['email'], 'CREATE_TENANT',
                'TENANT', new_id, data.name,
                {'slug': slug, 'cad_port': cad_port, 'db_error': provision_result['error']},
                get_client_ip(request)
            )
        return {
            'status': 'partial',
            'id': new_id,
            'slug': slug,
            'cad_port': cad_port,
            'database_error': provision_result['error'],
            'message': f'Tenant created but database provisioning failed: {provision_result["error"]}. Use Database tab to retry.'
        }

    # Success
    with get_master_db() as db:
        log_audit(
            db, admin['id'], admin['email'], 'CREATE_TENANT',
            'TENANT', new_id, data.name,
            {'slug': slug, 'cad_port': cad_port, 'database': db_name,
             'admin': provision_result.get('admin')},
            get_client_ip(request)
        )

    return {
        'status': 'ok',
        'id': new_id,
        'slug': slug,
        'cad_port': cad_port,
        'database': db_name,
        'message': f'Tenant created with database {db_name}'
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
        results = db.execute(text("""
            SELECT id, email, name, role, active, created_at, last_login
            FROM master_admins
            ORDER BY created_at DESC
        """)).fetchall()

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
        existing = db.execute(text("SELECT id FROM master_admins WHERE email = :email"),
                              {"email": data.email.lower()}).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Email already exists")

        password_hash = hash_password(data.password)

        db.execute(text("""
            INSERT INTO master_admins (email, password_hash, name, role)
            VALUES (:email, :password_hash, :name, :role)
        """), {
            "email": data.email.lower(),
            "password_hash": password_hash,
            "name": data.name,
            "role": data.role,
        })
        db.commit()

        new_id = db.execute(text("SELECT id FROM master_admins WHERE email = :email"),
                            {"email": data.email.lower()}).fetchone()[0]

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

        result = db.execute(text("""
            SELECT
                COUNT(*) FILTER (WHERE UPPER(status) = 'ACTIVE') as active,
                COUNT(*) FILTER (WHERE UPPER(status) = 'PENDING') as pending,
                COUNT(*) FILTER (WHERE UPPER(status) = 'SUSPENDED') as suspended,
                COUNT(*) as total
            FROM tenants
        """)).fetchone()
        stats['tenants'] = {
            'active': result[0],
            'pending': result[1],
            'suspended': result[2],
            'total': result[3]
        }

        result = db.execute(text("""
            SELECT slug, name, created_at
            FROM tenants
            WHERE UPPER(status) = 'PENDING'
            ORDER BY created_at DESC
            LIMIT 5
        """)).fetchall()
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
        results = db.execute(text(
            "SELECT key, value, updated_at FROM system_config"
        )).fetchall()

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
        value_json = json.dumps(data.value)
        db.execute(text("""
            INSERT INTO system_config (key, value, updated_at)
            VALUES (:key, :value::jsonb, NOW())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        """), {"key": data.key, "value": value_json})
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
        results = db.execute(text("""
            SELECT id, admin_email, action, target_type, target_name, details, ip_address, created_at
            FROM master_audit_log
            ORDER BY created_at DESC
            LIMIT :limit
        """), {"limit": limit}).fetchall()

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


# =============================================================================
# DATABASE MANAGEMENT
# =============================================================================

BACKUP_DIR = '/opt/runsheet/backups'

# PostgreSQL tool paths (Ubuntu default)
PG_DUMP = '/usr/bin/pg_dump'
PSQL = '/usr/bin/psql'
CREATEDB = '/usr/bin/createdb'
DROPDB = '/usr/bin/dropdb'

# Database credentials for subprocess commands
DB_USER = 'dashboard'
DB_PASSWORD = 'dashboard'
DB_HOST = 'localhost'

# Template database to copy schema from
TEMPLATE_DATABASE = 'runsheet_db'


def get_pg_env():
    """Get environment with PGPASSWORD set for subprocess commands"""
    env = os.environ.copy()
    env['PGPASSWORD'] = DB_PASSWORD
    return env


def run_pg_command(cmd: list, check_success: bool = True) -> subprocess.CompletedProcess:
    """Run a PostgreSQL command with proper credentials"""
    env = get_pg_env()
    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if check_success and result.returncode != 0:
        logger.error(f"PG command failed: {' '.join(cmd)}")
        logger.error(f"stderr: {result.stderr}")
        logger.error(f"stdout: {result.stdout}")
    return result


def provision_tenant_database(slug: str, db_name: str, admin_name: str = None, admin_email: str = None) -> dict:
    """
    Provision a new tenant database by copying schema from template.

    Uses direct psycopg2 to PostgreSQL (port 5432) for DDL operations
    that are incompatible with PgBouncer transaction mode (createdb, etc.)

    Steps:
    1. Dump schema (no data) from template database
    2. Dump reference data (NERIS codes, ranks, settings) from template
    3. Create new database
    4. Apply schema
    5. Apply reference data
    6. Clear any incident/personnel data (safety)
    7. Create initial admin user (if admin_name and admin_email provided)

    Returns dict with success status and any error message.
    """
    schema_file = None
    seed_file = None

    try:
        # Ensure backup directory exists for temp files
        os.makedirs(BACKUP_DIR, exist_ok=True)

        # Step 1: Dump schema from template
        schema_file = os.path.join(BACKUP_DIR, f'.tmp_schema_{slug}.sql')

        result = run_pg_command([
            PG_DUMP, '-U', DB_USER, '-h', DB_HOST,
            '--schema-only',
            '--no-owner',
            '--no-privileges',
            '-f', schema_file,
            TEMPLATE_DATABASE
        ])

        if result.returncode != 0:
            return {'success': False, 'error': f'Schema dump failed: {result.stderr}'}

        # Step 2: Dump reference data (NERIS codes, ranks only)
        seed_file = os.path.join(BACKUP_DIR, f'.tmp_seed_{slug}.sql')

        result = run_pg_command([
            PG_DUMP, '-U', DB_USER, '-h', DB_HOST,
            '--data-only',
            '--no-owner',
            '--no-privileges',
            '--table=neris_codes',
            '--table=ranks',
            '-f', seed_file,
            TEMPLATE_DATABASE
        ])

        if result.returncode != 0:
            logger.warning(f'Seed data dump warning: {result.stderr}')

        # Step 3: Create new database
        result = run_pg_command([
            CREATEDB, '-U', DB_USER, '-h', DB_HOST, db_name
        ])

        if result.returncode != 0:
            if 'already exists' in result.stderr:
                return {'success': False, 'error': f'Database {db_name} already exists'}
            return {'success': False, 'error': f'Database creation failed: {result.stderr}'}

        # Step 4: Apply schema
        result = run_pg_command([
            PSQL, '-U', DB_USER, '-h', DB_HOST, db_name, '-f', schema_file
        ])

        if result.returncode != 0:
            run_pg_command([DROPDB, '-U', DB_USER, '-h', DB_HOST, '--if-exists', db_name], check_success=False)
            return {'success': False, 'error': f'Schema apply failed: {result.stderr}'}

        # Step 5: Apply seed data
        if os.path.exists(seed_file) and os.path.getsize(seed_file) > 0:
            result = run_pg_command([
                PSQL, '-U', DB_USER, '-h', DB_HOST, db_name, '-f', seed_file
            ])

            if result.returncode != 0:
                logger.warning(f'Seed data apply warning: {result.stderr}')

        # Step 6: Clean any leftover data and reset sequences
        cleanup_sql = """
            -- Clear any data that shouldn't be copied
            TRUNCATE incidents CASCADE;
            TRUNCATE audit_log CASCADE;
            TRUNCATE personnel CASCADE;
            TRUNCATE apparatus CASCADE;

            -- Reset sequences to 1
            DO $
            DECLARE
                seq_name TEXT;
            BEGIN
                FOR seq_name IN
                    SELECT c.relname FROM pg_class c WHERE c.relkind = 'S'
                LOOP
                    EXECUTE format('ALTER SEQUENCE %I RESTART WITH 1', seq_name);
                END LOOP;
            END $;
        """

        cleanup_result = subprocess.run(
            [PSQL, '-U', DB_USER, '-h', DB_HOST, db_name, '-c', cleanup_sql],
            capture_output=True, text=True, env=get_pg_env()
        )

        if cleanup_result.returncode != 0:
            logger.warning(f'Cleanup warning (non-fatal): {cleanup_result.stderr}')

        # Step 7: Create initial admin user
        admin_result = None
        if admin_name and admin_email:
            try:
                name_parts = admin_name.strip().split(' ', 1)
                first_name = name_parts[0]
                last_name = name_parts[1] if len(name_parts) > 1 else ''

                invite_token = secrets.token_urlsafe(32)
                expires_at = datetime.now(timezone.utc) + timedelta(hours=72)

                # Direct psycopg2 to tenant DB (not master, not PgBouncer)
                conn = psycopg2.connect(f'postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{db_name}')
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO personnel (
                        first_name, last_name, email, role, active,
                        invite_token, invite_token_expires_at,
                        approved_at, created_at, updated_at
                    ) VALUES (%s, %s, %s, 'ADMIN', TRUE, %s, %s, NOW(), NOW(), NOW())
                    RETURNING id
                """, (first_name, last_name, admin_email, invite_token, expires_at))
                personnel_id = cur.fetchone()[0]
                conn.commit()
                conn.close()

                # Send invitation email
                try:
                    from email_service import send_invitation
                    send_invitation(
                        to_email=admin_email,
                        invite_token=invite_token,
                        tenant_slug=slug,
                        tenant_name=slug,
                        user_name=first_name,
                        inviter_name='CADReport System',
                        primary_color='#1e5631',
                        logo_url=None
                    )
                except Exception as e:
                    logger.warning(f'Admin invite email failed (non-fatal): {e}')

                admin_result = {'personnel_id': personnel_id, 'email': admin_email}
                logger.info(f'Created initial admin {admin_name} for {slug}')

            except Exception as e:
                logger.error(f'Failed to create initial admin for {slug}: {e}')
                admin_result = {'error': str(e)}

        return {'success': True, 'database': db_name, 'admin': admin_result}

    except Exception as e:
        logger.exception(f'Provision failed for {slug}')
        return {'success': False, 'error': str(e)}

    finally:
        if schema_file and os.path.exists(schema_file):
            try:
                os.unlink(schema_file)
            except:
                pass
        if seed_file and os.path.exists(seed_file):
            try:
                os.unlink(seed_file)
            except:
                pass


def format_size(size_bytes):
    """Format bytes to human readable"""
    if size_bytes is None:
        return '-'
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


@router.get("/databases")
async def list_databases(
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """List all tenant databases with status"""
    with get_master_db() as db:
        tenants = db.execute(text("""
            SELECT id, slug, name, database_name, status
            FROM tenants
            WHERE UPPER(status) IN ('ACTIVE', 'PENDING', 'SUSPENDED')
            ORDER BY name
        """)).fetchall()

    databases = []
    for t in tenants:
        tenant_id, slug, name, database_name, status = t
        db_name = database_name or f"runsheet_{slug}"

        # Check if database exists and get size
        # Direct psycopg2 to PostgreSQL for pg_database_size()
        exists = False
        size = None
        try:
            conn = psycopg2.connect(f'postgresql://dashboard:dashboard@localhost/{db_name}')
            conn.close()
            exists = True

            conn = psycopg2.connect('postgresql://dashboard:dashboard@localhost/postgres')
            cur = conn.cursor()
            cur.execute("SELECT pg_database_size(%s)", (db_name,))
            size = cur.fetchone()[0]
            conn.close()
        except Exception as e:
            logger.warning(f"DB check failed for {db_name}: {e}")

        # Check last backup
        last_backup = None
        if os.path.exists(BACKUP_DIR):
            backups = [f for f in os.listdir(BACKUP_DIR) if f.startswith(f"{slug}_") and f.endswith('.sql')]
            if backups:
                backups.sort(reverse=True)
                backup_path = os.path.join(BACKUP_DIR, backups[0])
                last_backup = os.path.getmtime(backup_path) * 1000

        databases.append({
            'tenant_id': tenant_id,
            'tenant_name': name,
            'slug': slug,
            'database_name': db_name,
            'exists': exists,
            'size': format_size(size) if size else None,
            'last_backup': last_backup,
            'status': status
        })

    return {'databases': databases}


@router.get("/backups")
async def list_backups(
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """List all backup files"""
    if not os.path.exists(BACKUP_DIR):
        return {'backups': []}

    with get_master_db() as db:
        tenants = db.execute(text("SELECT id, slug, name FROM tenants")).fetchall()
    tenant_map = {t[1]: {'id': t[0], 'name': t[2]} for t in tenants}

    backups = []
    for filename in os.listdir(BACKUP_DIR):
        if not filename.endswith('.sql'):
            continue

        filepath = os.path.join(BACKUP_DIR, filename)
        stat = os.stat(filepath)

        parts = filename.rsplit('_', 2)
        slug = parts[0] if len(parts) >= 3 else filename.replace('.sql', '')
        tenant_info = tenant_map.get(slug, {'id': None, 'name': slug})

        backups.append({
            'filename': filename,
            'tenant_id': tenant_info['id'],
            'tenant_name': tenant_info['name'],
            'size': format_size(stat.st_size),
            'created_at': stat.st_mtime * 1000
        })

    backups.sort(key=lambda x: x['created_at'], reverse=True)

    return {'backups': backups[:50]}


@router.post("/tenants/{tenant_id}/provision")
async def provision_database(
    tenant_id: int,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Create database for a tenant by copying schema from template"""
    with get_master_db() as db:
        result = db.execute(text("""
            SELECT slug, name, database_name FROM tenants WHERE id = :id
        """), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        slug, name, database_name = result
        db_name = database_name or f"runsheet_{slug}"

    provision_result = provision_tenant_database(slug, db_name)

    if not provision_result['success']:
        raise HTTPException(status_code=500, detail=provision_result['error'])

    with get_master_db() as db:
        db.execute(text("UPDATE tenants SET database_name = :db_name WHERE id = :id"),
                   {"db_name": db_name, "id": tenant_id})
        db.commit()

        log_audit(
            db, admin['id'], admin['email'], 'PROVISION_DATABASE',
            'TENANT', tenant_id, name,
            {'database': db_name},
            get_client_ip(request)
        )

    return {'status': 'ok', 'database_name': db_name}


@router.post("/tenants/{tenant_id}/backup")
async def backup_database(
    tenant_id: int,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Create a backup of tenant database"""
    with get_master_db() as db:
        result = db.execute(text("""
            SELECT slug, name, database_name FROM tenants WHERE id = :id
        """), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        slug, name, database_name = result
        db_name = database_name or f"runsheet_{slug}"

    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Cannot create backup directory: {e}")

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"{slug}_{timestamp}.sql"
    filepath = os.path.join(BACKUP_DIR, filename)

    try:
        result = run_pg_command([PG_DUMP, '-U', DB_USER, '-h', DB_HOST, '-Fp', '-f', filepath, db_name])
        if result.returncode != 0:
            if os.path.exists(filepath):
                os.unlink(filepath)
            raise HTTPException(status_code=500, detail=f"Backup failed: {result.stderr}")

        if not os.path.exists(filepath):
            raise HTTPException(status_code=500, detail="Backup file was not created")

        with get_master_db() as db:
            log_audit(
                db, admin['id'], admin['email'], 'BACKUP_DATABASE',
                'TENANT', tenant_id, name,
                {'filename': filename},
                get_client_ip(request)
            )

        return {'status': 'ok', 'filename': filename}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/backups/{filename}/download")
async def download_backup(
    filename: str,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Download a backup file"""
    if '..' in filename or '/' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Backup not found")

    return FileResponse(
        filepath,
        media_type='application/sql',
        filename=filename
    )


@router.delete("/backups/{filename}")
async def delete_backup(
    filename: str,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Delete a backup file"""
    if '..' in filename or '/' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Backup not found")

    try:
        os.unlink(filepath)

        with get_master_db() as db:
            log_audit(
                db, admin['id'], admin['email'], 'DELETE_BACKUP',
                'BACKUP', None, filename,
                ip_address=get_client_ip(request)
            )

        return {'status': 'ok'}
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete backup: {e}")


class RestoreRequest(BaseModel):
    filename: str


@router.post("/tenants/{tenant_id}/restore")
async def restore_database(
    tenant_id: int,
    data: RestoreRequest,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN']))
):
    """Restore database from existing backup file"""
    with get_master_db() as db:
        result = db.execute(text("""
            SELECT slug, name, database_name FROM tenants WHERE id = :id
        """), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        slug, name, database_name = result
        db_name = database_name or f"runsheet_{slug}"

    if '..' in data.filename or '/' in data.filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = os.path.join(BACKUP_DIR, data.filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Backup file not found")

    try:
        run_pg_command([DROPDB, '-U', DB_USER, '-h', DB_HOST, '--if-exists', db_name], check_success=False)
        result = run_pg_command([CREATEDB, '-U', DB_USER, '-h', DB_HOST, db_name])
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to create database: {result.stderr}")

        result = run_pg_command([PSQL, '-U', DB_USER, '-h', DB_HOST, db_name, '-f', filepath])
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Restore failed: {result.stderr}")

        with get_master_db() as db:
            log_audit(
                db, admin['id'], admin['email'], 'RESTORE_DATABASE',
                'TENANT', tenant_id, name,
                {'filename': data.filename},
                get_client_ip(request)
            )

        return {'status': 'ok'}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SIGNUP REQUESTS MANAGEMENT
# =============================================================================

ONBOARDING_DIR = '/opt/runsheet/static/onboarding'


@router.get("/signup-requests")
async def list_signup_requests(
    status: Optional[str] = None,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """List all signup requests from landing page form"""
    with get_master_db() as db:
        if status:
            results = db.execute(text("""
                SELECT id, requested_slug, department_name, contact_name, contact_email,
                       contact_phone, county, state, notes, status, created_at,
                       reviewed_by, reviewed_at
                FROM tenant_requests
                WHERE UPPER(status) = UPPER(:status)
                ORDER BY created_at DESC
            """), {"status": status}).fetchall()
        else:
            results = db.execute(text("""
                SELECT id, requested_slug, department_name, contact_name, contact_email,
                       contact_phone, county, state, notes, status, created_at,
                       reviewed_by, reviewed_at
                FROM tenant_requests
                ORDER BY created_at DESC
            """)).fetchall()

        return {
            'requests': [{
                'id': r[0],
                'requested_slug': r[1],
                'department_name': r[2],
                'contact_name': r[3],
                'contact_email': r[4],
                'contact_phone': r[5],
                'county': r[6],
                'state': r[7],
                'notes': r[8],
                'status': r[9],
                'created_at': r[10].isoformat() if r[10] else None,
                'reviewed_by': r[11],
                'reviewed_at': r[12].isoformat() if r[12] else None,
            } for r in results]
        }


@router.get("/onboarding-documents")
async def list_onboarding_documents(
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """List available onboarding documents"""
    docs = []
    if os.path.exists(ONBOARDING_DIR):
        for filename in os.listdir(ONBOARDING_DIR):
            if filename.endswith(('.docx', '.pdf', '.doc')):
                filepath = os.path.join(ONBOARDING_DIR, filename)
                docs.append({
                    'filename': filename,
                    'size': format_size(os.path.getsize(filepath)),
                    'path': filepath
                })
    return {'documents': docs}


class SendEmailRequest(BaseModel):
    request_id: int
    subject: str
    message: str
    attachments: List[str] = []


@router.post("/signup-requests/{request_id}/send-email")
async def send_signup_response_email(
    request_id: int,
    data: SendEmailRequest,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Send email response to a signup request with optional document attachments"""
    with get_master_db() as db:
        result = db.execute(text("""
            SELECT contact_email, contact_name, department_name
            FROM tenant_requests WHERE id = :id
        """), {"id": request_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Request not found")

        contact_email, contact_name, department_name = result

    # Validate attachments exist
    attachment_paths = []
    for filename in data.attachments:
        if '..' in filename or '/' in filename:
            raise HTTPException(status_code=400, detail=f"Invalid filename: {filename}")
        filepath = os.path.join(ONBOARDING_DIR, filename)
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail=f"Document not found: {filename}")
        attachment_paths.append(filepath)

    try:
        from email_service import send_onboarding_email
        success = send_onboarding_email(
            to_email=contact_email,
            to_name=contact_name,
            subject=data.subject,
            message=data.message,
            attachments=attachment_paths
        )

        if not success:
            raise HTTPException(status_code=500, detail="Failed to send email")

        with get_master_db() as db:
            log_audit(
                db, admin['id'], admin['email'], 'SEND_ONBOARDING_EMAIL',
                'SIGNUP_REQUEST', request_id, department_name,
                {'to': contact_email, 'subject': data.subject, 'attachments': data.attachments},
                get_client_ip(request)
            )

        return {'status': 'ok', 'message': f'Email sent to {contact_email}'}

    except ImportError:
        raise HTTPException(status_code=500, detail="Email service not configured")
    except Exception as e:
        logger.error(f"Failed to send onboarding email: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/signup-requests/{request_id}/update-status")
async def update_signup_request_status(
    request_id: int,
    new_status: str,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Update status of a signup request (PENDING, CONTACTED, APPROVED, REJECTED)"""
    valid_statuses = ['PENDING', 'CONTACTED', 'APPROVED', 'REJECTED']
    if new_status.upper() not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    with get_master_db() as db:
        result = db.execute(text(
            "SELECT department_name FROM tenant_requests WHERE id = :id"
        ), {"id": request_id}).fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Request not found")

        department_name = result[0]

        db.execute(text("""
            UPDATE tenant_requests
            SET status = :status, reviewed_by = :reviewed_by, reviewed_at = NOW()
            WHERE id = :id
        """), {"status": new_status.upper(), "reviewed_by": admin['email'], "id": request_id})
        db.commit()

        log_audit(
            db, admin['id'], admin['email'], 'UPDATE_SIGNUP_STATUS',
            'SIGNUP_REQUEST', request_id, department_name,
            {'new_status': new_status},
            get_client_ip(request)
        )

    return {'status': 'ok'}


# =============================================================================
# TENANT USERS MANAGEMENT
# =============================================================================

@router.get("/tenants/{tenant_id}/users")
async def get_tenant_users(
    tenant_id: int,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT']))
):
    """Get all users for a tenant"""
    with get_master_db() as db:
        result = db.execute(text("""
            SELECT slug, name, database_name FROM tenants WHERE id = :id
        """), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        slug, name, database_name = result
        db_name = database_name or f"runsheet_{slug}"

    users = []
    try:
        # Direct psycopg2 to tenant DB
        conn = psycopg2.connect(f'postgresql://dashboard:dashboard@localhost/{db_name}')
        cur = conn.cursor()
        cur.execute("""
            SELECT id, email, name, role, active, last_login, created_at
            FROM users
            ORDER BY name
        """)
        rows = cur.fetchall()
        conn.close()

        for r in rows:
            users.append({
                'id': r[0],
                'email': r[1],
                'name': r[2],
                'role': r[3],
                'active': r[4],
                'last_login': r[5].isoformat() if r[5] else None,
                'created_at': r[6].isoformat() if r[6] else None,
            })
    except Exception as e:
        pass

    return {'users': users}


@router.post("/tenants/{tenant_id}/users/{user_id}/disable")
async def disable_tenant_user(
    tenant_id: int,
    user_id: int,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Disable a user in a tenant database"""
    with get_master_db() as db:
        result = db.execute(text("""
            SELECT slug, name, database_name FROM tenants WHERE id = :id
        """), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        slug, tenant_name, database_name = result
        db_name = database_name or f"runsheet_{slug}"

    try:
        conn = psycopg2.connect(f'postgresql://dashboard:dashboard@localhost/{db_name}')
        cur = conn.cursor()
        cur.execute("UPDATE users SET active = FALSE WHERE id = %s RETURNING email", (user_id,))
        user_email = cur.fetchone()
        conn.commit()
        conn.close()

        if not user_email:
            raise HTTPException(status_code=404, detail="User not found")

        with get_master_db() as db:
            log_audit(
                db, admin['id'], admin['email'], 'DISABLE_USER',
                'USER', user_id, user_email[0],
                {'tenant': tenant_name},
                get_client_ip(request)
            )

        return {'status': 'ok'}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/users/{user_id}/enable")
async def enable_tenant_user(
    tenant_id: int,
    user_id: int,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Enable a user in a tenant database"""
    with get_master_db() as db:
        result = db.execute(text("""
            SELECT slug, name, database_name FROM tenants WHERE id = :id
        """), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        slug, tenant_name, database_name = result
        db_name = database_name or f"runsheet_{slug}"

    try:
        conn = psycopg2.connect(f'postgresql://dashboard:dashboard@localhost/{db_name}')
        cur = conn.cursor()
        cur.execute("UPDATE users SET active = TRUE WHERE id = %s RETURNING email", (user_id,))
        user_email = cur.fetchone()
        conn.commit()
        conn.close()

        if not user_email:
            raise HTTPException(status_code=404, detail="User not found")

        with get_master_db() as db:
            log_audit(
                db, admin['id'], admin['email'], 'ENABLE_USER',
                'USER', user_id, user_email[0],
                {'tenant': tenant_name},
                get_client_ip(request)
            )

        return {'status': 'ok'}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tenants/{tenant_id}/restore-upload")
async def restore_database_upload(
    tenant_id: int,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN']))
):
    """Restore database from uploaded backup file"""
    with get_master_db() as db:
        result = db.execute(text("""
            SELECT slug, name, database_name FROM tenants WHERE id = :id
        """), {"id": tenant_id}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")

        slug, name, database_name = result
        db_name = database_name or f"runsheet_{slug}"

    form = await request.form()
    file = form.get('file')
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")

    try:
        content = await file.read()
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.sql', delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        run_pg_command([DROPDB, '-U', DB_USER, '-h', DB_HOST, '--if-exists', db_name], check_success=False)
        result = run_pg_command([CREATEDB, '-U', DB_USER, '-h', DB_HOST, db_name])
        if result.returncode != 0:
            os.unlink(tmp_path)
            raise HTTPException(status_code=500, detail=f"Failed to create database: {result.stderr}")

        result = run_pg_command([PSQL, '-U', DB_USER, '-h', DB_HOST, db_name, '-f', tmp_path])
        os.unlink(tmp_path)

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Restore failed: {result.stderr}")

        with get_master_db() as db:
            log_audit(
                db, admin['id'], admin['email'], 'RESTORE_DATABASE_UPLOAD',
                'TENANT', tenant_id, name,
                {'uploaded_file': file.filename},
                get_client_ip(request)
            )

        return {'status': 'ok'}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
