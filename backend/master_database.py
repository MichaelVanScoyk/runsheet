"""
Master Database Connection Helper

Provides connection to cadreport_master database for:
- Tenant registry
- Master admin authentication
- Cross-tenant operations

Separate from tenant database connections.
"""

import os
import psycopg2
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Master database connection string
MASTER_DATABASE_URL = os.environ.get(
    'MASTER_DATABASE_URL',
    'postgresql://dashboard:dashboard@localhost/cadreport_master'
)

# =============================================================================
# SQLALCHEMY SETUP (for models in master_models.py)
# =============================================================================

master_engine = create_engine(MASTER_DATABASE_URL, pool_pre_ping=True)
MasterSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=master_engine)
MasterBase = declarative_base()


def get_master_session():
    """FastAPI dependency for SQLAlchemy session"""
    db = MasterSessionLocal()
    try:
        yield db
    finally:
        db.close()


# =============================================================================
# RAW PSYCOPG2 HELPER (for raw SQL queries in master_admin.py)
# =============================================================================

class MasterDBSession:
    """Simple database session wrapper for master database"""
    
    def __init__(self, conn):
        self.conn = conn
        self.cursor = conn.cursor()
    
    def execute(self, query: str, params: tuple = None):
        """Execute a query"""
        self.cursor.execute(query, params)
    
    def fetchone(self, query: str = None, params: tuple = None):
        """Execute query and fetch one result"""
        if query:
            self.cursor.execute(query, params)
        return self.cursor.fetchone()
    
    def fetchall(self, query: str = None, params: tuple = None):
        """Execute query and fetch all results"""
        if query:
            self.cursor.execute(query, params)
        return self.cursor.fetchall()
    
    def commit(self):
        """Commit transaction"""
        self.conn.commit()
    
    def rollback(self):
        """Rollback transaction"""
        self.conn.rollback()
    
    def close(self):
        """Close cursor and connection"""
        self.cursor.close()
        self.conn.close()


@contextmanager
def get_master_db():
    """
    Context manager for master database connections (raw psycopg2).
    
    Usage:
        with get_master_db() as db:
            result = db.fetchone("SELECT * FROM tenants WHERE slug = %s", ('glenmoorefc',))
    """
    conn = psycopg2.connect(MASTER_DATABASE_URL)
    session = MasterDBSession(conn)
    try:
        yield session
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()


# =============================================================================
# TENANT HELPERS
# =============================================================================

def get_tenant_database_url(slug: str) -> str:
    """
    Get database URL for a specific tenant.
    
    Args:
        slug: Tenant slug (e.g., 'glenmoorefc')
    
    Returns:
        Database URL for the tenant's database
    """
    with get_master_db() as db:
        result = db.fetchone(
            "SELECT database_name FROM tenants WHERE slug = %s AND status = 'active'",
            (slug,)
        )
        
        if not result:
            return None
        
        database_name = result[0]
        
        # Parse master URL and replace database name
        parts = MASTER_DATABASE_URL.rsplit('/', 1)
        return f"{parts[0]}/{database_name}"


def get_tenant_by_slug(slug: str) -> dict:
    """
    Get tenant info by slug.
    
    Returns None if tenant not found or not active.
    """
    with get_master_db() as db:
        result = db.fetchone("""
            SELECT id, slug, name, database_name, status, cad_port
            FROM tenants
            WHERE slug = %s
        """, (slug,))
        
        if not result:
            return None
        
        return {
            'id': result[0],
            'slug': result[1],
            'name': result[2],
            'database_name': result[3],
            'status': result[4],
            'cad_port': result[5],
        }


def validate_tenant_session(session_token: str) -> dict:
    """
    Validate a tenant session token.
    
    Returns tenant and user info if valid, None otherwise.
    """
    with get_master_db() as db:
        result = db.fetchone("""
            SELECT ts.tenant_id, ts.user_id, t.slug, t.name, t.database_name, t.status
            FROM tenant_sessions ts
            JOIN tenants t ON t.id = ts.tenant_id
            WHERE ts.session_token = %s
              AND (ts.expires_at IS NULL OR ts.expires_at > NOW())
              AND t.status = 'active'
        """, (session_token,))
        
        if not result:
            return None
        
        return {
            'tenant_id': result[0],
            'user_id': result[1],
            'slug': result[2],
            'name': result[3],
            'database_name': result[4],
            'status': result[5],
        }
