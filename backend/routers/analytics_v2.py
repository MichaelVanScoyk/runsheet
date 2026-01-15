"""
Analytics V2 - Response Time Deep Dive & Staffing Patterns
Replaces the original analytics dashboard with focused metrics.

IMPORTANT: Most metrics filter to incidents where Station 48 units actually
responded (went enroute), not just all dispatched incidents.
"""

from datetime import date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db

router = APIRouter(prefix="/api/analytics/v2", tags=["analytics-v2"])


# =============================================================================
# HELPER: Station 48 responded filter
# =============================================================================

STATION_48_RESPONDED_FILTER = """
    EXISTS (
        SELECT 1 FROM jsonb_array_elements(i.cad_units) AS unit_elem
        WHERE unit_elem->>'time_enroute' IS NOT NULL
          AND (unit_elem->>'is_mutual_aid')::boolean IS NOT TRUE
    )
"""


def get_incident_counts(db: Session, start_date: date, end_date: date, prefix: str):
    """Get both total dispatched and Station 48 responded counts."""
    result = db.execute(text("""
        SELECT 
            COUNT(*) as total_dispatched,
            SUM(CASE WHEN EXISTS (
                SELECT 1 FROM jsonb_array_elements(cad_units) AS unit_elem
                WHERE unit_elem->>'time_enroute' IS NOT NULL
                  AND (unit_elem->>'is_mutual_aid')::boolean IS NOT TRUE
            ) THEN 1 ELSE 0 END) as station_responded
        FROM incidents
        WHERE incident_date >= :start_date
            AND incident_date < :end_date
            AND deleted_at IS NULL
            AND internal_incident_number LIKE :prefix || '%'
    """), {
        'start_date': start_date,
        'end_date': end_date,
        'prefix': prefix
    }).fetchone()
    return {
        "total_dispatched": result.total_dispatched or 0,
        "station_responded": result.station_responded or 0
    }


# =============================================================================
# SECTION 1: Response Time Breakdown by Call Type
# =============================================================================

@router.get("/response-times/by-type")
def get_response_times_by_call_type(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: str = Query(..., description="FIRE or EMS"),
    db: Session = Depends(get_db)
):
    """
    Response time breakdown by call type.
    For FIRE: uses cad_event_type (ALARM, FIRE, ACCIDENT, etc.)
    For EMS: uses cad_event_subtype (RESPIRATORY DIFFICULTY, SEIZURES, etc.)
    
    Only includes incidents where at least one Station 48 unit (non-mutual-aid)
    actually went enroute.
    """
    prefix = 'F' if category.upper() == 'FIRE' else 'E'
    
    # Get incident counts for context
    counts = get_incident_counts(db, start_date, end_date, prefix)
    
    # For EMS, use subtype since type is always "MEDICAL"
    type_field = "cad_event_type" if category.upper() == 'FIRE' else "cad_event_subtype"
    
    result = db.execute(text(f"""
        SELECT 
            COALESCE(i.{type_field}, 'Unknown') as call_type,
            COUNT(DISTINCT i.id) as incident_count,
            ROUND(AVG(
                EXTRACT(EPOCH FROM (i.time_first_enroute - i.time_dispatched)) / 60
            )::numeric, 1) as avg_turnout_mins,
            ROUND(AVG(
                EXTRACT(EPOCH FROM (i.time_first_on_scene - i.time_first_enroute)) / 60
            )::numeric, 1) as avg_travel_mins,
            ROUND(AVG(
                EXTRACT(EPOCH FROM (i.time_first_on_scene - i.time_dispatched)) / 60
            )::numeric, 1) as avg_response_mins,
            ROUND(AVG(
                EXTRACT(EPOCH FROM (i.time_last_cleared - i.time_first_on_scene)) / 60
            )::numeric, 1) as avg_on_scene_mins
        FROM incidents i
        WHERE i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.internal_incident_number LIKE :prefix || '%'
            AND i.time_dispatched IS NOT NULL
            AND {STATION_48_RESPONDED_FILTER}
        GROUP BY i.{type_field}
        ORDER BY COUNT(*) DESC
    """), {
        'start_date': start_date,
        'end_date': end_date,
        'prefix': prefix
    }).fetchall()
    
    return {
        "category": category.upper(),
        "type_field": "subtype" if category.upper() == 'EMS' else "type",
        "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "incident_counts": counts,
        "data": [
            {
                "call_type": r.call_type,
                "incident_count": r.incident_count,
                "avg_turnout_mins": float(r.avg_turnout_mins) if r.avg_turnout_mins else None,
                "avg_travel_mins": float(r.avg_travel_mins) if r.avg_travel_mins else None,
                "avg_response_mins": float(r.avg_response_mins) if r.avg_response_mins else None,
                "avg_on_scene_mins": float(r.avg_on_scene_mins) if r.avg_on_scene_mins else None,
            }
            for r in result
        ]
    }


