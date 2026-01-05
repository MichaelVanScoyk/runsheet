"""
Analytics Dashboard Charts - Direct endpoints with category filtering
These endpoints support the FIRE/EMS toggle in the Analytics dashboard.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db

router = APIRouter(prefix="/api/analytics/dashboard/charts", tags=["analytics-charts"])


@router.get("/by-day-of-week")
def get_incidents_by_day_of_week(
    request: Request,
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = Query(None, description="Filter by call_category: FIRE or EMS"),
    db: Session = Depends(get_db)
):
    """Get incident counts by day of week"""
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT 
            EXTRACT(dow FROM incident_date) as day_num,
            CASE EXTRACT(dow FROM incident_date)
                WHEN 0 THEN 'Sunday'
                WHEN 1 THEN 'Monday'
                WHEN 2 THEN 'Tuesday'
                WHEN 3 THEN 'Wednesday'
                WHEN 4 THEN 'Thursday'
                WHEN 5 THEN 'Friday'
                WHEN 6 THEN 'Saturday'
            END as day_name,
            COUNT(*) as incident_count
        FROM incidents
        WHERE incident_date >= :start_date
            AND incident_date < :end_date
            AND deleted_at IS NULL
            {cat_filter}
        GROUP BY EXTRACT(dow FROM incident_date)
        ORDER BY EXTRACT(dow FROM incident_date)
    """), {'start_date': start_date, 'end_date': end_date}).fetchall()
    
    return {
        "data": [{"day": r.day_name, "count": r.incident_count} for r in result],
        "chart_config": {"type": "bar", "xKey": "day", "yKey": "count"}
    }


@router.get("/by-hour")
def get_incidents_by_hour(
    request: Request,
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = Query(None, description="Filter by call_category: FIRE or EMS"),
    db: Session = Depends(get_db)
):
    """Get incident counts by hour of day"""
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT 
            EXTRACT(hour FROM time_dispatched) as hour,
            COUNT(*) as incident_count
        FROM incidents
        WHERE incident_date >= :start_date
            AND incident_date < :end_date
            AND deleted_at IS NULL
            AND time_dispatched IS NOT NULL
            {cat_filter}
        GROUP BY EXTRACT(hour FROM time_dispatched)
        ORDER BY EXTRACT(hour FROM time_dispatched)
    """), {'start_date': start_date, 'end_date': end_date}).fetchall()
    
    # Fill in missing hours with 0
    hour_counts = {int(r.hour): r.incident_count for r in result}
    data = []
    for h in range(24):
        hour_label = f"{h:02d}:00"
        data.append({"hour": hour_label, "count": hour_counts.get(h, 0)})
    
    return {
        "data": data,
        "chart_config": {"type": "bar", "xKey": "hour", "yKey": "count"}
    }


@router.get("/by-type")
def get_incidents_by_type(
    request: Request,
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = Query(None, description="Filter by call_category: FIRE or EMS"),
    limit: int = Query(10, description="Max types to return"),
    db: Session = Depends(get_db)
):
    """Get incident counts by CAD event type"""
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT 
            COALESCE(cad_event_type, 'Unknown') as type,
            COUNT(*) as incident_count
        FROM incidents
        WHERE incident_date >= :start_date
            AND incident_date < :end_date
            AND deleted_at IS NULL
            {cat_filter}
        GROUP BY cad_event_type
        ORDER BY COUNT(*) DESC
        LIMIT :limit
    """), {'start_date': start_date, 'end_date': end_date, 'limit': limit}).fetchall()
    
    return {
        "data": [{"type": r.type, "count": r.incident_count} for r in result],
        "chart_config": {"type": "bar", "xKey": "type", "yKey": "count", "horizontal": True}
    }


@router.get("/response-times-by-hour")
def get_response_times_by_hour(
    request: Request,
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = Query(None, description="Filter by call_category: FIRE or EMS"),
    db: Session = Depends(get_db)
):
    """Get average response times by hour of day"""
    cat_filter = ""
    if category and category.upper() in ('FIRE', 'EMS'):
        cat_filter = f"AND i.call_category = '{category.upper()}'"
    
    result = db.execute(text(f"""
        SELECT 
            EXTRACT(hour FROM i.time_dispatched) as hour,
            ROUND(AVG(EXTRACT(EPOCH FROM (iu.time_on_scene - iu.time_dispatch))/60)::numeric, 1) as avg_response_mins,
            COUNT(*) as response_count
        FROM incidents i
        JOIN incident_units iu ON i.id = iu.incident_id
        JOIN apparatus a ON iu.apparatus_id = a.id
        WHERE i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.time_dispatched IS NOT NULL
            AND iu.time_on_scene IS NOT NULL
            AND iu.time_dispatch IS NOT NULL
            AND a.counts_for_response_times = TRUE
            {cat_filter}
        GROUP BY EXTRACT(hour FROM i.time_dispatched)
        ORDER BY EXTRACT(hour FROM i.time_dispatched)
    """), {'start_date': start_date, 'end_date': end_date}).fetchall()
    
    # Fill in missing hours
    hour_data = {int(r.hour): {'avg': float(r.avg_response_mins), 'count': r.response_count} for r in result}
    data = []
    for h in range(24):
        hour_label = f"{h:02d}:00"
        entry = hour_data.get(h, {'avg': None, 'count': 0})
        data.append({
            "hour": hour_label, 
            "avg_minutes": entry['avg'],
            "responses": entry['count']
        })
    
    return {
        "data": data,
        "chart_config": {"type": "line", "xKey": "hour", "yKey": "avg_minutes"}
    }
