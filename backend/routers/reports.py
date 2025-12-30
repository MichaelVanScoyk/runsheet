"""
Reports router - Generate incident reports and statistics
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from typing import Optional, List
from datetime import datetime, date, timedelta
from pydantic import BaseModel
import json
import io
from html import escape as html_escape

from database import get_db

router = APIRouter()


# =============================================================================
# REPORT SCHEMAS
# =============================================================================

class DateRangeParams(BaseModel):
    start_date: date
    end_date: date


class ReportSummary(BaseModel):
    total_incidents: int
    total_personnel_responses: int
    total_manhours: float
    avg_response_time_minutes: Optional[float]
    avg_on_scene_time_minutes: Optional[float]
    incidents_by_status: dict


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def calculate_manhours(db: Session, start_date: date, end_date: date, category: str = None) -> dict:
    """Calculate manhours for incidents in date range."""
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND i.call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        WITH incident_durations AS (
            SELECT 
                i.id,
                EXTRACT(EPOCH FROM (
                    COALESCE(i.time_last_cleared, i.time_first_on_scene) - i.time_dispatched
                )) / 3600.0 AS duration_hours,
                (SELECT COUNT(*) FROM incident_personnel ip WHERE ip.incident_id = i.id) AS personnel_count
            FROM incidents i
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND i.time_dispatched IS NOT NULL
              {cat_filter}
        )
        SELECT 
            COALESCE(SUM(duration_hours * personnel_count), 0) AS total_manhours,
            COALESCE(SUM(personnel_count), 0) AS total_responses,
            COUNT(*) AS incident_count,
            COALESCE(AVG(duration_hours), 0) AS avg_duration_hours
        FROM incident_durations
        WHERE duration_hours > 0 AND duration_hours < 24
    """), {"start_date": start_date, "end_date": end_date})
    
    row = result.fetchone()
    return {
        "total_manhours": round(float(row[0] or 0), 2),
        "total_responses": int(row[1] or 0),
        "incident_count": int(row[2] or 0),
        "avg_duration_hours": round(float(row[3] or 0), 2)
    }


def get_response_times(db: Session, start_date: date, end_date: date, category: str = None) -> dict:
    """Calculate average response times"""
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT 
            AVG(EXTRACT(EPOCH FROM (time_first_enroute - time_dispatched)) / 60) AS avg_turnout,
            AVG(EXTRACT(EPOCH FROM (time_first_on_scene - time_dispatched)) / 60) AS avg_response,
            AVG(EXTRACT(EPOCH FROM (time_last_cleared - time_first_on_scene)) / 60) AS avg_on_scene
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
          AND time_dispatched IS NOT NULL
          {cat_filter}
    """), {"start_date": start_date, "end_date": end_date})
    
    row = result.fetchone()
    return {
        "avg_turnout_minutes": round(float(row[0] or 0), 1) if row[0] else None,
        "avg_response_minutes": round(float(row[1] or 0), 1) if row[1] else None,
        "avg_on_scene_minutes": round(float(row[2] or 0), 1) if row[2] else None
    }


# =============================================================================
# REPORT ENDPOINTS
# =============================================================================

@router.get("/summary")
async def get_summary_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get overall summary statistics for date range"""
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND call_category = '{category.upper()}'"
    
    basic_stats = db.execute(text(f"""
        SELECT 
            COUNT(*) AS total_incidents,
            COUNT(CASE WHEN status = 'OPEN' THEN 1 END) AS open_count,
            COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) AS closed_count,
            COUNT(CASE WHEN status = 'SUBMITTED' THEN 1 END) AS submitted_count,
            COUNT(CASE WHEN call_category = 'FIRE' THEN 1 END) AS fire_count,
            COUNT(CASE WHEN call_category = 'EMS' THEN 1 END) AS ems_count
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
          {cat_filter}
    """), {"start_date": start_date, "end_date": end_date}).fetchone()
    
    manhours = calculate_manhours(db, start_date, end_date, category)
    times = get_response_times(db, start_date, end_date, category)
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "category_filter": category.upper() if category else "ALL",
        "total_incidents": basic_stats[0],
        "fire_incidents": basic_stats[4],
        "ems_incidents": basic_stats[5],
        "incidents_by_status": {
            "open": basic_stats[1],
            "closed": basic_stats[2],
            "submitted": basic_stats[3]
        },
        "total_personnel_responses": manhours["total_responses"],
        "total_manhours": manhours["total_manhours"],
        "avg_incident_duration_hours": manhours["avg_duration_hours"],
        "response_times": times
    }


