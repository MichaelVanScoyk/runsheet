"""
Backup router - Export CAD data, reparse incidents, restore from CAD

KEY FIX: Reparser now uses per-unit times and respects counts_for_response_times flag,
matching the logic in cad_listener.py. This ensures old incidents get corrected
when chief vehicles (CHF48, etc.) were incorrectly included in response metrics.
"""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, Dict, Any, List
from datetime import datetime, date, time as dt_time, timedelta
from zoneinfo import ZoneInfo
import json
import io
import os
import sys

from database import get_db
from settings_helper import get_timezone, format_utc_iso


def get_local_timezone() -> ZoneInfo:
    """Get configured local timezone from settings"""
    return ZoneInfo(get_timezone())


router = APIRouter()


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_cad_parser():
    """
    Import cad_parser module with cross-platform path handling.
    Returns (parse_cad_html, report_to_dict) tuple or raises ImportError.
    """
    possible_paths = [
        '/opt/runsheet/cad',                                        # Linux production
        os.path.join(os.path.dirname(__file__), '..', '..', 'cad'), # Relative to this file
        'C:\\Users\\micha\\runsheet\\cad',                          # Windows dev
    ]
    
    for path in possible_paths:
        abs_path = os.path.abspath(path)
        if os.path.exists(abs_path):
            if abs_path not in sys.path:
                sys.path.insert(0, abs_path)
            try:
                from cad_parser import parse_cad_html, report_to_dict
                return parse_cad_html, report_to_dict
            except ImportError:
                continue
    
    raise ImportError("Could not import cad_parser from any known path")


def get_full_unit_info(db: Session, unit_id: str) -> Dict[str, Any]:
    """
    Full unit lookup matching settings_helper.get_unit_info().
    Returns all info needed to build cad_units entries.
    Checks cad_unit_id, unit_designator, AND aliases.
    Returns canonical unit_designator to normalize aliases.
    """
    if not unit_id:
        return {
            'is_ours': False,
            'apparatus_id': None,
            'category': None,
            'counts_for_response_times': False,
            'unit_designator': None,
        }
    
    result = db.execute(text("""
        SELECT id, unit_category, counts_for_response_times, cad_unit_id, unit_designator, cad_unit_aliases
        FROM apparatus 
        WHERE (
            UPPER(cad_unit_id) = :unit_id 
            OR UPPER(unit_designator) = :unit_id
            OR :unit_id = ANY(SELECT UPPER(unnest(cad_unit_aliases)))
        ) AND active = true
        LIMIT 1
    """), {"unit_id": unit_id.upper()}).fetchone()
    
    if result:
        return {
            'is_ours': True,
            'apparatus_id': result[0],
            'category': result[1],
            # CRITICAL: Default to False if NULL in database - safer to exclude than include
            'counts_for_response_times': result[2] if result[2] is not None else False,
            'unit_designator': result[4],  # Canonical unit_designator
        }
    
    # Not found in apparatus - it's mutual aid, doesn't count for our response metrics
    return {
        'is_ours': False,
        'apparatus_id': None,
        'category': None,
        'counts_for_response_times': False,
        'unit_designator': None,
    }


