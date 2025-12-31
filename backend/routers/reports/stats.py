"""
Reports Stats Router - Summary statistics and trends
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
from typing import Optional

from database import get_db

router = APIRouter()


def calculate_manhours(db: Session, start_date: date, end_date: date, category: str = None) -> dict:
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


@router.get("/summary")
async def get_summary_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
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
        "incidents_by_status": {"open": basic_stats[1], "closed": basic_stats[2], "submitted": basic_stats[3]},
        "total_personnel_responses": manhours["total_responses"],
        "total_manhours": manhours["total_manhours"],
        "avg_incident_duration_hours": manhours["avg_duration_hours"],
        "response_times": times
    }


@router.get("/trends/daily")
async def get_daily_trends(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT COALESCE(incident_date, created_at::date) AS day, COUNT(*) AS count
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL {cat_filter}
        GROUP BY day ORDER BY day
    """), {"start_date": start_date, "end_date": end_date})
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "category_filter": category.upper() if category else "ALL",
        "data": [{"date": str(row[0]), "count": row[1]} for row in result]
    }


@router.get("/trends/by-type")
async def get_type_breakdown(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT COALESCE(cad_event_type, 'Unknown') AS incident_type, COUNT(*) AS count
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL {cat_filter}
        GROUP BY cad_event_type ORDER BY count DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "category_filter": category.upper() if category else "ALL",
        "data": [{"type": row[0], "count": row[1]} for row in result]
    }


@router.get("/trends/by-municipality")
async def get_municipality_breakdown(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND i.call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT COALESCE(m.display_name, i.municipality_code, 'Unknown') AS municipality, COUNT(*) AS count
        FROM incidents i
        LEFT JOIN municipalities m ON i.municipality_code = m.code
        WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
          AND i.deleted_at IS NULL {cat_filter}
        GROUP BY COALESCE(m.display_name, i.municipality_code, 'Unknown') ORDER BY count DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "category_filter": category.upper() if category else "ALL",
        "data": [{"municipality": row[0], "count": row[1]} for row in result]
    }


@router.get("/trends/by-hour")
async def get_hourly_distribution(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT EXTRACT(HOUR FROM time_dispatched) AS hour, COUNT(*) AS count
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL AND time_dispatched IS NOT NULL {cat_filter}
        GROUP BY EXTRACT(HOUR FROM time_dispatched) ORDER BY hour
    """), {"start_date": start_date, "end_date": end_date})
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "category_filter": category.upper() if category else "ALL",
        "data": [{"hour": int(row[0]), "count": row[1]} for row in result]
    }
