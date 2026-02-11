"""
Node heartbeat endpoint — receives health reports from node agents.

FUTURE FEATURE: A lightweight agent on each server node periodically POSTs
health metrics here. The master records last_heartbeat_at, and the health
monitor flags nodes as unresponsive if heartbeats stop.

Agent reports: CPU, memory, disk usage, uptime, and per-listener process status.
Auto-transitions node from offline to online on first heartbeat.

Authentication: Unauthenticated for now (internal network only).
FUTURE: API key per node stored in cad_server_nodes.agent_auth_config.

Tables: cad_server_nodes, cad_listeners (cadreport_master)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from master_database import get_master_db

router = APIRouter()


class HeartbeatData(BaseModel):
    """Sent by node agent to report health"""
    node_name: str
    cpu_percent: Optional[float] = None
    memory_percent: Optional[float] = None
    disk_percent: Optional[float] = None
    uptime_seconds: Optional[int] = None
    listener_statuses: Optional[dict] = None


@router.post("/heartbeat")
async def node_heartbeat(data: HeartbeatData):
    """
    Receive heartbeat from a node agent.

    FUTURE: Called by a lightweight agent running on each server node.
    """
    with get_master_db() as db:
        node = db.fetchone(
            "SELECT id FROM cad_server_nodes WHERE name = %s", (data.node_name,))
        if not node:
            raise HTTPException(status_code=404, detail=f"Unknown node: {data.node_name}")

        db.execute("""
            UPDATE cad_server_nodes SET
                last_heartbeat_at = NOW(),
                cpu_percent = COALESCE(%s, cpu_percent),
                memory_percent = COALESCE(%s, memory_percent),
                disk_percent = COALESCE(%s, disk_percent),
                uptime_seconds = COALESCE(%s, uptime_seconds),
                status = CASE WHEN status = 'offline' THEN 'online' ELSE status END,
                updated_at = NOW()
            WHERE id = %s
        """, (data.cpu_percent, data.memory_percent, data.disk_percent,
              data.uptime_seconds, node[0]))

        if data.listener_statuses:
            for lid_str, lstatus in data.listener_statuses.items():
                try:
                    lid = int(lid_str)
                    if lstatus in ('running', 'stopped', 'error'):
                        db.execute("""
                            UPDATE cad_listeners SET
                                status = %s, status_changed_at = NOW(), updated_at = NOW()
                            WHERE id = %s AND server_node_id = %s
                        """, (lstatus, lid, node[0]))
                except (ValueError, TypeError):
                    pass

        db.commit()
        return {'status': 'ok', 'node_id': node[0]}
