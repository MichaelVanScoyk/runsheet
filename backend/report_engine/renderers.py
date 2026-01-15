"""
Field Renderers for Incident Reports

Each renderer function takes incident data and returns HTML for that field.
Renderers are registered in FIELD_RENDERERS dict for dynamic lookup.
"""

from html import escape as html_escape
from datetime import datetime
from typing import Dict, List, Optional, Callable, Any

from .templates import get_width_class
from .branding_config import format_footer_template


class RenderContext:
    """Context object passed to all renderers with everything they need."""
    def __init__(
        self,
        incident: dict,
        branding: dict,
        personnel_lookup: Dict[int, str],
        apparatus_list: List[dict],
        personnel_assignments: Dict[str, List[Optional[int]]],
        time_formatter: Callable,
        municipality_lookup: Dict[str, str] = None,
    ):
        self.incident = incident
        self.branding = branding
        self.personnel_lookup = personnel_lookup
        self.apparatus_list = apparatus_list
        self.personnel_assignments = personnel_assignments
        self.fmt_time = time_formatter
        self.municipality_lookup = municipality_lookup or {}
        
        self.call_category = incident.get('call_category', 'FIRE') or 'FIRE'
        self.in_service = self._calc_in_service()
    
    def _calc_in_service(self) -> str:
        inc = self.incident
        if inc.get('time_dispatched') and inc.get('time_last_cleared'):
            try:
                diff_seconds = (inc['time_last_cleared'] - inc['time_dispatched']).total_seconds()
                if diff_seconds > 0:
                    hours = int(diff_seconds // 3600)
                    mins = int((diff_seconds % 3600) // 60)
                    secs = int(diff_seconds % 60)
                    if hours > 0:
                        return f"{hours}h {mins}m {secs}s"
                    elif mins > 0:
                        return f"{mins}m {secs}s"
                    else:
                        return f"{secs}s"
            except:
                pass
        return ''
    
    def get(self, key: str, default: Any = None) -> Any:
        return self.incident.get(key, default)
    
    def get_personnel_name(self, pid: Optional[int]) -> str:
        if not pid:
            return ''
        return self.personnel_lookup.get(pid, '')
    
    def get_assigned_units(self, category: str = None) -> List[dict]:
        assigned = []
        for a in self.apparatus_list:
            unit_id = a['unit_designator']
            slots = self.personnel_assignments.get(unit_id, [])
            if any(s for s in slots):
                if category is None or a.get('unit_category') == category:
                    assigned.append(a)
        return assigned


def esc(text: Any) -> str:
    if text is None:
        return ''
    return html_escape(str(text))


# =============================================================================
# FIELD RENDERERS
# =============================================================================

def r_header(ctx: RenderContext, block: dict) -> str:
    return ''  # Header rendered separately via templates.render_header()


def r_internal_incident_number(ctx: RenderContext, block: dict) -> str:
    return f'<span class="inc-number">{esc(ctx.get("internal_incident_number", ""))}</span>'


def r_call_category(ctx: RenderContext, block: dict) -> str:
    cat = ctx.call_category
    return f'<span class="badge badge-{cat.lower()}">{cat}</span>'


def r_cad_event_number(ctx: RenderContext, block: dict) -> str:
    return f'<span class="cad-number">CAD: {esc(ctx.get("cad_event_number", ""))}</span>'


def r_incident_date(ctx: RenderContext, block: dict) -> str:
    d = ctx.get('incident_date', '')
    return f'<span class="inc-date">{d}</span>'


def r_times_group(ctx: RenderContext, block: dict) -> str:
    inc = ctx.incident
    fmt = ctx.fmt_time
    return f'''<div class="times-box">
        <table class="times-table">
            <tr><td class="time-label">Dispatched:</td><td class="time-value">{fmt(inc.get('time_dispatched'))}</td></tr>
            <tr><td class="time-label">Enroute:</td><td class="time-value">{fmt(inc.get('time_first_enroute'))}</td></tr>
            <tr><td class="time-label">On Scene:</td><td class="time-value">{fmt(inc.get('time_first_on_scene'))}</td></tr>
            <tr><td class="time-label">Under Ctrl:</td><td class="time-value">{fmt(inc.get('time_fire_under_control'))}</td></tr>
            <tr><td class="time-label">Cleared:</td><td class="time-value">{fmt(inc.get('time_last_cleared'))}</td></tr>
            <tr><td class="time-label">In Service:</td><td class="time-value">{ctx.in_service}</td></tr>
        </table>
    </div>'''


def r_cad_event_type(ctx: RenderContext, block: dict) -> str:
    t = esc(ctx.get('cad_event_type', ''))
    if not t:
        return ''
    return f'<div class="cad-type">{t}</div>'


def r_cad_event_subtype(ctx: RenderContext, block: dict) -> str:
    s = esc(ctx.get('cad_event_subtype', ''))
    if not s:
        return ''
    return f'<div class="cad-subtype">{s}</div>'


def r_address(ctx: RenderContext, block: dict) -> str:
    addr = esc(ctx.get('address', ''))
    if not addr:
        return ''
    return f'<div class="address">{addr}</div>'


def r_cross_streets(ctx: RenderContext, block: dict) -> str:
    cs = esc(ctx.get('cross_streets', ''))
    if not cs:
        return ''
    return f'<div class="cross-streets">({cs})</div>'


def r_municipality_code(ctx: RenderContext, block: dict) -> str:
    code = ctx.get('municipality_code', '')
    if not code:
        return ''
    # Use display_name from lookup, fall back to code
    display = ctx.municipality_lookup.get(code, code)
    return f'<span class="muni">{esc(display)}</span>'


def r_esz_box(ctx: RenderContext, block: dict) -> str:
    e = esc(ctx.get('esz_box', ''))
    if not e:
        return ''
    return f'<span class="esz">ESZ: {e}</span>'


def r_units_called(ctx: RenderContext, block: dict) -> str:
    cad_units = ctx.get('cad_units') or []
    if not cad_units:
        return ''
    units_str = ', '.join([u.get('unit_id', '') for u in cad_units if u.get('unit_id')])
    if not units_str:
        return ''
    return f'<div class="field"><span class="label">Units:</span> {esc(units_str)}</div>'


def r_caller_name(ctx: RenderContext, block: dict) -> str:
    n = esc(ctx.get('caller_name', ''))
    if not n:
        return ''
    return f'<div class="field"><span class="label">Caller:</span> {n}</div>'


def r_caller_phone(ctx: RenderContext, block: dict) -> str:
    p = esc(ctx.get('caller_phone', ''))
    if not p:
        return ''
    return f'<div class="field"><span class="label">Phone:</span> {p}</div>'


def r_weather_conditions(ctx: RenderContext, block: dict) -> str:
    w = esc(ctx.get('weather_conditions', ''))
    if not w:
        return ''
    return f'<div class="field"><span class="label">Weather:</span> {w}</div>'


def r_situation_found(ctx: RenderContext, block: dict) -> str:
    s = esc(ctx.get('situation_found', ''))
    if not s:
        return ''
    return f'<div class="field"><span class="label">Situation Found:</span> {s}</div>'


def r_extent_of_damage(ctx: RenderContext, block: dict) -> str:
    e = esc(ctx.get('extent_of_damage', ''))
    if not e:
        return ''
    return f'<div class="field"><span class="label">Extent of Damage:</span> {e}</div>'


def r_services_provided(ctx: RenderContext, block: dict) -> str:
    s = esc(ctx.get('services_provided', ''))
    if not s:
        return ''
    return f'<div class="field"><span class="label">Services Provided:</span> {s}</div>'


def r_narrative(ctx: RenderContext, block: dict) -> str:
    n = esc(ctx.get('narrative', ''))
    if not n:
        return ''
    return f'<div class="field"><span class="label">Narrative:</span><div class="narrative-box">{n}</div></div>'


def r_problems_issues(ctx: RenderContext, block: dict) -> str:
    p = esc(ctx.get('problems_issues', ''))
    if not p:
        return ''
    return f'<div class="field"><span class="label">Problems/Issues:</span> {p}</div>'


def r_equipment_used(ctx: RenderContext, block: dict) -> str:
    e = ctx.get('equipment_used') or []
    if not e:
        return ''
    if isinstance(e, list):
        e = ', '.join(e)
    return f'<div class="field"><span class="label">Equipment Used:</span> {esc(e)}</div>'


def r_personnel_apparatus(ctx: RenderContext, block: dict) -> str:
    return _render_personnel_grid(ctx, 'APPARATUS', block)


def r_personnel_direct(ctx: RenderContext, block: dict) -> str:
    return _render_personnel_grid(ctx, 'DIRECT', block)


def r_personnel_station(ctx: RenderContext, block: dict) -> str:
    return _render_personnel_grid(ctx, 'STATION', block)


# =============================================================================
# SLOT COUNT FILTER - Also exists in:
#   - frontend/src/components/RunSheet/sections/PersonnelGrid.jsx
#   - frontend/src/components/IncidentHubModal/QuickEntrySection.jsx
# TODO: If touching this logic again, consolidate into shared helper function
# =============================================================================
def _get_slot_count(unit: dict) -> int:
    """Calculate total personnel slots for a unit (driver + officer + ff_slots)."""
    return (1 if unit.get('has_driver', False) else 0) + \
           (1 if unit.get('has_officer', False) else 0) + \
           (unit.get('ff_slots') or 0)


def _get_units_for_category(ctx: RenderContext, category: str, show_when_empty: bool) -> List[dict]:
    """Get units for a category - either assigned only, or all if showWhenEmpty."""
    if show_when_empty:
        # Return ALL units in this category (for placeholder display)
        units = [a for a in ctx.apparatus_list if a.get('unit_category') == category]
    else:
        # Return only units with assignments
        units = ctx.get_assigned_units(category)
    
    # For APPARATUS category, filter out 0-slot units (e.g., CHF48, FP48)
    if category == 'APPARATUS':
        units = [u for u in units if _get_slot_count(u) > 0]
    
    return units


def _render_personnel_grid(ctx: RenderContext, category: str, block: dict) -> str:
    """
    Unified personnel grid renderer for all categories (APPARATUS, DIRECT, STATION).
    
    - APPARATUS: Shows Role column (Driver, Officer, FF slots)
    - DIRECT/STATION: No Role column, unlimited personnel rows
    - Section title comes from first unit's name field
    - Column headers use unit name (not unit_designator)
    """
    show_when_empty = block.get('showWhenEmpty', False)
    units = _get_units_for_category(ctx, category, show_when_empty)
    
    if not units:
        return ''
    
    # Section title from first unit's name
    section_title = units[0].get('name', category)
    
    # Check if this is a role-based category (APPARATUS) or simple list (DIRECT/STATION)
    is_apparatus = category == 'APPARATUS'
    
    if is_apparatus:
        return _render_apparatus_grid(ctx, units, section_title, show_when_empty, block)
    else:
        return _render_simple_grid(ctx, units, section_title, show_when_empty, block)


def _render_apparatus_grid(ctx: RenderContext, units: List[dict], title: str, show_when_empty: bool, block: dict) -> str:
    """Render apparatus personnel with Role column (Driver, Officer, FF slots)."""
    
    # Determine max slots needed across all units
    role_names = ['Driver', 'Officer', 'FF', 'FF', 'FF', 'FF']
    rows_html = ""
    
    for idx, role in enumerate(role_names):
        # Check if any unit has data in this slot
        has_data = any(
            ctx.personnel_assignments.get(a['unit_designator'], [None]*6)[idx] 
            if idx < len(ctx.personnel_assignments.get(a['unit_designator'], [])) else None
            for a in units
        )
        
        # Skip empty rows unless showWhenEmpty and it's a configured slot
        if not has_data:
            if show_when_empty:
                # Only show if at least one unit has this role configured
                show_role = False
                for a in units:
                    if idx == 0 and a.get('has_driver', True):
                        show_role = True
                        break
                    elif idx == 1 and a.get('has_officer', True):
                        show_role = True
                        break
                    elif idx >= 2:
                        # FF slots - always show at least one if showWhenEmpty
                        show_role = True
                        break
                if not show_role:
                    continue
            else:
                continue
        
        row = f'<tr><td class="role-cell">{role}</td>'
        for a in units:
            slots = ctx.personnel_assignments.get(a['unit_designator'], [])
            pid = slots[idx] if idx < len(slots) else None
            name = ctx.get_personnel_name(pid)
            row += f'<td>{esc(name)}</td>'
        row += '</tr>'
        rows_html += row
    
    # If no rows and not showWhenEmpty, return empty
    if not rows_html and not show_when_empty:
        return ''
    
    # Column headers use unit NAME (not unit_designator)
    unit_headers = ''.join([f'<th>{esc(a.get("name", a["unit_designator"]))}</th>' for a in units])
    
    # Section title - use block's name if hideLabel is False, otherwise no title
    hide_label = block.get('hideLabel', False)
    section_title = block.get('name', title) if not hide_label else None
    title_html = f'<div class="personnel-section-title">{esc(section_title)}</div>' if section_title else ''
    
    return f'''<div class="personnel-section">
        {title_html}
        <table class="personnel-table">
            <thead><tr><th class="role-header">Role</th>{unit_headers}</tr></thead>
            <tbody>{rows_html}</tbody>
        </table>
    </div>'''


def _render_simple_grid(ctx: RenderContext, units: List[dict], title: str, show_when_empty: bool, block: dict) -> str:
    """Render DIRECT/STATION personnel - no Role column, unlimited rows."""
    
    # Gather all personnel per unit (unlimited)
    unit_personnel = {}
    max_rows = 0
    for a in units:
        unit_id = a['unit_designator']
        slots = ctx.personnel_assignments.get(unit_id, [])
        # Filter to actual assignments (no nulls)
        assigned = [pid for pid in slots if pid]
        unit_personnel[unit_id] = assigned
        if len(assigned) > max_rows:
            max_rows = len(assigned)
    
    # If no assignments and not showWhenEmpty, return empty
    if max_rows == 0 and not show_when_empty:
        return ''
    
    # Ensure at least one empty row if showWhenEmpty
    if show_when_empty and max_rows == 0:
        max_rows = 1
    
    # Build rows
    rows_html = ""
    for row_idx in range(max_rows):
        row = '<tr>'
        for a in units:
            unit_id = a['unit_designator']
            assigned = unit_personnel.get(unit_id, [])
            pid = assigned[row_idx] if row_idx < len(assigned) else None
            name = ctx.get_personnel_name(pid)
            row += f'<td>{esc(name)}</td>'
        row += '</tr>'
        rows_html += row
    
    # Column headers use unit NAME
    unit_headers = ''.join([f'<th>{esc(a.get("name", a["unit_designator"]))}</th>' for a in units])
    
    # Section title - use block's name if hideLabel is False, otherwise no title
    hide_label = block.get('hideLabel', False)
    section_title = block.get('name', title) if not hide_label else None
    title_html = f'<div class="personnel-section-title">{esc(section_title)}</div>' if section_title else ''
    
    return f'''<div class="personnel-section">
        {title_html}
        <table class="personnel-table">
            <thead><tr>{unit_headers}</tr></thead>
            <tbody>{rows_html}</tbody>
        </table>
    </div>'''


def r_officer_in_charge(ctx: RenderContext, block: dict) -> str:
    oic = ctx.get_personnel_name(ctx.get('officer_in_charge'))
    return f'<div class="officer-cell"><span class="label">Officer in Charge:</span> {esc(oic)}</div>'


def r_completed_by(ctx: RenderContext, block: dict) -> str:
    cb = ctx.get_personnel_name(ctx.get('completed_by'))
    return f'<div class="officer-cell"><span class="label">Report Completed By:</span> {esc(cb)}</div>'


def r_total_responders(ctx: RenderContext, block: dict) -> str:
    """Render total responders count across all personnel categories."""
    total = 0
    for unit_id, slots in ctx.personnel_assignments.items():
        total += len([s for s in slots if s])
    
    if total == 0:
        return ''
    
    hide_label = block.get('hideLabel', False)
    label = block.get('name', 'Total Responders')
    
    if hide_label:
        return f'<div class="field"><span class="total-value">{total}</span></div>'
    else:
        return f'<div class="field"><span class="label">{esc(label)}:</span> <span class="total-value">{total}</span></div>'


def r_footer(ctx: RenderContext, block: dict) -> str:
    branding = ctx.branding
    inc = ctx.incident
    
    footer_context = {
        'station_name': branding.get('station_name', ''),
        'station_short_name': branding.get('station_short_name', '') or branding.get('station_name', ''),
        'station_number': branding.get('station_number', ''),
        'incident_number': inc.get('internal_incident_number', ''),
        'cad_event_number': inc.get('cad_event_number', ''),
        'status': inc.get('status', ''),
        'call_category': ctx.call_category,
        'print_date': datetime.now().strftime('%m/%d/%Y'),
        'print_time': datetime.now().strftime('%I:%M %p'),
        'incident_date': str(inc.get('incident_date', '')),
    }
    
    left = format_footer_template(branding.get('footer_left', ''), footer_context)
    center = format_footer_template(branding.get('footer_center', ''), footer_context)
    right = format_footer_template(branding.get('footer_right', ''), footer_context)
    
    if branding.get('show_cad_in_footer', True) and '{cad_event_number}' not in (branding.get('footer_left', '') or ''):
        if left:
            left = f"CAD: {esc(inc.get('cad_event_number', ''))} | {left}"
        else:
            left = f"CAD: {esc(inc.get('cad_event_number', ''))}"
    
    return f'''<div class="footer clearfix">
        <span class="footer-left">{esc(left)}</span>
        <span class="footer-center">{esc(center)}</span>
        <span class="footer-right">{esc(right)}</span>
    </div>'''


def r_cad_unit_details(ctx: RenderContext, block: dict) -> str:
    """
    Render CAD Unit Details table with times.
    
    Block options:
    - showOurUnitsOnly: If true, filter to only show station's units (not mutual aid)
    - showAvailableTime: If true, include the Available time column
    
    Uses apparatus names from apparatus_list when available, falls back to CAD unit ID.
    """
    cad_units = ctx.get('cad_units') or []
    if not cad_units:
        return ''
    
    # Build lookup for apparatus names: unit_designator -> name
    apparatus_names = {}
    for a in ctx.apparatus_list:
        apparatus_names[a.get('unit_designator', '')] = a.get('name', '')
    
    # Filter units if showOurUnitsOnly is enabled
    show_our_only = block.get('showOurUnitsOnly', False)
    if show_our_only:
        cad_units = [u for u in cad_units if not u.get('is_mutual_aid', True)]
    
    if not cad_units:
        return ''
    
    # Check if we should show Available time column
    show_available = block.get('showAvailableTime', False)
    
    # Helper to format time - handles both ISO strings and raw time strings
    def fmt_unit_time(time_val):
        if not time_val:
            return ''
        # If it's an ISO datetime string, use the context formatter
        if isinstance(time_val, str) and 'T' in time_val:
            try:
                from datetime import datetime as dt_class
                # Parse ISO format
                if time_val.endswith('Z'):
                    time_val = time_val[:-1] + '+00:00'
                dt = dt_class.fromisoformat(time_val)
                return ctx.fmt_time(dt)
            except:
                pass
        # Otherwise return as-is (already formatted or raw time)
        return esc(str(time_val))
    
    # Build rows
    rows = []
    for u in cad_units:
        unit_id = u.get('unit_id', '')
        # Use apparatus name if available, otherwise CAD unit ID
        display_name = apparatus_names.get(unit_id, '') or unit_id
        
        row_cells = [
            f'<td>{esc(display_name)}</td>',
            f'<td>{fmt_unit_time(u.get("time_dispatched"))}</td>',
            f'<td>{fmt_unit_time(u.get("time_enroute"))}</td>',
            f'<td>{fmt_unit_time(u.get("time_arrived"))}</td>',
        ]
        
        if show_available:
            row_cells.append(f'<td>{fmt_unit_time(u.get("time_available"))}</td>')
        
        row_cells.append(f'<td>{fmt_unit_time(u.get("time_cleared"))}</td>')
        
        rows.append(f'<tr>{"".join(row_cells)}</tr>')
    
    # Build header
    header_cells = ['<th>Unit</th>', '<th>Dispatched</th>', '<th>Enroute</th>', '<th>Arrived</th>']
    if show_available:
        header_cells.append('<th>Available</th>')
    header_cells.append('<th>Cleared</th>')
    
    # Determine label
    hide_label = block.get('hideLabel', False)
    label = block.get('name', 'CAD Unit Details') if not hide_label else None
    label_html = f'<span class="label">{esc(label)}:</span>' if label else ''
    
    return f'''<div class="field">
        {label_html}
        <table class="cad-table">
            <thead><tr>{"".join(header_cells)}</tr></thead>
            <tbody>{"".join(rows)}</tbody>
        </table>
    </div>'''


def r_property_value_at_risk(ctx: RenderContext, block: dict) -> str:
    v = ctx.get('property_value_at_risk')
    if not v:
        return ''
    dollars = v / 100 if v else 0
    return f'''<div class="stat-box">
        <div class="stat-value">${dollars:,.0f}</div>
        <div class="stat-label">Property at Risk</div>
    </div>'''


def r_fire_damages_estimate(ctx: RenderContext, block: dict) -> str:
    v = ctx.get('fire_damages_estimate')
    if not v:
        return ''
    dollars = v / 100 if v else 0
    return f'''<div class="stat-box">
        <div class="stat-value">${dollars:,.0f}</div>
        <div class="stat-label">Fire Damages</div>
    </div>'''


def r_ff_injuries_count(ctx: RenderContext, block: dict) -> str:
    v = ctx.get('ff_injuries_count')
    if not v:
        return ''
    return f'''<div class="stat-box">
        <div class="stat-value">{v}</div>
        <div class="stat-label">FF Injuries</div>
    </div>'''


def r_civilian_injuries_count(ctx: RenderContext, block: dict) -> str:
    v = ctx.get('civilian_injuries_count')
    if not v:
        return ''
    return f'''<div class="stat-box">
        <div class="stat-value">{v}</div>
        <div class="stat-label">Civilian Injuries</div>
    </div>'''


def r_neris_aid_direction(ctx: RenderContext, block: dict) -> str:
    v = esc(ctx.get('neris_aid_direction', ''))
    if not v:
        return ''
    return f'<div class="field"><span class="label">Aid Direction:</span> {v}</div>'


def r_neris_aid_departments(ctx: RenderContext, block: dict) -> str:
    v = ctx.get('neris_aid_departments') or []
    if not v:
        return ''
    return f'<div class="field"><span class="label">Aid Departments:</span> {esc(", ".join(v))}</div>'


def r_neris_incident_types(ctx: RenderContext, block: dict) -> str:
    v = ctx.get('neris_incident_type_codes') or []
    if not v:
        return ''
    return f'<div class="field"><span class="label">NERIS Incident Types:</span> {esc(", ".join(v))}</div>'


def r_neris_actions(ctx: RenderContext, block: dict) -> str:
    v = ctx.get('neris_action_codes') or []
    if not v:
        return ''
    return f'<div class="field"><span class="label">NERIS Actions:</span> {esc(", ".join(v))}</div>'


def _get_event_comments(ctx: RenderContext) -> List[dict]:
    """Extract and filter event comments from incident data."""
    cad_event_data = ctx.get('cad_event_comments') or {}
    
    # Handle both old list format and new dict format
    if isinstance(cad_event_data, list):
        # Old format: direct list of comments
        comments = cad_event_data
    elif isinstance(cad_event_data, dict):
        # New format: dict with 'comments' key
        comments = cad_event_data.get('comments', [])
    else:
        comments = []
    
    if not comments:
        return []
    
    # Filter out noise comments for display
    return [c for c in comments if not c.get('is_noise', False)]


def r_event_comments_chronological(ctx: RenderContext, block: dict) -> str:
    """
    Render CAD Event Comments in chronological order (unaltered).
    
    Shows all comments in time order with:
    - Time
    - Operator (who entered it)
    - Text (original, unmodified)
    
    This is the raw CAD log view without ML categorization.
    """
    display_comments = _get_event_comments(ctx)
    
    if not display_comments:
        return ''
    
    return _render_chronological_comments(display_comments)


def r_event_comments_categorized(ctx: RenderContext, block: dict) -> str:
    """
    Render CAD Event Comments grouped by ML-predicted category.
    
    Groups comments into:
    - CALLER: Caller information
    - TACTICAL: Command & tactical operations
    - OPERATIONS: Resource coordination
    - UNIT: Unit status updates
    - OTHER: Uncategorized
    
    Uses ComCat ML model for categorization.
    """
    display_comments = _get_event_comments(ctx)
    
    if not display_comments:
        return ''
    
    return _render_categorized_comments(display_comments)


def r_spacer(ctx: RenderContext, block: dict) -> str:
    """Render a blank spacer row for layout control."""
    return '<div class="spacer">&nbsp;</div>'


def _render_categorized_comments(comments: List[dict]) -> str:
    """Render comments grouped by category."""
    sections = []
    
    # Category order and display names (matching comment_processor.py output)
    category_order = [
        ('CALLER', 'Caller Information'),
        ('TACTICAL', 'Command & Tactical'),
        ('OPERATIONS', 'Operations'),
        ('UNIT', 'Unit Activity'),
        ('UNCATEGORIZED', 'Other'),
    ]
    
    for category, title in category_order:
        # Use 'category' field from comment_processor
        cat_comments = [c for c in comments if c.get('category') == category]
        if not cat_comments:
            continue
        
        rows = []
        for c in cat_comments:
            time_str = esc(c.get('time', ''))
            text = esc(c.get('text', ''))
            rows.append(f'<tr><td class="comment-time">{time_str}</td><td class="comment-text">{text}</td></tr>')
        
        sections.append(
            f'<div class="comment-section">'
            f'<div class="comment-section-title">{title}</div>'
            f'<table class="event-comments-table">{"\n".join(rows)}</table>'
            f'</div>'
        )
    
    if not sections:
        return ''
    
    return f'<div class="event-comments-container"><div class="event-comments-header">Event Comments</div>{"\n".join(sections)}</div>'


def _render_chronological_comments(comments: List[dict]) -> str:
    """Render comments in chronological order."""
    rows = []
    for c in comments:
        time_str = esc(c.get('time', ''))
        operator = esc(c.get('operator', ''))
        text = esc(c.get('text', ''))
        rows.append(
            f'<tr>'
            f'<td class="comment-time">{time_str}</td>'
            f'<td class="comment-operator">{operator}</td>'
            f'<td class="comment-text">{text}</td>'
            f'</tr>'
        )
    
    if not rows:
        return ''
    
    return (
        f'<div class="event-comments-container">'
        f'<div class="event-comments-header">Event Comments</div>'
        f'<table class="event-comments-table event-comments-chrono">{"\n".join(rows)}</table>'
        f'</div>'
    )


# =============================================================================
# RENDERER REGISTRY
# =============================================================================

FIELD_RENDERERS: Dict[str, Callable[[RenderContext, dict], str]] = {
    'header': r_header,
    'internal_incident_number': r_internal_incident_number,
    'call_category': r_call_category,
    'cad_event_number': r_cad_event_number,
    'incident_date': r_incident_date,
    'times_group': r_times_group,
    'cad_event_type': r_cad_event_type,
    'cad_event_subtype': r_cad_event_subtype,
    'address': r_address,
    'cross_streets': r_cross_streets,
    'municipality_code': r_municipality_code,
    'esz_box': r_esz_box,
    'units_called': r_units_called,
    'caller_name': r_caller_name,
    'caller_phone': r_caller_phone,
    'weather_conditions': r_weather_conditions,
    'situation_found': r_situation_found,
    'extent_of_damage': r_extent_of_damage,
    'services_provided': r_services_provided,
    'narrative': r_narrative,
    'problems_issues': r_problems_issues,
    'equipment_used': r_equipment_used,
    'personnel_apparatus': r_personnel_apparatus,
    'personnel_direct': r_personnel_direct,
    'personnel_station': r_personnel_station,
    'total_responders': r_total_responders,
    'officer_in_charge': r_officer_in_charge,
    'completed_by': r_completed_by,
    'footer': r_footer,
    'cad_unit_details': r_cad_unit_details,
    'property_value_at_risk': r_property_value_at_risk,
    'fire_damages_estimate': r_fire_damages_estimate,
    'ff_injuries_count': r_ff_injuries_count,
    'civilian_injuries_count': r_civilian_injuries_count,
    'neris_aid_direction': r_neris_aid_direction,
    'neris_aid_departments': r_neris_aid_departments,
    'neris_incident_types': r_neris_incident_types,
    'neris_actions': r_neris_actions,
    'event_comments_chronological': r_event_comments_chronological,
    'event_comments_categorized': r_event_comments_categorized,
    'spacer_1': r_spacer,
    'spacer_2': r_spacer,
    'spacer_3': r_spacer,
    'spacer_4': r_spacer,
    'spacer_5': r_spacer,
    'spacer_6': r_spacer,
    'spacer_7': r_spacer,
    'spacer_8': r_spacer,
    'spacer_9': r_spacer,
    'spacer_10': r_spacer,
    'spacer_11': r_spacer,
    'spacer_12': r_spacer,
    'spacer_13': r_spacer,
}


def render_field(ctx: RenderContext, block: dict) -> str:
    renderer = FIELD_RENDERERS.get(block.get('id'))
    if not renderer:
        return ''
    return renderer(ctx, block)


# =============================================================================
# STYLE HELPERS
# =============================================================================

FONT_SIZE_MAP = {
    'xs': '10px',
    'sm': '12px',
    'base': '14px',
    'lg': '16px',
    'xl': '18px',
}

TEXT_COLOR_MAP = {
    'muted': '#666666',
    'primary': '#016a2b',
    'secondary': '#b8860b',  # Darker yellow for readability
    'danger': '#c0392b',
    'info': '#2980b9',
}


def get_block_style(block: dict) -> str:
    """Build inline style string from block settings."""
    styles = []
    
    # Font size
    font_size = block.get('fontSize')
    if font_size and font_size in FONT_SIZE_MAP:
        styles.append(f'font-size: {FONT_SIZE_MAP[font_size]}')
    
    # Bold
    if block.get('bold'):
        styles.append('font-weight: bold')
    
    # Text color
    text_color = block.get('textColor')
    if text_color and text_color in TEXT_COLOR_MAP:
        styles.append(f'color: {TEXT_COLOR_MAP[text_color]}')
    
    return '; '.join(styles) if styles else ''


def get_block_classes(block: dict) -> List[str]:
    """Build list of CSS classes from block settings."""
    classes = []
    
    if block.get('labelBold') is False:
        classes.append('label-normal')
    
    if block.get('hideLabel'):
        classes.append('hide-label')
    
    return classes


def render_row(ctx: RenderContext, blocks: List[dict]) -> str:
    if not blocks:
        return ''
    
    has_float = any(b.get('float') for b in blocks)
    float_blocks = [b for b in blocks if b.get('float')]
    normal_blocks = [b for b in blocks if not b.get('float')]
    
    parts = []
    
    for block in normal_blocks:
        width_class = get_width_class(block.get('width', 'auto'))
        block_classes = get_block_classes(block)
        all_classes = [width_class] + block_classes
        style = get_block_style(block)
        style_attr = f' style="{style}"' if style else ''
        
        html = render_field(ctx, block)
        if html:
            parts.append(f'<div class="{" ".join(all_classes)}"{style_attr}>{html}</div>')
    
    for block in float_blocks:
        float_dir = block.get('float', 'right')
        block_classes = get_block_classes(block)
        all_classes = [f'float-{float_dir}'] + block_classes
        style = get_block_style(block)
        style_attr = f' style="{style}"' if style else ''
        
        html = render_field(ctx, block)
        if html:
            parts.append(f'<div class="{" ".join(all_classes)}"{style_attr}>{html}</div>')
    
    if not parts:
        return ''
    
    row_class = "layout-row row-has-float" if has_float else "layout-row"
    return f'<div class="{row_class}">{"".join(parts)}</div>'
