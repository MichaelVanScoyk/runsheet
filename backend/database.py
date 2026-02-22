"""
Database connection for RunSheet - Multi-tenant

Routes to correct database based on subdomain.
Uses FastAPI dependency injection - the correct way.

CONNECTION ROUTING (Phase B):
- All connections go through PgBouncer on port 6432
- PgBouncer handles connection pooling (transaction mode)
- SQLAlchemy uses NullPool (no app-side pooling, PgBouncer does it)
- Tenant lookup cached for 5 minutes (slug → database_name only)
"""

from sqlalchemy import create_engine, text as sa_text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from fastapi import Request
import time
import logging

logger = logging.getLogger(__name__)

Base = declarative_base()

# Cache engines and sessionmakers to avoid recreating on every request
_engines = {}
_session_factories = {}

# Tenant lookup cache: slug -> (db_name, timestamp)
_tenant_cache = {}
_TENANT_CACHE_TTL = 300  # 5 minutes

# PgBouncer base URL (port 6432)
_PGBOUNCER_BASE = "postgresql://dashboard:dashboard@localhost:6432"

# Pooled engine for master DB lookups
# NullPool: PgBouncer handles pooling, not SQLAlchemy
_master_engine = None


def _get_master_engine():
    """Get NullPool engine for cadreport_master lookups via PgBouncer."""
    global _master_engine
    if _master_engine is None:
        _master_engine = create_engine(
            f"{_PGBOUNCER_BASE}/cadreport_master",
            poolclass=NullPool,
            pool_pre_ping=True,
        )
    return _master_engine


def _get_engine(db_name: str):
    """Get or create NullPool engine for a tenant database via PgBouncer."""
    if db_name not in _engines:
        _engines[db_name] = create_engine(
            f"{_PGBOUNCER_BASE}/{db_name}",
            poolclass=NullPool,
            pool_pre_ping=True,
        )
    return _engines[db_name]


def _get_session_factory(db_name: str):
    """Get or create a cached sessionmaker for a database."""
    if db_name not in _session_factories:
        engine = _get_engine(db_name)
        _session_factories[db_name] = sessionmaker(
            autocommit=False, autoflush=False, bind=engine
        )
    return _session_factories[db_name]


class TenantNotActiveError(Exception):
    """Raised when tenant exists but is not active (suspended, pending, etc.)"""
    def __init__(self, slug: str, status: str):
        self.slug = slug
        self.status = status
        super().__init__(f"Tenant {slug} is {status}")


def _get_tenant_database(slug: str, raise_on_inactive: bool = False) -> str:
    """Look up tenant's database from master. Cached for 5 minutes.
    
    Args:
        slug: Tenant subdomain slug
        raise_on_inactive: If True, raises TenantNotActiveError for suspended/pending tenants
                          instead of falling back to default database.
    """
    now = time.time()

    # Check cache first
    if slug in _tenant_cache:
        cached_entry = _tenant_cache[slug]
        # Cache format: (db_name, timestamp) or (None, timestamp, status) for inactive
        if len(cached_entry) == 2:
            db_name, cached_at = cached_entry
            if now - cached_at < _TENANT_CACHE_TTL:
                return db_name
        elif len(cached_entry) == 3:
            _, cached_at, status = cached_entry
            if now - cached_at < _TENANT_CACHE_TTL:
                if raise_on_inactive:
                    raise TenantNotActiveError(slug, status)
                # Fall through to default

    # Cache miss or expired — query master using pooled connection
    try:
        engine = _get_master_engine()
        with engine.connect() as conn:
            # First check if tenant exists at all
            result = conn.execute(
                sa_text("SELECT database_name, status FROM tenants WHERE slug = :slug"),
                {"slug": slug}
            ).fetchone()

        if result:
            db_name, status = result[0], result[1]
            if status and status.upper() == 'ACTIVE':
                _tenant_cache[slug] = (db_name, now)
                return db_name
            else:
                # Tenant exists but not active - cache the inactive status
                _tenant_cache[slug] = (None, now, status.upper() if status else 'UNKNOWN')
                if raise_on_inactive:
                    raise TenantNotActiveError(slug, status.upper() if status else 'UNKNOWN')
    except TenantNotActiveError:
        raise
    except Exception as e:
        logger.error(f"Tenant lookup failed for {slug}: {e}")

        # Return stale cache if available
        if slug in _tenant_cache:
            cached_entry = _tenant_cache[slug]
            if len(cached_entry) == 2:
                logger.warning(f"Using stale cache for tenant {slug}")
                return cached_entry[0]

    _tenant_cache[slug] = ("runsheet_db", now)
    return "runsheet_db"


