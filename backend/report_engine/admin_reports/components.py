"""
Shared Components for Admin Reports

Reusable HTML generation functions for consistent styling across all admin reports.
All components use tenant branding for colors, fonts, etc.
"""

from html import escape as html_escape
from typing import List, Dict, Any, Optional


def esc(text: Any) -> str:
    """Safely escape text for HTML"""
    if text is None:
        return ''
    return html_escape(str(text))


def stat_box(
    value: Any,
    label: str,
    sub: str = None,
    highlight: bool = False,
    colors: dict = None
) -> str:
    """
    Render a single stat box.
    
    Args:
        value: The main value to display
        label: Label below the value
        sub: Optional subtitle/comparison text
        highlight: If True, use primary color for value
        colors: Color dict with 'green', 'text', 'grayDark'
    """
    colors = colors or {}
    value_color = colors.get('green', '#016a2b') if highlight else colors.get('text', '#1a1a1a')
    
    sub_html = f'<div class="stat-sub">{esc(sub)}</div>' if sub else ''
    
    return f'''<div class="stat-box">
        <div class="stat-value" style="color: {value_color}">{esc(value)}</div>
        <div class="stat-label">{esc(label)}</div>
        {sub_html}
    </div>'''


def stat_grid(stats: List[Dict], colors: dict = None) -> str:
    """
    Render a grid of stat boxes.
    
    Args:
        stats: List of dicts with keys: value, label, sub (optional), highlight (optional)
        colors: Color dict for styling
    
    Example:
        stat_grid([
            {"value": 45, "label": "Total Calls", "highlight": True},
            {"value": 128, "label": "Personnel Responses"},
            {"value": "42.5", "label": "Total Hours"},
        ])
    """
    boxes = [
        stat_box(
            value=s.get('value', ''),
            label=s.get('label', ''),
            sub=s.get('sub'),
            highlight=s.get('highlight', False),
            colors=colors
        )
        for s in stats
    ]
    return f'<div class="stat-grid">{" ".join(boxes)}</div>'


def data_table(
    headers: List[str],
    rows: List[List[Any]],
    alignments: List[str] = None,
    highlight_rows: List[int] = None,
    row_links: List[str] = None,
    colors: dict = None
) -> str:
    """
    Render a styled data table.
    
    Args:
        headers: Column header labels
        rows: List of row data (each row is a list of cell values)
        alignments: List of 'left', 'center', 'right' per column (default: left)
        highlight_rows: List of row indices (0-based) to highlight
        row_links: List of URLs for each row (for future clickable rows)
        colors: Color dict for styling
    """
    colors = colors or {}
    alignments = alignments or ['left'] * len(headers)
    highlight_rows = highlight_rows or []
    
    # Build header row
    header_cells = []
    for i, h in enumerate(headers):
        align = alignments[i] if i < len(alignments) else 'left'
        style = f'text-align: {align};'
        header_cells.append(f'<th style="{style}">{esc(h)}</th>')
    
    header_html = f'<tr>{"".join(header_cells)}</tr>'
    
    # Build data rows
    row_htmls = []
    for idx, row in enumerate(rows):
        bg = colors.get('greenLight', '#e8f5e9') if idx in highlight_rows else ''
        style = f'background: {bg};' if bg else ''
        
        cells = []
        for i, cell in enumerate(row):
            align = alignments[i] if i < len(alignments) else 'left'
            cell_style = f'text-align: {align};'
            
            # Format numbers nicely
            if isinstance(cell, float):
                cell = f'{cell:.1f}'
            
            cells.append(f'<td style="{cell_style}">{esc(cell)}</td>')
        
        row_htmls.append(f'<tr style="{style}">{"".join(cells)}</tr>')
    
    # Empty state
    if not rows:
        colspan = len(headers)
        row_htmls.append(f'<tr><td colspan="{colspan}" style="text-align: center; color: #666;">No data</td></tr>')
    
    return f'''<table class="data-table">
        <thead>{header_html}</thead>
        <tbody>{"".join(row_htmls)}</tbody>
    </table>'''


def grouped_list(
    groups: List[Dict],
    colors: dict = None
) -> str:
    """
    Render grouped items with counts (like incident types with subtypes).
    
    Args:
        groups: List of dicts with keys:
            - name: Group name
            - count: Group total count
            - items: List of dicts with 'name' and 'count'
        colors: Color dict for styling
    
    Example:
        grouped_list([
            {
                "name": "STRUCTURE FIRE",
                "count": 15,
                "items": [
                    {"name": "Residential", "count": 8},
                    {"name": "Commercial", "count": 7},
                ]
            },
        ])
    """
    colors = colors or {}
    primary = colors.get('green', '#016a2b')
    
    group_htmls = []
    for g in groups:
        # Group header
        header = f'''<div class="group-header">
            <span class="group-name">{esc(g.get("name", ""))}</span>
            <span class="group-count">{g.get("count", 0)}</span>
        </div>'''
        
        # Subitems
        items = g.get('items', [])
        item_htmls = []
        for item in items:
            item_htmls.append(f'''<div class="group-item">
                <span class="item-name">{esc(item.get("name", ""))}</span>
                <span class="item-count">{item.get("count", 0)}</span>
            </div>''')
        
        items_html = ''.join(item_htmls)
        group_htmls.append(f'<div class="group">{header}{items_html}</div>')
    
    return f'<div class="grouped-list">{"".join(group_htmls)}</div>'


def section(title: str, content: str, colors: dict = None) -> str:
    """
    Render a card/section with header.
    
    Args:
        title: Section title
        content: HTML content for the section body
        colors: Color dict for styling
    """
    return f'''<div class="section">
        <div class="section-header">{esc(title)}</div>
        <div class="section-body">{content}</div>
    </div>'''


def two_column(left: str, right: str) -> str:
    """Render two columns side by side."""
    return f'''<div class="two-column">
        <div class="column">{left}</div>
        <div class="column">{right}</div>
    </div>'''


def three_column(col1: str, col2: str, col3: str) -> str:
    """Render three columns side by side."""
    return f'''<div class="three-column">
        <div class="column">{col1}</div>
        <div class="column">{col2}</div>
        <div class="column">{col3}</div>
    </div>'''


def rank_badge(rank: int, colors: dict = None) -> str:
    """
    Render a rank badge (1st, 2nd, 3rd with medals, then numbers).
    
    Args:
        rank: 1-based rank number
        colors: Color dict for styling
    """
    if rank == 1:
        return '🥇'
    elif rank == 2:
        return '🥈'
    elif rank == 3:
        return '🥉'
    else:
        return str(rank)


def category_badge(category: str, colors: dict = None) -> str:
    """
    Render a Fire/EMS category badge.
    
    Args:
        category: 'FIRE' or 'EMS'
        colors: Color dict for styling
    """
    if category and category.upper() == 'FIRE':
        return '<span class="badge badge-fire">FIRE</span>'
    elif category and category.upper() == 'EMS':
        return '<span class="badge badge-ems">EMS</span>'
    else:
        return '<span class="badge">ALL</span>'


def format_currency(cents: int) -> str:
    """Format cents as dollars."""
    if not cents:
        return '$0'
    return f'${cents / 100:,.0f}'


def format_hours(hours: float) -> str:
    """Format hours with one decimal place."""
    if hours is None:
        return '-'
    return f'{hours:.1f}'


def format_minutes(minutes: float) -> str:
    """Format minutes with one decimal place."""
    if minutes is None:
        return '-'
    return f'{minutes:.1f}'
