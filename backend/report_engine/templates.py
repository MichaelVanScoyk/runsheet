"""
Report Templates

CSS generation and base HTML templates using tenant branding.
All styles are dynamically generated from branding config.
"""

from .branding_config import get_logo_data_url, get_logo_size_px, get_badge_radius


def generate_css(branding: dict) -> str:
    """Generate complete CSS for incident reports based on branding."""
    primary = branding.get("primary_color", "#016a2b")
    secondary = branding.get("secondary_color", "#eeee01")
    text_color = branding.get("text_color", "#1a1a1a")
    muted_color = branding.get("muted_color", "#666666")
    
    font_family = branding.get("font_family", "Arial, Helvetica, sans-serif")
    header_font_size = branding.get("header_font_size", "12pt")
    body_font_size = branding.get("body_font_size", "9pt")
    small_font_size = branding.get("small_font_size", "7pt")
    
    logo_size = get_logo_size_px(branding)
    badge_radius = get_badge_radius(branding)
    border_style = branding.get("border_style", "solid")
    
    return f'''
        @page {{ size: letter; margin: 0.3in; }}
        
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        
        body {{
            font-family: {font_family};
            font-size: {body_font_size};
            line-height: 1.25;
            color: {text_color};
        }}
        
        .page-break {{ page-break-before: always; }}
        .clearfix::after {{ content: ""; display: table; clear: both; }}
        
        /* Row system for side-by-side fields */
        .layout-row {{
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-bottom: 3px;
        }}
        
        .layout-row.row-has-float {{
            position: relative;
        }}
        
        /* Width classes */
        .w-auto {{ width: auto; }}
        .w-quarter {{ width: calc(25% - 3px); }}
        .w-third {{ width: calc(33.33% - 3px); }}
        .w-half {{ width: calc(50% - 2px); }}
        .w-two-thirds {{ width: calc(66.67% - 2px); }}
        .w-three-quarters {{ width: calc(75% - 1px); }}
        .w-full {{ width: 100%; }}
        
        /* Float positioning */
        .float-right {{
            position: absolute;
            top: 0;
            right: 0;
        }}
        
        /* Header styles */
        .header-classic {{
            border-bottom: 2px {border_style} {primary};
            padding-bottom: 4px;
            margin-bottom: 4px;
        }}
        
        .header-classic .logo {{
            float: left;
            width: {logo_size};
            height: auto;
            margin-right: 8px;
        }}
        
        .header-classic .header-text {{
            overflow: hidden;
        }}
        
        .header-modern {{
            text-align: center;
            border-bottom: 2px {border_style} {primary};
            padding-bottom: 6px;
            margin-bottom: 6px;
        }}
        
        .header-modern .logo {{
            width: {logo_size};
            height: auto;
            margin-bottom: 4px;
        }}
        
        .header-minimal {{
            border-bottom: 1px {border_style} {muted_color};
            padding-bottom: 4px;
            margin-bottom: 4px;
        }}
        
        .header-banner {{
            background: {primary};
            color: white;
            padding: 8px 12px;
            margin: -0.3in -0.3in 6px -0.3in;
            display: flex;
            align-items: center;
        }}
        
        .header-banner .logo {{
            width: {logo_size};
            height: auto;
            margin-right: 12px;
        }}
        
        .header-banner .station-name {{
            color: white;
        }}
        
        .header-banner .subtitle {{
            color: rgba(255,255,255,0.8);
        }}
        
        .station-name {{
            font-size: {header_font_size};
            font-weight: bold;
        }}
        
        .subtitle {{
            font-size: {body_font_size};
            color: {muted_color};
        }}
        
        /* Incident info */
        .incident-info {{
            margin-bottom: 4px;
            font-size: {body_font_size};
        }}
        
        .inc-number {{
            font-size: 14pt;
            font-weight: bold;
            margin-right: 6px;
        }}
        
        .cad-number {{
            margin-left: 8px;
            color: {muted_color};
        }}
        
        .inc-date {{
            margin-left: 8px;
        }}
        
        .muni {{
            margin-left: 8px;
        }}
        
        .esz {{
            margin-left: 8px;
            color: {muted_color};
        }}
        
        /* Badges */
        .badge {{
            display: inline-block;
            padding: 1px 5px;
            border-radius: {badge_radius};
            font-size: 8pt;
            font-weight: bold;
            color: #fff;
            vertical-align: middle;
        }}
        
        .badge-fire {{ background: #c0392b; }}
        .badge-ems {{ background: #2980b9; }}
        
        /* Times box */
        .times-box {{
            width: 170px;
            margin: 0 0 6px 8px;
        }}
        
        .times-table {{
            width: 100%;
            border: 1px {border_style} {text_color};
            border-collapse: collapse;
            font-size: 8pt;
        }}
        
        .times-table td {{
            padding: 1px 3px;
            border-bottom: 1px dotted #ccc;
        }}
        
        .times-table tr:last-child td {{
            border-bottom: none;
        }}
        
        .time-label {{
            font-weight: bold;
            width: 60px;
        }}
        
        .time-value {{
            font-family: 'Courier New', monospace;
            text-align: right;
        }}
        
        /* Fields */
        .field {{
            margin-bottom: 3px;
        }}
        
        .field-inline {{
            display: inline-block;
            margin-right: 12px;
        }}
        
        .label {{
            font-weight: bold;
            font-size: 8pt;
        }}
        
        .address {{
            font-size: inherit;
            font-weight: inherit;
        }}
        
        .cross-streets {{
            font-size: {body_font_size};
            color: {muted_color};
            display: inline;
            margin-left: 4px;
        }}
        
        .cad-type {{
            font-size: inherit;
            font-weight: inherit;
        }}
        
        .cad-subtype {{
            font-size: inherit;
            font-weight: inherit;
            color: {muted_color};
        }}
        
        .narrative-box {{
            padding: 3px;
            background: #f5f5f5;
            border: 1px {border_style} #ddd;
            margin-top: 2px;
            white-space: pre-wrap;
            font-size: {body_font_size};
        }}
        
        /* Personnel tables */
        .personnel-section {{
            margin-top: 4px;
            clear: both;
        }}
        
        .personnel-section-title {{
            font-weight: bold;
            font-size: 8pt;
            margin-bottom: 2px;
            color: {primary};
        }}
        
        .personnel-table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 8pt;
            margin-top: 2px;
        }}
        
        .personnel-table th,
        .personnel-table td {{
            border: 1px {border_style} {text_color};
            padding: 1px 3px;
            text-align: left;
        }}
        
        .personnel-table th {{
            background: {primary};
            color: #fff;
            text-align: center;
        }}
        
        .role-header {{
            width: 40px;
        }}
        
        .role-cell {{
            font-weight: bold;
            background: {secondary};
            width: 40px;
        }}
        
        .total-row {{
            margin-top: 2px;
            font-weight: bold;
            font-size: 8pt;
        }}
        
        .personnel-list {{
            font-size: 8pt;
            margin-top: 2px;
        }}
        
        .personnel-list-item {{
            display: inline-block;
            margin-right: 8px;
            padding: 1px 4px;
            background: #f0f0f0;
            border-radius: 2px;
        }}
        
        /* Officer section */
        .officer-cell {{
            display: inline-block;
            width: 48%;
            font-size: {body_font_size};
        }}
        
        /* Footer */
        .footer {{
            margin-top: 6px;
            padding-top: 3px;
            border-top: 1px {border_style} {text_color};
            font-size: {small_font_size};
            color: {muted_color};
        }}
        
        .footer-left {{ float: left; }}
        .footer-center {{ text-align: center; }}
        .footer-right {{ float: right; }}
        
        /* CAD unit table */
        .cad-table {{
            width: 100%;
            border-collapse: collapse;
            font-size: {small_font_size};
            margin-top: 2px;
        }}
        
        .cad-table th,
        .cad-table td {{
            border: 1px {border_style} #999;
            padding: 1px 3px;
        }}
        
        .cad-table th {{
            background: #eee;
        }}
        
        /* Stats boxes */
        .stat-box {{
            text-align: center;
            padding: 4px;
            background: #f5f5f5;
            border: 1px {border_style} #ddd;
            border-radius: 3px;
        }}
        
        .stat-value {{
            font-size: 14pt;
            font-weight: bold;
        }}
        
        .stat-label {{
            font-size: {small_font_size};
            color: {muted_color};
        }}
        
        /* Watermark */
        .watermark {{
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 72pt;
            color: rgba(0,0,0,0.1);
            pointer-events: none;
            z-index: -1;
        }}
    '''


