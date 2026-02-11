"""
CAD listener management — CRUD, auto port assignment, launch commands.

Each tenant gets a dedicated listener that receives CAD data from their dispatch center.
The listener config stored here contains EVERYTHING needed to launch the process —
any server can be reconstructed entirely from the master DB.

Inbound types: tcp (Chester County), email, webhook, sftp, api_poll, file_watch
Port assignment: Auto-assigns next available port in node's range for TCP listeners.
Launch commands: Generates exact shell command to start a specific listener.

Key constraints:
  - One listener per tenant per node (UNIQUE tenant_id + server_node_id)
  - One port per listener per node (UNIQUE server_node_id + port)
  - Node capacity enforced (max_listeners on cad_server_nodes)
  - Node must not be 'draining' to accept new listeners

Tables: cad_listeners (cadreport_master)
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
import json
import logging

from master_database import get_master_db
from .helpers import require_role, get_client_ip, log_audit, iso, build_update

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_INBOUND_TYPES = ['tcp', 'email', 'webhook', 'sftp', 'api_poll', 'file_watch']


# --- Pydantic Models ---

class ListenerCreate(BaseModel):
    tenant_id: int
    server_node_id: int
    parser_template_id: int
    inbound_type: str
    inbound_config: dict = {}
    port: Optional[int] = None
    api_url: str
    tenant_slug: str
    timezone: str = 'America/New_York'
    auto_start: bool = True
    notes: Optional[str] = None

class ListenerUpdate(BaseModel):
    parser_template_id: Optional[int] = None
    inbound_config: Optional[dict] = None
    api_url: Optional[str] = None
    timezone: Optional[str] = None
    auto_start: Optional[bool] = None
    enabled: Optional[bool] = None
    notes: Optional[str] = None
    raw_data_retention_days: Optional[int] = None


# --- Endpoints ---

@router.get("/listeners")
async def list_listeners(
    node_id: Optional[int] = None,
    status: Optional[str] = None,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """List all CAD listeners with tenant, node, and forwarding info"""
    with get_master_db() as db:
        query = """
            SELECT 
                l.id, l.tenant_id, l.tenant_slug, l.server_node_id, l.parser_template_id,
                l.inbound_type, l.port, l.api_url, l.timezone,
                l.auto_start, l.enabled, l.status, l.status_message,
                l.last_received_at, l.messages_total, l.messages_today,
                l.errors_total, l.errors_today, l.last_error_message,
                l.created_at,
                t.name as tenant_name,
                n.name as node_name,
                pt.name as parser_name
            FROM cad_listeners l
            JOIN tenants t ON t.id = l.tenant_id
            JOIN cad_server_nodes n ON n.id = l.server_node_id
            JOIN cad_parser_templates pt ON pt.id = l.parser_template_id
            WHERE 1=1
        """
        params = []
        if node_id:
            query += " AND l.server_node_id = %s"
            params.append(node_id)
        if status:
            query += " AND l.status = %s"
            params.append(status)
        query += " ORDER BY t.name"

        results = db.fetchall(query, tuple(params)) if params else db.fetchall(query)

        # Batch-load forwarding destinations
        listener_ids = [r[0] for r in results]
        fwd_map = {}
        if listener_ids:
            placeholders = ','.join(['%s'] * len(listener_ids))
            fwds = db.fetchall(f"""
                SELECT id, listener_id, name, outbound_type, forward_mode,
                       enabled, status, last_forwarded_at
                FROM cad_forwarding_destinations
                WHERE listener_id IN ({placeholders})
                ORDER BY listener_id, id
            """, tuple(listener_ids))
            for f in fwds:
                fwd_map.setdefault(f[1], []).append({
                    'id': f[0], 'name': f[2], 'outbound_type': f[3],
                    'forward_mode': f[4], 'enabled': f[5], 'status': f[6],
                    'last_forwarded_at': iso(f[7]),
                })

        return {
            'listeners': [{
                'id': r[0], 'tenant_id': r[1], 'tenant_slug': r[2],
                'server_node_id': r[3], 'parser_template_id': r[4],
                'inbound_type': r[5], 'port': r[6], 'api_url': r[7],
                'timezone': r[8], 'auto_start': r[9], 'enabled': r[10],
                'status': r[11], 'status_message': r[12],
                'last_received_at': iso(r[13]),
                'messages_total': r[14], 'messages_today': r[15],
                'errors_total': r[16], 'errors_today': r[17],
                'last_error_message': r[18], 'created_at': iso(r[19]),
                'tenant_name': r[20], 'node_name': r[21], 'parser_name': r[22],
                'forwarding': fwd_map.get(r[0], []),
            } for r in results]
        }


@router.get("/listeners/{listener_id}")
async def get_listener(
    listener_id: int,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """Get listener details with forwarding destinations and recent events"""
    with get_master_db() as db:
        l = db.fetchone("""
            SELECT 
                l.id, l.tenant_id, l.server_node_id, l.parser_template_id,
                l.inbound_type, l.inbound_config, l.port, l.api_url,
                l.tenant_slug, l.timezone, l.auto_start, l.enabled,
                l.status, l.status_message, l.status_changed_at,
                l.process_id, l.process_started_at,
                l.last_received_at, l.messages_total, l.messages_today,
                l.errors_total, l.errors_today, l.last_error_at, l.last_error_message,
                l.raw_data_retention_days, l.notes, l.created_at, l.updated_at, l.created_by,
                t.name as tenant_name, n.name as node_name,
                n.hostname as node_hostname, pt.name as parser_name
            FROM cad_listeners l
            JOIN tenants t ON t.id = l.tenant_id
            JOIN cad_server_nodes n ON n.id = l.server_node_id
            JOIN cad_parser_templates pt ON pt.id = l.parser_template_id
            WHERE l.id = %s
        """, (listener_id,))

        if not l:
            raise HTTPException(status_code=404, detail="Listener not found")

        fwds = db.fetchall("""
            SELECT id, name, outbound_type, forward_mode, outbound_config,
                   retry_config, enabled, status,
                   last_forwarded_at, forwards_total, forwards_today,
                   failures_total, failures_today, last_failure_message,
                   notes, created_at
            FROM cad_forwarding_destinations WHERE listener_id = %s ORDER BY id
        """, (listener_id,))

        events = db.fetchall("""
            SELECT id, event_type, severity, message, details, created_at
            FROM cad_listener_events WHERE listener_id = %s
            ORDER BY created_at DESC LIMIT 20
        """, (listener_id,))

        return {
            'listener': {
                'id': l[0], 'tenant_id': l[1], 'server_node_id': l[2],
                'parser_template_id': l[3], 'inbound_type': l[4],
                'inbound_config': l[5] or {}, 'port': l[6], 'api_url': l[7],
                'tenant_slug': l[8], 'timezone': l[9],
                'auto_start': l[10], 'enabled': l[11],
                'status': l[12], 'status_message': l[13],
                'status_changed_at': iso(l[14]),
                'process_id': l[15], 'process_started_at': iso(l[16]),
                'last_received_at': iso(l[17]),
                'messages_total': l[18], 'messages_today': l[19],
                'errors_total': l[20], 'errors_today': l[21],
                'last_error_at': iso(l[22]), 'last_error_message': l[23],
                'raw_data_retention_days': l[24],
                'notes': l[25], 'created_at': iso(l[26]), 'updated_at': iso(l[27]),
                'created_by': l[28],
                'tenant_name': l[29], 'node_name': l[30],
                'node_hostname': l[31], 'parser_name': l[32],
            },
            'forwarding': [{
                'id': f[0], 'name': f[1], 'outbound_type': f[2],
                'forward_mode': f[3], 'outbound_config': f[4] or {},
                'retry_config': f[5] or {}, 'enabled': f[6], 'status': f[7],
                'last_forwarded_at': iso(f[8]), 'forwards_total': f[9],
                'forwards_today': f[10], 'failures_total': f[11],
                'failures_today': f[12], 'last_failure_message': f[13],
                'notes': f[14], 'created_at': iso(f[15]),
            } for f in fwds],
            'recent_events': [{
                'id': e[0], 'event_type': e[1], 'severity': e[2],
                'message': e[3], 'details': e[4] or {}, 'created_at': iso(e[5]),
            } for e in events],
        }


@router.post("/listeners")
async def create_listener(
    data: ListenerCreate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Create a new CAD listener for a tenant with auto port assignment"""
    if data.inbound_type not in VALID_INBOUND_TYPES:
        raise HTTPException(status_code=400, detail=f"inbound_type must be one of: {VALID_INBOUND_TYPES}")

    with get_master_db() as db:
        # Validate tenant
        tenant = db.fetchone("SELECT id, slug, name FROM tenants WHERE id = %s", (data.tenant_id,))
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        # Validate node
        node = db.fetchone("""
            SELECT id, name, status, port_range_start, port_range_end, max_listeners
            FROM cad_server_nodes WHERE id = %s
        """, (data.server_node_id,))
        if not node:
            raise HTTPException(status_code=404, detail="Server node not found")
        if node[2] == 'draining':
            raise HTTPException(status_code=400, detail="Node is draining — cannot add listeners")

        # Check capacity
        count = db.fetchone(
            "SELECT COUNT(*) FROM cad_listeners WHERE server_node_id = %s", (data.server_node_id,))
        if count[0] >= node[5]:
            raise HTTPException(status_code=400, detail=f"Node at capacity ({node[5]} max)")

        # Validate parser
        parser = db.fetchone(
            "SELECT id FROM cad_parser_templates WHERE id = %s AND is_active = TRUE",
            (data.parser_template_id,))
        if not parser:
            raise HTTPException(status_code=404, detail="Parser template not found or inactive")

        # Check uniqueness
        existing = db.fetchone("""
            SELECT id FROM cad_listeners WHERE tenant_id = %s AND server_node_id = %s
        """, (data.tenant_id, data.server_node_id))
        if existing:
            raise HTTPException(status_code=400, detail="Tenant already has a listener on this node")

        # Port assignment for TCP
        port = data.port
        if data.inbound_type == 'tcp':
            if port is None:
                used = db.fetchall("""
                    SELECT port FROM cad_listeners
                    WHERE server_node_id = %s AND port IS NOT NULL
                """, (data.server_node_id,))
                used_ports = {r[0] for r in used}
                for p in range(node[3], node[4] + 1):
                    if p not in used_ports:
                        port = p
                        break
                if port is None:
                    raise HTTPException(status_code=400, detail="No available ports on this node")
            else:
                if port < node[3] or port > node[4]:
                    raise HTTPException(status_code=400,
                                        detail=f"Port {port} outside node range ({node[3]}-{node[4]})")
                conflict = db.fetchone("""
                    SELECT id FROM cad_listeners WHERE server_node_id = %s AND port = %s
                """, (data.server_node_id, port))
                if conflict:
                    raise HTTPException(status_code=400, detail=f"Port {port} already in use")

        db.execute("""
            INSERT INTO cad_listeners
            (tenant_id, server_node_id, parser_template_id, inbound_type,
             inbound_config, port, api_url, tenant_slug, timezone,
             auto_start, enabled, status, created_by)
            VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, TRUE, 'stopped', %s)
        """, (
            data.tenant_id, data.server_node_id, data.parser_template_id,
            data.inbound_type, json.dumps(data.inbound_config), port,
            data.api_url, data.tenant_slug, data.timezone,
            data.auto_start, admin['id']
        ))
        db.commit()

        new_id = db.fetchone("""
            SELECT id FROM cad_listeners
            WHERE tenant_id = %s AND server_node_id = %s ORDER BY id DESC LIMIT 1
        """, (data.tenant_id, data.server_node_id))[0]

        log_audit(db, admin['id'], admin['email'], 'CREATE_CAD_LISTENER',
                  'CAD_LISTENER', new_id, f"{data.tenant_slug}:{port}",
                  {'tenant': tenant[2], 'node': node[1], 'type': data.inbound_type, 'port': port},
                  get_client_ip(request))

        return {'status': 'ok', 'id': new_id, 'tenant_slug': data.tenant_slug,
                'port': port, 'node': node[1]}


