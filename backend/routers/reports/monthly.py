"""
Monthly Chiefs Report Router

Filters by incident number prefix (F=Fire, E=EMS) rather than call_category.
This is more accurate since the prefix reflects the final classification.
Detail incidents (D-prefix) are always excluded from metrics.
"""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date, timedelta, datetime
from typing import Optional
import io

from database import get_db
from report_engine.branding_config import get_branding, get_logo_data_url

router = APIRouter()


def _build_prefix_filter(category: str = None, alias: str = "i") -> str:
    """
    Build SQL filter based on incident number prefix (F=Fire, E=EMS).
    This is more accurate than call_category since the prefix reflects
    the final classification after any category changes.
    Detail incidents (D-prefix) are always excluded from metrics.
    """
    if category and category.upper() == 'FIRE':
        return f"AND {alias}.internal_incident_number LIKE 'F%'"
    elif category and category.upper() == 'EMS':
        return f"AND {alias}.internal_incident_number LIKE 'E%'"
    else:
        # Default: include Fire and EMS, exclude Detail
        return f"AND ({alias}.internal_incident_number LIKE 'F%' OR {alias}.internal_incident_number LIKE 'E%')"


def _calculate_manhours(db: Session, start_date: date, end_date: date, category: str = None) -> dict:
    prefix_filter = _build_prefix_filter(category)
    
    result = db.execute(text(f"""
        WITH incident_durations AS (
            SELECT i.id,
                EXTRACT(EPOCH FROM (COALESCE(i.time_last_cleared, i.time_first_on_scene) - i.time_dispatched)) / 3600.0 AS duration_hours,
                (SELECT COUNT(*) FROM incident_personnel ip WHERE ip.incident_id = i.id) AS personnel_count
            FROM incidents i
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL AND i.time_dispatched IS NOT NULL {prefix_filter}
        )
        SELECT COALESCE(SUM(duration_hours * personnel_count), 0), COALESCE(SUM(personnel_count), 0), COUNT(*), COALESCE(AVG(duration_hours), 0)
        FROM incident_durations WHERE duration_hours > 0 AND duration_hours < 24
    """), {"start_date": start_date, "end_date": end_date})
    
    row = result.fetchone()
    return {"total_manhours": round(float(row[0] or 0), 2), "total_responses": int(row[1] or 0), "incident_count": int(row[2] or 0), "avg_duration_hours": round(float(row[3] or 0), 2)}


def _get_response_times(db: Session, start_date: date, end_date: date, category: str = None) -> dict:
    # Note: no alias needed here since single table query
    if category and category.upper() == 'FIRE':
        prefix_filter = "AND internal_incident_number LIKE 'F%'"
    elif category and category.upper() == 'EMS':
        prefix_filter = "AND internal_incident_number LIKE 'E%'"
    else:
        prefix_filter = "AND (internal_incident_number LIKE 'F%' OR internal_incident_number LIKE 'E%')"
    
    result = db.execute(text(f"""
        SELECT AVG(EXTRACT(EPOCH FROM (time_first_enroute - time_dispatched)) / 60),
               AVG(EXTRACT(EPOCH FROM (time_first_on_scene - time_dispatched)) / 60),
               AVG(EXTRACT(EPOCH FROM (time_last_cleared - time_first_on_scene)) / 60)
        FROM incidents WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL AND time_dispatched IS NOT NULL {prefix_filter}
    """), {"start_date": start_date, "end_date": end_date})
    
    row = result.fetchone()
    return {
        "avg_turnout_minutes": round(float(row[0] or 0), 1) if row[0] else None,
        "avg_response_minutes": round(float(row[1] or 0), 1) if row[1] else None,
        "avg_on_scene_minutes": round(float(row[2] or 0), 1) if row[2] else None
    }


