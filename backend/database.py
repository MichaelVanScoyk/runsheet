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
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
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


def _extract_slug(host: str) -> str:
    """Extract tenant slug from Host header"""
    if not host:
        return "glenmoorefc"
    
    host = host.split(':')[0]  # Remove port
    
    if host.endswith('.cadreport.com'):
        slug = host.replace('.cadreport.com', '')
        if slug and slug != 'www':
            return slug
    
    return "glenmoorefc"  # Default


def get_db(request: Request):
    """FastAPI dependency - yields database session for the tenant in the request"""
    slug = _extract_slug(request.headers.get('host', ''))
    db_name = _get_tenant_database(slug)
    
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
