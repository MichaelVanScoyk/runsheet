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
    ):
        self.incident = incident
        self.branding = branding
        self.personnel_lookup = personnel_lookup
        self.apparatus_list = apparatus_list
        self.personnel_assignments = personnel_assignments
        self.fmt_time = time_formatter
        
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
                    return f"{hours}h {mins}m" if hours > 0 else f"{mins}m"
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
    m = esc(ctx.get('municipality_code', ''))
    if not m:
        return ''
    return f'<span class="muni">{m}</span>'


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
    return _render_personnel_grid(ctx, 'APPARATUS', 'Apparatus Personnel')


def r_personnel_direct(ctx: RenderContext, block: dict) -> str:
    return _render_personnel_list(ctx, 'DIRECT', 'Direct Response')


def r_personnel_station(ctx: RenderContext, block: dict) -> str:
    return _render_personnel_list(ctx, 'STATION', 'Station Personnel')


def _render_personnel_grid(ctx: RenderContext, category: str, title: str) -> str:
    assigned_units = ctx.get_assigned_units(category)
    if not assigned_units:
        return ''
    
    branding = ctx.branding
    role_names = ['Driver', 'Officer', 'FF', 'FF', 'FF', 'FF']
    rows_html = ""
    
    for idx, role in enumerate(role_names):
        has_data = any(
            ctx.personnel_assignments.get(a['unit_designator'], [None]*6)[idx] 
            if idx < len(ctx.personnel_assignments.get(a['unit_designator'], [])) else None
            for a in assigned_units
        )
        if not has_data:
            continue
        
        row = f'<tr><td class="role-cell">{role}</td>'
        for a in assigned_units:
            slots = ctx.personnel_assignments.get(a['unit_designator'], [])
            pid = slots[idx] if idx < len(slots) else None
            name = ctx.get_personnel_name(pid)
            row += f'<td>{name}</td>'
        row += '</tr>'
        rows_html += row
    
    if not rows_html:
        return ''
    
    unit_headers = ''.join([f'<th>{esc(a["unit_designator"])}</th>' for a in assigned_units])
    total = sum(len([s for s in ctx.personnel_assignments.get(a['unit_designator'], []) if s]) for a in assigned_units)
    
    return f'''<div class="personnel-section">
        <div class="personnel-section-title">{title}</div>
        <table class="personnel-table">
            <thead><tr><th class="role-header">Role</th>{unit_headers}</tr></thead>
            <tbody>{rows_html}</tbody>
        </table>
        <div class="total-row">Total: {total}</div>
    </div>'''


def _render_personnel_list(ctx: RenderContext, category: str, title: str) -> str:
    assigned_units = ctx.get_assigned_units(category)
    if not assigned_units:
        return ''
    
    personnel = []
    for a in assigned_units:
        slots = ctx.personnel_assignments.get(a['unit_designator'], [])
        for pid in slots:
            if pid:
                name = ctx.get_personnel_name(pid)
                if name and name not in personnel:
                    personnel.append(name)
    
    if not personnel:
        return ''
    
    items = ''.join([f'<span class="personnel-list-item">{esc(p)}</span>' for p in personnel])
    
    return f'''<div class="personnel-section">
        <div class="personnel-section-title">{title}</div>
        <div class="personnel-list">{items}</div>
        <div class="total-row">Total: {len(personnel)}</div>
    </div>'''


def r_officer_in_charge(ctx: RenderContext, block: dict) -> str:
    oic = ctx.get_personnel_name(ctx.get('officer_in_charge'))
    return f'<div class="officer-cell"><span class="label">Officer in Charge:</span> {esc(oic)}</div>'


def r_completed_by(ctx: RenderContext, block: dict) -> str:
    cb = ctx.get_personnel_name(ctx.get('completed_by'))
    return f'<div class="officer-cell"><span class="label">Report Completed By:</span> {esc(cb)}</div>'


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
    cad_units = ctx.get('cad_units') or []
    if not cad_units:
        return ''
    
    rows = ''.join([
        f'''<tr>
            <td>{esc(u.get("unit_id",""))}</td>
            <td>{esc(u.get("dispatched",""))}</td>
            <td>{esc(u.get("enroute",""))}</td>
            <td>{esc(u.get("arrived",""))}</td>
            <td>{esc(u.get("cleared",""))}</td>
        </tr>'''
        for u in cad_units
    ])
    
    return f'''<div class="field">
        <span class="label">CAD Unit Details:</span>
        <table class="cad-table">
            <thead><tr><th>Unit</th><th>Dispatched</th><th>Enroute</th><th>Arrived</th><th>Cleared</th></tr></thead>
            <tbody>{rows}</tbody>
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
