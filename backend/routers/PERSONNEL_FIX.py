# =============================================================================
# FIX FOR reports.py get_incident_html_report()
# =============================================================================
# Replace lines ~1420-1445 (the personnel_assignments section) with this code.
# This mirrors the logic from incidents.py get_incident() endpoint.
# =============================================================================

    # Build personnel_assignments the same way get_incident() does
    # Query incident_units and incident_personnel tables
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
        personnel_rows = db.execute(text("""
            SELECT personnel_id, slot_index
            FROM incident_personnel
            WHERE incident_unit_id = :unit_id
            ORDER BY slot_index
        """), {"unit_id": unit_id}).fetchall()
        
        if is_virtual:
            # Virtual units: just list personnel IDs
            slots = [p[0] for p in personnel_rows]
        else:
            # Regular units: fixed 6 slots
            slots = [None] * 6
            for p in personnel_rows:
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
