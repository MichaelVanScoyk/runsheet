"""
Alert rule management — CRUD for CAD infrastructure monitoring.

Alert rules define conditions that trigger notifications when CAD infrastructure
has problems. Examples:
  - No data received on a listener for 10 minutes
  - Error rate exceeds 5/hour
  - Node heartbeat missing for 60 seconds
  - Forwarding destination has 3+ consecutive failures

Scopes: listener, node, destination (can target specific entity or all of type)

FUTURE: Currently alerts just log events. When alerting is fully implemented,
they'll send to email/SMS/Slack via alert_config JSONB field.

Tables: cad_alert_rules (cadreport_master)
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

VALID_SCOPES = ['listener', 'node', 'destination']


class AlertRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    scope: str
    scope_entity_id: Optional[int] = None
    condition_type: str
    threshold_seconds: Optional[int] = None
    threshold_count: Optional[int] = None
    threshold_percent: Optional[float] = None
    cooldown_seconds: int = 300
    alert_config: Optional[dict] = None

class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    condition_type: Optional[str] = None
    threshold_seconds: Optional[int] = None
    threshold_count: Optional[int] = None
    threshold_percent: Optional[float] = None
    cooldown_seconds: Optional[int] = None
    enabled: Optional[bool] = None
    alert_config: Optional[dict] = None


@router.get("/alerts")
async def list_alert_rules(
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """List all alert rules"""
    with get_master_db() as db:
        results = db.fetchall("""
            SELECT id, name, description, scope, scope_entity_id,
                   condition_type, threshold_seconds, threshold_count, threshold_percent,
                   enabled, cooldown_seconds, last_triggered_at,
                   alert_config, created_at
            FROM cad_alert_rules ORDER BY scope, name
        """)

        return {
            'rules': [{
                'id': r[0], 'name': r[1], 'description': r[2],
                'scope': r[3], 'scope_entity_id': r[4],
                'condition_type': r[5], 'threshold_seconds': r[6],
                'threshold_count': r[7], 'threshold_percent': r[8],
                'enabled': r[9], 'cooldown_seconds': r[10],
                'last_triggered_at': iso(r[11]),
                'alert_config': r[12] or {}, 'created_at': iso(r[13]),
            } for r in results]
        }


@router.post("/alerts")
async def create_alert_rule(
    data: AlertRuleCreate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Create an alert rule"""
    if data.scope not in VALID_SCOPES:
        raise HTTPException(status_code=400, detail=f"scope must be one of: {VALID_SCOPES}")

    with get_master_db() as db:
        db.execute("""
            INSERT INTO cad_alert_rules
            (name, description, scope, scope_entity_id, condition_type,
             threshold_seconds, threshold_count, threshold_percent,
             cooldown_seconds, alert_config, enabled, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, TRUE, %s)
        """, (
            data.name, data.description, data.scope, data.scope_entity_id,
            data.condition_type, data.threshold_seconds, data.threshold_count,
            data.threshold_percent, data.cooldown_seconds,
            json.dumps(data.alert_config or {}), admin['id']
        ))
        db.commit()

        new_id = db.fetchone("SELECT id FROM cad_alert_rules ORDER BY id DESC LIMIT 1")[0]

        log_audit(db, admin['id'], admin['email'], 'CREATE_CAD_ALERT_RULE',
                  'CAD_ALERT', new_id, data.name,
                  {'scope': data.scope, 'condition': data.condition_type},
                  get_client_ip(request))

        return {'status': 'ok', 'id': new_id}


@router.put("/alerts/{rule_id}")
async def update_alert_rule(
    rule_id: int,
    data: AlertRuleUpdate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Update an alert rule"""
    with get_master_db() as db:
        existing = db.fetchone("SELECT name FROM cad_alert_rules WHERE id = %s", (rule_id,))
        if not existing:
            raise HTTPException(status_code=404, detail="Alert rule not found")

        set_clause, values = build_update(data, [
            'name', 'description', 'condition_type',
            'threshold_seconds', 'threshold_count', 'threshold_percent',
            'cooldown_seconds', 'enabled', 'alert_config'
        ])
        if set_clause:
            values.append(rule_id)
            db.execute(
                f"UPDATE cad_alert_rules SET {set_clause}, updated_at = NOW() WHERE id = %s",
                tuple(values))
            db.commit()

        log_audit(db, admin['id'], admin['email'], 'UPDATE_CAD_ALERT_RULE',
                  'CAD_ALERT', rule_id, existing[0], ip_address=get_client_ip(request))

        return {'status': 'ok'}


@router.delete("/alerts/{rule_id}")
async def delete_alert_rule(
    rule_id: int,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Delete an alert rule"""
    with get_master_db() as db:
        existing = db.fetchone("SELECT name FROM cad_alert_rules WHERE id = %s", (rule_id,))
        if not existing:
            raise HTTPException(status_code=404, detail="Alert rule not found")

        db.execute("DELETE FROM cad_alert_rules WHERE id = %s", (rule_id,))
        db.commit()

        log_audit(db, admin['id'], admin['email'], 'DELETE_CAD_ALERT_RULE',
                  'CAD_ALERT', rule_id, existing[0], ip_address=get_client_ip(request))

        return {'status': 'ok'}
