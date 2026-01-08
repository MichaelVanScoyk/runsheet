"""
Personnel router - manage run sheet personnel
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, EmailStr
import csv
import io
import re
import hashlib
import secrets
import logging

from database import get_db
from models import Personnel, Rank

logger = logging.getLogger(__name__)

router = APIRouter()

# Simple password hashing (use bcrypt in production)
def hash_password(password: str) -> str:
    """Hash password with salt"""
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{hashed}"

def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash"""
    if not stored_hash or ':' not in stored_hash:
        return False
    salt, hashed = stored_hash.split(':', 1)
    check_hash = hashlib.sha256((password + salt).encode()).hexdigest()
    return check_hash == hashed

# Store email verification codes temporarily (in production use Redis or DB)
email_verification_codes = {}  # {personnel_id: {"code": "123456", "email": "...", "expires": datetime}}


class PersonnelCreate(BaseModel):
    first_name: str
    last_name: str
    rank_id: Optional[int] = None
    dashboard_id: Optional[int] = None  # Link to Dashboard if syncing
    email: Optional[str] = None
    role: Optional[str] = None


class PersonnelUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    rank_id: Optional[int] = None
    active: Optional[bool] = None
    email: Optional[str] = None
    role: Optional[str] = None
    notification_preferences: Optional[dict] = None


