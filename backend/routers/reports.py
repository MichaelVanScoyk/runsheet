"""
Reports router - Generate incident reports and statistics
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
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
            EXTRACT(MONTH FROM COALESCE(incident_date, created_at::date))::int AS month,
            COUNT(*) AS incident_count,
            (SELECT COUNT(*) FROM incident_personnel ip 
             JOIN incidents i2 ON ip.incident_id = i2.id 
             WHERE EXTRACT(YEAR FROM COALESCE(i2.incident_date, i2.created_at::date)) = :year 
               AND EXTRACT(MONTH FROM COALESCE(i2.incident_date, i2.created_at::date)) = EXTRACT(MONTH FROM COALESCE(i.incident_date, i.created_at::date))
               AND i2.deleted_at IS NULL
            ) AS personnel_responses
        FROM incidents i
        WHERE EXTRACT(YEAR FROM COALESCE(incident_date, created_at::date)) = :year
          AND deleted_at IS NULL
        GROUP BY EXTRACT(MONTH FROM COALESCE(incident_date, created_at::date))
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
    
    call_summary = {
        "number_of_calls": current_count,
        "number_of_men": int(summary_row[1] or 0),
        "hours": round(float(summary_row[2] or 0), 2),
        "man_hours": round(float(summary_row[3] or 0), 2),
        "previous_year_calls": prev_count,
        "change": change,
        "percent_change": pct_change,
    }
    
    # =========================================================================
    # MUNICIPALITY SUMMARY
    # =========================================================================
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
    # TYPE OF INCIDENT
    # =========================================================================
    type_result = db.execute(text(f"""
        SELECT 
            COALESCE(cad_event_type, 'Unknown') AS incident_type,
            COUNT(*) AS count
        FROM incidents i
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
          {cat_filter}
        GROUP BY COALESCE(cad_event_type, 'Unknown')
        ORDER BY count DESC, incident_type
    """), {"start_date": start_date, "end_date": end_date})
    
    incident_types = []
    for row in type_result:
        incident_types.append({
            "type": row[0],
            "count": row[1]
        })
    
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
    # MUTUAL AID GIVEN (Assist To)
    # =========================================================================
    mutual_aid_result = db.execute(text(f"""
        SELECT 
            COALESCE(iu.cad_unit_id, 'Unknown') AS assisted_station,
            COUNT(DISTINCT iu.incident_id) AS count
        FROM incident_units iu
        JOIN incidents i ON iu.incident_id = i.id
        WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
          AND i.deleted_at IS NULL
          AND iu.is_mutual_aid = true
          {cat_filter}
        GROUP BY COALESCE(iu.cad_unit_id, 'Unknown')
        ORDER BY count DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    mutual_aid = []
    for row in mutual_aid_result:
        mutual_aid.append({
            "station": row[0],
            "count": row[1]
        })
    
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
        "responses_per_unit": responses_per_unit,
        "mutual_aid": mutual_aid,
        "response_times": times
    }


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


@router.get("/pdf/monthly")
async def generate_monthly_pdf_report(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db)
):
    """Generate Monthly Chiefs Report PDF matching the UI format"""
    
    # Get monthly report data
    report = await get_monthly_chiefs_report(year, month, db)
    
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT
        
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=16, alignment=TA_CENTER, spaceAfter=4)
        subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=14, alignment=TA_CENTER, textColor=colors.grey, spaceAfter=20)
        section_style = ParagraphStyle('Section', parent=styles['Heading2'], fontSize=12, spaceAfter=8, textColor=colors.HexColor('#333333'))
        
        elements = []
        
        # Title
        elements.append(Paragraph("GLEN MOORE FIRE CO. MONTHLY REPORT", title_style))
        elements.append(Paragraph(f"{report['month_name']} {report['year']}", subtitle_style))
        
        # =================================================================
        # CALL SUMMARY
        # =================================================================
        elements.append(Paragraph("CALL SUMMARY", section_style))
        
        cs = report['call_summary']
        summary_data = [
            ["Number of Calls for Month", str(cs['number_of_calls'])],
            ["Number of Men", str(cs['number_of_men'])],
            ["Hours", f"{cs['hours']:.2f}"],
            ["Man Hours", f"{cs['man_hours']:.2f}"],
            ["vs. Same Month Last Year", f"{'+' if cs['change'] >= 0 else ''}{cs['change']} ({'+' if cs['percent_change'] >= 0 else ''}{cs['percent_change']:.0f}%)"],
        ]
        
        summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f0f0f0')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 0.25*inch))
        
        # =================================================================
        # TWO-COLUMN: MUNICIPALITY SUMMARY | RESPONSES PER UNIT
        # =================================================================
        
        # Municipality data
        muni_data = [["Municipality", "Calls", "Man Hrs"]]
        for m in report['municipalities'][:12]:
            muni_data.append([m['municipality'], str(m['calls']), f"{m['manhours']:.2f}"])
        if not report['municipalities']:
            muni_data.append(["No data", "", ""])
        
        muni_table = Table(muni_data, colWidths=[1.8*inch, 0.6*inch, 0.8*inch])
        muni_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 4),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ]))
        
        # Unit data
        unit_data = [["Unit", "Responses"]]
        for u in report['responses_per_unit'][:12]:
            unit_data.append([u['unit_name'] or u['unit'], str(u['responses'])])
        if not report['responses_per_unit']:
            unit_data.append(["No data", ""])
        
        unit_table = Table(unit_data, colWidths=[2.2*inch, 0.8*inch])
        unit_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 4),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ]))
        
        # Side by side layout
        elements.append(Paragraph("MUNICIPALITY SUMMARY", section_style))
        elements.append(muni_table)
        elements.append(Spacer(1, 0.2*inch))
        
        elements.append(Paragraph("RESPONSES PER UNIT", section_style))
        elements.append(unit_table)
        elements.append(Spacer(1, 0.2*inch))
        
        # =================================================================
        # TWO-COLUMN: TYPE OF INCIDENT | MUTUAL AID
        # =================================================================
        
        # Type data
        type_data = [["Type", "Count"]]
        for t in report['incident_types'][:15]:
            type_data.append([t['type'], str(t['count'])])
        if not report['incident_types']:
            type_data.append(["No data", ""])
        
        type_table = Table(type_data, colWidths=[2.8*inch, 0.6*inch])
        type_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 4),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ]))
        
        # Mutual aid data
        ma_data = [["Station", "Count"]]
        if report['mutual_aid']:
            for ma in report['mutual_aid'][:10]:
                ma_data.append([ma['station'], str(ma['count'])])
        else:
            ma_data.append(["None", ""])
        
        ma_table = Table(ma_data, colWidths=[2*inch, 0.6*inch])
        ma_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 4),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ]))
        
        elements.append(Paragraph("TYPE OF INCIDENT", section_style))
        elements.append(type_table)
        elements.append(Spacer(1, 0.2*inch))
        
        elements.append(Paragraph("MUTUAL AID ASSIST TO", section_style))
        elements.append(ma_table)
        elements.append(Spacer(1, 0.2*inch))
        
        # =================================================================
        # RESPONSE TIMES
        # =================================================================
        rt = report['response_times']
        if rt:
            elements.append(Paragraph("RESPONSE TIMES", section_style))
            rt_data = [
                ["Avg Turnout Time", f"{rt['avg_turnout_minutes']:.1f} min" if rt['avg_turnout_minutes'] else "-"],
                ["Avg Response Time", f"{rt['avg_response_minutes']:.1f} min" if rt['avg_response_minutes'] else "-"],
                ["Avg On Scene Time", f"{rt['avg_on_scene_minutes']:.1f} min" if rt['avg_on_scene_minutes'] else "-"],
            ]
            
            rt_table = Table(rt_data, colWidths=[2*inch, 1.5*inch])
            rt_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f0f0f0')),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 6),
                ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
            ]))
            elements.append(rt_table)
        
        # Footer
        elements.append(Spacer(1, 0.3*inch))
        elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", 
                                  ParagraphStyle('Footer', fontSize=8, textColor=colors.grey, alignment=TA_CENTER)))
        
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