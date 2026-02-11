"""
CAD Infrastructure dashboard stats.

Single endpoint returning overview numbers for the admin dashboard:
nodes online/total, listeners active/total, messages/errors today, active parsers.

Tables: cad_server_nodes, cad_listeners, cad_parser_templates (cadreport_master)
"""

from fastapi import APIRouter, Depends
from master_database import get_master_db
from .helpers import require_role

router = APIRouter()


@router.get("/stats")
async def cad_infrastructure_stats(
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """Get overview stats for CAD infrastructure dashboard"""
    with get_master_db() as db:
        nodes = db.fetchone("""
            SELECT 
                COUNT(*) FILTER (WHERE status = 'online') as online,
                COUNT(*) as total
            FROM cad_server_nodes
        """)

        listeners = db.fetchone("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'running') as active,
                COUNT(*) as total,
                COALESCE(SUM(messages_today), 0) as messages_today,
                COALESCE(SUM(errors_today), 0) as errors_today
            FROM cad_listeners
        """)

        parsers = db.fetchone("""
            SELECT COUNT(*) FROM cad_parser_templates WHERE is_active = TRUE
        """)

        return {
            'nodes_online': nodes[0] if nodes else 0,
            'nodes_total': nodes[1] if nodes else 0,
            'listeners_active': listeners[0] if listeners else 0,
            'listeners_total': listeners[1] if listeners else 0,
            'messages_today': listeners[2] if listeners else 0,
            'errors_today': listeners[3] if listeners else 0,
            'active_parsers': parsers[0] if parsers else 0,
        }
