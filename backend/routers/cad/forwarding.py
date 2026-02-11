"""
Forwarding destination management — CRUD for downstream data relay.

Many fire departments use multiple software systems (IamResponding, Active911, etc.).
CADReport sits in the middle and can forward raw or parsed CAD data onward,
so departments don't have to abandon their existing tools.

Each listener can have zero or more forwarding destinations.
Forward modes: raw (byte-for-byte original), parsed (structured JSON), both
Outbound types: tcp, email, webhook, sftp, api_push

FUTURE: Retry queue with exponential backoff when destinations are unreachable.
For now, failed forwards are logged in cad_listener_events.

Tables: cad_forwarding_destinations (cadreport_master)
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
import json
import logging

from master_database import get_master_db
from .helpers import require_role, get_client_ip, log_audit, build_update

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_OUTBOUND_TYPES = ['tcp', 'email', 'webhook', 'sftp', 'api_push']
VALID_FORWARD_MODES = ['raw', 'parsed', 'both']


class ForwardingCreate(BaseModel):
    listener_id: int
    name: Optional[str] = None
    outbound_type: str
    forward_mode: str = 'raw'
    outbound_config: dict = {}
    retry_config: Optional[dict] = None
    notes: Optional[str] = None

class ForwardingUpdate(BaseModel):
    name: Optional[str] = None
    outbound_type: Optional[str] = None
    forward_mode: Optional[str] = None
    outbound_config: Optional[dict] = None
    retry_config: Optional[dict] = None
    enabled: Optional[bool] = None
    notes: Optional[str] = None


@router.post("/forwarding")
async def create_forwarding(
    data: ForwardingCreate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Add a forwarding destination to a listener"""
    if data.outbound_type not in VALID_OUTBOUND_TYPES:
        raise HTTPException(status_code=400, detail=f"outbound_type must be one of: {VALID_OUTBOUND_TYPES}")
    if data.forward_mode not in VALID_FORWARD_MODES:
        raise HTTPException(status_code=400, detail=f"forward_mode must be one of: {VALID_FORWARD_MODES}")

    with get_master_db() as db:
        listener = db.fetchone(
            "SELECT id, tenant_slug FROM cad_listeners WHERE id = %s", (data.listener_id,))
        if not listener:
            raise HTTPException(status_code=404, detail="Listener not found")

        db.execute("""
            INSERT INTO cad_forwarding_destinations
            (listener_id, name, outbound_type, forward_mode, outbound_config,
             retry_config, enabled, status, notes, created_by)
            VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, TRUE, 'active', %s, %s)
        """, (
            data.listener_id, data.name, data.outbound_type, data.forward_mode,
            json.dumps(data.outbound_config), json.dumps(data.retry_config or {}),
            data.notes, admin['id']
        ))
        db.commit()

        new_id = db.fetchone("""
            SELECT id FROM cad_forwarding_destinations
            WHERE listener_id = %s ORDER BY id DESC LIMIT 1
        """, (data.listener_id,))[0]

        log_audit(db, admin['id'], admin['email'], 'CREATE_CAD_FORWARDING',
                  'CAD_FORWARDING', new_id, f"{listener[1]}->{data.outbound_type}",
                  {'type': data.outbound_type, 'mode': data.forward_mode},
                  get_client_ip(request))

        return {'status': 'ok', 'id': new_id}


@router.put("/forwarding/{fwd_id}")
async def update_forwarding(
    fwd_id: int,
    data: ForwardingUpdate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Update forwarding destination"""
    with get_master_db() as db:
        existing = db.fetchone(
            "SELECT id, name FROM cad_forwarding_destinations WHERE id = %s", (fwd_id,))
        if not existing:
            raise HTTPException(status_code=404, detail="Forwarding destination not found")

        if data.outbound_type and data.outbound_type not in VALID_OUTBOUND_TYPES:
            raise HTTPException(status_code=400, detail=f"outbound_type must be one of: {VALID_OUTBOUND_TYPES}")
        if data.forward_mode and data.forward_mode not in VALID_FORWARD_MODES:
            raise HTTPException(status_code=400, detail=f"forward_mode must be one of: {VALID_FORWARD_MODES}")

        set_clause, values = build_update(data, [
            'name', 'outbound_type', 'forward_mode', 'outbound_config',
            'retry_config', 'enabled', 'notes'
        ])
        if set_clause:
            values.append(fwd_id)
            db.execute(
                f"UPDATE cad_forwarding_destinations SET {set_clause}, updated_at = NOW() WHERE id = %s",
                tuple(values))
            db.commit()

        log_audit(db, admin['id'], admin['email'], 'UPDATE_CAD_FORWARDING',
                  'CAD_FORWARDING', fwd_id, existing[1], ip_address=get_client_ip(request))

        return {'status': 'ok'}


@router.delete("/forwarding/{fwd_id}")
async def delete_forwarding(
    fwd_id: int,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Delete a forwarding destination"""
    with get_master_db() as db:
        existing = db.fetchone(
            "SELECT id, name FROM cad_forwarding_destinations WHERE id = %s", (fwd_id,))
        if not existing:
            raise HTTPException(status_code=404, detail="Forwarding destination not found")

        db.execute("DELETE FROM cad_forwarding_destinations WHERE id = %s", (fwd_id,))
        db.commit()

        log_audit(db, admin['id'], admin['email'], 'DELETE_CAD_FORWARDING',
                  'CAD_FORWARDING', fwd_id, existing[1], ip_address=get_client_ip(request))

        return {'status': 'ok'}
