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
import json
import io
import os
import sys

from database import get_db

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


def get_unit_response_config(db: Session, unit_id: str) -> Dict[str, Any]:
    """
    Look up unit configuration from apparatus table.
    Returns dict with counts_for_response_times flag.
    
    This matches the logic in settings_helper.get_unit_info()
    """
    if not unit_id:
        return {'counts_for_response_times': False, 'found': False}
    
    result = db.execute(text("""
        SELECT id, unit_category, counts_for_response_times 
        FROM apparatus 
        WHERE (UPPER(cad_unit_id) = :unit_id OR UPPER(unit_designator) = :unit_id)
          AND active = true
        LIMIT 1
    """), {"unit_id": unit_id.upper()}).fetchone()
    
    if result:
        return {
            'apparatus_id': result[0],
            'unit_category': result[1],
            'counts_for_response_times': result[2] if result[2] is not None else True,
            'found': True
        }
    
    # Unknown unit (probably mutual aid) - default to counting
    return {'counts_for_response_times': True, 'found': False}


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
    
    Args:
        base_date: date object or YYYY-MM-DD string
        time_str: HH:MM:SS time string from CAD
        dispatch_time_str: HH:MM:SS dispatch time for reference
    
    Returns:
        datetime object or None
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
    
    return datetime.combine(result_date, dt_time(hours, minutes, seconds))


def calculate_response_times_from_units(
    unit_times: List[Dict], 
    incident_date, 
    dispatch_time_str: str, 
    db: Session
) -> Dict[str, Any]:
    """
    Calculate first_enroute and first_on_scene from per-unit times,
    only including units where counts_for_response_times=true.
    
    This matches the logic in cad_listener._handle_clear()
    
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
        
        # Look up if this unit counts for response times
        unit_config = get_unit_response_config(db, unit_id)
        
        if not unit_config['counts_for_response_times']:
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
# REPARSE / DIAGNOSE ENDPOINTS
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
            time_last_cleared, time_in_service,
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
            'time_in_service': row[7],
        }
        raw_dispatch = row[8]
        raw_clear = row[9]
        
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
        # This is the KEY FIX - we filter by counts_for_response_times
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
        
        # Check cleared/in-service times
        for field, cad_key in [
            ('time_last_cleared', 'last_available'),
            ('time_in_service', 'last_at_quarters'),
        ]:
            cad_time_str = report_dict.get(cad_key)
            if cad_time_str:
                expected = build_datetime_with_midnight_crossing(
                    incident_date, cad_time_str, dispatch_time_str
                )
                stored = stored_times[field]
                
                if expected:
                    if stored is None:
                        incident_issues.append({
                            "field": field,
                            "issue": "MISSING",
                            "stored": None,
                            "expected": expected.isoformat(),
                            "cad_time": cad_time_str
                        })
                    else:
                        stored_dt = stored.replace(tzinfo=None) if hasattr(stored, 'replace') else stored
                        if abs((stored_dt - expected).total_seconds()) > 1:
                            incident_issues.append({
                                "field": field,
                                "issue": "TIME_MISMATCH",
                                "stored": stored_dt.isoformat(),
                                "expected": expected.isoformat(),
                                "cad_time": cad_time_str
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


@router.post("/fix-times/{incident_id}")
async def fix_incident_times(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Fix time issues for a specific incident by re-parsing CAD data,
    applying midnight crossing logic, and using counts_for_response_times rules.
    """
    try:
        parse_cad_html, report_to_dict = get_cad_parser()
    except ImportError as e:
        return {"error": f"CAD parser not available: {e}"}
    
    # Get incident
    result = db.execute(text("""
        SELECT 
            id, internal_incident_number, incident_date,
            cad_raw_dispatch, cad_raw_clear
        FROM incidents 
        WHERE id = :id AND deleted_at IS NULL
    """), {"id": incident_id}).fetchone()
    
    if not result:
        return {"error": "Incident not found"}
    
    incident_number = result[1]
    incident_date = result[2]
    raw_html = result[4] or result[3]  # Prefer clear report
    
    if not raw_html:
        return {"error": "No raw CAD HTML stored"}
    
    if not incident_date:
        return {"error": "No incident_date set - cannot calculate times"}
    
    parsed = parse_cad_html(raw_html)
    if not parsed:
        return {"error": "Failed to parse stored HTML"}
    
    report_dict = report_to_dict(parsed)
    
    dispatch_time_str = report_dict.get('first_dispatch') or report_dict.get('dispatch_time')
    
    update_fields = {}
    fixed_fields = []
    
    # Fix dispatch time
    if dispatch_time_str:
        new_dispatch = build_datetime_with_midnight_crossing(
            incident_date, dispatch_time_str, dispatch_time_str
        )
        if new_dispatch:
            update_fields['time_dispatched'] = new_dispatch
            fixed_fields.append('time_dispatched')
    
    # Fix first_enroute and first_on_scene using per-unit times
    unit_times = report_dict.get('unit_times', [])
    excluded_units = []
    included_units = []
    
    if unit_times:
        response_times = calculate_response_times_from_units(
            unit_times, incident_date, dispatch_time_str, db
        )
        
        if response_times['time_first_enroute']:
            update_fields['time_first_enroute'] = response_times['time_first_enroute']
            fixed_fields.append('time_first_enroute')
        
        if response_times['time_first_on_scene']:
            update_fields['time_first_on_scene'] = response_times['time_first_on_scene']
            fixed_fields.append('time_first_on_scene')
        
        excluded_units = response_times['excluded_units']
        included_units = response_times['included_units']
    
    # Fix cleared/in-service times
    for field, cad_key in [
        ('time_last_cleared', 'last_available'),
        ('time_in_service', 'last_at_quarters'),
    ]:
        cad_time_str = report_dict.get(cad_key)
        if cad_time_str:
            new_dt = build_datetime_with_midnight_crossing(
                incident_date, cad_time_str, dispatch_time_str
            )
            if new_dt:
                update_fields[field] = new_dt
                fixed_fields.append(field)
    
    if not update_fields:
        return {"message": "No time fields to fix", "incident_id": incident_id}
    
    # Execute update
    set_clauses = ", ".join([f"{k} = :{k}" for k in update_fields.keys()])
    update_fields['id'] = incident_id
    
    db.execute(text(f"""
        UPDATE incidents 
        SET {set_clauses}, updated_at = NOW()
        WHERE id = :id
    """), update_fields)
    db.commit()
    
    return {
        "success": True,
        "incident_id": incident_id,
        "incident_number": incident_number,
        "fixed_fields": fixed_fields,
        "included_units": included_units,
        "excluded_units": excluded_units,
        "new_values": {
            k: v.isoformat() if hasattr(v, 'isoformat') else v 
            for k, v in update_fields.items() if k != 'id'
        }
    }


