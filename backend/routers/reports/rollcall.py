"""
Roll Call Report Router - Attendance Record HTML/PDF

Generates branded PDF reports for DETAIL incidents with attendance (meetings,
worknights, training, drills). Uses same branding infrastructure as incident reports.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
from typing import Optional
import io

from database import get_db
from report_engine.branding_config import get_branding, get_logo_data_url
from report_engine.templates import generate_css, generate_base_html, render_header

router = APIRouter()


# Detail type display names
DETAIL_TYPE_NAMES = {
    'MEETING': 'Meeting',
    'WORKNIGHT': 'Work Night',
    'TRAINING': 'Training',
    'DRILL': 'Drill',
    'OTHER': 'Other',
}


def _format_date(d) -> str:
    """Format date for display."""
    if not d:
        return ''
    if isinstance(d, str):
        try:
            d = datetime.strptime(d, '%Y-%m-%d').date()
        except ValueError:
            return d
    return d.strftime('%B %d, %Y')  # "January 23, 2026"


def _format_time(dt) -> str:
    """Format datetime to time string in local timezone."""
    if not dt:
        return ''
    try:
        from settings_helper import format_local_time
        return format_local_time(dt, include_seconds=False)
    except ImportError:
        if isinstance(dt, str):
            try:
                dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
            except ValueError:
                return dt
        return dt.strftime('%H:%M')


def _load_rollcall_data(db: Session, incident_id: int) -> dict:
    """Load all data needed for a roll call report."""
    
    # Get incident
    incident = db.execute(
        text("SELECT * FROM incidents WHERE id = :id AND deleted_at IS NULL"),
        {"id": incident_id}
    ).fetchone()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    inc = dict(incident._mapping)
    
    # Verify it's a roll call DETAIL (has detail_type set)
    if inc.get('call_category') != 'DETAIL' or not inc.get('detail_type'):
        raise HTTPException(
            status_code=400, 
            detail="This report is only available for attendance records (meetings, worknights, etc.)"
        )
    
    # Get attendance (personnel with NULL incident_unit_id)
    attendance_rows = db.execute(text("""
        SELECT 
            ip.personnel_id,
            ip.personnel_first_name,
            ip.personnel_last_name,
            ip.rank_name_snapshot,
            p.rank_id,
            r.abbreviation as rank_abbr,
            r.display_order
        FROM incident_personnel ip
        LEFT JOIN personnel p ON ip.personnel_id = p.id
        LEFT JOIN ranks r ON p.rank_id = r.id
        WHERE ip.incident_id = :incident_id
          AND ip.incident_unit_id IS NULL
        ORDER BY COALESCE(r.display_order, 999), ip.personnel_last_name, ip.personnel_first_name
    """), {"incident_id": incident_id}).fetchall()
    
    attendees = []
    for row in attendance_rows:
        attendees.append({
            'id': row[0],
            'first_name': row[1],
            'last_name': row[2],
            'rank_name': row[3],
            'rank_abbr': row[5] or '',
            'display_order': row[6] or 999,
        })
    
    # Get completed_by name if set
    completed_by_name = None
    if inc.get('completed_by'):
        person = db.execute(text("""
            SELECT first_name, last_name FROM personnel WHERE id = :id
        """), {"id": inc['completed_by']}).fetchone()
        if person:
            completed_by_name = f"{person[1]}, {person[0]}"
    
    return {
        'incident': inc,
        'attendees': attendees,
        'completed_by_name': completed_by_name,
    }


def _generate_rollcall_css(branding: dict) -> str:
    """Generate CSS for roll call reports - extends base CSS."""
    base_css = generate_css(branding)
    
    primary = branding.get("primary_color", "#016a2b")
    text_color = branding.get("text_color", "#1a1a1a")
    muted_color = branding.get("muted_color", "#666666")
    border_style = branding.get("border_style", "solid")
    
    rollcall_css = f'''
        /* Roll Call Report Specific Styles */
        
        .report-title {{
            font-size: 14pt;
            font-weight: bold;
            color: {primary};
            margin: 8px 0 4px 0;
            text-align: center;
        }}
        
        .event-info {{
            margin: 12px 0;
            padding: 8px;
            background: #f8f8f8;
            border: 1px {border_style} #ddd;
            border-radius: 4px;
        }}
        
        .event-info-row {{
            display: flex;
            margin-bottom: 4px;
        }}
        
        .event-info-row:last-child {{
            margin-bottom: 0;
        }}
        
        .event-info-label {{
            font-weight: bold;
            width: 120px;
            flex-shrink: 0;
        }}
        
        .event-info-value {{
            flex: 1;
        }}
        
        .attendance-section {{
            margin: 16px 0;
        }}
        
        .attendance-header {{
            font-size: 11pt;
            font-weight: bold;
            color: {primary};
            border-bottom: 2px {border_style} {primary};
            padding-bottom: 4px;
            margin-bottom: 8px;
        }}
        
        .attendance-count {{
            font-weight: normal;
            font-size: 9pt;
            color: {muted_color};
            margin-left: 8px;
        }}
        
        .attendance-list-columns {{
            list-style: none;
            padding: 0;
            margin: 0;
            column-count: 3;
            column-gap: 24px;
        }}
        
        .attendance-list-columns li {{
            padding: 2px 0;
            font-size: 9pt;
            break-inside: avoid;
        }}
        
        .attendance-layout {{
            display: flex;
            gap: 16px;
        }}
        
        .officers-column {{
            width: 30%;
            flex-shrink: 0;
        }}
        
        .members-column {{
            flex: 1;
        }}
        
        .members-list {{
            list-style: none;
            padding: 0;
            margin: 0;
            column-count: auto;
            column-width: 140px;
            column-gap: 16px;
        }}
        
        .members-list li {{
            padding: 2px 0;
            font-size: 9pt;
            break-inside: avoid;
        }}
        
        .attendance-group {{
            margin-bottom: 12px;
        }}
        
        .group-header {{
            font-weight: bold;
            color: {primary};
            font-size: 9pt;
            margin-bottom: 4px;
        }}
        
        .attendance-columns {{
            display: flex;
            gap: 24px;
        }}
        
        .attendance-column {{
            flex: 1;
        }}
        
        .column-header {{
            font-weight: bold;
            color: {primary};
            border-bottom: 1px {border_style} {primary};
            padding-bottom: 4px;
            margin-bottom: 8px;
            font-size: 10pt;
        }}
        
        .attendance-list {{
            list-style: none;
            padding: 0;
            margin: 0;
        }}
        
        .attendance-list li {{
            padding: 2px 0;
            font-size: 9pt;
        }}
        
        .no-attendance {{
            color: #666;
            font-style: italic;
            font-size: 9pt;
            margin: 0;
        }}
        
        .attendance-grid {{
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }}
        
        .attendee {{
            display: inline-block;
            padding: 3px 8px;
            background: #f0f0f0;
            border: 1px {border_style} #ddd;
            border-radius: 3px;
            font-size: 9pt;
        }}
        
        .attendee-rank {{
            font-weight: bold;
            color: {primary};
            margin-right: 4px;
        }}
        
        .attendance-table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 9pt;
            margin-top: 8px;
        }}
        
        .attendance-table th {{
            background: {primary};
            color: #fff;
            padding: 4px 8px;
            text-align: left;
            font-weight: bold;
        }}
        
        .attendance-table td {{
            padding: 3px 8px;
            border-bottom: 1px {border_style} #ddd;
        }}
        
        .attendance-table tr:nth-child(even) {{
            background: #f8f8f8;
        }}
        
        .attendance-table .rank-col {{
            width: 60px;
            font-weight: bold;
            color: {primary};
        }}
        
        .notes-section {{
            margin: 16px 0;
        }}
        
        .notes-header {{
            font-size: 11pt;
            font-weight: bold;
            color: {primary};
            border-bottom: 2px {border_style} {primary};
            padding-bottom: 4px;
            margin-bottom: 8px;
        }}
        
        .notes-content {{
            padding: 8px;
            background: #f8f8f8;
            border: 1px {border_style} #ddd;
            border-radius: 4px;
            white-space: pre-wrap;
            min-height: 40px;
        }}
        
        .signature-section {{
            position: fixed;
            bottom: 0.6in;
            left: 0.75in;
            right: 0.3in;
        }}
        
        .signature-row {{
            display: flex;
            justify-content: space-between;
            margin-top: 8px;
        }}
        
        .signature-block {{
            width: 45%;
        }}
        
        .signature-line {{
            border-bottom: 1px {border_style} {text_color};
            height: 24px;
            margin-bottom: 4px;
        }}
        
        .signature-label {{
            font-size: 8pt;
            color: {muted_color};
        }}
        
        .report-footer {{
            position: fixed;
            bottom: 0.3in;
            left: 0.75in;
            right: 0.3in;
            font-size: 7pt;
            color: {muted_color};
            display: flex;
            justify-content: space-between;
        }}
    '''
    
    return base_css + rollcall_css


def _render_rollcall_body(data: dict, branding: dict) -> str:
    """Render the roll call report body HTML."""
    inc = data['incident']
    attendees = data['attendees']
    completed_by_name = data['completed_by_name']
    
    # Get detail type display name
    detail_type = inc.get('detail_type', 'OTHER')
    detail_type_name = DETAIL_TYPE_NAMES.get(detail_type, detail_type)
    
    # Format dates and times
    event_date = _format_date(inc.get('incident_date'))
    start_time = _format_time(inc.get('time_event_start'))
    end_time = _format_time(inc.get('time_event_end'))
    
    time_display = ''
    if start_time and end_time:
        time_display = f"{start_time} - {end_time}"
    elif start_time:
        time_display = f"Started: {start_time}"
    elif end_time:
        time_display = f"Ended: {end_time}"
    
    # Build HTML
    parts = []
    
    # Header
    parts.append(render_header(branding))
    
    # Report title
    parts.append(f'<div class="report-title">{detail_type_name} Attendance Report</div>')
    
    # Event info
    parts.append('<div class="event-info">')
    parts.append(f'''
        <div class="event-info-row">
            <span class="event-info-label">Record #:</span>
            <span class="event-info-value">{inc.get('internal_incident_number', '')}</span>
        </div>
    ''')
    parts.append(f'''
        <div class="event-info-row">
            <span class="event-info-label">Event Type:</span>
            <span class="event-info-value">{detail_type_name}</span>
        </div>
    ''')
    parts.append(f'''
        <div class="event-info-row">
            <span class="event-info-label">Date:</span>
            <span class="event-info-value">{event_date}</span>
        </div>
    ''')
    if time_display:
        parts.append(f'''
            <div class="event-info-row">
                <span class="event-info-label">Time:</span>
                <span class="event-info-value">{time_display}</span>
            </div>
        ''')
    if inc.get('address'):
        parts.append(f'''
            <div class="event-info-row">
                <span class="event-info-label">Location:</span>
                <span class="event-info-value">{inc.get('address')}</span>
            </div>
        ''')
    parts.append('</div>')
    
    # Attendance section - simple multi-column list, alphabetical by last name
    sorted_attendees = sorted(attendees, key=lambda p: (p.get('last_name', '').lower(), p.get('first_name', '').lower()))
    
    parts.append('<div class="attendance-section">')
    parts.append(f'<div class="attendance-header">Attendance<span class="attendance-count">({len(attendees)} personnel)</span></div>')
    
    if sorted_attendees:
        parts.append('<ul class="attendance-list-columns">')
        for person in sorted_attendees:
            name = f"{person.get('last_name', '')}, {person.get('first_name', '')}"
            parts.append(f'<li>{name}</li>')
        parts.append('</ul>')
    else:
        parts.append('<p style="color: #666; font-style: italic;">No attendance recorded.</p>')
    
    parts.append('</div>')
    
    # Notes section
    narrative = inc.get('narrative', '').strip()
    parts.append('<div class="notes-section">')
    parts.append('<div class="notes-header">Notes</div>')
    if narrative:
        # Escape HTML in narrative
        import html
        narrative_escaped = html.escape(narrative)
        parts.append(f'<div class="notes-content">{narrative_escaped}</div>')
    else:
        parts.append('<div class="notes-content" style="color: #666; font-style: italic;">No notes recorded.</div>')
    parts.append('</div>')
    
    # Signature section (optional - for physical sign-off)
    parts.append('<div class="signature-section">')
    parts.append('<div class="signature-row">')
    parts.append('''
        <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-label">Officer Signature</div>
        </div>
    ''')
    parts.append('''
        <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-label">Date</div>
        </div>
    ''')
    parts.append('</div>')
    parts.append('</div>')
    
    # Footer
    generated_at = datetime.now().strftime('%Y-%m-%d %H:%M')
    completed_by_text = f"Completed by: {completed_by_name}" if completed_by_name else ""
    parts.append(f'''
        <div class="report-footer">
            <span>{completed_by_text}</span>
            <span>Generated: {generated_at}</span>
        </div>
    ''')
    
    return '\n'.join(parts)


@router.get("/html/rollcall/{incident_id}")
async def get_rollcall_html_report(incident_id: int, db: Session = Depends(get_db)):
    """Generate HTML roll call report for preview."""
    data = _load_rollcall_data(db, incident_id)
    branding = get_branding(db)
    
    css = _generate_rollcall_css(branding)
    body_html = _render_rollcall_body(data, branding)
    watermark = branding.get('watermark_text')
    
    inc = data['incident']
    detail_type = DETAIL_TYPE_NAMES.get(inc.get('detail_type', ''), 'Attendance')
    title = f"{detail_type} - {inc.get('internal_incident_number', '')}"
    
    html = generate_base_html(title, css, body_html, watermark)
    
    return HTMLResponse(content=html)


@router.get("/pdf/rollcall/{incident_id}")
async def get_rollcall_pdf(incident_id: int, db: Session = Depends(get_db)):
    """Generate PDF roll call report."""
    from weasyprint import HTML
    
    html_response = await get_rollcall_html_report(incident_id, db)
    html_content = html_response.body.decode('utf-8')
    
    data = _load_rollcall_data(db, incident_id)
    inc = data['incident']
    
    incident_number = inc.get('internal_incident_number') or f"DETAIL{incident_id}"
    incident_date = inc.get('incident_date') or datetime.now().date()
    detail_type = inc.get('detail_type', 'OTHER').lower()
    
    pdf_buffer = io.BytesIO()
    HTML(string=html_content).write_pdf(pdf_buffer)
    pdf_buffer.seek(0)
    
    filename = f"rollcall_{detail_type}_{incident_number}_{incident_date}.pdf"
    
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )
