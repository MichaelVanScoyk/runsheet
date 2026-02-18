"""
Master Database Connection Helper

Provides connection to cadreport_master database for:
- Tenant registry
- Master admin authentication
- Cross-tenant operations

Separate from tenant database connections.

CONNECTION ROUTING (Phase B):
- All connections go through PgBouncer on port 6432
- PgBouncer handles connection pooling (transaction mode)
- SQLAlchemy uses NullPool (no app-side pooling, PgBouncer does it)
- Raw psycopg2 eliminated from master DB path
"""

import os
import logging
from contextlib import contextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool

logger = logging.getLogger(__name__)

# =============================================================================
# CONNECTION CONFIGURATION
# =============================================================================

# PgBouncer URL (port 6432) — PgBouncer handles pooling
MASTER_DATABASE_URL = os.environ.get(
    'MASTER_DATABASE_URL',
    'postgresql://dashboard:dashboard@localhost:6432/cadreport_master'
)

# Direct PostgreSQL URL (port 5432) — for operations incompatible with PgBouncer
# Used by: LISTEN/NOTIFY (Phase D), provisioning scripts
MASTER_DATABASE_URL_DIRECT = os.environ.get(
    'MASTER_DATABASE_URL_DIRECT',
    'postgresql://dashboard:dashboard@localhost:5432/cadreport_master'
)

# =============================================================================
# SQLALCHEMY SETUP
# =============================================================================

# NullPool: every .connect() gets a fresh connection from PgBouncer,
# returned to PgBouncer's pool on .close(). No app-side pool to leak.
master_engine = create_engine(
    MASTER_DATABASE_URL,
    poolclass=NullPool,
    pool_pre_ping=True,
)

MasterSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=master_engine,
)

MasterBase = declarative_base()


def get_master_session():
    """
    FastAPI dependency for SQLAlchemy session to cadreport_master.

    Usage in routes:
        @router.get("/something")
        def something(db: Session = Depends(get_master_session)):
            result = db.execute(text("SELECT ...")).fetchone()
    """
    db = MasterSessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_master_db():
    """
    Context manager for master database SQLAlchemy sessions.

    Replaces the old raw psycopg2 context manager. Returns a standard
    SQLAlchemy Session — use text() for raw SQL:

        with get_master_db() as db:
            result = db.execute(
                text("SELECT * FROM tenants WHERE slug = :slug"),
                {"slug": "glenmoorefc"}
            ).fetchone()
            db.commit()

    Auto-rollback on exception, auto-close on exit.
    """
    db = MasterSessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# =============================================================================
# TENANT HELPERS
# =============================================================================

def get_tenant_database_url(slug: str) -> str:
    """
    Get database URL for a specific tenant.

    Args:
        slug: Tenant slug (e.g., 'glenmoorefc')

    Returns:
        PgBouncer database URL for the tenant's database, or None.
    """
    with get_master_db() as db:
        result = db.execute(
            text("SELECT database_name FROM tenants WHERE slug = :slug AND UPPER(status) = 'ACTIVE'"),
            {"slug": slug}
        ).fetchone()

        if not result:
            return None

        database_name = result[0]

        # Build PgBouncer URL for tenant database
        parts = MASTER_DATABASE_URL.rsplit('/', 1)
        return f"{parts[0]}/{database_name}"


def get_tenant_by_slug(slug: str) -> dict:
    """
    Get tenant info by slug.

    Returns None if tenant not found.
    """
    with get_master_db() as db:
        result = db.execute(
            text("""
                SELECT id, slug, name, database_name, status, cad_port
                FROM tenants
                WHERE slug = :slug
            """),
            {"slug": slug}
        ).fetchone()

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
        result = db.execute(
            text("""
                SELECT ts.tenant_id, ts.user_id, t.slug, t.name, t.database_name, t.status
                FROM tenant_sessions ts
                JOIN tenants t ON t.id = ts.tenant_id
                WHERE ts.session_token = :token
                  AND (ts.expires_at IS NULL OR ts.expires_at > NOW())
                  AND UPPER(t.status) = 'ACTIVE'
            """),
            {"token": session_token}
        ).fetchone()

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