@router.post("/fix-all-times")
async def fix_all_incident_times(
    year: int = Query(None),
    dry_run: bool = Query(True),
    db: Session = Depends(get_db)
):
    """
    Fix time issues for all incidents in a year.
    
    Args:
        year: Year to process (defaults to current year)
        dry_run: If True, only report what would be fixed without making changes
    
    Returns summary of fixes made (or that would be made).
    """
    try:
        parse_cad_html, report_to_dict = get_cad_parser()
    except ImportError as e:
        return {"error": f"CAD parser not available: {e}"}
    
    if not year:
        year = datetime.now().year
    
    result = db.execute(text("""
        SELECT 
            id, internal_incident_number, incident_date,
            time_dispatched, time_first_enroute, time_first_on_scene,
            time_last_cleared, time_in_service,
            cad_raw_dispatch, cad_raw_clear
        FROM incidents 
        WHERE year_prefix = :year AND deleted_at IS NULL
        ORDER BY incident_date, internal_incident_number
    """), {"year": year})
    
    fixes = []
    processed = 0
    skipped = 0
    
    for row in result:
        inc_id = row[0]
        incident_number = row[1]
        incident_date = row[2]
        stored_times = {
            'time_dispatched': row[3],
            'time_first_enroute': row[4],
            'time_first_on_scene': row[5],
            'time_last_cleared': row[6],
            'time_in_service': row[7],
        }
        raw_html = row[9] or row[8]  # Prefer clear report
        
        if not raw_html or not incident_date:
            skipped += 1
            continue
        
        parsed = parse_cad_html(raw_html)
        if not parsed:
            skipped += 1
            continue
        
        report_dict = report_to_dict(parsed)
        processed += 1
        
        dispatch_time_str = report_dict.get('first_dispatch') or report_dict.get('dispatch_time')
        
        update_fields = {}
        changes = []
        
        # Check dispatch time
        if dispatch_time_str:
            expected = build_datetime_with_midnight_crossing(
                incident_date, dispatch_time_str, dispatch_time_str
            )
            stored = stored_times['time_dispatched']
            if expected:
                needs_update = False
                if stored is None:
                    needs_update = True
                else:
                    stored_dt = stored.replace(tzinfo=None) if hasattr(stored, 'replace') else stored
                    if abs((stored_dt - expected).total_seconds()) > 1:
                        needs_update = True
                
                if needs_update:
                    update_fields['time_dispatched'] = expected
                    changes.append({
                        "field": "time_dispatched",
                        "old": stored.isoformat() if stored else None,
                        "new": expected.isoformat()
                    })
        
        # Check first_enroute and first_on_scene using per-unit times
        unit_times = report_dict.get('unit_times', [])
        if unit_times:
            response_times = calculate_response_times_from_units(
                unit_times, incident_date, dispatch_time_str, db
            )
            
            # Check first_enroute
            expected = response_times['time_first_enroute']
            stored = stored_times['time_first_enroute']
            if expected:
                needs_update = False
                if stored is None:
                    needs_update = True
                else:
                    stored_dt = stored.replace(tzinfo=None) if hasattr(stored, 'replace') else stored
                    if abs((stored_dt - expected).total_seconds()) > 1:
                        needs_update = True
                
                if needs_update:
                    update_fields['time_first_enroute'] = expected
                    changes.append({
                        "field": "time_first_enroute",
                        "old": stored.isoformat() if stored else None,
                        "new": expected.isoformat(),
                        "excluded_units": response_times['excluded_units'],
                    })
            
            # Check first_on_scene
            expected = response_times['time_first_on_scene']
            stored = stored_times['time_first_on_scene']
            if expected:
                needs_update = False
                if stored is None:
                    needs_update = True
                else:
                    stored_dt = stored.replace(tzinfo=None) if hasattr(stored, 'replace') else stored
                    if abs((stored_dt - expected).total_seconds()) > 1:
                        needs_update = True
                
                if needs_update:
                    update_fields['time_first_on_scene'] = expected
                    changes.append({
                        "field": "time_first_on_scene",
                        "old": stored.isoformat() if stored else None,
                        "new": expected.isoformat(),
                        "excluded_units": response_times['excluded_units'],
                    })
        
        # Check cleared/in-service times
        for field, cad_key in [
            ('time_last_cleared', 'last_available'),
            ('time_in_service', 'last_at_quarters'),
        ]:
            cad_time_str = report_dict.get(cad_key)
            if cad_time_str:
                expected = build_datetime_with_midnight_crossing(
                    incident_date, cad_time_str, dispatch_time_str
                )
                stored = stored_times[field]
                if expected:
                    needs_update = False
                    if stored is None:
                        needs_update = True
                    else:
                        stored_dt = stored.replace(tzinfo=None) if hasattr(stored, 'replace') else stored
                        if abs((stored_dt - expected).total_seconds()) > 1:
                            needs_update = True
                    
                    if needs_update:
                        update_fields[field] = expected
                        changes.append({
                            "field": field,
                            "old": stored.isoformat() if stored else None,
                            "new": expected.isoformat()
                        })
        
        if update_fields:
            if not dry_run:
                set_clauses = ", ".join([f"{k} = :{k}" for k in update_fields.keys()])
                update_fields['id'] = inc_id
                db.execute(text(f"""
                    UPDATE incidents SET {set_clauses}, updated_at = NOW() WHERE id = :id
                """), update_fields)
            
            fixes.append({
                "incident_id": inc_id,
                "incident_number": incident_number,
                "changes": changes
            })
    
    if not dry_run:
        db.commit()
    
    return {
        "dry_run": dry_run,
        "year": year,
        "processed": processed,
        "skipped": skipped,
        "incidents_with_fixes": len(fixes),
        "total_field_fixes": sum(len(f["changes"]) for f in fixes),
        "fixes": fixes
    }


# =============================================================================
# RESTORE FROM CAD
# =============================================================================

@router.post("/restore-from-cad/{incident_id}")
async def restore_incident_from_cad(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Restore incident fields from stored raw CAD HTML.
    
    Restores: address, municipality, event type, cross streets, and times.
    Keeps: internal_incident_number, call_category, personnel, NERIS codes, notes.
    
    Uses counts_for_response_times rules for first_enroute/first_on_scene.
    """
    try:
        parse_cad_html, report_to_dict = get_cad_parser()
    except ImportError as e:
        return {"error": f"CAD parser not available: {e}"}
    
    # Get the incident
    result = db.execute(text("""
        SELECT 
            id, internal_incident_number, incident_date,
            cad_raw_dispatch, cad_raw_clear
        FROM incidents 
        WHERE id = :id AND deleted_at IS NULL
    """), {"id": incident_id}).fetchone()
    
    if not result:
        return {"error": "Incident not found", "incident_id": incident_id}
    
    incident_number = result[1]
    incident_date = result[2]
    raw_dispatch = result[3]
    raw_clear = result[4]
    
    # Prefer clear report (has all times), fall back to dispatch
    raw_html = raw_clear or raw_dispatch
    
    if not raw_html:
        return {"error": "No raw CAD HTML stored for this incident", "incident_id": incident_id}
    
    parsed = parse_cad_html(raw_html)
    if not parsed:
        return {"error": "Failed to parse stored HTML", "incident_id": incident_id}
    
    report_dict = report_to_dict(parsed)
    
    update_fields = {}
    restored_fields = []
    
    # Restore text fields
    text_field_mapping = {
        'address': 'address',
        'municipality': 'municipality_code',
        'cross_streets': 'cross_streets',
        'event_type': 'cad_event_type',
        'event_subtype': 'cad_event_subtype',
    }
    
    for src_field, dest_field in text_field_mapping.items():
        value = report_dict.get(src_field)
        if value:
            update_fields[dest_field] = value
            restored_fields.append(dest_field)
    
    # Restore time fields
    dispatch_time_str = report_dict.get('first_dispatch') or report_dict.get('dispatch_time')
    
    # Dispatch time
    if dispatch_time_str and incident_date:
        new_dispatch = build_datetime_with_midnight_crossing(
            incident_date, dispatch_time_str, dispatch_time_str
        )
        if new_dispatch:
            update_fields['time_dispatched'] = new_dispatch
            restored_fields.append('time_dispatched')
    
    # First enroute / first on scene - use per-unit times with filtering
    unit_times = report_dict.get('unit_times', [])
    excluded_units = []
    included_units = []
    
    if unit_times and incident_date:
        response_times = calculate_response_times_from_units(
            unit_times, incident_date, dispatch_time_str, db
        )
        
        if response_times['time_first_enroute']:
            update_fields['time_first_enroute'] = response_times['time_first_enroute']
            restored_fields.append('time_first_enroute')
        
        if response_times['time_first_on_scene']:
            update_fields['time_first_on_scene'] = response_times['time_first_on_scene']
            restored_fields.append('time_first_on_scene')
        
        excluded_units = response_times['excluded_units']
        included_units = response_times['included_units']
    
    # Cleared / in-service times
    for cad_key, dest_field in [
        ('last_available', 'time_last_cleared'),
        ('last_at_quarters', 'time_in_service'),
    ]:
        cad_time_str = report_dict.get(cad_key)
        if cad_time_str and incident_date:
            new_dt = build_datetime_with_midnight_crossing(
                incident_date, cad_time_str, dispatch_time_str
            )
            if new_dt:
                update_fields[dest_field] = new_dt
                restored_fields.append(dest_field)
    
    if not update_fields:
        return {"error": "No fields to restore from parsed HTML", "incident_id": incident_id}
    
    # Execute update
    set_clauses = ", ".join([f"{k} = :{k}" for k in update_fields.keys()])
    update_fields['id'] = incident_id
    
    db.execute(text(f"""
        UPDATE incidents 
        SET {set_clauses}, updated_at = NOW()
        WHERE id = :id
    """), update_fields)
    db.commit()
    
    return {
        "success": True,
        "incident_id": incident_id,
        "incident_number": incident_number,
        "source": "clear_report" if raw_clear else "dispatch_report",
        "restored_fields": restored_fields,
        "included_units": included_units,
        "excluded_units": excluded_units,
        "values": {
            k: v.isoformat() if hasattr(v, 'isoformat') else v 
            for k, v in update_fields.items() if k != 'id'
        }
    }


@router.get("/preview-restore/{incident_id}")
async def preview_restore_from_cad(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Preview what would be restored from CAD.
    Returns parsed CAD values and calculated response times.
    """
    try:
        parse_cad_html, report_to_dict = get_cad_parser()
    except ImportError as e:
        return {"error": f"CAD parser not available: {e}"}
    
    # Get the incident
    result = db.execute(text("""
        SELECT 
            id, internal_incident_number, incident_date,
            cad_raw_dispatch, cad_raw_clear
        FROM incidents 
        WHERE id = :id AND deleted_at IS NULL
    """), {"id": incident_id}).fetchone()
    
    if not result:
        return {"error": "Incident not found"}
    
    incident_date = result[2]
    raw_dispatch = result[3]
    raw_clear = result[4]
    raw_html = raw_clear or raw_dispatch
    
    if not raw_html:
        return {"error": "No raw CAD HTML stored"}
    
    parsed = parse_cad_html(raw_html)
    if not parsed:
        return {"error": "Failed to parse stored HTML"}
    
    report_dict = report_to_dict(parsed)
    
    dispatch_time_str = report_dict.get('first_dispatch') or report_dict.get('dispatch_time')
    
    # Calculate response times using per-unit data
    unit_times = report_dict.get('unit_times', [])
    response_calc = None
    if unit_times and incident_date:
        response_calc = calculate_response_times_from_units(
            unit_times, incident_date, dispatch_time_str, db
        )
    
    # Build CAD values dict for frontend comparison
    cad_values = {
        "address": report_dict.get('address'),
        "municipality_code": report_dict.get('municipality'),
        "cross_streets": report_dict.get('cross_streets'),
        "cad_event_type": report_dict.get('event_type'),
        "cad_event_subtype": report_dict.get('event_subtype'),
        # Time strings (HH:MM:SS) for display
        "time_dispatched": dispatch_time_str,
        "time_first_enroute": None,  # Calculated below
        "time_first_on_scene": None,  # Calculated below
        "time_last_cleared": report_dict.get('last_available'),
        "time_in_service": report_dict.get('last_at_quarters'),
    }
    
    # Add calculated response times (formatted)
    if response_calc:
        if response_calc['time_first_enroute']:
            cad_values['time_first_enroute'] = response_calc['time_first_enroute'].strftime('%H:%M:%S')
        if response_calc['time_first_on_scene']:
            cad_values['time_first_on_scene'] = response_calc['time_first_on_scene'].strftime('%H:%M:%S')
    
    return {
        "incident_id": incident_id,
        "incident_number": result[1],
        "incident_date": incident_date.isoformat() if incident_date else None,
        "source": "clear_report" if raw_clear else "dispatch_report",
        "cad_values": cad_values,
        "unit_times": unit_times,
        "response_calculation": {
            "included_units": response_calc['included_units'] if response_calc else [],
            "excluded_units": response_calc['excluded_units'] if response_calc else [],
        } if response_calc else None,
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
            time_last_cleared, time_in_service,
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
            "incident_date": row[5].isoformat() if row[5] else None,
            "address": row[6],
            "municipality_code": row[7],
            "time_dispatched": row[8].isoformat() if row[8] else None,
            "time_first_enroute": row[9].isoformat() if row[9] else None,
            "time_first_on_scene": row[10].isoformat() if row[10] else None,
            "time_last_cleared": row[11].isoformat() if row[11] else None,
            "time_in_service": row[12].isoformat() if row[12] else None,
            "cad_raw_dispatch": row[13],
            "cad_raw_updates": row[14] or [],
            "cad_raw_clear": row[15],
            "created_at": row[16].isoformat() if row[16] else None,
            "updated_at": row[17].isoformat() if row[17] else None,
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
            if hasattr(val, 'isoformat'):
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
                if hasattr(val, 'isoformat'):
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
