"""
Print Layout Configuration V4

Row-based layout system where fields can be placed side-by-side.
Each field has: id, name, enabled, page, row, order, width

Width options: auto, 1/4, 1/3, 1/2, 2/3, 3/4, full
Special: times_group floats top-right
Personnel split: personnel_apparatus, personnel_direct, personnel_station

NERIS Consideration: Layout is display-only, not exported to NERIS.
"""

import json
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List

# =============================================================================
# V4 LAYOUT SCHEMA
# =============================================================================

DEFAULT_PRINT_LAYOUT = {
    "version": 4,
    
    "blocks": [
        # =================================================================
        # PAGE 1 - MAIN REPORT
        # =================================================================
        
        # Row 0: Header (special - rendered by header_style in branding)
        {"id": "header", "name": "Header", "enabled": True, "page": 1, "row": 0, "order": 1, "width": "full", "locked": True},
        
        # Row 1: Incident identifiers
        {"id": "internal_incident_number", "name": "Incident #", "enabled": True, "page": 1, "row": 1, "order": 1, "width": "auto"},
        {"id": "call_category", "name": "Category Badge", "enabled": True, "page": 1, "row": 1, "order": 2, "width": "auto"},
        {"id": "cad_event_number", "name": "CAD Event #", "enabled": True, "page": 1, "row": 1, "order": 3, "width": "auto"},
        {"id": "incident_date", "name": "Date", "enabled": True, "page": 1, "row": 1, "order": 4, "width": "auto"},
        
        # Times floats right (special positioning)
        {"id": "times_group", "name": "Times Table", "enabled": True, "page": 1, "row": 1, "order": 99, "width": "auto", "float": "right"},
        
        # Row 2: Dispatch type
        {"id": "cad_event_type", "name": "CAD Type", "enabled": True, "page": 1, "row": 2, "order": 1, "width": "1/2"},
        {"id": "cad_event_subtype", "name": "CAD Subtype", "enabled": True, "page": 1, "row": 2, "order": 2, "width": "1/2"},
        
        # Row 3: Location
        {"id": "address", "name": "Address", "enabled": True, "page": 1, "row": 3, "order": 1, "width": "1/2"},
        {"id": "cross_streets", "name": "Cross Streets", "enabled": True, "page": 1, "row": 3, "order": 2, "width": "1/4"},
        {"id": "municipality_code", "name": "Municipality", "enabled": True, "page": 1, "row": 3, "order": 3, "width": "1/4"},
        
        # Row 4: Additional location + weather
        {"id": "esz_box", "name": "ESZ/Box", "enabled": True, "page": 1, "row": 4, "order": 1, "width": "1/4"},
        {"id": "units_called", "name": "Units Called", "enabled": True, "page": 1, "row": 4, "order": 2, "width": "1/2"},
        {"id": "weather_conditions", "name": "Weather", "enabled": True, "page": 1, "row": 4, "order": 3, "width": "1/4"},
        
        # Row 5: Caller info (disabled by default)
        {"id": "caller_name", "name": "Caller Name", "enabled": False, "page": 1, "row": 5, "order": 1, "width": "1/2"},
        {"id": "caller_phone", "name": "Caller Phone", "enabled": False, "page": 1, "row": 5, "order": 2, "width": "1/2"},
        
        # Row 6: Situation Found (FIRE only)
        {"id": "situation_found", "name": "Situation Found", "enabled": True, "page": 1, "row": 6, "order": 1, "width": "full", "fireOnly": True},
        
        # Row 7: Extent of Damage (FIRE only)
        {"id": "extent_of_damage", "name": "Extent of Damage", "enabled": True, "page": 1, "row": 7, "order": 1, "width": "full", "fireOnly": True},
        
        # Row 8: Services Provided
        {"id": "services_provided", "name": "Services Provided", "enabled": True, "page": 1, "row": 8, "order": 1, "width": "full"},
        
        # Row 9: Narrative
        {"id": "narrative", "name": "Narrative", "enabled": True, "page": 1, "row": 9, "order": 1, "width": "full"},
        
        # Row 10: Problems/Issues (disabled by default)
        {"id": "problems_issues", "name": "Problems/Issues", "enabled": False, "page": 1, "row": 10, "order": 1, "width": "full"},
        
        # Row 11: Equipment Used (disabled by default)
        {"id": "equipment_used", "name": "Equipment Used", "enabled": False, "page": 1, "row": 11, "order": 1, "width": "full"},
        
        # Row 12: Personnel on Apparatus (APPARATUS category units)
        {"id": "personnel_apparatus", "name": "Apparatus Personnel", "enabled": True, "page": 1, "row": 12, "order": 1, "width": "full"},
        
        # Row 13: Direct Response Personnel (DIRECT category - POV responders)
        {"id": "personnel_direct", "name": "Direct Response", "enabled": True, "page": 1, "row": 13, "order": 1, "width": "full"},
        
        # Row 14: Station Personnel (STATION category - at station, not on scene)
        {"id": "personnel_station", "name": "Station Personnel", "enabled": True, "page": 1, "row": 14, "order": 1, "width": "full"},
        
        # Row 15: Total Responders (combined count across all categories)
        {"id": "total_responders", "name": "Total Responders", "enabled": True, "page": 1, "row": 15, "order": 1, "width": "auto"},
        
        # Row 16: Officers
        {"id": "officer_in_charge", "name": "Officer in Charge", "enabled": True, "page": 1, "row": 16, "order": 1, "width": "1/2"},
        {"id": "completed_by", "name": "Completed By", "enabled": True, "page": 1, "row": 16, "order": 2, "width": "1/2"},
        
        # Row 99: Footer (special - always last)
        {"id": "footer", "name": "Footer", "enabled": True, "page": 1, "row": 99, "order": 1, "width": "full", "locked": True},
        
        # =================================================================
        # PAGE 2 - EXTENDED DETAILS
        # =================================================================
        
        # Row 1: CAD Unit Details table
        {"id": "cad_unit_details", "name": "CAD Unit Details", "enabled": True, "page": 2, "row": 1, "order": 1, "width": "full"},
        
        # Row 2: Damage/Injury Stats (FIRE only, side-by-side)
        {"id": "property_value_at_risk", "name": "Property at Risk", "enabled": False, "page": 2, "row": 2, "order": 1, "width": "1/4", "fireOnly": True},
        {"id": "fire_damages_estimate", "name": "Fire Damages", "enabled": False, "page": 2, "row": 2, "order": 2, "width": "1/4", "fireOnly": True},
        {"id": "ff_injuries_count", "name": "FF Injuries", "enabled": False, "page": 2, "row": 2, "order": 3, "width": "1/4", "fireOnly": True},
        {"id": "civilian_injuries_count", "name": "Civilian Injuries", "enabled": False, "page": 2, "row": 2, "order": 4, "width": "1/4", "fireOnly": True},
        
        # Row 3: Mutual Aid
        {"id": "neris_aid_direction", "name": "Aid Direction", "enabled": False, "page": 2, "row": 3, "order": 1, "width": "1/3"},
        {"id": "neris_aid_departments", "name": "Aid Departments", "enabled": False, "page": 2, "row": 3, "order": 2, "width": "2/3"},
        
        # Row 4: NERIS Incident Types
        {"id": "neris_incident_types", "name": "NERIS Incident Types", "enabled": False, "page": 2, "row": 4, "order": 1, "width": "full"},
        
        # Row 5: NERIS Actions
        {"id": "neris_actions", "name": "NERIS Actions Taken", "enabled": False, "page": 2, "row": 5, "order": 1, "width": "full"},
        
        # Row 6: Event Comments (CAD dispatch comments log)
        # Options: categorize=True (grouped by type) or categorize=False (chronological)
        {"id": "event_comments", "name": "Event Comments", "enabled": True, "page": 2, "row": 6, "order": 1, "width": "full", "categorize": True},
        
        # Spacers - blank rows for layout control
        {"id": "spacer_1", "name": "Spacer 1", "enabled": False, "page": 2, "row": 90, "order": 1, "width": "full"},
        {"id": "spacer_2", "name": "Spacer 2", "enabled": False, "page": 2, "row": 91, "order": 1, "width": "full"},
        {"id": "spacer_3", "name": "Spacer 3", "enabled": False, "page": 2, "row": 92, "order": 1, "width": "full"},
        {"id": "spacer_4", "name": "Spacer 4", "enabled": False, "page": 2, "row": 93, "order": 1, "width": "full"},
        {"id": "spacer_5", "name": "Spacer 5", "enabled": False, "page": 2, "row": 94, "order": 1, "width": "full"},
        {"id": "spacer_6", "name": "Spacer 6", "enabled": False, "page": 2, "row": 95, "order": 1, "width": "full"},
        {"id": "spacer_7", "name": "Spacer 7", "enabled": False, "page": 2, "row": 96, "order": 1, "width": "full"},
        {"id": "spacer_8", "name": "Spacer 8", "enabled": False, "page": 2, "row": 97, "order": 1, "width": "full"},
        {"id": "spacer_9", "name": "Spacer 9", "enabled": False, "page": 2, "row": 98, "order": 1, "width": "full"},
        {"id": "spacer_10", "name": "Spacer 10", "enabled": False, "page": 2, "row": 100, "order": 1, "width": "full"},
        {"id": "spacer_11", "name": "Spacer 11", "enabled": False, "page": 2, "row": 101, "order": 1, "width": "full"},
        {"id": "spacer_12", "name": "Spacer 12", "enabled": False, "page": 2, "row": 102, "order": 1, "width": "full"},
        {"id": "spacer_13", "name": "Spacer 13", "enabled": False, "page": 2, "row": 103, "order": 1, "width": "full"},
    ]
}

