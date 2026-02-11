"""
Migration endpoints — create, advance, runbook, rollback, cancel.

Commands/context logic lives in migration_commands.py to keep this focused on endpoints.
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import json
import logging

from master_database import get_master_db
from .helpers import require_role, get_client_ip, log_audit, iso
from .migration_commands import (
    MIGRATION_STEPS, get_migration_context, generate_step_commands
)

logger = logging.getLogger(__name__)
router = APIRouter()


class MigrationCreate(BaseModel):
    listener_id: int
    destination_node_id: int
    destination_port: Optional[int] = None
    scheduled_at: Optional[str] = None
    maintenance_window_start: Optional[str] = None
    maintenance_window_end: Optional[str] = None


# Status transitions per phase
PHASE_MAP = {
    1: 'preparing', 2: 'preparing', 3: 'preparing',
    4: 'testing', 5: 'testing', 6: 'testing',
    7: 'cutover', 8: 'cutover', 9: 'cutover',
    10: 'verifying',
}


@router.get("/migrations")
async def list_migrations(
    status: Optional[str] = None,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """List all migrations"""
    with get_master_db() as db:
        query = """
            SELECT m.id, m.listener_id, m.tenant_id, m.source_node_id,
                   m.destination_node_id, m.destination_port, m.status,
                   m.status_message, m.scheduled_at, m.started_at,
                   m.completed_at, m.rolled_back_at, m.created_at,
                   t.name as tenant_name, t.slug as tenant_slug,
                   sn.name as source_name, dn.name as dest_name
            FROM cad_migrations m
            JOIN tenants t ON t.id = m.tenant_id
            JOIN cad_server_nodes sn ON sn.id = m.source_node_id
            JOIN cad_server_nodes dn ON dn.id = m.destination_node_id
        """
        params = []
        if status:
            query += " WHERE m.status = %s"
            params.append(status)
        query += " ORDER BY m.created_at DESC"

        results = db.fetchall(query, tuple(params)) if params else db.fetchall(query)

        return {
            'migrations': [{
                'id': r[0], 'listener_id': r[1], 'tenant_id': r[2],
                'source_node_id': r[3], 'destination_node_id': r[4],
                'destination_port': r[5], 'status': r[6],
                'status_message': r[7], 'scheduled_at': iso(r[8]),
                'started_at': iso(r[9]), 'completed_at': iso(r[10]),
                'rolled_back_at': iso(r[11]), 'created_at': iso(r[12]),
                'tenant_name': r[13], 'tenant_slug': r[14],
                'source_name': r[15], 'dest_name': r[16],
            } for r in results]
        }


@router.get("/migrations/{migration_id}")
async def get_migration(
    migration_id: int,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """Get migration details with all steps"""
    with get_master_db() as db:
        ctx = get_migration_context(db, migration_id)
        if not ctx:
            raise HTTPException(status_code=404, detail="Migration not found")

        steps = db.fetchall("""
            SELECT id, step_order, step_name, description, status,
                   started_at, completed_at, result_message, result_details,
                   rollback_action, rolled_back_at
            FROM cad_migration_steps WHERE migration_id = %s ORDER BY step_order
        """, (migration_id,))

        return {
            'migration': {
                'id': ctx['migration_id'], 'listener_id': ctx['listener_id'],
                'tenant_name': ctx['tenant_name'], 'tenant_slug': ctx['tenant_slug'],
                'source_name': ctx['source_name'], 'dest_name': ctx['dest_name'],
                'source_port': ctx['source_port'],
                'destination_port': ctx['destination_port'],
                'status': ctx['status'], 'database_name': ctx['database_name'],
            },
            'steps': [{
                'id': s[0], 'step_order': s[1], 'step_name': s[2],
                'description': s[3], 'status': s[4],
                'started_at': iso(s[5]), 'completed_at': iso(s[6]),
                'result_message': s[7], 'result_details': s[8] or {},
                'rollback_action': s[9] or {}, 'rolled_back_at': iso(s[10]),
            } for s in steps]
        }


@router.post("/migrations")
async def create_migration(
    data: MigrationCreate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Create a migration — validates, reserves port, creates step records"""
    with get_master_db() as db:
        # Validate listener
        listener = db.fetchone("""
            SELECT id, tenant_id, tenant_slug, server_node_id, port,
                   inbound_type, status
            FROM cad_listeners WHERE id = %s
        """, (data.listener_id,))
        if not listener:
            raise HTTPException(status_code=404, detail="Listener not found")

        lid, tenant_id, slug, source_node_id, src_port, itype, lstatus = listener
        if lstatus == 'migrating':
            raise HTTPException(status_code=400, detail="Already being migrated")
        if source_node_id == data.destination_node_id:
            raise HTTPException(status_code=400, detail="Source and destination are the same")

        # Validate destination node
        dest = db.fetchone("""
            SELECT id, name, status, port_range_start, port_range_end, max_listeners
            FROM cad_server_nodes WHERE id = %s
        """, (data.destination_node_id,))
        if not dest:
            raise HTTPException(status_code=404, detail="Destination node not found")
        if dest[2] in ('offline', 'draining'):
            raise HTTPException(status_code=400, detail=f"Destination is {dest[2]}")

        # Capacity
        count = db.fetchone(
            "SELECT COUNT(*) FROM cad_listeners WHERE server_node_id = %s",
            (data.destination_node_id,))[0]
        if count >= dest[5]:
            raise HTTPException(status_code=400, detail=f"Destination at capacity ({dest[5]})")

        # No duplicate listener on destination
        dup = db.fetchone("""
            SELECT id FROM cad_listeners
            WHERE tenant_id = %s AND server_node_id = %s
        """, (tenant_id, data.destination_node_id))
        if dup:
            raise HTTPException(status_code=400, detail="Tenant already on destination")

        # No active migration
        active = db.fetchone("""
            SELECT id FROM cad_migrations
            WHERE listener_id = %s AND status NOT IN ('completed','failed','rolled_back')
        """, (data.listener_id,))
        if active:
            raise HTTPException(status_code=400, detail=f"Active migration #{active[0]}")

        # Port reservation
        dst_port = data.destination_port
        if itype == 'tcp':
            if dst_port is None:
                used = db.fetchall("""
                    SELECT port FROM cad_listeners
                    WHERE server_node_id = %s AND port IS NOT NULL
                """, (data.destination_node_id,))
                used_ports = {r[0] for r in used}
                for p in range(dest[3], dest[4] + 1):
                    if p not in used_ports:
                        dst_port = p
                        break
                if dst_port is None:
                    raise HTTPException(status_code=400, detail="No ports available")
            else:
                if dst_port < dest[3] or dst_port > dest[4]:
                    raise HTTPException(status_code=400,
                                        detail=f"Port outside range ({dest[3]}-{dest[4]})")
                conflict = db.fetchone("""
                    SELECT id FROM cad_listeners
                    WHERE server_node_id = %s AND port = %s
                """, (data.destination_node_id, dst_port))
                if conflict:
                    raise HTTPException(status_code=400, detail=f"Port {dst_port} in use")

        # Create migration record
        db.execute("""
            INSERT INTO cad_migrations
            (listener_id, tenant_id, source_node_id, destination_node_id,
             destination_port, status, scheduled_at,
             maintenance_window_start, maintenance_window_end, created_by)
            VALUES (%s, %s, %s, %s, %s, 'scheduled', %s, %s, %s, %s)
        """, (data.listener_id, tenant_id, source_node_id,
              data.destination_node_id, dst_port, data.scheduled_at,
              data.maintenance_window_start, data.maintenance_window_end,
              admin['id']))
        db.commit()

        mig_id = db.fetchone("""
            SELECT id FROM cad_migrations
            WHERE listener_id = %s ORDER BY id DESC LIMIT 1
        """, (data.listener_id,))[0]

        # Create step records
        for step in MIGRATION_STEPS:
            db.execute("""
                INSERT INTO cad_migration_steps
                (migration_id, step_order, step_name, description, status)
                VALUES (%s, %s, %s, %s, 'pending')
            """, (mig_id, step['order'], step['name'], step['description']))
        db.commit()

        # Mark listener as migrating
        db.execute("""
            UPDATE cad_listeners SET status = 'migrating', status_changed_at = NOW()
            WHERE id = %s
        """, (data.listener_id,))
        db.commit()

        source_name = db.fetchone(
            "SELECT name FROM cad_server_nodes WHERE id = %s", (source_node_id,))[0]

        log_audit(db, admin['id'], admin['email'], 'CREATE_CAD_MIGRATION',
                  'CAD_MIGRATION', mig_id, f"{slug}: {source_name} → {dest[1]}",
                  {'port': dst_port}, get_client_ip(request))

        return {'status': 'ok', 'id': mig_id, 'destination_port': dst_port,
                'steps': len(MIGRATION_STEPS)}


