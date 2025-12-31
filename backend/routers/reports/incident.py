"""
Incident Report Router - Individual Runsheet HTML/PDF
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
from typing import Dict, List, Optional
import io

from database import get_db
from report_engine.branding_config import get_branding
from report_engine.layout_config import get_layout, get_page_blocks, get_blocks_by_row
from report_engine.templates import generate_css, generate_base_html, render_header
from report_engine.renderers import RenderContext, FIELD_RENDERERS, render_field, render_row

router = APIRouter()


def _load_incident_context(db: Session, incident_id: int) -> tuple:
    incident = db.execute(
        text("SELECT * FROM incidents WHERE id = :id AND deleted_at IS NULL"),
        {"id": incident_id}
    ).fetchone()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    inc = dict(incident._mapping)
    
    personnel_rows = db.execute(text("SELECT id, first_name, last_name FROM personnel")).fetchall()
    personnel_lookup = {p[0]: f"{p[2]}, {p[1]}" for p in personnel_rows}
    
    apparatus_rows = db.execute(text("""
        SELECT id, unit_designator, name, ff_slots, unit_category 
        FROM apparatus WHERE active = true ORDER BY display_order, unit_designator
    """)).fetchall()
    apparatus_list = [{'id': a[0], 'unit_designator': a[1], 'name': a[2], 'ff_slots': a[3] or 4, 'unit_category': a[4] or 'APPARATUS'} for a in apparatus_rows]
    
    personnel_assignments = {}
    unit_rows = db.execute(text("""
        SELECT iu.id, iu.apparatus_id, a.unit_designator, a.unit_category
        FROM incident_units iu JOIN apparatus a ON iu.apparatus_id = a.id
        WHERE iu.incident_id = :incident_id
    """), {"incident_id": incident_id}).fetchall()
    
    for unit_row in unit_rows:
        unit_id, apparatus_id, unit_designator, unit_category = unit_row
        pers_rows = db.execute(text("""
            SELECT personnel_id, slot_index FROM incident_personnel
            WHERE incident_unit_id = :unit_id ORDER BY slot_index
        """), {"unit_id": unit_id}).fetchall()
        
        if unit_category in ('DIRECT', 'STATION'):
            slots = [p[0] for p in pers_rows if p[0]]
        else:
            slots = [None] * 6
            for p in pers_rows:
                if p[1] is not None and 0 <= p[1] < 6:
                    slots[p[1]] = p[0]
        
        personnel_assignments[unit_designator] = slots
    
    return inc, personnel_lookup, apparatus_list, personnel_assignments


def _create_time_formatter(db: Session):
    try:
        from settings_helper import format_local_time
        return lambda dt: format_local_time(dt, include_seconds=True) if dt else ''
    except ImportError:
        def fmt(dt):
            if not dt:
                return ''
            return dt.strftime('%H:%M:%S')
        return fmt


@router.get("/html/incident/{incident_id}")
async def get_incident_html_report(incident_id: int, db: Session = Depends(get_db)):
    inc, personnel_lookup, apparatus_list, personnel_assignments = _load_incident_context(db, incident_id)
    branding = get_branding(db)
    
    call_category = inc.get('call_category', 'FIRE') or 'FIRE'
    
    ctx = RenderContext(
        incident=inc,
        branding=branding,
        personnel_lookup=personnel_lookup,
        apparatus_list=apparatus_list,
        personnel_assignments=personnel_assignments,
        time_formatter=_create_time_formatter(db),
    )
    
    page1_blocks = get_page_blocks(db, 1, call_category)
    page2_blocks = get_page_blocks(db, 2, call_category)
    
    css = generate_css(branding)
    page1_html = _render_page(ctx, page1_blocks, branding, is_first_page=True)
    
    page2_html = ""
    if page2_blocks:
        page2_content = _render_page(ctx, page2_blocks, branding, is_first_page=False)
        if page2_content.strip():
            page2_html = f'<div class="page-break"></div>{page2_content}'
    
    body_html = page1_html + page2_html
    watermark = branding.get('watermark_text')
    
    title = f"Incident {inc.get('internal_incident_number', '')}"
    html = generate_base_html(title, css, body_html, watermark)
    
    return HTMLResponse(content=html)


def _render_page(ctx: RenderContext, blocks: List[dict], branding: dict, is_first_page: bool = True) -> str:
    """Render a page of blocks using the render_row function which applies style settings."""
    parts = []
    rows = get_blocks_by_row(blocks)
    
    # Find blocks that should be positioned in header
    header_positioned_blocks = [b for b in blocks if b.get('headerPosition')]
    
    for row_num in sorted(rows.keys()):
        row_blocks = rows[row_num]
        
        # Header (row 0) - rendered specially
        if row_num == 0 and is_first_page:
            header_block = next((b for b in row_blocks if b.get('id') == 'header'), None)
            if header_block and header_block.get('enabled', True):
                header_html = render_header(branding)
                
                # If there are header-positioned blocks, wrap header with them
                if header_positioned_blocks:
                    hp_html_parts = []
                    for hp_block in header_positioned_blocks:
                        hp_content = render_field(ctx, hp_block)
                        if hp_content:
                            hp_html_parts.append(f'<div class="header-position">{hp_content}</div>')
                    
                    hp_html = ''.join(hp_html_parts)
                    parts.append(f'<div class="header-wrapper">{header_html}{hp_html}</div>')
                else:
                    parts.append(header_html)
            continue
        
        # Footer (row 99) - rendered specially
        if row_num == 99:
            footer_block = next((b for b in row_blocks if b.get('id') == 'footer'), None)
            if footer_block and footer_block.get('enabled', True):
                footer_html = render_field(ctx, footer_block)
                if footer_html:
                    # Check if sticky footer is enabled
                    if footer_block.get('stickyFooter'):
                        parts.append(f'<div class="footer-sticky">{footer_html}</div>')
                    else:
                        parts.append(footer_html)
            continue
        
        # Filter out header-positioned blocks from normal rendering
        normal_row_blocks = [b for b in row_blocks if not b.get('headerPosition')]
        if not normal_row_blocks:
            continue
        
        # Normal rows - use render_row which applies fontSize, bold, labelBold, hideLabel
        row_html = render_row(ctx, normal_row_blocks)
        if row_html:
            parts.append(row_html)
    
    return '\n'.join(parts)


@router.get("/pdf/incident/{incident_id}")
async def get_incident_pdf(incident_id: int, db: Session = Depends(get_db)):
    from weasyprint import HTML
    
    html_response = await get_incident_html_report(incident_id, db)
    html_content = html_response.body.decode('utf-8')
    
    incident = db.execute(
        text("SELECT internal_incident_number, incident_date FROM incidents WHERE id = :id"),
        {"id": incident_id}
    ).fetchone()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    incident_number = incident[0] or f"INC{incident_id}"
    incident_date = incident[1] or datetime.now().date()
    
    pdf_buffer = io.BytesIO()
    HTML(string=html_content).write_pdf(pdf_buffer)
    pdf_buffer.seek(0)
    
    filename = f"incident_{incident_number}_{incident_date}.pdf"
    
    return StreamingResponse(pdf_buffer, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename={filename}"})


@router.get("/preview/incident/{incident_id}")
async def preview_incident_report(incident_id: int, db: Session = Depends(get_db)):
    inc, personnel_lookup, apparatus_list, personnel_assignments = _load_incident_context(db, incident_id)
    branding = get_branding(db)
    layout = get_layout(db)
    
    total_personnel = sum(len([s for s in slots if s]) for slots in personnel_assignments.values())
    
    assigned_apparatus = []
    assigned_direct = []
    assigned_station = []
    
    for a in apparatus_list:
        unit_id = a['unit_designator']
        if personnel_assignments.get(unit_id) and any(s for s in personnel_assignments[unit_id]):
            if a['unit_category'] == 'APPARATUS':
                assigned_apparatus.append(a)
            elif a['unit_category'] == 'DIRECT':
                assigned_direct.append(a)
            elif a['unit_category'] == 'STATION':
                assigned_station.append(a)
    
    return {
        "incident": {
            "id": inc.get('id'),
            "internal_incident_number": inc.get('internal_incident_number'),
            "cad_event_number": inc.get('cad_event_number'),
            "call_category": inc.get('call_category'),
            "status": inc.get('status'),
            "incident_date": str(inc.get('incident_date', '')),
            "address": inc.get('address'),
            "municipality_code": inc.get('municipality_code'),
        },
        "branding": {
            "station_name": branding.get('station_name'),
            "header_style": branding.get('header_style'),
            "has_logo": bool(branding.get('logo_data')),
        },
        "layout": {"version": layout.get('version'), "total_blocks": len(layout.get('blocks', []))},
        "personnel": {"total": total_personnel, "apparatus_units": len(assigned_apparatus), "direct_units": len(assigned_direct), "station_units": len(assigned_station)}
    }
