"""
Reports Router Package

Combines all report-related routers:
- stats: Summary statistics and trends
- monthly: Monthly chiefs report
- incident: Individual incident runsheet HTML/PDF
- rollcall: Roll call attendance reports (meetings, worknights, etc.)
- admin: Administrative reports (personnel, units, incident types)
"""

from fastapi import APIRouter

from .stats import router as stats_router
from .monthly import router as monthly_router
from .incident import router as incident_router
from .rollcall import router as rollcall_router
from .admin import router as admin_router

router = APIRouter()

router.include_router(stats_router, tags=["reports-stats"])
router.include_router(monthly_router, tags=["reports-monthly"])
router.include_router(incident_router, tags=["reports-incident"])
router.include_router(rollcall_router, tags=["reports-rollcall"])
router.include_router(admin_router, prefix="/admin", tags=["reports-admin"])
