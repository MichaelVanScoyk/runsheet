"""
Admin Reports Router

Unified endpoints for administrative PDF reports:
- Personnel activity (list + individual detail)
- Unit/apparatus activity (list + individual detail)
- Incident type breakdown (list + individual type detail)

All reports use the admin_reports engine for consistent branding and styling.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session
from datetime import date
from typing import Optional
import io

from database import get_db
from report_engine.branding_config import get_branding
from report_engine.admin_reports import (
    PersonnelListReport,
    PersonnelDetailReport,
    UnitsListReport,
    UnitsDetailReport,
    IncidentsListReport,
    IncidentTypeDetailReport,
)

router = APIRouter()


# =============================================================================
# PERSONNEL REPORTS
# =============================================================================

@router.get("/personnel")
async def get_personnel_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = Query(None, description="FIRE or EMS filter"),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db)
):
    """
    Get personnel activity report data (JSON).
    
    Supports category filter (Fire/EMS) at the list level.
    """
    branding = get_branding(db)
    report = PersonnelListReport(db, branding)
    
    return report.get_data(
        start_date=start_date,
        end_date=end_date,
        category=category,
        limit=limit
    )


@router.get("/personnel/html")
async def get_personnel_html(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db)
):
    """Get personnel activity report as HTML (for preview)."""
    branding = get_branding(db)
    report = PersonnelListReport(db, branding)
    
    html = report.generate_html(
        start_date=start_date,
        end_date=end_date,
        category=category,
        limit=limit
    )
    
    return HTMLResponse(content=html)


@router.get("/personnel/pdf")
async def get_personnel_pdf(
    start_date: date = Query(...),
    end_date: date = Query(...),
    category: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db)
):
    """Get personnel activity report as PDF."""
    branding = get_branding(db)
    report = PersonnelListReport(db, branding)
    
    pdf_bytes = report.generate_pdf(
        start_date=start_date,
        end_date=end_date,
        category=category,
        limit=limit
    )
    
    filename = report.get_pdf_filename(
        start_date=start_date,
        end_date=end_date,
        category=category
    )
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


@router.get("/personnel/{personnel_id}")
async def get_personnel_detail(
    personnel_id: int,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """
    Get individual personnel detail report data (JSON).
    
    Returns combined activity with Fire/EMS breakdown.
    """
    branding = get_branding(db)
    report = PersonnelDetailReport(db, branding)
    
    data = report.get_data(
        personnel_id=personnel_id,
        start_date=start_date,
        end_date=end_date
    )
    
    if data.get("error"):
        raise HTTPException(status_code=404, detail=data["error"])
    
    return data


@router.get("/personnel/{personnel_id}/pdf")
async def get_personnel_detail_pdf(
    personnel_id: int,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Get individual personnel detail report as PDF."""
    branding = get_branding(db)
    report = PersonnelDetailReport(db, branding)
    
    # Check if personnel exists
    data = report.get_data(
        personnel_id=personnel_id,
        start_date=start_date,
        end_date=end_date
    )
    
    if data.get("error"):
        raise HTTPException(status_code=404, detail=data["error"])
    
    pdf_bytes = report.generate_pdf(
        personnel_id=personnel_id,
        start_date=start_date,
        end_date=end_date
    )
    
    filename = report.get_pdf_filename(
        personnel_id=personnel_id,
        start_date=start_date,
        end_date=end_date
    )
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


# =============================================================================
# UNITS REPORTS
# =============================================================================

@router.get("/units")
async def get_units_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    include_virtual: bool = Query(False, description="Include DIRECT/STATION units"),
    db: Session = Depends(get_db)
):
    """
    Get units activity report data (JSON).
    
    Returns all units with Fire/EMS breakdown columns.
    No category filter - all data shown with breakdown.
    """
    branding = get_branding(db)
    report = UnitsListReport(db, branding)
    
    return report.get_data(
        start_date=start_date,
        end_date=end_date,
        include_virtual=include_virtual
    )


@router.get("/units/html")
async def get_units_html(
    start_date: date = Query(...),
    end_date: date = Query(...),
    include_virtual: bool = Query(False),
    db: Session = Depends(get_db)
):
    """Get units activity report as HTML (for preview)."""
    branding = get_branding(db)
    report = UnitsListReport(db, branding)
    
    html = report.generate_html(
        start_date=start_date,
        end_date=end_date,
        include_virtual=include_virtual
    )
    
    return HTMLResponse(content=html)


