"""
JWT Authentication Module for CADReport

Phase C: Replaces per-request session database lookups with cryptographic
token validation. Zero master DB queries for 95% of requests.

Token types:
- Access token (JWT): 15-minute lifetime, contains tenant + user claims.
  Validated by signature only (CPU, no DB hit).
- Refresh token: Long-lived, stored in cadreport_master.refresh_tokens.
  Used to get new access tokens every 15 minutes (one DB hit).

Two-tier authentication:
- tenant-level: auth_level="tenant" — department shared login.
  Sufficient for StationBell, station TV, dispatch notifications.
- user-level: auth_level="user" — individual personnel login.
  Required for run sheets, editing, admin, audit trails.

Delivery:
- Browser: httpOnly cookie named "cadreport_jwt" (access) + "cadreport_refresh" (refresh)
- Mobile (future): Authorization header + secure device storage
- WebSocket: query parameter during handshake

Emergency revocation:
- In-memory set of revoked tenant slugs, refreshed from master every 60 seconds.
- Covers immediate lockout for compromised accounts / fired employees.
- Normal lockout: refresh token fails on next 15-minute cycle.

DEPENDENCIES: PyJWT (install: pip install PyJWT --break-system-packages)
"""

import os
import time
import secrets
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt  # PyJWT

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

# JWT signing key — MUST be set in production via environment variable.
# If not set, generates a random key (tokens invalidated on restart — fine for dev).
_default_secret = secrets.token_urlsafe(64)
JWT_SECRET = os.environ.get("CADREPORT_JWT_SECRET", _default_secret)
if JWT_SECRET == _default_secret:
    logger.warning(
        "JWT_SECRET not set in environment — using random key. "
        "Tokens will be invalidated on restart. "
        "Set CADREPORT_JWT_SECRET for persistent tokens."
    )

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_LIFETIME = timedelta(minutes=15)
REFRESH_TOKEN_LIFETIME = timedelta(days=30)

# Cookie names
ACCESS_COOKIE = "cadreport_jwt"
REFRESH_COOKIE = "cadreport_refresh"

# Legacy session cookie (Phase B and earlier) — checked during transition
LEGACY_SESSION_COOKIE = "tenant_session"

# =============================================================================
# TOKEN CREATION
# =============================================================================


def create_access_token(
    tenant_slug: str,
    tenant_db: str,
    auth_level: str = "tenant",
    user_id: Optional[int] = None,
    role: Optional[str] = None,
    tenant_id: Optional[int] = None,
    tenant_name: Optional[str] = None,
) -> str:
    """
    Create a signed JWT access token.

    Args:
        tenant_slug: Tenant subdomain (e.g., "glenmoorefc")
        tenant_db: Database name (e.g., "runsheet_glenmoorefc")
        auth_level: "tenant" or "user"
        user_id: Personnel ID (required for auth_level="user")
        role: User role (e.g., "OFFICER", "ADMIN", "MEMBER")
        tenant_id: Tenant ID from master DB
        tenant_name: Tenant display name

    Returns:
        Encoded JWT string
    """
    now = datetime.now(timezone.utc)

    payload = {
        "tenant_slug": tenant_slug,
        "tenant_db": tenant_db,
        "auth_level": auth_level,
        "tenant_id": tenant_id,
        "tenant_name": tenant_name,
        "iat": now,
        "exp": now + ACCESS_TOKEN_LIFETIME,
    }

    if auth_level == "user" and user_id is not None:
        payload["user_id"] = user_id
        payload["role"] = role

    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token() -> str:
    """
    Generate a cryptographically secure refresh token string.

    This is NOT a JWT — it's an opaque token stored in the database.
    The database record links it to the tenant and user.
    """
    return secrets.token_urlsafe(48)


# =============================================================================
# TOKEN VALIDATION
# =============================================================================


class TokenClaims:
    """Parsed and validated JWT claims."""

    __slots__ = (
        "tenant_slug",
        "tenant_db",
        "auth_level",
        "tenant_id",
        "tenant_name",
        "user_id",
        "role",
        "exp",
    )

    def __init__(self, payload: dict):
        self.tenant_slug = payload["tenant_slug"]
        self.tenant_db = payload["tenant_db"]
        self.auth_level = payload.get("auth_level", "tenant")
        self.tenant_id = payload.get("tenant_id")
        self.tenant_name = payload.get("tenant_name")
        self.user_id = payload.get("user_id")
        self.role = payload.get("role")
        self.exp = payload.get("exp")

    @property
    def is_user_level(self) -> bool:
        return self.auth_level == "user"

    @property
    def is_tenant_level(self) -> bool:
        return self.auth_level == "tenant"


