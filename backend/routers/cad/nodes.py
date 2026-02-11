"""
Server node management — CRUD, status, ports, bootstrap scripts.

A server node is a physical or virtual host that runs CAD listener processes.
Today: geekom mini PC at Glen Moore firehouse.
Soon: VPS for production (geekom becomes dev/backup).
Later: Multiple VPS nodes across regions.

Each node has its own port range for listener allocation, capacity limits,
and health metrics. The bootstrap-script endpoint generates a complete
startup script for all auto_start listeners on a node — this is what
restart.sh evolves into for multi-tenant multi-server operation.

Node statuses: online, offline, maintenance, draining
Node roles: primary, standby, replica, edge (for future replication topology)

Tables: cad_server_nodes (cadreport_master)
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import json
import logging

from master_database import get_master_db
from .helpers import require_role, get_client_ip, log_audit, iso, build_update

logger = logging.getLogger(__name__)
router = APIRouter()


# --- Pydantic Models ---

class ServerNodeCreate(BaseModel):
    name: str
    hostname: str
    ip_address: Optional[str] = None
    region: Optional[str] = None
    port_range_start: int = 19100
    port_range_end: int = 19300
    max_listeners: int = 50
    role: str = 'primary'
    notes: Optional[str] = None
    tags: Optional[dict] = None

class ServerNodeUpdate(BaseModel):
    name: Optional[str] = None
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    region: Optional[str] = None
    port_range_start: Optional[int] = None
    port_range_end: Optional[int] = None
    max_listeners: Optional[int] = None
    role: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[dict] = None

class ServerNodeStatusUpdate(BaseModel):
    status: str  # online, offline, maintenance, draining


VALID_ROLES = ['primary', 'standby', 'replica', 'edge']
VALID_STATUSES = ['online', 'offline', 'maintenance', 'draining']


# --- Endpoints ---

@router.get("/nodes")
async def list_nodes(
    status: Optional[str] = None,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """List all server nodes with listener counts"""
    with get_master_db() as db:
        query = """
            SELECT 
                n.id, n.name, n.hostname, n.ip_address, n.region,
                n.port_range_start, n.port_range_end, n.max_listeners,
                n.status, n.role,
                n.last_heartbeat_at, n.cpu_percent, n.memory_percent, n.disk_percent,
                n.uptime_seconds, n.tags, n.notes,
                n.created_at, n.updated_at,
                COUNT(l.id) FILTER (WHERE l.id IS NOT NULL) as listener_count,
                COUNT(l.id) FILTER (WHERE l.status = 'running') as running_count
            FROM cad_server_nodes n
            LEFT JOIN cad_listeners l ON l.server_node_id = n.id
        """
        params = []
        if status:
            query += " WHERE n.status = %s"
            params.append(status)
        query += " GROUP BY n.id ORDER BY n.name"

        results = db.fetchall(query, tuple(params)) if params else db.fetchall(query)

        return {
            'nodes': [{
                'id': r[0], 'name': r[1], 'hostname': r[2], 'ip_address': r[3],
                'region': r[4], 'port_range_start': r[5], 'port_range_end': r[6],
                'max_listeners': r[7], 'status': r[8], 'role': r[9],
                'last_heartbeat_at': iso(r[10]),
                'cpu_percent': r[11], 'memory_percent': r[12], 'disk_percent': r[13],
                'uptime_seconds': r[14], 'tags': r[15] or {}, 'notes': r[16],
                'created_at': iso(r[17]), 'updated_at': iso(r[18]),
                'listener_count': r[19], 'running_count': r[20],
            } for r in results]
        }


@router.get("/nodes/{node_id}")
async def get_node(
    node_id: int,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """Get server node details with its listeners"""
    with get_master_db() as db:
        node = db.fetchone("""
            SELECT id, name, hostname, ip_address, region,
                   port_range_start, port_range_end, max_listeners,
                   status, role, last_heartbeat_at, heartbeat_interval_seconds,
                   cpu_percent, memory_percent, disk_percent, uptime_seconds,
                   replication_source_id, replication_config,
                   agent_url, tags, ssh_config, notes,
                   created_at, updated_at
            FROM cad_server_nodes WHERE id = %s
        """, (node_id,))

        if not node:
            raise HTTPException(status_code=404, detail="Node not found")

        listeners = db.fetchall("""
            SELECT l.id, l.tenant_slug, l.inbound_type, l.port, l.status,
                   l.last_received_at, l.messages_today, l.errors_today,
                   t.name as tenant_name
            FROM cad_listeners l
            JOIN tenants t ON t.id = l.tenant_id
            WHERE l.server_node_id = %s
            ORDER BY l.tenant_slug
        """, (node_id,))

        return {
            'node': {
                'id': node[0], 'name': node[1], 'hostname': node[2], 'ip_address': node[3],
                'region': node[4], 'port_range_start': node[5], 'port_range_end': node[6],
                'max_listeners': node[7], 'status': node[8], 'role': node[9],
                'last_heartbeat_at': iso(node[10]), 'heartbeat_interval_seconds': node[11],
                'cpu_percent': node[12], 'memory_percent': node[13], 'disk_percent': node[14],
                'uptime_seconds': node[15],
                'replication_source_id': node[16], 'replication_config': node[17] or {},
                'agent_url': node[18], 'tags': node[19] or {},
                'ssh_config': node[20] or {}, 'notes': node[21],
                'created_at': iso(node[22]), 'updated_at': iso(node[23]),
            },
            'listeners': [{
                'id': l[0], 'tenant_slug': l[1], 'inbound_type': l[2], 'port': l[3],
                'status': l[4], 'last_received_at': iso(l[5]),
                'messages_today': l[6], 'errors_today': l[7], 'tenant_name': l[8],
            } for l in listeners]
        }


@router.post("/nodes")
async def create_node(
    data: ServerNodeCreate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Register a new server node"""
    if data.port_range_start >= data.port_range_end:
        raise HTTPException(status_code=400, detail="port_range_start must be less than port_range_end")
    if data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of: {VALID_ROLES}")

    with get_master_db() as db:
        existing = db.fetchone("SELECT id FROM cad_server_nodes WHERE name = %s", (data.name,))
        if existing:
            raise HTTPException(status_code=400, detail=f"Node name '{data.name}' already exists")

        db.execute("""
            INSERT INTO cad_server_nodes 
            (name, hostname, ip_address, region, port_range_start, port_range_end,
             max_listeners, role, notes, tags, status, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, 'offline', %s)
        """, (
            data.name, data.hostname, data.ip_address, data.region,
            data.port_range_start, data.port_range_end, data.max_listeners,
            data.role, data.notes, json.dumps(data.tags or {}), admin['id']
        ))
        db.commit()

        new_id = db.fetchone("SELECT id FROM cad_server_nodes WHERE name = %s", (data.name,))[0]

        log_audit(db, admin['id'], admin['email'], 'CREATE_CAD_NODE',
                  'CAD_NODE', new_id, data.name,
                  {'hostname': data.hostname, 'port_range': f"{data.port_range_start}-{data.port_range_end}"},
                  get_client_ip(request))

        return {'status': 'ok', 'id': new_id, 'name': data.name}


