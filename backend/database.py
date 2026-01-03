"""
Database connection for RunSheet - Multi-tenant aware

Routes to correct database based on subdomain:
- glenmoorefc.cadreport.com -> runsheet_db
- gmfc2.cadreport.com -> runsheet_gmfc2
- etc.
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from fastapi import Request, HTTPException
from contextvars import ContextVar
from typing import Optional
import logging

logger = logging.getLogger(__name__)

Base = declarative_base()

# Context variable to hold current tenant's database URL
_current_db_url: ContextVar[str] = ContextVar('current_db_url', default='postgresql:///runsheet_db')

# Cache of engines per database URL
_engines = {}

# Default database (fallback)
DEFAULT_DATABASE = "runsheet_db"


def get_engine(db_url: str):
    """Get or create engine for a database URL"""
    if db_url not in _engines:
        _engines[db_url] = create_engine(
            db_url,
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_pre_ping=True,
        )
    return _engines[db_url]


def get_tenant_database(slug: str) -> Optional[str]:
    """Look up tenant's database name from master database"""
    import psycopg2
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
        return None
    except Exception as e:
        logger.error(f"Failed to look up tenant {slug}: {e}")
        return None


def extract_tenant_slug(host: str) -> Optional[str]:
    """Extract tenant slug from Host header
    
    Examples:
        glenmoorefc.cadreport.com -> glenmoorefc
        gmfc2.cadreport.com -> gmfc2
        cadreport.com -> None (main site)
        localhost:5173 -> None (dev)
    """
    if not host:
        return None
    
    # Remove port if present
    host = host.split(':')[0]
    
    # Check if it's a subdomain of cadreport.com
    if host.endswith('.cadreport.com'):
        subdomain = host.replace('.cadreport.com', '')
        if subdomain and subdomain != 'www':
            return subdomain
    
    # For local development, check for subdomain pattern
    if host.endswith('.localhost'):
        return host.replace('.localhost', '')
    
    return None


def set_tenant_db_from_request(request: Request) -> str:
    """Set the current tenant database based on request Host header"""
    host = request.headers.get('host', '')
    slug = extract_tenant_slug(host)
    
    if slug:
        db_name = get_tenant_database(slug)
        if db_name:
            db_url = f"postgresql:///{db_name}"
            _current_db_url.set(db_url)
            return db_name
        else:
            # Tenant slug in URL but not found/active in database
            logger.warning(f"Tenant not found: {slug}")
            # Fall through to default
    
    # Default to main database
    db_url = f"postgresql:///{DEFAULT_DATABASE}"
    _current_db_url.set(db_url)
    return DEFAULT_DATABASE


def get_db():
    """FastAPI dependency - yields database session for current tenant"""
    db_url = _current_db_url.get()
    engine = get_engine(db_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Legacy support - direct engine for scripts that don't go through HTTP
engine = get_engine(f"postgresql:///{DEFAULT_DATABASE}")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