# Width to CSS mapping
WIDTH_CSS = {
    "auto": "width: auto;",
    "1/4": "width: 25%;",
    "1/3": "width: 33.33%;",
    "1/2": "width: 50%;",
    "2/3": "width: 66.67%;",
    "3/4": "width: 75%;",
    "full": "width: 100%;",
}


# =============================================================================
# LAYOUT LOADER
# =============================================================================

def get_layout(db: Session) -> dict:
    """
    Load print layout from tenant's settings table.
    Merges stored layout with defaults to handle new blocks.
    """
    result = db.execute(
        text("SELECT value FROM settings WHERE category = 'print' AND key = 'layout'")
    ).fetchone()
    
    if result and result[0]:
        try:
            stored = json.loads(result[0])
            return _merge_layout_with_defaults(stored)
        except json.JSONDecodeError:
            pass
    
    return dict(DEFAULT_PRINT_LAYOUT)


def get_page_blocks(db: Session, page: int, call_category: str = 'FIRE') -> List[dict]:
    """
    Get enabled blocks for a specific page, filtered by call category.
    Returns blocks organized by row for rendering.
    """
    layout = get_layout(db)
    blocks = []
    
    for block in layout.get('blocks', []):
        if not block.get('enabled', True):
            continue
        if block.get('page') != page:
            continue
        if block.get('fireOnly', False) and call_category != 'FIRE':
            continue
        blocks.append(block)
    
    blocks.sort(key=lambda b: (b.get('row', 99), b.get('order', 99)))
    return blocks


