# =============================================================================
# WEASYPRINT-COMPATIBLE INCIDENT HTML REPORT
# Replace get_incident_html_report() in reports.py with this version
# 
# Key changes:
# 1. Uses display:table instead of flexbox (WeasyPrint doesn't support flexbox well)
# 2. Proper HTML escaping to prevent layout breaking
# 3. Table-based two-column layout for times section
# 4. Table-based officer info section
# =============================================================================

@router.get("/html/incident/{incident_id}")
async def get_incident_html_report(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Generate printable HTML report for WeasyPrint PDF conversion.
    Uses table-based layout (NOT flexbox) for WeasyPrint compatibility.
    """
    from settings_helper import format_local_time, format_local_date, get_timezone
    
    incident = db.execute(text("SELECT * FROM incidents WHERE id = :id AND deleted_at IS NULL"), {"id": incident_id}).fetchone()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    inc = dict(incident._mapping)
    
    # Print settings
    ps_result = db.execute(text("SELECT value FROM settings WHERE category = 'print' AND key = 'settings'")).fetchone()
    ps = {'showHeader': True, 'showTimes': True, 'showLocation': True, 'showDispatchInfo': True, 'showSituationFound': True, 'showExtentOfDamage': True, 'showServicesProvided': True, 'showNarrative': True, 'showPersonnelGrid': True, 'showEquipmentUsed': True, 'showOfficerInfo': True, 'showProblemsIssues': True, 'showCadUnits': True, 'showCadUnitDetails': False, 'showWeather': True, 'showCrossStreets': True, 'showCallerInfo': False}
    if ps_result and ps_result[0]:
        try: ps.update(json.loads(ps_result[0]))
        except: pass
    
    # Station settings
    station_name = (db.execute(text("SELECT value FROM settings WHERE category = 'station' AND key = 'name'")).fetchone() or ["Fire Department"])[0]
    station_number = (db.execute(text("SELECT value FROM settings WHERE category = 'station' AND key = 'number'")).fetchone() or [""])[0]
    
    # Branding colors
    primary_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'primary_color'")).fetchone()
    secondary_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'secondary_color'")).fetchone()
    primary_color = primary_result[0] if primary_result else "#016a2b"
    secondary_color = secondary_result[0] if secondary_result else "#eeee01"
    
    # Personnel lookup
    personnel_rows = db.execute(text("SELECT id, first_name, last_name FROM personnel")).fetchall()
    personnel_lookup = {p[0]: f"{p[2]}, {p[1]}" for p in personnel_rows}
    
    # Apparatus lookup
    apparatus_rows = db.execute(text("SELECT id, unit_designator, name, ff_slots FROM apparatus WHERE active = true ORDER BY display_order, unit_designator")).fetchall()
    apparatus_list = [{'id': a[0], 'unit_designator': a[1], 'name': a[2], 'ff_slots': a[3] or 4} for a in apparatus_rows]
    
    def fmt_time(dt):
        if not dt: return ''
        return format_local_time(dt, include_seconds=True)
    
    def get_personnel_name(pid):
        return personnel_lookup.get(pid, '')
    
    def escape_html(text):
        """Escape HTML special characters"""
        if not text:
            return ''
        return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
    
    # Calculate in-service duration
    in_service = ''
    if inc.get('time_dispatched') and inc.get('time_last_cleared'):
        try:
            diff_seconds = (inc['time_last_cleared'] - inc['time_dispatched']).total_seconds()
            if diff_seconds > 0:
                hours = int(diff_seconds // 3600)
                mins = int((diff_seconds % 3600) // 60)
                in_service = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"
        except:
            pass
    
    # ==========================================================================
    # BUILD PERSONNEL ASSIGNMENTS
    # ==========================================================================
    personnel_assignments = {}
    
    unit_rows = db.execute(text("""
        SELECT iu.id, iu.apparatus_id, a.unit_designator, a.is_virtual
        FROM incident_units iu
        JOIN apparatus a ON iu.apparatus_id = a.id
        WHERE iu.incident_id = :incident_id
    """), {"incident_id": incident_id}).fetchall()
    
    for unit_row in unit_rows:
        unit_id, apparatus_id, unit_designator, is_virtual = unit_row
        
        pers_rows = db.execute(text("""
            SELECT personnel_id, slot_index
            FROM incident_personnel
            WHERE incident_unit_id = :unit_id
            ORDER BY slot_index
        """), {"unit_id": unit_id}).fetchall()
        
        if is_virtual:
            slots = [p[0] for p in pers_rows]
        else:
            slots = [None] * 6
            for p in pers_rows:
                personnel_id, slot_index = p
                if slot_index is not None and 0 <= slot_index < 6:
                    slots[slot_index] = personnel_id
        
        personnel_assignments[unit_designator] = slots
    
    # Get assigned units
    assigned_units = []
    for a in apparatus_list:
        slots = personnel_assignments.get(a['unit_designator'], [])
        if slots and any(s for s in slots):
            assigned_units.append(a)
    
    # Count total personnel
    total_personnel = sum(len([s for s in slots if s]) for slots in personnel_assignments.values())
    
    # Build personnel table rows
    role_names = ['Driver', 'Officer', 'FF', 'FF', 'FF', 'FF']
    personnel_rows_html = ""
    for idx, role in enumerate(role_names):
        has_data = any(
            personnel_assignments.get(a['unit_designator'], [None] * 6)[idx] if idx < len(personnel_assignments.get(a['unit_designator'], [])) else None
            for a in assigned_units
        )
        if not has_data:
            continue
        
        row = f'<tr><td class="role-cell">{role}</td>'
        for a in assigned_units:
            slots = personnel_assignments.get(a['unit_designator'], [])
            pid = slots[idx] if idx < len(slots) else None
            name = escape_html(get_personnel_name(pid)) if pid else ''
            row += f'<td>{name}</td>'
        row += '</tr>'
        personnel_rows_html += row
    
    # Build times section - TABLE based, not flex
    times_html = ""
    if ps.get('showTimes'):
        times_html = f'''<table class="times-table">
            <tr><td class="time-label">Dispatched:</td><td class="time-value">{fmt_time(inc.get('time_dispatched'))}</td></tr>
            <tr><td class="time-label">Enroute:</td><td class="time-value">{fmt_time(inc.get('time_first_enroute'))}</td></tr>
            <tr><td class="time-label">On Scene:</td><td class="time-value">{fmt_time(inc.get('time_first_on_scene'))}</td></tr>
            <tr><td class="time-label">Under Ctrl:</td><td class="time-value">{fmt_time(inc.get('time_fire_under_control'))}</td></tr>
            <tr><td class="time-label">Cleared:</td><td class="time-value">{fmt_time(inc.get('time_last_cleared'))}</td></tr>
            <tr><td class="time-label">In Service:</td><td class="time-value">{in_service}</td></tr>
        </table>'''
    
    # Personnel table
    personnel_html = ""
    if ps.get('showPersonnelGrid') and assigned_units:
        unit_headers = ''.join([f'<th>{escape_html(a["unit_designator"])}</th>' for a in assigned_units])
        personnel_html = f'''<div class="section">
            <div class="section-label">Personnel:</div>
            <table class="personnel-table">
                <thead><tr><th class="role-header">Role</th>{unit_headers}</tr></thead>
                <tbody>{personnel_rows_html}</tbody>
            </table>
            <div class="total-row">Total Personnel: {total_personnel}</div>
        </div>'''
    
    # Officer names
    oic_name = escape_html(get_personnel_name(inc.get('officer_in_charge'))) if inc.get('officer_in_charge') else ''
    completed_by_name = escape_html(get_personnel_name(inc.get('completed_by'))) if inc.get('completed_by') else ''
    
    # CAD units list
    cad_units_list = ', '.join([u.get('unit_id', '') for u in (inc.get('cad_units') or [])]) if inc.get('cad_units') else ''
    
    # Equipment list
    equipment_list = ', '.join(inc.get('equipment_used', [])) if inc.get('equipment_used') else ''
    
    # Escape text fields
    narrative_text = escape_html(inc.get('narrative', ''))
    situation_found = escape_html(inc.get('situation_found', ''))
    extent_of_damage = escape_html(inc.get('extent_of_damage', ''))
    services_provided = escape_html(inc.get('services_provided', ''))
    problems_issues = escape_html(inc.get('problems_issues', ''))
    address = escape_html(inc.get('address', ''))
    cross_streets = escape_html(inc.get('cross_streets', ''))
    weather_conditions = escape_html(inc.get('weather_conditions', ''))
    
    html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Incident {inc.get("internal_incident_number", "")}</title>
    <style>
        @page {{ size: letter; margin: 0.4in; }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #000; }}
        
        /* Header */
        .header {{ text-align: center; border-bottom: 3px solid {primary_color}; padding-bottom: 8px; margin-bottom: 12px; }}
        .header h1 {{ font-size: 14pt; margin: 0; font-weight: bold; }}
        .header h2 {{ font-size: 11pt; margin: 0; font-weight: normal; }}
        
        /* Two-column layout using TABLE - WeasyPrint compatible */
        .top-layout {{ display: table; width: 100%; margin-bottom: 12px; }}
        .top-left {{ display: table-cell; vertical-align: top; width: 60%; }}
        .top-right {{ display: table-cell; vertical-align: top; width: 40%; padding-left: 15px; }}
        
        /* Field rows */
        .field-row {{ margin-bottom: 4px; }}
        .field-row .label {{ font-weight: bold; font-size: 9pt; display: inline-block; min-width: 85px; }}
        .field-row .value {{ font-size: 10pt; }}
        .field-row .value-bold {{ font-weight: bold; font-size: 12pt; }}
        
        /* Badge */
        .badge {{ display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 8pt; font-weight: bold; margin-left: 8px; color: #fff; }}
        .badge-fire {{ background: #e74c3c; }}
        .badge-ems {{ background: #3498db; }}
        
        /* Times table - real HTML table */
        .times-table {{ width: 100%; border: 1px solid #000; border-collapse: collapse; }}
        .times-table td {{ padding: 3px 6px; border-bottom: 1px dotted #ccc; }}
        .times-table tr:last-child td {{ border-bottom: none; }}
        .time-label {{ font-size: 9pt; font-weight: bold; width: 80px; }}
        .time-value {{ font-size: 10pt; font-family: 'Courier New', monospace; text-align: right; }}
        
        /* Sections */
        .section {{ margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #ddd; }}
        .section-label {{ font-weight: bold; font-size: 9pt; margin-bottom: 4px; }}
        .section-value {{ font-size: 10pt; }}
        
        /* Narrative box - contained properly */
        .narrative-box {{ 
            white-space: pre-wrap; 
            word-wrap: break-word;
            overflow-wrap: break-word;
            padding: 8px; 
            background: #f9f9f9; 
            border: 1px solid #ddd; 
            margin-top: 4px;
            min-height: 40px;
            font-size: 10pt;
        }}
        
        /* Personnel table */
        .personnel-table {{ width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 4px; }}
        .personnel-table th, .personnel-table td {{ border: 1px solid #000; padding: 4px 6px; text-align: left; }}
        .personnel-table th {{ background: {primary_color}; color: #fff; font-weight: bold; text-align: center; }}
        .role-header {{ width: 55px; }}
        .role-cell {{ font-weight: bold; background: {secondary_color}; width: 55px; }}
        .total-row {{ margin-top: 6px; font-weight: bold; font-size: 9pt; }}
        
        /* Officer info using TABLE - side by side */
        .officer-row {{ display: table; width: 100%; }}
        .officer-cell {{ display: table-cell; width: 50%; }}
        .officer-cell .label {{ font-weight: bold; font-size: 9pt; }}
        .officer-cell .value {{ font-size: 10pt; }}
        
        /* Footer using TABLE */
        .footer {{ margin-top: 15px; padding-top: 8px; border-top: 1px solid #000; font-size: 8pt; color: #666; }}
        .footer-row {{ display: table; width: 100%; }}
        .footer-left {{ display: table-cell; text-align: left; width: 33%; }}
        .footer-center {{ display: table-cell; text-align: center; width: 34%; }}
        .footer-right {{ display: table-cell; text-align: right; width: 33%; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{escape_html(station_name)} — Station {escape_html(station_number)}</h1>
        <h2>Incident Report</h2>
    </div>
    
    <div class="top-layout">
        <div class="top-left">
            <div class="field-row">
                <span class="label">Incident #:</span>
                <span class="value value-bold">{escape_html(inc.get('internal_incident_number', ''))}</span>
                <span class="badge badge-{(inc.get('call_category') or 'fire').lower()}">{escape_html(inc.get('call_category', ''))}</span>
            </div>
            <div class="field-row">
                <span class="label">Date:</span>
                <span class="value">{inc.get('incident_date', '') or ''}</span>
            </div>
            <div class="field-row">
                <span class="label">Municipality:</span>
                <span class="value">{escape_html(inc.get('municipality_code', ''))}</span>
            </div>
            {'<div class="field-row"><span class="label">Weather:</span><span class="value">' + weather_conditions + '</span></div>' if ps.get('showWeather') and weather_conditions else ''}
            <div class="field-row">
                <span class="label">ESZ/Box:</span>
                <span class="value">{escape_html(inc.get('esz_box', ''))}</span>
            </div>
        </div>
        <div class="top-right">
            {times_html}
        </div>
    </div>
    
    {'<div class="section"><div class="section-label">Location:</div><div class="section-value">' + address + '</div>' + ('<div class="section-label" style="margin-top:4px">Cross Streets:</div><div class="section-value">' + cross_streets + '</div>' if ps.get('showCrossStreets') and cross_streets else '') + '</div>' if ps.get('showLocation') else ''}
    
    {'<div class="section"><div class="section-label">Units Called:</div><div class="section-value">' + escape_html(cad_units_list) + '</div></div>' if ps.get('showCadUnits') and cad_units_list else ''}
    
    {'<div class="section"><div class="section-label">Dispatched As:</div><div class="section-value">' + escape_html(inc.get('cad_event_type', '')) + (' / ' + escape_html(inc.get('cad_event_subtype', '')) if inc.get('cad_event_subtype') else '') + '</div></div>' if ps.get('showDispatchInfo') else ''}
    
    {'<div class="section"><div class="section-label">Situation Found:</div><div class="section-value">' + situation_found + '</div></div>' if ps.get('showSituationFound') and situation_found else ''}
    
    {'<div class="section"><div class="section-label">Extent of Damage:</div><div class="section-value">' + extent_of_damage + '</div></div>' if ps.get('showExtentOfDamage') and extent_of_damage else ''}
    
    {'<div class="section"><div class="section-label">Services Provided:</div><div class="section-value">' + services_provided + '</div></div>' if ps.get('showServicesProvided') and services_provided else ''}
    
    {'<div class="section"><div class="section-label">Narrative:</div><div class="narrative-box">' + narrative_text + '</div></div>' if ps.get('showNarrative') else ''}
    
    {'<div class="section"><div class="section-label">Equipment Used:</div><div class="section-value">' + escape_html(equipment_list) + '</div></div>' if ps.get('showEquipmentUsed') and equipment_list else ''}
    
    {personnel_html}
    
    {'<div class="section"><div class="officer-row"><div class="officer-cell"><span class="label">Officer in Charge:</span> <span class="value">' + oic_name + '</span></div><div class="officer-cell"><span class="label">Report Completed By:</span> <span class="value">' + completed_by_name + '</span></div></div></div>' if ps.get('showOfficerInfo') else ''}
    
    {'<div class="section"><div class="section-label">Problems/Issues:</div><div class="section-value">' + problems_issues + '</div></div>' if ps.get('showProblemsIssues') and problems_issues else ''}
    
    <div class="footer">
        <div class="footer-row">
            <span class="footer-left">CAD Event: {escape_html(inc.get('cad_event_number', ''))}</span>
            <span class="footer-center">Status: {escape_html(inc.get('status', ''))}</span>
            <span class="footer-right">Printed: {datetime.now().strftime('%m/%d/%Y, %I:%M:%S %p')}</span>
        </div>
    </div>
</body>
</html>'''
    
    return HTMLResponse(content=html)
