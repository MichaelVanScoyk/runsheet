"""
RunSheet - Fire Incident Reporting System
Station 48 - Glen Moore Fire Company
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from routers import incidents, lookups, apparatus, personnel, settings, reports, neris_codes, admin, backup
from database import engine, Base

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("RunSheet starting up...")
    yield
    # Shutdown
    print("RunSheet shutting down...")

app = FastAPI(
    title="RunSheet API",
    description="Fire Incident Reporting System for Station 48",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(incidents.router, prefix="/api/incidents", tags=["Incidents"])
app.include_router(lookups.router, prefix="/api/lookups", tags=["Lookups"])
app.include_router(apparatus.router, prefix="/api/apparatus", tags=["Apparatus"])
app.include_router(personnel.router, prefix="/api/personnel", tags=["Personnel"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(neris_codes.router, prefix="/api/neris-codes", tags=["NERIS Codes"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(backup.router, prefix="/api/backup", tags=["Backup"])

@app.get("/")
async def root():
    return {"status": "ok", "service": "RunSheet API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}