def get_blocks_by_row(blocks: List[dict]) -> dict:
    """Group blocks by row number for side-by-side rendering."""
    rows = {}
    for block in blocks:
        row_num = block.get('row', 99)
        if row_num not in rows:
            rows[row_num] = []
        rows[row_num].append(block)
    
    for row_num in rows:
        rows[row_num].sort(key=lambda b: b.get('order', 99))
    
    return rows


def get_width_css(width: str) -> str:
    """Get CSS width declaration for a width value."""
    return WIDTH_CSS.get(width, WIDTH_CSS["auto"])


def validate_layout(layout: dict) -> List[str]:
    """Validate a layout configuration. Returns list of error messages."""
    errors = []
    
    if "version" not in layout:
        errors.append("Missing 'version' field")
    
    if "blocks" not in layout:
        errors.append("Missing 'blocks' field")
        return errors
    
    if not isinstance(layout["blocks"], list):
        errors.append("'blocks' must be a list")
        return errors
    
    required_fields = ["id", "enabled", "page", "row", "order"]
    seen_ids = set()
    
    for i, block in enumerate(layout["blocks"]):
        block_id = block.get('id', f'block_{i}')
        
        for field in required_fields:
            if field not in block:
                errors.append(f"Block '{block_id}' missing required field '{field}'")
        
        if block_id in seen_ids:
            errors.append(f"Duplicate block ID: '{block_id}'")
        seen_ids.add(block_id)
        
        if block.get('page') not in [1, 2]:
            errors.append(f"Block '{block_id}' has invalid page (must be 1 or 2)")
        
        valid_widths = list(WIDTH_CSS.keys())
        if block.get('width') and block.get('width') not in valid_widths:
            errors.append(f"Block '{block_id}' has invalid width: {block.get('width')}")
    
    return errors


def _merge_layout_with_defaults(stored: dict) -> dict:
    """Merge stored layout with defaults to handle new blocks added in updates."""
    result = dict(stored)
    result["version"] = DEFAULT_PRINT_LAYOUT["version"]
    
    stored_ids = {b["id"] for b in result.get("blocks", [])}
    
    for default_block in DEFAULT_PRINT_LAYOUT["blocks"]:
        if default_block["id"] not in stored_ids:
            new_block = dict(default_block)
            new_block["enabled"] = False
            result["blocks"].append(new_block)
    
    return result
