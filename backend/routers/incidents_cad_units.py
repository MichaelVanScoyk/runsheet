"""
Incident CAD Units Admin Editor
Admin-only endpoint for manually editing the CAD units cascade.

Handles two scenarios that dispatchers miss:
1. Unit arrived on scene but CAD didn't log the status (times missing)
2. Unit responded but was never acknowledged (unit missing entirely)

All edits are flagged with source=ADMIN_OVERRIDE so we always know
what came from CAD vs manual correction. Full audit trail.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import json
import logging

from database import get_db
from models import Incident, Personnel, AuditLog
from settings_helper import format_utc_iso

logger = logging.getLogger(__name__)
router = APIRouter()


# Time fields tracked per unit
UNIT_TIME_FIELDS = ['time_dispatched', 'time_enroute', 'time_arrived', 'time_available', 'time_cleared']


def _get_admin_personnel(db: Session, personnel_id: int) -> Personnel:
    """Verify personnel exists and is ADMIN role."""
    if not personnel_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    person = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not person:
        raise HTTPException(status_code=401, detail="Invalid user")
    if person.role != 'ADMIN':
        raise HTTPException(status_code=403, detail="Admin access required")
    return person


def _diff_cad_units(old_units: list, new_units: list) -> Dict[str, Any]:
    """
    Diff old vs new cad_units arrays.
    Returns structured changes for audit log.
    """
    changes = {
        'units_added': [],
        'units_removed': [],
        'times_modified': [],
    }
    
    old_by_id = {u.get('unit_id'): u for u in (old_units or [])}
    new_by_id = {u.get('unit_id'): u for u in (new_units or [])}
    
    # Added units
    for uid in new_by_id:
        if uid not in old_by_id:
            changes['units_added'].append(uid)
    
    # Removed units
    for uid in old_by_id:
        if uid not in new_by_id:
            changes['units_removed'].append(uid)
    
    # Modified times
    for uid in new_by_id:
        if uid in old_by_id:
            old_u = old_by_id[uid]
            new_u = new_by_id[uid]
            for tf in UNIT_TIME_FIELDS:
                old_val = old_u.get(tf)
                new_val = new_u.get(tf)
                if old_val != new_val:
                    changes['times_modified'].append({
                        'unit_id': uid,
                        'field': tf,
                        'old': old_val,
                        'new': new_val,
                    })
    
    return changes


def _recalculate_incident_times(cad_units: list) -> Dict[str, Any]:
    """
    Recalculate incident-level metric times from cad_units array.
    Mirrors the logic in cad_listener._handle_clear().
    
    Returns dict of {field: value} for incident-level time fields.
    """
    result = {
        'time_dispatched': None,
        'time_first_enroute': None,
        'time_first_on_scene': None,
        'time_last_cleared': None,
    }
    
    if not cad_units:
        return result
    
    # Metric units: counts_for_response_times=True AND is_mutual_aid=False
    metric_units = [u for u in cad_units
                    if u.get('counts_for_response_times') == True
                    and not u.get('is_mutual_aid', True)]
    
    # time_dispatched = earliest dispatch from metric units
    dispatch_times = [u['time_dispatched'] for u in metric_units if u.get('time_dispatched')]
    if dispatch_times:
        result['time_dispatched'] = min(dispatch_times)
    
    # time_first_enroute = earliest enroute from metric units
    enroute_times = [u['time_enroute'] for u in metric_units if u.get('time_enroute')]
    if enroute_times:
        result['time_first_enroute'] = min(enroute_times)
    
    # time_first_on_scene = earliest arrived from metric units
    arrive_times = [u['time_arrived'] for u in metric_units if u.get('time_arrived')]
    if arrive_times:
        result['time_first_on_scene'] = min(arrive_times)
    
    # time_last_cleared = latest cleared from OUR units only (not mutual aid)
    our_units = [u for u in cad_units if not u.get('is_mutual_aid', True)]
    cleared_times = [u['time_cleared'] for u in our_units if u.get('time_cleared')]
    if cleared_times:
        result['time_last_cleared'] = max(cleared_times)
    
    return result


def has_admin_overrides(cad_units: list) -> List[Dict[str, str]]:
    """
    Check if any units in cad_units have ADMIN_OVERRIDE source.
    Returns list of {unit_id, description} for each override found.
    """
    overrides = []
    if not cad_units:
        return overrides
    
    for unit in cad_units:
        source = unit.get('source')
        if source == 'ADMIN_OVERRIDE':
            overrides.append({
                'unit_id': unit.get('unit_id', 'unknown'),
                'description': 'Manually added unit',
            })
        elif source == 'ADMIN_TIMES_MODIFIED':
            overrides.append({
                'unit_id': unit.get('unit_id', 'unknown'),
                'description': 'Times manually modified',
            })
    
    return overrides


@router.put("/{incident_id}/cad-units")
async def update_cad_units(
    incident_id: int,
    cad_units: List[Dict[str, Any]],
    edited_by: int = Query(..., description="Personnel ID of admin making the edit"),
    db: Session = Depends(get_db)
):
    """
    Admin-only: Update CAD units cascade with manual corrections.
    
    Accepts the full cad_units array (modified by frontend).
    - Flags modified/added units with source markers
    - Recalculates incident-level metric times
    - Full audit trail with field-level diffs
    """
    # Verify admin
    admin = _get_admin_personnel(db, edited_by)
    admin_name = f"{admin.last_name}, {admin.first_name}"
    
    # Get incident
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    old_units = incident.cad_units or []
    
    # Diff changes for audit
    diff = _diff_cad_units(old_units, cad_units)
    
    # Check if anything actually changed
    has_changes = (
        diff['units_added'] or
        diff['units_removed'] or
        diff['times_modified']
    )
    
    if not has_changes:
        return {"status": "ok", "message": "No changes detected"}
    
    # Recalculate incident-level times from modified units
    new_times = _recalculate_incident_times(cad_units)
    
    # Track which incident-level times changed
    time_changes = {}
    old_times = {
        'time_dispatched': format_utc_iso(incident.time_dispatched),
        'time_first_enroute': format_utc_iso(incident.time_first_enroute),
        'time_first_on_scene': format_utc_iso(incident.time_first_on_scene),
        'time_last_cleared': format_utc_iso(incident.time_last_cleared),
    }
    for field, new_val in new_times.items():
        old_val = old_times.get(field)
        if old_val != new_val:
            time_changes[field] = {'old': old_val, 'new': new_val}
    
    # Apply updates
    incident.cad_units = cad_units
    
    # Apply recalculated times
    if new_times['time_dispatched']:
        incident.time_dispatched = new_times['time_dispatched']
    if new_times['time_first_enroute'] is not None:
        incident.time_first_enroute = new_times['time_first_enroute']
    if new_times['time_first_on_scene'] is not None:
        incident.time_first_on_scene = new_times['time_first_on_scene']
    if new_times['time_last_cleared'] is not None:
        incident.time_last_cleared = new_times['time_last_cleared']
    
    incident.updated_at = datetime.now(timezone.utc)
    
    # Build audit summary
    summary_parts = []
    if diff['units_added']:
        summary_parts.append(f"Added units: {', '.join(diff['units_added'])}")
    if diff['units_removed']:
        summary_parts.append(f"Removed units: {', '.join(diff['units_removed'])}")
    if diff['times_modified']:
        modified_units = list(set(m['unit_id'] for m in diff['times_modified']))
        summary_parts.append(f"Modified times on: {', '.join(modified_units)}")
    summary = "CAD units edited: " + "; ".join(summary_parts)
    
    # Build fields_changed for audit display
    fields_changed = {}
    for added_uid in diff['units_added']:
        fields_changed[f"Unit {added_uid}"] = {"old": None, "new": "Added manually"}
    for removed_uid in diff['units_removed']:
        fields_changed[f"Unit {removed_uid}"] = {"old": "Present", "new": "Removed"}
    for mod in diff['times_modified']:
        label = f"{mod['unit_id']} {mod['field'].replace('time_', '').replace('_', ' ')}"
        fields_changed[label] = {"old": mod['old'] or "—", "new": mod['new'] or "—"}
    for field, change in time_changes.items():
        display_field = field.replace('time_', '').replace('_', ' ').title()
        fields_changed[f"Incident {display_field}"] = change
    
    # Audit log
    audit_entry = AuditLog(
        personnel_id=edited_by,
        personnel_name=admin_name,
        action="CAD_OVERRIDE",
        entity_type="incident",
        entity_id=incident.id,
        entity_display=f"Incident {incident.internal_incident_number}",
        summary=summary,
        fields_changed=fields_changed,
    )
    db.add(audit_entry)
    
    db.commit()
    
    logger.info(f"ADMIN: CAD units edited on incident {incident.internal_incident_number} by {admin_name}: {summary}")
    
    return {
        "status": "ok",
        "incident_id": incident_id,
        "changes": diff,
        "recalculated_times": {k: v for k, v in new_times.items() if v is not None},
        "time_changes": time_changes,
    }


@router.get("/{incident_id}/cad-units/overrides")
async def check_cad_unit_overrides(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Check if an incident has any manual CAD unit overrides.
    Used by the Reparse button to warn before overwriting.
    """
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    overrides = has_admin_overrides(incident.cad_units or [])
    
    return {
        "incident_id": incident_id,
        "has_overrides": len(overrides) > 0,
        "overrides": overrides,
    }
