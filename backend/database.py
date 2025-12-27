"""
Database connection for RunSheet
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "postgresql:///runsheet_db"

engine = create_engine(
    DATABASE_URL,
    pool_size=10,           # Base connections to keep open
    max_overflow=20,        # Additional connections when busy (30 total max)
    pool_timeout=30,        # Seconds to wait for connection before error
    pool_recycle=1800,      # Recycle connections after 30 min (prevents stale)
    pool_pre_ping=True,     # Test connections before using (handles dropped connections)
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