@router.put("/nodes/{node_id}")
async def update_node(
    node_id: int,
    data: ServerNodeUpdate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Update server node details"""
    with get_master_db() as db:
        existing = db.fetchone("SELECT name FROM cad_server_nodes WHERE id = %s", (node_id,))
        if not existing:
            raise HTTPException(status_code=404, detail="Node not found")

        if data.role and data.role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"role must be one of: {VALID_ROLES}")

        if data.port_range_start is not None and data.port_range_end is not None:
            if data.port_range_start >= data.port_range_end:
                raise HTTPException(status_code=400, detail="port_range_start must be less than port_range_end")

        set_clause, values = build_update(data, [
            'name', 'hostname', 'ip_address', 'region',
            'port_range_start', 'port_range_end', 'max_listeners',
            'role', 'notes', 'tags'
        ])

        if set_clause:
            values.append(node_id)
            db.execute(f"UPDATE cad_server_nodes SET {set_clause}, updated_at = NOW() WHERE id = %s", tuple(values))
            db.commit()

        log_audit(db, admin['id'], admin['email'], 'UPDATE_CAD_NODE',
                  'CAD_NODE', node_id, existing[0], ip_address=get_client_ip(request))

        return {'status': 'ok'}


@router.post("/nodes/{node_id}/status")
async def update_node_status(
    node_id: int,
    data: ServerNodeStatusUpdate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Update node status (online, offline, maintenance, draining)"""
    if data.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {VALID_STATUSES}")

    with get_master_db() as db:
        existing = db.fetchone("SELECT name, status FROM cad_server_nodes WHERE id = %s", (node_id,))
        if not existing:
            raise HTTPException(status_code=404, detail="Node not found")

        old_status = existing[1]
        db.execute("UPDATE cad_server_nodes SET status = %s, updated_at = NOW() WHERE id = %s",
                   (data.status, node_id))
        db.commit()

        log_audit(db, admin['id'], admin['email'], 'UPDATE_CAD_NODE_STATUS',
                  'CAD_NODE', node_id, existing[0],
                  {'old_status': old_status, 'new_status': data.status},
                  get_client_ip(request))

        return {'status': 'ok', 'old_status': old_status, 'new_status': data.status}


@router.get("/nodes/{node_id}/available-ports")
async def get_available_ports(
    node_id: int,
    limit: int = 10,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """Get next available ports on a node"""
    with get_master_db() as db:
        node = db.fetchone(
            "SELECT port_range_start, port_range_end FROM cad_server_nodes WHERE id = %s",
            (node_id,))
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")

        used = db.fetchall("""
            SELECT port FROM cad_listeners 
            WHERE server_node_id = %s AND port IS NOT NULL
            ORDER BY port
        """, (node_id,))
        used_ports = {r[0] for r in used}

        available = []
        for port in range(node[0], node[1] + 1):
            if port not in used_ports:
                available.append(port)
                if len(available) >= limit:
                    break

        return {
            'node_id': node_id,
            'port_range_start': node[0],
            'port_range_end': node[1],
            'used_count': len(used_ports),
            'total_range': node[1] - node[0],
            'available_ports': available,
        }


@router.get("/nodes/{node_id}/bootstrap-script")
async def get_bootstrap_script(
    node_id: int,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """
    Generate a bootstrap script that starts all auto_start listeners on a node.

    This is what restart.sh evolves into — instead of hardcoding one listener,
    it queries the DB and starts everything assigned to this node.

    FUTURE: The node agent will call this endpoint on boot to know what to start.
    """
    with get_master_db() as db:
        node = db.fetchone("SELECT name, hostname FROM cad_server_nodes WHERE id = %s", (node_id,))
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")

        listeners = db.fetchall("""
            SELECT l.id, l.tenant_slug, l.inbound_type, l.port, l.api_url,
                   l.timezone, l.inbound_config, pt.name as parser_name
            FROM cad_listeners l
            JOIN cad_parser_templates pt ON pt.id = l.parser_template_id
            WHERE l.server_node_id = %s AND l.auto_start = TRUE AND l.enabled = TRUE
            ORDER BY l.port
        """, (node_id,))

    lines = [
        "#!/bin/bash",
        f"# Bootstrap script for node: {node[0]} ({node[1]})",
        f"# Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"# Listeners to start: {len(listeners)}",
        "", "set -e", "",
        'CAD_DIR="/opt/runsheet/cad"',
        'PYTHON="/opt/runsheet/runsheet_env/bin/python"',
        'LOG_DIR="/opt/runsheet/cad/logs"',
        '', 'mkdir -p "$LOG_DIR"', '',
        '# Kill any existing listener processes',
        'pkill -f "cad_listener.py" 2>/dev/null || true',
        'sleep 2', '',
    ]

    if not listeners:
        lines.append('echo "No listeners configured for this node."')
        lines.append('exit 0')
    else:
        for l in listeners:
            lid, slug, itype, port, api_url, tz, config, parser = l
            if itype == 'tcp' and port:
                lines.extend([
                    f'# --- Listener #{lid}: {slug} ({parser}) ---',
                    f'echo "Starting listener for {slug} on port {port}..."',
                    f'cd "$CAD_DIR"',
                    f'nohup "$PYTHON" cad_listener.py \\',
                    f'    --port {port} \\',
                    f'    --tenant {slug} \\',
                    f'    --api-url {api_url} \\',
                    f'    --timezone {tz} \\',
                    f'    > "$LOG_DIR/{slug}.log" 2>&1 &',
                    'disown', 'sleep 1', '',
                ])
            else:
                lines.extend([
                    f'# --- Listener #{lid}: {slug} ({itype}) ---',
                    f'echo "SKIP: {slug} ({itype}) - manual start required"', '',
                ])

        lines.extend(['sleep 3', 'echo ""', 'echo "=== Listener Status ==="'])
        for l in listeners:
            if l[2] == 'tcp' and l[3]:
                lines.append(
                    f'if ss -tlnp | grep -q ":{l[3]}"; then '
                    f'echo "  ✓ {l[1]} (port {l[3]})"; '
                    f'else echo "  ✗ {l[1]} (port {l[3]}) FAILED"; fi'
                )
        lines.extend(['', 'echo "Bootstrap complete."'])

    return {
        'node_id': node_id,
        'node_name': node[0],
        'listener_count': len(listeners),
        'script': "\n".join(lines) + "\n",
    }
