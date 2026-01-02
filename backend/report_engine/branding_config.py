"""
Branding Configuration for RunSheet Reports

Defines default branding settings and helpers to load tenant-specific branding.
All values are per-tenant, stored in each tenant's settings table.

NERIS Consideration: Branding is display-only, not exported to NERIS.
"""

from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

# =============================================================================
# DEFAULT BRANDING
# Fallback values when tenant hasn't configured a setting
# =============================================================================

DEFAULT_BRANDING = {
    "version": 1,
    
    # Identity
    "station_name": "Fire Department",
    "station_number": "",
    "station_short_name": "",
    "tagline": "",
    
    # Logo
    "logo_data": None,
    "logo_mime_type": "image/png",
    "logo_position": "left",      # left, center, right
    "logo_size": "medium",        # small (40px), medium (60px), large (80px)
    
    # Colors
    "primary_color": "#016a2b",   # Headers, borders, accents
    "secondary_color": "#eeee01", # Highlights, role cells in tables
    "text_color": "#1a1a1a",      # Body text
    "muted_color": "#666666",     # Secondary/subtle text
    
    # Typography
    "font_family": "Arial, Helvetica, sans-serif",
    "header_font_size": "12pt",
    "body_font_size": "9pt",
    "small_font_size": "7pt",
    
    # Report Header Style
    "header_style": "classic",    # classic, modern, minimal, banner
    
    # Report Styles
    "border_style": "solid",      # solid, double, none
    "badge_style": "rounded",     # rounded, square, pill
    
    # Footer Template (supports variables)
    "footer_left": "{station_short_name}",
    "footer_center": "Status: {status}",
    "footer_right": "Printed: {print_date}",
    "show_cad_in_footer": True,
    
    # Watermark (for draft reports)
    "watermark_text": None,
    "watermark_opacity": 0.1,
}

# Logo size mappings
LOGO_SIZES = {
    "small": "40px",
    "medium": "60px",
    "large": "80px",
    "xlarge": "104px",
}

# Badge style mappings
BADGE_STYLES = {
    "rounded": "3px",
    "square": "0",
    "pill": "10px",
}


# =============================================================================
# BRANDING LOADER
# =============================================================================

def get_branding(db: Session) -> dict:
    """
    Load branding configuration from tenant's settings table.
    Merges stored values with defaults for any missing keys.
    
    Args:
        db: Database session (tenant-specific)
    
    Returns:
        Complete branding config dict
    """
    branding = dict(DEFAULT_BRANDING)
    
    # Load station identity
    branding["station_name"] = _get_setting(db, "station", "name", branding["station_name"])
    branding["station_number"] = _get_setting(db, "station", "number", branding["station_number"])
    branding["station_short_name"] = _get_setting(db, "station", "short_name", branding["station_short_name"])
    branding["tagline"] = _get_setting(db, "station", "tagline", branding["tagline"])
    
    # Load logo
    branding["logo_data"] = _get_setting(db, "branding", "logo", None)
    branding["logo_mime_type"] = _get_setting(db, "branding", "logo_mime_type", branding["logo_mime_type"])
    branding["logo_position"] = _get_setting(db, "branding", "logo_position", branding["logo_position"])
    branding["logo_size"] = _get_setting(db, "branding", "logo_size", branding["logo_size"])
    
    # Load colors
    branding["primary_color"] = _get_setting(db, "branding", "primary_color", branding["primary_color"])
    branding["secondary_color"] = _get_setting(db, "branding", "secondary_color", branding["secondary_color"])
    branding["text_color"] = _get_setting(db, "branding", "text_color", branding["text_color"])
    branding["muted_color"] = _get_setting(db, "branding", "muted_color", branding["muted_color"])
    
    # Load typography
    branding["font_family"] = _get_setting(db, "branding", "font_family", branding["font_family"])
    branding["header_font_size"] = _get_setting(db, "branding", "header_font_size", branding["header_font_size"])
    branding["body_font_size"] = _get_setting(db, "branding", "body_font_size", branding["body_font_size"])
    branding["small_font_size"] = _get_setting(db, "branding", "small_font_size", branding["small_font_size"])
    
    # Load styles
    branding["header_style"] = _get_setting(db, "branding", "header_style", branding["header_style"])
    branding["border_style"] = _get_setting(db, "branding", "border_style", branding["border_style"])
    branding["badge_style"] = _get_setting(db, "branding", "badge_style", branding["badge_style"])
    
    # Load footer
    branding["footer_left"] = _get_setting(db, "branding", "footer_left", branding["footer_left"])
    branding["footer_center"] = _get_setting(db, "branding", "footer_center", branding["footer_center"])
    branding["footer_right"] = _get_setting(db, "branding", "footer_right", branding["footer_right"])
    branding["show_cad_in_footer"] = _get_setting_bool(db, "branding", "show_cad_in_footer", branding["show_cad_in_footer"])
    
    # Load watermark
    branding["watermark_text"] = _get_setting(db, "branding", "watermark_text", None)
    branding["watermark_opacity"] = _get_setting_float(db, "branding", "watermark_opacity", branding["watermark_opacity"])
    
    return branding


def get_logo_data_url(branding: dict) -> Optional[str]:
    """
    Get logo as data URL for embedding in HTML.
    
    Returns:
        Data URL string or None if no logo
    """
    if not branding.get("logo_data"):
        return None
    mime = branding.get("logo_mime_type", "image/png")
    return f"data:{mime};base64,{branding['logo_data']}"


def get_logo_size_px(branding: dict) -> str:
    """Get logo size in pixels based on size setting."""
    size_key = branding.get("logo_size", "medium")
    return LOGO_SIZES.get(size_key, LOGO_SIZES["medium"])


def get_badge_radius(branding: dict) -> str:
    """Get badge border-radius based on style setting."""
    style_key = branding.get("badge_style", "rounded")
    return BADGE_STYLES.get(style_key, BADGE_STYLES["rounded"])


def format_footer_template(template: str, context: dict) -> str:
    """
    Format footer template with context variables.
    
    Supported variables:
        {station_name}, {station_short_name}, {station_number}
        {incident_number}, {cad_event_number}
        {status}, {call_category}
        {print_date}, {print_time}
        {incident_date}
    
    Args:
        template: Footer template string with {variable} placeholders
        context: Dict of variable values
    
    Returns:
        Formatted string with variables replaced
    """
    if not template:
        return ""
    
    try:
        return template.format(**context)
    except KeyError:
        # If a variable is missing, return template as-is
        return template


# =============================================================================
# PRIVATE HELPERS
# =============================================================================

def _get_setting(db: Session, category: str, key: str, default) -> any:
    """Get string setting from database."""
    result = db.execute(
        text("SELECT value FROM settings WHERE category = :cat AND key = :key"),
        {"cat": category, "key": key}
    ).fetchone()
    return result[0] if result and result[0] else default


def _get_setting_bool(db: Session, category: str, key: str, default: bool) -> bool:
    """Get boolean setting from database."""
    result = _get_setting(db, category, key, None)
    if result is None:
        return default
    return str(result).lower() in ('true', '1', 'yes')


def _get_setting_float(db: Session, category: str, key: str, default: float) -> float:
    """Get float setting from database."""
    result = _get_setting(db, category, key, None)
    if result is None:
        return default
    try:
        return float(result)
    except (ValueError, TypeError):
        return default
