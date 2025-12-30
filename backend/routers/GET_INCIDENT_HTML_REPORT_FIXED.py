# =============================================================================
# COMPLETE REPLACEMENT FOR get_incident_html_report in reports.py
# Replace the existing function starting at @router.get("/html/incident/{incident_id}")
# =============================================================================

@router.get("/html/incident/{incident_id}")
async def get_incident_html_report(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """Generate printable HTML report - matches PrintView.jsx structure with branding colors."""
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
    
    # Branding - logo and colors
    logo_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo'")).fetchone()
    logo_mime = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'logo_mime_type'")).fetchone()
    logo_url = f"data:{logo_mime[0] if logo_mime else 'image/png'};base64,{logo_result[0]}" if logo_result and logo_result[0] else ""
    
    primary_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'primary_color'")).fetchone()
    secondary_result = db.execute(text("SELECT value FROM settings WHERE category = 'branding' AND key = 'secondary_color'")).fetchone()
    primary_color = primary_result[0] if primary_result else "#016a2b"
    secondary_color = secondary_result[0] if secondary_result else "#eeee01"
    
    # Personnel lookup - for name display (LastName, FirstName format)
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
    
    # Calculate in-service duration
    in_service = ''
    if inc.get('time_dispatched') and inc.get('time_last_cleared'):
        try:
            start = inc['time_dispatched']
            end = inc['time_last_cleared']
            diff_seconds = (end - start).total_seconds()
            if diff_seconds > 0:
                hours = int(diff_seconds // 3600)
                mins = int((diff_seconds % 3600) // 60)
                in_service = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"
        except:
            pass
    
    # ==========================================================================
    # BUILD PERSONNEL ASSIGNMENTS - Same logic as get_incident() in incidents.py
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
        
        # Get personnel for this unit
        pers_rows = db.execute(text("""
            SELECT personnel_id, slot_index
            FROM incident_personnel
            WHERE incident_unit_id = :unit_id
            ORDER BY slot_index
        """), {"unit_id": unit_id}).fetchall()
        
        if is_virtual:
            # Virtual units: just list personnel IDs
            slots = [p[0] for p in pers_rows]
        else:
            # Regular units: fixed 6 slots
            slots = [None] * 6
            for p in pers_rows:
                personnel_id, slot_index = p
                if slot_index is not None and 0 <= slot_index < 6:
                    slots[slot_index] = personnel_id
        
        personnel_assignments[unit_designator] = slots
    
    # Get assigned units (units that have at least one person)
    assigned_units = []
    for a in apparatus_list:
        slots = personnel_assignments.get(a['unit_designator'], [])
        if slots and any(s for s in slots):
            assigned_units.append(a)
    
    # Count total personnel
    total_personnel = 0
    for slots in personnel_assignments.values():
        total_personnel += len([s for s in slots if s])
    
    # Build personnel table rows (Role column + unit columns)
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
            name = get_personnel_name(pid) if pid else ''
            row += f'<td>{name}</td>'
        row += '</tr>'
        personnel_rows_html += row
    
    # Build times section
    times_html = ""
    if ps.get('showTimes'):
        times_html = f'''
        <div class="times-grid">
            <div class="time-row"><span class="time-label">Dispatched:</span><span class="time-value">{fmt_time(inc.get('time_dispatched'))}</span></div>
            <div class="time-row"><span class="time-label">Enroute:</span><span class="time-value">{fmt_time(inc.get('time_first_enroute'))}</span></div>
            <div class="time-row"><span class="time-label">On Scene:</span><span class="time-value">{fmt_time(inc.get('time_first_on_scene'))}</span></div>
            <div class="time-row"><span class="time-label">Under Ctrl:</span><span class="time-value">{fmt_time(inc.get('time_fire_under_control'))}</span></div>
            <div class="time-row"><span class="time-label">Cleared:</span><span class="time-value">{fmt_time(inc.get('time_last_cleared'))}</span></div>
            <div class="time-row"><span class="time-label">In Service:</span><span class="time-value">{in_service}</span></div>
        </div>'''
    
    # Personnel table
    personnel_html = ""
    if ps.get('showPersonnelGrid') and assigned_units:
        unit_headers = ''.join([f'<th>{a["unit_designator"]}</th>' for a in assigned_units])
        personnel_html = f'''
        <div class="section">
            <span class="label">Personnel:</span>
            <table class="personnel-table">
                <thead><tr><th>Role</th>{unit_headers}</tr></thead>
                <tbody>{personnel_rows_html}</tbody>
            </table>
            <div class="field"><span class="label">Total Personnel:</span> <span class="value">{total_personnel}</span></div>
        </div>'''
    
    # Officer names
    oic_name = get_personnel_name(inc.get('officer_in_charge')) if inc.get('officer_in_charge') else ''
    completed_by_name = get_personnel_name(inc.get('completed_by')) if inc.get('completed_by') else ''
    
    # CAD units list
    cad_units_list = ', '.join([u.get('unit_id', '') for u in (inc.get('cad_units') or [])]) if inc.get('cad_units') else ''
    
    # Equipment list
    equipment_list = ', '.join(inc.get('equipment_used', [])) if inc.get('equipment_used') else ''
    
    html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Incident {inc.get("internal_incident_number", "")}</title>
    <style>
        @page {{ size: letter; margin: 0.35in; }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.3; color: #000; }}
        
        .header {{ text-align: center; border-bottom: 2px solid {primary_color}; padding-bottom: 0.25rem; margin-bottom: 0.5rem; }}
        .header h1 {{ font-size: 14pt; margin: 0; font-weight: bold; }}
        .header h2 {{ font-size: 11pt; margin: 0; font-weight: normal; }}
        
        .top-info {{ display: flex; gap: 1rem; margin-bottom: 0.5rem; }}
        .col-left {{ flex: 1; }}
        .col-right {{ width: 180px; }}
        
        .field {{ display: flex; align-items: baseline; gap: 0.25rem; margin-bottom: 0.15rem; }}
        .field-full {{ flex-direction: column; gap: 0; }}
        .label {{ font-weight: bold; font-size: 9pt; white-space: nowrap; min-width: 80px; }}
        .value {{ font-size: 10pt; }}
        .value-bold {{ font-weight: bold; font-size: 12pt; }}
        
        .badge {{ display: inline-block; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 8pt; font-weight: bold; margin-left: 0.5rem; color: #fff; }}
        .badge-fire {{ background: #e74c3c; }}
        .badge-ems {{ background: #3498db; }}
        
        .times-grid {{ border: 1px solid #000; padding: 0.25rem; }}
        .time-row {{ display: flex; justify-content: space-between; padding: 0.1rem 0; border-bottom: 1px dotted #ccc; }}
        .time-row:last-child {{ border-bottom: none; }}
        .time-label {{ font-size: 9pt; font-weight: bold; }}
        .time-value {{ font-size: 10pt; font-family: 'Courier New', monospace; min-width: 70px; text-align: right; }}
        
        .section {{ margin-bottom: 0.35rem; padding-bottom: 0.25rem; border-bottom: 1px solid #ddd; }}
        
        .narrative {{ white-space: pre-wrap; margin-top: 0.15rem; padding: 0.25rem; background: #f9f9f9; border: 1px solid #ddd; min-height: 0.5in; }}
        
        .personnel-table {{ width: 100%; border-collapse: collapse; font-size: 9pt; }}
        .personnel-table th, .personnel-table td {{ border: 1px solid #000; padding: 0.15rem 0.25rem; text-align: left; }}
        .personnel-table th {{ background: {primary_color}; color: #fff; font-weight: bold; text-align: center; }}
        .role-cell {{ font-weight: bold; width: 50px; background: {secondary_color}; }}
        
        .footer {{ margin-top: 0.5rem; padding-top: 0.25rem; border-top: 1px solid #000; display: flex; justify-content: space-between; font-size: 8pt; color: #666; }}
        
        @media print {{
            body {{ background: #fff; }}
            .section {{ page-break-inside: avoid; }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{station_name} — Station {station_number}</h1>
        <h2>Incident Report</h2>
    </div>
    
    <div class="top-info">
        <div class="col-left">
            <div class="field">
                <span class="label">Incident #:</span>
                <span class="value value-bold">{inc.get('internal_incident_number', '')}</span>
                <span class="badge badge-{(inc.get('call_category') or 'fire').lower()}">{inc.get('call_category', '')}</span>
            </div>
            <div class="field">
                <span class="label">Date:</span>
                <span class="value">{inc.get('incident_date', '') or ''}</span>
            </div>
            <div class="field">
                <span class="label">Municipality:</span>
                <span class="value">{inc.get('municipality_code', '') or ''}</span>
            </div>
            {f'<div class="field"><span class="label">Weather:</span><span class="value">{inc.get("weather_conditions", "")}</span></div>' if ps.get('showWeather') and inc.get('weather_conditions') else ''}
            <div class="field">
                <span class="label">ESZ/Box:</span>
                <span class="value">{inc.get('esz_box', '') or ''}</span>
            </div>
        </div>
        <div class="col-right">
            {times_html}
        </div>
    </div>
    
    {f"""<div class="section">
        <div class="field field-full">
            <span class="label">Location:</span>
            <span class="value">{inc.get('address', '') or ''}</span>
        </div>
        {f'<div class="field field-full"><span class="label">Cross Streets:</span><span class="value">{inc.get("cross_streets", "")}</span></div>' if ps.get('showCrossStreets') and inc.get('cross_streets') else ''}
    </div>""" if ps.get('showLocation') else ''}
    
    {f"""<div class="section">
        <div class="field field-full">
            <span class="label">Units Called:</span>
            <span class="value">{cad_units_list}</span>
        </div>
    </div>""" if ps.get('showCadUnits') and cad_units_list else ''}
    
    {f"""<div class="section">
        <div class="field field-full">
            <span class="label">Dispatched As:</span>
            <span class="value">{inc.get('cad_event_type', '')}{(' / ' + inc.get('cad_event_subtype')) if inc.get('cad_event_subtype') else ''}</span>
        </div>
    </div>""" if ps.get('showDispatchInfo') else ''}
    
    {f"""<div class="section">
        <div class="field field-full">
            <span class="label">Situation Found:</span>
            <span class="value">{inc.get('situation_found', '')}</span>
        </div>
    </div>""" if ps.get('showSituationFound') and inc.get('situation_found') else ''}
    
    {f"""<div class="section">
        <div class="field field-full">
            <span class="label">Extent of Damage:</span>
            <span class="value">{inc.get('extent_of_damage', '')}</span>
        </div>
    </div>""" if ps.get('showExtentOfDamage') and inc.get('extent_of_damage') else ''}
    
    {f"""<div class="section">
        <div class="field field-full">
            <span class="label">Services Provided:</span>
            <span class="value">{inc.get('services_provided', '')}</span>
        </div>
    </div>""" if ps.get('showServicesProvided') and inc.get('services_provided') else ''}
    
    {f"""<div class="section">
        <div class="field field-full">
            <span class="label">Narrative:</span>
            <div class="value narrative">{inc.get('narrative', '')}</div>
        </div>
    </div>""" if ps.get('showNarrative') and inc.get('narrative') else ''}
    
    {f"""<div class="section">
        <div class="field field-full">
            <span class="label">Equipment Used:</span>
            <span class="value">{equipment_list}</span>
        </div>
    </div>""" if ps.get('showEquipmentUsed') and equipment_list else ''}
    
    {personnel_html}
    
    {f"""<div class="section" style="display: flex; gap: 2rem;">
        <div class="field">
            <span class="label">Officer in Charge:</span>
            <span class="value">{oic_name}</span>
        </div>
        <div class="field">
            <span class="label">Report Completed By:</span>
            <span class="value">{completed_by_name}</span>
        </div>
    </div>""" if ps.get('showOfficerInfo') else ''}
    
    {f"""<div class="section">
        <div class="field field-full">
            <span class="label">Problems/Issues:</span>
            <span class="value">{inc.get('problems_issues', '')}</span>
        </div>
    </div>""" if ps.get('showProblemsIssues') and inc.get('problems_issues') else ''}
    
    <div class="footer">
        <span>CAD Event: {inc.get('cad_event_number', '')}</span>
        <span>Status: {inc.get('status', '')}</span>
        <span>Printed: {datetime.now().strftime('%m/%d/%Y, %I:%M:%S %p')}</span>
    </div>
</body>
</html>'''
    
    return HTMLResponse(content=html)
