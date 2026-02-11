"""
CAD Infrastructure Router Package

All routes mount under /api/master/cad/ in main.py via a single import:

    from routers.cad import router as cad_router
    app.include_router(cad_router, prefix="/api/master/cad", tags=["CAD Infra"])

DATABASE: All tables live in cadreport_master (NOT tenant databases).
DEPLOYMENT: Only loaded on servers with CADREPORT_ROLE=master.
See main.py architecture notes for the full deployment plan.
"""

from fastapi import APIRouter

from .stats import router as stats_router
from .nodes import router as nodes_router
from .parsers import router as parsers_router
from .listeners import router as listeners_router
from .forwarding import router as forwarding_router
from .alerts import router as alerts_router
from .events import router as events_router
from .heartbeat import router as heartbeat_router
from .migrations import router as migrations_router

router = APIRouter()

router.include_router(stats_router)
router.include_router(nodes_router)
router.include_router(parsers_router)
router.include_router(listeners_router)
router.include_router(forwarding_router)
router.include_router(alerts_router)
router.include_router(events_router)
router.include_router(heartbeat_router)
router.include_router(migrations_router)