def full_reparse_incident(incident_id: int, db: Session, edited_by: Optional[int] = None) -> Dict[str, Any]:
    """
    Full reparse of an incident from stored CAD HTML.
    
    This mirrors cad_listener._handle_clear() logic:
    1. Parses raw CAD HTML
    2. Rebuilds cad_units from scratch with CURRENT apparatus config
    3. Recalculates is_mutual_aid flags
    4. Recalculates all times with proper filtering
    5. Updates all CAD-derived fields
    
    This is the FULL reparse - not just times, but everything CAD-derived.
    """
    try:
        parse_cad_html, report_to_dict = get_cad_parser()
    except ImportError as e:
        return {"error": f"CAD parser not available: {e}"}
    
    # Get the incident
    result = db.execute(text("""
        SELECT 
            id, internal_incident_number, incident_date,
            cad_raw_dispatch, cad_raw_clear, cad_units
        FROM incidents 
        WHERE id = :id AND deleted_at IS NULL
    """), {"id": incident_id}).fetchone()
    
    if not result:
        return {"error": "Incident not found", "incident_id": incident_id}
    
    incident_number = result[1]
    incident_date = result[2]
    raw_dispatch = result[3]
    raw_clear = result[4]
    existing_cad_units = result[5] or []
    
    # Prefer clear report (has all times), fall back to dispatch
    raw_html = raw_clear or raw_dispatch
    report_source = "clear_report" if raw_clear else "dispatch_report"
    
    if not raw_html:
        return {"error": "No raw CAD HTML stored for this incident", "incident_id": incident_id}
    
    if not incident_date:
        return {"error": "No incident_date set - cannot calculate times", "incident_id": incident_id}
    
    # Parse the HTML
    parsed = parse_cad_html(raw_html)
    if not parsed:
        return {"error": "Failed to parse stored HTML", "incident_id": incident_id}
    
    report_dict = report_to_dict(parsed)
    
    # Track what changed
    changes = []
    
    # Get dispatch time for midnight crossing detection
    dispatch_time_str = report_dict.get('first_dispatch') or report_dict.get('dispatch_time')
    
    # ==========================================================================
    # REBUILD cad_units FROM SCRATCH
    # This is the key fix - rebuild with CURRENT apparatus config
    # ==========================================================================
    
    new_cad_units = []
    units_changed = []
    
    for ut in report_dict.get('unit_times', []):
        unit_id = ut.get('unit_id')
        if not unit_id:
            continue
        
        # Look up unit info from CURRENT apparatus table
        unit_info = get_full_unit_info(db, unit_id)
        
        # Parse times with proper date and midnight crossing
        time_dispatched = build_datetime_with_midnight_crossing(
            incident_date, ut.get('time_dispatched'), dispatch_time_str
        )
        time_enroute = build_datetime_with_midnight_crossing(
            incident_date, ut.get('time_enroute'), dispatch_time_str
        )
        time_arrived = build_datetime_with_midnight_crossing(
            incident_date, ut.get('time_arrived'), dispatch_time_str
        )
        time_available = build_datetime_with_midnight_crossing(
            incident_date, ut.get('time_available'), dispatch_time_str
        )
        time_cleared = build_datetime_with_midnight_crossing(
            incident_date, ut.get('time_at_quarters'), dispatch_time_str
        )
        
        # Build the unit entry
        # Use canonical unit_designator if available (normalizes aliases like 48QRS -> QRS48)
        canonical_unit_id = unit_info['unit_designator'] or unit_id
        unit_entry = {
            'unit_id': canonical_unit_id,
            'station': None,
            'agency': None,
            'is_mutual_aid': not unit_info['is_ours'],
            'apparatus_id': unit_info['apparatus_id'],
            'unit_category': unit_info['category'],
            'counts_for_response_times': unit_info['counts_for_response_times'],
            'time_dispatched': time_dispatched.isoformat() if time_dispatched else None,
            'time_enroute': time_enroute.isoformat() if time_enroute else None,
            'time_arrived': time_arrived.isoformat() if time_arrived else None,
            'time_available': time_available.isoformat() if time_available else None,
            'time_cleared': time_cleared.isoformat() if time_cleared else None,
        }
        
        new_cad_units.append(unit_entry)
        
        # Check if this unit's config changed from what was stored
        old_unit = next((u for u in existing_cad_units if u.get('unit_id') == unit_id), None)
        if old_unit:
            if old_unit.get('is_mutual_aid') != unit_entry['is_mutual_aid']:
                units_changed.append({
                    'unit_id': unit_id,
                    'field': 'is_mutual_aid',
                    'old': old_unit.get('is_mutual_aid'),
                    'new': unit_entry['is_mutual_aid'],
                })
            if old_unit.get('counts_for_response_times') != unit_entry['counts_for_response_times']:
                units_changed.append({
                    'unit_id': unit_id,
                    'field': 'counts_for_response_times',
                    'old': old_unit.get('counts_for_response_times'),
                    'new': unit_entry['counts_for_response_times'],
                })
    
    if units_changed:
        changes.append({'field': 'cad_units', 'unit_changes': units_changed})
    
    # ==========================================================================
    # CALCULATE RESPONSE TIMES FROM FILTERED UNITS
    # ==========================================================================
    
    # CRITICAL: Default to False - if field is missing/None, unit should NOT affect metrics
    # Also check is_mutual_aid as belt-and-suspenders safety
    metric_units = [u for u in new_cad_units 
                   if u.get('counts_for_response_times') == True 
                   and not u.get('is_mutual_aid', True)]
    # Excluded = either counts_for_response_times is False/None OR is_mutual_aid is True
    excluded_units = [u['unit_id'] for u in new_cad_units 
                     if u.get('counts_for_response_times') != True or u.get('is_mutual_aid', True)]
    included_units = [u['unit_id'] for u in metric_units]
    
    # Find earliest enroute from units that count
    enroute_times = [u['time_enroute'] for u in metric_units if u.get('time_enroute')]
    time_first_enroute = min(enroute_times) if enroute_times else None
    
    # Find earliest arrival from units that count
    arrive_times = [u['time_arrived'] for u in metric_units if u.get('time_arrived')]
    time_first_on_scene = min(arrive_times) if arrive_times else None
    
    # Find latest cleared from OUR units only (not mutual aid)
    our_units = [u for u in new_cad_units if not u.get('is_mutual_aid', True)]
    cleared_times = [u['time_cleared'] for u in our_units if u.get('time_cleared')]
    time_last_cleared = max(cleared_times) if cleared_times else None
    
    # ==========================================================================
    # BUILD UPDATE DATA
    # ==========================================================================
    
    update_fields = {
        'cad_units': json.dumps(new_cad_units),  # JSON column
    }
    restored_fields = ['cad_units']
    
    # Text fields from CAD
    if report_dict.get('address'):
        update_fields['address'] = report_dict['address']
        restored_fields.append('address')
    
    if report_dict.get('municipality'):
        update_fields['municipality_code'] = report_dict['municipality']
        restored_fields.append('municipality_code')
    
    if report_dict.get('cross_streets'):
        update_fields['cross_streets'] = report_dict['cross_streets']
        restored_fields.append('cross_streets')
    
    if report_dict.get('event_type'):
        update_fields['cad_event_type'] = report_dict['event_type']
        restored_fields.append('cad_event_type')
    
    if report_dict.get('event_subtype'):
        update_fields['cad_event_subtype'] = report_dict['event_subtype']
        restored_fields.append('cad_event_subtype')
    
    if report_dict.get('esz'):
        update_fields['esz_box'] = report_dict['esz']
        restored_fields.append('esz_box')
    
    if report_dict.get('caller_name'):
        update_fields['caller_name'] = report_dict['caller_name']
        restored_fields.append('caller_name')
    
    if report_dict.get('caller_phone'):
        update_fields['caller_phone'] = report_dict['caller_phone']
        restored_fields.append('caller_phone')
    
    # NOTE: We do NOT use first_dispatch/dispatch_time header for time_dispatched.
    # That's the time the FIRST unit on the ENTIRE incident was dispatched,
    # which could be a different station dispatched hours before us.
    # Instead, calculate time_dispatched from OUR units' earliest dispatch time.
    dispatch_times_from_units = [u['time_dispatched'] for u in metric_units if u.get('time_dispatched')]
    if dispatch_times_from_units:
        update_fields['time_dispatched'] = min(dispatch_times_from_units)
        restored_fields.append('time_dispatched')
    
    # ALWAYS set response time fields - NULL if no metric units have data
    # This clears old bad data from mutual aid times
    update_fields['time_first_enroute'] = time_first_enroute
    restored_fields.append('time_first_enroute')
    
    update_fields['time_first_on_scene'] = time_first_on_scene
    restored_fields.append('time_first_on_scene')
    
    update_fields['time_last_cleared'] = time_last_cleared
    restored_fields.append('time_last_cleared')
    
    # NOTE: time_in_service is NOT stored as a timestamp
    # It's calculated as duration (Cleared - Dispatched) in the frontend
    
    # ==========================================================================
    # EXECUTE UPDATE
    # ==========================================================================
    
    # Build SET clause - handle cad_units specially (it's JSONB)
    set_parts = []
    params = {'id': incident_id}
    
    for key, value in update_fields.items():
        if key == 'cad_units':
            set_parts.append(f"{key} = CAST(:cad_units AS jsonb)")
            params['cad_units'] = value
        else:
            set_parts.append(f"{key} = :{key}")
            params[key] = value
    
    set_clause = ", ".join(set_parts)
    
    db.execute(text(f"""
        UPDATE incidents 
        SET {set_clause}, updated_at = NOW()
        WHERE id = :id
    """), params)
    
    # Add audit log entry for the reparse
    # Look up person's name if edited_by provided, otherwise use "CAD Parser"
    personnel_name = "CAD Parser"
    if edited_by:
        person_result = db.execute(text("""
            SELECT first_name, last_name FROM personnel WHERE id = :id
        """), {"id": edited_by}).fetchone()
        if person_result:
            personnel_name = f"{person_result[1]}, {person_result[0]}"
    
    audit_summary = f"Reparsed from {report_source}"
    if units_changed:
        audit_summary += f" ({len(units_changed)} unit config changes)"
    
    db.execute(text("""
        INSERT INTO audit_log (
            personnel_id, personnel_name, action, entity_type, entity_id, 
            entity_display, summary, fields_changed, created_at
        ) VALUES (
            :personnel_id, :personnel_name, 'REPARSE', 'incident', :incident_id,
            :entity_display, :summary, :fields_changed, NOW()
        )
    """), {
        "personnel_id": edited_by,
        "personnel_name": personnel_name,
        "incident_id": incident_id,
        "entity_display": f"Incident {incident_number}",
        "summary": audit_summary,
        "fields_changed": json.dumps({
            "restored_fields": restored_fields,
            "unit_changes": units_changed,
            "included_units": included_units,
            "excluded_units": excluded_units,
        })
    })
    
    db.commit()
    
    return {
        "success": True,
        "incident_id": incident_id,
        "incident_number": incident_number,
        "source": report_source,
        "restored_fields": restored_fields,
        "included_units": included_units,
        "excluded_units": excluded_units,
        "unit_changes": units_changed,
        "values": {
            k: (v if isinstance(v, str) else v.isoformat() if hasattr(v, 'isoformat') else str(v))
            for k, v in update_fields.items() if k != 'cad_units'
        }
    }


