"""
Report Engine Package

Handles all report generation: incident runsheets, monthly chiefs reports, etc.
Separated from routers for maintainability.

Components:
- branding_config: Default branding settings and helpers
- layout_config: V4 print layout schema and defaults
- templates: CSS generation using branding
- renderers: Field rendering functions (r_* functions)
"""

from .branding_config import DEFAULT_BRANDING, get_branding
from .layout_config import DEFAULT_PRINT_LAYOUT, get_layout, get_page_blocks
from .templates import generate_css, generate_base_html
from .renderers import FIELD_RENDERERS, render_field, render_row

__all__ = [
    'DEFAULT_BRANDING',
    'DEFAULT_PRINT_LAYOUT',
    'get_branding',
    'get_layout',
    'get_page_blocks',
    'generate_css',
    'generate_base_html',
    'FIELD_RENDERERS',
    'render_field',
    'render_row',
]
