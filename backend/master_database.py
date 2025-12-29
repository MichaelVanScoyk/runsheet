"""
Master Database Connection for CADReport Multi-Tenant System

This connects to cadreport_master which stores:
- Tenant registry (fire departments)
- Tenant authentication
- Signup requests

Separate from tenant data databases (runsheet_glenmoorefc, etc.)
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Master database URL - stores tenant registry
# In production, load from environment variable
MASTER_DATABASE_URL = os.getenv(
    "MASTER_DATABASE_URL", 
    "postgresql:///cadreport_master"
)

master_engine = create_engine(
    MASTER_DATABASE_URL,
    pool_size=3,
    max_overflow=5,
    pool_timeout=30,
    pool_pre_ping=True,
)

MasterSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=master_engine)
MasterBase = declarative_base()


def get_master_db():
    """Dependency for master database session."""
    db = MasterSessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_database_url(database_name: str) -> str:
    """
    Generate database URL for a specific tenant.
    
    Args:
        database_name: Name of tenant's database (e.g., "runsheet_glenmoorefc")
    
    Returns:
        PostgreSQL connection URL
    """
    # In production, this might include host/port/credentials from env
    base_url = os.getenv("TENANT_DATABASE_BASE_URL", "postgresql:///")
    return f"{base_url}{database_name}"