def validate_access_token(token: str) -> Optional[TokenClaims]:
    """
    Validate a JWT access token by checking its signature and expiration.

    CPU only — no database hit.

    Returns:
        TokenClaims if valid, None if invalid/expired.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return TokenClaims(payload)
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT: {e}")
        return None


# =============================================================================
# TOKEN EXTRACTION (multi-transport)
# =============================================================================


def extract_token_from_request(request) -> Optional[str]:
    """
    Extract JWT access token from request, checking multiple transports.

    Priority order:
    1. Authorization: Bearer <token> header (mobile app)
    2. cadreport_jwt cookie (browser)

    Args:
        request: FastAPI Request or WebSocket object

    Returns:
        Token string or None
    """
    # 1. Authorization header (mobile / API clients)
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]

    # 2. Cookie (browser)
    token = request.cookies.get(ACCESS_COOKIE)
    if token:
        return token

    return None


def extract_token_from_websocket_params(websocket) -> Optional[str]:
    """
    Extract JWT from WebSocket query parameters.

    WebSocket connections pass the token as ?token=<jwt> during handshake
    because cookies may not be reliably sent on WebSocket upgrade requests
    across all browsers/devices.

    Falls back to cookie if query param not present (browser WebSockets
    typically do send cookies on upgrade).

    Args:
        websocket: FastAPI WebSocket object

    Returns:
        Token string or None
    """
    # 1. Query parameter (explicit, preferred for mobile/device connections)
    token = websocket.query_params.get("token")
    if token:
        return token

    # 2. Cookie fallback (browser WebSocket connections)
    token = websocket.cookies.get(ACCESS_COOKIE)
    if token:
        return token

    return None


# =============================================================================
# COOKIE HELPERS
# =============================================================================


def set_auth_cookies(response, access_token: str, refresh_token: str, host: str):
    """
    Set JWT access and refresh cookies on the response.

    Scoped to the specific subdomain to prevent cross-tenant leakage.

    Args:
        response: FastAPI Response object
        access_token: JWT access token string
        refresh_token: Opaque refresh token string
        host: Request Host header (for cookie domain scoping)
    """
    # Extract domain for cookie scoping
    cookie_domain = _get_cookie_domain(host)

    # Access token cookie — short-lived, httpOnly
    access_kwargs = dict(
        key=ACCESS_COOKIE,
        value=access_token,
        max_age=int(ACCESS_TOKEN_LIFETIME.total_seconds()),
        httponly=True,
        secure=True,
        samesite="lax",
    )
    if cookie_domain:
        access_kwargs["domain"] = cookie_domain

    # Refresh token cookie — long-lived, httpOnly, path-restricted to /api/tenant/refresh
    refresh_kwargs = dict(
        key=REFRESH_COOKIE,
        value=refresh_token,
        max_age=int(REFRESH_TOKEN_LIFETIME.total_seconds()),
        httponly=True,
        secure=True,
        samesite="lax",
        path="/api/tenant/refresh",
    )
    if cookie_domain:
        refresh_kwargs["domain"] = cookie_domain

    response.set_cookie(**access_kwargs)
    response.set_cookie(**refresh_kwargs)


def clear_auth_cookies(response, host: str):
    """Clear JWT and refresh cookies, plus legacy session cookie."""
    cookie_domain = _get_cookie_domain(host)

    for cookie_name in (ACCESS_COOKIE, REFRESH_COOKIE, LEGACY_SESSION_COOKIE):
        kwargs = {"key": cookie_name}
        if cookie_domain:
            kwargs["domain"] = cookie_domain
        if cookie_name == REFRESH_COOKIE:
            kwargs["path"] = "/api/tenant/refresh"
        response.delete_cookie(**kwargs)


def _get_cookie_domain(host: str) -> Optional[str]:
    """Extract cookie domain from Host header. Returns None for localhost."""
    if not host:
        return None
    host = host.split(":")[0].lower()
    if host in ("localhost", "127.0.0.1") or host.replace(".", "").isdigit():
        return None
    if ".cadreport.com" in host:
        return host
    return None


# =============================================================================
# EMERGENCY REVOCATION CACHE
# =============================================================================

# In-memory set of revoked tenant slugs.
# Refreshed from cadreport_master every 60 seconds.
# A revoked tenant's JWT still has a valid signature, but the middleware
# checks this set before allowing the request through.
_revoked_tenants: set = set()
_revoked_tenants_updated: float = 0.0
_REVOCATION_REFRESH_INTERVAL = 60  # seconds


def is_tenant_revoked(tenant_slug: str) -> bool:
    """Check if a tenant is in the revocation set."""
    return tenant_slug in _revoked_tenants


def refresh_revocation_cache():
    """
    Refresh the in-memory revocation set from cadreport_master.

    Called periodically by the middleware or a background task.
    Queries for tenants with status != 'active'.
    """
    global _revoked_tenants, _revoked_tenants_updated

    now = time.time()
    if now - _revoked_tenants_updated < _REVOCATION_REFRESH_INTERVAL:
        return  # Too soon, skip

    try:
        from master_database import get_master_db
        from sqlalchemy import text

        with get_master_db() as db:
            rows = db.execute(
                text("SELECT slug FROM tenants WHERE UPPER(status) != 'ACTIVE'")
            ).fetchall()
            _revoked_tenants = {row[0] for row in rows}
            _revoked_tenants_updated = now

            if _revoked_tenants:
                logger.info(f"Revocation cache refreshed: {len(_revoked_tenants)} revoked tenants")

    except Exception as e:
        logger.error(f"Failed to refresh revocation cache: {e}")
        # Keep stale cache rather than clearing it — fail safe


async def start_revocation_refresh_task():
    """
    Background task that refreshes the revocation cache every 60 seconds.

    Called from FastAPI lifespan startup. Runs forever in the background.
    """
    while True:
        try:
            refresh_revocation_cache()
        except Exception as e:
            logger.error(f"Revocation refresh task error: {e}")
        await asyncio.sleep(_REVOCATION_REFRESH_INTERVAL)
