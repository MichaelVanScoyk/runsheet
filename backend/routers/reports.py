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
    """
    Calculate manhours for incidents in date range.
    Manhours = sum of (incident duration × personnel count) for each incident
    """
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND i.call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        WITH incident_durations AS (
            SELECT 
                i.id,
                i.internal_incident_number,
                COALESCE(i.incident_date, i.created_at::date) AS inc_date,
                -- Duration in hours: from dispatch to cleared
                EXTRACT(EPOCH FROM (
                    COALESCE(i.time_last_cleared, i.time_first_on_scene) - i.time_dispatched
                )) / 3600.0 AS duration_hours,
                -- Count personnel assignments
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
        WHERE duration_hours > 0 AND duration_hours < 24  -- Filter out bad data
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

@router.get("/debug")
async def debug_incidents(
    db: Session = Depends(get_db)
):
    """Debug endpoint to check what incidents exist and their dates"""
    result = db.execute(text("""
        SELECT 
            id, 
            internal_incident_number, 
            incident_date,
            created_at::date as created_date,
            status,
            time_dispatched IS NOT NULL as has_dispatch_time,
            (SELECT COUNT(*) FROM incident_personnel ip WHERE ip.incident_id = incidents.id) as personnel_count
        FROM incidents
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 20
    """))
    
    incidents = []
    for row in result:
        incidents.append({
            "id": row[0],
            "number": row[1],
            "incident_date": str(row[2]) if row[2] else None,
            "created_date": str(row[3]) if row[3] else None,
            "status": row[4],
            "has_dispatch_time": row[5],
            "personnel_count": row[6]
        })
    
    return {
        "total_found": len(incidents),
        "incidents": incidents
    }


@router.get("/summary")
async def get_summary_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get overall summary statistics for date range"""
    
    # Build category filter
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND call_category = '{category.upper()}'"
    
    # Basic counts - use COALESCE to fall back to created_at if incident_date is null
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
    
    # Manhours
    manhours = calculate_manhours(db, start_date, end_date, category)
    
    # Response times
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


@router.get("/by-municipality")
async def get_municipality_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get incident breakdown by municipality"""
    
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND i.call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT 
            COALESCE(m.display_name, i.municipality_code, 'Unknown') AS municipality,
            COUNT(*) AS incident_count,
            COUNT(DISTINCT i.cad_event_type) AS unique_call_types
        FROM incidents i
        LEFT JOIN municipalities m ON i.municipality_code = m.code
        WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
          AND i.deleted_at IS NULL
          {cat_filter}
        GROUP BY COALESCE(m.display_name, i.municipality_code, 'Unknown')
        ORDER BY incident_count DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    municipalities = []
    for row in result:
        municipalities.append({
            "municipality": row[0],
            "incident_count": row[1],
            "unique_call_types": row[2]
        })
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "municipalities": municipalities
    }


@router.get("/by-type")
async def get_type_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get incident breakdown by call type"""
    
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT 
            COALESCE(cad_event_type, 'Unknown') AS call_type,
            COUNT(*) AS incident_count,
            AVG(EXTRACT(EPOCH FROM (
                time_last_cleared - time_dispatched
            )) / 60) AS avg_duration_minutes
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
          {cat_filter}
        GROUP BY COALESCE(cad_event_type, 'Unknown')
        ORDER BY incident_count DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    call_types = []
    for row in result:
        call_types.append({
            "call_type": row[0],
            "incident_count": row[1],
            "avg_duration_minutes": round(float(row[2] or 0), 1) if row[2] else None
        })
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "call_types": call_types
    }


@router.get("/by-apparatus")
async def get_apparatus_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get incident breakdown by apparatus"""
    
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND i.call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT 
            a.unit_designator,
            a.name AS apparatus_name,
            COUNT(DISTINCT ip.incident_id) AS incident_count,
            COUNT(ip.id) AS total_responses
        FROM apparatus a
        LEFT JOIN incident_personnel ip ON ip.apparatus_id = a.id
        LEFT JOIN incidents i ON ip.incident_id = i.id 
            AND COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
            AND i.deleted_at IS NULL
            {cat_filter}
        WHERE a.is_virtual = false AND a.active = true
        GROUP BY a.id, a.unit_designator, a.name
        ORDER BY incident_count DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    apparatus = []
    for row in result:
        apparatus.append({
            "unit_designator": row[0],
            "name": row[1],
            "incident_count": row[2],
            "total_responses": row[3]
        })
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "apparatus": apparatus
    }


