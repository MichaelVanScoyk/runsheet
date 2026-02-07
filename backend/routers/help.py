"""
Help System Router - CRUD for contextual help topics

Manages the help_texts table for in-app contextual help:
- Per-page help entries with element targeting via data-help-id
- Role-based visibility (MEMBER, OFFICER, ADMIN)
- "What's New" flagging for feature updates
- Tour mode via sort_order sequencing
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import List, Optional

from database import get_db

router = APIRouter()


# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class HelpTextCreate(BaseModel):
    page_key: str
    element_key: str
    title: str
    body: str
    sort_order: Optional[int] = 100
    min_role: Optional[str] = None
    is_new: Optional[bool] = False
    version_added: Optional[str] = None

class HelpTextUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    sort_order: Optional[int] = None
    min_role: Optional[str] = None
    is_new: Optional[bool] = None
    version_added: Optional[str] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/pages")
async def get_help_pages(db: Session = Depends(get_db)):
    """Get list of all page_keys that have help entries"""
    result = db.execute(text(
        "SELECT DISTINCT page_key, COUNT(*) as entry_count FROM help_texts GROUP BY page_key ORDER BY page_key"
    ))
    return [{"page_key": row[0], "entry_count": row[1]} for row in result]


@router.get("/page/{page_key:path}")
async def get_help_for_page(
    page_key: str,
    role: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all help entries for a specific page, optionally filtered by role."""
    if role:
        role_filter = _get_role_filter(role)
        result = db.execute(
            text("""
                SELECT id, page_key, element_key, title, body, sort_order,
                       min_role, is_new, version_added, created_by, updated_at
                FROM help_texts
                WHERE page_key = :page_key
                  AND (min_role IS NULL OR min_role IN :roles)
                ORDER BY sort_order, id
            """),
            {"page_key": page_key, "roles": tuple(role_filter)}
        )
    else:
        result = db.execute(
            text("""
                SELECT id, page_key, element_key, title, body, sort_order,
                       min_role, is_new, version_added, created_by, updated_at
                FROM help_texts
                WHERE page_key = :page_key
                ORDER BY sort_order, id
            """),
            {"page_key": page_key}
        )
    return [_row_to_dict(row) for row in result]


@router.get("")
async def get_all_help(db: Session = Depends(get_db)):
    """Get all help entries (for admin management)"""
    result = db.execute(text("""
        SELECT id, page_key, element_key, title, body, sort_order,
               min_role, is_new, version_added, created_by, updated_at
        FROM help_texts
        ORDER BY page_key, sort_order, id
    """))
    return [_row_to_dict(row) for row in result]


@router.post("")
async def create_help_text(
    data: HelpTextCreate,
    created_by: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Create a new help entry"""
    existing = db.execute(
        text("SELECT id FROM help_texts WHERE page_key = :pk AND element_key = :ek"),
        {"pk": data.page_key, "ek": data.element_key}
    ).fetchone()

    if existing:
        raise HTTPException(status_code=400, detail=f"Help entry already exists for {data.page_key}/{data.element_key}")

    result = db.execute(
        text("""
            INSERT INTO help_texts (page_key, element_key, title, body, sort_order,
                                    min_role, is_new, version_added, created_by)
            VALUES (:page_key, :element_key, :title, :body, :sort_order,
                    :min_role, :is_new, :version_added, :created_by)
            RETURNING id
        """),
        {
            "page_key": data.page_key, "element_key": data.element_key,
            "title": data.title, "body": data.body,
            "sort_order": data.sort_order or 100,
            "min_role": data.min_role, "is_new": data.is_new or False,
            "version_added": data.version_added, "created_by": created_by,
        }
    )
    db.commit()
    return {"status": "ok", "id": result.fetchone()[0]}


@router.put("/{help_id}")
async def update_help_text(help_id: int, data: HelpTextUpdate, db: Session = Depends(get_db)):
    """Update an existing help entry"""
    updates = []
    params = {"id": help_id}

    if data.title is not None:
        updates.append("title = :title"); params["title"] = data.title
    if data.body is not None:
        updates.append("body = :body"); params["body"] = data.body
    if data.sort_order is not None:
        updates.append("sort_order = :sort_order"); params["sort_order"] = data.sort_order
    if data.min_role is not None:
        updates.append("min_role = :min_role"); params["min_role"] = data.min_role if data.min_role != "" else None
    if data.is_new is not None:
        updates.append("is_new = :is_new"); params["is_new"] = data.is_new
    if data.version_added is not None:
        updates.append("version_added = :version_added"); params["version_added"] = data.version_added if data.version_added != "" else None

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = NOW()")
    query = f"UPDATE help_texts SET {', '.join(updates)} WHERE id = :id RETURNING id"
    result = db.execute(text(query), params)
    db.commit()

    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Help entry not found")
    return {"status": "ok"}


@router.delete("/{help_id}")
async def delete_help_text(help_id: int, db: Session = Depends(get_db)):
    """Delete a help entry"""
    result = db.execute(text("DELETE FROM help_texts WHERE id = :id RETURNING id"), {"id": help_id})
    db.commit()
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Help entry not found")
    return {"status": "ok"}


@router.get("/element-keys/{page_key:path}")
async def get_available_element_keys(page_key: str, db: Session = Depends(get_db)):
    """Get element_keys that already have help entries for a page."""
    result = db.execute(
        text("SELECT element_key FROM help_texts WHERE page_key = :pk ORDER BY element_key"),
        {"pk": page_key}
    )
    return [row[0] for row in result]


# =============================================================================
# HELPERS
# =============================================================================

def _get_role_filter(role: str) -> list:
    if role == "ADMIN": return ["MEMBER", "OFFICER", "ADMIN"]
    elif role == "OFFICER": return ["MEMBER", "OFFICER"]
    return ["MEMBER"]

def _row_to_dict(row) -> dict:
    return {
        "id": row[0], "page_key": row[1], "element_key": row[2],
        "title": row[3], "body": row[4], "sort_order": row[5],
        "min_role": row[6], "is_new": row[7], "version_added": row[8],
        "created_by": row[9],
        "updated_at": row[10].isoformat() if row[10] else None,
    }
