"""
Backup router - Export CAD data and incident records
"""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from datetime import datetime, date, time as dt_time, timedelta
import json
import io

from database import get_db

router = APIRouter()


@router.get("/diagnose-times")
async def diagnose_incident_times(
    year: int = Query(None),
    incident_id: int = Query(None),
    db: Session = Depends(get_db)
):
    """
    Diagnose time/date issues in incidents by comparing stored values against CAD data.
    
    Checks:
    - Missing times that exist in CAD
    - Date discrepancies (wrong day due to midnight crossing logic)
    - Time discrepancies
    
    Returns list of issues found.
    """
    import sys
    sys.path.insert(0, '/opt/runsheet/cad')
    from cad_parser import parse_cad_html, report_to_dict
    
    # Build query filter
    if incident_id:
        filter_clause = "id = :incident_id"
        params = {"incident_id": incident_id}
    elif year:
        filter_clause = "year_prefix = :year"
        params = {"year": year}
    else:
        # Default to current year
        filter_clause = "year_prefix = :year"
        params = {"year": datetime.now().year}
    
    result = db.execute(text(f"""
        SELECT 
            id,
            internal_incident_number,
            incident_date,
            time_dispatched,
            time_first_enroute,
            time_first_on_scene,
            time_last_cleared,
            time_in_service,
            cad_raw_dispatch,
            cad_raw_clear
        FROM incidents 
        WHERE {filter_clause} AND deleted_at IS NULL
        ORDER BY incident_date, internal_incident_number
    """), params)
    
    def parse_time_parts(time_str):
        if not time_str:
            return None
        try:
            parts = time_str.split(':')
            if len(parts) >= 2:
                return (int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
        except ValueError:
            return None
        return None
    
    def build_expected_datetime(base_date, time_str, dispatch_time_str):
        """Build what the datetime SHOULD be based on CAD time and midnight crossing."""
        time_parts = parse_time_parts(time_str)
        if not time_parts or not base_date:
            return None
        
        hours, minutes, seconds = time_parts
        result_date = base_date
        
        if dispatch_time_str:
            dispatch_parts = parse_time_parts(dispatch_time_str)
            if dispatch_parts:
                disp_total = dispatch_parts[0] * 60 + dispatch_parts[1]
                this_total = hours * 60 + minutes
                if this_total < disp_total:
                    result_date = base_date + timedelta(days=1)
        
        return datetime.combine(result_date, dt_time(hours, minutes, seconds))
    
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
        
        # Map CAD fields to DB fields
        time_mapping = [
            ('time_dispatched', report_dict.get('first_dispatch') or report_dict.get('dispatch_time')),
            ('time_first_enroute', report_dict.get('first_enroute')),
            ('time_first_on_scene', report_dict.get('first_arrive')),
            ('time_last_cleared', report_dict.get('last_available')),
            ('time_in_service', report_dict.get('last_at_quarters')),
        ]
        
        incident_issues = []
        
        for db_field, cad_time_str in time_mapping:
            stored_val = stored_times[db_field]
            
            if cad_time_str:
                expected = build_expected_datetime(incident_date, cad_time_str, dispatch_time_str)
                
                if stored_val is None:
                    # CAD has time but DB doesn't
                    incident_issues.append({
                        "field": db_field,
                        "issue": "MISSING",
                        "stored": None,
                        "expected": expected.isoformat() if expected else None,
                        "cad_time": cad_time_str
                    })
                elif expected:
                    # Compare stored vs expected
                    # Normalize to compare (stored might have timezone info)
                    stored_dt = stored_val.replace(tzinfo=None) if hasattr(stored_val, 'replace') else stored_val
                    
                    # Check date mismatch
                    if stored_dt.date() != expected.date():
                        incident_issues.append({
                            "field": db_field,
                            "issue": "DATE_MISMATCH",
                            "stored": stored_dt.isoformat(),
                            "expected": expected.isoformat(),
                            "cad_time": cad_time_str,
                            "stored_date": stored_dt.date().isoformat(),
                            "expected_date": expected.date().isoformat()
                        })
                    # Check time mismatch (allowing 1 second tolerance for rounding)
                    elif abs((stored_dt - expected).total_seconds()) > 1:
                        incident_issues.append({
                            "field": db_field,
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
    Fix time/date issues for a specific incident by re-parsing CAD data
    and applying correct midnight crossing logic.
    
    This is essentially the same as restore-from-cad but only updates time fields.
    """
    import sys
    sys.path.insert(0, '/opt/runsheet/cad')
    from cad_parser import parse_cad_html, report_to_dict
    
    # Get incident
    result = db.execute(text("""
        SELECT 
            id,
            internal_incident_number,
            incident_date,
            cad_raw_dispatch,
            cad_raw_clear
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
    
    parsed = parse_cad_html(raw_html)
    if not parsed:
        return {"error": "Failed to parse stored HTML"}
    
    report_dict = report_to_dict(parsed)
    
    def parse_time_parts(time_str):
        if not time_str:
            return None
        try:
            parts = time_str.split(':')
            if len(parts) >= 2:
                return (int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
        except ValueError:
            return None
        return None
    
    def build_datetime(base_date, time_str, dispatch_time_str):
        time_parts = parse_time_parts(time_str)
        if not time_parts or not base_date:
            return None
        
        hours, minutes, seconds = time_parts
        result_date = base_date
        
        if dispatch_time_str:
            dispatch_parts = parse_time_parts(dispatch_time_str)
            if dispatch_parts:
                disp_total = dispatch_parts[0] * 60 + dispatch_parts[1]
                this_total = hours * 60 + minutes
                if this_total < disp_total:
                    result_date = base_date + timedelta(days=1)
        
        return datetime.combine(result_date, dt_time(hours, minutes, seconds))
    
    dispatch_time_str = report_dict.get('first_dispatch') or report_dict.get('dispatch_time')
    
    update_fields = {}
    fixed_fields = []
    
    time_mapping = [
        ('time_dispatched', report_dict.get('first_dispatch') or report_dict.get('dispatch_time')),
        ('time_first_enroute', report_dict.get('first_enroute')),
        ('time_first_on_scene', report_dict.get('first_arrive')),
        ('time_last_cleared', report_dict.get('last_available')),
        ('time_in_service', report_dict.get('last_at_quarters')),
    ]
    
    for db_field, cad_time_str in time_mapping:
        if cad_time_str:
            new_datetime = build_datetime(incident_date, cad_time_str, dispatch_time_str)
            if new_datetime:
                update_fields[db_field] = new_datetime
                fixed_fields.append(db_field)
    
    if not update_fields:
        return {"error": "No time fields to fix"}
    
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
        "new_values": {k: v.isoformat() if hasattr(v, 'isoformat') else v for k, v in update_fields.items() if k != 'id'}
    }


@router.post("/fix-all-times")
async def fix_all_incident_times(
    year: int = Query(None),
    dry_run: bool = Query(True),
    db: Session = Depends(get_db)
):
    """
    Fix time/date issues for all incidents in a year.
    
    Args:
        year: Year to process (defaults to current year)
        dry_run: If True, only report what would be fixed without making changes
    
    Returns summary of fixes made (or that would be made).
    """
    import sys
    sys.path.insert(0, '/opt/runsheet/cad')
    from cad_parser import parse_cad_html, report_to_dict
    
    if not year:
        year = datetime.now().year
    
    result = db.execute(text("""
        SELECT 
            id,
            internal_incident_number,
            incident_date,
            time_dispatched,
            time_first_enroute,
            time_first_on_scene,
            time_last_cleared,
            time_in_service,
            cad_raw_dispatch,
            cad_raw_clear
        FROM incidents 
        WHERE year_prefix = :year AND deleted_at IS NULL
        ORDER BY incident_date, internal_incident_number
    """), {"year": year})
    
    def parse_time_parts(time_str):
        if not time_str:
            return None
        try:
            parts = time_str.split(':')
            if len(parts) >= 2:
                return (int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
        except ValueError:
            return None
        return None
    
    def build_datetime(base_date, time_str, dispatch_time_str):
        time_parts = parse_time_parts(time_str)
        if not time_parts or not base_date:
            return None
        
        hours, minutes, seconds = time_parts
        result_date = base_date
        
        if dispatch_time_str:
            dispatch_parts = parse_time_parts(dispatch_time_str)
            if dispatch_parts:
                disp_total = dispatch_parts[0] * 60 + dispatch_parts[1]
                this_total = hours * 60 + minutes
                if this_total < disp_total:
                    result_date = base_date + timedelta(days=1)
        
        return datetime.combine(result_date, dt_time(hours, minutes, seconds))
    
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
        
        time_mapping = [
            ('time_dispatched', report_dict.get('first_dispatch') or report_dict.get('dispatch_time')),
            ('time_first_enroute', report_dict.get('first_enroute')),
            ('time_first_on_scene', report_dict.get('first_arrive')),
            ('time_last_cleared', report_dict.get('last_available')),
            ('time_in_service', report_dict.get('last_at_quarters')),
        ]
        
        update_fields = {}
        changes = []
        
        for db_field, cad_time_str in time_mapping:
            if cad_time_str:
                expected = build_datetime(incident_date, cad_time_str, dispatch_time_str)
                stored = stored_times[db_field]
                
                if expected:
                    needs_update = False
                    if stored is None:
                        needs_update = True
                    else:
                        stored_dt = stored.replace(tzinfo=None) if hasattr(stored, 'replace') else stored
                        if stored_dt != expected:
                            needs_update = True
                    
                    if needs_update:
                        update_fields[db_field] = expected
                        changes.append({
                            "field": db_field,
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


@router.post("/restore-from-cad/{incident_id}")
async def restore_incident_from_cad(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Restore incident fields from stored raw CAD HTML.
    Restores: address, municipality, event type, cross streets, and times.
    Keeps: internal_incident_number, call_category, personnel, NERIS codes, notes.
    """
    import sys
    sys.path.insert(0, '/opt/runsheet/cad')
    from cad_parser import parse_cad_html, report_to_dict
    
    # Get the incident with raw HTML and current times
    result = db.execute(text("""
        SELECT 
            id,
            internal_incident_number,
            incident_date,
            time_dispatched,
            time_first_enroute,
            time_first_on_scene,
            time_last_cleared,
            time_in_service,
            cad_raw_dispatch,
            cad_raw_clear
        FROM incidents 
        WHERE id = :id AND deleted_at IS NULL
    """), {"id": incident_id}).fetchone()
    
    if not result:
        return {"error": "Incident not found", "incident_id": incident_id}
    
    incident_number = result[1]
    incident_date = result[2]
    raw_dispatch = result[8]
    raw_clear = result[9]
    
    # Prefer clear report (has all times), fall back to dispatch
    raw_html = raw_clear or raw_dispatch
    
    if not raw_html:
        return {"error": "No raw CAD HTML stored for this incident", "incident_id": incident_id}
    
    # Re-parse the HTML
    parsed = parse_cad_html(raw_html)
    if not parsed:
        return {"error": "Failed to parse stored HTML", "incident_id": incident_id}
    
    report_dict = report_to_dict(parsed)
    
    # Non-time fields - direct copy
    text_field_mapping = {
        'address': 'address',
        'municipality': 'municipality_code',
        'cross_streets': 'cross_streets',
        'event_type': 'cad_event_type',
        'event_subtype': 'cad_event_subtype',
    }
    
    def parse_time_parts(time_str):
        """Parse HH:MM:SS or HH:MM string to (hours, minutes, seconds)"""
        if not time_str:
            return None
        try:
            parts = time_str.split(':')
            if len(parts) >= 2:
                hours = int(parts[0])
                minutes = int(parts[1])
                seconds = int(parts[2]) if len(parts) > 2 else 0
                return (hours, minutes, seconds)
        except ValueError:
            return None
        return None
    
    def build_datetime_with_midnight_crossing(base_date, time_str, dispatch_time_str):
        """
        Build datetime from date and time, handling midnight crossing (24-hour clock).
        If time is earlier than dispatch, it crossed midnight (add 1 day).
        """
        time_parts = parse_time_parts(time_str)
        if not time_parts or not base_date:
            return None
        
        hours, minutes, seconds = time_parts
        result_date = base_date
        
        # Check for midnight crossing (24-hour clock logic)
        if dispatch_time_str:
            dispatch_parts = parse_time_parts(dispatch_time_str)
            if dispatch_parts:
                disp_hours, disp_mins, _ = dispatch_parts
                disp_total = disp_hours * 60 + disp_mins
                this_total = hours * 60 + minutes
                
                # Simple rule: if this time < dispatch time, add 1 day
                # e.g., dispatch 23:07, cleared 00:15 -> next day
                if this_total < disp_total:
                    result_date = base_date + timedelta(days=1)
        
        return datetime.combine(result_date, dt_time(hours, minutes, seconds))
    
    update_fields = {}
    restored_fields = []
    
    # Restore text fields
    for src_field, dest_field in text_field_mapping.items():
        value = report_dict.get(src_field)
        if value:
            update_fields[dest_field] = value
            restored_fields.append(dest_field)
    
    # Restore time fields with midnight crossing logic
    # Note: Clear reports use first_dispatch, dispatch reports use dispatch_time
    dispatch_time_str = report_dict.get('first_dispatch') or report_dict.get('dispatch_time')
    
    # Map CAD fields to database fields
    time_field_mapping = [
        (report_dict.get('first_dispatch') or report_dict.get('dispatch_time'), 'time_dispatched'),
        (report_dict.get('first_enroute'), 'time_first_enroute'),
        (report_dict.get('first_arrive'), 'time_first_on_scene'),
        (report_dict.get('last_available'), 'time_last_cleared'),
        (report_dict.get('last_at_quarters'), 'time_in_service'),
    ]
    
    for cad_time_str, dest_field in time_field_mapping:
        if cad_time_str:
            new_datetime = build_datetime_with_midnight_crossing(incident_date, cad_time_str, dispatch_time_str)
            if new_datetime:
                update_fields[dest_field] = new_datetime
                restored_fields.append(dest_field)
    
    if not update_fields:
        return {"error": "No fields to restore from parsed HTML", "incident_id": incident_id}
    
    # Build and execute UPDATE
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
        "values": {k: v.isoformat() if hasattr(v, 'isoformat') else v for k, v in update_fields.items() if k != 'id'}
    }


@router.get("/preview-restore/{incident_id}")
async def preview_restore_from_cad(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Return parsed CAD values for frontend comparison.
    Frontend compares against current form state (not database).
    Returns raw time strings - frontend handles date logic with midnight crossing.
    """
    import sys
    sys.path.insert(0, '/opt/runsheet/cad')
    from cad_parser import parse_cad_html, report_to_dict
    
    # Get the incident's raw HTML and incident_date
    result = db.execute(text("""
        SELECT 
            id,
            internal_incident_number,
            incident_date,
            cad_raw_dispatch,
            cad_raw_clear
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
    
    # Return parsed CAD values - frontend does comparison
    # Time fields are raw strings (HH:MM:SS) - frontend applies date logic
    # Note: Clear reports use first_dispatch, dispatch reports use dispatch_time
    cad_values = {
        # Text fields
        "address": report_dict.get('address'),
        "municipality_code": report_dict.get('municipality'),
        "cross_streets": report_dict.get('cross_streets'),
        "cad_event_type": report_dict.get('event_type'),
        "cad_event_subtype": report_dict.get('event_subtype'),
        # Time fields - raw time strings (HH:MM:SS)
        "time_dispatched": report_dict.get('first_dispatch') or report_dict.get('dispatch_time'),
        "time_first_enroute": report_dict.get('first_enroute'),
        "time_first_on_scene": report_dict.get('first_arrive'),
        "time_last_cleared": report_dict.get('last_available'),
        "time_in_service": report_dict.get('last_at_quarters'),
    }
    
    return {
        "incident_id": incident_id,
        "incident_number": result[1],
        "incident_date": incident_date.isoformat() if incident_date else None,
        "source": "clear_report" if raw_clear else "dispatch_report",
        "cad_values": cad_values,
    }


@router.get("/cad-export")
async def export_cad_data(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Export raw CAD data as JSON.
    
    Use year OR start_date/end_date to filter.
    Returns all CAD HTML stored for each incident.
    """
    
    # Build date filter
    if year:
        date_filter = "year_prefix = :year"
        params = {"year": year}
    elif start_date and end_date:
        date_filter = "COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date"
        params = {"start_date": start_date, "end_date": end_date}
    else:
        # Default to current year
        year = datetime.now().year
        date_filter = "year_prefix = :year"
        params = {"year": year}
    
    result = db.execute(text(f"""
        SELECT 
            id,
            internal_incident_number,
            call_category,
            cad_event_number,
            cad_event_type,
            incident_date,
            address,
            municipality_code,
            time_dispatched,
            time_first_enroute,
            time_first_on_scene,
            time_last_cleared,
            time_in_service,
            cad_raw_dispatch,
            cad_raw_updates,
            cad_raw_clear,
            created_at,
            updated_at
        FROM incidents
        WHERE {date_filter}
          AND deleted_at IS NULL
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
    
    export_data = {
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
    
    return export_data


@router.get("/cad-export/download")
async def download_cad_export(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Download CAD export as JSON file"""
    
    data = await export_cad_data(start_date, end_date, year, db)
    
    # Create downloadable file
    json_str = json.dumps(data, indent=2)
    buffer = io.BytesIO(json_str.encode('utf-8'))
    
    # Generate filename
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
    """
    Export complete incident data for a year.
    Includes all fields, personnel assignments, and unit data.
    """
    
    # Get incidents
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
            # Convert datetime objects to ISO strings
            if hasattr(val, 'isoformat'):
                val = val.isoformat()
            incident_dict[col] = val
        
        incident_id = incident_dict['id']
        
        # Get personnel assignments
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
        
        # Get unit data
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
    """Download full incident export as JSON file"""
    
    data = await export_full_incidents(year, db)
    
    json_str = json.dumps(data, indent=2, default=str)
    buffer = io.BytesIO(json_str.encode('utf-8'))
    
    filename = f"incidents_full_export_{year}.json"
    
    return StreamingResponse(
        buffer,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
