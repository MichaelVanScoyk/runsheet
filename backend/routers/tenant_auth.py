"""
Tenant Authentication Router — Phase C (JWT)

Handles fire department (tenant) level authentication:
- Login: validates credentials, issues JWT access token + refresh token
- Refresh: exchanges refresh token for new access token
- Logout: revokes refresh token, clears cookies
- Session check: validates JWT (no DB hit) for frontend auth state
- Signup requests: unchanged from Phase B

Two-tier auth:
- Tenant-level (auth_level="tenant"): department shared password login
- User-level (auth_level="user"): individual personnel login (future)

Transition strategy:
- New logins get JWT cookies (cadreport_jwt + cadreport_refresh)
- Legacy session cookies (tenant_session) still work via middleware fallback
- No forced logout — existing sessions expire naturally or on next login
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
from typing import Optional
import bcrypt
import logging

from master_database import get_master_session
from master_models import Tenant, TenantRequest, TenantSession, RefreshToken
from jwt_auth import (
    create_access_token,
    create_refresh_token,
    validate_access_token,
    set_auth_cookies,
    clear_auth_cookies,
    extract_token_from_request,
    REFRESH_COOKIE,
    REFRESH_TOKEN_LIFETIME,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# REQUEST / RESPONSE MODELS
# =============================================================================


class TenantLoginRequest(BaseModel):
    slug: str
    password: str


class TenantLoginResponse(BaseModel):
    status: str
    tenant_id: int
    slug: str
    name: str
    database_name: str
    timezone: str


class TenantSignupRequest(BaseModel):
    requested_slug: str
    department_name: str
    contact_name: str
    contact_email: EmailStr
    contact_phone: Optional[str] = None
    county: Optional[str] = None
    state: str = "PA"
    notes: Optional[str] = None


class SessionCheckResponse(BaseModel):
    authenticated: bool
    tenant_id: Optional[int] = None
    slug: Optional[str] = None
    name: Optional[str] = None


# =============================================================================
# HELPERS
# =============================================================================


def verify_tenant_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


def hash_tenant_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def _extract_subdomain_slug(host: str) -> Optional[str]:
    """Extract tenant slug from Host header for session validation."""
    if not host:
        return None
    host = host.split(':')[0].lower()
    if host in ('localhost', '127.0.0.1') or host.replace('.', '').isdigit():
        return None
    if '.cadreport.com' in host:
        parts = host.split('.')
        if len(parts) >= 3:
            slug = parts[0]
            if slug and slug not in ('www', 'api', 'admin'):
                return slug
    return None


# =============================================================================
# LOGIN — Issues JWT + refresh token
# =============================================================================


@router.post("/login", response_model=TenantLoginResponse)
async def tenant_login(
    data: TenantLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_master_session)
):
    tenant = db.query(Tenant).filter(
        Tenant.slug == data.slug.lower().strip()
    ).first()

    if not tenant:
        raise HTTPException(status_code=401, detail="Invalid department or password")

    if tenant.status.upper() != 'ACTIVE':
        raise HTTPException(status_code=403, detail=f"Account is {tenant.status}")

    if not verify_tenant_password(data.password, tenant.password_hash):
        raise HTTPException(status_code=401, detail="Invalid department or password")

    # Create JWT access token
    access_token = create_access_token(
        tenant_slug=tenant.slug,
        tenant_db=tenant.database_name,
        auth_level="tenant",
        tenant_id=tenant.id,
        tenant_name=tenant.name,
    )

    # Create refresh token and store in DB
    refresh_token_str = create_refresh_token()
    refresh_record = RefreshToken(
        tenant_id=tenant.id,
        auth_level="tenant",
        token=refresh_token_str,
        expires_at=datetime.now(timezone.utc) + REFRESH_TOKEN_LIFETIME,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(refresh_record)

    # Update last login
    tenant.last_login_at = datetime.now(timezone.utc)
    db.commit()

    # Set cookies
    host = request.headers.get("host", "")
    set_auth_cookies(response, access_token, refresh_token_str, host)

    # Also clear legacy session cookie if present (clean transition)
    legacy_token = request.cookies.get("tenant_session")
    if legacy_token:
        response.delete_cookie("tenant_session")

    logger.info(f"Tenant login (JWT): {tenant.slug}")

    return TenantLoginResponse(
        status="ok",
        tenant_id=tenant.id,
        slug=tenant.slug,
        name=tenant.name,
        database_name=tenant.database_name,
        timezone=tenant.timezone,
    )


# =============================================================================
# REFRESH — Exchange refresh token for new access token
# =============================================================================


@router.post("/refresh")
async def refresh_access_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_master_session)
):
    """
    Exchange a valid refresh token for a new JWT access token.

    Called automatically by the frontend when the access token expires (401).
    One DB hit per 15-minute cycle — the only master DB query in normal flow.
    """
    refresh_token_str = request.cookies.get(REFRESH_COOKIE)
    if not refresh_token_str:
        raise HTTPException(status_code=401, detail="No refresh token")

    # Look up refresh token
    refresh_record = db.query(RefreshToken).filter(
        RefreshToken.token == refresh_token_str,
        RefreshToken.revoked_at.is_(None),
    ).first()

    if not refresh_record:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Check expiration
    if refresh_record.expires_at < datetime.now(timezone.utc):
        # Clean up expired token
        db.delete(refresh_record)
        db.commit()
        raise HTTPException(status_code=401, detail="Refresh token expired")

    # Look up tenant (confirm still active)
    tenant = db.query(Tenant).filter(
        Tenant.id == refresh_record.tenant_id,
        func.upper(Tenant.status) == 'ACTIVE',
    ).first()

    if not tenant:
        # Tenant suspended/deleted — revoke the refresh token
        refresh_record.revoked_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(status_code=401, detail="Tenant not active")

    # Issue new access token
    access_token = create_access_token(
        tenant_slug=tenant.slug,
        tenant_db=tenant.database_name,
        auth_level=refresh_record.auth_level,
        user_id=refresh_record.user_id,
        tenant_id=tenant.id,
        tenant_name=tenant.name,
    )

    # Update last_used timestamp
    refresh_record.last_used_at = datetime.now(timezone.utc)
    db.commit()

    # Set new access token cookie (refresh cookie unchanged — it's still valid)
    host = request.headers.get("host", "")
    from jwt_auth import ACCESS_COOKIE, ACCESS_TOKEN_LIFETIME
    cookie_domain = None
    host_clean = host.split(":")[0].lower()
    if ".cadreport.com" in host_clean:
        cookie_domain = host_clean

    cookie_kwargs = dict(
        key=ACCESS_COOKIE,
        value=access_token,
        max_age=int(ACCESS_TOKEN_LIFETIME.total_seconds()),
        httponly=True,
        secure=True,
        samesite="lax",
    )
    if cookie_domain:
        cookie_kwargs["domain"] = cookie_domain

    response.set_cookie(**cookie_kwargs)

    return {
        "status": "ok",
        "tenant_slug": tenant.slug,
        "auth_level": refresh_record.auth_level,
    }


# =============================================================================
# LOGOUT — Revoke refresh token, clear cookies
# =============================================================================


@router.post("/logout")
async def tenant_logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_master_session)
):
    # Revoke refresh token if present
    refresh_token_str = request.cookies.get(REFRESH_COOKIE)
    if refresh_token_str:
        refresh_record = db.query(RefreshToken).filter(
            RefreshToken.token == refresh_token_str,
        ).first()
        if refresh_record:
            refresh_record.revoked_at = datetime.now(timezone.utc)

    # Also clean up legacy session if present
    legacy_token = request.cookies.get("tenant_session")
    if legacy_token:
        legacy_session = db.query(TenantSession).filter(
            TenantSession.session_token == legacy_token
        ).first()
        if legacy_session:
            db.delete(legacy_session)

    db.commit()

    # Clear all auth cookies
    host = request.headers.get("host", "")
    clear_auth_cookies(response, host)

    return {"status": "ok", "message": "Logged out"}


# =============================================================================
# SESSION CHECK — JWT validation (no DB hit for valid tokens)
# =============================================================================


@router.get("/session", response_model=SessionCheckResponse)
async def check_session(
    request: Request,
    response: Response,
    db: Session = Depends(get_master_session)
):
    """
    Check authentication status. Used by frontend on page load.
    
    For JWT tokens: validates signature only (no DB hit).
    For legacy sessions: falls back to DB lookup (transition period).
    """
    host = request.headers.get("host", "")
    subdomain_slug = _extract_subdomain_slug(host)

    # Try JWT first
    token = extract_token_from_request(request)
    if token:
        claims = validate_access_token(token)
        if claims:
            # Verify token's tenant matches subdomain
            if subdomain_slug and claims.tenant_slug.lower() != subdomain_slug.lower():
                logger.warning(
                    f"JWT tenant mismatch: token={claims.tenant_slug} subdomain={subdomain_slug}"
                )
                clear_auth_cookies(response, host)
                return SessionCheckResponse(authenticated=False)

            return SessionCheckResponse(
                authenticated=True,
                tenant_id=claims.tenant_id,
                slug=claims.tenant_slug,
                name=claims.tenant_name,
            )

    # Fallback: try legacy session cookie (transition period)
    legacy_token = request.cookies.get("tenant_session")
    if legacy_token:
        session = db.query(TenantSession).filter(
            TenantSession.session_token == legacy_token
        ).first()

        if session:
            # Check expiration
            if session.expires_at and session.expires_at < datetime.now(timezone.utc):
                db.delete(session)
                db.commit()
                return SessionCheckResponse(authenticated=False)

            tenant = db.query(Tenant).filter(
                Tenant.id == session.tenant_id,
                func.upper(Tenant.status) == 'ACTIVE'
            ).first()

            if tenant:
                # Verify tenant matches subdomain
                if subdomain_slug and tenant.slug.lower() != subdomain_slug.lower():
                    logger.warning(
                        f"Legacy session tenant mismatch: session={tenant.slug} subdomain={subdomain_slug}"
                    )
                    response.delete_cookie("tenant_session")
                    return SessionCheckResponse(authenticated=False)

                session.last_used_at = datetime.now(timezone.utc)
                db.commit()

                return SessionCheckResponse(
                    authenticated=True,
                    tenant_id=tenant.id,
                    slug=tenant.slug,
                    name=tenant.name,
                )

    return SessionCheckResponse(authenticated=False)


# =============================================================================
# SIGNUP REQUESTS — Unchanged from Phase B
# =============================================================================


@router.post("/signup-request")
async def submit_signup_request(
    data: TenantSignupRequest,
    db: Session = Depends(get_master_session)
):
    slug = data.requested_slug.lower().strip()

    if not slug.isalnum() or len(slug) < 3 or len(slug) > 50:
        raise HTTPException(status_code=400, detail="Subdomain must be 3-50 alphanumeric characters")

    existing = db.query(Tenant).filter(Tenant.slug == slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="This subdomain is already taken")

    pending = db.query(TenantRequest).filter(
        TenantRequest.requested_slug == slug,
        func.upper(TenantRequest.status) == 'PENDING'
    ).first()
    if pending:
        raise HTTPException(status_code=400, detail="A request for this subdomain is already pending")

    tenant_request = TenantRequest(
        requested_slug=slug,
        department_name=data.department_name.strip(),
        contact_name=data.contact_name.strip(),
        contact_email=data.contact_email.lower().strip(),
        contact_phone=data.contact_phone,
        county=data.county,
        state=data.state,
        notes=data.notes,
        status='PENDING',
    )
    db.add(tenant_request)
    db.commit()

    logger.info(f"New tenant request: {slug} - {data.department_name}")

    # Send notification email to admin
    try:
        from email_service import send_lead_notification
        send_lead_notification(
            department_name=data.department_name,
            requested_slug=slug,
            contact_name=data.contact_name,
            contact_email=data.contact_email,
            contact_phone=data.contact_phone,
            county=data.county,
            state=data.state
        )
    except Exception as e:
        logger.error(f"Failed to send lead notification email: {e}")

    return {
        "status": "ok",
        "message": "Request submitted. You will be contacted once approved.",
        "request_id": tenant_request.id,
    }


@router.get("/requests")
async def list_tenant_requests(
    status: Optional[str] = None,
    db: Session = Depends(get_master_session)
):
    query = db.query(TenantRequest).order_by(TenantRequest.created_at.desc())

    if status:
        query = query.filter(TenantRequest.status == status)

    requests = query.all()

    return [
        {
            "id": r.id,
            "requested_slug": r.requested_slug,
            "department_name": r.department_name,
            "contact_name": r.contact_name,
            "contact_email": r.contact_email,
            "contact_phone": r.contact_phone,
            "county": r.county,
            "state": r.state,
            "notes": r.notes,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in requests
    ]


@router.post("/requests/{request_id}/approve")
async def approve_tenant_request(
    request_id: int,
    initial_password: str,
    admin_name: str = "System",
    db: Session = Depends(get_master_session)
):
    tenant_request = db.query(TenantRequest).filter(
        TenantRequest.id == request_id
    ).first()

    if not tenant_request:
        raise HTTPException(status_code=404, detail="Request not found")

    if tenant_request.status.upper() != 'PENDING':
        raise HTTPException(status_code=400, detail=f"Request is already {tenant_request.status}")

    database_name = f"runsheet_{tenant_request.requested_slug}"

    tenant = Tenant(
        slug=tenant_request.requested_slug,
        name=tenant_request.department_name,
        password_hash=hash_tenant_password(initial_password),
        database_name=database_name,
        admin_email=tenant_request.contact_email,
        admin_name=tenant_request.contact_name,
        status='ACTIVE',
    )
    db.add(tenant)
    db.flush()

    tenant_request.status = 'APPROVED'
    tenant_request.reviewed_by = admin_name
    tenant_request.reviewed_at = datetime.now(timezone.utc)
    tenant_request.tenant_id = tenant.id

    db.commit()

    logger.info(f"Tenant approved: {tenant.slug}")

    return {
        "status": "ok",
        "message": f"Tenant {tenant.slug} created",
        "tenant_id": tenant.id,
        "database_name": database_name,
    }


@router.post("/requests/{request_id}/reject")
async def reject_tenant_request(
    request_id: int,
    reason: str,
    admin_name: str = "System",
    db: Session = Depends(get_master_session)
):
    tenant_request = db.query(TenantRequest).filter(
        TenantRequest.id == request_id
    ).first()

    if not tenant_request:
        raise HTTPException(status_code=404, detail="Request not found")

    if tenant_request.status.upper() != 'PENDING':
        raise HTTPException(status_code=400, detail=f"Request is already {tenant_request.status}")

    tenant_request.status = 'REJECTED'
    tenant_request.reviewed_by = admin_name
    tenant_request.reviewed_at = datetime.now(timezone.utc)
    tenant_request.rejection_reason = reason

    db.commit()

    return {"status": "ok", "message": "Request rejected"}
