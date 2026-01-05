"""
RunSheet - Fire Incident Reporting System
Station 48 - Glen Moore Fire Company
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from routers import incidents, lookups, apparatus, personnel, settings, neris_codes, admin, backup, tenant_auth, master_admin
from routers import branding, print_layout, comcat, websocket, analytics
from routers.reports import router as reports_router
from database import engine, Base
from master_database import MasterSessionLocal
from master_models import TenantSession, Tenant
from datetime import datetime, timezone

# Routes that don't require tenant authentication
PUBLIC_PATHS = [
    "/",
    "/health",
    "/api/tenant/login",
    "/api/tenant/logout",
    "/api/tenant/session",
    "/api/tenant/signup-request",
    # Master admin routes (have their own auth)
    "/api/master/login",
    "/api/master/logout",
    "/api/master/me",
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


class TenantAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware to enforce tenant authentication on all API routes.
    
    Checks for valid tenant_session cookie before allowing access.
    Allows internal requests from localhost/LAN (CAD listener, etc.) without auth.
    """
    
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        
        # Allow public paths
        if path in PUBLIC_PATHS or not path.startswith("/api"):
            return await call_next(request)
        
        # Allow all master admin routes (they have their own auth)
        if path.startswith("/api/master"):
            return await call_next(request)
        
        # Allow internal requests (CAD listener, etc.)
        client_ip = request.client.host if request.client else None
        if is_internal_ip(client_ip):
            return await call_next(request)
        
        # Check for session cookie
        session_token = request.cookies.get("tenant_session")
        
        if not session_token:
            return JSONResponse(
                status_code=401,
                content={"detail": "Not authenticated - no session"}
            )
        
        # Validate session against database
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
            
            # Update last used timestamp
            session.last_used_at = datetime.now(timezone.utc)
            db.commit()
            
            # Store tenant info in request state for use by routes
            request.state.tenant = tenant
            request.state.tenant_id = tenant.id
            request.state.tenant_slug = tenant.slug
            
        finally:
            db.close()
        
        # Continue to the actual route
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("RunSheet starting up...")
    yield
    # Shutdown
    print("RunSheet shutting down...")

app = FastAPI(
    title="RunSheet API",
    description="Fire Incident Reporting System for Station 48",
    version="1.0.0",
    lifespan=lifespan
)

# Add tenant auth middleware BEFORE CORS
app.add_middleware(TenantAuthMiddleware)

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

@app.get("/")
async def root():
    return {"status": "ok", "service": "RunSheet API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
