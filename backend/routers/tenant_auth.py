"""
Tenant Authentication Router

Handles fire department (tenant) level authentication:
- Login with department credentials
- Logout
- Session validation
- Signup requests
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
from typing import Optional
import secrets
import bcrypt
import logging

from sqlalchemy import func
from master_database import get_master_session
from master_models import Tenant, TenantRequest, TenantSession

logger = logging.getLogger(__name__)
router = APIRouter()

SESSION_COOKIE_NAME = "tenant_session"
SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365  # 1 year


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


def verify_tenant_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


def hash_tenant_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def get_session_from_cookie(request: Request, db: Session) -> Optional[TenantSession]:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None
    
    session = db.query(TenantSession).filter(
        TenantSession.session_token == token
    ).first()
    
    if not session:
        return None
    
    if session.expires_at and session.expires_at < datetime.now(timezone.utc):
        db.delete(session)
        db.commit()
        return None
    
    return session


def get_tenant_from_session(request: Request, db: Session) -> Optional[Tenant]:
    session = get_session_from_cookie(request, db)
    if not session:
        return None
    
    tenant = db.query(Tenant).filter(
        Tenant.id == session.tenant_id,
        func.upper(Tenant.status) == 'ACTIVE'
    ).first()
    
    if tenant:
        session.last_used_at = datetime.now(timezone.utc)
        db.commit()
    
    return tenant


async def require_tenant_auth(
    request: Request,
    db: Session = Depends(get_master_session)
) -> Tenant:
    tenant = get_tenant_from_session(request, db)
    if not tenant:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return tenant


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
    
    session_token = generate_session_token()
    session = TenantSession(
        tenant_id=tenant.id,
        session_token=session_token,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        expires_at=None,
    )
    db.add(session)
    
    tenant.last_login_at = datetime.now(timezone.utc)
    db.commit()
    
    # Set cookie - no domain = this subdomain only
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        max_age=SESSION_COOKIE_MAX_AGE,
        httponly=True,
        secure=False,  # Set True in production with HTTPS
        samesite="lax",
    )
    
    logger.info(f"Tenant login: {tenant.slug}")
    
    return TenantLoginResponse(
        status="ok",
        tenant_id=tenant.id,
        slug=tenant.slug,
        name=tenant.name,
        database_name=tenant.database_name,
        timezone=tenant.timezone,
    )


@router.post("/logout")
async def tenant_logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_master_session)
):
    session = get_session_from_cookie(request, db)
    
    if session:
        db.delete(session)
        db.commit()
    
    # Delete cookie
    response.delete_cookie(SESSION_COOKIE_NAME)
    
    return {"status": "ok", "message": "Logged out"}


@router.get("/session", response_model=SessionCheckResponse)
async def check_session(
    request: Request,
    db: Session = Depends(get_master_session)
):
    tenant = get_tenant_from_session(request, db)
    
    if tenant:
        return SessionCheckResponse(
            authenticated=True,
            tenant_id=tenant.id,
            slug=tenant.slug,
            name=tenant.name,
        )
    
    return SessionCheckResponse(authenticated=False)


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
        # Don't fail the request if email fails
    
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
