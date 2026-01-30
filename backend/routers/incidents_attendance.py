"""
Incident Attendance Routes - DETAIL Records
Extracted from incidents.py for maintainability.

Routes for meetings, worknights, training, drills, etc.
- POST /attendance - Create attendance record
- PUT /{incident_id}/attendance - Save attendance list
- GET /{incident_id}/attendance - Get attendance list
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import logging

from database import get_db
from models import Incident, IncidentPersonnel, Personnel, Rank
from schemas_incidents import AttendanceRecordCreate, AttendanceSave
from incident_helpers import log_incident_audit, claim_incident_number

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/attendance")
async def create_attendance_record(
    data: AttendanceRecordCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new attendance record (DETAIL category incident).
    Used for meetings, worknights, training, drills, etc.
    """
    # Parse incident date
    try:
        incident_date = datetime.strptime(data.incident_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    year_prefix = incident_date.year
    
    # Get next DETAIL number
    incident_number = claim_incident_number(db, year_prefix, 'DETAIL')
    
    # Generate a unique CAD event number for DETAIL records
    # Format: D{year}{seq} to avoid conflicts with real CAD numbers
    cad_event_number = incident_number  # Use incident number as CAD number for DETAIL
    
    # Default address to "Station 48" if not provided (tenant-configurable in future)
    address = data.address or "Station 48"
    
    incident = Incident(
        internal_incident_number=incident_number,
        year_prefix=year_prefix,
        call_category='DETAIL',
        detail_type=data.detail_type,
        status='CLOSED',  # Attendance records are created closed
        cad_event_number=cad_event_number,
        cad_event_type='DETAIL',
        cad_event_subtype=data.detail_type,
        address=address,
        incident_date=incident_date,
        time_event_start=data.time_event_start,
        time_event_end=data.time_event_end,
        narrative=data.narrative,
        completed_by=data.completed_by,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    
    db.add(incident)
    db.commit()
    db.refresh(incident)
    
    # Audit log
    log_incident_audit(
        db=db,
        action="CREATE",
        incident=incident,
        completed_by_id=data.completed_by,
        summary=f"Attendance record created: {data.detail_type}"
    )
    db.commit()
    
    logger.info(f"Created attendance record {incident_number} ({data.detail_type})")
    
    return {
        "id": incident.id,
        "internal_incident_number": incident_number,
        "call_category": "DETAIL",
        "detail_type": data.detail_type,
        "incident_date": incident_date.isoformat(),
    }


@router.put("/{incident_id}/attendance")
async def save_attendance(
    incident_id: int,
    data: AttendanceSave,
    edited_by: int = Query(None, description="Personnel ID of logged-in user"),
    db: Session = Depends(get_db)
):
    """
    Save attendance list for a DETAIL record.
    Personnel are stored in incident_personnel with incident_unit_id = NULL.
    """
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    if incident.call_category != 'DETAIL':
        raise HTTPException(status_code=400, detail="Attendance can only be saved for DETAIL records")
    
    # Clear existing attendance (personnel with NULL unit)
    db.query(IncidentPersonnel).filter(
        IncidentPersonnel.incident_id == incident_id,
        IncidentPersonnel.incident_unit_id.is_(None)
    ).delete()
    db.flush()
    
    # Add new attendance records
    added_count = 0
    for idx, personnel_id in enumerate(data.personnel_ids):
        person = db.query(Personnel).filter(Personnel.id == personnel_id).first()
        if not person:
            continue
        
        rank_name = "Unknown"
        if person.rank_id:
            rank = db.query(Rank).filter(Rank.id == person.rank_id).first()
            if rank:
                rank_name = rank.rank_name
        
        assignment = IncidentPersonnel(
            incident_id=incident_id,
            incident_unit_id=None,  # NULL = attendance, not incident response
            personnel_id=personnel_id,
            personnel_first_name=person.first_name,
            personnel_last_name=person.last_name,
            rank_id=person.rank_id,
            rank_name_snapshot=rank_name,
            slot_index=idx,
            assignment_source='ATTENDANCE',
        )
        db.add(assignment)
        added_count += 1
    
    # Audit log
    audit_user_id = edited_by or incident.completed_by
    log_incident_audit(
        db=db,
        action="UPDATE",
        incident=incident,
        completed_by_id=audit_user_id,
        summary=f"Attendance updated: {added_count} personnel"
    )
    
    incident.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {
        "status": "ok",
        "incident_id": incident_id,
        "attendance_count": added_count
    }


@router.get("/{incident_id}/attendance")
async def get_attendance(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Get attendance list for a DETAIL record.
    Returns personnel assigned with incident_unit_id = NULL.
    """
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Get attendance (personnel with NULL unit)
    attendance = db.query(IncidentPersonnel).filter(
        IncidentPersonnel.incident_id == incident_id,
        IncidentPersonnel.incident_unit_id.is_(None)
    ).order_by(IncidentPersonnel.slot_index).all()
    
    return {
        "incident_id": incident_id,
        "detail_type": getattr(incident, 'detail_type', None),
        "attendance_count": len(attendance),
        "personnel": [
            {
                "id": a.id,
                "personnel_id": a.personnel_id,
                "first_name": a.personnel_first_name,
                "last_name": a.personnel_last_name,
                "rank_name": a.rank_name_snapshot,
            }
            for a in attendance
        ]
    }