def parse_time_str(time_str: str):
    """Parse HH:MM:SS or HH:MM string to (hours, minutes, seconds) tuple."""
    if not time_str:
        return None
    try:
        parts = time_str.split(':')
        if len(parts) >= 2:
            return (int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
    except (ValueError, IndexError):
        return None
    return None


def build_datetime_with_midnight_crossing(base_date, time_str: str, dispatch_time_str: str):
    """
    Build datetime from date and time, handling midnight crossing.
    If time < dispatch time, assume it crossed midnight (add 1 day).
    Converts local time to UTC for storage.
    
    Args:
        base_date: date object or YYYY-MM-DD string
        time_str: HH:MM:SS time string from CAD (local time)
        dispatch_time_str: HH:MM:SS dispatch time for reference
    
    Returns:
        datetime object in UTC, or None
    """
    time_parts = parse_time_str(time_str)
    if not time_parts:
        return None
    
    if isinstance(base_date, str):
        try:
            base_date = datetime.strptime(base_date, '%Y-%m-%d').date()
        except ValueError:
            return None
    
    if not base_date:
        return None
    
    hours, minutes, seconds = time_parts
    result_date = base_date
    
    # Check for midnight crossing
    if dispatch_time_str:
        dispatch_parts = parse_time_str(dispatch_time_str)
        if dispatch_parts:
            disp_total = dispatch_parts[0] * 60 + dispatch_parts[1]
            this_total = hours * 60 + minutes
            if this_total < disp_total:
                result_date = base_date + timedelta(days=1)
    
    # Build local datetime then convert to UTC
    local_dt = datetime.combine(result_date, dt_time(hours, minutes, seconds))
    local_tz = get_local_timezone()
    local_dt = local_dt.replace(tzinfo=local_tz)
    utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
    
    return utc_dt


def calculate_response_times_from_units(
    unit_times: List[Dict], 
    incident_date, 
    dispatch_time_str: str, 
    db: Session
) -> Dict[str, Any]:
    """
    Calculate first_enroute and first_on_scene from per-unit times,
    only including units where counts_for_response_times=true.
    
    Args:
        unit_times: List of dicts from CAD parser with unit_id, time_enroute, time_arrived, etc.
        incident_date: Base date for building full timestamps
        dispatch_time_str: Dispatch time (HH:MM:SS) for midnight crossing detection
        db: Database session for looking up unit config
    
    Returns:
        dict with:
            time_first_enroute: datetime or None
            time_first_on_scene: datetime or None
            included_units: list of unit_ids that were counted
            excluded_units: list of unit_ids that were skipped
    """
    enroute_times = []
    arrival_times = []
    excluded_units = []
    included_units = []
    
    for ut in unit_times:
        unit_id = ut.get('unit_id')
        if not unit_id:
            continue
        
        # Look up unit config
        unit_info = get_full_unit_info(db, unit_id)
        
        if not unit_info['counts_for_response_times']:
            excluded_units.append(unit_id)
            continue
        
        included_units.append(unit_id)
        
        # Parse enroute time
        if ut.get('time_enroute'):
            enroute_dt = build_datetime_with_midnight_crossing(
                incident_date, ut['time_enroute'], dispatch_time_str
            )
            if enroute_dt:
                enroute_times.append(enroute_dt)
        
        # Parse arrival time
        if ut.get('time_arrived'):
            arrival_dt = build_datetime_with_midnight_crossing(
                incident_date, ut['time_arrived'], dispatch_time_str
            )
            if arrival_dt:
                arrival_times.append(arrival_dt)
    
    return {
        'time_first_enroute': min(enroute_times) if enroute_times else None,
        'time_first_on_scene': min(arrival_times) if arrival_times else None,
        'included_units': included_units,
        'excluded_units': excluded_units,
    }


# =============================================================================
# DIAGNOSE ENDPOINT
# =============================================================================

@router.get("/diagnose-times")
async def diagnose_incident_times(
    year: int = Query(None),
    incident_id: int = Query(None),
    db: Session = Depends(get_db)
):
    """
    Diagnose time/date issues in incidents by comparing stored values against 
    what they SHOULD be based on CAD data and counts_for_response_times rules.
    
    This will find incidents where:
    - first_enroute/first_on_scene was calculated from wrong units (like CHF48)
    - Times have wrong dates due to midnight crossing
    - Times are missing that should exist
    
    Returns detailed list of issues found.
    """
    try:
        parse_cad_html, report_to_dict = get_cad_parser()
    except ImportError as e:
        return {"error": f"CAD parser not available: {e}"}
    
    # Build query filter
    if incident_id:
        filter_clause = "id = :incident_id"
        params = {"incident_id": incident_id}
    elif year:
        filter_clause = "year_prefix = :year"
        params = {"year": year}
    else:
        filter_clause = "year_prefix = :year"
        params = {"year": datetime.now().year}
    
    result = db.execute(text(f"""
        SELECT 
            id, internal_incident_number, incident_date,
            time_dispatched, time_first_enroute, time_first_on_scene,
            time_last_cleared,
            cad_raw_dispatch, cad_raw_clear
        FROM incidents 
        WHERE {filter_clause} AND deleted_at IS NULL
        ORDER BY incident_date, internal_incident_number
    """), params)
    
    issues = []
    checked_count = 0
    ok_count = 0
    
    for row in result:
        inc_id = row[0]
        incident_number = row[1]
        incident_date = row[2]
        stored_times = {
            'time_dispatched': row[3],
            'time_first_enroute': row[4],
            'time_first_on_scene': row[5],
            'time_last_cleared': row[6],
        }
        raw_dispatch = row[7]
        raw_clear = row[8]
        
        # Prefer clear report (has unit times table)
        raw_html = raw_clear or raw_dispatch
        if not raw_html:
            continue
        
        parsed = parse_cad_html(raw_html)
        if not parsed:
            issues.append({
                "incident_id": inc_id,
                "incident_number": incident_number,
                "issue": "PARSE_ERROR",
                "details": "Failed to parse stored CAD HTML"
            })
            continue
        
        report_dict = report_to_dict(parsed)
        checked_count += 1
        
        # Get dispatch time for midnight crossing reference
        dispatch_time_str = report_dict.get('first_dispatch') or report_dict.get('dispatch_time')
        
        incident_issues = []
        
        # Check dispatch time
        if dispatch_time_str:
            expected_dispatch = build_datetime_with_midnight_crossing(
                incident_date, dispatch_time_str, dispatch_time_str
            )
            stored_dispatch = stored_times['time_dispatched']
            if expected_dispatch and stored_dispatch:
                stored_dt = stored_dispatch.replace(tzinfo=None) if hasattr(stored_dispatch, 'replace') else stored_dispatch
                if abs((stored_dt - expected_dispatch).total_seconds()) > 1:
                    incident_issues.append({
                        "field": "time_dispatched",
                        "issue": "TIME_MISMATCH",
                        "stored": stored_dt.isoformat(),
                        "expected": expected_dispatch.isoformat(),
                        "cad_time": dispatch_time_str
                    })
        
        # Calculate expected first_enroute and first_on_scene using per-unit times
        unit_times = report_dict.get('unit_times', [])
        if unit_times:
            response_times = calculate_response_times_from_units(
                unit_times, incident_date, dispatch_time_str, db
            )
            
            # Check first_enroute
            expected_enroute = response_times['time_first_enroute']
            stored_enroute = stored_times['time_first_enroute']
            
            if expected_enroute:
                if stored_enroute is None:
                    incident_issues.append({
                        "field": "time_first_enroute",
                        "issue": "MISSING",
                        "stored": None,
                        "expected": expected_enroute.isoformat(),
                        "included_units": response_times['included_units'],
                        "excluded_units": response_times['excluded_units'],
                    })
                else:
                    stored_dt = stored_enroute.replace(tzinfo=None) if hasattr(stored_enroute, 'replace') else stored_enroute
                    if abs((stored_dt - expected_enroute).total_seconds()) > 1:
                        incident_issues.append({
                            "field": "time_first_enroute",
                            "issue": "WRONG_UNIT" if response_times['excluded_units'] else "TIME_MISMATCH",
                            "stored": stored_dt.isoformat(),
                            "expected": expected_enroute.isoformat(),
                            "included_units": response_times['included_units'],
                            "excluded_units": response_times['excluded_units'],
                        })
            
            # Check first_on_scene
            expected_arrival = response_times['time_first_on_scene']
            stored_arrival = stored_times['time_first_on_scene']
            
            if expected_arrival:
                if stored_arrival is None:
                    incident_issues.append({
                        "field": "time_first_on_scene",
                        "issue": "MISSING",
                        "stored": None,
                        "expected": expected_arrival.isoformat(),
                        "included_units": response_times['included_units'],
                        "excluded_units": response_times['excluded_units'],
                    })
                else:
                    stored_dt = stored_arrival.replace(tzinfo=None) if hasattr(stored_arrival, 'replace') else stored_arrival
                    if abs((stored_dt - expected_arrival).total_seconds()) > 1:
                        incident_issues.append({
                            "field": "time_first_on_scene",
                            "issue": "WRONG_UNIT" if response_times['excluded_units'] else "TIME_MISMATCH",
                            "stored": stored_dt.isoformat(),
                            "expected": expected_arrival.isoformat(),
                            "included_units": response_times['included_units'],
                            "excluded_units": response_times['excluded_units'],
                        })
            
            # Check time_last_cleared (calculated from MAX of OUR unit AQ times)
            cleared_times_from_units = []
            for ut in unit_times:
                unit_id = ut.get('unit_id')
                if not unit_id:
                    continue
                unit_info = get_full_unit_info(db, unit_id)
                # Only include our units (not mutual aid)
                if unit_info['is_ours'] and ut.get('time_at_quarters'):
                    cleared_dt = build_datetime_with_midnight_crossing(
                        incident_date, ut['time_at_quarters'], dispatch_time_str
                    )
                    if cleared_dt:
                        cleared_times_from_units.append(cleared_dt)
            
            if cleared_times_from_units:
                expected_cleared = max(cleared_times_from_units)
                stored_cleared = stored_times['time_last_cleared']
                
                if stored_cleared is None:
                    incident_issues.append({
                        "field": "time_last_cleared",
                        "issue": "MISSING",
                        "stored": None,
                        "expected": expected_cleared.isoformat(),
                    })
                else:
                    stored_dt = stored_cleared.replace(tzinfo=None) if hasattr(stored_cleared, 'replace') else stored_cleared
                    if abs((stored_dt - expected_cleared).total_seconds()) > 1:
                        incident_issues.append({
                            "field": "time_last_cleared",
                            "issue": "TIME_MISMATCH",
                            "stored": stored_dt.isoformat(),
                            "expected": expected_cleared.isoformat(),
                        })
        
        if incident_issues:
            issues.append({
                "incident_id": inc_id,
                "incident_number": incident_number,
                "incident_date": incident_date.isoformat() if incident_date else None,
                "issues": incident_issues
            })
        else:
            ok_count += 1
    
    return {
        "checked": checked_count,
        "ok": ok_count,
        "with_issues": len(issues),
        "issues": issues
    }


# =============================================================================
# RESTORE FROM CAD / FULL REPARSE
# =============================================================================

@router.post("/restore-from-cad/{incident_id}")
async def restore_incident_from_cad(
    incident_id: int,
    edited_by: Optional[int] = Query(None, description="Personnel ID of logged-in user"),
    db: Session = Depends(get_db)
):
    """
    Full reparse of incident from stored raw CAD HTML.
    
    This is a FULL reparse that mirrors cad_listener._handle_clear():
    - Rebuilds cad_units from scratch with CURRENT apparatus config
    - Recalculates is_mutual_aid flags based on current apparatus table
    - Recalculates all times with proper filtering
    - Updates all CAD-derived fields
    
    Keeps: internal_incident_number, call_category, personnel, NERIS codes, notes.
    """
    return full_reparse_incident(incident_id, db, edited_by)


@router.post("/full-reparse/{incident_id}")
async def full_reparse_from_cad(
    incident_id: int,
    edited_by: Optional[int] = Query(None, description="Personnel ID of logged-in user"),
    db: Session = Depends(get_db)
):
    """
    Alias for restore-from-cad. Full reparse of incident from stored CAD HTML.
    """
    return full_reparse_incident(incident_id, db, edited_by)


@router.post("/full-reparse-all")
async def full_reparse_all_incidents(
    year: int = Query(None),
    dry_run: bool = Query(True),
    db: Session = Depends(get_db)
):
    """
    Full reparse ALL incidents in a year from stored CAD HTML.
    
    This rebuilds cad_units, is_mutual_aid flags, and all times for every incident.
    Use this after changing apparatus configuration to update historical incidents.
    
    Args:
        year: Year to process (defaults to current year)
        dry_run: If True, only report what would be fixed without making changes
    """
    if not year:
        year = datetime.now().year
    
    # Get all incidents for the year
    result = db.execute(text("""
        SELECT id, internal_incident_number
        FROM incidents 
        WHERE year_prefix = :year AND deleted_at IS NULL
        ORDER BY incident_date, internal_incident_number
    """), {"year": year})
    
    incidents = list(result)
    results = []
    success_count = 0
    error_count = 0
    
    for row in incidents:
        inc_id = row[0]
        incident_number = row[1]
        
        if dry_run:
            # Just check if it would work
            results.append({
                "incident_id": inc_id,
                "incident_number": incident_number,
                "would_reparse": True
            })
        else:
            # Actually do the reparse
            reparse_result = full_reparse_incident(inc_id, db)
            
            if reparse_result.get('success'):
                success_count += 1
                results.append({
                    "incident_id": inc_id,
                    "incident_number": incident_number,
                    "success": True,
                    "unit_changes": reparse_result.get('unit_changes', []),
                    "restored_fields": reparse_result.get('restored_fields', []),
                })
            else:
                error_count += 1
                results.append({
                    "incident_id": inc_id,
                    "incident_number": incident_number,
                    "success": False,
                    "error": reparse_result.get('error', 'Unknown error'),
                })
    
    return {
        "dry_run": dry_run,
        "year": year,
        "total_incidents": len(incidents),
        "success_count": success_count if not dry_run else len(incidents),
        "error_count": error_count,
        "results": results
    }


@router.get("/preview-restore/{incident_id}")
async def preview_restore_from_cad(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Preview what would be restored/changed from CAD reparse.
    
    Returns ALL changes that will happen:
    - field_changes: List of {field, current, will_be, display} for incident-level fields
    - unit_config_changes: List of changes to unit config (is_mutual_aid, counts_for_response_times)
    - response_calculation: Which units are included/excluded from metrics
    """
    try:
        parse_cad_html, report_to_dict = get_cad_parser()
    except ImportError as e:
        return {"error": f"CAD parser not available: {e}"}
    
    # Get the incident including CURRENT stored values
    result = db.execute(text("""
        SELECT 
            id, internal_incident_number, incident_date,
            cad_raw_dispatch, cad_raw_clear, cad_units,
            address, municipality_code, cross_streets, cad_event_type, cad_event_subtype,
            time_dispatched, time_first_enroute, time_first_on_scene, time_last_cleared
        FROM incidents 
        WHERE id = :id AND deleted_at IS NULL
    """), {"id": incident_id}).fetchone()
    
    if not result:
        return {"error": "Incident not found"}
    
    incident_number = result[1]
    incident_date = result[2]
    raw_dispatch = result[3]
    raw_clear = result[4]
    existing_cad_units = result[5] or []
    
    # Current stored values
    current_values = {
        'address': result[6],
        'municipality_code': result[7],
        'cross_streets': result[8],
        'cad_event_type': result[9],
        'cad_event_subtype': result[10],
        'time_dispatched': result[11],
        'time_first_enroute': result[12],
        'time_first_on_scene': result[13],
        'time_last_cleared': result[14],
    }
    
    raw_html = raw_clear or raw_dispatch
    
    if not raw_html:
        return {"error": "No raw CAD HTML stored"}
    
    parsed = parse_cad_html(raw_html)
    if not parsed:
        return {"error": "Failed to parse stored HTML"}
    
    report_dict = report_to_dict(parsed)
    dispatch_time_str = report_dict.get('first_dispatch') or report_dict.get('dispatch_time')
    unit_times = report_dict.get('unit_times', [])
    
    # ==========================================================================
    # CALCULATE WHAT VALUES WILL BE AFTER REPARSE
    # ==========================================================================
    
    new_values = {
        'address': report_dict.get('address'),
        'municipality_code': report_dict.get('municipality'),
        'cross_streets': report_dict.get('cross_streets'),
        'cad_event_type': report_dict.get('event_type'),
        'cad_event_subtype': report_dict.get('event_subtype'),
        'time_dispatched': None,
        'time_first_enroute': None,
        'time_first_on_scene': None,
        'time_last_cleared': None,
    }
    
    # NOTE: We do NOT use first_dispatch/dispatch_time header for time_dispatched.
    # That's the time the FIRST unit on the ENTIRE incident was dispatched,
    # which could be a different station dispatched hours before us.
    # We calculate time_dispatched from OUR units' earliest dispatch time below.
    
    # Calculate response times from units that count
    included_units = []
    excluded_units = []
    
    if unit_times and incident_date:
        # Build list of metric units
        metric_units = []
        for ut in unit_times:
            unit_id = ut.get('unit_id')
            if not unit_id:
                continue
            unit_info = get_full_unit_info(db, unit_id)
            canonical_id = unit_info['unit_designator'] or unit_id
            
            # Only include if counts_for_response_times=True AND is_ours=True
            if unit_info['counts_for_response_times'] and unit_info['is_ours']:
                included_units.append(canonical_id)
                metric_units.append({
                    'unit_id': canonical_id,
                    'time_dispatched': ut.get('time_dispatched'),
                    'time_enroute': ut.get('time_enroute'),
                    'time_arrived': ut.get('time_arrived'),
                })
            else:
                excluded_units.append(canonical_id)
        
        # Calculate time_dispatched from metric units (earliest dispatch of OUR units)
        dispatch_times_from_units = []
        for mu in metric_units:
            if mu.get('time_dispatched'):
                dt = build_datetime_with_midnight_crossing(incident_date, mu['time_dispatched'], dispatch_time_str)
                if dt:
                    dispatch_times_from_units.append(dt)
        if dispatch_times_from_units:
            new_values['time_dispatched'] = min(dispatch_times_from_units)
        
        # Calculate first_enroute from metric units
        enroute_times = []
        for mu in metric_units:
            if mu['time_enroute']:
                dt = build_datetime_with_midnight_crossing(incident_date, mu['time_enroute'], dispatch_time_str)
                if dt:
                    enroute_times.append(dt)
        if enroute_times:
            new_values['time_first_enroute'] = min(enroute_times)
        
        # Calculate first_on_scene from metric units
        arrive_times = []
        for mu in metric_units:
            if mu['time_arrived']:
                dt = build_datetime_with_midnight_crossing(incident_date, mu['time_arrived'], dispatch_time_str)
                if dt:
                    arrive_times.append(dt)
        if arrive_times:
            new_values['time_first_on_scene'] = min(arrive_times)
        
        # Calculate last_cleared from OUR units only (not mutual aid)
        cleared_times = []
        for ut in unit_times:
            unit_id = ut.get('unit_id')
            if not unit_id:
                continue
            unit_info = get_full_unit_info(db, unit_id)
            # Only include our units (not mutual aid)
            if unit_info['is_ours'] and ut.get('time_at_quarters'):
                dt = build_datetime_with_midnight_crossing(incident_date, ut['time_at_quarters'], dispatch_time_str)
                if dt:
                    cleared_times.append(dt)
        if cleared_times:
            new_values['time_last_cleared'] = max(cleared_times)
    
    # ==========================================================================
    # COMPARE CURRENT vs NEW - BUILD FIELD CHANGES LIST
    # ==========================================================================
    
    field_changes = []
    
    def format_time(val):
        """Format datetime as ISO with Z suffix so frontend knows it's UTC"""
        if val is None:
            return None
        if hasattr(val, 'isoformat'):
            # Ensure we return ISO format with Z suffix for UTC
            iso = val.isoformat()
            if not iso.endswith('Z') and '+' not in iso:
                iso += 'Z'
            return iso
        return str(val)
    
    def times_differ(current, new):
        """Check if two time values differ (handling None and timezone)"""
        if current is None and new is None:
            return False
        if current is None or new is None:
            return True
        # Strip timezone for comparison
        c = current.replace(tzinfo=None) if hasattr(current, 'replace') else current
        n = new.replace(tzinfo=None) if hasattr(new, 'replace') else new
        return abs((c - n).total_seconds()) > 1
    
    # Check time fields - these are the critical ones
    time_fields = ['time_dispatched', 'time_first_enroute', 'time_first_on_scene', 'time_last_cleared']
    for field in time_fields:
        current = current_values[field]
        new = new_values[field]
        if times_differ(current, new):
            field_changes.append({
                'field': field,
                'current': format_time(current),
                'will_be': format_time(new),
                'display': f"{field}: {format_time(current) or 'NULL'} → {format_time(new) or 'NULL'}"
            })
    
    # Check text fields
    text_fields = ['address', 'municipality_code', 'cross_streets', 'cad_event_type', 'cad_event_subtype']
    for field in text_fields:
        current = current_values[field]
        new = new_values[field]
        if current != new and new is not None:  # Only show if CAD has a value
            field_changes.append({
                'field': field,
                'current': current,
                'will_be': new,
                'display': f"{field}: '{current}' → '{new}'"
            })
    
    # ==========================================================================
    # CHECK UNIT CONFIG CHANGES
    # ==========================================================================
    
    unit_config_changes = []
    
    for ut in unit_times:
        unit_id = ut.get('unit_id')
        if not unit_id:
            continue
        
        unit_info = get_full_unit_info(db, unit_id)
        new_is_mutual_aid = not unit_info['is_ours']
        new_counts = unit_info['counts_for_response_times']
        canonical_id = unit_info['unit_designator'] or unit_id
        
        # Find existing unit config
        old_unit = next((u for u in existing_cad_units 
                        if u.get('unit_id') == unit_id or u.get('unit_id') == canonical_id), None)
        
        if old_unit:
            old_ma = old_unit.get('is_mutual_aid')
            old_counts = old_unit.get('counts_for_response_times')
            
            if old_ma != new_is_mutual_aid:
                unit_config_changes.append({
                    'unit_id': canonical_id,
                    'field': 'is_mutual_aid',
                    'current': old_ma,
                    'will_be': new_is_mutual_aid,
                    'display': f"{canonical_id}: is_mutual_aid {old_ma} → {new_is_mutual_aid}"
                })
            
            if old_counts != new_counts:
                unit_config_changes.append({
                    'unit_id': canonical_id,
                    'field': 'counts_for_response_times',
                    'current': old_counts,
                    'will_be': new_counts,
                    'display': f"{canonical_id}: counts_for_response_times {old_counts} → {new_counts}"
                })
        else:
            unit_config_changes.append({
                'unit_id': canonical_id,
                'field': 'new_unit',
                'current': None,
                'will_be': {'is_mutual_aid': new_is_mutual_aid, 'counts_for_response_times': new_counts},
                'display': f"{canonical_id}: NEW UNIT (MA={new_is_mutual_aid}, counts={new_counts})"
            })
    
    # ==========================================================================
    # BUILD RESPONSE
    # ==========================================================================
    
    return {
        "incident_id": incident_id,
        "incident_number": incident_number,
        "incident_date": incident_date.isoformat() if incident_date else None,
        "source": "clear_report" if raw_clear else "dispatch_report",
        
        # Summary counts for UI
        "changes_summary": {
            "field_changes": len(field_changes),
            "unit_config_changes": len(unit_config_changes),
            "total_changes": len(field_changes) + len(unit_config_changes),
        },
        
        # Detailed changes
        "field_changes": field_changes,
        "unit_config_changes": unit_config_changes,
        
        # Response time calculation info
        "response_calculation": {
            "included_units": included_units,
            "excluded_units": excluded_units,
            "note": "Included units have counts_for_response_times=True and is_mutual_aid=False"
        },
        
        # Raw unit times from CAD (for reference)
        "unit_times": unit_times,
    }


# =============================================================================
# EXPORT ENDPOINTS
# =============================================================================

@router.get("/cad-export")
async def export_cad_data(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Export raw CAD data as JSON."""
    
    if year:
        date_filter = "year_prefix = :year"
        params = {"year": year}
    elif start_date and end_date:
        date_filter = "COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date"
        params = {"start_date": start_date, "end_date": end_date}
    else:
        year = datetime.now().year
        date_filter = "year_prefix = :year"
        params = {"year": year}
    
    result = db.execute(text(f"""
        SELECT 
            id, internal_incident_number, call_category, cad_event_number, cad_event_type,
            incident_date, address, municipality_code,
            time_dispatched, time_first_enroute, time_first_on_scene,
            time_last_cleared,
            cad_raw_dispatch, cad_raw_updates, cad_raw_clear,
            created_at, updated_at
        FROM incidents
        WHERE {date_filter} AND deleted_at IS NULL
        ORDER BY incident_date ASC, created_at ASC
    """), params)
    
    incidents = []
    for row in result:
        incidents.append({
            "id": row[0],
            "internal_incident_number": row[1],
            "call_category": row[2],
            "cad_event_number": row[3],
            "cad_event_type": row[4],
            "incident_date": row[5].isoformat() if row[5] else None,  # DATE only, no Z needed
            "address": row[6],
            "municipality_code": row[7],
            "time_dispatched": format_utc_iso(row[8]),
            "time_first_enroute": format_utc_iso(row[9]),
            "time_first_on_scene": format_utc_iso(row[10]),
            "time_last_cleared": format_utc_iso(row[11]),
            "cad_raw_dispatch": row[12],
            "cad_raw_updates": row[13] or [],
            "cad_raw_clear": row[14],
            "created_at": format_utc_iso(row[15]),
            "updated_at": format_utc_iso(row[16]),
        })
    
    return {
        "export_date": datetime.now().isoformat(),
        "export_type": "cad_data",
        "filter": {
            "year": year,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
        },
        "incident_count": len(incidents),
        "incidents": incidents
    }


@router.get("/cad-export/download")
async def download_cad_export(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Download CAD export as JSON file."""
    
    data = await export_cad_data(start_date, end_date, year, db)
    
    json_str = json.dumps(data, indent=2)
    buffer = io.BytesIO(json_str.encode('utf-8'))
    
    if year:
        filename = f"cad_export_{year}.json"
    elif start_date and end_date:
        filename = f"cad_export_{start_date}_{end_date}.json"
    else:
        filename = f"cad_export_{datetime.now().strftime('%Y%m%d')}.json"
    
    return StreamingResponse(
        buffer,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/full-export")
async def export_full_incidents(
    year: int = Query(...),
    db: Session = Depends(get_db)
):
    """Export complete incident data for a year."""
    
    incidents_result = db.execute(text("""
        SELECT * FROM incidents 
        WHERE year_prefix = :year AND deleted_at IS NULL
        ORDER BY internal_incident_number
    """), {"year": year})
    
    incidents = []
    columns = incidents_result.keys()
    
    for row in incidents_result:
        incident_dict = {}
        for i, col in enumerate(columns):
            val = row[i]
            # Use format_utc_iso for datetime fields, regular isoformat for date fields
            if hasattr(val, 'isoformat'):
                if hasattr(val, 'hour'):  # It's a datetime, not a date
                    val = format_utc_iso(val)
                else:  # It's a date
                    val = val.isoformat()
            incident_dict[col] = val
        
        incident_id = incident_dict['id']
        
        # Get personnel
        personnel_result = db.execute(text("""
            SELECT ip.id, ip.incident_id, ip.incident_unit_id, ip.personnel_id,
                   ip.personnel_first_name, ip.personnel_last_name, 
                   ip.rank_name_snapshot, ip.role, ip.slot_index,
                   COALESCE(a.unit_designator, iu.cad_unit_id) as unit_designator
            FROM incident_personnel ip
            LEFT JOIN incident_units iu ON ip.incident_unit_id = iu.id
            LEFT JOIN apparatus a ON iu.apparatus_id = a.id
            WHERE ip.incident_id = :incident_id
        """), {"incident_id": incident_id})
        
        personnel = []
        for prow in personnel_result:
            personnel.append({
                "personnel_id": prow[3],
                "first_name": prow[4],
                "last_name": prow[5],
                "rank": prow[6],
                "role": prow[7],
                "slot_index": prow[8],
                "unit_designator": prow[9]
            })
        incident_dict['personnel_assignments'] = personnel
        
        # Get units
        units_result = db.execute(text("""
            SELECT * FROM incident_units WHERE incident_id = :incident_id
        """), {"incident_id": incident_id})
        
        units = []
        unit_cols = units_result.keys()
        for urow in units_result:
            unit_dict = {}
            for i, col in enumerate(unit_cols):
                val = urow[i]
                # Use format_utc_iso for datetime fields
                if hasattr(val, 'isoformat'):
                    if hasattr(val, 'hour'):  # It's a datetime
                        val = format_utc_iso(val)
                    else:  # It's a date
                        val = val.isoformat()
                unit_dict[col] = val
            units.append(unit_dict)
        incident_dict['units'] = units
        
        incidents.append(incident_dict)
    
    return {
        "export_date": datetime.now().isoformat(),
        "export_type": "full_incidents",
        "year": year,
        "incident_count": len(incidents),
        "incidents": incidents
    }


@router.get("/full-export/download")
async def download_full_export(
    year: int = Query(...),
    db: Session = Depends(get_db)
):
    """Download full incident export as JSON file."""
    
    data = await export_full_incidents(year, db)
    
    json_str = json.dumps(data, indent=2, default=str)
    buffer = io.BytesIO(json_str.encode('utf-8'))
    
    return StreamingResponse(
        buffer,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=incidents_full_export_{year}.json"}
    )