@router.get("/monthly")
async def get_monthly_chiefs_report(
    year: int = Query(...),
    month: int = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Comprehensive monthly report matching the paper chiefs report format."""
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND i.call_category = '{category.upper()}'"
    
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month + 1, 1) - timedelta(days=1)
    
    prev_start = date(year - 1, month, 1)
    if month == 12:
        prev_end = date(year, 1, 1) - timedelta(days=1)
    else:
        prev_end = date(year - 1, month + 1, 1) - timedelta(days=1)
    
    # Main stats
    summary_result = db.execute(text(f"""
        WITH incident_data AS (
            SELECT 
                i.id,
                EXTRACT(EPOCH FROM (
                    COALESCE(i.time_last_cleared, i.time_first_on_scene) - i.time_dispatched
                )) / 3600.0 AS duration_hours,
                (SELECT COUNT(*) FROM incident_personnel ip WHERE ip.incident_id = i.id) AS personnel_count
            FROM incidents i
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND i.time_dispatched IS NOT NULL
              {cat_filter}
        )
        SELECT 
            COUNT(*) AS total_calls,
            COALESCE(SUM(personnel_count), 0) AS total_men,
            COALESCE(SUM(CASE WHEN duration_hours > 0 AND duration_hours < 24 THEN duration_hours ELSE 0 END), 0) AS total_hours,
            COALESCE(SUM(CASE WHEN duration_hours > 0 AND duration_hours < 24 
                         THEN duration_hours * personnel_count ELSE 0 END), 0) AS total_manhours
        FROM incident_data
    """), {"start_date": start_date, "end_date": end_date})
    
    summary_row = summary_result.fetchone()
    
    prev_result = db.execute(text(f"""
        SELECT COUNT(*) FROM incidents i
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
          {cat_filter}
    """), {"start_date": prev_start, "end_date": prev_end})
    prev_count = prev_result.fetchone()[0]
    
    current_count = int(summary_row[0] or 0)
    change = current_count - prev_count
    pct_change = round((change / prev_count * 100), 0) if prev_count > 0 else 0
    
    is_fire_report = category and category.upper() == 'FIRE'
    
    # Damage stats (FIRE only)
    if is_fire_report:
        damage_result = db.execute(text(f"""
            SELECT 
                COALESCE(SUM(property_value_at_risk), 0),
                COALESCE(SUM(fire_damages_estimate), 0),
                COALESCE(SUM(ff_injuries_count), 0),
                COALESCE(SUM(civilian_injuries_count), 0)
            FROM incidents i
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND (i.neris_aid_direction IS NULL OR i.neris_aid_direction != 'GIVEN')
              {cat_filter}
        """), {"start_date": start_date, "end_date": end_date})
        damage_row = damage_result.fetchone()
        damage_stats = {
            "property_at_risk": int(damage_row[0] or 0),
            "fire_damages": int(damage_row[1] or 0),
            "ff_injuries": int(damage_row[2] or 0),
            "civilian_injuries": int(damage_row[3] or 0),
        }
    else:
        damage_stats = {}
    
    call_summary = {
        "number_of_calls": current_count,
        "number_of_men": int(summary_row[1] or 0),
        "hours": round(float(summary_row[2] or 0), 2),
        "man_hours": round(float(summary_row[3] or 0), 2),
        "previous_year_calls": prev_count,
        "change": change,
        "percent_change": pct_change,
        **damage_stats,
    }
    
    # Municipalities
    muni_result = db.execute(text(f"""
        WITH incident_data AS (
            SELECT 
                i.id,
                COALESCE(m.display_name, i.municipality_code, 'Unknown') AS municipality,
                EXTRACT(EPOCH FROM (
                    COALESCE(i.time_last_cleared, i.time_first_on_scene) - i.time_dispatched
                )) / 3600.0 AS duration_hours,
                (SELECT COUNT(*) FROM incident_personnel ip WHERE ip.incident_id = i.id) AS personnel_count
            FROM incidents i
            LEFT JOIN municipalities m ON i.municipality_code = m.code
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              {cat_filter}
        )
        SELECT 
            municipality,
            COUNT(*) AS calls,
            COALESCE(SUM(CASE WHEN duration_hours > 0 AND duration_hours < 24 
                         THEN duration_hours * personnel_count ELSE 0 END), 0) AS manhours
        FROM incident_data
        GROUP BY municipality
        ORDER BY calls DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    municipalities = [{"municipality": row[0], "calls": row[1], "manhours": round(float(row[2] or 0), 2)} for row in muni_result]
    
    # Incident types
    type_result = db.execute(text(f"""
        SELECT 
            COALESCE(cad_event_type, 'Unknown') AS incident_type,
            COALESCE(cad_event_subtype, 'Unspecified') AS incident_subtype,
            COUNT(*) AS count
        FROM incidents i
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
          {cat_filter}
        GROUP BY cad_event_type, cad_event_subtype
        ORDER BY incident_type, count DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    incident_types_grouped = {}
    for row in type_result:
        type_name, subtype_name, count = row[0], row[1], row[2]
        if type_name not in incident_types_grouped:
            incident_types_grouped[type_name] = {"type": type_name, "count": 0, "subtypes": []}
        incident_types_grouped[type_name]["count"] += count
        incident_types_grouped[type_name]["subtypes"].append({"subtype": subtype_name, "count": count})
    
    incident_types_grouped = dict(sorted(incident_types_grouped.items(), key=lambda x: x[1]["count"], reverse=True))
    incident_types = [{"type": v["type"], "count": v["count"]} for v in incident_types_grouped.values()]
    
    # Units
    unit_result = db.execute(text(f"""
        SELECT 
            COALESCE(a.unit_designator, iu.cad_unit_id, 'Unknown') AS unit,
            COALESCE(a.name, iu.cad_unit_id) AS unit_name,
            COUNT(DISTINCT iu.incident_id) AS responses
        FROM incident_units iu
        LEFT JOIN apparatus a ON iu.apparatus_id = a.id
        JOIN incidents i ON iu.incident_id = i.id
        WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
          AND i.deleted_at IS NULL
          {cat_filter}
        GROUP BY COALESCE(a.unit_designator, iu.cad_unit_id), COALESCE(a.name, iu.cad_unit_id)
        ORDER BY responses DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    responses_per_unit = [{"unit": row[0], "unit_name": row[1], "responses": row[2]} for row in unit_result]
    
    # Mutual aid (FIRE only)
    mutual_aid = []
    if is_fire_report:
        ma_result = db.execute(text(f"""
            SELECT unnest(neris_aid_departments) AS assisted_station, COUNT(*) AS count
            FROM incidents i
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND i.neris_aid_direction = 'GIVEN'
              AND i.neris_aid_departments IS NOT NULL
              {cat_filter}
            GROUP BY unnest(neris_aid_departments)
            ORDER BY count DESC
        """), {"start_date": start_date, "end_date": end_date})
        mutual_aid = [{"station": row[0], "count": row[1]} for row in ma_result]
    
    times = get_response_times(db, start_date, end_date, category)
    
    return {
        "month": month,
        "year": year,
        "month_name": start_date.strftime("%B"),
        "category_filter": category.upper() if category else "ALL",
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "call_summary": call_summary,
        "municipalities": municipalities,
        "incident_types": incident_types,
        "incident_types_grouped": list(incident_types_grouped.values()),
        "responses_per_unit": responses_per_unit,
        "mutual_aid": mutual_aid,
        "response_times": times
    }


# =============================================================================
# INCIDENT HTML REPORT - V3 GRANULAR FIELDS
# =============================================================================

@router.get("/html/incident/{incident_id}")
async def get_incident_html_report(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Generate printable HTML report for WeasyPrint PDF conversion.
    V3: Granular field-based layout from Admin > Print Layout.
    """
    from settings_helper import format_local_time, format_local_date, get_timezone
    from routers.settings import get_page_blocks
    
    # Get incident
    incident = db.execute(text("SELECT * FROM incidents WHERE id = :id AND deleted_at IS NULL"), {"id": incident_id}).fetchone()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    inc = dict(incident._mapping)
    call_category = inc.get('call_category', 'FIRE') or 'FIRE'
    
    # Get layout blocks
    page1_blocks = get_page_blocks(db, 1, call_category)
    page2_blocks = get_page_blocks(db, 2, call_category)
    
    # ==========================================================================
    # TENANT SETTINGS
    # ==========================================================================
    station_name = (db.execute(text("SELECT value FROM settings WHERE category = 'station' AND key = 'name'")).fetchone() or ["Fire Department"])[0]
    station_number = (db.execute(text("SELECT value FROM settings WHERE category = 'station' AND key = 'number'")).fetchone() or [""])[0]
    
    primary_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'primary_color'")).fetchone()
    secondary_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'secondary_color'")).fetchone()
    primary_color = primary_result[0] if primary_result else "#016a2b"
    secondary_color = secondary_result[0] if secondary_result else "#eeee01"
    
    logo_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo'")).fetchone()
    logo_mime_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo_mime_type'")).fetchone()
    logo_data_url = ""
    if logo_result and logo_result[0]:
        mime_type = logo_mime_result[0] if logo_mime_result else 'image/png'
        logo_data_url = f"data:{mime_type};base64,{logo_result[0]}"
    
    # ==========================================================================
    # HELPERS
    # ==========================================================================
    def fmt_time(dt):
        if not dt: return ''
        return format_local_time(dt, include_seconds=True)
    
    def esc(text):
        if not text: return ''
        return html_escape(str(text))
    
    # Personnel lookup
    personnel_rows = db.execute(text("SELECT id, first_name, last_name FROM personnel")).fetchall()
    personnel_lookup = {p[0]: f"{p[2]}, {p[1]}" for p in personnel_rows}
    
    def get_personnel_name(pid):
        return personnel_lookup.get(pid, '')
    
    # Apparatus
    apparatus_rows = db.execute(text("SELECT id, unit_designator, name, ff_slots FROM apparatus WHERE active = true ORDER BY display_order, unit_designator")).fetchall()
    apparatus_list = [{'id': a[0], 'unit_designator': a[1], 'name': a[2], 'ff_slots': a[3] or 4} for a in apparatus_rows]
    
    # In-service time
    in_service = ''
    if inc.get('time_dispatched') and inc.get('time_last_cleared'):
        try:
            diff_seconds = (inc['time_last_cleared'] - inc['time_dispatched']).total_seconds()
            if diff_seconds > 0:
                hours = int(diff_seconds // 3600)
                mins = int((diff_seconds % 3600) // 60)
                in_service = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"
        except:
            pass
    
    # Personnel assignments
    personnel_assignments = {}
    unit_rows = db.execute(text("""
        SELECT iu.id, iu.apparatus_id, a.unit_designator, a.is_virtual
        FROM incident_units iu
        JOIN apparatus a ON iu.apparatus_id = a.id
        WHERE iu.incident_id = :incident_id
    """), {"incident_id": incident_id}).fetchall()
    
    for unit_row in unit_rows:
        unit_id, apparatus_id, unit_designator, is_virtual = unit_row
        pers_rows = db.execute(text("""
            SELECT personnel_id, slot_index FROM incident_personnel
            WHERE incident_unit_id = :unit_id ORDER BY slot_index
        """), {"unit_id": unit_id}).fetchall()
        
        if is_virtual:
            slots = [p[0] for p in pers_rows]
        else:
            slots = [None] * 6
            for p in pers_rows:
                if p[1] is not None and 0 <= p[1] < 6:
                    slots[p[1]] = p[0]
        personnel_assignments[unit_designator] = slots
    
    assigned_units = [a for a in apparatus_list if personnel_assignments.get(a['unit_designator']) and any(s for s in personnel_assignments.get(a['unit_designator'], []))]
    total_personnel = sum(len([s for s in slots if s]) for slots in personnel_assignments.values())
    
    # ==========================================================================
    # FIELD RENDERERS - Each field is its own block
    # ==========================================================================
    
    def r_logo():
        if not logo_data_url: return ''
        return f'<img src="{logo_data_url}" class="logo">'
    
    def r_station_name():
        return f'<div class="station-name">{esc(station_name)} — Station {esc(station_number)}</div>'
    
    def r_internal_incident_number():
        return f'<span class="inc-number">{esc(inc.get("internal_incident_number", ""))}</span>'
    
    def r_cad_event_number():
        return f'<span class="cad-number">CAD: {esc(inc.get("cad_event_number", ""))}</span>'
    
    def r_call_category():
        cat = inc.get('call_category', 'FIRE') or 'FIRE'
        return f'<span class="badge badge-{cat.lower()}">{cat}</span>'
    
    def r_incident_date():
        d = inc.get('incident_date', '')
        return f'<span class="inc-date">{d}</span>'
    
    def r_times_group():
        return f'''<div class="times-box">
            <table class="times-table">
                <tr><td class="time-label">Dispatched:</td><td class="time-value">{fmt_time(inc.get('time_dispatched'))}</td></tr>
                <tr><td class="time-label">Enroute:</td><td class="time-value">{fmt_time(inc.get('time_first_enroute'))}</td></tr>
                <tr><td class="time-label">On Scene:</td><td class="time-value">{fmt_time(inc.get('time_first_on_scene'))}</td></tr>
                <tr><td class="time-label">Under Ctrl:</td><td class="time-value">{fmt_time(inc.get('time_fire_under_control'))}</td></tr>
                <tr><td class="time-label">Cleared:</td><td class="time-value">{fmt_time(inc.get('time_last_cleared'))}</td></tr>
                <tr><td class="time-label">In Service:</td><td class="time-value">{in_service}</td></tr>
            </table>
        </div>'''
    
    def r_cad_event_type():
        t = esc(inc.get('cad_event_type', ''))
        if not t: return ''
        return f'<div class="cad-type">{t}</div>'
    
    def r_cad_event_subtype():
        s = esc(inc.get('cad_event_subtype', ''))
        if not s: return ''
        return f'<div class="cad-subtype">{s}</div>'
    
    def r_address():
        addr = esc(inc.get('address', ''))
        if not addr: return ''
        return f'<div class="address">{addr}</div>'
    
    def r_cross_streets():
        cs = esc(inc.get('cross_streets', ''))
        if not cs: return ''
        return f'<div class="cross-streets">({cs})</div>'
    
    def r_municipality_code():
        m = esc(inc.get('municipality_code', ''))
        if not m: return ''
        return f'<span class="muni">{m}</span>'
    
    def r_esz_box():
        e = esc(inc.get('esz_box', ''))
        if not e: return ''
        return f'<span class="esz">ESZ: {e}</span>'
    
    def r_units_called():
        cad_units = inc.get('cad_units') or []
        if not cad_units: return ''
        units_str = ', '.join([u.get('unit_id', '') for u in cad_units])
        return f'<div class="field"><span class="label">Units:</span> {esc(units_str)}</div>'
    
    def r_caller_name():
        n = esc(inc.get('caller_name', ''))
        if not n: return ''
        return f'<div class="field"><span class="label">Caller:</span> {n}</div>'
    
    def r_caller_phone():
        p = esc(inc.get('caller_phone', ''))
        if not p: return ''
        return f'<div class="field"><span class="label">Phone:</span> {p}</div>'
    
    def r_weather_conditions():
        w = esc(inc.get('weather_conditions', ''))
        if not w: return ''
        return f'<div class="field"><span class="label">Weather:</span> {w}</div>'
    
    def r_situation_found():
        s = esc(inc.get('situation_found', ''))
        if not s: return ''
        return f'<div class="field"><span class="label">Situation Found:</span> {s}</div>'
    
    def r_extent_of_damage():
        e = esc(inc.get('extent_of_damage', ''))
        if not e: return ''
        return f'<div class="field"><span class="label">Extent of Damage:</span> {e}</div>'
    
    def r_services_provided():
        s = esc(inc.get('services_provided', ''))
        if not s: return ''
        return f'<div class="field"><span class="label">Services Provided:</span> {s}</div>'
    
    def r_narrative():
        n = esc(inc.get('narrative', ''))
        if not n: return ''
        return f'<div class="field"><span class="label">Narrative:</span><div class="narrative-box">{n}</div></div>'
    
    def r_problems_issues():
        p = esc(inc.get('problems_issues', ''))
        if not p: return ''
        return f'<div class="field"><span class="label">Problems/Issues:</span> {p}</div>'
    
    def r_equipment_used():
        e = esc(inc.get('equipment_used', ''))
        if not e: return ''
        return f'<div class="field"><span class="label">Equipment Used:</span> {e}</div>'
    
    def r_personnel_grid():
        if not assigned_units: return ''
        role_names = ['Driver', 'Officer', 'FF', 'FF', 'FF', 'FF']
        rows_html = ""
        for idx, role in enumerate(role_names):
            has_data = any(
                personnel_assignments.get(a['unit_designator'], [None]*6)[idx] if idx < len(personnel_assignments.get(a['unit_designator'], [])) else None
                for a in assigned_units
            )
            if not has_data: continue
            row = f'<tr><td class="role-cell">{role}</td>'
            for a in assigned_units:
                slots = personnel_assignments.get(a['unit_designator'], [])
                pid = slots[idx] if idx < len(slots) else None
                name = get_personnel_name(pid) if pid else ''
                row += f'<td>{name}</td>'
            row += '</tr>'
            rows_html += row
        
        unit_headers = ''.join([f'<th>{esc(a["unit_designator"])}</th>' for a in assigned_units])
        return f'''<div class="field personnel-section">
            <span class="label">Personnel:</span>
            <table class="personnel-table">
                <thead><tr><th class="role-header">Role</th>{unit_headers}</tr></thead>
                <tbody>{rows_html}</tbody>
            </table>
            <div class="total-row">Total Personnel: {total_personnel}</div>
        </div>'''
    
    def r_officer_in_charge():
        oic = esc(get_personnel_name(inc.get('officer_in_charge'))) if inc.get('officer_in_charge') else ''
        return f'<div class="officer-cell"><span class="label">Officer in Charge:</span> {oic}</div>'
    
    def r_completed_by():
        cb = esc(get_personnel_name(inc.get('completed_by'))) if inc.get('completed_by') else ''
        return f'<div class="officer-cell"><span class="label">Report Completed By:</span> {cb}</div>'
    
    def r_footer():
        return f'''<div class="footer">
            <span class="footer-left">CAD: {esc(inc.get('cad_event_number', ''))}</span>
            <span class="footer-center">Status: {esc(inc.get('status', ''))}</span>
            <span class="footer-right">Printed: {datetime.now().strftime('%m/%d/%Y %I:%M %p')}</span>
        </div>'''
    
    def r_cad_unit_details():
        cad_units = inc.get('cad_units') or []
        if not cad_units: return ''
        rows = ''.join([f'<tr><td>{esc(u.get("unit_id",""))}</td><td>{esc(u.get("dispatched",""))}</td><td>{esc(u.get("enroute",""))}</td><td>{esc(u.get("arrived",""))}</td><td>{esc(u.get("cleared",""))}</td></tr>' for u in cad_units])
        return f'''<div class="field"><span class="label">CAD Unit Details:</span>
            <table class="cad-table"><thead><tr><th>Unit</th><th>Dispatched</th><th>Enroute</th><th>Arrived</th><th>Cleared</th></tr></thead><tbody>{rows}</tbody></table>
        </div>'''
    
    def r_property_value_at_risk():
        v = inc.get('property_value_at_risk')
        if not v: return ''
        return f'<div class="field"><span class="label">Property at Risk:</span> ${v:,}</div>'
    
    def r_fire_damages_estimate():
        v = inc.get('fire_damages_estimate')
        if not v: return ''
        return f'<div class="field"><span class="label">Fire Damages:</span> ${v:,}</div>'
    
    def r_ff_injuries_count():
        v = inc.get('ff_injuries_count')
        if not v: return ''
        return f'<div class="field"><span class="label">FF Injuries:</span> {v}</div>'
    
    def r_civilian_injuries_count():
        v = inc.get('civilian_injuries_count')
        if not v: return ''
        return f'<div class="field"><span class="label">Civilian Injuries:</span> {v}</div>'
    
    def r_neris_aid_direction():
        v = esc(inc.get('neris_aid_direction', ''))
        if not v: return ''
        return f'<div class="field"><span class="label">Aid Direction:</span> {v}</div>'
    
    def r_neris_aid_departments():
        v = inc.get('neris_aid_departments') or []
        if not v: return ''
        return f'<div class="field"><span class="label">Aid Departments:</span> {", ".join(v)}</div>'
    
    def r_neris_incident_types():
        v = inc.get('neris_incident_types') or []
        if not v: return ''
        return f'<div class="field"><span class="label">NERIS Incident Types:</span> {", ".join(v)}</div>'
    
    def r_neris_actions():
        v = inc.get('neris_actions') or []
        if not v: return ''
        return f'<div class="field"><span class="label">NERIS Actions:</span> {", ".join(v)}</div>'
    
    # Block ID -> renderer
    RENDERERS = {
        'logo': r_logo,
        'station_name': r_station_name,
        'internal_incident_number': r_internal_incident_number,
        'cad_event_number': r_cad_event_number,
        'call_category': r_call_category,
        'incident_date': r_incident_date,
        'times_group': r_times_group,
        'cad_event_type': r_cad_event_type,
        'cad_event_subtype': r_cad_event_subtype,
        'address': r_address,
        'cross_streets': r_cross_streets,
        'municipality_code': r_municipality_code,
        'esz_box': r_esz_box,
        'units_called': r_units_called,
        'caller_name': r_caller_name,
        'caller_phone': r_caller_phone,
        'weather_conditions': r_weather_conditions,
        'situation_found': r_situation_found,
        'extent_of_damage': r_extent_of_damage,
        'services_provided': r_services_provided,
        'narrative': r_narrative,
        'problems_issues': r_problems_issues,
        'equipment_used': r_equipment_used,
        'personnel_grid': r_personnel_grid,
        'officer_in_charge': r_officer_in_charge,
        'completed_by': r_completed_by,
        'footer': r_footer,
        'cad_unit_details': r_cad_unit_details,
        'property_value_at_risk': r_property_value_at_risk,
        'fire_damages_estimate': r_fire_damages_estimate,
        'ff_injuries_count': r_ff_injuries_count,
        'civilian_injuries_count': r_civilian_injuries_count,
        'neris_aid_direction': r_neris_aid_direction,
        'neris_aid_departments': r_neris_aid_departments,
        'neris_incident_types': r_neris_incident_types,
        'neris_actions': r_neris_actions,
    }
    
    # ==========================================================================
    # BUILD HTML
    # ==========================================================================
    
    def render_blocks(blocks, skip_ids=None):
        skip = skip_ids or set()
        parts = []
        for b in blocks:
            bid = b.get('id')
            if bid in skip: continue
            renderer = RENDERERS.get(bid)
            if renderer:
                parts.append(renderer())
        return '\n'.join(parts)
    
    # Header line (logo + station name)
    header_html = f'''<div class="header">
        {r_logo()}
        <div class="header-text">{r_station_name()}<div class="subtitle">Incident Report</div></div>
    </div>'''
    
    # Incident info line
    info_html = f'''<div class="incident-info">
        {r_internal_incident_number()}
        {r_call_category()}
        {r_cad_event_number()}
        {r_incident_date()}
        {r_municipality_code()}
        {r_esz_box()}
    </div>'''
    
    # Times (floated right)
    times_html = r_times_group()
    
    # Other page 1 blocks
    skip_p1 = {'logo', 'station_name', 'internal_incident_number', 'cad_event_number', 'call_category', 'incident_date', 'times_group', 'municipality_code', 'esz_box', 'footer'}
    other_p1 = render_blocks(page1_blocks, skip_ids=skip_p1)
    
    # Footer
    footer_html = r_footer()
    
    # Page 2
    page2_html = render_blocks(page2_blocks)
    has_p2 = bool(page2_html.strip())
    
    html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Incident {esc(inc.get('internal_incident_number', ''))}</title>
    <style>
        @page {{ size: letter; margin: 0.3in; }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.25; color: #000; }}
        
        .page-break {{ page-break-before: always; }}
        
        .header {{ border-bottom: 2px solid {primary_color}; padding-bottom: 4px; margin-bottom: 4px; }}
        .header .logo {{ float: left; width: 40px; height: auto; margin-right: 8px; }}
        .header-text {{ overflow: hidden; }}
        .station-name {{ font-size: 12pt; font-weight: bold; }}
        .subtitle {{ font-size: 9pt; color: #555; }}
        
        .incident-info {{ margin-bottom: 4px; font-size: 9pt; }}
        .inc-number {{ font-size: 14pt; font-weight: bold; margin-right: 6px; }}
        .cad-number {{ margin-left: 8px; color: #555; }}
        .inc-date {{ margin-left: 8px; }}
        .muni {{ margin-left: 8px; }}
        .esz {{ margin-left: 8px; color: #555; }}
        
        .badge {{ display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 8pt; font-weight: bold; color: #fff; vertical-align: middle; }}
        .badge-fire {{ background: #c0392b; }}
        .badge-ems {{ background: #2980b9; }}
        
        .times-box {{ float: right; width: 170px; margin: 0 0 6px 8px; }}
        .times-table {{ width: 100%; border: 1px solid #000; border-collapse: collapse; font-size: 8pt; }}
        .times-table td {{ padding: 1px 3px; border-bottom: 1px dotted #ccc; }}
        .times-table tr:last-child td {{ border-bottom: none; }}
        .time-label {{ font-weight: bold; width: 60px; }}
        .time-value {{ font-family: 'Courier New', monospace; text-align: right; }}
        
        .field {{ margin-bottom: 3px; }}
        .label {{ font-weight: bold; font-size: 8pt; }}
        
        .address {{ font-size: 11pt; font-weight: bold; }}
        .cross-streets {{ font-size: 9pt; color: #555; display: inline; margin-left: 4px; }}
        .cad-type {{ font-size: 11pt; font-weight: bold; }}
        .cad-subtype {{ font-size: 9pt; color: #555; }}
        
        .narrative-box {{ padding: 3px; background: #f5f5f5; border: 1px solid #ddd; margin-top: 2px; white-space: pre-wrap; font-size: 9pt; }}
        
        .personnel-section {{ margin-top: 4px; clear: both; }}
        .personnel-table {{ width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 2px; }}
        .personnel-table th, .personnel-table td {{ border: 1px solid #000; padding: 1px 3px; text-align: left; }}
        .personnel-table th {{ background: {primary_color}; color: #fff; text-align: center; }}
        .role-header {{ width: 40px; }}
        .role-cell {{ font-weight: bold; background: {secondary_color}; width: 40px; }}
        .total-row {{ margin-top: 2px; font-weight: bold; font-size: 8pt; }}
        
        .officer-cell {{ display: inline-block; width: 48%; font-size: 9pt; }}
        
        .footer {{ margin-top: 6px; padding-top: 3px; border-top: 1px solid #000; font-size: 7pt; color: #666; }}
        .footer-left {{ float: left; }}
        .footer-center {{ text-align: center; }}
        .footer-right {{ float: right; }}
        
        .cad-table {{ width: 100%; border-collapse: collapse; font-size: 7pt; margin-top: 2px; }}
        .cad-table th, .cad-table td {{ border: 1px solid #999; padding: 1px 3px; }}
        .cad-table th {{ background: #eee; }}
        
        .clearfix::after {{ content: ""; display: table; clear: both; }}
    </style>
</head>
<body>
    {header_html}
    {info_html}
    {times_html}
    {other_p1}
    <div class="clearfix"></div>
    {footer_html}
    {'<div class="page-break"></div>' + page2_html if has_p2 else ''}
</body>
</html>'''
    
    return HTMLResponse(content=html)


@router.get("/pdf/incident/{incident_id}")
async def get_incident_pdf(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """Generate PDF from incident HTML using WeasyPrint."""
    from weasyprint import HTML
    
    html_response = await get_incident_html_report(incident_id, db)
    html_content = html_response.body.decode('utf-8')
    
    incident = db.execute(text("SELECT internal_incident_number, incident_date FROM incidents WHERE id = :id"), {"id": incident_id}).fetchone()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    incident_number = incident[0] or f"INC{incident_id}"
    incident_date = incident[1] or datetime.now().date()
    
    pdf_buffer = io.BytesIO()
    HTML(string=html_content).write_pdf(pdf_buffer)
    pdf_buffer.seek(0)
    
    filename = f"incident_{incident_number}_{incident_date}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


# =============================================================================
# MONTHLY HTML/PDF REPORTS
# =============================================================================

@router.get("/html/monthly")
async def get_monthly_html_report(
    year: int = Query(...),
    month: int = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Generate printable HTML report for Monthly Chiefs Report."""
    report = await get_monthly_chiefs_report(year, month, category, db)
    
    is_fire_report = category and category.upper() == 'FIRE'
    cs = report['call_summary']
    rt = report['response_times'] or {}
    
    # Tenant settings
    station_name = (db.execute(text("SELECT value FROM settings WHERE category = 'station' AND key = 'name'")).fetchone() or ["Fire Department"])[0]
    station_number = (db.execute(text("SELECT value FROM settings WHERE category = 'station' AND key = 'number'")).fetchone() or [""])[0]
    station_short_name = (db.execute(text("SELECT value FROM settings WHERE category = 'station' AND key = 'short_name'")).fetchone() or [f"Station {station_number}"])[0]
    
    logo_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo'")).fetchone()
    logo_mime_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo_mime_type'")).fetchone()
    logo_data_url = ""
    if logo_result and logo_result[0]:
        mime_type = logo_mime_result[0] if logo_mime_result else 'image/png'
        logo_data_url = f"data:{mime_type};base64,{logo_result[0]}"
    
    def fmt_currency(cents):
        return f"${(cents or 0) / 100:,.0f}"
    
    # Build HTML sections
    muni_rows = '\n'.join([
        f'<tr><td>{m["municipality"]}</td><td class="text-center">{m["calls"]}</td><td class="text-right">{m["manhours"]:.1f}</td></tr>'
        for m in report['municipalities']
    ]) or '<tr><td colspan="3" class="text-center">No data</td></tr>'
    
    unit_rows = '\n'.join([
        f'<div class="unit-row clearfix"><span class="unit-name">{u["unit_name"] or u["unit"]}</span><span class="unit-count">{u["responses"]}</span></div>'
        for u in report['responses_per_unit']
    ]) or '<div class="unit-row"><span>No data</span></div>'
    
    incident_groups = '\n'.join([
        f'''<div class="incident-group">
            <div class="incident-group-header clearfix"><span>{grp['type']}</span><span class="count">{grp['count']}</span></div>
            {''.join([f'<div class="incident-subtype clearfix"><span>{st["subtype"]}</span><span class="count">{st["count"]}</span></div>' for st in grp['subtypes']])}
        </div>'''
        for grp in report.get('incident_types_grouped', [])
    ]) or '<div>No incidents</div>'
    
    mutual_aid_section = ''
    if is_fire_report:
        ma_rows = '\n'.join([f'<tr><td>{ma["station"]}</td><td class="text-center">{ma["count"]}</td></tr>' for ma in report.get('mutual_aid', [])]) or '<tr><td colspan="2" class="text-center">None</td></tr>'
        mutual_aid_section = f'''<div class="section"><div class="section-title">Mutual Aid Given</div><table><thead><tr><th>Station</th><th class="text-center">Count</th></tr></thead><tbody>{ma_rows}</tbody></table></div>'''
    
    property_section = ''
    if is_fire_report:
        property_section = f'''<div class="section"><div class="section-title">Property & Safety</div>
            <div class="stats-row">
                <div class="stat-box"><div class="stat-value">{fmt_currency(cs.get('property_at_risk', 0))}</div><div class="stat-label">Property at Risk</div></div>
                <div class="stat-box"><div class="stat-value">{fmt_currency(cs.get('fire_damages', 0))}</div><div class="stat-label">Fire Damages</div></div>
                <div class="stat-box"><div class="stat-value">{cs.get('ff_injuries', 0)}</div><div class="stat-label">FF Injuries</div></div>
                <div class="stat-box"><div class="stat-value">{cs.get('civilian_injuries', 0)}</div><div class="stat-label">Civilian Injuries</div></div>
            </div>
        </div>'''
    
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{station_name} - Monthly Report</title>
    <style>
        @page {{ size: letter; margin: 0.4in; }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: Arial, Helvetica, sans-serif; font-size: 9px; line-height: 1.3; color: #1a1a1a; }}
        .header {{ display: table; width: 100%; border-bottom: 3px solid #1e6b35; padding-bottom: 8px; margin-bottom: 10px; }}
        .header-logo {{ display: table-cell; width: 70px; vertical-align: middle; }}
        .header-logo img {{ width: 60px; height: auto; }}
        .header-text {{ display: table-cell; vertical-align: middle; padding-left: 12px; }}
        .header h1 {{ font-size: 20px; font-weight: 700; margin: 0; }}
        .header .subtitle {{ font-size: 11px; color: #1e6b35; font-weight: 600; margin-top: 2px; }}
        .section {{ background: #e8e8e8; border: 1px solid #d0d0d0; border-radius: 4px; padding: 8px 10px; margin-bottom: 8px; }}
        .section-title {{ font-size: 8px; font-weight: 700; color: #1e6b35; text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 6px; }}
        .stats-row {{ display: table; width: 100%; }}
        .stat-box {{ display: table-cell; text-align: center; background: white; padding: 8px 4px; border: 1px solid #e0e0e0; border-radius: 3px; }}
        .stat-value {{ font-size: 20px; font-weight: 700; }}
        .stat-value.highlight {{ color: #1e6b35; }}
        .stat-label {{ font-size: 7px; color: #666; text-transform: uppercase; margin-top: 2px; }}
        .stat-compare {{ font-size: 7px; color: #666; margin-top: 2px; }}
        table {{ width: 100%; border-collapse: collapse; font-size: 8px; }}
        th {{ background: #f0f0f0; font-weight: 600; text-align: left; padding: 4px 6px; border-bottom: 1px solid #ccc; }}
        td {{ padding: 3px 6px; border-bottom: 1px solid #e0e0e0; }}
        .text-right {{ text-align: right; }}
        .text-center {{ text-align: center; }}
        .times-row {{ display: table; width: 100%; }}
        .time-box {{ display: table-cell; background: white; border: 1px solid #e0e0e0; border-radius: 3px; padding: 6px 4px; text-align: center; }}
        .time-value {{ font-size: 16px; font-weight: 700; }}
        .time-label {{ font-size: 7px; color: #666; text-transform: uppercase; margin-top: 2px; }}
        .row {{ display: table; width: 100%; margin-bottom: 8px; }}
        .col {{ display: table-cell; vertical-align: top; }}
        .col-half {{ width: 49%; }}
        .col-half:first-child {{ padding-right: 8px; }}
        .col-half:last-child {{ padding-left: 8px; }}
        .incident-group {{ margin-bottom: 6px; }}
        .incident-group-header {{ background: #1e6b35; color: white; padding: 4px 8px; border-radius: 2px; font-weight: 600; font-size: 8px; }}
        .incident-group-header .count {{ float: right; background: rgba(255,255,255,0.3); padding: 1px 8px; border-radius: 8px; font-size: 7px; }}
        .incident-subtype {{ padding: 2px 8px 2px 16px; font-size: 7px; color: #444; border-bottom: 1px dotted #ccc; }}
        .incident-subtype .count {{ float: right; font-weight: 600; color: #666; }}
        .unit-row {{ padding: 3px 0; border-bottom: 1px dotted #ccc; font-size: 8px; }}
        .unit-count {{ float: right; font-weight: 600; color: #1e6b35; }}
        .footer {{ margin-top: 10px; padding-top: 6px; border-top: 1px solid #ddd; font-size: 8px; color: #888; }}
        .footer-left {{ float: left; }}
        .footer-right {{ float: right; }}
        .clearfix::after {{ content: ""; display: table; clear: both; }}
    </style>
</head>
<body>
    <div class="header">
        <div class="header-logo"><img src="{logo_data_url}" alt="Logo"></div>
        <div class="header-text">
            <h1>{station_name.upper()}</h1>
            <div class="subtitle">Monthly Activity Report — {report['month_name']} {report['year']}</div>
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">Call Summary</div>
        <div class="stats-row">
            <div class="stat-box"><div class="stat-value highlight">{cs['number_of_calls']}</div><div class="stat-label">Total Calls</div><div class="stat-compare">vs. last year: {'+' if cs['change'] >= 0 else ''}{cs['change']}</div></div>
            <div class="stat-box"><div class="stat-value">{cs['number_of_men']}</div><div class="stat-label">Personnel</div></div>
            <div class="stat-box"><div class="stat-value">{cs['hours']:.1f}</div><div class="stat-label">Total Hours</div></div>
            <div class="stat-box"><div class="stat-value">{cs['man_hours']:.1f}</div><div class="stat-label">Man Hours</div></div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Response Times</div>
        <div class="times-row">
            <div class="time-box"><div class="time-value">{rt.get('avg_turnout_minutes', 0) or 0:.1f}</div><div class="time-label">Avg Turnout (min)</div></div>
            <div class="time-box"><div class="time-value">{rt.get('avg_response_minutes', 0) or 0:.1f}</div><div class="time-label">Avg Response (min)</div></div>
            <div class="time-box"><div class="time-value">{rt.get('avg_on_scene_minutes', 0) or 0:.1f}</div><div class="time-label">Avg On Scene (min)</div></div>
        </div>
    </div>

    <div class="row">
        <div class="col col-half">
            <div class="section">
                <div class="section-title">Response by Municipality</div>
                <table><thead><tr><th>Municipality</th><th class="text-center">Calls</th><th class="text-right">Man Hrs</th></tr></thead><tbody>{muni_rows}</tbody></table>
            </div>
        </div>
        <div class="col col-half">
            <div class="section">
                <div class="section-title">Responses by Unit</div>
                {unit_rows}
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col col-half">
            <div class="section">
                <div class="section-title">Incident Types</div>
                {incident_groups}
            </div>
        </div>
        <div class="col col-half">
            {mutual_aid_section}
        </div>
    </div>

    {property_section}

    <div class="footer clearfix">
        <span class="footer-left">{station_name} — {station_short_name}</span>
        <span class="footer-right">Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}</span>
    </div>
</body>
</html>'''
    
    return HTMLResponse(content=html)


@router.get("/pdf/monthly-weasy")
async def get_monthly_pdf_weasy(
    year: int = Query(...),
    month: int = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Generate PDF from styled HTML using WeasyPrint."""
    from weasyprint import HTML
    
    html_response = await get_monthly_html_report(year, month, category, db)
    html_content = html_response.body.decode('utf-8')
    
    pdf_buffer = io.BytesIO()
    HTML(string=html_content).write_pdf(pdf_buffer)
    pdf_buffer.seek(0)
    
    month_name = date(year, month, 1).strftime("%B")
    filename = f"monthly_report_{year}_{month:02d}_{month_name}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )
