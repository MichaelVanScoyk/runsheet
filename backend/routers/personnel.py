"""
Personnel router - manage run sheet personnel
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import csv
import io
import re
import hashlib
import secrets

from database import get_db
from models import Personnel, Rank

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
    db: Session = Depends(get_db)
):
    """Start registration - send verification code to email"""
    person = db.query(Personnel).filter(Personnel.id == data.personnel_id).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    if person.password_hash:
        raise HTTPException(status_code=400, detail="Already registered")
    
    # Generate 6-digit code
    code = ''.join([str(secrets.randbelow(10)) for _ in range(6)])
    
    # Store code (expires in 15 minutes)
    email_verification_codes[data.personnel_id] = {
        "code": code,
        "email": data.email,
        "expires": datetime.now(timezone.utc).timestamp() + 900  # 15 min
    }
    
    # TODO: Actually send email
    # For now, return the code for testing (remove in production!)
    print(f"VERIFICATION CODE for {person.display_name}: {code}")
    
    return {
        "status": "ok",
        "message": f"Verification code sent to {data.email}",
        # TEMPORARY - remove in production:
        "debug_code": code
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