@router.get("")
async def list_personnel(
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """List all personnel, grouped by rank"""
    query = db.query(Personnel)
    
    if active_only:
        query = query.filter(Personnel.active == True)
    
    personnel = query.all()
    
    # Get ranks for sorting
    ranks = {r.id: r for r in db.query(Rank).all()}
    
    now = datetime.now(timezone.utc)
    result = []
    for p in personnel:
        rank = ranks.get(p.rank_id)
        result.append({
            "id": p.id,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "display_name": f"{p.last_name}, {p.first_name}",
            "rank_id": p.rank_id,
            "rank_name": rank.rank_name if rank else None,
            "rank_abbreviation": rank.abbreviation if rank else None,
            "rank_order": rank.display_order if rank else 999,
            "active": p.active,
            "dashboard_id": p.dashboard_id,
            # Auth fields
            "email": p.email,
            "role": p.role,
            "is_registered": p.password_hash is not None,
            "is_approved": p.approved_at is not None,
            "email_verified": p.email_verified_at is not None,
            # Invitation status
            "has_pending_invite": p.invite_token is not None,
            "invite_expired": (
                p.invite_token is not None and 
                p.invite_token_expires_at is not None and 
                p.invite_token_expires_at < now
            ),
            # Notification preferences
            "notification_preferences": p.notification_preferences or {},
        })
    
    # Sort by rank order, then last name
    result.sort(key=lambda x: (x["rank_order"], x["last_name"]))
    
    return result


@router.get("/by-rank")
async def personnel_by_rank(
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """Get personnel grouped by rank for dropdown"""
    personnel = await list_personnel(active_only, db)
    
    grouped = {}
    for p in personnel:
        rank = p["rank_name"] or "Unassigned"
        if rank not in grouped:
            grouped[rank] = []
        grouped[rank].append({
            "id": p["id"],
            "display_name": p["display_name"],
            "first_name": p["first_name"],
            "last_name": p["last_name"],
        })
    
    return grouped


@router.get("/ranks")
async def list_ranks(
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """List all ranks"""
    query = db.query(Rank)
    
    if active_only:
        query = query.filter(Rank.active == True)
    
    ranks = query.order_by(Rank.display_order).all()
    
    return [
        {
            "id": r.id,
            "rank_name": r.rank_name,
            "abbreviation": r.abbreviation,
            "display_order": r.display_order,
            "active": r.active,
        }
        for r in ranks
    ]


# =============================================================================
# RANKS CRUD
# =============================================================================

class RankCreate(BaseModel):
    rank_name: str
    abbreviation: Optional[str] = None
    display_order: int = 100


class RankUpdate(BaseModel):
    rank_name: Optional[str] = None
    abbreviation: Optional[str] = None
    display_order: Optional[int] = None
    active: Optional[bool] = None


@router.post("/ranks")
async def create_rank(
    data: RankCreate,
    db: Session = Depends(get_db)
):
    """Create a new rank"""
    rank = Rank(
        rank_name=data.rank_name,
        abbreviation=data.abbreviation,
        display_order=data.display_order,
    )
    db.add(rank)
    db.commit()
    db.refresh(rank)
    return {"id": rank.id, "status": "ok"}


@router.put("/ranks/{rank_id}")
async def update_rank(
    rank_id: int,
    data: RankUpdate,
    db: Session = Depends(get_db)
):
    """Update a rank"""
    rank = db.query(Rank).filter(Rank.id == rank_id).first()
    
    if not rank:
        raise HTTPException(status_code=404, detail="Rank not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rank, field, value)
    
    db.commit()
    return {"id": rank_id, "status": "ok"}


@router.delete("/ranks/{rank_id}")
async def delete_rank(
    rank_id: int,
    db: Session = Depends(get_db)
):
    """Deactivate a rank"""
    rank = db.query(Rank).filter(Rank.id == rank_id).first()
    
    if not rank:
        raise HTTPException(status_code=404, detail="Rank not found")
    
    # Check if any personnel use this rank
    personnel_count = db.query(Personnel).filter(Personnel.rank_id == rank_id).count()
    if personnel_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete rank - {personnel_count} personnel assigned"
        )
    
    rank.active = False
    db.commit()
    return {"id": rank_id, "status": "ok"}


@router.get("/{id}")
async def get_personnel(id: int, db: Session = Depends(get_db)):
    """Get single personnel"""
    person = db.query(Personnel).filter(Personnel.id == id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    rank = None
    if person.rank_id:
        rank = db.query(Rank).filter(Rank.id == person.rank_id).first()
    
    return {
        "id": person.id,
        "first_name": person.first_name,
        "last_name": person.last_name,
        "display_name": f"{person.last_name}, {person.first_name}",
        "rank_id": person.rank_id,
        "rank_name": rank.rank_name if rank else None,
        "active": person.active,
        "dashboard_id": person.dashboard_id,
    }


@router.post("")
async def create_personnel(
    data: PersonnelCreate,
    db: Session = Depends(get_db)
):
    """Create new personnel"""
    person = Personnel(
        first_name=data.first_name,
        last_name=data.last_name,
        rank_id=data.rank_id,
        dashboard_id=data.dashboard_id,
    )
    
    db.add(person)
    db.commit()
    db.refresh(person)
    
    return {"id": person.id, "status": "ok"}


@router.put("/{id}")
async def update_personnel(
    id: int,
    data: PersonnelUpdate,
    db: Session = Depends(get_db)
):
    """Update personnel"""
    person = db.query(Personnel).filter(Personnel.id == id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(person, field, value)
    
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"id": id, "status": "ok"}


@router.delete("/{id}")
async def delete_personnel(id: int, db: Session = Depends(get_db)):
    """Deactivate personnel"""
    person = db.query(Personnel).filter(Personnel.id == id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    person.active = False
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"id": id, "status": "ok"}


# =============================================================================
# AUTHENTICATION
# =============================================================================

class LoginRequest(BaseModel):
    personnel_id: int
    password: str


class RegisterRequest(BaseModel):
    personnel_id: int
    email: str


class VerifyEmailRequest(BaseModel):
    personnel_id: int
    code: str


class SetPasswordRequest(BaseModel):
    personnel_id: int
    password: str


class ApproveRequest(BaseModel):
    approver_id: int
    approver_password: str


class UpdateRoleRequest(BaseModel):
    role: str  # ADMIN, OFFICER, MEMBER
    admin_id: int
    admin_password: str


@router.post("/auth/login")
async def login(
    data: LoginRequest,
    db: Session = Depends(get_db)
):
    """Verify personnel password for form access"""
    person = db.query(Personnel).filter(Personnel.id == data.personnel_id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    if not person.password_hash:
        raise HTTPException(status_code=400, detail="Not registered - please set up your account first")
    
    if not verify_password(data.password, person.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")
    
    # Update last login
    person.last_login_at = datetime.now(timezone.utc)
    db.commit()
    
    # Check approval status and allowed forms
    can_edit = True
    edit_limit = None
    
    if not person.approved_at:
        # Count how many incidents they've completed
        completed_count = db.execute(text(
            "SELECT COUNT(*) FROM incidents WHERE completed_by = :pid"
        ), {"pid": person.id}).scalar()
        
        if completed_count >= 1:
            can_edit = False
            edit_limit = "unapproved_limit_reached"
    
    return {
        "status": "ok",
        "personnel_id": person.id,
        "display_name": person.display_name,
        "role": person.role or "MEMBER",
        "is_approved": person.approved_at is not None,
        "can_edit": can_edit,
        "edit_limit": edit_limit,
    }


@router.post("/auth/register")
async def register(
    data: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Start self-registration - sends activation link to email.
    
    This is the self-service flow (user finds their name, enters email).
    Unlike admin invitations, this does NOT auto-approve.
    After clicking the link, user can edit 1 run sheet until approved by admin.
    """
    person = db.query(Personnel).filter(Personnel.id == data.personnel_id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    if person.password_hash:
        raise HTTPException(status_code=400, detail="Already registered")
    
    # Generate activation token (reuses invite_token field)
    token = generate_secure_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_TOKEN_EXPIRY_HOURS)
    
    # Store token and email, mark as self-activation
    person.email = data.email
    person.invite_token = token
    person.invite_token_expires_at = expires_at
    person.is_self_activation = True  # Key difference from admin invites
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    # Send activation email
    try:
        from email_service import send_account_verification
        
        context = get_email_context(request, db)
        success = send_account_verification(
            to_email=data.email,
            verification_token=token,
            tenant_slug=context['tenant_slug'],
            tenant_name=context['tenant_name'],
            user_name=person.first_name,
            primary_color=context.get('primary_color'),
            logo_url=context.get('logo_url')
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send email")
        
    except ImportError:
        raise HTTPException(status_code=500, detail="Email service not available")
    
    logger.info(f"Self-activation email sent to {data.email} for {person.display_name}")
    
    return {
        "status": "ok",
        "message": f"Activation link sent to {data.email}"
    }


@router.post("/auth/verify-email")
async def verify_email(
    data: VerifyEmailRequest,
    db: Session = Depends(get_db)
):
    """Verify email with code"""
    person = db.query(Personnel).filter(Personnel.id == data.personnel_id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    stored = email_verification_codes.get(data.personnel_id)
    
    if not stored:
        raise HTTPException(status_code=400, detail="No verification pending - please register first")
    
    if datetime.now(timezone.utc).timestamp() > stored["expires"]:
        del email_verification_codes[data.personnel_id]
        raise HTTPException(status_code=400, detail="Code expired - please register again")
    
    if stored["code"] != data.code:
        raise HTTPException(status_code=400, detail="Invalid code")
    
    # Mark email as verified and save it
    person.email = stored["email"]
    person.email_verified_at = datetime.now(timezone.utc)
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    # Clean up
    del email_verification_codes[data.personnel_id]
    
    return {
        "status": "ok",
        "message": "Email verified - please set your password"
    }


@router.post("/auth/set-password")
async def set_password(
    data: SetPasswordRequest,
    db: Session = Depends(get_db)
):
    """Set password after email verification"""
    person = db.query(Personnel).filter(Personnel.id == data.personnel_id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    if not person.email_verified_at:
        raise HTTPException(status_code=400, detail="Email not verified")
    
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    person.password_hash = hash_password(data.password)
    person.role = person.role or "MEMBER"  # Default to MEMBER if no role set
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {
        "status": "ok",
        "message": "Password set - you can now log in"
    }


@router.post("/{id}/approve")
async def approve_member(
    id: int,
    data: ApproveRequest,
    db: Session = Depends(get_db)
):
    """Approve a member (officer/admin only)"""
    # Verify approver
    approver = db.query(Personnel).filter(Personnel.id == data.approver_id).first()
    
    if not approver or not verify_password(data.approver_password, approver.password_hash):
        raise HTTPException(status_code=401, detail="Invalid approver credentials")
    
    if approver.role not in ["ADMIN", "OFFICER"]:
        raise HTTPException(status_code=403, detail="Only officers and admins can approve members")
    
    # Approve the member
    person = db.query(Personnel).filter(Personnel.id == id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    person.approved_at = datetime.now(timezone.utc)
    person.approved_by = approver.id
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {
        "status": "ok",
        "message": f"{person.display_name} approved by {approver.display_name}"
    }


@router.put("/{id}/role")
async def update_role(
    id: int,
    data: UpdateRoleRequest,
    db: Session = Depends(get_db)
):
    """Update personnel role (admin only)"""
    # Verify admin
    admin = db.query(Personnel).filter(Personnel.id == data.admin_id).first()
    
    if not admin or not verify_password(data.admin_password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    
    if admin.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Only admins can change roles")
    
    if data.role not in ["ADMIN", "OFFICER", "MEMBER"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    # Update role
    person = db.query(Personnel).filter(Personnel.id == id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    person.role = data.role
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {
        "status": "ok",
        "message": f"{person.display_name} role set to {data.role}"
    }


@router.get("/auth/status/{id}")
async def get_auth_status(
    id: int,
    db: Session = Depends(get_db)
):
    """Get auth status for a personnel (for UI to know what to show)"""
    person = db.query(Personnel).filter(Personnel.id == id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    return {
        "personnel_id": person.id,
        "display_name": person.display_name,
        "is_registered": person.password_hash is not None,
        "email_verified": person.email_verified_at is not None,
        "is_approved": person.approved_at is not None,
        "role": person.role,
        "email": person.email,
    }


# =============================================================================
# CSV IMPORT
# =============================================================================

# Common surname prefixes/patterns that need special capitalization
SPECIAL_SURNAMES = {
    'mcdonald': 'McDonald',
    'mcdougal': 'McDougal',
    'mccarthy': 'McCarthy',
    'mccabe': 'McCabe',
    'mcglauflin': 'McGlauflin',
    'o\'brien': "O'Brien",
    'o\'connor': "O'Connor",
    'o\'neil': "O'Neil",
    'o\'donnell': "O'Donnell",
    'decarlo': 'DeCarlo',
    'deangelo': 'DeAngelo',
    'deluca': 'DeLuca',
    'vanscoyk': 'VanScoyk',
    'vandenberg': 'VanDenberg',
    'st. john': 'St. John',
    'd\'amico': "D'Amico",
    'd\'ginto': "D'Ginto",
}

# Suffixes to handle
SUFFIXES = ['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']


def smart_capitalize(name: str) -> str:
    """Smart capitalization handling special surnames"""
    if not name:
        return name
    
    name_lower = name.lower().strip()
    
    # Check for special surnames
    if name_lower in SPECIAL_SURNAMES:
        return SPECIAL_SURNAMES[name_lower]
    
    # Check if it's a suffix
    if name_lower in SUFFIXES:
        if name_lower in ['ii', 'iii', 'iv', 'v']:
            return name.upper()
        return name.title()
    
    # Default title case
    result = name.title()
    
    # Fix Mc patterns (McDonald, etc.)
    if result.lower().startswith('mc') and len(result) > 2:
        result = 'Mc' + result[2].upper() + result[3:]
    
    # Fix O' patterns (O'Brien, etc.)
    if result.lower().startswith("o'") and len(result) > 2:
        result = "O'" + result[2].upper() + result[3:]
    
    return result


def parse_name(name_str: str) -> tuple:
    """
    Parse a name string into (first_name, last_name)
    Handles:
    - "First Last"
    - "Last, First"
    - "First Middle Last"
    - "First Last Jr."
    """
    if not name_str:
        return ('', '')
    
    name_str = name_str.strip()
    
    # Check for "Last, First" format
    if ',' in name_str:
        parts = name_str.split(',', 1)
        last_name = parts[0].strip()
        first_name = parts[1].strip() if len(parts) > 1 else ''
        return (smart_capitalize(first_name), smart_capitalize(last_name))
    
    # Split by spaces
    parts = name_str.split()
    
    if len(parts) == 0:
        return ('', '')
    elif len(parts) == 1:
        return (smart_capitalize(parts[0]), '')
    elif len(parts) == 2:
        # Check if second part is a suffix
        if parts[1].lower().rstrip('.') in [s.rstrip('.') for s in SUFFIXES]:
            return (smart_capitalize(parts[0]), smart_capitalize(parts[1]))
        return (smart_capitalize(parts[0]), smart_capitalize(parts[1]))
    else:
        # 3+ parts - check for suffix at end
        if parts[-1].lower().rstrip('.') in [s.rstrip('.') for s in SUFFIXES]:
            # Last part is suffix, second-to-last is last name
            first_name = parts[0]
            last_name = ' '.join(parts[1:])
        else:
            # First part is first name, rest is last name
            first_name = parts[0]
            last_name = ' '.join(parts[1:])
        
        return (smart_capitalize(first_name), smart_capitalize(last_name))


def detect_csv_format(headers: list) -> dict:
    """Detect the CSV format from headers"""
    headers_lower = [h.lower().strip() for h in headers]
    
    result = {
        'first_name_col': None,
        'last_name_col': None,
        'name_col': None,
        'email_col': None,
        'format': 'unknown'
    }
    
    # Look for separate first/last name columns
    for i, h in enumerate(headers_lower):
        if h in ['first_name', 'first name', 'firstname', 'first']:
            result['first_name_col'] = i
        elif h in ['last_name', 'last name', 'lastname', 'last', 'surname']:
            result['last_name_col'] = i
        elif h in ['name', 'full name', 'fullname', 'member', 'member name']:
            result['name_col'] = i
        elif h in ['email', 'email address', 'e-mail']:
            result['email_col'] = i
    
    if result['first_name_col'] is not None and result['last_name_col'] is not None:
        result['format'] = 'separate_columns'
    elif result['name_col'] is not None:
        result['format'] = 'single_column'
    
    return result


@router.post("/import/preview")
async def preview_csv_import(
    file: UploadFile = File(...)
):
    """
    Preview CSV import - shows parsed results without saving.
    Accepts various CSV formats and auto-detects columns.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    try:
        contents = await file.read()
        # Try UTF-8 first, fall back to latin-1
        try:
            csv_text = contents.decode('utf-8-sig')
        except UnicodeDecodeError:
            csv_text = contents.decode('latin-1')
        
        reader = csv.reader(io.StringIO(csv_text))
        rows = list(reader)
        
        if len(rows) < 2:
            raise HTTPException(status_code=400, detail="CSV must have headers and at least one row")
        
        headers = rows[0]
        data_rows = rows[1:]
        
        # Detect format
        format_info = detect_csv_format(headers)
        
        if format_info['format'] == 'unknown':
            # Try to guess - assume first column is name
            format_info['name_col'] = 0
            format_info['format'] = 'single_column_guessed'
        
        # Parse rows
        parsed = []
        errors = []
        
        for i, row in enumerate(data_rows):
            try:
                if format_info['format'] in ['separate_columns']:
                    first_name = smart_capitalize(row[format_info['first_name_col']].strip()) if format_info['first_name_col'] < len(row) else ''
                    last_name = smart_capitalize(row[format_info['last_name_col']].strip()) if format_info['last_name_col'] < len(row) else ''
                else:
                    name_val = row[format_info['name_col']].strip() if format_info['name_col'] < len(row) else ''
                    first_name, last_name = parse_name(name_val)
                
                email = None
                if format_info['email_col'] is not None and format_info['email_col'] < len(row):
                    email = row[format_info['email_col']].strip() or None
                
                if first_name or last_name:
                    parsed.append({
                        'row': i + 2,  # 1-indexed, plus header
                        'first_name': first_name,
                        'last_name': last_name,
                        'email': email
                    })
            except Exception as e:
                errors.append({'row': i + 2, 'error': str(e)})
        
        # Check for duplicates
        seen = {}
        duplicates = []
        for p in parsed:
            key = (p['first_name'].lower(), p['last_name'].lower())
            if key in seen:
                duplicates.append({
                    'name': f"{p['first_name']} {p['last_name']}",
                    'rows': [seen[key], p['row']]
                })
            else:
                seen[key] = p['row']
        
        return {
            'status': 'preview',
            'format_detected': format_info['format'],
            'headers_found': headers,
            'total_rows': len(data_rows),
            'parsed_count': len(parsed),
            'parsed': parsed,
            'duplicates': duplicates,
            'errors': errors
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")


@router.post("/import/execute")
async def execute_csv_import(
    file: UploadFile = File(...),
    clear_existing: bool = False,
    db: Session = Depends(get_db)
):
    """
    Execute CSV import after preview.
    Set clear_existing=true to delete all existing personnel first.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    try:
        contents = await file.read()
        try:
            csv_text = contents.decode('utf-8-sig')
        except UnicodeDecodeError:
            csv_text = contents.decode('latin-1')
        
        reader = csv.reader(io.StringIO(csv_text))
        rows = list(reader)
        
        if len(rows) < 2:
            raise HTTPException(status_code=400, detail="CSV must have headers and at least one row")
        
        headers = rows[0]
        data_rows = rows[1:]
        
        format_info = detect_csv_format(headers)
        
        if format_info['format'] == 'unknown':
            format_info['name_col'] = 0
            format_info['format'] = 'single_column_guessed'
        
        # Clear existing if requested
        if clear_existing:
            # Clear incident_personnel assignments (these are per-incident, not historical)
            db.execute(text("DELETE FROM incident_personnel"))
            # Deactivate all existing personnel (preserves FK references in incidents)
            db.execute(text("UPDATE personnel SET active = false"))
            db.commit()
        
        # Parse and insert
        imported = []
        skipped = []
        
        for i, row in enumerate(data_rows):
            try:
                if format_info['format'] in ['separate_columns']:
                    first_name = smart_capitalize(row[format_info['first_name_col']].strip()) if format_info['first_name_col'] < len(row) else ''
                    last_name = smart_capitalize(row[format_info['last_name_col']].strip()) if format_info['last_name_col'] < len(row) else ''
                else:
                    name_val = row[format_info['name_col']].strip() if format_info['name_col'] < len(row) else ''
                    first_name, last_name = parse_name(name_val)
                
                email = None
                if format_info['email_col'] is not None and format_info['email_col'] < len(row):
                    email = row[format_info['email_col']].strip() or None
                
                if not first_name and not last_name:
                    skipped.append({'row': i + 2, 'reason': 'Empty name'})
                    continue
                
                # Check for existing (by name)
                existing = db.query(Personnel).filter(
                    Personnel.first_name == first_name,
                    Personnel.last_name == last_name
                ).first()
                
                if existing:
                    skipped.append({'row': i + 2, 'reason': f'Already exists: {first_name} {last_name}'})
                    continue
                
                person = Personnel(
                    first_name=first_name,
                    last_name=last_name,
                    active=True
                )
                db.add(person)
                imported.append({
                    'first_name': first_name,
                    'last_name': last_name,
                    'email': email
                })
                
            except Exception as e:
                skipped.append({'row': i + 2, 'reason': str(e)})
        
        db.commit()
        
        return {
            'status': 'success',
            'imported_count': len(imported),
            'skipped_count': len(skipped),
            'imported': imported,
            'skipped': skipped
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")


# =============================================================================
# EMAIL-BASED AUTH: PASSWORD RESET, INVITATIONS, SELF-SERVICE
# =============================================================================

# Token expiration times
RESET_TOKEN_EXPIRY_HOURS = 1
INVITE_TOKEN_EXPIRY_HOURS = 24
EMAIL_CHANGE_TOKEN_EXPIRY_HOURS = 24


def generate_secure_token() -> str:
    """Generate a cryptographically secure token"""
    return secrets.token_urlsafe(32)


def get_email_context(request: Request, db: Session) -> dict:
    """
    Get tenant context for email sending.
    Returns tenant_slug, tenant_name, primary_color, and logo_url.
    """
    tenant_slug = getattr(request.state, 'tenant_slug', 'unknown')
    tenant = getattr(request.state, 'tenant', None)
    tenant_name = tenant.name if tenant else 'CADReport'
    
    # Use branding_config helper to get all branding
    primary_color = '#1e5631'  # Default
    logo_url = None
    station_name = None
    
    try:
        from report_engine.branding_config import get_branding
        branding = get_branding(db)
        
        station_name = branding.get('station_name')
        primary_color = branding.get('primary_color') or '#1e5631'
        
        # Build logo URL if tenant has a logo
        if branding.get('has_logo'):
            logo_url = f"https://{tenant_slug}.cadreport.com/api/branding/logo"
        
    except Exception as e:
        logger.warning(f"Failed to load branding: {e}")
    
    # Use station name if available, otherwise tenant name
    display_name = station_name or tenant_name
    
    return {
        'tenant_slug': tenant_slug,
        'tenant_name': display_name,
        'station_name': station_name,
        'primary_color': primary_color,
        'logo_url': logo_url,
    }


def get_admins_with_notifications(db: Session) -> List[str]:
    """
    Get email addresses of all admins who have admin_notifications enabled.
    """
    admins = db.query(Personnel).filter(
        Personnel.role == 'ADMIN',
        Personnel.active == True,
        Personnel.email.isnot(None),
        Personnel.email != ''
    ).all()
    
    emails = []
    for admin in admins:
        # Check notification preferences
        prefs = admin.notification_preferences or {}
        if prefs.get('admin_notifications', False):  # Default to False - must opt-in
            emails.append(admin.email)
    
    return emails


def notify_admins_of_self_activation(request: Request, db: Session, person: Personnel):
    """
    Send notification to admins when a member self-activates.
    """
    try:
        from email_service import send_admin_notification
        
        context = get_email_context(request, db)
        admin_emails = get_admins_with_notifications(db)
        
        if not admin_emails:
            logger.warning("No admins with notifications enabled to notify of self-activation")
            return
        
        message = f"""
        <p><strong>{person.first_name} {person.last_name}</strong> has self-activated their account.</p>
        <p>They can now edit one run sheet. Please review and approve their account to grant full access.</p>
        <p><strong>Email:</strong> {person.email}</p>
        """
        
        send_admin_notification(
            to_emails=admin_emails,
            tenant_slug=context['tenant_slug'],
            tenant_name=context['tenant_name'],
            notification_type='self_activation',
            subject_line=f"New Member Self-Activation: {person.first_name} {person.last_name}",
            message_body=message,
            primary_color=context.get('primary_color'),
            logo_url=context.get('logo_url')
        )
        logger.info(f"Sent self-activation notification for {person.display_name} to {len(admin_emails)} admin(s)")
    except Exception as e:
        logger.error(f"Failed to send self-activation notification: {e}")


# Pydantic models for new endpoints
class SendPasswordResetRequest(BaseModel):
    admin_id: int
    admin_password: str


class CompletePasswordResetRequest(BaseModel):
    token: str
    new_password: str


class SendInviteRequest(BaseModel):
    email: str
    admin_id: int
    admin_password: str


class AcceptInviteRequest(BaseModel):
    token: str
    password: str


class UpdateNotificationPrefsRequest(BaseModel):
    admin_notifications: Optional[bool] = None
    incident_notifications: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class RequestEmailChangeRequest(BaseModel):
    new_email: str
    password: str


# -----------------------------------------------------------------------------
# PASSWORD RESET ENDPOINTS
# -----------------------------------------------------------------------------

@router.post("/{id}/send-password-reset")
async def send_password_reset(
    id: int,
    data: SendPasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Admin/officer sends password reset email to a personnel member.
    The member will receive an email with a link to set a new password.
    """
    # Verify requester is admin or officer
    requester = db.query(Personnel).filter(Personnel.id == data.admin_id).first()
    if not requester or not verify_password(data.admin_password, requester.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if requester.role not in ['ADMIN', 'OFFICER']:
        raise HTTPException(status_code=403, detail="Only admins and officers can send password resets")
    
    # Get the target person
    person = db.query(Personnel).filter(Personnel.id == id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    if not person.email:
        raise HTTPException(status_code=400, detail="Personnel has no email address")
    if not person.password_hash:
        raise HTTPException(status_code=400, detail="Personnel has not registered yet - use invitation instead")
    
    # Generate token
    token = generate_secure_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=RESET_TOKEN_EXPIRY_HOURS)
    
    person.reset_token = token
    person.reset_token_expires_at = expires_at
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    # Send email
    try:
        from email_service import send_password_reset as send_reset_email
        
        context = get_email_context(request, db)
        success = send_reset_email(
            to_email=person.email,
            reset_token=token,
            tenant_slug=context['tenant_slug'],
            tenant_name=context['tenant_name'],
            user_name=person.first_name,
            primary_color=context.get('primary_color'),
            logo_url=context.get('logo_url')
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send email")
        
    except ImportError:
        raise HTTPException(status_code=500, detail="Email service not available")
    
    logger.info(f"Password reset sent to {person.email} by {requester.display_name}")
    
    return {
        "status": "ok",
        "message": f"Password reset email sent to {person.email}"
    }


@router.get("/auth/validate-reset/{token}")
async def validate_reset_token(
    token: str,
    db: Session = Depends(get_db)
):
    """
    Validate a password reset token (frontend calls this to show the form).
    """
    person = db.query(Personnel).filter(Personnel.reset_token == token).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Invalid or expired reset link")
    
    if person.reset_token_expires_at and person.reset_token_expires_at < datetime.now(timezone.utc):
        # Clear expired token
        person.reset_token = None
        person.reset_token_expires_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="Reset link has expired")
    
    return {
        "valid": True,
        "personnel_id": person.id,
        "display_name": person.display_name,
        "email": person.email
    }


@router.post("/auth/complete-reset")
async def complete_password_reset(
    data: CompletePasswordResetRequest,
    db: Session = Depends(get_db)
):
    """
    Complete password reset using token from email.
    """
    person = db.query(Personnel).filter(Personnel.reset_token == data.token).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Invalid or expired reset link")
    
    if person.reset_token_expires_at and person.reset_token_expires_at < datetime.now(timezone.utc):
        person.reset_token = None
        person.reset_token_expires_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="Reset link has expired")
    
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Set new password and clear token
    person.password_hash = hash_password(data.new_password)
    person.reset_token = None
    person.reset_token_expires_at = None
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    logger.info(f"Password reset completed for {person.display_name}")
    
    return {
        "status": "ok",
        "message": "Password has been reset successfully"
    }


# -----------------------------------------------------------------------------
# INVITATION ENDPOINTS
# -----------------------------------------------------------------------------

@router.post("/{id}/send-invite")
async def send_invite(
    id: int,
    data: SendInviteRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Admin sends invitation email to a personnel member.
    When they accept, they are automatically activated AND approved.
    """
    # Verify requester is admin
    requester = db.query(Personnel).filter(Personnel.id == data.admin_id).first()
    if not requester or not verify_password(data.admin_password, requester.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if requester.role != 'ADMIN':
        raise HTTPException(status_code=403, detail="Only admins can send invitations")
    
    # Get the target person
    person = db.query(Personnel).filter(Personnel.id == id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    if person.password_hash:
        raise HTTPException(status_code=400, detail="Personnel already has an account - use password reset instead")
    
    # Generate token
    token = generate_secure_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_TOKEN_EXPIRY_HOURS)
    
    # Update person with email and invite token
    person.email = data.email
    person.invite_token = token
    person.invite_token_expires_at = expires_at
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    # Send email
    try:
        from email_service import send_invitation
        
        context = get_email_context(request, db)
        success = send_invitation(
            to_email=data.email,
            invite_token=token,
            tenant_slug=context['tenant_slug'],
            tenant_name=context['tenant_name'],
            user_name=person.first_name,
            inviter_name=requester.display_name,
            primary_color=context.get('primary_color'),
            logo_url=context.get('logo_url')
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send email")
        
    except ImportError:
        raise HTTPException(status_code=500, detail="Email service not available")
    
    logger.info(f"Invitation sent to {data.email} for {person.display_name} by {requester.display_name}")
    
    return {
        "status": "ok",
        "message": f"Invitation email sent to {data.email}"
    }


@router.post("/{id}/resend-invite")
async def resend_invite(
    id: int,
    data: SendPasswordResetRequest,  # Reuse same schema (admin_id, admin_password)
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Admin resends invitation email (generates new token).
    """
    # Verify requester is admin
    requester = db.query(Personnel).filter(Personnel.id == data.admin_id).first()
    if not requester or not verify_password(data.admin_password, requester.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if requester.role != 'ADMIN':
        raise HTTPException(status_code=403, detail="Only admins can resend invitations")
    
    # Get the target person
    person = db.query(Personnel).filter(Personnel.id == id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    if not person.email:
        raise HTTPException(status_code=400, detail="Personnel has no email address")
    if person.password_hash:
        raise HTTPException(status_code=400, detail="Personnel already has an account")
    
    # Generate new token
    token = generate_secure_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_TOKEN_EXPIRY_HOURS)
    
    person.invite_token = token
    person.invite_token_expires_at = expires_at
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    # Send email
    try:
        from email_service import send_invitation
        
        context = get_email_context(request, db)
        success = send_invitation(
            to_email=person.email,
            invite_token=token,
            tenant_slug=context['tenant_slug'],
            tenant_name=context['tenant_name'],
            user_name=person.first_name,
            inviter_name=requester.display_name,
            primary_color=context.get('primary_color'),
            logo_url=context.get('logo_url')
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send email")
        
    except ImportError:
        raise HTTPException(status_code=500, detail="Email service not available")
    
    logger.info(f"Invitation resent to {person.email} for {person.display_name} by {requester.display_name}")
    
    return {
        "status": "ok",
        "message": f"Invitation email resent to {person.email}"
    }


@router.get("/auth/validate-invite/{token}")
async def validate_invite_token(
    token: str,
    db: Session = Depends(get_db)
):
    """
    Validate an invitation or self-activation token.
    Frontend calls this to show the accept form.
    """
    person = db.query(Personnel).filter(Personnel.invite_token == token).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Invalid or expired activation link")
    
    if person.invite_token_expires_at and person.invite_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Activation link has expired - please request a new one")
    
    return {
        "valid": True,
        "personnel_id": person.id,
        "display_name": person.display_name,
        "email": person.email,
        "first_name": person.first_name,
        "last_name": person.last_name,
        "is_self_activation": person.is_self_activation or False
    }


@router.post("/auth/accept-invite")
async def accept_invite(
    data: AcceptInviteRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Accept invitation or self-activation - sets password and activates account.
    
    If is_self_activation=True: Does NOT auto-approve, notifies admins
    If is_self_activation=False: Auto-approves (admin-sent invite)
    """
    person = db.query(Personnel).filter(Personnel.invite_token == data.token).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation link")
    
    if person.invite_token_expires_at and person.invite_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invitation has expired - please request a new one")
    
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Check if this is self-activation vs admin invite
    is_self_activation = person.is_self_activation or False
    
    # Set password and mark email verified
    now = datetime.now(timezone.utc)
    person.password_hash = hash_password(data.password)
    person.email_verified_at = now
    person.role = person.role or 'MEMBER'  # Default to MEMBER if not set
    person.invite_token = None
    person.invite_token_expires_at = None
    person.is_self_activation = False  # Clear the flag
    person.last_login_at = now
    person.updated_at = now
    
    # Only auto-approve if this was an admin invitation (not self-activation)
    if not is_self_activation:
        person.approved_at = now
        person.approved_by = None  # Approved via invitation (no specific approver)
        logger.info(f"Invitation accepted by {person.display_name} - auto-approved")
    else:
        # Self-activation: NOT approved, can edit 1 form
        logger.info(f"Self-activation completed by {person.display_name} - pending approval")
    
    # Set default notification preferences
    if not person.notification_preferences:
        person.notification_preferences = {'admin_notifications': False, 'incident_notifications': False}
    
    db.commit()
    
    # If self-activation, notify admins
    if is_self_activation:
        notify_admins_of_self_activation(request, db, person)
    
    # Get tenant info and create tenant session for auto-login
    tenant = getattr(request.state, 'tenant', None)
    tenant_slug = getattr(request.state, 'tenant_slug', None)
    session_token = None
    
    if tenant:
        try:
            from master_database import get_master_session
            from master_models import TenantSession
            
            # Create tenant session
            master_db = next(get_master_session())
            session_token = secrets.token_urlsafe(32)
            tenant_session = TenantSession(
                tenant_id=tenant.id,
                session_token=session_token,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                expires_at=None,
            )
            master_db.add(tenant_session)
            master_db.commit()
            
            logger.info(f"Auto-login tenant session created for {person.display_name}")
            
        except Exception as e:
            logger.error(f"Failed to create tenant session for auto-login: {e}")
            # Don't fail the invite acceptance, just skip auto-login
    
    # Send welcome email with tenant password
    try:
        from email_service import send_welcome_with_tenant_password
        
        context = get_email_context(request, db)
        
        # We'll send a welcome email
        send_welcome_with_tenant_password(
            to_email=person.email,
            tenant_slug=context['tenant_slug'],
            tenant_name=context['tenant_name'],
            user_name=person.first_name,
            user_display_name=f"{person.first_name} {person.last_name}",
            primary_color=context.get('primary_color'),
            logo_url=context.get('logo_url')
        )
        
    except ImportError:
        logger.warning("Welcome email function not available")
    except Exception as e:
        logger.error(f"Failed to send welcome email: {e}")
        # Don't fail the invite acceptance
    
    # Build response with cookie
    response_data = {
        "status": "ok",
        "message": "Account created successfully",
        "personnel_id": person.id,
        "display_name": person.display_name,
        "role": person.role,
        "auto_login": session_token is not None
    }
    
    response = JSONResponse(content=response_data)
    
    # Set the tenant session cookie on the actual response
    if session_token:
        response.set_cookie(
            key="tenant_session",
            value=session_token,
            max_age=60 * 60 * 24 * 365,  # 1 year
            httponly=True,
            secure=False,  # Set True in production with HTTPS
            samesite="lax",
        )
        logger.info(f"Set tenant_session cookie for {person.display_name}")
    
    return response


# -----------------------------------------------------------------------------
# USER SELF-SERVICE ENDPOINTS
# -----------------------------------------------------------------------------

@router.get("/me")
async def get_my_profile(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get current user's profile.
    Requires personnel_id in query params (frontend knows who's logged in).
    """
    # Note: In a full implementation, we'd get this from a session/JWT
    # For now, frontend passes personnel_id
    personnel_id = request.query_params.get('personnel_id')
    if not personnel_id:
        raise HTTPException(status_code=400, detail="personnel_id required")
    
    person = db.query(Personnel).filter(Personnel.id == int(personnel_id)).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    return {
        "id": person.id,
        "first_name": person.first_name,
        "last_name": person.last_name,
        "display_name": person.display_name,
        "email": person.email,
        "role": person.role,
        "is_approved": person.approved_at is not None,
        "notification_preferences": person.notification_preferences or {},
        "pending_email": person.pending_email,
    }


@router.put("/me/notifications")
async def update_my_notifications(
    data: UpdateNotificationPrefsRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Update current user's notification preferences.
    """
    personnel_id = request.query_params.get('personnel_id')
    if not personnel_id:
        raise HTTPException(status_code=400, detail="personnel_id required")
    
    person = db.query(Personnel).filter(Personnel.id == int(personnel_id)).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    # Update preferences
    prefs = person.notification_preferences or {}
    if data.admin_notifications is not None:
        prefs['admin_notifications'] = data.admin_notifications
    if data.incident_notifications is not None:
        prefs['incident_notifications'] = data.incident_notifications
    
    person.notification_preferences = prefs
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {
        "status": "ok",
        "notification_preferences": person.notification_preferences
    }


@router.post("/me/change-password")
async def change_my_password(
    data: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Change current user's password (requires current password).
    """
    personnel_id = request.query_params.get('personnel_id')
    if not personnel_id:
        raise HTTPException(status_code=400, detail="personnel_id required")
    
    person = db.query(Personnel).filter(Personnel.id == int(personnel_id)).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    if not person.password_hash:
        raise HTTPException(status_code=400, detail="No password set")
    
    if not verify_password(data.current_password, person.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
    person.password_hash = hash_password(data.new_password)
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    logger.info(f"Password changed by {person.display_name}")
    
    return {
        "status": "ok",
        "message": "Password changed successfully"
    }


@router.post("/me/request-email-change")
async def request_email_change(
    data: RequestEmailChangeRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Request email address change - sends verification to NEW email.
    """
    personnel_id = request.query_params.get('personnel_id')
    if not personnel_id:
        raise HTTPException(status_code=400, detail="personnel_id required")
    
    person = db.query(Personnel).filter(Personnel.id == int(personnel_id)).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    if not person.password_hash:
        raise HTTPException(status_code=400, detail="No password set")
    
    if not verify_password(data.password, person.password_hash):
        raise HTTPException(status_code=401, detail="Password is incorrect")
    
    # Check if email is already in use
    existing = db.query(Personnel).filter(
        Personnel.email == data.new_email,
        Personnel.id != person.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email address is already in use")
    
    # Generate token
    token = generate_secure_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=EMAIL_CHANGE_TOKEN_EXPIRY_HOURS)
    
    person.pending_email = data.new_email
    person.pending_email_token = token
    person.pending_email_expires_at = expires_at
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    # Send verification email to NEW address
    try:
        from email_service import send_email_change_verification
        
        context = get_email_context(request, db)
        success = send_email_change_verification(
            to_email=data.new_email,
            verification_token=token,
            tenant_slug=context['tenant_slug'],
            tenant_name=context['tenant_name'],
            user_name=person.first_name,
            primary_color=context.get('primary_color'),
            logo_url=context.get('logo_url')
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send verification email")
        
    except ImportError:
        raise HTTPException(status_code=500, detail="Email service not available")
    
    logger.info(f"Email change requested by {person.display_name}: {person.email} -> {data.new_email}")
    
    return {
        "status": "ok",
        "message": f"Verification email sent to {data.new_email}"
    }


@router.get("/auth/validate-email-change/{token}")
async def validate_email_change_token(
    token: str,
    db: Session = Depends(get_db)
):
    """
    Validate email change token (frontend calls this).
    """
    person = db.query(Personnel).filter(Personnel.pending_email_token == token).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Invalid or expired verification link")
    
    if person.pending_email_expires_at and person.pending_email_expires_at < datetime.now(timezone.utc):
        # Clear expired token
        person.pending_email = None
        person.pending_email_token = None
        person.pending_email_expires_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="Verification link has expired")
    
    return {
        "valid": True,
        "personnel_id": person.id,
        "display_name": person.display_name,
        "current_email": person.email,
        "new_email": person.pending_email
    }


@router.post("/auth/confirm-email-change")
async def confirm_email_change(
    token: str,
    db: Session = Depends(get_db)
):
    """
    Confirm email change using token from verification email.
    """
    person = db.query(Personnel).filter(Personnel.pending_email_token == token).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Invalid or expired verification link")
    
    if person.pending_email_expires_at and person.pending_email_expires_at < datetime.now(timezone.utc):
        person.pending_email = None
        person.pending_email_token = None
        person.pending_email_expires_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="Verification link has expired")
    
    old_email = person.email
    new_email = person.pending_email
    
    # Apply the email change
    person.email = person.pending_email
    person.pending_email = None
    person.pending_email_token = None
    person.pending_email_expires_at = None
    person.email_verified_at = datetime.now(timezone.utc)  # Re-verify
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    logger.info(f"Email changed for {person.display_name}: {old_email} -> {new_email}")
    
    return {
        "status": "ok",
        "message": "Email address updated successfully",
        "new_email": new_email
    }


# -----------------------------------------------------------------------------
# UPDATE LIST ENDPOINT TO INCLUDE NEW FIELDS
# -----------------------------------------------------------------------------

@router.get("/{id}/full")
async def get_personnel_full(
    id: int,
    db: Session = Depends(get_db)
):
    """
    Get full personnel details including auth and notification info.
    For admin view in personnel modal.
    """
    person = db.query(Personnel).filter(Personnel.id == id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    rank = None
    if person.rank_id:
        rank = db.query(Rank).filter(Rank.id == person.rank_id).first()
    
    approver = None
    if person.approved_by:
        approver = db.query(Personnel).filter(Personnel.id == person.approved_by).first()
    
    return {
        "id": person.id,
        "first_name": person.first_name,
        "last_name": person.last_name,
        "display_name": person.display_name,
        "rank_id": person.rank_id,
        "rank_name": rank.rank_name if rank else None,
        "active": person.active,
        "email": person.email,
        "role": person.role,
        "is_registered": person.password_hash is not None,
        "is_approved": person.approved_at is not None,
        "email_verified": person.email_verified_at is not None,
        "approved_at": person.approved_at.isoformat() if person.approved_at else None,
        "approved_by": approver.display_name if approver else None,
        "last_login_at": person.last_login_at.isoformat() if person.last_login_at else None,
        "notification_preferences": person.notification_preferences or {},
        "has_pending_invite": person.invite_token is not None,
        "invite_expired": (
            person.invite_token is not None and 
            person.invite_token_expires_at is not None and 
            person.invite_token_expires_at < datetime.now(timezone.utc)
        ),
        "pending_email": person.pending_email,
    }


# =============================================================================
# DASHBOARD SYNC (Placeholder)
# =============================================================================

@router.post("/sync-from-dashboard")
async def sync_from_dashboard(db: Session = Depends(get_db)):
    """
    Placeholder for syncing personnel from Dashboard database.
    Future: Connect to dashboard_db and import personnel.
    """
    # TODO: Implement when ready to connect
    # This would:
    # 1. Connect to dashboard_db
    # 2. Query personnel table
    # 3. Insert/update records here with dashboard_id set
    
    return {"status": "not_implemented", "message": "Dashboard sync not yet configured"}
