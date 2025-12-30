"""
Incident HTML Report Generator - New Layout
Replace get_incident_html_report in reports.py with this version
"""

# Copy this function to replace the existing get_incident_html_report in reports.py

async def get_incident_html_report_v2(
    incident_id: int,
    db
):
    """
    Generate printable HTML report for a single incident.
    Uses WeasyPrint for consistent PDF output across all browsers.
    
    Layout order (matching screenshot):
    1. Header (incident #, date, municipality, weather, ESZ, times)
    2. Location + Cross Streets
    3. Units Called (just the list)
    4. Dispatched As
    5. Situation Found / Extent of Damage / Services Provided / Narrative
    6. Personnel grid (units with names underneath)
    7. Officer in Charge / Completed By
    8. Problems/Issues
    9. Footer
    10. LAST: CAD Unit detail table (if showCadUnitDetails enabled)
    """
    from fastapi import HTTPException
    from fastapi.responses import HTMLResponse
    from sqlalchemy import text
    from datetime import datetime
    import json
    from settings_helper import format_local_time, format_local_datetime, format_local_date, get_timezone
    
    # Get incident
    incident = db.execute(text("""
        SELECT * FROM incidents WHERE id = :id AND deleted_at IS NULL
    """), {"id": incident_id}).fetchone()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Convert to dict for easier access
    inc = dict(incident._mapping)
    
    # Get print settings
    print_settings_result = db.execute(text("""
        SELECT value FROM settings WHERE category = 'print' AND key = 'settings'
    """)).fetchone()
    
    print_settings = {
        'showHeader': True,
        'showTimes': True,
        'showLocation': True,
        'showDispatchInfo': True,
        'showSituationFound': True,
        'showExtentOfDamage': True,
        'showServicesProvided': True,
        'showNarrative': True,
        'showPersonnelGrid': True,
        'showEquipmentUsed': True,
        'showOfficerInfo': True,
        'showProblemsIssues': True,
        'showCadUnits': True,
        'showCadUnitDetails': False,  # NEW: detailed table at end
        'showNerisInfo': False,
        'showWeather': True,
        'showCrossStreets': True,
        'showCallerInfo': False,
    }
    
    if print_settings_result and print_settings_result[0]:
        try:
            loaded = json.loads(print_settings_result[0])
            print_settings.update(loaded)
        except:
            pass
    
    # ==========================================================================
    # TENANT SETTINGS
    # ==========================================================================
    station_name_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'station' AND key = 'name'")
    ).fetchone()
    station_name = station_name_result[0] if station_name_result else "Fire Department"
    
    station_short_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'station' AND key = 'short_name'")
    ).fetchone()
    station_short_name = station_short_result[0] if station_short_result else "Station"
    
    # Logo
    logo_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo'")
    ).fetchone()
    logo_mime_result = db.execute(
        text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo_mime_type'")
    ).fetchone()
    
    if logo_result and logo_result[0]:
        mime_type = logo_mime_result[0] if logo_mime_result else 'image/png'
        logo_data_url = f"data:{mime_type};base64,{logo_result[0]}"
    else:
        logo_data_url = ""
    
    # Get municipality display name
    muni_display = inc.get('municipality_code', '')
    if inc.get('municipality_id'):
        muni_result = db.execute(text("""
            SELECT display_name, name, code FROM municipalities WHERE id = :id
        """), {"id": inc['municipality_id']}).fetchone()
        if muni_result:
            muni_display = muni_result[0] or muni_result[1] or muni_result[2]
    
    # Get personnel assignments grouped by unit
    personnel_data = db.execute(text("""
        SELECT 
            ip.slot_index,
            ip.personnel_first_name,
            ip.personnel_last_name,
            ip.rank_name_snapshot,
            a.unit_designator,
            a.name as apparatus_name
        FROM incident_personnel ip
        JOIN incident_units iu ON ip.incident_unit_id = iu.id
        JOIN apparatus a ON iu.apparatus_id = a.id
        WHERE ip.incident_id = :id
        ORDER BY a.unit_designator, ip.slot_index
    """), {"id": incident_id}).fetchall()
    
    # Group by unit
    personnel_by_unit = {}
    for p in personnel_data:
        unit = p[4]
        if unit not in personnel_by_unit:
            personnel_by_unit[unit] = {'name': p[5], 'personnel': []}
        personnel_by_unit[unit]['personnel'].append({
            'name': f"{p[1]} {p[2]}",
            'rank': p[3]
        })
    
    # Get officer names
    officer_name = ""
    completed_by_name = ""
    if inc.get('officer_in_charge'):
        oic = db.execute(text("""
            SELECT first_name, last_name FROM personnel WHERE id = :id
        """), {"id": inc['officer_in_charge']}).fetchone()
        if oic:
            officer_name = f"{oic[0]} {oic[1]}"
    
    if inc.get('completed_by'):
        comp = db.execute(text("""
            SELECT first_name, last_name FROM personnel WHERE id = :id
        """), {"id": inc['completed_by']}).fetchone()
        if comp:
            completed_by_name = f"{comp[0]} {comp[1]}"
    
    # ==========================================================================
    # FORMAT TIMES
    # ==========================================================================
    def fmt_time(dt_val):
        return format_local_time(dt_val, include_seconds=True)
    
    def fmt_date(dt_val):
        return format_local_date(dt_val)
    
    # Calculate In Service duration
    in_service_duration = ""
    if inc.get('time_dispatched') and inc.get('time_last_cleared'):
        try:
            dispatched = inc['time_dispatched']
            cleared = inc['time_last_cleared']
            if hasattr(dispatched, 'timestamp') and hasattr(cleared, 'timestamp'):
                delta = cleared - dispatched
                total_seconds = int(delta.total_seconds())
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                in_service_duration = f"{hours}h {minutes}m"
        except:
            pass
    
    # Format incident date
    incident_date_display = ""
    if inc.get('incident_date'):
        incident_date_display = str(inc.get('incident_date'))
    elif inc.get('time_dispatched'):
        incident_date_display = fmt_date(inc.get('time_dispatched'))
    
    # ==========================================================================
    # BUILD HTML SECTIONS
    # ==========================================================================
    
    # --- RESPONSE TIMES BOX (top right) ---
    times_box_rows = []
    time_fields = [
        ('time_dispatched', 'Dispatched'),
        ('time_first_enroute', 'Enroute'),
        ('time_first_on_scene', 'On Scene'),
        ('time_fire_under_control', 'Under Ctrl'),
        ('time_last_cleared', 'Cleared'),
    ]
    for field, label in time_fields:
        val = inc.get(field)
        if val:
            times_box_rows.append(f'<tr><td class="time-label">{label}:</td><td class="time-value">{fmt_time(val)}</td></tr>')
    if in_service_duration:
        times_box_rows.append(f'<tr><td class="time-label">In Service:</td><td class="time-value">{in_service_duration}</td></tr>')
    
    times_box_html = f'''<table class="times-box">{''.join(times_box_rows)}</table>''' if times_box_rows else ""
    
    # --- LOCATION SECTION ---
    location_html = ""
    if print_settings.get('showLocation', True):
        location_html = f'''
        <div class="section">
            <div class="section-title">Location:</div>
            <p class="section-value">{inc.get("address", "") or ""}</p>
            {f'<div class="section-title" style="margin-top:8px;">Cross Streets:</div><p class="section-value">{inc.get("cross_streets", "")}</p>' if print_settings.get('showCrossStreets', True) and inc.get('cross_streets') else ''}
        </div>'''
    
    # --- UNITS CALLED (just the list, comma separated) ---
    units_called_html = ""
    if print_settings.get('showCadUnits', True) and inc.get('cad_units'):
        cad_units = inc.get('cad_units', [])
        if cad_units:
            unit_ids = [u.get('unit_id', '') for u in cad_units if u.get('unit_id')]
            units_called_html = f'''
            <div class="section">
                <div class="section-title">Units Called:</div>
                <p class="section-value">{', '.join(unit_ids)}</p>
            </div>'''
    
    # --- DISPATCHED AS ---
    dispatched_as_html = ""
    if print_settings.get('showDispatchInfo', True):
        dispatch_type = inc.get('cad_event_type', '')
        dispatch_subtype = inc.get('cad_event_subtype', '')
        dispatch_text = f"{dispatch_type} / {dispatch_subtype}" if dispatch_subtype else dispatch_type
        if dispatch_text:
            dispatched_as_html = f'''
            <div class="section">
                <div class="section-title">Dispatched As:</div>
                <p class="section-value">{dispatch_text}</p>
            </div>'''
    
    # --- NARRATIVE SECTIONS ---
    narrative_sections = []
    
    if print_settings.get('showSituationFound', True) and inc.get('situation_found'):
        narrative_sections.append(f'''
        <div class="section">
            <div class="section-title">Situation Found:</div>
            <p class="section-value">{inc.get("situation_found", "")}</p>
        </div>''')
    
    if print_settings.get('showExtentOfDamage', True) and inc.get('extent_of_damage'):
        narrative_sections.append(f'''
        <div class="section">
            <div class="section-title">Extent of Damage:</div>
            <p class="section-value">{inc.get("extent_of_damage", "")}</p>
        </div>''')
    
    if print_settings.get('showServicesProvided', True) and inc.get('services_provided'):
        narrative_sections.append(f'''
        <div class="section">
            <div class="section-title">Services Provided:</div>
            <p class="section-value">{inc.get("services_provided", "")}</p>
        </div>''')
    
    if print_settings.get('showNarrative', True) and inc.get('narrative'):
        narrative_sections.append(f'''
        <div class="section narrative-box">
            <div class="section-title">Narrative:</div>
            <p class="section-value">{inc.get("narrative", "")}</p>
        </div>''')
    
    narrative_html = ''.join(narrative_sections)
    
    # --- PERSONNEL GRID (units with names underneath) ---
    personnel_html = ""
    if print_settings.get('showPersonnelGrid', True) and personnel_by_unit:
        unit_headers = []
        unit_names = []
        for unit_id, data in personnel_by_unit.items():
            unit_headers.append(f'<th class="unit-header">{data["name"]} ({unit_id})</th>')
            names_list = '<br>'.join([f"{p['rank']} {p['name']}" if p['rank'] else p['name'] for p in data['personnel']])
            unit_names.append(f'<td class="unit-names">{names_list}</td>')
        
        total_personnel = sum(len(d['personnel']) for d in personnel_by_unit.values())
        
        personnel_html = f'''
        <div class="section">
            <div class="section-title">Personnel:</div>
            <table class="personnel-table">
                <tr>{''.join(unit_headers)}</tr>
                <tr>{''.join(unit_names)}</tr>
            </table>
            <p class="personnel-total">Total Personnel: {total_personnel}</p>
        </div>'''
    
    # --- OFFICER INFO ---
    officer_html = ""
    if print_settings.get('showOfficerInfo', True):
        officer_rows = []
        if officer_name:
            officer_rows.append(f'<span class="officer-item"><strong>Officer in Charge:</strong> {officer_name}</span>')
        if completed_by_name:
            officer_rows.append(f'<span class="officer-item"><strong>Report Completed By:</strong> {completed_by_name}</span>')
        if officer_rows:
            officer_html = f'''
            <div class="section officer-section">
                {'&nbsp;&nbsp;&nbsp;'.join(officer_rows)}
            </div>'''
    
    # --- PROBLEMS/ISSUES ---
    problems_html = ""
    if print_settings.get('showProblemsIssues', True):
        problems_text = inc.get('problems_issues', '') or 'none'
        problems_html = f'''
        <div class="section">
            <div class="section-title">Problems/Issues:</div>
            <p class="section-value">{problems_text}</p>
        </div>'''
    
    # --- CAD UNIT DETAILS TABLE (at the very end, if enabled) ---
    cad_details_html = ""
    if print_settings.get('showCadUnitDetails', False) and inc.get('cad_units'):
        cad_units = inc.get('cad_units', [])
        if cad_units:
            unit_rows = []
            for u in cad_units:
                unit_rows.append(f'''<tr>
                    <td>{u.get("unit_id", "")}</td>
                    <td>{fmt_time(u.get("time_dispatched"))}</td>
                    <td>{fmt_time(u.get("time_enroute"))}</td>
                    <td>{fmt_time(u.get("time_arrived"))}</td>
                    <td>{fmt_time(u.get("time_cleared") or u.get("time_available"))}</td>
                </tr>''')
            
            cad_details_html = f'''
            <div class="page-break"></div>
            <div class="section cad-details">
                <div class="section-title">CAD UNIT DETAILS</div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Unit</th>
                            <th>Dispatched</th>
                            <th>Enroute</th>
                            <th>Arrived</th>
                            <th>Cleared</th>
                        </tr>
                    </thead>
                    <tbody>
                        {''.join(unit_rows)}
                    </tbody>
                </table>
            </div>'''
    
    # ==========================================================================
    # BUILD FULL HTML
    # ==========================================================================
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Incident Report - {inc.get("internal_incident_number", "")}</title>
    <style>
        @page {{ 
            size: letter; 
            margin: 0.5in;
            @top-center {{
                content: "{station_name} - Incident Report";
                font-size: 8px;
                color: #888;
            }}
            @bottom-center {{
                content: "Page " counter(page) " of " counter(pages);
                font-size: 8px;
                color: #888;
            }}
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: Arial, Helvetica, sans-serif;
            font-size: 10px;
            line-height: 1.4;
            color: #1a1a1a;
        }}
        
        /* Header */
        .header {{
            display: table;
            width: 100%;
            border-bottom: 3px solid #1e6b35;
            padding-bottom: 10px;
            margin-bottom: 15px;
        }}
        .header-logo {{ display: table-cell; width: 70px; vertical-align: middle; }}
        .header-logo img {{ width: 60px; height: auto; }}
        .header-text {{ display: table-cell; vertical-align: middle; padding-left: 15px; }}
        .header h1 {{ font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 0; }}
        .header .subtitle {{ font-size: 12px; color: #1e6b35; font-weight: 600; margin-top: 2px; }}
        .header-meta {{ display: table-cell; text-align: right; vertical-align: middle; }}
        .header-meta .incident-number {{ font-size: 16px; font-weight: 700; color: #1e6b35; }}
        .header-meta .incident-date {{ font-size: 10px; color: #666; }}
        
        /* Info row under header */
        .info-row {{
            display: table;
            width: 100%;
            margin-bottom: 12px;
        }}
        .info-left {{ display: table-cell; width: 55%; vertical-align: top; }}
        .info-right {{ display: table-cell; width: 45%; vertical-align: top; }}
        .info-item {{ margin-bottom: 4px; }}
        .info-label {{ font-weight: 600; color: #555; display: inline; }}
        .info-value {{ display: inline; }}
        
        /* Times box */
        .times-box {{
            border: 1px solid #ccc;
            border-collapse: collapse;
            float: right;
        }}
        .times-box td {{
            padding: 2px 8px;
            border: 1px solid #ccc;
        }}
        .time-label {{ font-weight: 600; text-align: right; }}
        .time-value {{ font-family: monospace; font-size: 11px; }}
        
        /* Sections */
        .section {{
            margin-bottom: 10px;
            page-break-inside: avoid;
        }}
        .section-title {{
            font-weight: 700;
            color: #333;
            margin-bottom: 2px;
        }}
        .section-value {{
            margin: 0;
            white-space: pre-wrap;
        }}
        
        /* Narrative box */
        .narrative-box {{
            border: 1px solid #ccc;
            padding: 8px;
            background: #fafafa;
        }}
        
        /* Personnel table */
        .personnel-table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 5px;
        }}
        .personnel-table th, .personnel-table td {{
            border: 1px solid #ccc;
            padding: 5px 8px;
            text-align: left;
            vertical-align: top;
        }}
        .unit-header {{
            background: #e94560;
            color: white;
            font-weight: 600;
        }}
        .unit-names {{
            font-size: 9px;
            line-height: 1.5;
        }}
        .personnel-total {{
            margin-top: 5px;
            font-weight: 600;
        }}
        
        /* Officer section */
        .officer-section {{
            background: #f5f5f5;
            padding: 8px 12px;
            border: 1px solid #ddd;
        }}
        .officer-item {{
            margin-right: 20px;
        }}
        
        /* Data table (for CAD details) */
        .data-table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
        }}
        .data-table th {{
            background: #1e6b35;
            color: white;
            font-weight: 600;
            text-align: left;
            padding: 5px 8px;
        }}
        .data-table td {{
            padding: 4px 8px;
            border-bottom: 1px solid #e0e0e0;
        }}
        .data-table tr:nth-child(even) {{
            background: #f9f9f9;
        }}
        
        /* Page break */
        .page-break {{
            page-break-before: always;
        }}
        
        /* Footer */
        .footer {{
            margin-top: 20px;
            padding-top: 8px;
            border-top: 1px solid #ccc;
            font-size: 8px;
            color: #888;
        }}
        .footer-left {{ float: left; }}
        .footer-right {{ float: right; }}
        .footer-center {{ text-align: center; }}
        .clearfix::after {{ content: ""; display: table; clear: both; }}
    </style>
</head>
<body>
    <!-- Watermark -->
    <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.04; z-index: -1;">
        <img src="{logo_data_url}" style="width: 400px; height: auto;" alt="">
    </div>

    <!-- HEADER -->
    <div class="header">
        <div class="header-logo"><img src="{logo_data_url}" alt="Logo"></div>
        <div class="header-text">
            <h1>{station_name.upper()}</h1>
            <div class="subtitle">Incident Report</div>
        </div>
        <div class="header-meta">
            <div class="incident-number">{inc.get("internal_incident_number", "")}</div>
            <div class="incident-date">{incident_date_display}</div>
            <div class="incident-date">CAD: {inc.get("cad_event_number", "")}</div>
        </div>
    </div>
    
    <!-- INFO ROW: Left info + Right times box -->
    <div class="info-row clearfix">
        <div class="info-left">
            <div class="info-item"><span class="info-label">Date:</span> <span class="info-value">{incident_date_display}</span></div>
            <div class="info-item"><span class="info-label">Municipality:</span> <span class="info-value">{muni_display}</span></div>
            <div class="info-item"><span class="info-label">Weather:</span> <span class="info-value">{inc.get("weather_conditions", "") or ""}</span></div>
            <div class="info-item"><span class="info-label">ESZ/Box:</span> <span class="info-value">{inc.get("esz_box", "") or ""}</span></div>
        </div>
        <div class="info-right">
            {times_box_html}
        </div>
    </div>
    
    <!-- MAIN CONTENT -->
    <div class="content">
        {location_html}
        {units_called_html}
        {dispatched_as_html}
        {narrative_html}
        {personnel_html}
        {officer_html}
        {problems_html}
    </div>

    <!-- FOOTER -->
    <div class="footer clearfix">
        <span class="footer-left">CAD Event: {inc.get("cad_event_number", "")}</span>
        <span class="footer-center">Status: {inc.get("status", "")}</span>
        <span class="footer-right">Printed: {datetime.now().strftime('%m/%d/%Y, %I:%M:%S %p')}</span>
    </div>
    
    <!-- CAD UNIT DETAILS (last page if enabled) -->
    {cad_details_html}
</body>
</html>'''
    
    return HTMLResponse(content=html)
