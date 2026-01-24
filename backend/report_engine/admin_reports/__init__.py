"""
Admin Reports Package

Unified report generation for administrative reports:
- Personnel activity reports (list + individual)
- Unit/apparatus reports (list + individual)
- Incident type breakdown reports (list + individual type)

All reports share common branding, styling, and components.

Usage:
    from report_engine.admin_reports import PersonnelListReport, UnitsListReport
    
    report = PersonnelListReport(db, branding)
    pdf_bytes = report.generate_pdf(start_date, end_date, category='FIRE')
    html_str = report.generate_html(start_date, end_date, category='FIRE')
"""

from .base import AdminReport
from .personnel import PersonnelListReport, PersonnelDetailReport
from .units import UnitsListReport, UnitsDetailReport
from .incidents import IncidentsListReport, IncidentTypeDetailReport
from .details import DetailListReport, DetailPersonnelReport

__all__ = [
    'AdminReport',
    'PersonnelListReport',
    'PersonnelDetailReport',
    'UnitsListReport',
    'UnitsDetailReport',
    'IncidentsListReport',
    'IncidentTypeDetailReport',
    'DetailListReport',
    'DetailPersonnelReport',
]