@router.get("/response-times/trends")
def get_response_time_trends(
    category: str = Query(..., description="FIRE or EMS"),
    db: Session = Depends(get_db)
):
    """
    Response time trends for 30/60/90 days.
    Only includes incidents where Station 48 responded.
    """
    prefix = 'F' if category.upper() == 'FIRE' else 'E'
    today = date.today()
    
    periods = [
        {"label": "30 days", "days": 30},
        {"label": "60 days", "days": 60},
        {"label": "90 days", "days": 90},
    ]
    
    results = []
    for period in periods:
        start = today - timedelta(days=period["days"])
        
        # Get counts
        counts = get_incident_counts(db, start, today, prefix)
        
        row = db.execute(text(f"""
            SELECT 
                COUNT(DISTINCT i.id) as incident_count,
                ROUND(AVG(
                    EXTRACT(EPOCH FROM (i.time_first_enroute - i.time_dispatched)) / 60
                )::numeric, 1) as avg_turnout_mins,
                ROUND(AVG(
                    EXTRACT(EPOCH FROM (i.time_first_on_scene - i.time_dispatched)) / 60
                )::numeric, 1) as avg_response_mins,
                ROUND(AVG(
                    EXTRACT(EPOCH FROM (i.time_last_cleared - i.time_first_on_scene)) / 60
                )::numeric, 1) as avg_on_scene_mins
            FROM incidents i
            WHERE i.incident_date >= :start_date
                AND i.incident_date < :end_date
                AND i.deleted_at IS NULL
                AND i.internal_incident_number LIKE :prefix || '%'
                AND i.time_dispatched IS NOT NULL
                AND {STATION_48_RESPONDED_FILTER}
        """), {
            'start_date': start,
            'end_date': today,
            'prefix': prefix
        }).fetchone()
        
        results.append({
            "period": period["label"],
            "days": period["days"],
            "total_dispatched": counts["total_dispatched"],
            "station_responded": counts["station_responded"],
            "avg_turnout_mins": float(row.avg_turnout_mins) if row.avg_turnout_mins else None,
            "avg_response_mins": float(row.avg_response_mins) if row.avg_response_mins else None,
            "avg_on_scene_mins": float(row.avg_on_scene_mins) if row.avg_on_scene_mins else None,
        })
    
    # Calculate trends (compare 30 to 90)
    trends = {}
    if results[0]["avg_turnout_mins"] and results[2]["avg_turnout_mins"]:
        trends["turnout"] = round(results[0]["avg_turnout_mins"] - results[2]["avg_turnout_mins"], 1)
    if results[0]["avg_response_mins"] and results[2]["avg_response_mins"]:
        trends["response"] = round(results[0]["avg_response_mins"] - results[2]["avg_response_mins"], 1)
    if results[0]["avg_on_scene_mins"] and results[2]["avg_on_scene_mins"]:
        trends["on_scene"] = round(results[0]["avg_on_scene_mins"] - results[2]["avg_on_scene_mins"], 1)
    
    return {
        "category": category.upper(),
        "periods": results,
        "trends": trends,
        "trend_description": "Negative = improving (faster), Positive = slower"
    }


