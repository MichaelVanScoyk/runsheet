"""
Base Admin Report Class

Provides shared infrastructure for all admin reports:
- Branding integration
- CSS generation
- Header/footer rendering
- PDF generation via WeasyPrint
"""

from abc import ABC, abstractmethod
from datetime import date, datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
import io

from ..branding_config import get_logo_data_url


class AdminReport(ABC):
    """
    Base class for all administrative PDF reports.
    
    Subclasses implement:
        - get_data(**params) -> dict: Fetch data from database
        - render_body(data) -> str: Render HTML body content
        - get_title() -> str: Report title for header
        - get_subtitle(data, **params) -> str: Report subtitle
    """
    
    def __init__(self, db: Session, branding: dict):
        """
        Initialize report with database session and branding config.
        
        Args:
            db: SQLAlchemy database session (tenant-specific)
            branding: Branding config dict from get_branding()
        """
        self.db = db
        self.branding = branding
        
        # Extract commonly used branding values
        self.primary_color = branding.get('primary_color', '#016a2b')
        self.secondary_color = branding.get('secondary_color', '#eeee01')
        self.text_color = branding.get('text_color', '#1a1a1a')
        self.muted_color = branding.get('muted_color', '#666666')
        self.station_name = branding.get('station_name', 'Fire Department')
        self.station_short = branding.get('station_short_name', '') or self.station_name
        
        # Color dict for components
        self.colors = {
            'green': self.primary_color,
            'greenLight': '#e8f5e9',
            'secondary': self.secondary_color,
            'text': self.text_color,
            'grayDark': self.muted_color,
            'white': '#ffffff',
            'red': '#dc2626',
            'redLight': '#fee2e2',
            'blue': '#2563eb',
            'blueLight': '#dbeafe',
        }
    
    # =========================================================================
    # ABSTRACT METHODS - Subclasses must implement
    # =========================================================================
    
    @abstractmethod
    def get_data(self, **params) -> dict:
        """
        Fetch report data from database.
        
        Args:
            **params: Report-specific parameters (start_date, end_date, etc.)
        
        Returns:
            Dict containing all data needed for the report
        """
        pass
    
    @abstractmethod
    def render_body(self, data: dict, **params) -> str:
        """
        Render the main report body as HTML.
        
        Args:
            data: Data dict from get_data()
            **params: Report-specific parameters
        
        Returns:
            HTML string for the report body
        """
        pass
    
    @abstractmethod
    def get_title(self) -> str:
        """Get report title for header."""
        pass
    
    @abstractmethod
    def get_subtitle(self, data: dict, **params) -> str:
        """
        Get report subtitle for header.
        
        Args:
            data: Data dict from get_data()
            **params: Report-specific parameters
        
        Returns:
            Subtitle string (e.g., date range, category filter)
        """
        pass
    
    # =========================================================================
    # SHARED RENDERING METHODS
    # =========================================================================
    
    def render_header(self, title: str, subtitle: str) -> str:
        """
        Render the report header with logo and title.
        
        Args:
            title: Report title
            subtitle: Report subtitle (date range, filters, etc.)
        """
        logo_url = get_logo_data_url(self.branding)
        logo_html = f'<img src="{logo_url}" class="header-logo" alt="Logo">' if logo_url else ''
        
        return f'''<div class="header">
            <div class="header-accent"></div>
            {logo_html}
            <div class="header-text">
                <h1 class="header-title">{self.station_name.upper()}</h1>
                <div class="header-subtitle">{title} — {subtitle}</div>
            </div>
        </div>'''
    
    def render_footer(self) -> str:
        """Render the report footer."""
        now = datetime.now()
        return f'''<div class="footer">
            <span class="footer-left">{self.station_name} — {self.station_short}</span>
            <span class="footer-right">Generated: {now.strftime('%Y-%m-%d %H:%M')}</span>
        </div>'''
    
    def generate_css(self) -> str:
        """
        Generate CSS for admin reports using branding colors.
        
        This CSS is specific to admin reports (tables, stat boxes, etc.)
        and complements the incident report CSS.
        """
        return f'''
            @page {{
                size: letter;
                margin: 0.4in;
            }}
            
            * {{
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }}
            
            body {{
                font-family: Arial, Helvetica, sans-serif;
                font-size: 9px;
                line-height: 1.3;
                color: {self.text_color};
                background: #fff;
            }}
            
            /* Header */
            .header {{
                display: table;
                width: 100%;
                border-bottom: 3px solid {self.primary_color};
                padding-bottom: 8px;
                margin-bottom: 12px;
                position: relative;
            }}
            
            .header-accent {{
                position: absolute;
                bottom: -3px;
                left: 0;
                width: 80px;
                height: 3px;
                background: {self.secondary_color};
            }}
            
            .header-logo {{
                display: table-cell;
                width: 70px;
                vertical-align: middle;
            }}
            
            .header-logo img {{
                width: 60px;
                height: auto;
            }}
            
            .header-text {{
                display: table-cell;
                vertical-align: middle;
                padding-left: 12px;
            }}
            
            .header-title {{
                font-size: 20px;
                font-weight: 700;
                margin: 0;
                color: {self.text_color};
            }}
            
            .header-subtitle {{
                font-size: 11px;
                color: {self.primary_color};
                font-weight: 600;
                margin-top: 2px;
            }}
            
            /* Sections */
            .section {{
                background: #e8e8e8;
                border: 1px solid #d0d0d0;
                border-radius: 4px;
                margin-bottom: 10px;
                overflow: hidden;
            }}
            
            .section-header {{
                font-size: 8px;
                font-weight: 700;
                color: {self.primary_color};
                text-transform: uppercase;
                letter-spacing: 0.5px;
                background: #e8e8e8;
                padding: 6px 10px;
                border-bottom: 1px solid #ddd;
            }}
            
            .section-body {{
                padding: 10px;
                background: #fff;
            }}
            
            /* Stat Grid */
            .stat-grid {{
                display: table;
                width: 100%;
                table-layout: fixed;
            }}
            
            .stat-box {{
                display: table-cell;
                text-align: center;
                background: #e8e8e8;
                padding: 10px 6px;
                border: 1px solid #e0e0e0;
                border-radius: 3px;
            }}
            
            .stat-value {{
                font-size: 22px;
                font-weight: 700;
                line-height: 1.2;
            }}
            
            .stat-label {{
                font-size: 7px;
                color: {self.muted_color};
                text-transform: uppercase;
                margin-top: 3px;
                letter-spacing: 0.3px;
            }}
            
            .stat-sub {{
                font-size: 7px;
                color: {self.primary_color};
                margin-top: 2px;
            }}
            
            /* Data Tables */
            .data-table {{
                width: 100%;
                border-collapse: collapse;
                font-size: 8px;
            }}
            
            .data-table th {{
                background: {self.primary_color};
                color: #fff;
                font-weight: 600;
                text-align: left;
                padding: 5px 8px;
                font-size: 8px;
            }}
            
            .data-table td {{
                padding: 4px 8px;
                border-bottom: 1px solid #e0e0e0;
            }}
            
            .data-table tbody tr:hover {{
                background: #f9f9f9;
            }}
            
            /* Grouped Lists */
            .grouped-list {{
                font-size: 8px;
            }}
            
            .group {{
                margin-bottom: 8px;
            }}
            
            .group-header {{
                background: {self.primary_color};
                color: #fff;
                padding: 5px 10px;
                border-radius: 3px;
                font-weight: 600;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }}
            
            .group-count {{
                background: rgba(255,255,255,0.25);
                padding: 2px 10px;
                border-radius: 10px;
                font-size: 7px;
            }}
            
            .group-item {{
                padding: 3px 10px 3px 20px;
                border-bottom: 1px dotted #ccc;
                display: flex;
                justify-content: space-between;
            }}
            
            .group-item:last-child {{
                border-bottom: none;
            }}
            
            .item-count {{
                font-weight: 600;
                color: {self.muted_color};
            }}
            
            /* Two/Three Column Layout */
            .two-column {{
                display: table;
                width: 100%;
                table-layout: fixed;
            }}
            
            .two-column > .column {{
                display: table-cell;
                width: 50%;
                vertical-align: top;
                padding-right: 8px;
            }}
            
            .two-column > .column:last-child {{
                padding-right: 0;
                padding-left: 8px;
            }}
            
            .three-column {{
                display: table;
                width: 100%;
                table-layout: fixed;
            }}
            
            .three-column > .column {{
                display: table-cell;
                width: 33.33%;
                vertical-align: top;
                padding-right: 6px;
            }}
            
            .three-column > .column:last-child {{
                padding-right: 0;
            }}
            
            /* Badges */
            .badge {{
                display: inline-block;
                padding: 2px 8px;
                border-radius: 3px;
                font-size: 7px;
                font-weight: 600;
                color: #fff;
            }}
            
            .badge-fire {{
                background: #dc2626;
            }}
            
            .badge-ems {{
                background: #2563eb;
            }}
            
            /* Footer */
            .footer {{
                margin-top: 15px;
                padding-top: 8px;
                border-top: 1px solid #ddd;
                font-size: 8px;
                color: {self.muted_color};
                display: flex;
                justify-content: space-between;
            }}
            
            /* Utility */
            .text-right {{
                text-align: right;
            }}
            
            .text-center {{
                text-align: center;
            }}
            
            .text-muted {{
                color: {self.muted_color};
            }}
            
            .text-green {{
                color: {self.primary_color};
            }}
            
            .font-bold {{
                font-weight: 700;
            }}
            
            .mt-1 {{ margin-top: 8px; }}
            .mt-2 {{ margin-top: 16px; }}
            .mb-1 {{ margin-bottom: 8px; }}
            .mb-2 {{ margin-bottom: 16px; }}
        '''
    
    def generate_html(self, **params) -> str:
        """
        Generate complete HTML document for the report.
        
        Args:
            **params: Report-specific parameters passed to get_data() and render_body()
        
        Returns:
            Complete HTML document string
        """
        # Fetch data
        data = self.get_data(**params)
        
        # Get title/subtitle
        title = self.get_title()
        subtitle = self.get_subtitle(data, **params)
        
        # Render components
        header = self.render_header(title, subtitle)
        body = self.render_body(data, **params)
        footer = self.render_footer()
        css = self.generate_css()
        
        return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{self.station_name} - {title}</title>
    <style>
{css}
    </style>