def refresh_tenant_cache(slug: str = None):
    """Force refresh tenant cache. Call after tenant config changes.
    If slug is None, clears entire cache."""
    if slug:
        _tenant_cache.pop(slug, None)
    else:
        _tenant_cache.clear()
    logger.info(f"Tenant cache cleared: {slug or 'all'}")


def _is_internal_ip(ip: str) -> bool:
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
        try:
            second_octet = int(ip.split(".")[1])
            if 16 <= second_octet <= 31:
                return True
        except:
            pass

    return False


def _extract_slug(host: str) -> str:
    """Extract tenant slug from Host header"""
    if not host:
        return "glenmoorefc"

    host = host.split(':')[0]  # Remove port

    if host.endswith('.cadreport.com'):
        slug = host.replace('.cadreport.com', '')
        if slug and slug != 'www':
            return slug

    if host.endswith('.cadreports.com'):
        slug = host.replace('.cadreports.com', '')
        if slug and slug != 'www':
            return slug

    return "glenmoorefc"  # Default


def get_db(request: Request):
    """
    FastAPI dependency - yields database session for the tenant in the request.

    Tenant is determined by:
    1. X-Tenant header (trusted only from internal IPs - CAD listener)
    2. Host header subdomain (browser requests)
    3. Default fallback (glenmoorefc)
    """
    # Check for X-Tenant header from internal IPs (CAD listener)
    x_tenant = request.headers.get('x-tenant')
    client_ip = request.client.host if request.client else None

    if x_tenant and _is_internal_ip(client_ip):
        # Trust X-Tenant from internal network
        slug = x_tenant
        logger.debug(f"Using X-Tenant header: {slug} from {client_ip}")
    else:
        # Extract from Host header (browser requests)
        slug = _extract_slug(request.headers.get('host', ''))

    db_name = _get_tenant_database(slug)

    SessionLocal = _get_session_factory(db_name)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_tenant_status(slug: str) -> dict:
    """
    Check tenant status without getting a database connection.
    Returns dict with 'exists', 'status', 'database_name' keys.
    Used by middleware to redirect suspended tenants.
    """
    try:
        engine = _get_master_engine()
        with engine.connect() as conn:
            result = conn.execute(
                sa_text("SELECT database_name, status, name FROM tenants WHERE slug = :slug"),
                {"slug": slug}
            ).fetchone()
        
        if result:
            return {
                'exists': True,
                'database_name': result[0],
                'status': result[1].upper() if result[1] else 'UNKNOWN',
                'name': result[2],
            }
        return {'exists': False, 'status': None, 'database_name': None, 'name': None}
    except Exception as e:
        logger.error(f"Tenant status check failed for {slug}: {e}")
        return {'exists': False, 'status': None, 'database_name': None, 'name': None}


def get_db_for_tenant(tenant_slug: str):
    """
    Get database session for a specific tenant by slug.

    Used by background tasks and services that don't have a request object.
    Caller is responsible for closing the session.

    Usage:
        db = next(get_db_for_tenant("glenmoorefc"))
        try:
            # use db
        finally:
            db.close()
    """
    db_name = _get_tenant_database(tenant_slug)
    SessionLocal = _get_session_factory(db_name)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Legacy: default engine for scripts/migrations that don't go through HTTP
engine = _get_engine("runsheet_db")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