def generate_base_html(title: str, css: str, body: str, watermark: str = None) -> str:
    """Generate complete HTML document with CSS and body content."""
    watermark_html = ""
    if watermark:
        watermark_html = f'<div class="watermark">{watermark}</div>'
    
    return f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
    <style>
{css}
    </style>
</head>
<body>
    {watermark_html}
    {body}
</body>
</html>'''


def get_width_class(width: str) -> str:
    """Convert width value to CSS class name."""
    mapping = {
        "auto": "w-auto",
        "1/4": "w-quarter",
        "1/3": "w-third",
        "1/2": "w-half",
        "2/3": "w-two-thirds",
        "3/4": "w-three-quarters",
        "full": "w-full",
    }
    return mapping.get(width, "w-auto")


def render_header(branding: dict) -> str:
    """Render header HTML based on branding header_style."""
    style = branding.get("header_style", "classic")
    station_name = branding.get("station_name", "Fire Department")
    station_number = branding.get("station_number", "")
    tagline = branding.get("tagline", "")
    
    logo_url = get_logo_data_url(branding)
    logo_html = f'<img src="{logo_url}" class="logo" alt="Logo">' if logo_url else ''
    
    station_display = station_name
    if station_number:
        station_display = f"{station_name} — Station {station_number}"
    
    subtitle = tagline or "Incident Report"
    
    if style == "modern":
        return f'''<div class="header-modern">
            {logo_html}
            <div class="station-name">{station_display}</div>
            <div class="subtitle">{subtitle}</div>
        </div>'''
    
    elif style == "minimal":
        return f'''<div class="header-minimal">
            <div class="station-name">{station_display}</div>
            <div class="subtitle">{subtitle}</div>
        </div>'''
    
    elif style == "banner":
        return f'''<div class="header-banner">
            {logo_html}
            <div class="header-text">
                <div class="station-name">{station_display}</div>
                <div class="subtitle">{subtitle}</div>
            </div>
        </div>'''
    
    else:  # classic (default)
        return f'''<div class="header-classic clearfix">
            {logo_html}
            <div class="header-text">
                <div class="station-name">{station_display}</div>
                <div class="subtitle">{subtitle}</div>
            </div>
        </div>'''