@router.put("/listeners/{listener_id}")
async def update_listener(
    listener_id: int,
    data: ListenerUpdate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Update listener configuration"""
    with get_master_db() as db:
        existing = db.fetchone(
            "SELECT tenant_slug FROM cad_listeners WHERE id = %s", (listener_id,))
        if not existing:
            raise HTTPException(status_code=404, detail="Listener not found")

        if data.parser_template_id:
            parser = db.fetchone(
                "SELECT id FROM cad_parser_templates WHERE id = %s AND is_active = TRUE",
                (data.parser_template_id,))
            if not parser:
                raise HTTPException(status_code=404, detail="Parser template not found or inactive")

        set_clause, values = build_update(data, [
            'parser_template_id', 'inbound_config', 'api_url', 'timezone',
            'auto_start', 'enabled', 'notes', 'raw_data_retention_days'
        ])

        if set_clause:
            values.append(listener_id)
            db.execute(
                f"UPDATE cad_listeners SET {set_clause}, updated_at = NOW() WHERE id = %s",
                tuple(values))
            db.commit()

        log_audit(db, admin['id'], admin['email'], 'UPDATE_CAD_LISTENER',
                  'CAD_LISTENER', listener_id, existing[0],
                  ip_address=get_client_ip(request))

        return {'status': 'ok'}


@router.get("/listeners/{listener_id}/launch-command")
async def get_launch_command(
    listener_id: int,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Get the exact shell command to start this listener"""
    with get_master_db() as db:
        l = db.fetchone("""
            SELECT l.tenant_slug, l.inbound_type, l.port, l.api_url, l.timezone,
                   n.hostname as node_hostname
            FROM cad_listeners l
            JOIN cad_server_nodes n ON n.id = l.server_node_id
            WHERE l.id = %s
        """, (listener_id,))

        if not l:
            raise HTTPException(status_code=404, detail="Listener not found")

        slug, itype, port, api_url, tz, hostname = l

        if itype != 'tcp':
            return {'listener_id': listener_id, 'inbound_type': itype,
                    'command': None, 'message': f'{itype} listeners do not have a launch command yet'}

        cmd = (
            f'cd /opt/runsheet/cad && '
            f'nohup /opt/runsheet/runsheet_env/bin/python cad_listener.py '
            f'--port {port} --tenant {slug} --api-url {api_url} --timezone {tz} '
            f'> /opt/runsheet/cad/logs/{slug}.log 2>&1 &'
        )

        return {'listener_id': listener_id, 'tenant_slug': slug,
                'inbound_type': itype, 'port': port, 'node': hostname, 'command': cmd}
