"""
Database connection for RunSheet - Multi-tenant

Routes to correct database based on subdomain.
Uses FastAPI dependency injection - the correct way.
"""

from sqlalchemy import create_engine, text as sa_text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
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

# Pooled engine for master DB lookups (replaces raw psycopg2)
_master_engine = None


def _get_master_engine():
    """Get pooled engine for cadreport_master lookups."""
    global _master_engine
    if _master_engine is None:
        _master_engine = create_engine(
            "postgresql:///cadreport_master",
            pool_size=2,
            max_overflow=3,
            pool_timeout=10,
            pool_recycle=1800,
            pool_pre_ping=True,
        )
    return _master_engine


def _get_engine(db_name: str):
    """Get or create engine for a database"""
    if db_name not in _engines:
        _engines[db_name] = create_engine(
            f"postgresql:///{db_name}",
            pool_size=200,
            max_overflow=100,
            pool_timeout=30,
            pool_recycle=1800,
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


def _get_tenant_database(slug: str) -> str:
    """Look up tenant's database from master. Cached for 5 minutes."""
    now = time.time()

    # Check cache first
    if slug in _tenant_cache:
        db_name, cached_at = _tenant_cache[slug]
        if now - cached_at < _TENANT_CACHE_TTL:
            return db_name

    # Cache miss or expired — query master using pooled connection
    try:
        engine = _get_master_engine()
        with engine.connect() as conn:
            result = conn.execute(
                sa_text("SELECT database_name FROM tenants WHERE slug = :slug AND UPPER(status) = 'ACTIVE'"),
                {"slug": slug}
            ).fetchone()

        if result and result[0]:
            _tenant_cache[slug] = (result[0], now)
            return result[0]
    except Exception as e:
        logger.error(f"Tenant lookup failed for {slug}: {e}")

        # Return stale cache if available
        if slug in _tenant_cache:
            logger.warning(f"Using stale cache for tenant {slug}")
            return _tenant_cache[slug][0]

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
