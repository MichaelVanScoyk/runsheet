"""
RunSheet / CADReport - Fire Incident Reporting System
Station 48 - Glen Moore Fire Company

ARCHITECTURE NOTE — MONOLITH TODAY, SPLIT LATER
=================================================
This main.py currently runs EVERYTHING in one FastAPI process:
  - Master admin routes (/api/master/*) → cadreport_master database
  - Tenant routes (/api/incidents/*, etc.) → per-tenant databases
  - CAD infrastructure routes (/api/master/cad/*) → cadreport_master database

This works fine on the geekom (single server, all tenants local). But when
we move to a VPS for production, this file needs to SPLIT:

  Server A (VPS - production master):
    - main.py includes master routes AND tenant routes
    - Hosts cadreport_master DB + tenant DBs
    - First migration: geekom → VPS (everything moves here)

  Server B (future expansion):
    - main_tenant_only.py — NO master routes, only tenant routes
    - Hosts only its local tenant DBs
    - Connects to Server A's cadreport_master for tenant lookup on startup
    - nginx routes tenant subdomains to the correct server

  Geekom (after migration):
    - Becomes dev/backup server
    - May keep a replica of cadreport_master for disaster recovery
    - Glen Moore can fall back to geekom if VPS goes down

SPLIT CHECKLIST (when the time comes):
  1. Extract master routes into a conditional import:
     if os.environ.get('CADREPORT_ROLE') == 'master':
         from routers import master_admin, master_admin_cad, master_admin_cad_migrate
         app.include_router(...)
  2. Tenant auth middleware needs to handle remote master DB lookup
     (cache tenant→database mapping locally, refresh periodically)
  3. Create main_tenant_only.py that skips all /api/master/* routes
  4. CAD listener bootstrap script queries master DB for what to start
     (already designed for this — see master_admin_cad.py bootstrap endpoint)
  5. Update nginx to route subdomains to correct server

The cad_server_nodes / cad_listeners / cad_migrations tables in cadreport_master
are specifically designed to orchestrate this multi-server architecture.
See master_models_cad.py for the full schema.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from routers import incidents, incidents_admin, incidents_attendance, incidents_duplicate, lookups, apparatus, personnel, settings, neris_codes, admin, backup, tenant_auth, master_admin
from routers import branding, print_layout, comcat, websocket, analytics, review_tasks, analytics_v2, detail_types, test_alerts
from routers import analytics_personnel, alert_audio, tts, devices
from routers import help as help_router
from routers import location as location_router
from routers import map as map_router
from routers.reports import router as reports_router
from database import engine, Base
from master_database import MasterSessionLocal
from master_models import TenantSession, Tenant
from jwt_auth import (
    validate_access_token,
    extract_token_from_request,
    is_tenant_revoked,
    refresh_revocation_cache,
    start_revocation_refresh_task,
    LEGACY_SESSION_COOKIE,
)
from datetime import datetime, timezone
import asyncio
import logging

logger = logging.getLogger(__name__)

# Routes that don't require tenant authentication
PUBLIC_PATHS = [
    "/",
    "/health",
    "/api/tenant/login",
    "/api/tenant/logout",
    "/api/tenant/session",
    "/api/tenant/signup-request",
    "/api/tenant/refresh",
    # Master admin routes (have their own auth)
    "/api/master/login",
    "/api/master/logout",
    "/api/master/me",
    # AV alerts settings (read-only, needed by StationBell ESP32 devices)
    "/api/settings/av-alerts",
    # Branding theme (read-only, needed by TenantLogin page after logout)
    "/api/branding/theme",
]

# Path prefixes that don't require tenant auth (for dynamic routes)
PUBLIC_PATH_PREFIXES = [
    "/api/personnel/auth/validate-invite/",
    "/api/personnel/auth/accept-invite",
    "/api/personnel/auth/validate-reset/",
    "/api/personnel/auth/complete-reset",
    # AV alert sound files (needed by StationBell ESP32 devices)
    "/api/settings/av-alerts/sound/",
    # TTS audio files for StationBell devices
    "/alerts/audio/",
]


def is_internal_ip(ip: str) -> bool:
    """Check if IP is localhost or private network (CAD listener, etc.)"""
    if not ip:
        return False
    
    # Localhost
    if ip in ("127.0.0.1", "::1", "localhost"):
        return True
    
    # Private networks (RFC 1918)
    if ip.startswith("192.168."):
        return True
    if ip.startswith("10."):
        return True
    if ip.startswith("172."):
        # 172.16.0.0 - 172.31.255.255
        try:
            second_octet = int(ip.split(".")[1])
            if 16 <= second_octet <= 31:
                return True
        except:
            pass
    
    return False


def extract_tenant_slug_from_host(host: str) -> str | None:
    """
    Extract tenant slug from Host header.
    
    Examples:
        glenmoorefc.cadreport.com -> glenmoorefc
        glenmoorefc.cadreport.com:5173 -> glenmoorefc
        localhost:5173 -> None
        cadreport.com -> None
    """
    if not host:
        return None
    
    # Remove port if present
    host = host.split(':')[0].lower()
    
    # Skip localhost and IP addresses
    if host in ('localhost', '127.0.0.1') or host.replace('.', '').isdigit():
        return None
    
    # Check for subdomain pattern: {slug}.cadreport.com
    if '.cadreport.com' in host:
        parts = host.split('.')
        if len(parts) >= 3:  # subdomain.cadreport.com
            slug = parts[0]
            if slug and slug not in ('www', 'api', 'admin'):
                return slug
    
    return None


class SuspendedTenantMiddleware(BaseHTTPMiddleware):
    """
    Middleware to redirect suspended tenant subdomains to main domain.
    
    Runs BEFORE TenantAuthMiddleware to catch suspended tenants early,
    before any branding or data is served.
    """
    
    async def dispatch(self, request: Request, call_next):
        # Only check subdomains
        host = request.headers.get("host", "")
        tenant_slug = extract_tenant_slug_from_host(host)
        
        if not tenant_slug:
            # Main domain or localhost - pass through
            return await call_next(request)
        
        # Check tenant status
        from database import check_tenant_status
        status_info = check_tenant_status(tenant_slug)
        
        if status_info['exists'] and status_info['status'] != 'ACTIVE':
            # Tenant exists but is suspended/pending/etc
            # For API requests, return JSON error
            path = request.url.path
            if path.startswith("/api"):
                return JSONResponse(
                    status_code=403,
                    content={
                        "detail": f"This department is currently {status_info['status'].lower()}",
                        "status": status_info['status'],
                        "redirect": "https://cadreport.com"
                    }
                )
            # For non-API requests (page loads), redirect to main domain
            from fastapi.responses import RedirectResponse
            return RedirectResponse(
                url="https://cadreport.com?reason=suspended",
                status_code=302
            )
        
        return await call_next(request)


class TenantAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware to enforce tenant authentication on all API routes.
    
    Phase C: JWT-first authentication with legacy session fallback.
    
    1. Always identifies tenant from subdomain (for email context, etc.)
    2. For protected routes, validates JWT (no DB hit) or falls back to legacy session
    3. Allows internal requests from localhost/LAN (CAD listener, etc.) without auth
    4. Checks emergency revocation cache (refreshed every 60s)
    """
    
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        
        # Skip non-API paths entirely
        if not path.startswith("/api"):
            return await call_next(request)
        
        # Skip master admin routes (they have their own auth)
        if path.startswith("/api/master"):
            return await call_next(request)
        
        # =====================================================================
        # STEP 1: Always identify tenant from subdomain (even for public routes)
        # This ensures get_email_context() works for invite acceptance, etc.
        # =====================================================================
        host = request.headers.get("host", "")
        tenant_slug = extract_tenant_slug_from_host(host)
        
        if tenant_slug:
            db = MasterSessionLocal()
            try:
                from sqlalchemy import func
                tenant = db.query(Tenant).filter(
                    func.lower(Tenant.slug) == tenant_slug.lower()
                ).first()
                
                if tenant:
                    # Store tenant info in request state for use by routes
                    request.state.tenant = tenant
                    request.state.tenant_id = tenant.id
                    request.state.tenant_slug = tenant.slug
            finally:
                db.close()
        
        # =====================================================================
        # STEP 2: Check if this route requires authentication
        # =====================================================================
        
        # Allow public paths without auth
        if path in PUBLIC_PATHS:
            return await call_next(request)
        
        # Allow public path prefixes (invite acceptance, password reset, etc.)
        for prefix in PUBLIC_PATH_PREFIXES:
            if path.startswith(prefix):
                return await call_next(request)
        
        # Allow internal requests (CAD listener, etc.)
        client_ip = request.client.host if request.client else None
        if is_internal_ip(client_ip):
            return await call_next(request)
        
        # =====================================================================
        # STEP 3: Validate authentication — JWT first, legacy session fallback
        # =====================================================================
        
        # --- Try JWT (no DB hit) ---
        jwt_token = extract_token_from_request(request)
        if jwt_token:
            claims = validate_access_token(jwt_token)
            if claims:
                # Check emergency revocation
                if is_tenant_revoked(claims.tenant_slug):
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Tenant suspended"}
                    )
                
                # SECURITY: Validate JWT tenant matches subdomain
                if tenant_slug and claims.tenant_slug.lower() != tenant_slug.lower():
                    logger.warning(
                        f"Middleware: JWT tenant '{claims.tenant_slug}' does not match "
                        f"subdomain '{tenant_slug}' - rejecting request"
                    )
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Token does not match this department"}
                    )
                
                # Store tenant info from JWT claims (no DB needed)
                request.state.tenant_slug = claims.tenant_slug
                request.state.tenant_id = claims.tenant_id
                request.state.tenant_db = claims.tenant_db
                request.state.auth_level = claims.auth_level
                request.state.jwt_claims = claims
                
                # Store user info if user-level auth
                if claims.is_user_level:
                    request.state.user_id = claims.user_id
                    request.state.user_role = claims.role
                
                return await call_next(request)
        
        # --- Fallback: legacy session cookie (transition period) ---
        session_token = request.cookies.get(LEGACY_SESSION_COOKIE)
        if session_token:
            db = MasterSessionLocal()
            try:
                session = db.query(TenantSession).filter(
                    TenantSession.session_token == session_token
                ).first()
                
                if not session:
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Not authenticated - invalid session"}
                    )
                
                # Check expiration (if set)
                if session.expires_at and session.expires_at < datetime.now(timezone.utc):
                    db.delete(session)
                    db.commit()
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Session expired"}
                    )
                
                # Check tenant is active
                tenant = db.query(Tenant).filter(
                    Tenant.id == session.tenant_id,
                    Tenant.status == 'active'
                ).first()
                
                if not tenant:
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Tenant not found or inactive"}
                    )
                
                # SECURITY: Validate session tenant matches subdomain
                if tenant_slug and tenant.slug.lower() != tenant_slug.lower():
                    logger.warning(
                        f"Middleware: legacy session tenant '{tenant.slug}' does not match "
                        f"subdomain '{tenant_slug}' - rejecting request"
                    )
                    response = JSONResponse(
                        status_code=401,
                        content={"detail": "Session does not match this department"}
                    )
                    response.delete_cookie(LEGACY_SESSION_COOKIE)
                    return response
                
                # Update last used timestamp
                session.last_used_at = datetime.now(timezone.utc)
                db.commit()
                
                # Store tenant info in request state
                request.state.tenant = tenant
                request.state.tenant_id = tenant.id
                request.state.tenant_slug = tenant.slug
                
            finally:
                db.close()
            
            return await call_next(request)
        
        # --- No valid auth found ---
        return JSONResponse(
            status_code=401,
            content={"detail": "Not authenticated"}
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("RunSheet starting up...")
    
    # Phase C: Start JWT revocation cache refresh (every 60s)
    revocation_task = asyncio.create_task(start_revocation_refresh_task())
    
    # Phase D: Start LISTEN/NOTIFY subscriber for cross-worker WebSocket broadcasting
    from routers.websocket import start_listen_subscriber, stop_listen_subscriber, cleanup_stale_devices_on_startup
    cleanup_stale_devices_on_startup()
    listen_task = asyncio.create_task(start_listen_subscriber())
    
    yield
    
    # Shutdown
    revocation_task.cancel()
    try:
        await revocation_task
    except asyncio.CancelledError:
        pass
    
    # Phase D: Stop LISTEN subscriber
    listen_task.cancel()
    try:
        await listen_task
    except asyncio.CancelledError:
        pass
    await stop_listen_subscriber()
    
    print("RunSheet shutting down...")

app = FastAPI(
    title="RunSheet API",
    description="Fire Incident Reporting System for Station 48",
    version="1.0.0",
    lifespan=lifespan
)

# Add tenant auth middleware BEFORE CORS
# Note: Starlette processes middleware in reverse order (last added runs first)
# So SuspendedTenantMiddleware runs before TenantAuthMiddleware
app.add_middleware(TenantAuthMiddleware)
app.add_middleware(SuspendedTenantMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(incidents.router, prefix="/api/incidents", tags=["Incidents"])
app.include_router(incidents_admin.router, prefix="/api/incidents", tags=["Incidents Admin"])
app.include_router(incidents_attendance.router, prefix="/api/incidents", tags=["Incidents Attendance"])
app.include_router(incidents_duplicate.router, prefix="/api/incidents", tags=["Incidents Duplicate"])
app.include_router(lookups.router, prefix="/api/lookups", tags=["Lookups"])
app.include_router(apparatus.router, prefix="/api/apparatus", tags=["Apparatus"])
app.include_router(personnel.router, prefix="/api/personnel", tags=["Personnel"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(reports_router, prefix="/api/reports", tags=["Reports"])
app.include_router(branding.router, prefix="/api/branding", tags=["Branding"])
app.include_router(print_layout.router, prefix="/api/print-layout", tags=["Print Layout"])
app.include_router(neris_codes.router, prefix="/api/neris-codes", tags=["NERIS Codes"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(backup.router, prefix="/api/backup", tags=["Backup"])
app.include_router(tenant_auth.router, prefix="/api/tenant", tags=["Tenant Auth"])
app.include_router(master_admin.router, prefix="/api/master", tags=["Master Admin"])
app.include_router(comcat.router)  # ComCat has its own prefix: /api/comcat
app.include_router(websocket.router, tags=["WebSocket"])  # WebSocket at /ws/incidents
app.include_router(analytics.router)  # Analytics has its own prefix: /api/analytics
app.include_router(analytics_v2.router)  # Analytics V2 has its own prefix: /api/analytics/v2
app.include_router(review_tasks.router, prefix="/api/review-tasks", tags=["Review Tasks"])
app.include_router(detail_types.router, prefix="/api/detail-types", tags=["Detail Types"])
app.include_router(test_alerts.router, prefix="/api/test-alerts", tags=["Test Alerts"])
app.include_router(analytics_personnel.router)  # Personnel analytics: /api/analytics/v2/personnel
app.include_router(alert_audio.router, tags=["Alert Audio"])  # TTS audio files: /alerts/audio
app.include_router(tts.router, prefix="/api/tts", tags=["TTS"])  # TTS unit mappings: /api/tts
app.include_router(devices.router, prefix="/api/av-alerts", tags=["Devices"])  # Device management: /api/av-alerts/devices
app.include_router(help_router.router, prefix="/api/help", tags=["Help"])  # Help system: /api/help
app.include_router(location_router.router, prefix="/api/location", tags=["Location"])  # Location services: /api/location
app.include_router(map_router.router, prefix="/api/map", tags=["Map"])  # Map platform: /api/map

@app.get("/")
async def root():
    return {"status": "ok", "service": "RunSheet API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
