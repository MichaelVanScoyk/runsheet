"""
Admin router - Password verification, change, and audit log
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import bcrypt

from database import get_db
from models import AuditLog, Setting

router = APIRouter()


# =============================================================================
# SCHEMAS
# =============================================================================

class PasswordVerify(BaseModel):
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# =============================================================================
# HELPERS
# =============================================================================

def get_admin_password_hash(db: Session) -> str:
    """Get admin password hash from settings"""
    setting = db.query(Setting).filter(
        Setting.category == 'admin',
        Setting.key == 'password_hash'
    ).first()
    
    if not setting:
        # Default password123 hash
        return '$2b$12$6sbFgTKAqLMvugLhCdYkIuquyVcdGGIiOw.J0SGzQz9kZG6WPi2Du'
    
    return setting.value


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


def hash_password(password: str) -> str:
    """Hash a password"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/verify")
async def verify_admin_password(
    data: PasswordVerify,
    db: Session = Depends(get_db)
):
    """Verify admin password"""
    stored_hash = get_admin_password_hash(db)
    
    if not verify_password(data.password, stored_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )
    
    return {"status": "ok"}


@router.post("/change-password")
async def change_admin_password(
    data: PasswordChange,
    db: Session = Depends(get_db)
):
    """Change admin password"""
    stored_hash = get_admin_password_hash(db)
    
    # Verify current password
    if not verify_password(data.current_password, stored_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    # Validate new password
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters"
        )
    
    # Update password
    new_hash = hash_password(data.new_password)
    
    setting = db.query(Setting).filter(
        Setting.category == 'admin',
        Setting.key == 'password_hash'
    ).first()
    
    if setting:
        setting.value = new_hash
        setting.updated_at = datetime.now(timezone.utc)
    else:
        setting = Setting(
            category='admin',
            key='password_hash',
            value=new_hash,
            value_type='string',
            description='Admin section password (bcrypt hash)'
        )
        db.add(setting)
    
    db.commit()
    
    return {"status": "ok", "message": "Password changed"}


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
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]