@router.get("/monthly")
async def get_monthly_chiefs_report(year: int = Query(...), month: int = Query(...), category: Optional[str] = None, db: Session = Depends(get_db)):
    prefix_filter = _build_prefix_filter(category)
    
    start_date = date(year, month, 1)
    end_date = date(year + 1, 1, 1) - timedelta(days=1) if month == 12 else date(year, month + 1, 1) - timedelta(days=1)
    prev_start = date(year - 1, month, 1)
    prev_end = date(year, 1, 1) - timedelta(days=1) if month == 12 else date(year - 1, month + 1, 1) - timedelta(days=1)
    
    summary_result = db.execute(text(f"""
        WITH incident_data AS (
            SELECT i.id,
                EXTRACT(EPOCH FROM (COALESCE(i.time_last_cleared, i.time_first_on_scene) - i.time_dispatched)) / 3600.0 AS duration_hours,
                (SELECT COUNT(*) FROM incident_personnel ip WHERE ip.incident_id = i.id) AS personnel_count
            FROM incidents i
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL AND i.time_dispatched IS NOT NULL {prefix_filter}
        )
        SELECT COUNT(*), COALESCE(SUM(personnel_count), 0),
            COALESCE(SUM(CASE WHEN duration_hours > 0 AND duration_hours < 24 THEN duration_hours ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN duration_hours > 0 AND duration_hours < 24 THEN duration_hours * personnel_count ELSE 0 END), 0)
        FROM incident_data
    """), {"start_date": start_date, "end_date": end_date})
    
    summary_row = summary_result.fetchone()
    
    prev_result = db.execute(text(f"""
        SELECT COUNT(*) FROM incidents i WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date AND deleted_at IS NULL {prefix_filter}
    """), {"start_date": prev_start, "end_date": prev_end})
    prev_count = prev_result.fetchone()[0]
    
    current_count = int(summary_row[0] or 0)
    change = current_count - prev_count
    pct_change = round((change / prev_count * 100), 0) if prev_count > 0 else 0
    
    is_fire_report = category and category.upper() == 'FIRE'
    damage_stats = {}
    if is_fire_report:
        damage_result = db.execute(text(f"""
            SELECT COALESCE(SUM(property_value_at_risk), 0), COALESCE(SUM(fire_damages_estimate), 0),
                   COALESCE(SUM(ff_injuries_count), 0), COALESCE(SUM(civilian_injuries_count), 0)
            FROM incidents i WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL AND (i.neris_aid_direction IS NULL OR i.neris_aid_direction != 'GIVEN') {prefix_filter}
        """), {"start_date": start_date, "end_date": end_date})
        damage_row = damage_result.fetchone()
        damage_stats = {"property_at_risk": int(damage_row[0] or 0), "fire_damages": int(damage_row[1] or 0), "ff_injuries": int(damage_row[2] or 0), "civilian_injuries": int(damage_row[3] or 0)}
    
    # Count incidents where at least one non-mutual-aid unit went enroute (cad_units JSONB)
    responded_result = db.execute(text(f"""
        SELECT COUNT(*) FROM incidents i
        WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
          AND i.deleted_at IS NULL {prefix_filter}
          AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(i.cad_units) AS unit_elem
              WHERE unit_elem->>'time_enroute' IS NOT NULL
                AND (unit_elem->>'is_mutual_aid')::boolean IS NOT TRUE
          )
    """), {"start_date": start_date, "end_date": end_date})
    responded_count = responded_result.fetchone()[0] or 0
    responded_pct = round((responded_count / current_count * 100), 1) if current_count > 0 else 0.0
    
    # Count unique personnel who responded to incidents this month
    unique_responders_result = db.execute(text(f"""
        SELECT COUNT(DISTINCT ip.personnel_id)
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
          AND i.deleted_at IS NULL {prefix_filter}
    """), {"start_date": start_date, "end_date": end_date})
    unique_responders = unique_responders_result.fetchone()[0] or 0
    
    call_summary = {"number_of_calls": current_count, "responded": responded_count, "responded_pct": responded_pct, "unique_responders": unique_responders, "number_of_men": int(summary_row[1] or 0), "hours": round(float(summary_row[2] or 0), 2), "man_hours": round(float(summary_row[3] or 0), 2), "previous_year_calls": prev_count, "change": change, "percent_change": pct_change, **damage_stats}
    
    muni_result = db.execute(text(f"""
        WITH incident_data AS (
            SELECT i.id, COALESCE(m.display_name, i.municipality_code, 'Unknown') AS municipality,
                EXTRACT(EPOCH FROM (COALESCE(i.time_last_cleared, i.time_first_on_scene) - i.time_dispatched)) / 3600.0 AS duration_hours,
                (SELECT COUNT(*) FROM incident_personnel ip WHERE ip.incident_id = i.id) AS personnel_count
            FROM incidents i LEFT JOIN municipalities m ON i.municipality_code = m.code
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date AND i.deleted_at IS NULL {prefix_filter}
        )
        SELECT municipality, COUNT(*), COALESCE(SUM(CASE WHEN duration_hours > 0 AND duration_hours < 24 THEN duration_hours * personnel_count ELSE 0 END), 0)
        FROM incident_data GROUP BY municipality ORDER BY COUNT(*) DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    municipalities = [{"municipality": row[0], "calls": row[1], "manhours": round(float(row[2] or 0), 2)} for row in muni_result]
    
    type_result = db.execute(text(f"""
        SELECT COALESCE(cad_event_type, 'Unknown'), COALESCE(cad_event_subtype, 'Unspecified'), COUNT(*)
        FROM incidents i WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date AND deleted_at IS NULL {prefix_filter}
        GROUP BY cad_event_type, cad_event_subtype ORDER BY cad_event_type, COUNT(*) DESC
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
    
    unit_result = db.execute(text(f"""
        SELECT COALESCE(a.unit_designator, iu.cad_unit_id, 'Unknown'), COALESCE(a.name, iu.cad_unit_id), COUNT(DISTINCT iu.incident_id)
        FROM incident_units iu LEFT JOIN apparatus a ON iu.apparatus_id = a.id JOIN incidents i ON iu.incident_id = i.id
        WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date AND i.deleted_at IS NULL {prefix_filter}
        GROUP BY COALESCE(a.unit_designator, iu.cad_unit_id, 'Unknown'), COALESCE(a.name, iu.cad_unit_id) ORDER BY COUNT(DISTINCT iu.incident_id) DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    responses_per_unit = [{"unit": row[0], "unit_name": row[1], "responses": row[2]} for row in unit_result]
    
    mutual_aid = []
    if is_fire_report:
        ma_result = db.execute(text(f"""
            SELECT unnest(neris_aid_departments), COUNT(*) FROM incidents i
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL AND i.neris_aid_direction = 'GIVEN' AND i.neris_aid_departments IS NOT NULL {prefix_filter}
            GROUP BY unnest(neris_aid_departments) ORDER BY COUNT(*) DESC
        """), {"start_date": start_date, "end_date": end_date})
        mutual_aid = [{"station": row[0], "count": row[1]} for row in ma_result]
    
    # EMS: Units assisted — other departments' units on EMS calls that arrived on scene
    units_assisted = []
    if category and category.upper() == 'EMS':
        ua_result = db.execute(text(f"""
            SELECT 
                unit_elem->>'unit_id' AS unit_id,
                COUNT(DISTINCT i.id) AS assist_count
            FROM incidents i,
                 jsonb_array_elements(i.cad_units) AS unit_elem
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL {prefix_filter}
              AND unit_elem->>'time_arrived' IS NOT NULL
              AND (unit_elem->>'is_mutual_aid')::boolean IS TRUE
            GROUP BY unit_elem->>'unit_id'
            ORDER BY assist_count DESC
        """), {"start_date": start_date, "end_date": end_date})
        units_assisted = [{"unit": row[0], "count": row[1]} for row in ua_result]
    
    times = _get_response_times(db, start_date, end_date, category)
    
    return {
        "month": month, "year": year, "month_name": start_date.strftime("%B"),
        "category_filter": category.upper() if category else "ALL",
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "call_summary": call_summary, "municipalities": municipalities, "incident_types": incident_types,
        "incident_types_grouped": list(incident_types_grouped.values()), "responses_per_unit": responses_per_unit,
        "mutual_aid": mutual_aid, "units_assisted": units_assisted, "response_times": times
    }


@router.get("/html/monthly")
async def get_monthly_html_report(year: int = Query(...), month: int = Query(...), category: Optional[str] = None, db: Session = Depends(get_db)):
    report = await get_monthly_chiefs_report(year, month, category, db)
    branding = get_branding(db)
    
    is_fire_report = category and category.upper() == 'FIRE'
    cs = report['call_summary']
    rt = report['response_times'] or {}
    
    logo_data_url = get_logo_data_url(branding) or ""
    station_name = branding.get('station_name', 'Fire Department')
    station_short_name = branding.get('station_short_name', '') or station_name
    primary_color = branding.get('primary_color', '#1e6b35')
    
    def fmt_currency(cents):
        return f"${(cents or 0) / 100:,.0f}"
    
    muni_rows = '\n'.join([f'<tr><td>{m["municipality"]}</td><td class="text-center">{m["calls"]}</td><td class="text-right">{m["manhours"]:.1f}</td></tr>' for m in report['municipalities']]) or '<tr><td colspan="3" class="text-center">No data</td></tr>'
    unit_rows = '\n'.join([f'<div class="unit-row clearfix"><span class="unit-name">{u["unit_name"] or u["unit"]}</span><span class="unit-count">{u["responses"]}</span></div>' for u in report['responses_per_unit']]) or '<div class="unit-row"><span>No data</span></div>'
    incident_groups = '\n'.join([f'''<div class="incident-group"><div class="incident-group-header clearfix"><span>{grp['type']}</span><span class="count">{grp['count']}</span></div>{''.join([f'<div class="incident-subtype clearfix"><span>{st["subtype"]}</span><span class="count">{st["count"]}</span></div>' for st in grp['subtypes']])}</div>''' for grp in report.get('incident_types_grouped', [])]) or '<div>No incidents</div>'
    
    mutual_aid_section = ''
    if is_fire_report:
        ma_rows = '\n'.join([f'<tr><td>{ma["station"]}</td><td class="text-center">{ma["count"]}</td></tr>' for ma in report.get('mutual_aid', [])]) or '<tr><td colspan="2" class="text-center">None</td></tr>'
        mutual_aid_section = f'<div class="section"><div class="section-title">Mutual Aid Given</div><table><thead><tr><th>Station</th><th class="text-center">Count</th></tr></thead><tbody>{ma_rows}</tbody></table></div>'
    else:
        ua_rows = '\n'.join([f'<tr><td>{ua["unit"]}</td><td class="text-center">{ua["count"]}</td></tr>' for ua in report.get('units_assisted', [])]) or '<tr><td colspan="2" class="text-center">None</td></tr>'
        mutual_aid_section = f'<div class="section"><div class="section-title">Units Assisted</div><table><thead><tr><th>Unit</th><th class="text-center">Count</th></tr></thead><tbody>{ua_rows}</tbody></table></div>'
    
    property_section = ''
    if is_fire_report:
        property_section = f'''<div class="section"><div class="section-title">Property & Safety</div><div class="stats-row"><div class="stat-box"><div class="stat-value">{fmt_currency(cs.get('property_at_risk', 0))}</div><div class="stat-label">Property at Risk</div></div><div class="stat-box"><div class="stat-value">{fmt_currency(cs.get('fire_damages', 0))}</div><div class="stat-label">Fire Damages</div></div><div class="stat-box"><div class="stat-value">{cs.get('ff_injuries', 0)}</div><div class="stat-label">FF Injuries</div></div><div class="stat-box"><div class="stat-value">{cs.get('civilian_injuries', 0)}</div><div class="stat-label">Civilian Injuries</div></div></div></div>'''
    
    html = f'''<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>{station_name} - Monthly Report</title>
<style>@page {{ size: letter; margin: 0.4in; }} * {{ margin: 0; padding: 0; box-sizing: border-box; }} body {{ font-family: Arial, Helvetica, sans-serif; font-size: 9px; line-height: 1.3; color: #1a1a1a; }} .header {{ display: table; width: 100%; border-bottom: 3px solid {primary_color}; padding-bottom: 8px; margin-bottom: 10px; }} .header-logo {{ display: table-cell; width: 70px; vertical-align: middle; }} .header-logo img {{ width: 60px; height: auto; }} .header-text {{ display: table-cell; vertical-align: middle; padding-left: 12px; }} .header h1 {{ font-size: 20px; font-weight: 700; margin: 0; }} .header .subtitle {{ font-size: 11px; color: {primary_color}; font-weight: 600; margin-top: 2px; }} .section {{ background: #e8e8e8; border: 1px solid #d0d0d0; border-radius: 4px; padding: 8px 10px; margin-bottom: 8px; }} .section-title {{ font-size: 8px; font-weight: 700; color: {primary_color}; text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 6px; }} .stats-row {{ display: table; width: 100%; }} .stat-box {{ display: table-cell; text-align: center; background: white; padding: 8px 4px; border: 1px solid #e0e0e0; border-radius: 3px; }} .stat-value {{ font-size: 16px; font-weight: 700; }} .stat-value.highlight {{ color: {primary_color}; }} .stat-label {{ font-size: 7px; color: #666; text-transform: uppercase; margin-top: 2px; }} .stat-compare {{ font-size: 7px; color: #666; margin-top: 2px; }} table {{ width: 100%; border-collapse: collapse; font-size: 8px; }} th {{ background: #f0f0f0; font-weight: 600; text-align: left; padding: 4px 6px; border-bottom: 1px solid #ccc; }} td {{ padding: 3px 6px; border-bottom: 1px solid #e0e0e0; }} .text-right {{ text-align: right; }} .text-center {{ text-align: center; }} .times-row {{ display: table; width: 100%; }} .time-box {{ display: table-cell; background: white; border: 1px solid #e0e0e0; border-radius: 3px; padding: 6px 4px; text-align: center; }} .time-value {{ font-size: 16px; font-weight: 700; }} .time-label {{ font-size: 7px; color: #666; text-transform: uppercase; margin-top: 2px; }} .row {{ display: table; width: 100%; margin-bottom: 8px; }} .col {{ display: table-cell; vertical-align: top; }} .col-half {{ width: 49%; }} .col-half:first-child {{ padding-right: 8px; }} .col-half:last-child {{ padding-left: 8px; }} .incident-group {{ margin-bottom: 6px; }} .incident-group-header {{ background: {primary_color}; color: white; padding: 4px 8px; border-radius: 2px; font-weight: 600; font-size: 8px; }} .incident-group-header .count {{ float: right; background: rgba(255,255,255,0.3); padding: 1px 8px; border-radius: 8px; font-size: 7px; }} .incident-subtype {{ padding: 2px 8px 2px 16px; font-size: 7px; color: #444; border-bottom: 1px dotted #ccc; }} .incident-subtype .count {{ float: right; font-weight: 600; color: #666; }} .unit-row {{ padding: 3px 0; border-bottom: 1px dotted #ccc; font-size: 8px; }} .unit-count {{ float: right; font-weight: 600; color: {primary_color}; }} .footer {{ margin-top: 10px; padding-top: 6px; border-top: 1px solid #ddd; font-size: 8px; color: #888; }} .footer-left {{ float: left; }} .footer-right {{ float: right; }} .clearfix::after {{ content: ""; display: table; clear: both; }}</style>
</head>
<body>
<div class="header"><div class="header-logo"><img src="{logo_data_url}" alt="Logo"></div><div class="header-text"><h1>{station_name.upper()}</h1><div class="subtitle">Monthly Activity Report — {report['month_name']} {report['year']}</div></div></div>
<div class="section"><div class="section-title">Call Summary</div><div class="stats-row"><div class="stat-box"><div class="stat-value highlight">{cs['number_of_calls']}</div><div class="stat-label">Total Calls</div><div class="stat-compare">vs. last year: {'+' if cs['change'] >= 0 else ''}{cs['change']}</div></div><div class="stat-box"><div class="stat-value">{cs['responded']} ({cs['responded_pct']:.1f}%)</div><div class="stat-label">Responded</div></div><div class="stat-box"><div class="stat-value">{cs['unique_responders']}</div><div class="stat-label">Responders</div></div><div class="stat-box"><div class="stat-value">{cs['hours']:.1f}</div><div class="stat-label">Total Hours</div></div><div class="stat-box"><div class="stat-value">{cs['man_hours']:.1f}</div><div class="stat-label">Man Hours</div></div></div></div>
<div class="section"><div class="section-title">Response Times</div><div class="times-row"><div class="time-box"><div class="time-value">{rt.get('avg_turnout_minutes', 0) or 0:.1f}</div><div class="time-label">Avg Turnout (min)</div></div><div class="time-box"><div class="time-value">{rt.get('avg_response_minutes', 0) or 0:.1f}</div><div class="time-label">Avg Response (min)</div></div><div class="time-box"><div class="time-value">{rt.get('avg_on_scene_minutes', 0) or 0:.1f}</div><div class="time-label">Avg On Scene (min)</div></div></div></div>
<div class="row"><div class="col col-half"><div class="section"><div class="section-title">Response by Municipality</div><table><thead><tr><th>Municipality</th><th class="text-center">Calls</th><th class="text-right">Man Hrs</th></tr></thead><tbody>{muni_rows}</tbody></table></div></div><div class="col col-half"><div class="section"><div class="section-title">Responses by Unit</div>{unit_rows}</div></div></div>
<div class="row"><div class="col col-half"><div class="section"><div class="section-title">Incident Types</div>{incident_groups}</div></div><div class="col col-half">{mutual_aid_section}</div></div>
{property_section}
<div class="footer clearfix"><span class="footer-left">{station_name} — {station_short_name}</span><span class="footer-right">Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}</span></div>
</body></html>'''
    
    return HTMLResponse(content=html)


@router.get("/pdf/monthly-weasy")
async def get_monthly_pdf(year: int = Query(...), month: int = Query(...), category: Optional[str] = None, db: Session = Depends(get_db)):
    from weasyprint import HTML
    
    html_response = await get_monthly_html_report(year, month, category, db)
    html_content = html_response.body.decode('utf-8')
    
    pdf_buffer = io.BytesIO()
    HTML(string=html_content).write_pdf(pdf_buffer)
    pdf_buffer.seek(0)
    
    month_name = date(year, month, 1).strftime("%B")
    filename = f"monthly_report_{year}_{month:02d}_{month_name}.pdf"
    
    return StreamingResponse(pdf_buffer, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename={filename}"})