@router.get("/personnel")
async def get_personnel_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    limit: int = Query(default=50, le=100),
    db: Session = Depends(get_db)
):
    """Get personnel response statistics - top responders"""
    
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND i.call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        WITH personnel_stats AS (
            SELECT 
                p.id,
                p.first_name,
                p.last_name,
                r.rank_name AS rank_name,
                COUNT(DISTINCT ip.incident_id) AS incident_count,
                -- Calculate manhours per person
                SUM(
                    EXTRACT(EPOCH FROM (
                        COALESCE(i.time_last_cleared, i.time_first_on_scene) - i.time_dispatched
                    )) / 3600.0
                ) AS total_hours
            FROM personnel p
            LEFT JOIN ranks r ON p.rank_id = r.id
            LEFT JOIN incident_personnel ip ON ip.personnel_id = p.id
            LEFT JOIN incidents i ON ip.incident_id = i.id 
                AND COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
                AND i.deleted_at IS NULL
                AND i.time_dispatched IS NOT NULL
                {cat_filter}
            WHERE p.active = true
            GROUP BY p.id, p.first_name, p.last_name, r.rank_name
        )
        SELECT 
            id,
            first_name,
            last_name,
            rank_name,
            incident_count,
            COALESCE(total_hours, 0) AS total_hours
        FROM personnel_stats
        ORDER BY incident_count DESC, total_hours DESC
        LIMIT :limit
    """), {"start_date": start_date, "end_date": end_date, "limit": limit})
    
    personnel = []
    for row in result:
        personnel.append({
            "id": row[0],
            "name": f"{row[1]} {row[2]}",
            "rank": row[3],
            "incident_count": row[4],
            "total_hours": round(float(row[5] or 0), 1)
        })
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "personnel": personnel
    }


@router.get("/monthly-trend")
async def get_monthly_trend(
    year: int = Query(...),
    db: Session = Depends(get_db)
):
    """Get monthly incident trends for a year"""
    
    result = db.execute(text("""
        SELECT 
            EXTRACT(MONTH FROM COALESCE(i.incident_date, i.created_at::date))::int AS month,
            COUNT(*) AS incident_count,
            COALESCE(SUM(
                (SELECT COUNT(*) FROM incident_personnel ip WHERE ip.incident_id = i.id)
            ), 0) AS personnel_responses
        FROM incidents i
        WHERE EXTRACT(YEAR FROM COALESCE(i.incident_date, i.created_at::date)) = :year
          AND i.deleted_at IS NULL
        GROUP BY EXTRACT(MONTH FROM COALESCE(i.incident_date, i.created_at::date))
        ORDER BY month
    """), {"year": year})
    
    # Initialize all months
    months = {m: {"incident_count": 0, "personnel_responses": 0} for m in range(1, 13)}
    
    for row in result:
        months[row[0]] = {
            "incident_count": row[1],
            "personnel_responses": row[2]
        }
    
    monthly_data = [
        {"month": m, "month_name": date(year, m, 1).strftime("%B"), **data}
        for m, data in months.items()
    ]
    
    return {
        "year": year,
        "months": monthly_data,
        "total_incidents": sum(m["incident_count"] for m in monthly_data)
    }


@router.get("/day-of-week")
async def get_day_of_week_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get incident breakdown by day of week"""
    
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT 
            EXTRACT(DOW FROM COALESCE(incident_date, created_at::date))::int AS day_of_week,
            COUNT(*) AS incident_count
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
          {cat_filter}
        GROUP BY EXTRACT(DOW FROM COALESCE(incident_date, created_at::date))
        ORDER BY day_of_week
    """), {"start_date": start_date, "end_date": end_date})
    
    day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    days = {i: {"day_name": day_names[i], "incident_count": 0} for i in range(7)}
    
    for row in result:
        days[row[0]]["incident_count"] = row[1]
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "days": list(days.values())
    }


@router.get("/hour-of-day")
async def get_hour_of_day_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get incident breakdown by hour of day"""
    
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT 
            EXTRACT(HOUR FROM time_dispatched)::int AS hour,
            COUNT(*) AS incident_count
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
          AND time_dispatched IS NOT NULL
          {cat_filter}
        GROUP BY EXTRACT(HOUR FROM time_dispatched)
        ORDER BY hour
    """), {"start_date": start_date, "end_date": end_date})
    
    hours = {h: 0 for h in range(24)}
    for row in result:
        hours[row[0]] = row[1]
    
    hour_data = [
        {"hour": h, "hour_label": f"{h:02d}:00", "incident_count": count}
        for h, count in hours.items()
    ]
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "hours": hour_data
    }


# =============================================================================
# MONTHLY CHIEFS REPORT
# =============================================================================

@router.get("/monthly")
async def get_monthly_chiefs_report(
    year: int = Query(...),
    month: int = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Comprehensive monthly report matching the paper chiefs report format.
    
    Calculates:
    - Number of Calls
    - Number of Men (total personnel responses)
    - Hours (total incident hours: dispatch to in-service)
    - Man Hours (sum of personnel × hours for each incident)
    - By Municipality
    - By Call Type
    - By Unit (responses per apparatus)
    - Mutual Aid given
    - Comparison to same month last year
    """
    
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND i.call_category = '{category.upper()}'"
    
    # Date range for this month
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month + 1, 1) - timedelta(days=1)
    
    # Same month last year for comparison
    prev_start = date(year - 1, month, 1)
    if month == 12:
        prev_end = date(year, 1, 1) - timedelta(days=1)
    else:
        prev_end = date(year - 1, month + 1, 1) - timedelta(days=1)
    
    # =========================================================================
    # CALL SUMMARY - Main stats
    # =========================================================================
    summary_result = db.execute(text(f"""
        WITH incident_data AS (
            SELECT 
                i.id,
                i.internal_incident_number,
                -- Duration in hours from dispatch to cleared
                EXTRACT(EPOCH FROM (
                    COALESCE(i.time_last_cleared, i.time_first_on_scene) - i.time_dispatched
                )) / 3600.0 AS duration_hours,
                -- Count personnel on this incident
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
    
    # Previous year count for comparison
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
    
    # Determine if this is a FIRE report (damage/injury/mutual aid only for FIRE)
    is_fire_report = category and category.upper() == 'FIRE'
    
    # =========================================================================
    # DAMAGE/INJURY TOTALS - Only for FIRE reports, only OUR incidents
    # =========================================================================
    if is_fire_report:
        damage_result = db.execute(text(f"""
            SELECT 
                COALESCE(SUM(property_value_at_risk), 0) AS total_property_at_risk,
                COALESCE(SUM(fire_damages_estimate), 0) AS total_fire_damages,
                COALESCE(SUM(ff_injuries_count), 0) AS total_ff_injuries,
                COALESCE(SUM(civilian_injuries_count), 0) AS total_civilian_injuries
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
        **damage_stats,  # Only included for FIRE
    }
    
    # =========================================================================
    # MUNICIPALITY SUMMARY - damage/injury only for FIRE reports
    # =========================================================================
    if is_fire_report:
        muni_result = db.execute(text(f"""
            WITH incident_data AS (
                SELECT 
                    i.id,
                    COALESCE(m.display_name, i.municipality_code, 'Unknown') AS municipality,
                    EXTRACT(EPOCH FROM (
                        COALESCE(i.time_last_cleared, i.time_first_on_scene) - i.time_dispatched
                    )) / 3600.0 AS duration_hours,
                    (SELECT COUNT(*) FROM incident_personnel ip WHERE ip.incident_id = i.id) AS personnel_count,
                    -- Only include damage/injury for OUR incidents
                    CASE WHEN (i.neris_aid_direction IS NULL OR i.neris_aid_direction != 'GIVEN')
                         THEN COALESCE(i.property_value_at_risk, 0) ELSE 0 END AS property_at_risk,
                    CASE WHEN (i.neris_aid_direction IS NULL OR i.neris_aid_direction != 'GIVEN')
                         THEN COALESCE(i.fire_damages_estimate, 0) ELSE 0 END AS fire_damages,
                    CASE WHEN (i.neris_aid_direction IS NULL OR i.neris_aid_direction != 'GIVEN')
                         THEN COALESCE(i.ff_injuries_count, 0) ELSE 0 END AS ff_injuries,
                    CASE WHEN (i.neris_aid_direction IS NULL OR i.neris_aid_direction != 'GIVEN')
                         THEN COALESCE(i.civilian_injuries_count, 0) ELSE 0 END AS civilian_injuries
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
                             THEN duration_hours * personnel_count ELSE 0 END), 0) AS manhours,
                SUM(property_at_risk) AS property_at_risk,
                SUM(fire_damages) AS fire_damages,
                SUM(ff_injuries) AS ff_injuries,
                SUM(civilian_injuries) AS civilian_injuries
            FROM incident_data
            GROUP BY municipality
            ORDER BY calls DESC, municipality
        """), {"start_date": start_date, "end_date": end_date})
        
        municipalities = []
        for row in muni_result:
            municipalities.append({
                "municipality": row[0],
                "calls": row[1],
                "manhours": round(float(row[2] or 0), 2),
                "property_at_risk": int(row[3] or 0),
                "fire_damages": int(row[4] or 0),
                "ff_injuries": int(row[5] or 0),
                "civilian_injuries": int(row[6] or 0)
            })
    else:
        # EMS: Simple municipality query without damage/injury
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
            ORDER BY calls DESC, municipality
        """), {"start_date": start_date, "end_date": end_date})
        
        municipalities = []
        for row in muni_result:
            municipalities.append({
                "municipality": row[0],
                "calls": row[1],
                "manhours": round(float(row[2] or 0), 2)
            })
    
    # =========================================================================
    # TYPE OF INCIDENT (with subtypes grouped)
    # =========================================================================
    type_result = db.execute(text(f"""
        SELECT 
            COALESCE(cad_event_type, 'Unknown') AS incident_type,
            COALESCE(cad_event_subtype, 'Unspecified') AS incident_subtype,
            COUNT(*) AS count
        FROM incidents i
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
          {cat_filter}
        GROUP BY COALESCE(cad_event_type, 'Unknown'), COALESCE(cad_event_subtype, 'Unspecified')
        ORDER BY incident_type, count DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    # Group subtypes under their parent types
    incident_types_grouped = {}
    for row in type_result:
        type_name = row[0]
        subtype_name = row[1]
        count = row[2]
        
        if type_name not in incident_types_grouped:
            incident_types_grouped[type_name] = {
                "type": type_name,
                "count": 0,
                "subtypes": []
            }
        incident_types_grouped[type_name]["count"] += count
        incident_types_grouped[type_name]["subtypes"].append({
            "subtype": subtype_name,
            "count": count
        })
    
    # Sort by total count descending
    incident_types_grouped = dict(sorted(
        incident_types_grouped.items(), 
        key=lambda x: x[1]["count"], 
        reverse=True
    ))
    
    # Flatten for backward compatibility
    incident_types = [
        {"type": v["type"], "count": v["count"]} 
        for v in incident_types_grouped.values()
    ]
    
    # =========================================================================
    # RESPONSES PER UNIT
    # =========================================================================
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
        GROUP BY COALESCE(a.unit_designator, iu.cad_unit_id, 'Unknown'), 
                 COALESCE(a.name, iu.cad_unit_id)
        ORDER BY responses DESC, unit
    """), {"start_date": start_date, "end_date": end_date})
    
    responses_per_unit = []
    for row in unit_result:
        responses_per_unit.append({
            "unit": row[0],
            "unit_name": row[1],
            "responses": row[2]
        })
    
    # =========================================================================
    # MUTUAL AID GIVEN (Assist To) - FIRE ONLY
    # neris_aid_direction = 'GIVEN' means we responded to help another station
    # neris_aid_departments contains the station(s) we assisted
    # =========================================================================
    if is_fire_report:
        mutual_aid_result = db.execute(text(f"""
            SELECT 
                unnest(neris_aid_departments) AS assisted_station,
                COUNT(*) AS count
            FROM incidents i
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND i.neris_aid_direction = 'GIVEN'
              AND i.neris_aid_departments IS NOT NULL
              AND array_length(i.neris_aid_departments, 1) > 0
              {cat_filter}
            GROUP BY unnest(neris_aid_departments)
            ORDER BY count DESC
        """), {"start_date": start_date, "end_date": end_date})
        
        mutual_aid = []
        for row in mutual_aid_result:
            mutual_aid.append({
                "station": row[0],
                "count": row[1]
            })
    else:
        # EMS: No mutual aid tracking
        mutual_aid = []
    
    # =========================================================================
    # RESPONSE TIMES
    # =========================================================================
    times = get_response_times(db, start_date, end_date, category)
    
    return {
        "month": month,
        "year": year,
        "month_name": start_date.strftime("%B"),
        "category_filter": category.upper() if category else "ALL",
        "date_range": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat()
        },
        "call_summary": call_summary,
        "municipalities": municipalities,
        "incident_types": incident_types,
        "incident_types_grouped": list(incident_types_grouped.values()),
        "responses_per_unit": responses_per_unit,
        "mutual_aid": mutual_aid,
        "response_times": times
    }


@router.get("/html/monthly")
async def get_monthly_html_report(
    year: int = Query(...),
    month: int = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Generate printable HTML report for Monthly Chiefs Report.
    Opens in new window for browser printing - fills full 8.5x11 page.
    
    All tenant-specific values (name, logo, station number) come from settings table.
    """
    # Get the report data
    report = await get_monthly_chiefs_report(year, month, category, db)
    
    is_fire_report = category and category.upper() == 'FIRE'
    cs = report['call_summary']
    rt = report['response_times'] or {}
    
    # ==========================================================================
    # TENANT SETTINGS - Pull all dynamic values from settings table
    # ==========================================================================
    
    # Station identity
    station_name_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'station' AND key = 'name'")
    ).fetchone()
    station_name = station_name_result[0] if station_name_result else "Fire Department"
    
    station_number_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'station' AND key = 'number'")
    ).fetchone()
    station_number = station_number_result[0] if station_number_result else ""
    
    station_short_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'station' AND key = 'short_name'")
    ).fetchone()
    station_short_name = station_short_result[0] if station_short_result else f"Station {station_number}"
    
    # Branding - logo
    logo_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo'")
    ).fetchone()
    logo_mime_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo_mime_type'")
    ).fetchone()
    
    if logo_result and logo_result[0]:
        mime_type = logo_mime_result[0] if logo_mime_result else 'image/png'
        logo_data_url = f"data:{mime_type};base64,{logo_result[0]}"
    else:
        logo_data_url = ""
    
    def fmt_currency(cents):
        return f"${(cents or 0) / 100:,.0f}"
    
    # Generate municipality rows
    if is_fire_report:
        muni_headers = '''<tr>
            <th>Municipality</th>
            <th class="text-center">Calls</th>
            <th class="text-right">Man Hrs</th>
            <th class="text-right">Prop Risk</th>
            <th class="text-right">Damages</th>
            <th class="text-center">FF Inj</th>
            <th class="text-center">Civ Inj</th>
        </tr>'''
        muni_rows = '\n'.join([
            f'''<tr>
                <td>{m['municipality']}</td>
                <td class="text-center">{m['calls']}</td>
                <td class="text-right">{m['manhours']:.1f}</td>
                <td class="text-right">{fmt_currency(m.get('property_at_risk', 0))}</td>
                <td class="text-right">{fmt_currency(m.get('fire_damages', 0))}</td>
                <td class="text-center">{m.get('ff_injuries', 0)}</td>
                <td class="text-center">{m.get('civilian_injuries', 0)}</td>
            </tr>'''
            for m in report['municipalities']
        ]) or '<tr><td colspan="7" class="text-center">No data</td></tr>'
    else:
        muni_headers = '''<tr>
            <th>Municipality</th>
            <th class="text-center">Calls</th>
            <th class="text-right">Man Hrs</th>
        </tr>'''
        muni_rows = '\n'.join([
            f'''<tr>
                <td>{m['municipality']}</td>
                <td class="text-center">{m['calls']}</td>
                <td class="text-right">{m['manhours']:.1f}</td>
            </tr>'''
            for m in report['municipalities']
        ]) or '<tr><td colspan="3" class="text-center">No data</td></tr>'
    
    # Generate unit rows
    unit_rows = '\n'.join([
        f'''<div class="unit-row clearfix">
            <span class="unit-name">{u['unit_name'] or u['unit']}</span>
            <span class="unit-count">{u['responses']}</span>
        </div>'''
        for u in report['responses_per_unit']
    ]) or '<div class="unit-row"><span>No data</span></div>'
    
    # Generate incident type groups with subtypes
    incident_groups = '\n'.join([
        f'''<div class="incident-group">
            <div class="incident-group-header clearfix">
                <span>{grp['type']}</span>
                <span class="count">{grp['count']}</span>
            </div>
            {''.join([f'<div class="incident-subtype clearfix"><span>{st["subtype"]}</span><span class="count">{st["count"]}</span></div>' for st in grp['subtypes']])}
        </div>'''
        for grp in report.get('incident_types_grouped', [])
    ]) or '<div>No incidents</div>'
    
    # Mutual aid section (FIRE only)
    mutual_aid_section = ''
    if is_fire_report:
        ma_rows = '\n'.join([
            f'<tr><td>{ma["station"]}</td><td class="text-center">{ma["count"]}</td></tr>'
            for ma in report.get('mutual_aid', [])
        ]) or '<tr><td colspan="2" class="text-center">None</td></tr>'
        mutual_aid_section = f'''
                <div class="section">
                    <div class="section-title">Mutual Aid Given</div>
                    <table>
                        <thead><tr><th>Station</th><th class="text-center">Count</th></tr></thead>
                        <tbody>{ma_rows}</tbody>
                    </table>
                </div>'''
    
    # Property/Safety section (FIRE only)
    property_section = ''
    if is_fire_report:
        property_section = f'''
        <div class="section">
            <div class="section-title">Property & Safety</div>
            <div class="stats-row">
                <div class="stat-box">
                    <div class="stat-value">{fmt_currency(cs.get('property_at_risk', 0))}</div>
                    <div class="stat-label">Property at Risk</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">{fmt_currency(cs.get('fire_damages', 0))}</div>
                    <div class="stat-label">Fire Damages</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">{cs.get('ff_injuries', 0)}</div>
                    <div class="stat-label">FF Injuries</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">{cs.get('civilian_injuries', 0)}</div>
                    <div class="stat-label">Civilian Injuries</div>
                </div>
            </div>
        </div>'''
    
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{station_name} - Monthly Report</title>
    <style>
        @page {{ 
            size: letter; 
            margin: 0.4in;
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: Arial, Helvetica, sans-serif;
            font-size: 9px;
            line-height: 1.3;
            color: #1a1a1a;
        }}
        .header {{
            display: table;
            width: 100%;
            border-bottom: 3px solid #1e6b35;
            padding-bottom: 8px;
            margin-bottom: 10px;
        }}
        .header-logo {{ display: table-cell; width: 70px; vertical-align: middle; }}
        .header-logo img {{ width: 60px; height: auto; }}
        .header-text {{ display: table-cell; vertical-align: middle; padding-left: 12px; }}
        .header h1 {{ font-size: 20px; font-weight: 700; color: #1a1a1a; letter-spacing: 1px; margin: 0; }}
        .header .subtitle {{ font-size: 11px; color: #1e6b35; font-weight: 600; margin-top: 2px; }}
        .content {{ width: 100%; }}
        .row {{ display: table; width: 100%; margin-bottom: 8px; }}
        .col {{ display: table-cell; vertical-align: top; }}
        .col-half {{ width: 49%; }}
        .col-half:first-child {{ padding-right: 8px; }}
        .col-half:last-child {{ padding-left: 8px; }}
        .section {{ background: #e8e8e8; border: 1px solid #d0d0d0; border-radius: 4px; padding: 8px 10px; margin-bottom: 8px; }}
        .section-title {{ font-size: 8px; font-weight: 700; color: #1e6b35; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 6px; }}
        .stats-row {{ display: table; width: 100%; }}
        .stat-box {{ display: table-cell; text-align: center; background: white; padding: 8px 4px; border: 1px solid #e0e0e0; border-radius: 3px; }}
        .stat-value {{ font-size: 20px; font-weight: 700; color: #1a1a1a; }}
        .stat-value.highlight {{ color: #1e6b35; }}
        .stat-label {{ font-size: 7px; color: #666; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 2px; }}
        .stat-compare {{ font-size: 7px; color: #666; margin-top: 2px; }}
        table {{ width: 100%; border-collapse: collapse; font-size: 8px; }}
        th {{ background: #f0f0f0; font-weight: 600; text-align: left; padding: 4px 6px; border-bottom: 1px solid #ccc; }}
        td {{ padding: 3px 6px; border-bottom: 1px solid #e0e0e0; }}
        tr:last-child td {{ border-bottom: none; }}
        .text-right {{ text-align: right; }}
        .text-center {{ text-align: center; }}
        .times-row {{ display: table; width: 100%; }}
        .time-box {{ display: table-cell; background: white; border: 1px solid #e0e0e0; border-radius: 3px; padding: 6px 4px; text-align: center; }}
        .time-value {{ font-size: 16px; font-weight: 700; color: #1a1a1a; }}
        .time-label {{ font-size: 7px; color: #666; text-transform: uppercase; margin-top: 2px; }}
        .footer {{ margin-top: 10px; padding-top: 6px; border-top: 1px solid #ddd; font-size: 8px; color: #888; }}
        .footer-left {{ float: left; }}
        .footer-right {{ float: right; }}
        .incident-group {{ margin-bottom: 6px; }}
        .incident-group:last-child {{ margin-bottom: 0; }}
        .incident-group-header {{ background: #1e6b35; color: white; padding: 4px 8px; border-radius: 2px; font-weight: 600; font-size: 8px; }}
        .incident-group-header .count {{ float: right; background: rgba(255,255,255,0.3); padding: 1px 8px; border-radius: 8px; font-size: 7px; }}
        .incident-subtype {{ padding: 2px 8px 2px 16px; font-size: 7px; color: #444; border-bottom: 1px dotted #ccc; }}
        .incident-subtype:last-child {{ border-bottom: none; }}
        .incident-subtype .count {{ float: right; font-weight: 600; color: #666; }}
        .unit-row {{ padding: 3px 0; border-bottom: 1px dotted #ccc; font-size: 8px; }}
        .unit-row:last-child {{ border-bottom: none; }}
        .unit-name {{ display: inline; }}
        .unit-count {{ float: right; font-weight: 600; color: #1e6b35; }}
        .clearfix::after {{ content: ""; display: table; clear: both; }}
    </style>
</head>
<body>
    <!-- Watermark -->
    <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.06; z-index: -1;">
        <img src="{logo_data_url}" style="width: 350px; height: auto;" alt="">
    </div>

    <div class="header">
        <div class="header-logo"><img src="{logo_data_url}" alt="Logo"></div>
        <div class="header-text">
            <h1>{station_name.upper()}</h1>
            <div class="subtitle">Monthly Activity Report — {report['month_name']} {report['year']}</div>
        </div>
    </div>
    
    <div class="content">
        <!-- Call Summary -->
        <div class="section">
            <div class="section-title">Call Summary</div>
            <div class="stats-row">
                <div class="stat-box">
                    <div class="stat-value highlight">{cs['number_of_calls']}</div>
                    <div class="stat-label">Total Calls</div>
                    <div class="stat-compare">vs. last year: {'+' if cs['change'] >= 0 else ''}{cs['change']}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">{cs['number_of_men']}</div>
                    <div class="stat-label">Personnel</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">{cs['hours']:.1f}</div>
                    <div class="stat-label">Total Hours</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">{cs['man_hours']:.1f}</div>
                    <div class="stat-label">Man Hours</div>
                </div>
            </div>
        </div>

        <!-- Response Times -->
        <div class="section">
            <div class="section-title">Response Times</div>
            <div class="times-row">
                <div class="time-box">
                    <div class="time-value">{rt.get('avg_turnout_minutes', 0) or 0:.1f}</div>
                    <div class="time-label">Avg Turnout (min)</div>
                </div>
                <div class="time-box">
                    <div class="time-value">{rt.get('avg_response_minutes', 0) or 0:.1f}</div>
                    <div class="time-label">Avg Response (min)</div>
                </div>
                <div class="time-box">
                    <div class="time-value">{rt.get('avg_on_scene_minutes', 0) or 0:.1f}</div>
                    <div class="time-label">Avg On Scene (min)</div>
                </div>
            </div>
        </div>

        <!-- Two Column Row: Municipality + Units -->
        <div class="row">
            <div class="col col-half">
                <div class="section">
                    <div class="section-title">Response by Municipality</div>
                    <table>
                        <thead>{muni_headers}</thead>
                        <tbody>{muni_rows}</tbody>
                    </table>
                </div>
            </div>
            <div class="col col-half">
                <div class="section">
                    <div class="section-title">Responses by Unit</div>
                    {unit_rows}
                </div>
            </div>
        </div>

        <!-- Two Column Row: Incident Types + Mutual Aid -->
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
    </div>

    <div class="footer clearfix">
        <span class="footer-left">{station_name} — {station_short_name}</span>
        <span class="footer-right">Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}</span>
    </div>
</body>
</html>'''
    
    return HTMLResponse(content=html)


@router.get("/pdf")
async def generate_pdf_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    report_type: str = Query(default="summary"),
    db: Session = Depends(get_db)
):
    """Generate PDF report for download"""
    
    # Get report data based on type
    if report_type == "summary":
        # Get all data for comprehensive report
        summary = await get_summary_report(start_date, end_date, db)
        municipalities = await get_municipality_report(start_date, end_date, db)
        call_types = await get_type_report(start_date, end_date, db)
        personnel = await get_personnel_report(start_date, end_date, limit=20, db=db)
        
        report_data = {
            "summary": summary,
            "municipalities": municipalities,
            "call_types": call_types,
            "personnel": personnel
        }
    else:
        report_data = {"error": "Unknown report type"}
    
    # Generate PDF using reportlab
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT
        
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, alignment=TA_CENTER)
        subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=12, alignment=TA_CENTER, textColor=colors.grey)
        section_style = ParagraphStyle('Section', parent=styles['Heading2'], fontSize=14, spaceAfter=10)
        
        elements = []
        
        # Title
        elements.append(Paragraph("Incident Report", title_style))
        elements.append(Paragraph(f"{start_date.strftime('%B %d, %Y')} - {end_date.strftime('%B %d, %Y')}", subtitle_style))
        elements.append(Spacer(1, 0.3*inch))
        
        # Summary section
        elements.append(Paragraph("Summary Statistics", section_style))
        summary_data = [
            ["Total Incidents", str(report_data["summary"]["total_incidents"])],
            ["Total Personnel Responses", str(report_data["summary"]["total_personnel_responses"])],
            ["Total Manhours", f"{report_data['summary']['total_manhours']:.1f}"],
            ["Avg Incident Duration", f"{report_data['summary']['avg_incident_duration_hours']:.1f} hrs"],
        ]
        if report_data["summary"]["response_times"]["avg_response_minutes"]:
            summary_data.append(["Avg Response Time", f"{report_data['summary']['response_times']['avg_response_minutes']:.1f} min"])
        
        summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 0.3*inch))
        
        # Incidents by Municipality
        if report_data["municipalities"]["municipalities"]:
            elements.append(Paragraph("Incidents by Municipality", section_style))
            muni_data = [["Municipality", "Incidents"]]
            for m in report_data["municipalities"]["municipalities"][:10]:
                muni_data.append([m["municipality"], str(m["incident_count"])])
            
            muni_table = Table(muni_data, colWidths=[4*inch, 1.5*inch])
            muni_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 6),
                ('ALIGN', (1, 0), (1, -1), 'CENTER'),
            ]))
            elements.append(muni_table)
            elements.append(Spacer(1, 0.3*inch))
        
        # Incidents by Type
        if report_data["call_types"]["call_types"]:
            elements.append(Paragraph("Incidents by Call Type", section_style))
            type_data = [["Call Type", "Count", "Avg Duration"]]
            for t in report_data["call_types"]["call_types"][:10]:
                dur = f"{t['avg_duration_minutes']:.0f} min" if t['avg_duration_minutes'] else "-"
                type_data.append([t["call_type"], str(t["incident_count"]), dur])
            
            type_table = Table(type_data, colWidths=[3*inch, 1*inch, 1.5*inch])
            type_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 6),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ]))
            elements.append(type_table)
            elements.append(Spacer(1, 0.3*inch))
        
        # Top Responders
        if report_data["personnel"]["personnel"]:
            elements.append(Paragraph("Top Responders", section_style))
            pers_data = [["Name", "Rank", "Calls", "Hours"]]
            for p in report_data["personnel"]["personnel"][:15]:
                pers_data.append([
                    p["name"], 
                    p["rank"] or "-", 
                    str(p["incident_count"]),
                    f"{p['total_hours']:.1f}"
                ])
            
            pers_table = Table(pers_data, colWidths=[2.5*inch, 1.5*inch, 0.75*inch, 0.75*inch])
            pers_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 6),
                ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
            ]))
            elements.append(pers_table)
        
        # Footer
        elements.append(Spacer(1, 0.5*inch))
        elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", 
                                  ParagraphStyle('Footer', fontSize=8, textColor=colors.grey, alignment=TA_CENTER)))
        
        doc.build(elements)
        buffer.seek(0)
        
        filename = f"incident_report_{start_date}_{end_date}.pdf"
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except ImportError:
        raise HTTPException(
            status_code=500, 
            detail="PDF generation requires reportlab. Install with: pip install reportlab"
        )


# =============================================================================
# INCIDENT REPORT PDF
# =============================================================================

@router.get("/html/incident/{incident_id}")
async def get_incident_html_report(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """Generate printable HTML report - matches PrintView.jsx structure with branding colors."""
    from settings_helper import format_local_time, format_local_date, get_timezone
    
    incident = db.execute(text("SELECT * FROM incidents WHERE id = :id AND deleted_at IS NULL"), {"id": incident_id}).fetchone()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    inc = dict(incident._mapping)
    
    # Print settings
    ps_result = db.execute(text("SELECT value FROM settings WHERE category = 'print' AND key = 'settings'")).fetchone()
    ps = {'showHeader': True, 'showTimes': True, 'showLocation': True, 'showDispatchInfo': True, 'showSituationFound': True, 'showExtentOfDamage': True, 'showServicesProvided': True, 'showNarrative': True, 'showPersonnelGrid': True, 'showEquipmentUsed': True, 'showOfficerInfo': True, 'showProblemsIssues': True, 'showCadUnits': True, 'showCadUnitDetails': False, 'showWeather': True, 'showCrossStreets': True, 'showCallerInfo': False}
    if ps_result and ps_result[0]:
        try: ps.update(json.loads(ps_result[0]))
        except: pass
    
    # Station settings
    station_name = (db.execute(text("SELECT value FROM settings WHERE category = 'station' AND key = 'name'")).fetchone() or ["Fire Department"])[0]
    station_number = (db.execute(text("SELECT value FROM settings WHERE category = 'station' AND key = 'number'")).fetchone() or [""])[0]
    
    # Branding - logo and colors
    logo_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo'")).fetchone()
    logo_mime = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo_mime_type'")).fetchone()
    logo_url = f"data:{logo_mime[0] if logo_mime else 'image/png'};base64,{logo_result[0]}" if logo_result and logo_result[0] else ""
    
    primary_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'primary_color'")).fetchone()
    secondary_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'secondary_color'")).fetchone()
    primary_color = primary_result[0] if primary_result else "#016a2b"
    secondary_color = secondary_result[0] if secondary_result else "#eeee01"
    
    # Personnel lookup - for name display
    personnel_rows = db.execute(text("SELECT id, first_name, last_name FROM personnel")).fetchall()
    personnel_lookup = {p[0]: f"{p[2]}, {p[1]}" for p in personnel_rows}
    
    # Apparatus lookup
    apparatus_rows = db.execute(text("SELECT id, unit_designator, name, slot_count FROM apparatus WHERE active = true ORDER BY unit_designator")).fetchall()
    apparatus_list = [{'id': a[0], 'unit_designator': a[1], 'name': a[2], 'slot_count': a[3] or 6} for a in apparatus_rows]
    apparatus_lookup = {a['unit_designator']: a for a in apparatus_list}
    
    def fmt_time(dt):
        if not dt: return ''
        return format_local_time(dt, include_seconds=True)
    
    def get_personnel_name(pid):
        return personnel_lookup.get(pid, '')
    
    # Calculate in-service duration
    in_service = ''
    if inc.get('time_dispatched') and inc.get('time_last_cleared'):
        try:
            start = inc['time_dispatched']
            end = inc['time_last_cleared']
            diff_seconds = (end - start).total_seconds()
            if diff_seconds > 0:
                hours = int(diff_seconds // 3600)
                mins = int((diff_seconds % 3600) // 60)
                in_service = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"
        except:
            pass
    
    # Get assigned units from personnel_assignments
    personnel_assignments = inc.get('personnel_assignments', {}) or {}
    assigned_units = []
    for a in apparatus_list:
        slots = personnel_assignments.get(a['unit_designator'], [])
        if slots and any(s for s in slots):
            assigned_units.append(a)
    
    # Count total personnel
    total_personnel = 0
    for slots in personnel_assignments.values():
        total_personnel += len([s for s in slots if s])
    
    # Build personnel table rows (Role column + unit columns)
    role_names = ['Driver', 'Officer', 'FF', 'FF', 'FF', 'FF']
    personnel_rows_html = ""
    for idx, role in enumerate(role_names):
        has_data = any(
            personnel_assignments.get(a['unit_designator'], [None] * 6)[idx] if idx < len(personnel_assignments.get(a['unit_designator'], [])) else None
            for a in assigned_units
        )
        if not has_data:
            continue
        
        row = f'<tr><td class="role-cell">{role}</td>'
        for a in assigned_units:
            slots = personnel_assignments.get(a['unit_designator'], [])
            pid = slots[idx] if idx < len(slots) else None
            name = get_personnel_name(pid) if pid else ''
            row += f'<td>{name}</td>'
        row += '</tr>'
        personnel_rows_html += row
    
    # Build times section
    times_html = ""
    if ps.get('showTimes'):
        times_html = f'''
        <div class="times-grid">
            <div class="time-row"><span class="time-label">Dispatched:</span><span class="time-value">{fmt_time(inc.get('time_dispatched'))}</span></div>
            <div class="time-row"><span class="time-label">Enroute:</span><span class="time-value">{fmt_time(inc.get('time_first_enroute'))}</span></div>
            <div class="time-row"><span class="time-label">On Scene:</span><span class="time-value">{fmt_time(inc.get('time_first_on_scene'))}</span></div>
            <div class="time-row"><span class="time-label">Under Ctrl:</span><span class="time-value">{fmt_time(inc.get('time_fire_under_control'))}</span></div>
            <div class="time-row"><span class="time-label">Cleared:</span><span class="time-value">{fmt_time(inc.get('time_last_cleared'))}</span></div>
            <div class="time-row"><span class="time-label">In Service:</span><span class="time-value">{in_service}</span></div>
        </div>'''
    
    # Personnel table
    personnel_html = ""
    if ps.get('showPersonnelGrid') and assigned_units:
        unit_headers = ''.join([f'<th>{a["unit_designator"]}</th>' for a in assigned_units])
        personnel_html = f'''
        <div class="section">
            <span class="label">Personnel:</span>
            <table class="personnel-table">
                <thead><tr><th>Role</th>{unit_headers}</tr></thead>
                <tbody>{personnel_rows_html}</tbody>
            </table>
            <div class="field"><span class="label">Total Personnel:</span> <span class="value">{total_personnel}</span></div>
        </div>'''
    
    # Officer names
    oic_name = get_personnel_name(inc.get('officer_in_charge')) if inc.get('officer_in_charge') else ''
    completed_by_name = get_personnel_name(inc.get('completed_by')) if inc.get('completed_by') else ''
    
    # CAD units list
    cad_units_list = ', '.join([u.get('unit_id', '') for u in (inc.get('cad_units') or [])]) if inc.get('cad_units') else ''
    
    # Equipment list
    equipment_list = ', '.join(inc.get('equipment_used', [])) if inc.get('equipment_used') else ''
    
    html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Incident {inc.get("internal_incident_number", "")}</title>
    <style>
        @page {{ size: letter; margin: 0.35in; }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.3; color: #000; }}
        
        .header {{ text-align: center; border-bottom: 2px solid {primary_color}; padding-bottom: 0.25rem; margin-bottom: 0.5rem; }}
        .header h1 {{ font-size: 14pt; margin: 0; font-weight: bold; }}
        .header h2 {{ font-size: 11pt; margin: 0; font-weight: normal; }}
        
        .top-info {{ display: flex; gap: 1rem; margin-bottom: 0.5rem; }}
        .col-left {{ flex: 1; }}
        .col-right {{ width: 180px; }}
        
        .field {{ display: flex; align-items: baseline; gap: 0.25rem; margin-bottom: 0.15rem; }}
        .field-full {{ flex-direction: column; gap: 0; }}
        .label {{ font-weight: bold; font-size: 9pt; white-space: nowrap; min-width: 80px; }}
        .value {{ font-size: 10pt; }}
        .value-bold {{ font-weight: bold; font-size: 12pt; }}
        
        .badge {{ display: inline-block; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 8pt; font-weight: bold; margin-left: 0.5rem; color: #fff; }}
        .badge-fire {{ background: #e74c3c; }}
        .badge-ems {{ background: #3498db; }}
        
        .times-grid {{ border: 1px solid #000; padding: 0.25rem; }}
        .time-row {{ display: flex; justify-content: space-between; padding: 0.1rem 0; border-bottom: 1px dotted #ccc; }}
        .time-row:last-child {{ border-bottom: none; }}
        .time-label {{ font-size: 9pt; font-weight: bold; }}
        .time-value {{ font-size: 10pt; font-family: 'Courier New', monospace; min-width: 70px; text-align: right; }}
        
        .section {{ margin-bottom: 0.35rem; padding-bottom: 0.25rem; border-bottom: 1px solid #ddd; }}
        
        .narrative {{ white-space: pre-wrap; margin-top: 0.15rem; padding: 0.25rem; background: #f9f9f9; border: 1px solid #ddd; min-height: 0.5in; }}
        
        .personnel-table {{ width: 100%; border-collapse: collapse; font-size: 9pt; }}
        .personnel-table th, .personnel-table td {{ border: 1px solid #000; padding: 0.15rem 0.25rem; text-align: left; }}
        .personnel-table th {{ background: {primary_color}; color: #fff; font-weight: bold; text-align: center; }}
        .role-cell {{ font-weight: bold; width: 50px; background: {secondary_color}; }}
        
        .footer {{ margin-top: 0.5rem; padding-top: 0.25rem; border-top: 1px solid #000; display: flex; justify-content: space-between; font-size: 8pt; color: #666; }}
        
        @media print {{
            body {{ background: #fff; }}
            .section {{ page-break-inside: avoid; }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{station_name} — Station {station_number}</h1>
        <h2>Incident Report</h2>
    </div>
    
    <div class="top-info">
        <div class="col-left">
            <div class="field">
                <span class="label">Incident #:</span>
                <span class="value value-bold">{inc.get('internal_incident_number', '')}</span>
                <span class="badge badge-{(inc.get('call_category') or 'fire').lower()}">{inc.get('call_category', '')}</span>
            </div>
            <div class="field">
                <span class="label">Date:</span>
                <span class="value">{inc.get('incident_date', '') or ''}</span>
            </div>
            <div class="field">
                <span class="label">Municipality:</span>
                <span class="value">{inc.get('municipality_code', '') or ''}</span>
            </div>
            {f'<div class="field"><span class="label">Weather:</span><span class="value">{inc.get("weather_conditions", "")}</span></div>' if ps.get('showWeather') and inc.get('weather_conditions') else ''}
            <div class="field">
                <span class="label">ESZ/Box:</span>
                <span class="value">{inc.get('esz_box', '') or ''}</span>
            </div>
        </div>
        <div class="col-right">
            {times_html}
        </div>
    </div>
    
    {f'''<div class="section">
        <div class="field field-full">
            <span class="label">Location:</span>
            <span class="value">{inc.get('address', '') or ''}</span>
        </div>
        {f'<div class="field field-full"><span class="label">Cross Streets:</span><span class="value">{inc.get("cross_streets", "")}</span></div>' if ps.get('showCrossStreets') and inc.get('cross_streets') else ''}
    </div>''' if ps.get('showLocation') else ''}
    
    {f'''<div class="section">
        <div class="field field-full">
            <span class="label">Units Called:</span>
            <span class="value">{cad_units_list}</span>
        </div>
    </div>''' if ps.get('showCadUnits') and cad_units_list else ''}
    
    {f'''<div class="section">
        <div class="field field-full">
            <span class="label">Dispatched As:</span>
            <span class="value">{inc.get('cad_event_type', '')}{(' / ' + inc.get('cad_event_subtype')) if inc.get('cad_event_subtype') else ''}</span>
        </div>
    </div>''' if ps.get('showDispatchInfo') else ''}
    
    {f'''<div class="section">
        <div class="field field-full">
            <span class="label">Situation Found:</span>
            <span class="value">{inc.get('situation_found', '')}</span>
        </div>
    </div>''' if ps.get('showSituationFound') and inc.get('situation_found') else ''}
    
    {f'''<div class="section">
        <div class="field field-full">
            <span class="label">Extent of Damage:</span>
            <span class="value">{inc.get('extent_of_damage', '')}</span>
        </div>
    </div>''' if ps.get('showExtentOfDamage') and inc.get('extent_of_damage') else ''}
    
    {f'''<div class="section">
        <div class="field field-full">
            <span class="label">Services Provided:</span>
            <span class="value">{inc.get('services_provided', '')}</span>
        </div>
    </div>''' if ps.get('showServicesProvided') and inc.get('services_provided') else ''}
    
    {f'''<div class="section">
        <div class="field field-full">
            <span class="label">Narrative:</span>
            <div class="value narrative">{inc.get('narrative', '')}</div>
        </div>
    </div>''' if ps.get('showNarrative') and inc.get('narrative') else ''}
    
    {f'''<div class="section">
        <div class="field field-full">
            <span class="label">Equipment Used:</span>
            <span class="value">{equipment_list}</span>
        </div>
    </div>''' if ps.get('showEquipmentUsed') and equipment_list else ''}
    
    {personnel_html}
    
    {f'''<div class="section" style="display: flex; gap: 2rem;">
        <div class="field">
            <span class="label">Officer in Charge:</span>
            <span class="value">{oic_name}</span>
        </div>
        <div class="field">
            <span class="label">Report Completed By:</span>
            <span class="value">{completed_by_name}</span>
        </div>
    </div>''' if ps.get('showOfficerInfo') else ''}
    
    {f'''<div class="section">
        <div class="field field-full">
            <span class="label">Problems/Issues:</span>
            <span class="value">{inc.get('problems_issues', '')}</span>
        </div>
    </div>''' if ps.get('showProblemsIssues') and inc.get('problems_issues') else ''}
    
    <div class="footer">
        <span>CAD Event: {inc.get('cad_event_number', '')}</span>
        <span>Status: {inc.get('status', '')}</span>
        <span>Printed: {datetime.now().strftime('%m/%d/%Y, %I:%M:%S %p')}</span>
    </div>
</body>
</html>'''
    
    return HTMLResponse(content=html)


@router.get("/pdf/incident/{incident_id}")
async def get_incident_pdf(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Generate PDF from incident HTML using WeasyPrint.
    Consistent output across all browsers.
    """
    from weasyprint import HTML
    
    # Get HTML content from existing endpoint
    html_response = await get_incident_html_report(incident_id, db)
    html_content = html_response.body.decode('utf-8')
    
    # Get incident number for filename
    incident = db.execute(text("""
        SELECT internal_incident_number, incident_date FROM incidents WHERE id = :id
    """), {"id": incident_id}).fetchone()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    incident_number = incident[0] or f"INC{incident_id}"
    incident_date = incident[1] or datetime.now().date()
    
    # Convert HTML to PDF
    pdf_buffer = io.BytesIO()
    HTML(string=html_content).write_pdf(pdf_buffer)
    pdf_buffer.seek(0)
    
    filename = f"incident_{incident_number}_{incident_date}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


@router.get("/pdf/monthly-weasy")
async def get_monthly_pdf_weasy(
    year: int = Query(...),
    month: int = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Generate PDF from styled HTML using WeasyPrint.
    Looks identical to the HTML preview - prints consistently every time.
    """
    from weasyprint import HTML
    
    # Get the HTML content from existing endpoint
    html_response = await get_monthly_html_report(year, month, category, db)
    html_content = html_response.body.decode('utf-8')
    
    # Convert HTML to PDF
    pdf_buffer = io.BytesIO()
    HTML(string=html_content).write_pdf(pdf_buffer)
    pdf_buffer.seek(0)
    
    # Get month name for filename
    month_name = date(year, month, 1).strftime("%B")
    filename = f"monthly_report_{year}_{month:02d}_{month_name}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


@router.get("/pdf/monthly")
async def generate_monthly_pdf_report(
    year: int = Query(...),
    month: int = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Generate Monthly Chiefs Report PDF with logo and proper template formatting
    
    FIRE reports include: damage/injury stats, mutual aid tracking
    EMS reports: simplified without damage/injury/mutual aid sections
    """
    
    # Get monthly report data
    report = await get_monthly_chiefs_report(year, month, category, db)
    
    # Determine if this is a FIRE report
    is_fire_report = category and category.upper() == 'FIRE'
    
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
        import base64
        
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=letter, 
            topMargin=0.4*inch, 
            bottomMargin=0.4*inch,
            leftMargin=0.5*inch,
            rightMargin=0.5*inch
        )
        
        # Brand color
        brand_green = colors.HexColor('#1e6b35')
        dark_header = colors.HexColor('#2c3e50')
        light_bg = colors.HexColor('#f8f8f8')
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('Title', fontSize=18, fontName='Helvetica-Bold', textColor=colors.black)
        subtitle_style = ParagraphStyle('Subtitle', fontSize=12, fontName='Helvetica-Bold', textColor=brand_green)
        section_style = ParagraphStyle('Section', fontSize=10, fontName='Helvetica-Bold', textColor=brand_green, spaceBefore=10, spaceAfter=4)
        
        elements = []
        
        # Get logo from branding settings
        logo_result = db.execute(
            text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo'")
        ).fetchone()
        
        logo_image = None
        if logo_result and logo_result[0]:
            try:
                logo_bytes = base64.b64decode(logo_result[0])
                logo_buffer = io.BytesIO(logo_bytes)
                logo_image = Image(logo_buffer, width=0.55*inch, height=0.55*inch)
            except:
                pass
        
        # ==========================================================================
        # TENANT SETTINGS - Pull all dynamic values from settings table
        # ==========================================================================
        station_name_result = db.execute(
            text("SELECT value FROM settings WHERE category = 'station' AND key = 'name'")
        ).fetchone()
        station_name = station_name_result[0] if station_name_result else "Fire Department"
        
        station_short_result = db.execute(
            text("SELECT value FROM settings WHERE category = 'station' AND key = 'short_name'")
        ).fetchone()
        station_short_name = station_short_result[0] if station_short_result else "Station"
        
        # Header with logo
        cat_label = f" — {'Fire' if category and category.upper() == 'FIRE' else 'EMS'}" if category else ""
        
        if logo_image:
            header_data = [[
                logo_image,
                [
                    Paragraph(station_name.upper(), title_style),
                    Paragraph(f"Monthly Activity Report — {report['month_name']} {report['year']}{cat_label}", subtitle_style)
                ]
            ]]
            header_table = Table(header_data, colWidths=[0.7*inch, 6.8*inch])
            header_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]))
            elements.append(header_table)
        else:
            elements.append(Paragraph(station_name.upper(), title_style))
            elements.append(Spacer(1, 2))
            elements.append(Paragraph(f"Monthly Activity Report — {report['month_name']} {report['year']}{cat_label}", subtitle_style))
        
        # Green header line
        line_table = Table([['']], colWidths=[7.5*inch])
        line_table.setStyle(TableStyle([
            ('LINEABOVE', (0, 0), (-1, 0), 2, brand_green),
        ]))
        elements.append(Spacer(1, 4))
        elements.append(line_table)
        elements.append(Spacer(1, 8))
        
        # =================================================================
        # CALL SUMMARY - 4-column grid
        # =================================================================
        elements.append(Paragraph("CALL SUMMARY", section_style))
        
        # Helper for currency
        def fmt_currency(cents):
            return f"${(cents or 0) / 100:,.0f}"
        
        cs = report['call_summary']
        rt = report['response_times'] or {}
        
        summary_data = [
            [
                Paragraph("<b>Total Calls</b>", styles['Normal']),
                Paragraph("<b>Personnel</b>", styles['Normal']),
                Paragraph("<b>Hours</b>", styles['Normal']),
                Paragraph("<b>Man Hours</b>", styles['Normal']),
            ],
            [
                Paragraph(f"<font size=16><b>{cs['number_of_calls']}</b></font>", styles['Normal']),
                Paragraph(f"<font size=16><b>{cs['number_of_men']}</b></font>", styles['Normal']),
                Paragraph(f"<font size=16><b>{cs['hours']:.1f}</b></font>", styles['Normal']),
                Paragraph(f"<font size=16><b>{cs['man_hours']:.1f}</b></font>", styles['Normal']),
            ],
            [
                Paragraph(f"<font size=8>vs last year: {'+' if cs['change'] >= 0 else ''}{cs['change']}</font>", styles['Normal']),
                "", "", ""
            ],
        ]
        
        summary_table = Table(summary_data, colWidths=[1.875*inch]*4)
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), light_bg),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.grey),
            ('INNERGRID', (0, 0), (-1, 1), 0.5, colors.grey),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(summary_table)
        
        # =================================================================
        # RESPONSE TIMES - 3-column
        # =================================================================
        elements.append(Paragraph("RESPONSE TIMES", section_style))
        
        rt_data = [
            [
                Paragraph("<b>Avg Turnout</b>", styles['Normal']),
                Paragraph("<b>Avg Response</b>", styles['Normal']),
                Paragraph("<b>Avg On Scene</b>", styles['Normal']),
            ],
            [
                Paragraph(f"<font size=14><b>{rt.get('avg_turnout_minutes', 0) or 0:.1f} min</b></font>", styles['Normal']),
                Paragraph(f"<font size=14><b>{rt.get('avg_response_minutes', 0) or 0:.1f} min</b></font>", styles['Normal']),
                Paragraph(f"<font size=14><b>{rt.get('avg_on_scene_minutes', 0) or 0:.1f} min</b></font>", styles['Normal']),
            ],
        ]
        
        rt_table = Table(rt_data, colWidths=[2.5*inch]*3)
        rt_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), light_bg),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.grey),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(rt_table)
        elements.append(Spacer(1, 8))
        
        # =================================================================
        # TWO-COLUMN LAYOUT: Municipalities | Units
        # =================================================================
        
        # Municipality table
        if is_fire_report:
            muni_headers = ["Municipality", "Calls", "Man Hrs", "Prop Risk", "Damages"]
            muni_widths = [1.1*inch, 0.4*inch, 0.5*inch, 0.6*inch, 0.6*inch]
            muni_data = [muni_headers]
            for m in report['municipalities'][:8]:
                muni_data.append([
                    m['municipality'][:15],
                    str(m['calls']),
                    f"{m['manhours']:.0f}",
                    fmt_currency(m.get('property_at_risk', 0)),
                    fmt_currency(m.get('fire_damages', 0)),
                ])
        else:
            muni_headers = ["Municipality", "Calls", "Man Hours"]
            muni_widths = [1.8*inch, 0.6*inch, 0.8*inch]
            muni_data = [muni_headers]
            for m in report['municipalities'][:10]:
                muni_data.append([
                    m['municipality'][:20],
                    str(m['calls']),
                    f"{m['manhours']:.1f}",
                ])
        
        if len(muni_data) == 1:
            muni_data.append(["No data", "", ""] if not is_fire_report else ["No data", "", "", "", ""])
        
        muni_table = Table(muni_data, colWidths=muni_widths)
        muni_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), dark_header),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        
        # Unit table
        unit_data = [["Unit", "Resp"]]
        for u in report['responses_per_unit'][:10]:
            unit_data.append([
                (u['unit_name'] or u['unit'])[:18],
                str(u['responses'])
            ])
        if len(unit_data) == 1:
            unit_data.append(["No data", ""])
        
        unit_table = Table(unit_data, colWidths=[1.4*inch, 0.5*inch])
        unit_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), dark_header),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        
        # Combine into two-column layout
        two_col = Table([
            [
                [Paragraph("RESPONSE BY MUNICIPALITY", section_style), muni_table],
                [Paragraph("RESPONSES BY UNIT", section_style), unit_table]
            ]
        ], colWidths=[3.9*inch, 3.6*inch])
        two_col.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        elements.append(two_col)
        
        # =================================================================
        # INCIDENT TYPES
        # =================================================================
        elements.append(Paragraph("INCIDENT TYPES", section_style))
        
        type_data = [["Type", "Count"]]
        for t in report['incident_types'][:12]:
            type_data.append([t['type'][:35], str(t['count'])])
        if len(type_data) == 1:
            type_data.append(["No data", ""])
        
        type_table = Table(type_data, colWidths=[3.2*inch, 0.5*inch])
        type_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), dark_header),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        elements.append(type_table)
        
        # =================================================================
        # FIRE ONLY: Mutual Aid + Property/Safety
        # =================================================================
        if is_fire_report:
            # Mutual Aid
            elements.append(Paragraph("MUTUAL AID GIVEN", section_style))
            ma_data = [["Station", "Count"]]
            if report['mutual_aid']:
                for ma in report['mutual_aid'][:6]:
                    ma_data.append([ma['station'], str(ma['count'])])
            else:
                ma_data.append(["None", ""])
            
            ma_table = Table(ma_data, colWidths=[2*inch, 0.5*inch])
            ma_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), dark_header),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ALIGN', (1, 0), (1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))
            elements.append(ma_table)
            
            # Property & Safety summary
            elements.append(Paragraph("PROPERTY & SAFETY", section_style))
            safety_data = [
                ["Property at Risk", "Fire Damages", "FF Injuries", "Civilian Injuries"],
                [
                    fmt_currency(cs.get('property_at_risk', 0)),
                    fmt_currency(cs.get('fire_damages', 0)),
                    str(cs.get('ff_injuries', 0)),
                    str(cs.get('civilian_injuries', 0))
                ]
            ]
            safety_table = Table(safety_data, colWidths=[1.875*inch]*4)
            safety_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), dark_header),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('FONTSIZE', (0, 1), (-1, 1), 12),
                ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))
            elements.append(safety_table)
        
        # Footer
        elements.append(Spacer(1, 0.3*inch))
        footer_style = ParagraphStyle('Footer', fontSize=8, textColor=colors.grey, alignment=TA_CENTER)
        elements.append(Paragraph(f"{station_name} — {station_short_name} | Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", footer_style))
        
        doc.build(elements)
        buffer.seek(0)
        
        month_name = report['month_name']
        filename = f"monthly_report_{year}_{month:02d}_{month_name}.pdf"
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except ImportError:
        raise HTTPException(
            status_code=500, 
            detail="PDF generation requires reportlab. Install with: pip install reportlab"
        )