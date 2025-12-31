"""
Print Layout Router - V4 Layout Configuration

Handles print layout get/save/reset operations.
Layout is stored per-tenant in their settings table.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
import json

from database import get_db
from report_engine.layout_config import DEFAULT_PRINT_LAYOUT, get_layout, validate_layout

router = APIRouter()


@router.get("")
async def get_print_layout(db: Session = Depends(get_db)):
    return get_layout(db)


@router.put("")
async def update_print_layout(layout: dict, db: Session = Depends(get_db)):
    errors = validate_layout(layout)
    if errors:
        raise HTTPException(status_code=400, detail={"message": "Invalid layout", "errors": errors})
    
    layout_json = json.dumps(layout)
    
    exists = db.execute(
        text("SELECT 1 FROM settings WHERE category = 'print' AND key = 'layout'")
    ).fetchone()
    
    if exists:
        db.execute(
            text("UPDATE settings SET value = :value, value_type = 'json', updated_at = NOW() WHERE category = 'print' AND key = 'layout'"),
            {"value": layout_json}
        )
    else:
        db.execute(
            text("INSERT INTO settings (category, key, value, value_type, description) VALUES ('print', 'layout', :value, 'json', 'Print layout configuration V4')"),
            {"value": layout_json}
        )
    
    db.commit()
    return {"status": "ok", "message": "Layout saved", "version": layout.get("version")}


@router.post("/reset")
async def reset_print_layout(db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM settings WHERE category = 'print' AND key = 'layout'"))
    db.commit()
    return {"status": "ok", "message": "Layout reset to defaults", "version": DEFAULT_PRINT_LAYOUT["version"]}


@router.get("/defaults")
async def get_default_layout():
    return DEFAULT_PRINT_LAYOUT


@router.get("/blocks")
async def get_all_blocks(db: Session = Depends(get_db)):
    layout = get_layout(db)
    return {
        "version": layout.get("version"),
        "blocks": layout.get("blocks", []),
        "total": len(layout.get("blocks", [])),
    }


@router.put("/blocks/{block_id}")
async def update_block(block_id: str, updates: dict, db: Session = Depends(get_db)):
    layout = get_layout(db)
    
    block_found = False
    for block in layout.get("blocks", []):
        if block.get("id") == block_id:
            if block.get("locked") and "page" in updates:
                if updates["page"] != block.get("page"):
                    raise HTTPException(status_code=400, detail=f"Block '{block_id}' is locked")
            
            allowed_fields = ["enabled", "page", "row", "order", "width"]
            for field in allowed_fields:
                if field in updates:
                    block[field] = updates[field]
            
            block_found = True
            break
    
    if not block_found:
        raise HTTPException(status_code=404, detail=f"Block '{block_id}' not found")
    
    layout_json = json.dumps(layout)
    
    exists = db.execute(
        text("SELECT 1 FROM settings WHERE category = 'print' AND key = 'layout'")
    ).fetchone()
    
    if exists:
        db.execute(
            text("UPDATE settings SET value = :value, updated_at = NOW() WHERE category = 'print' AND key = 'layout'"),
            {"value": layout_json}
        )
    else:
        db.execute(
            text("INSERT INTO settings (category, key, value, value_type) VALUES ('print', 'layout', :value, 'json')"),
            {"value": layout_json}
        )
    
    db.commit()
    return {"status": "ok", "block_id": block_id, "updates": updates}
