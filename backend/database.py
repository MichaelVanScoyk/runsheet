"""
Database connection for RunSheet - Multi-tenant

Routes to correct database based on subdomain.
Uses FastAPI dependency injection - the correct way.
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from fastapi import Request
import psycopg2
import logging

logger = logging.getLogger(__name__)

Base = declarative_base()

# Cache engines to avoid recreating connections
_engines = {}


def _get_engine(db_name: str):
    """Get or create engine for a database"""
    if db_name not in _engines:
        _engines[db_name] = create_engine(
            f"postgresql:///{db_name}",
            pool_size=20,
            max_overflow=30,
            pool_timeout=30,
            pool_recycle=1800,  # Recycle connections after 30 min
            pool_pre_ping=True,
        )
    return _engines[db_name]


def _get_tenant_database(slug: str) -> str:
    """Look up tenant's database from master. Returns database name or default."""
    try:
        conn = psycopg2.connect('postgresql:///cadreport_master')
        cur = conn.cursor()
        cur.execute(
            "SELECT database_name FROM tenants WHERE slug = %s AND UPPER(status) = 'ACTIVE'",
            (slug,)
        )
        result = cur.fetchone()
        conn.close()
        
        if result and result[0]:
            return result[0]
    except Exception as e:
        logger.error(f"Tenant lookup failed for {slug}: {e}")
    
    return "runsheet_db"  # Default fallback


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
    
    engine = _get_engine(db_name)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
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
    engine = _get_engine(db_name)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Legacy: default engine for scripts/migrations that don't go through HTTP
engine = _get_engine("runsheet_db")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