</head>
<body>
    {header}
    {body}
    {footer}
</body>
</html>'''
    
    def generate_pdf(self, **params) -> bytes:
        """
        Generate PDF document for the report.
        
        Args:
            **params: Report-specific parameters
        
        Returns:
            PDF file bytes
        """
        from weasyprint import HTML
        
        html_content = self.generate_html(**params)
        
        pdf_buffer = io.BytesIO()
        HTML(string=html_content).write_pdf(pdf_buffer)
        pdf_buffer.seek(0)
        
        return pdf_buffer.getvalue()
    
    def get_pdf_filename(self, **params) -> str:
        """
        Get suggested filename for the PDF.
        
        Args:
            **params: Report-specific parameters
        
        Returns:
            Filename string (e.g., "personnel_report_2025-01.pdf")
        """
        title = self.get_title().lower().replace(' ', '_')
        date_str = datetime.now().strftime('%Y-%m-%d')
        return f'{title}_{date_str}.pdf'
    
    # =========================================================================
    # HELPER METHODS
    # =========================================================================
    
    def format_date_range(self, start_date: date, end_date: date) -> str:
        """Format a date range for display."""
        return f'{start_date.strftime("%b %d, %Y")} to {end_date.strftime("%b %d, %Y")}'
    
    def format_category(self, category: str = None) -> str:
        """Format category filter for display."""
        if category and category.upper() == 'FIRE':
            return 'Fire Incidents'
        elif category and category.upper() == 'EMS':
            return 'EMS Incidents'
        return 'All Incidents'
    
    def build_prefix_filter(self, category: str = None, alias: str = "i") -> str:
        """
        Build SQL filter for incident number prefix.
        
        Args:
            category: 'FIRE', 'EMS', or None for all
            alias: Table alias for incidents table
        
        Returns:
            SQL WHERE clause fragment
        """
        if category and category.upper() == 'FIRE':
            return f"AND {alias}.internal_incident_number LIKE 'F%'"
        elif category and category.upper() == 'EMS':
            return f"AND {alias}.internal_incident_number LIKE 'E%'"
        else:
            # Default: include Fire and EMS, exclude Detail
            return f"AND ({alias}.internal_incident_number LIKE 'F%' OR {alias}.internal_incident_number LIKE 'E%')"