@router.post("/migrations/{migration_id}/cancel")
async def cancel_migration(
    migration_id: int,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Cancel a scheduled migration (before any steps have started)"""
    with get_master_db() as db:
        m = db.fetchone("""
            SELECT status, listener_id FROM cad_migrations WHERE id = %s
        """, (migration_id,))
        if not m:
            raise HTTPException(status_code=404, detail="Migration not found")
        if m[0] != 'scheduled':
            raise HTTPException(status_code=400,
                                detail=f"Can only cancel scheduled migrations (current: {m[0]})")

        db.execute("""
            UPDATE cad_migrations SET status = 'failed',
            status_message = 'Cancelled before start', updated_at = NOW()
            WHERE id = %s
        """, (migration_id,))

        db.execute("""
            UPDATE cad_listeners SET status = 'stopped', status_changed_at = NOW()
            WHERE id = %s
        """, (m[1],))
        db.commit()

        log_audit(db, admin['id'], admin['email'], 'CANCEL_CAD_MIGRATION',
                  'CAD_MIGRATION', migration_id, '', ip_address=get_client_ip(request))

        return {'status': 'ok', 'message': 'Migration cancelled'}


@router.get("/migrations/{migration_id}/runbook")
async def get_runbook(
    migration_id: int,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Generate complete step-by-step migration runbook"""
    with get_master_db() as db:
        ctx = get_migration_context(db, migration_id)
        if not ctx:
            raise HTTPException(status_code=404, detail="Migration not found")

        steps = db.fetchall("""
            SELECT step_order, step_name, description, status
            FROM cad_migration_steps WHERE migration_id = %s ORDER BY step_order
        """, (migration_id,))

        runbook_steps = []
        text_lines = [
            f"MIGRATION RUNBOOK: {ctx['tenant_slug']}",
            f"  {ctx['source_name']} → {ctx['dest_name']}",
            f"  Port: {ctx['source_port']} → {ctx['destination_port']}",
            f"  Database: {ctx['database_name']}",
            f"  Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            "", "=" * 60, "",
        ]

        for s in steps:
            order, name, desc, status = s
            cmds = generate_step_commands(name, ctx)

            step_data = {
                'step_order': order, 'step_name': name,
                'description': desc, 'status': status,
                'target': cmds['target'],
                'commands': cmds['commands'],
                'rollback': cmds['rollback'],
            }
            runbook_steps.append(step_data)

            text_lines.append(f"STEP {order}: {desc}")
            text_lines.append(f"  Target: {cmds['target']}")
            text_lines.append(f"  Status: {status}")
            for cmd in cmds['commands']:
                text_lines.append(f"  $ {cmd}")
            text_lines.append(f"  Rollback: {cmds['rollback']}")
            text_lines.append("")

        return {
            'migration_id': migration_id,
            'tenant_slug': ctx['tenant_slug'],
            'source': ctx['source_name'],
            'destination': ctx['dest_name'],
            'steps': runbook_steps,
            'text': "\n".join(text_lines),
        }


@router.post("/migrations/{migration_id}/advance")
async def advance_migration(
    migration_id: int,
    complete: bool = False,
    request: Request = None,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """
    Walk through migration step by step.

    Without ?complete=true: returns current step's commands.
    With ?complete=true: marks current step done, advances, returns next commands.
    """
    with get_master_db() as db:
        ctx = get_migration_context(db, migration_id)
        if not ctx:
            raise HTTPException(status_code=404, detail="Migration not found")
        if ctx['status'] in ('completed', 'failed', 'rolled_back'):
            raise HTTPException(status_code=400, detail=f"Migration is {ctx['status']}")

        steps = db.fetchall("""
            SELECT id, step_order, step_name, status
            FROM cad_migration_steps WHERE migration_id = %s ORDER BY step_order
        """, (migration_id,))

        # Find current step
        current = None
        next_step = None
        for i, s in enumerate(steps):
            if s[3] == 'running':
                current = s
                if complete and i + 1 < len(steps):
                    next_step = steps[i + 1]
                break
            elif s[3] == 'pending':
                next_step = s
                break

        if complete and current:
            # Mark current step done
            db.execute("""
                UPDATE cad_migration_steps SET status = 'completed',
                completed_at = NOW() WHERE id = %s
            """, (current[0],))

            if next_step:
                # Start next step
                db.execute("""
                    UPDATE cad_migration_steps SET status = 'running',
                    started_at = NOW() WHERE id = %s
                """, (next_step[0],))

                phase = PHASE_MAP.get(next_step[1], ctx['status'])
                db.execute("""
                    UPDATE cad_migrations SET status = %s, updated_at = NOW()
                    WHERE id = %s
                """, (phase, migration_id))
            else:
                # All steps done
                db.execute("""
                    UPDATE cad_migrations SET status = 'completed',
                    completed_at = NOW(), updated_at = NOW() WHERE id = %s
                """, (migration_id,))
                db.execute("""
                    UPDATE cad_listeners SET status = 'stopped',
                    status_changed_at = NOW() WHERE id = %s
                """, (ctx['listener_id'],))

            db.commit()
            target = next_step
        elif not complete and current:
            target = current
        elif next_step:
            # Start first pending step
            db.execute("""
                UPDATE cad_migration_steps SET status = 'running',
                started_at = NOW() WHERE id = %s
            """, (next_step[0],))

            if ctx['status'] == 'scheduled':
                db.execute("""
                    UPDATE cad_migrations SET status = 'preparing',
                    started_at = NOW(), updated_at = NOW() WHERE id = %s
                """, (migration_id,))

            db.commit()
            target = next_step
        else:
            return {'status': 'completed', 'message': 'All steps done'}

        if target is None:
            return {'status': 'completed', 'message': 'Migration complete'}

        cmds = generate_step_commands(target[2], ctx)

        return {
            'step_order': target[1],
            'step_name': target[2],
            'target': cmds['target'],
            'description': cmds['description'],
            'commands': cmds['commands'],
            'rollback': cmds['rollback'],
        }


@router.post("/migrations/{migration_id}/fail-step")
async def fail_step(
    migration_id: int,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Mark the current running step as failed, halt migration"""
    with get_master_db() as db:
        current = db.fetchone("""
            SELECT id, step_name FROM cad_migration_steps
            WHERE migration_id = %s AND status = 'running'
        """, (migration_id,))
        if not current:
            raise HTTPException(status_code=400, detail="No running step to fail")

        db.execute("""
            UPDATE cad_migration_steps SET status = 'failed', completed_at = NOW()
            WHERE id = %s
        """, (current[0],))

        db.execute("""
            UPDATE cad_migrations SET status = 'failed',
            status_message = %s, updated_at = NOW() WHERE id = %s
        """, (f"Failed at step: {current[1]}", migration_id))
        db.commit()

        log_audit(db, admin['id'], admin['email'], 'FAIL_CAD_MIGRATION_STEP',
                  'CAD_MIGRATION', migration_id, current[1],
                  ip_address=get_client_ip(request))

        return {'status': 'ok', 'failed_step': current[1]}


@router.post("/migrations/{migration_id}/rollback")
async def rollback_migration(
    migration_id: int,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Generate rollback commands for all completed steps (reverse order)"""
    with get_master_db() as db:
        ctx = get_migration_context(db, migration_id)
        if not ctx:
            raise HTTPException(status_code=404, detail="Migration not found")

        completed = db.fetchall("""
            SELECT step_order, step_name FROM cad_migration_steps
            WHERE migration_id = %s AND status = 'completed'
            ORDER BY step_order DESC
        """, (migration_id,))

        if not completed:
            return {'status': 'ok', 'message': 'No steps to rollback', 'rollback_commands': []}

        rollback_cmds = []
        for s in completed:
            cmds = generate_step_commands(s[1], ctx)
            rollback_cmds.append({
                'step_order': s[0], 'step_name': s[1],
                'rollback': cmds['rollback'],
            })

        # Mark steps as rolled back
        db.execute("""
            UPDATE cad_migration_steps SET status = 'rolled_back',
            rolled_back_at = NOW()
            WHERE migration_id = %s AND status = 'completed'
        """, (migration_id,))

        db.execute("""
            UPDATE cad_migrations SET status = 'rolled_back',
            rolled_back_at = NOW(), updated_at = NOW() WHERE id = %s
        """, (migration_id,))

        db.execute("""
            UPDATE cad_listeners SET status = 'stopped', status_changed_at = NOW()
            WHERE id = %s
        """, (ctx['listener_id'],))
        db.commit()

        log_audit(db, admin['id'], admin['email'], 'ROLLBACK_CAD_MIGRATION',
                  'CAD_MIGRATION', migration_id, f"{len(completed)} steps",
                  ip_address=get_client_ip(request))

        return {'status': 'ok', 'rolled_back_steps': len(completed),
                'rollback_commands': rollback_cmds}