@router.get("/units/pdf")
async def get_units_pdf(
    start_date: date = Query(...),
    end_date: date = Query(...),
    include_virtual: bool = Query(False),
    db: Session = Depends(get_db)
):
    """Get units activity report as PDF."""
    branding = get_branding(db)
    report = UnitsListReport(db, branding)
    
    pdf_bytes = report.generate_pdf(
        start_date=start_date,
        end_date=end_date,
        include_virtual=include_virtual
    )
    
    filename = report.get_pdf_filename(
        start_date=start_date,
        end_date=end_date
    )
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


@router.get("/units/{unit_id}")
async def get_unit_detail(
    unit_id: int,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """
    Get individual unit detail report data (JSON).
    
    Returns comprehensive stats with Fire/EMS breakdown.
    """
    branding = get_branding(db)
    report = UnitsDetailReport(db, branding)
    
    data = report.get_data(
        unit_id=unit_id,
        start_date=start_date,
        end_date=end_date
    )
    
    if data.get("error"):
        raise HTTPException(status_code=404, detail=data["error"])
    
    return data


@router.get("/units/{unit_id}/pdf")
async def get_unit_detail_pdf(
    unit_id: int,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Get individual unit detail report as PDF."""
    branding = get_branding(db)
    report = UnitsDetailReport(db, branding)
    
    # Check if unit exists
    data = report.get_data(
        unit_id=unit_id,
        start_date=start_date,
        end_date=end_date
    )
    
    if data.get("error"):
        raise HTTPException(status_code=404, detail=data["error"])
    
    pdf_bytes = report.generate_pdf(
        unit_id=unit_id,
        start_date=start_date,
        end_date=end_date
    )
    
    filename = report.get_pdf_filename(
        unit_id=unit_id,
        start_date=start_date,
        end_date=end_date
    )
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


# =============================================================================
# INCIDENTS REPORTS
# =============================================================================

@router.get("/incidents")
async def get_incidents_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """
    Get incident type breakdown report data (JSON).
    
    Shows all incident types grouped by cad_event_type with subtypes.
    No category filter - types self-identify as Fire/EMS.
    """
    branding = get_branding(db)
    report = IncidentsListReport(db, branding)
    
    return report.get_data(
        start_date=start_date,
        end_date=end_date
    )


@router.get("/incidents/html")
async def get_incidents_html(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Get incident type breakdown report as HTML (for preview)."""
    branding = get_branding(db)
    report = IncidentsListReport(db, branding)
    
    html = report.generate_html(
        start_date=start_date,
        end_date=end_date
    )
    
    return HTMLResponse(content=html)


@router.get("/incidents/pdf")
async def get_incidents_pdf(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Get incident type breakdown report as PDF."""
    branding = get_branding(db)
    report = IncidentsListReport(db, branding)
    
    pdf_bytes = report.generate_pdf(
        start_date=start_date,
        end_date=end_date
    )
    
    filename = report.get_pdf_filename(
        start_date=start_date,
        end_date=end_date
    )
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


@router.get("/incidents/types/{incident_type}")
async def get_incident_type_detail(
    incident_type: str,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """
    Get detail report for a specific incident type (JSON).
    
    Shows subtype breakdown, geographic distribution, response times.
    """
    branding = get_branding(db)
    report = IncidentTypeDetailReport(db, branding)
    
    return report.get_data(
        incident_type=incident_type,
        start_date=start_date,
        end_date=end_date
    )


@router.get("/incidents/types/{incident_type}/pdf")
async def get_incident_type_detail_pdf(
    incident_type: str,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Get incident type detail report as PDF."""
    branding = get_branding(db)
    report = IncidentTypeDetailReport(db, branding)
    
    pdf_bytes = report.generate_pdf(
        incident_type=incident_type,
        start_date=start_date,
        end_date=end_date
    )
    
    filename = report.get_pdf_filename(
        incident_type=incident_type,
        start_date=start_date,
        end_date=end_date
    )
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )
