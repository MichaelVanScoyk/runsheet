"""
Reports router - Generate incident reports and statistics
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from typing import Optional, List
from datetime import datetime, date, timedelta
from pydantic import BaseModel
import json
import io

from database import get_db

router = APIRouter()


# =============================================================================
# REPORT SCHEMAS
# =============================================================================

class DateRangeParams(BaseModel):
    start_date: date
    end_date: date


class ReportSummary(BaseModel):
    total_incidents: int
    total_personnel_responses: int
    total_manhours: float
    avg_response_time_minutes: Optional[float]
    avg_on_scene_time_minutes: Optional[float]
    incidents_by_status: dict


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def calculate_manhours(db: Session, start_date: date, end_date: date) -> dict:
    """
    Calculate manhours for incidents in date range.
    Manhours = sum of (incident duration × personnel count) for each incident
    """
    result = db.execute(text("""
        WITH incident_durations AS (
            SELECT 
                i.id,
                i.internal_incident_number,
                COALESCE(i.incident_date, i.created_at::date) AS inc_date,
                -- Duration in hours: from dispatch to last_cleared or in_service
                EXTRACT(EPOCH FROM (
                    COALESCE(i.time_in_service, i.time_last_cleared, i.time_first_on_scene) - i.time_dispatched
                )) / 3600.0 AS duration_hours,
                -- Count personnel assignments
                (SELECT COUNT(*) FROM incident_personnel ip WHERE ip.incident_id = i.id) AS personnel_count
            FROM incidents i
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND i.time_dispatched IS NOT NULL
        )
        SELECT 
            COALESCE(SUM(duration_hours * personnel_count), 0) AS total_manhours,
            COALESCE(SUM(personnel_count), 0) AS total_responses,
            COUNT(*) AS incident_count,
            COALESCE(AVG(duration_hours), 0) AS avg_duration_hours
        FROM incident_durations
        WHERE duration_hours > 0 AND duration_hours < 24  -- Filter out bad data
    """), {"start_date": start_date, "end_date": end_date})
    
    row = result.fetchone()
    return {
        "total_manhours": round(float(row[0] or 0), 2),
        "total_responses": int(row[1] or 0),
        "incident_count": int(row[2] or 0),
        "avg_duration_hours": round(float(row[3] or 0), 2)
    }


def get_response_times(db: Session, start_date: date, end_date: date) -> dict:
    """Calculate average response times"""
    result = db.execute(text("""
        SELECT 
            AVG(EXTRACT(EPOCH FROM (time_first_enroute - time_dispatched)) / 60) AS avg_turnout,
            AVG(EXTRACT(EPOCH FROM (time_first_on_scene - time_dispatched)) / 60) AS avg_response,
            AVG(EXTRACT(EPOCH FROM (time_last_cleared - time_first_on_scene)) / 60) AS avg_on_scene
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
          AND time_dispatched IS NOT NULL
    """), {"start_date": start_date, "end_date": end_date})
    
    row = result.fetchone()
    return {
        "avg_turnout_minutes": round(float(row[0] or 0), 1) if row[0] else None,
        "avg_response_minutes": round(float(row[1] or 0), 1) if row[1] else None,
        "avg_on_scene_minutes": round(float(row[2] or 0), 1) if row[2] else None
    }


# =============================================================================
# REPORT ENDPOINTS
# =============================================================================

@router.get("/debug")
async def debug_incidents(
    db: Session = Depends(get_db)
):
    """Debug endpoint to check what incidents exist and their dates"""
    result = db.execute(text("""
        SELECT 
            id, 
            internal_incident_number, 
            incident_date,
            created_at::date as created_date,
            status,
            time_dispatched IS NOT NULL as has_dispatch_time,
            (SELECT COUNT(*) FROM incident_personnel ip WHERE ip.incident_id = incidents.id) as personnel_count
        FROM incidents
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 20
    """))
    
    incidents = []
    for row in result:
        incidents.append({
            "id": row[0],
            "number": row[1],
            "incident_date": str(row[2]) if row[2] else None,
            "created_date": str(row[3]) if row[3] else None,
            "status": row[4],
            "has_dispatch_time": row[5],
            "personnel_count": row[6]
        })
    
    return {
        "total_found": len(incidents),
        "incidents": incidents
    }


@router.get("/summary")
async def get_summary_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Get overall summary statistics for date range"""
    
    # Basic counts - use COALESCE to fall back to created_at if incident_date is null
    basic_stats = db.execute(text("""
        SELECT 
            COUNT(*) AS total_incidents,
            COUNT(CASE WHEN status = 'OPEN' THEN 1 END) AS open_count,
            COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) AS closed_count,
            COUNT(CASE WHEN status = 'SUBMITTED' THEN 1 END) AS submitted_count
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
    """), {"start_date": start_date, "end_date": end_date}).fetchone()
    
    # Manhours
    manhours = calculate_manhours(db, start_date, end_date)
    
    # Response times
    times = get_response_times(db, start_date, end_date)
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "total_incidents": basic_stats[0],
        "incidents_by_status": {
            "open": basic_stats[1],
            "closed": basic_stats[2],
            "submitted": basic_stats[3]
        },
        "total_personnel_responses": manhours["total_responses"],
        "total_manhours": manhours["total_manhours"],
        "avg_incident_duration_hours": manhours["avg_duration_hours"],
        "response_times": times
    }


@router.get("/by-municipality")
async def get_municipality_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Get incident breakdown by municipality"""
    
    result = db.execute(text("""
        SELECT 
            COALESCE(m.display_name, i.municipality_code, 'Unknown') AS municipality,
            COUNT(*) AS incident_count,
            COUNT(DISTINCT i.cad_event_type) AS unique_call_types
        FROM incidents i
        LEFT JOIN municipalities m ON i.municipality_code = m.cad_code
        WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
          AND i.deleted_at IS NULL
        GROUP BY COALESCE(m.display_name, i.municipality_code, 'Unknown')
        ORDER BY incident_count DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    municipalities = []
    for row in result:
        municipalities.append({
            "municipality": row[0],
            "incident_count": row[1],
            "unique_call_types": row[2]
        })
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "municipalities": municipalities
    }


@router.get("/by-type")
async def get_type_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Get incident breakdown by call type"""
    
    result = db.execute(text("""
        SELECT 
            COALESCE(cad_event_type, 'Unknown') AS call_type,
            COUNT(*) AS incident_count,
            AVG(EXTRACT(EPOCH FROM (
                COALESCE(time_in_service, time_last_cleared) - time_dispatched
            )) / 60) AS avg_duration_minutes
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
        GROUP BY COALESCE(cad_event_type, 'Unknown')
        ORDER BY incident_count DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    call_types = []
    for row in result:
        call_types.append({
            "call_type": row[0],
            "incident_count": row[1],
            "avg_duration_minutes": round(float(row[2] or 0), 1) if row[2] else None
        })
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "call_types": call_types
    }


@router.get("/by-apparatus")
async def get_apparatus_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Get incident breakdown by apparatus"""
    
    result = db.execute(text("""
        SELECT 
            a.unit_designator,
            a.name AS apparatus_name,
            COUNT(DISTINCT ip.incident_id) AS incident_count,
            COUNT(ip.id) AS total_responses
        FROM apparatus a
        LEFT JOIN incident_personnel ip ON ip.apparatus_id = a.id
        LEFT JOIN incidents i ON ip.incident_id = i.id 
            AND COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
            AND i.deleted_at IS NULL
        WHERE a.is_virtual = false AND a.active = true
        GROUP BY a.id, a.unit_designator, a.name
        ORDER BY incident_count DESC
    """), {"start_date": start_date, "end_date": end_date})
    
    apparatus = []
    for row in result:
        apparatus.append({
            "unit_designator": row[0],
            "name": row[1],
            "incident_count": row[2],
            "total_responses": row[3]
        })
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "apparatus": apparatus
    }


@router.get("/personnel")
async def get_personnel_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    limit: int = Query(default=50, le=100),
    db: Session = Depends(get_db)
):
    """Get personnel response statistics - top responders"""
    
    result = db.execute(text("""
        WITH personnel_stats AS (
            SELECT 
                p.id,
                p.first_name,
                p.last_name,
                r.name AS rank_name,
                COUNT(DISTINCT ip.incident_id) AS incident_count,
                -- Calculate manhours per person
                SUM(
                    EXTRACT(EPOCH FROM (
                        COALESCE(i.time_in_service, i.time_last_cleared, i.time_first_on_scene) - i.time_dispatched
                    )) / 3600.0
                ) AS total_hours
            FROM personnel p
            LEFT JOIN ranks r ON p.rank_id = r.id
            LEFT JOIN incident_personnel ip ON ip.personnel_id = p.id
            LEFT JOIN incidents i ON ip.incident_id = i.id 
                AND COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
                AND i.deleted_at IS NULL
                AND i.time_dispatched IS NOT NULL
            WHERE p.active = true
            GROUP BY p.id, p.first_name, p.last_name, r.name
        )
        SELECT 
            id,
            first_name,
            last_name,
            rank_name,
            incident_count,
            COALESCE(total_hours, 0) AS total_hours
        FROM personnel_stats
        ORDER BY incident_count DESC, total_hours DESC
        LIMIT :limit
    """), {"start_date": start_date, "end_date": end_date, "limit": limit})
    
    personnel = []
    for row in result:
        personnel.append({
            "id": row[0],
            "name": f"{row[1]} {row[2]}",
            "rank": row[3],
            "incident_count": row[4],
            "total_hours": round(float(row[5] or 0), 1)
        })
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "personnel": personnel
    }


@router.get("/monthly-trend")
async def get_monthly_trend(
    year: int = Query(...),
    db: Session = Depends(get_db)
):
    """Get monthly incident trends for a year"""
    
    result = db.execute(text("""
        SELECT 
            EXTRACT(MONTH FROM COALESCE(incident_date, created_at::date))::int AS month,
            COUNT(*) AS incident_count,
            (SELECT COUNT(*) FROM incident_personnel ip 
             JOIN incidents i2 ON ip.incident_id = i2.id 
             WHERE EXTRACT(YEAR FROM COALESCE(i2.incident_date, i2.created_at::date)) = :year 
               AND EXTRACT(MONTH FROM COALESCE(i2.incident_date, i2.created_at::date)) = EXTRACT(MONTH FROM COALESCE(i.incident_date, i.created_at::date))
               AND i2.deleted_at IS NULL
            ) AS personnel_responses
        FROM incidents i
        WHERE EXTRACT(YEAR FROM COALESCE(incident_date, created_at::date)) = :year
          AND deleted_at IS NULL
        GROUP BY EXTRACT(MONTH FROM COALESCE(incident_date, created_at::date))
        ORDER BY month
    """), {"year": year})
    
    # Initialize all months
    months = {m: {"incident_count": 0, "personnel_responses": 0} for m in range(1, 13)}
    
    for row in result:
        months[row[0]] = {
            "incident_count": row[1],
            "personnel_responses": row[2]
        }
    
    monthly_data = [
        {"month": m, "month_name": date(year, m, 1).strftime("%B"), **data}
        for m, data in months.items()
    ]
    
    return {
        "year": year,
        "months": monthly_data,
        "total_incidents": sum(m["incident_count"] for m in monthly_data)
    }


@router.get("/day-of-week")
async def get_day_of_week_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Get incident breakdown by day of week"""
    
    result = db.execute(text("""
        SELECT 
            EXTRACT(DOW FROM COALESCE(incident_date, created_at::date))::int AS day_of_week,
            COUNT(*) AS incident_count
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
        GROUP BY EXTRACT(DOW FROM COALESCE(incident_date, created_at::date))
        ORDER BY day_of_week
    """), {"start_date": start_date, "end_date": end_date})
    
    day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    days = {i: {"day_name": day_names[i], "incident_count": 0} for i in range(7)}
    
    for row in result:
        days[row[0]]["incident_count"] = row[1]
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "days": list(days.values())
    }


