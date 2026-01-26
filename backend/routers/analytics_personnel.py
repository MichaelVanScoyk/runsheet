"""
Analytics - Personnel Stats
Personal statistics for individual firefighters/members.

Shows:
- Call activity (total, fire/ems split, by type)
- First-out unit patterns (% of time on first unit enroute)
- Time of day response patterns
- Unit and role preferences
- Fun facts (longest call, busiest day, streaks)
- Detail participation (meetings, worknights, training)
"""

from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from models import Personnel, Rank

router = APIRouter(prefix="/api/analytics/v2/personnel", tags=["analytics-personnel"])


@router.get("/stats")
def get_personnel_stats(
    personnel_id: int = Query(..., description="Personnel ID to get stats for"),
    days: int = Query(365, description="Number of days to analyze (default: 365)"),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive statistics for a single personnel member.
    """
    # Verify personnel exists
    person = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personnel not found")
    
    rank = db.query(Rank).filter(Rank.id == person.rank_id).first() if person.rank_id else None
    
    today = date.today()
    start_date = today - timedelta(days=days)
    
    result = {
        "personnel": {
            "id": person.id,
            "display_name": person.display_name,
            "first_name": person.first_name,
            "last_name": person.last_name,
            "rank": rank.rank_name if rank else None,
        },
        "period": {
            "start": start_date.isoformat(),
            "end": today.isoformat(),
            "days": days
        },
        "calls": get_call_activity(db, personnel_id, start_date, today),
        "first_out": get_first_out_stats(db, personnel_id, start_date, today),
        "availability": get_availability(db, personnel_id, start_date, today),
        "units": get_unit_stats(db, personnel_id, start_date, today),
        "roles": get_role_stats(db, personnel_id, start_date, today),
        "fun_facts": get_fun_facts(db, personnel_id, start_date, today),
        "details": get_detail_participation(db, personnel_id, start_date, today),
    }
    
    return result


def get_call_activity(db: Session, personnel_id: int, start_date: date, end_date: date) -> dict:
    """Get call counts and breakdown by type."""
    
    totals = db.execute(text("""
        SELECT 
            COUNT(DISTINCT i.id) as total,
            SUM(CASE WHEN i.internal_incident_number LIKE 'F%' THEN 1 ELSE 0 END) as fire,
            SUM(CASE WHEN i.internal_incident_number LIKE 'E%' THEN 1 ELSE 0 END) as ems
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        WHERE ip.personnel_id = :personnel_id
            AND i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
    """), {
        'personnel_id': personnel_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchone()
    
    by_type = db.execute(text("""
        SELECT 
            CASE 
                WHEN i.internal_incident_number LIKE 'F%' THEN COALESCE(i.cad_event_type, 'Unknown')
                ELSE COALESCE(i.cad_event_subtype, i.cad_event_type, 'Unknown')
            END as call_type,
            COUNT(DISTINCT i.id) as count
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        WHERE ip.personnel_id = :personnel_id
            AND i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 10
    """), {
        'personnel_id': personnel_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchall()
    
    total = totals.total or 0
    months = max(1, (end_date - start_date).days / 30)
    
    return {
        "total": total,
        "fire": totals.fire or 0,
        "ems": totals.ems or 0,
        "by_type": [{"type": r.call_type, "count": r.count} for r in by_type],
        "calls_per_month_avg": round(total / months, 1)
    }


def get_first_out_stats(db: Session, personnel_id: int, start_date: date, end_date: date) -> dict:
    """Calculate how often this person is on the first unit to go enroute."""
    
    result = db.execute(text("""
        WITH person_incidents AS (
            SELECT DISTINCT i.id as incident_id, i.cad_units
            FROM incident_personnel ip
            JOIN incidents i ON ip.incident_id = i.id
            WHERE ip.personnel_id = :personnel_id
                AND i.incident_date >= :start_date
                AND i.incident_date < :end_date
                AND i.deleted_at IS NULL
                AND i.call_category IN ('FIRE', 'EMS')
                AND i.cad_units IS NOT NULL
                AND jsonb_array_length(i.cad_units) > 0
        ),
        first_units AS (
            SELECT 
                pi.incident_id,
                (SELECT unit_elem->>'unit_id'
                 FROM jsonb_array_elements(pi.cad_units) AS unit_elem
                 WHERE unit_elem->>'time_enroute' IS NOT NULL
                   AND (unit_elem->>'is_mutual_aid')::boolean IS NOT TRUE
                 ORDER BY unit_elem->>'time_enroute'
                 LIMIT 1
                ) as first_unit_id
            FROM person_incidents pi
        ),
        person_on_first AS (
            SELECT 
                fu.incident_id,
                fu.first_unit_id,
                CASE WHEN EXISTS (
                    SELECT 1 
                    FROM incident_personnel ip2
                    JOIN incident_units iu ON ip2.incident_unit_id = iu.id
                    JOIN apparatus a ON iu.apparatus_id = a.id
                    WHERE ip2.incident_id = fu.incident_id
                      AND ip2.personnel_id = :personnel_id
                      AND a.unit_designator = fu.first_unit_id
                ) THEN 1 ELSE 0 END as on_first_unit
            FROM first_units fu
            WHERE fu.first_unit_id IS NOT NULL
        )
        SELECT 
            COUNT(*) as total_calls,
            SUM(on_first_unit) as first_out_calls
        FROM person_on_first
    """), {
        'personnel_id': personnel_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchone()
    
    total = result.total_calls or 0
    first_out = result.first_out_calls or 0
    
    return {
        "total_calls_with_data": total,
        "first_out_calls": first_out,
        "first_out_percentage": round((first_out / total) * 100, 1) if total > 0 else 0,
        "avg_position": None
    }


def get_availability(db: Session, personnel_id: int, start_date: date, end_date: date) -> dict:
    """
    Get availability - percentage of station calls the person responded to.
    Split by time period (daytime/evening/overnight) and by call type.
    """
    
    # Get total station calls by period and category (denominator)
    station_totals = db.execute(text("""
        SELECT 
            CASE 
                WHEN EXTRACT(hour FROM i.time_dispatched AT TIME ZONE 'America/New_York') >= 6 
                     AND EXTRACT(hour FROM i.time_dispatched AT TIME ZONE 'America/New_York') < 16 
                THEN 'daytime'
                WHEN EXTRACT(hour FROM i.time_dispatched AT TIME ZONE 'America/New_York') >= 16 
                THEN 'evening'
                ELSE 'overnight'
            END as period,
            CASE WHEN i.internal_incident_number LIKE 'F%' THEN 'fire' ELSE 'ems' END as category,
            COUNT(DISTINCT i.id) as total_calls
        FROM incidents i
        WHERE i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
            AND i.time_dispatched IS NOT NULL
        GROUP BY 1, 2
    """), {
        'start_date': start_date,
        'end_date': end_date
    }).fetchall()
    
    # Get person's calls by period and category (numerator)
    person_totals = db.execute(text("""
        SELECT 
            CASE 
                WHEN EXTRACT(hour FROM i.time_dispatched AT TIME ZONE 'America/New_York') >= 6 
                     AND EXTRACT(hour FROM i.time_dispatched AT TIME ZONE 'America/New_York') < 16 
                THEN 'daytime'
                WHEN EXTRACT(hour FROM i.time_dispatched AT TIME ZONE 'America/New_York') >= 16 
                THEN 'evening'
                ELSE 'overnight'
            END as period,
            CASE WHEN i.internal_incident_number LIKE 'F%' THEN 'fire' ELSE 'ems' END as category,
            COUNT(DISTINCT i.id) as responded
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        WHERE ip.personnel_id = :personnel_id
            AND i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
            AND i.time_dispatched IS NOT NULL
        GROUP BY 1, 2
    """), {
        'personnel_id': personnel_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchall()
    
    # Build lookup dicts
    station_lookup = {(r.period, r.category): r.total_calls for r in station_totals}
    person_lookup = {(r.period, r.category): r.responded for r in person_totals}
    
    # Calculate availability by period
    by_period = {}
    for period in ['daytime', 'evening', 'overnight']:
        by_period[period] = {}
        for category in ['fire', 'ems']:
            total = station_lookup.get((period, category), 0)
            responded = person_lookup.get((period, category), 0)
            pct = round((responded / total) * 100, 1) if total > 0 else 0
            by_period[period][category] = {
                "responded": responded,
                "total": total,
                "percentage": pct
            }
    
    # Get availability by call type (the "dodge report")
    station_by_type = db.execute(text("""
        SELECT 
            CASE 
                WHEN i.internal_incident_number LIKE 'F%' THEN COALESCE(i.cad_event_type, 'Unknown')
                ELSE COALESCE(i.cad_event_subtype, i.cad_event_type, 'Unknown')
            END as call_type,
            CASE WHEN i.internal_incident_number LIKE 'F%' THEN 'fire' ELSE 'ems' END as category,
            COUNT(DISTINCT i.id) as total_calls
        FROM incidents i
        WHERE i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
        GROUP BY 1, 2
        ORDER BY total_calls DESC
    """), {
        'start_date': start_date,
        'end_date': end_date
    }).fetchall()
    
    person_by_type = db.execute(text("""
        SELECT 
            CASE 
                WHEN i.internal_incident_number LIKE 'F%' THEN COALESCE(i.cad_event_type, 'Unknown')
                ELSE COALESCE(i.cad_event_subtype, i.cad_event_type, 'Unknown')
            END as call_type,
            COUNT(DISTINCT i.id) as responded
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        WHERE ip.personnel_id = :personnel_id
            AND i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
        GROUP BY 1
    """), {
        'personnel_id': personnel_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchall()
    
    person_type_lookup = {r.call_type: r.responded for r in person_by_type}
    
    by_call_type = []
    for r in station_by_type:
        responded = person_type_lookup.get(r.call_type, 0)
        pct = round((responded / r.total_calls) * 100, 1) if r.total_calls > 0 else 0
        by_call_type.append({
            "call_type": r.call_type,
            "category": r.category,
            "responded": responded,
            "total": r.total_calls,
            "percentage": pct
        })
    
    return {
        "by_period": by_period,
        "by_call_type": by_call_type,
        "period_labels": {
            "daytime": "6am - 4pm",
            "evening": "4pm - 12am",
            "overnight": "12am - 6am"
        }
    }


def get_unit_stats(db: Session, personnel_id: int, start_date: date, end_date: date) -> dict:
    """Get which units this person rides most."""
    
    result = db.execute(text("""
        SELECT 
            a.unit_designator,
            a.name as unit_name,
            COUNT(DISTINCT i.id) as count
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        JOIN incident_units iu ON ip.incident_unit_id = iu.id
        JOIN apparatus a ON iu.apparatus_id = a.id
        WHERE ip.personnel_id = :personnel_id
            AND i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
            AND a.unit_category = 'APPARATUS'
        GROUP BY a.unit_designator, a.name
        ORDER BY count DESC
    """), {
        'personnel_id': personnel_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchall()
    
    total = sum(r.count for r in result)
    
    by_unit = [
        {
            "unit": r.unit_designator,
            "name": r.unit_name,
            "count": r.count,
            "percentage": round((r.count / total) * 100, 1) if total > 0 else 0
        }
        for r in result
    ]
    
    return {
        "by_unit": by_unit,
        "favorite_unit": by_unit[0]["unit"] if by_unit else None,
        "favorite_unit_name": by_unit[0]["name"] if by_unit else None
    }


def get_role_stats(db: Session, personnel_id: int, start_date: date, end_date: date) -> dict:
    """
    Get role breakdown (driver, officer, FF) derived from slot_index and apparatus config.
    
    Role is determined by position on the unit (slot_index) combined with
    the apparatus configuration (has_driver, has_officer flags):
    - slot_index 0 + apparatus.has_driver = DRIVER
    - slot_index 1 + apparatus.has_officer (when has_driver=true) = OFFICER  
    - slot_index 0 + apparatus.has_officer (when has_driver=false) = OFFICER
    - All other slots = FF
    
    FUTURE: When apparatus_seats table is implemented, this query will join to
    that table to get actual seat names (Nozzle, Backup, Doorman, Hydrant, Tools, etc.)
    instead of generic FF. The apparatus_seats table will define named positions
    per apparatus, allowing admin-configurable riding assignments.
    """
    
    result = db.execute(text("""
        SELECT 
            CASE 
                WHEN a.has_driver = true AND ip.slot_index = 0 THEN 'DRIVER'
                WHEN a.has_officer = true AND a.has_driver = true AND ip.slot_index = 1 THEN 'OFFICER'
                WHEN a.has_officer = true AND a.has_driver = false AND ip.slot_index = 0 THEN 'OFFICER'
                ELSE 'FF'
            END as derived_role,
            COUNT(DISTINCT i.id) as count
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        JOIN incident_units iu ON ip.incident_unit_id = iu.id
        JOIN apparatus a ON iu.apparatus_id = a.id
        WHERE ip.personnel_id = :personnel_id
            AND i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
        GROUP BY 1
        ORDER BY count DESC
    """), {
        'personnel_id': personnel_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchall()
    
    total = sum(r.count for r in result)
    
    # Initialize all roles
    roles = {'driver': 0, 'officer': 0, 'ff': 0}
    
    # Map results to role buckets
    role_map = {'DRIVER': 'driver', 'OFFICER': 'officer', 'FF': 'ff'}
    for r in result:
        normalized = role_map.get(r.derived_role, 'ff')
        roles[normalized] += r.count
    
    role_data = {}
    for role, count in roles.items():
        role_data[role] = {
            "count": count,
            "percentage": round((count / total) * 100, 1) if total > 0 else 0
        }
    
    return role_data


def get_fun_facts(db: Session, personnel_id: int, start_date: date, end_date: date) -> dict:
    """Get fun/interesting stats."""
    
    longest = db.execute(text("""
        SELECT 
            i.internal_incident_number,
            i.cad_event_type,
            EXTRACT(EPOCH FROM (i.time_last_cleared - i.time_first_on_scene)) / 60 as on_scene_mins
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        WHERE ip.personnel_id = :personnel_id
            AND i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
            AND i.time_first_on_scene IS NOT NULL
            AND i.time_last_cleared IS NOT NULL
        ORDER BY on_scene_mins DESC
        LIMIT 1
    """), {
        'personnel_id': personnel_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchone()
    
    busiest_day = db.execute(text("""
        SELECT 
            i.incident_date,
            COUNT(DISTINCT i.id) as call_count
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        WHERE ip.personnel_id = :personnel_id
            AND i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
        GROUP BY i.incident_date
        ORDER BY call_count DESC
        LIMIT 1
    """), {
        'personnel_id': personnel_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchone()
    
    first_call = db.execute(text("""
        SELECT 
            i.internal_incident_number,
            i.incident_date
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        WHERE ip.personnel_id = :personnel_id
            AND i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
        ORDER BY i.incident_date, i.time_dispatched
        LIMIT 1
    """), {
        'personnel_id': personnel_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchone()
    
    most_recent = db.execute(text("""
        SELECT 
            i.internal_incident_number,
            i.incident_date
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        WHERE ip.personnel_id = :personnel_id
            AND i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
        ORDER BY i.incident_date DESC, i.time_dispatched DESC
        LIMIT 1
    """), {
        'personnel_id': personnel_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchone()
    
    streak = calculate_response_streak(db, personnel_id)
    
    return {
        "longest_call_mins": round(longest.on_scene_mins) if longest and longest.on_scene_mins else None,
        "longest_call_incident": longest.internal_incident_number if longest else None,
        "longest_call_type": longest.cad_event_type if longest else None,
        "busiest_day_date": busiest_day.incident_date.isoformat() if busiest_day else None,
        "busiest_day_calls": busiest_day.call_count if busiest_day else 0,
        "first_call": {
            "incident": first_call.internal_incident_number,
            "date": first_call.incident_date.isoformat()
        } if first_call else None,
        "most_recent_call": {
            "incident": most_recent.internal_incident_number,
            "date": most_recent.incident_date.isoformat()
        } if most_recent else None,
        "current_streak_weeks": streak
    }


def calculate_response_streak(db: Session, personnel_id: int) -> int:
    """Calculate consecutive weeks with at least one call response."""
    result = db.execute(text("""
        SELECT DISTINCT 
            DATE_TRUNC('week', i.incident_date) as week_start
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        WHERE ip.personnel_id = :personnel_id
            AND i.incident_date >= CURRENT_DATE - INTERVAL '52 weeks'
            AND i.deleted_at IS NULL
            AND i.call_category IN ('FIRE', 'EMS')
        ORDER BY week_start DESC
    """), {'personnel_id': personnel_id}).fetchall()
    
    if not result:
        return 0
    
    weeks_with_calls = [r.week_start.date() for r in result]
    
    today = date.today()
    current_week_start = today - timedelta(days=today.weekday())
    
    streak = 0
    check_week = current_week_start
    
    for _ in range(52):
        if check_week in weeks_with_calls:
            streak += 1
            check_week -= timedelta(weeks=1)
        else:
            break
    
    return streak


def get_detail_participation(db: Session, personnel_id: int, start_date: date, end_date: date) -> dict:
    """Get detail event participation (meetings, worknights, training, etc.)."""
    
    result = db.execute(text("""
        SELECT 
            dt.display_name as type_name,
            COUNT(DISTINCT i.id) as count,
            SUM(
                EXTRACT(EPOCH FROM (
                    COALESCE(i.time_event_end, i.time_last_cleared) - 
                    COALESCE(i.time_event_start, i.time_dispatched)
                )) / 3600
            ) as hours
        FROM incident_personnel ip
        JOIN incidents i ON ip.incident_id = i.id
        LEFT JOIN detail_types dt ON i.detail_type = dt.code
        WHERE ip.personnel_id = :personnel_id
            AND i.incident_date >= :start_date
            AND i.incident_date < :end_date
            AND i.deleted_at IS NULL
            AND i.call_category = 'DETAIL'
        GROUP BY dt.display_name, dt.display_order
        ORDER BY dt.display_order
    """), {
        'personnel_id': personnel_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchall()
    
    by_type = [
        {
            "type": r.type_name or "Other",
            "count": r.count,
            "hours": round(float(r.hours), 1) if r.hours else 0
        }
        for r in result
    ]
    
    total_events = sum(r['count'] for r in by_type)
    total_hours = sum(r['hours'] for r in by_type)
    
    return {
        "total_events": total_events,
        "total_hours": round(total_hours, 1),
        "by_type": by_type
    }


@router.get("/list")
def get_personnel_list_for_analytics(
    db: Session = Depends(get_db)
):
    """Get list of active personnel for admin dropdown."""
    personnel = db.query(Personnel).filter(
        Personnel.active == True
    ).order_by(Personnel.last_name, Personnel.first_name).all()
    
    return [
        {
            "id": p.id,
            "display_name": p.display_name,
            "first_name": p.first_name,
            "last_name": p.last_name,
        }
        for p in personnel
    ]
