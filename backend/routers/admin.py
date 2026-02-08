"""
Admin router - Audit log

Shared admin password REMOVED (Feb 2026).
Admin page access is now gated by personnel role (OFFICER/ADMIN) on the frontend.
The /verify and /change-password endpoints have been removed.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from models import AuditLog
from settings_helper import format_utc_iso

router = APIRouter()


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/audit-log")
async def get_audit_log(
    limit: int = 100,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get audit log entries"""
    query = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    
    logs = query.limit(limit).all()
    
    return [
        {
            "id": log.id,
            "personnel_name": log.personnel_name,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "entity_display": log.entity_display,
            "summary": log.summary,
            "fields_changed": log.fields_changed,
            "created_at": format_utc_iso(log.created_at),
        }
        for log in logs
    ]
