"""
Listener events — read-only query for health monitoring dashboard.

Events are written by the CAD listener processes (message_received, parse_error, etc.)
and by the system (config_changed, started, stopped). This router only reads them.

Event types: started, stopped, crashed, message_received, parse_success, parse_error,
             forward_success, forward_error, api_success, api_error, config_changed, heartbeat

Severity levels: info, warn, error, critical

FUTURE: Retention policy — keep detailed events 30 days, aggregate to hourly summaries
for 1 year. Consider PostgreSQL partitioning by month.

Tables: cad_listener_events (cadreport_master)
"""

from fastapi import APIRouter, Depends
from typing import Optional

from master_database import get_master_db
from .helpers import require_role, iso

router = APIRouter()


@router.get("/events")
async def list_events(
    listener_id: Optional[int] = None,
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 50,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """Query listener events for health monitoring"""
    with get_master_db() as db:
        query = """
            SELECT e.id, e.listener_id, e.event_type, e.severity, e.message,
                   e.details, e.created_at, l.tenant_slug
            FROM cad_listener_events e
            JOIN cad_listeners l ON l.id = e.listener_id
            WHERE 1=1
        """
        params = []
        if listener_id:
            query += " AND e.listener_id = %s"
            params.append(listener_id)
        if severity:
            query += " AND e.severity = %s"
            params.append(severity)
        if event_type:
            query += " AND e.event_type = %s"
            params.append(event_type)

        query += " ORDER BY e.created_at DESC LIMIT %s"
        params.append(limit)

        results = db.fetchall(query, tuple(params))

        return {
            'events': [{
                'id': r[0], 'listener_id': r[1], 'event_type': r[2],
                'severity': r[3], 'message': r[4], 'details': r[5] or {},
                'created_at': iso(r[6]), 'tenant_slug': r[7],
            } for r in results]
        }