@router.get("/hour-of-day")
async def get_hour_of_day_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Get incident breakdown by hour of day"""
    
    result = db.execute(text("""
        SELECT 
            EXTRACT(HOUR FROM time_dispatched)::int AS hour,
            COUNT(*) AS incident_count
        FROM incidents
        WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
          AND deleted_at IS NULL
          AND time_dispatched IS NOT NULL
        GROUP BY EXTRACT(HOUR FROM time_dispatched)
        ORDER BY hour
    """), {"start_date": start_date, "end_date": end_date})
    
    hours = {h: 0 for h in range(24)}
    for row in result:
        hours[row[0]] = row[1]
    
    hour_data = [
        {"hour": h, "hour_label": f"{h:02d}:00", "incident_count": count}
        for h, count in hours.items()
    ]
    
    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "hours": hour_data
    }


@router.get("/pdf")
async def generate_pdf_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    report_type: str = Query(default="summary"),
    db: Session = Depends(get_db)
):
    """Generate PDF report for download"""
    
    # Get report data based on type
    if report_type == "summary":
        # Get all data for comprehensive report
        summary = await get_summary_report(start_date, end_date, db)
        municipalities = await get_municipality_report(start_date, end_date, db)
        call_types = await get_type_report(start_date, end_date, db)
        personnel = await get_personnel_report(start_date, end_date, limit=20, db=db)
        
        report_data = {
            "summary": summary,
            "municipalities": municipalities,
            "call_types": call_types,
            "personnel": personnel
        }
    else:
        report_data = {"error": "Unknown report type"}
    
    # Generate PDF using reportlab
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT
        
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, alignment=TA_CENTER)
        subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=12, alignment=TA_CENTER, textColor=colors.grey)
        section_style = ParagraphStyle('Section', parent=styles['Heading2'], fontSize=14, spaceAfter=10)
        
        elements = []
        
        # Title
        elements.append(Paragraph("Incident Report", title_style))
        elements.append(Paragraph(f"{start_date.strftime('%B %d, %Y')} - {end_date.strftime('%B %d, %Y')}", subtitle_style))
        elements.append(Spacer(1, 0.3*inch))
        
        # Summary section
        elements.append(Paragraph("Summary Statistics", section_style))
        summary_data = [
            ["Total Incidents", str(report_data["summary"]["total_incidents"])],
            ["Total Personnel Responses", str(report_data["summary"]["total_personnel_responses"])],
            ["Total Manhours", f"{report_data['summary']['total_manhours']:.1f}"],
            ["Avg Incident Duration", f"{report_data['summary']['avg_incident_duration_hours']:.1f} hrs"],
        ]
        if report_data["summary"]["response_times"]["avg_response_minutes"]:
            summary_data.append(["Avg Response Time", f"{report_data['summary']['response_times']['avg_response_minutes']:.1f} min"])
        
        summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 0.3*inch))
        
        # Incidents by Municipality
        if report_data["municipalities"]["municipalities"]:
            elements.append(Paragraph("Incidents by Municipality", section_style))
            muni_data = [["Municipality", "Incidents"]]
            for m in report_data["municipalities"]["municipalities"][:10]:
                muni_data.append([m["municipality"], str(m["incident_count"])])
            
            muni_table = Table(muni_data, colWidths=[4*inch, 1.5*inch])
            muni_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 6),
                ('ALIGN', (1, 0), (1, -1), 'CENTER'),
            ]))
            elements.append(muni_table)
            elements.append(Spacer(1, 0.3*inch))
        
        # Incidents by Type
        if report_data["call_types"]["call_types"]:
            elements.append(Paragraph("Incidents by Call Type", section_style))
            type_data = [["Call Type", "Count", "Avg Duration"]]
            for t in report_data["call_types"]["call_types"][:10]:
                dur = f"{t['avg_duration_minutes']:.0f} min" if t['avg_duration_minutes'] else "-"
                type_data.append([t["call_type"], str(t["incident_count"]), dur])
            
            type_table = Table(type_data, colWidths=[3*inch, 1*inch, 1.5*inch])
            type_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 6),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ]))
            elements.append(type_table)
            elements.append(Spacer(1, 0.3*inch))
        
        # Top Responders
        if report_data["personnel"]["personnel"]:
            elements.append(Paragraph("Top Responders", section_style))
            pers_data = [["Name", "Rank", "Calls", "Hours"]]
            for p in report_data["personnel"]["personnel"][:15]:
                pers_data.append([
                    p["name"], 
                    p["rank"] or "-", 
                    str(p["incident_count"]),
                    f"{p['total_hours']:.1f}"
                ])
            
            pers_table = Table(pers_data, colWidths=[2.5*inch, 1.5*inch, 0.75*inch, 0.75*inch])
            pers_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 6),
                ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
            ]))
            elements.append(pers_table)
        
        # Footer
        elements.append(Spacer(1, 0.5*inch))
        elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", 
                                  ParagraphStyle('Footer', fontSize=8, textColor=colors.grey, alignment=TA_CENTER)))
        
        doc.build(elements)
        buffer.seek(0)
        
        filename = f"incident_report_{start_date}_{end_date}.pdf"
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except ImportError:
        raise HTTPException(
            status_code=500, 
            detail="PDF generation requires reportlab. Install with: pip install reportlab"
        )