# =============================================================================
# SECTION 2: Turnout Time vs Crew Size
# =============================================================================

@router.get("/turnout-vs-crew")
def get_turnout_vs_crew_size(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = Query(None, description="FIRE, EMS, or None for all"),
    db: Session = Depends(get_db)
):
    """
    First-out unit turnout time vs crew size on that unit.
    Shows: when we leave faster, do we have fewer people on the first unit?
    
    Uses cad_units JSONB to find the first unit enroute, then counts
    personnel assigned to that specific unit.
    """
    prefix_filter = ""
    prefix = None
    if category and category.upper() in ('FIRE', 'EMS'):
        prefix = 'F' if category.upper() == 'FIRE' else 'E'
        prefix_filter = f"AND i.internal_incident_number LIKE '{prefix}%'"
    
    # Get incident counts for context
    if prefix:
        counts = get_incident_counts(db, start_date, end_date, prefix)
    else:
        fire_counts = get_incident_counts(db, start_date, end_date, 'F')
        ems_counts = get_incident_counts(db, start_date, end_date, 'E')
        counts = {
            "total_dispatched": fire_counts["total_dispatched"] + ems_counts["total_dispatched"],
            "station_responded": fire_counts["station_responded"] + ems_counts["station_responded"]
        }
    
    # Get first-out unit turnout time and crew count
    result = db.execute(text(f"""
        WITH first_unit AS (
            SELECT 
                i.id as incident_id,
                i.time_dispatched,
                (SELECT unit_elem->>'unit_id' 
                 FROM jsonb_array_elements(i.cad_units) AS unit_elem 
                 WHERE unit_elem->>'time_enroute' IS NOT NULL 
                   AND (unit_elem->>'is_mutual_aid')::boolean IS NOT TRUE
                 ORDER BY unit_elem->>'time_enroute' 
                 LIMIT 1
                ) as first_unit_id,
                (SELECT unit_elem->>'time_enroute' 
                 FROM jsonb_array_elements(i.cad_units) AS unit_elem 
                 WHERE unit_elem->>'time_enroute' IS NOT NULL 
                   AND (unit_elem->>'is_mutual_aid')::boolean IS NOT TRUE
                 ORDER BY unit_elem->>'time_enroute' 
                 LIMIT 1
                ) as first_enroute_time
            FROM incidents i
            WHERE i.incident_date >= :start_date
                AND i.incident_date < :end_date
                AND i.deleted_at IS NULL
                AND i.time_dispatched IS NOT NULL
                AND i.cad_units IS NOT NULL
                AND jsonb_array_length(i.cad_units) > 0
                {prefix_filter}
        ),
        unit_with_crew AS (
            SELECT 
                fu.incident_id,
                fu.time_dispatched,
                fu.first_unit_id,
                fu.first_enroute_time::timestamp as first_enroute,
                EXTRACT(EPOCH FROM (fu.first_enroute_time::timestamp - fu.time_dispatched)) / 60 as turnout_mins,
                CASE 
                    WHEN EXTRACT(hour FROM fu.time_dispatched) >= 6 AND EXTRACT(hour FROM fu.time_dispatched) < 16 THEN 'daytime'
                    WHEN EXTRACT(hour FROM fu.time_dispatched) >= 16 THEN 'evening'
                    ELSE 'overnight'
                END as time_period,
                (SELECT COUNT(*) 
                 FROM incident_personnel ip
                 JOIN incident_units iu ON ip.incident_unit_id = iu.id
                 JOIN apparatus a ON iu.apparatus_id = a.id
                 WHERE ip.incident_id = fu.incident_id
                   AND a.unit_designator = fu.first_unit_id
                ) as crew_count
            FROM first_unit fu
            WHERE fu.first_unit_id IS NOT NULL
              AND fu.first_enroute_time IS NOT NULL
        ),
        bucketed AS (
            SELECT 
                incident_id,
                time_period,
                crew_count,
                turnout_mins,
                CASE 
                    WHEN turnout_mins < 1 THEN 1
                    WHEN turnout_mins < 2 THEN 2
                    WHEN turnout_mins < 3 THEN 3
                    WHEN turnout_mins < 4 THEN 4
                    WHEN turnout_mins < 5 THEN 5
                    WHEN turnout_mins < 6 THEN 6
                    WHEN turnout_mins < 7 THEN 7
                    WHEN turnout_mins < 8 THEN 8
                    ELSE 9
                END as turnout_bucket
            FROM unit_with_crew
            WHERE turnout_mins > 0 AND turnout_mins < 30
              AND crew_count > 0
        )
        SELECT 
            turnout_bucket,
            time_period,
            COUNT(*) as incident_count,
            ROUND(AVG(crew_count)::numeric, 1) as avg_crew
        FROM bucketed
        GROUP BY turnout_bucket, time_period
        ORDER BY turnout_bucket, time_period
    """), {
        'start_date': start_date,
        'end_date': end_date
    }).fetchall()
    
    buckets = {
        1: "< 1 min", 2: "1-2 min", 3: "2-3 min", 4: "3-4 min", 
        5: "4-5 min", 6: "5-6 min", 7: "6-7 min", 8: "7-8 min", 9: "8+ min"
    }
    periods = ['daytime', 'evening', 'overnight']
    
    data = []
    for bucket_num, bucket_label in buckets.items():
        row = {"turnout_bucket": bucket_label}
        for period in periods:
            match = next((r for r in result if r.turnout_bucket == bucket_num and r.time_period == period), None)
            row[f"{period}_avg_crew"] = float(match.avg_crew) if match else None
            row[f"{period}_count"] = match.incident_count if match else 0
        data.append(row)
    
    period_summary = {}
    for period in periods:
        period_rows = [r for r in result if r.time_period == period]
        if period_rows:
            total_count = sum(r.incident_count for r in period_rows)
            weighted_crew = sum(float(r.avg_crew) * r.incident_count for r in period_rows)
            period_summary[period] = {
                "avg_crew": round(weighted_crew / total_count, 1) if total_count else None,
                "total_responses": total_count
            }
    
    return {
        "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "category": category.upper() if category else "ALL",
        "incident_counts": counts,
        "time_periods": {
            "daytime": "6am - 4pm",
            "evening": "4pm - 12am",
            "overnight": "12am - 6am"
        },
        "data": data,
        "period_summary": period_summary
    }


# =============================================================================
# SECTION 3: Patterns & Predictions
# =============================================================================

@router.get("/patterns/monthly-volume")
def get_monthly_volume_pattern(
    years_back: int = Query(3, description="How many years of history"),
    db: Session = Depends(get_db)
):
    """
    Monthly incident volume patterns - helps predict "is next month busier?"
    Shows Fire vs EMS split. This shows ALL dispatched incidents (not filtered).
    """
    result = db.execute(text("""
        SELECT 
            EXTRACT(month FROM incident_date) as month_num,
            TO_CHAR(incident_date, 'Mon') as month_name,
            SUM(CASE WHEN internal_incident_number LIKE 'F%' THEN 1 ELSE 0 END) as fire_count,
            SUM(CASE WHEN internal_incident_number LIKE 'E%' THEN 1 ELSE 0 END) as ems_count,
            COUNT(*) as total_count
        FROM incidents
        WHERE incident_date >= CURRENT_DATE - INTERVAL ':years years'
            AND deleted_at IS NULL
            AND (internal_incident_number LIKE 'F%' OR internal_incident_number LIKE 'E%')
        GROUP BY EXTRACT(month FROM incident_date), TO_CHAR(incident_date, 'Mon')
        ORDER BY EXTRACT(month FROM incident_date)
    """.replace(':years', str(years_back))), {}).fetchall()
    
    data = []
    for r in result:
        years_of_data = years_back
        data.append({
            "month": r.month_name,
            "month_num": int(r.month_num),
            "fire_total": r.fire_count,
            "ems_total": r.ems_count,
            "total": r.total_count,
            "fire_avg_per_month": round(r.fire_count / years_of_data, 1),
            "ems_avg_per_month": round(r.ems_count / years_of_data, 1),
        })
    
    if data:
        busiest_fire = max(data, key=lambda x: x["fire_total"])
        busiest_ems = max(data, key=lambda x: x["ems_total"])
    else:
        busiest_fire = busiest_ems = None
    
    return {
        "years_analyzed": years_back,
        "data": data,
        "insights": {
            "busiest_fire_month": busiest_fire["month"] if busiest_fire else None,
            "busiest_ems_month": busiest_ems["month"] if busiest_ems else None,
        },
        "note": "Shows all dispatched incidents (not filtered to Station 48 responses)"
    }


@router.get("/patterns/best-performance")
def get_best_performance_times(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    When do we perform best? Fastest turnout by day of week and hour.
    Only includes incidents where Station 48 responded.
    """
    prefix_filter = ""
    prefix = None
    if category and category.upper() in ('FIRE', 'EMS'):
        prefix = 'F' if category.upper() == 'FIRE' else 'E'
        prefix_filter = f"AND i.internal_incident_number LIKE '{prefix}%'"
    
    # Get counts
    if prefix:
        counts = get_incident_counts(db, start_date, end_date, prefix)
    else:
        fire_counts = get_incident_counts(db, start_date, end_date, 'F')
        ems_counts = get_incident_counts(db, start_date, end_date, 'E')
        counts = {
            "total_dispatched": fire_counts["total_dispatched"] + ems_counts["total_dispatched"],
            "station_responded": fire_counts["station_responded"] + ems_counts["station_responded"]
        }
    
    # By day of week
    by_day = db.execute(text(f"""
        SELECT 
            EXTRACT(dow FROM i.incident_date) as day_num,
            CASE EXTRACT(dow FROM i.incident_date)
                WHEN 0 THEN 'Sun'
                WHEN 1 THEN 'Mon'
                WHEN 2 THEN 'Tue'
                WHEN 3 THEN 'Wed'
                WHEN 4 THEN 'Thu'
                WHEN 5 THEN 'Fri'
                WHEN 6 THEN 'Sat'
            END as day_name,
            COUNT(*) as incident_count,
            ROUND(AVG(
                EXTRACT(EPOCH FROM (i.time_first_enroute - i.time_dispatched)) / 60
            )::numeric, 1) as avg_turnout_mins,
            ROUND(AVG(
                EXTRACT(EPOCH FROM (i.time_first_on_scene - i.time_dispatched)) / 60
            )::numeric, 1) as avg_response_mins
        FROM incidents i
        WHERE i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.time_dispatched IS NOT NULL
            AND i.time_first_enroute IS NOT NULL
            AND {STATION_48_RESPONDED_FILTER}
            {prefix_filter}
        GROUP BY EXTRACT(dow FROM i.incident_date)
        ORDER BY EXTRACT(dow FROM i.incident_date)
    """), {'start_date': start_date, 'end_date': end_date}).fetchall()
    
    # By hour
    by_hour = db.execute(text(f"""
        SELECT 
            EXTRACT(hour FROM i.time_dispatched) as hour,
            COUNT(*) as incident_count,
            ROUND(AVG(
                EXTRACT(EPOCH FROM (i.time_first_enroute - i.time_dispatched)) / 60
            )::numeric, 1) as avg_turnout_mins,
            ROUND(AVG(
                EXTRACT(EPOCH FROM (i.time_first_on_scene - i.time_dispatched)) / 60
            )::numeric, 1) as avg_response_mins
        FROM incidents i
        WHERE i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.time_dispatched IS NOT NULL
            AND i.time_first_enroute IS NOT NULL
            AND {STATION_48_RESPONDED_FILTER}
            {prefix_filter}
        GROUP BY EXTRACT(hour FROM i.time_dispatched)
        ORDER BY EXTRACT(hour FROM i.time_dispatched)
    """), {'start_date': start_date, 'end_date': end_date}).fetchall()
    
    day_data = [
        {
            "day": r.day_name,
            "day_num": int(r.day_num),
            "incident_count": r.incident_count,
            "avg_turnout_mins": float(r.avg_turnout_mins) if r.avg_turnout_mins else None,
            "avg_response_mins": float(r.avg_response_mins) if r.avg_response_mins else None,
        }
        for r in by_day
    ]
    
    hour_data = [
        {
            "hour": int(r.hour),
            "hour_label": f"{int(r.hour):02d}:00",
            "incident_count": r.incident_count,
            "avg_turnout_mins": float(r.avg_turnout_mins) if r.avg_turnout_mins else None,
            "avg_response_mins": float(r.avg_response_mins) if r.avg_response_mins else None,
        }
        for r in by_hour
    ]
    
    valid_days = [d for d in day_data if d["avg_turnout_mins"]]
    valid_hours = [h for h in hour_data if h["avg_turnout_mins"]]
    
    best_day = min(valid_days, key=lambda x: x["avg_turnout_mins"]) if valid_days else None
    best_hour = min(valid_hours, key=lambda x: x["avg_turnout_mins"]) if valid_hours else None
    
    return {
        "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "category": category.upper() if category else "ALL",
        "incident_counts": counts,
        "by_day": day_data,
        "by_hour": hour_data,
        "insights": {
            "fastest_turnout_day": best_day["day"] if best_day else None,
            "fastest_turnout_day_mins": best_day["avg_turnout_mins"] if best_day else None,
            "fastest_turnout_hour": best_hour["hour_label"] if best_hour else None,
            "fastest_turnout_hour_mins": best_hour["avg_turnout_mins"] if best_hour else None,
        }
    }


@router.get("/patterns/staffing")
def get_staffing_patterns(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """
    Best staffed calls by day of week and hour.
    Only includes incidents where Station 48 responded.
    """
    # Get counts
    fire_counts = get_incident_counts(db, start_date, end_date, 'F')
    ems_counts = get_incident_counts(db, start_date, end_date, 'E')
    counts = {
        "total_dispatched": fire_counts["total_dispatched"] + ems_counts["total_dispatched"],
        "station_responded": fire_counts["station_responded"] + ems_counts["station_responded"]
    }
    
    # By day of week
    by_day = db.execute(text(f"""
        SELECT 
            EXTRACT(dow FROM i.incident_date) as day_num,
            CASE EXTRACT(dow FROM i.incident_date)
                WHEN 0 THEN 'Sun'
                WHEN 1 THEN 'Mon'
                WHEN 2 THEN 'Tue'
                WHEN 3 THEN 'Wed'
                WHEN 4 THEN 'Thu'
                WHEN 5 THEN 'Fri'
                WHEN 6 THEN 'Sat'
            END as day_name,
            COUNT(DISTINCT i.id) as incident_count,
            ROUND(AVG(personnel_count)::numeric, 1) as avg_personnel
        FROM incidents i
        JOIN (
            SELECT incident_id, COUNT(DISTINCT personnel_id) as personnel_count
            FROM incident_personnel
            GROUP BY incident_id
        ) ip ON i.id = ip.incident_id
        WHERE i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND {STATION_48_RESPONDED_FILTER}
        GROUP BY EXTRACT(dow FROM i.incident_date)
        ORDER BY EXTRACT(dow FROM i.incident_date)
    """), {'start_date': start_date, 'end_date': end_date}).fetchall()
    
    # By hour
    by_hour = db.execute(text(f"""
        SELECT 
            EXTRACT(hour FROM i.time_dispatched) as hour,
            COUNT(DISTINCT i.id) as incident_count,
            ROUND(AVG(personnel_count)::numeric, 1) as avg_personnel
        FROM incidents i
        JOIN (
            SELECT incident_id, COUNT(DISTINCT personnel_id) as personnel_count
            FROM incident_personnel
            GROUP BY incident_id
        ) ip ON i.id = ip.incident_id
        WHERE i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.time_dispatched IS NOT NULL
            AND {STATION_48_RESPONDED_FILTER}
        GROUP BY EXTRACT(hour FROM i.time_dispatched)
        ORDER BY EXTRACT(hour FROM i.time_dispatched)
    """), {'start_date': start_date, 'end_date': end_date}).fetchall()
    
    day_data = [
        {
            "day": r.day_name,
            "day_num": int(r.day_num),
            "incident_count": r.incident_count,
            "avg_personnel": float(r.avg_personnel) if r.avg_personnel else 0,
        }
        for r in by_day
    ]
    
    hour_data = [
        {
            "hour": int(r.hour),
            "hour_label": f"{int(r.hour):02d}:00",
            "incident_count": r.incident_count,
            "avg_personnel": float(r.avg_personnel) if r.avg_personnel else 0,
        }
        for r in by_hour
    ]
    
    best_day = max(day_data, key=lambda x: x["avg_personnel"]) if day_data else None
    best_hour = max(hour_data, key=lambda x: x["avg_personnel"]) if hour_data else None
    
    return {
        "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "incident_counts": counts,
        "by_day": day_data,
        "by_hour": hour_data,
        "insights": {
            "best_staffed_day": best_day["day"] if best_day else None,
            "best_staffed_day_avg": best_day["avg_personnel"] if best_day else None,
            "best_staffed_hour": best_hour["hour_label"] if best_hour else None,
            "best_staffed_hour_avg": best_hour["avg_personnel"] if best_hour else None,
        }
    }


# =============================================================================
# SECTION 4: Year-over-Year Comparison
# =============================================================================

@router.get("/yoy/this-week-last-year")
def get_this_week_last_year(
    db: Session = Depends(get_db)
):
    """
    Compare this week to the same week last year.
    Only includes incidents where Station 48 responded.
    """
    today = date.today()
    
    days_since_monday = today.weekday()
    this_week_start = today - timedelta(days=days_since_monday)
    this_week_end = this_week_start + timedelta(days=7)
    
    last_year_start = this_week_start - timedelta(days=365)
    last_year_end = this_week_end - timedelta(days=365)
    
    def get_week_stats(start: date, end: date):
        # Get counts
        fire_counts = get_incident_counts(db, start, end, 'F')
        ems_counts = get_incident_counts(db, start, end, 'E')
        
        result = db.execute(text(f"""
            SELECT 
                COUNT(*) as total_incidents,
                SUM(CASE WHEN internal_incident_number LIKE 'F%' THEN 1 ELSE 0 END) as fire_count,
                SUM(CASE WHEN internal_incident_number LIKE 'E%' THEN 1 ELSE 0 END) as ems_count,
                ROUND(AVG(
                    EXTRACT(EPOCH FROM (time_first_enroute - time_dispatched)) / 60
                )::numeric, 1) as avg_turnout_mins,
                ROUND(AVG(
                    EXTRACT(EPOCH FROM (time_first_on_scene - time_dispatched)) / 60
                )::numeric, 1) as avg_response_mins
            FROM incidents i
            WHERE i.incident_date >= :start_date
                AND i.incident_date < :end_date
                AND i.deleted_at IS NULL
                AND (i.internal_incident_number LIKE 'F%' OR i.internal_incident_number LIKE 'E%')
                AND {STATION_48_RESPONDED_FILTER}
        """), {'start_date': start, 'end_date': end}).fetchone()
        
        types = db.execute(text(f"""
            SELECT 
                COALESCE(cad_event_type, 'Unknown') as call_type,
                COUNT(*) as count
            FROM incidents i
            WHERE i.incident_date >= :start_date
                AND i.incident_date < :end_date
                AND i.deleted_at IS NULL
                AND {STATION_48_RESPONDED_FILTER}
            GROUP BY cad_event_type
            ORDER BY COUNT(*) DESC
        """), {'start_date': start, 'end_date': end}).fetchall()
        
        return {
            "total_dispatched": fire_counts["total_dispatched"] + ems_counts["total_dispatched"],
            "station_responded": result.total_incidents or 0,
            "fire_count": result.fire_count or 0,
            "ems_count": result.ems_count or 0,
            "avg_turnout_mins": float(result.avg_turnout_mins) if result.avg_turnout_mins else None,
            "avg_response_mins": float(result.avg_response_mins) if result.avg_response_mins else None,
            "top_call_types": [{"type": t.call_type, "count": t.count} for t in types]
        }
    
    this_week = get_week_stats(this_week_start, this_week_end)
    last_year = get_week_stats(last_year_start, last_year_end)
    
    changes = {}
    if this_week["station_responded"] and last_year["station_responded"]:
        changes["incidents_pct"] = round(
            ((this_week["station_responded"] - last_year["station_responded"]) / last_year["station_responded"]) * 100, 1
        )
    if this_week["avg_turnout_mins"] and last_year["avg_turnout_mins"]:
        changes["turnout_diff"] = round(this_week["avg_turnout_mins"] - last_year["avg_turnout_mins"], 1)
    if this_week["avg_response_mins"] and last_year["avg_response_mins"]:
        changes["response_diff"] = round(this_week["avg_response_mins"] - last_year["avg_response_mins"], 1)
    
    return {
        "this_week": {
            "period": {"start": this_week_start.isoformat(), "end": this_week_end.isoformat()},
            "stats": this_week
        },
        "last_year": {
            "period": {"start": last_year_start.isoformat(), "end": last_year_end.isoformat()},
            "stats": last_year
        },
        "changes": changes,
        "change_descriptions": {
            "incidents_pct": "Positive = more incidents this year",
            "turnout_diff": "Negative = faster this year",
            "response_diff": "Negative = faster this year"
        }
    }


# =============================================================================
# SECTION 5: Summary Dashboard Stats
# =============================================================================

@router.get("/summary")
def get_analytics_summary(
    days: int = Query(30, description="Number of days to analyze"),
    db: Session = Depends(get_db)
):
    """
    Quick summary stats for the analytics dashboard header.
    Shows both dispatched and responded counts.
    """
    today = date.today()
    start_date = today - timedelta(days=days)
    
    # Get counts
    fire_counts = get_incident_counts(db, start_date, today, 'F')
    ems_counts = get_incident_counts(db, start_date, today, 'E')
    
    result = db.execute(text(f"""
        SELECT 
            COUNT(*) as total_incidents,
            SUM(CASE WHEN internal_incident_number LIKE 'F%' THEN 1 ELSE 0 END) as fire_count,
            SUM(CASE WHEN internal_incident_number LIKE 'E%' THEN 1 ELSE 0 END) as ems_count,
            ROUND(AVG(
                EXTRACT(EPOCH FROM (time_first_enroute - time_dispatched)) / 60
            )::numeric, 1) as avg_turnout_mins,
            ROUND(AVG(
                EXTRACT(EPOCH FROM (time_first_on_scene - time_dispatched)) / 60
            )::numeric, 1) as avg_response_mins,
            ROUND(AVG(
                EXTRACT(EPOCH FROM (time_last_cleared - time_first_on_scene)) / 60
            )::numeric, 1) as avg_on_scene_mins
        FROM incidents i
        WHERE i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND (i.internal_incident_number LIKE 'F%' OR i.internal_incident_number LIKE 'E%')
            AND {STATION_48_RESPONDED_FILTER}
    """), {'start_date': start_date, 'end_date': today}).fetchone()
    
    return {
        "period_days": days,
        "period": {"start": start_date.isoformat(), "end": today.isoformat()},
        "total_dispatched": fire_counts["total_dispatched"] + ems_counts["total_dispatched"],
        "station_responded": result.total_incidents or 0,
        "fire_dispatched": fire_counts["total_dispatched"],
        "fire_responded": result.fire_count or 0,
        "ems_dispatched": ems_counts["total_dispatched"],
        "ems_responded": result.ems_count or 0,
        "avg_turnout_mins": float(result.avg_turnout_mins) if result.avg_turnout_mins else None,
        "avg_response_mins": float(result.avg_response_mins) if result.avg_response_mins else None,
        "avg_on_scene_mins": float(result.avg_on_scene_mins) if result.avg_on_scene_mins else None,
    }
