"""
Settings Helper - Read settings from database
For use by standalone scripts (cad_listener, etc.)
"""

import json
from typing import Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor

# Database connection string
DATABASE_URL = "dbname=runsheet_db"


def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(DATABASE_URL)


def get_setting(category: str, key: str, default: Any = None) -> Any:
    """Get a single setting value"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT value, value_type FROM settings WHERE category = %s AND key = %s",
            (category, key)
        )
        row = cur.fetchone()
        conn.close()
        
        if not row:
            return default
        
        return _parse_value(row[0], row[1])
    except Exception as e:
        print(f"Error getting setting {category}.{key}: {e}")
        return default


def get_all_settings() -> dict:
    """Get all settings grouped by category"""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT category, key, value, value_type FROM settings ORDER BY category, key")
        rows = cur.fetchall()
        conn.close()
        
        settings = {}
        for row in rows:
            cat = row['category']
            if cat not in settings:
                settings[cat] = {}
            settings[cat][row['key']] = _parse_value(row['value'], row['value_type'])
        
        return settings
    except Exception as e:
        print(f"Error getting settings: {e}")
        return {}


def _parse_value(value: str, value_type: str) -> Any:
    """Parse string value to appropriate type"""
    if value is None:
        return None
    
    if value_type == 'number':
        try:
            if '.' in value:
                return float(value)
            return int(value)
        except:
            return value
    elif value_type == 'boolean':
        return value.lower() in ('true', '1', 'yes')
    elif value_type == 'json':
        try:
            return json.loads(value)
        except:
            return value
    return value


# =============================================================================
# UTC ISO FORMATTING - USE THIS EVERYWHERE FOR DATETIME OUTPUT
# =============================================================================

def format_utc_iso(dt) -> str:
    """
    Format datetime as ISO 8601 with explicit Z suffix for UTC.
    
    This MUST be used for ALL datetime output to JSON/API responses.
    JavaScript needs the Z suffix to know it's UTC and convert to local time.
    
    Without Z: "2025-12-28T23:52:36" - JS treats as LOCAL time (WRONG!)
    With Z:    "2025-12-28T23:52:36Z" - JS treats as UTC (CORRECT!)
    
    Args:
        dt: datetime object (assumed to be UTC) or None
    
    Returns:
        ISO string with Z suffix, or None if input is None
    """
    if dt is None:
        return None
    if hasattr(dt, 'isoformat'):
        iso = dt.isoformat()
        # Add Z suffix if not already present and no timezone offset
        if not iso.endswith('Z') and '+' not in iso and '-' not in iso[-6:]:
            iso += 'Z'
        return iso
    return str(dt)


def iso_or_none(obj, attr: str) -> str:
    """
    Get attribute from object and format as UTC ISO string.
    
    Usage in API responses:
        "time_dispatched": iso_or_none(incident, 'time_dispatched'),
    
    Args:
        obj: Object to get attribute from
        attr: Attribute name
    
    Returns:
        ISO string with Z suffix, or None
    """
    val = getattr(obj, attr, None)
    return format_utc_iso(val)


# =============================================================================
# UNIT LOOKUP
# =============================================================================

def get_unit_info(unit_id: str) -> dict:
    """
    Look up unit in apparatus table by CAD unit ID, designator, or alias.
    
    Returns dict with:
        is_ours: bool - whether this is one of our units
        apparatus_id: int or None - database ID
        category: str or None - APPARATUS, DIRECT, STATION
        counts_for_response_times: bool - whether to include in metrics
        unit_designator: str or None - canonical unit ID (use this, not the alias)
    """
    if not unit_id:
        return {
            'is_ours': False,
            'apparatus_id': None,
            'category': None,
            'counts_for_response_times': False,
            'unit_designator': None,
        }
    
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Look up by cad_unit_id, unit_designator, OR alias
        cur.execute("""
            SELECT id, unit_category, counts_for_response_times, cad_unit_id, unit_designator, cad_unit_aliases
            FROM apparatus 
            WHERE (
                UPPER(cad_unit_id) = %s 
                OR UPPER(unit_designator) = %s
                OR %s = ANY(SELECT UPPER(unnest(cad_unit_aliases)))
            ) AND active = true
            LIMIT 1
        """, (unit_id.upper(), unit_id.upper(), unit_id.upper()))
        
        row = cur.fetchone()
        conn.close()
        
        if row:
            # Found in apparatus table - use explicit values from database
            # NULL counts_for_response_times defaults to False (safer to exclude than include)
            return {
                'is_ours': True,
                'apparatus_id': row['id'],
                'category': row['unit_category'],
                'counts_for_response_times': row['counts_for_response_times'] if row['counts_for_response_times'] is not None else False,
                'unit_designator': row['unit_designator'],  # Canonical ID
            }
        
        # Not found in apparatus table - this is mutual aid
        # Do NOT fall back to station_units setting - apparatus table is authoritative
        return {
            'is_ours': False,
            'apparatus_id': None,
            'category': None,
            'counts_for_response_times': False,
            'unit_designator': None,
        }
        
    except Exception as e:
        print(f"Error looking up unit {unit_id}: {e}")
        # On database error, treat as mutual aid (safer to exclude than include)
        return {
            'is_ours': False,
            'apparatus_id': None,
            'category': None,
            'counts_for_response_times': False,
            'unit_designator': None,
        }


# =============================================================================
# OTHER SETTINGS
# =============================================================================

def get_station_coords() -> tuple:
    """Get station coordinates"""
    lat = get_setting('station', 'latitude', 40.0977)
    lon = get_setting('station', 'longitude', -75.7833)
    return (float(lat), float(lon))


def get_api_url() -> str:
    """Get API URL"""
    return get_setting('api', 'url', 'http://192.168.1.189:8001')


def get_cad_port(test: bool = False) -> int:
    """Get CAD listener port"""
    if test:
        return get_setting('cad', 'test_port', 19118)
    return get_setting('cad', 'listener_port', 19117)


def get_weather_enabled() -> bool:
    """Check if weather auto-fetch is enabled"""
    return get_setting('weather', 'auto_fetch', True)


def get_timezone() -> str:
    """Get configured timezone (IANA format like 'America/New_York')"""
    tz = get_setting('station', 'timezone', 'America/New_York')
    # Strip quotes if present (JSON string storage)
    if isinstance(tz, str):
        tz = tz.strip('"')
    return tz


# =============================================================================
# LOCAL TIME FORMATTING - For server-side display (PDFs, reports)
# Mirrors frontend timeUtils.js functions
# =============================================================================

def format_local_time(utc_dt, include_seconds: bool = False) -> str:
    """
    Convert UTC datetime to station timezone time string.
    Mirrors frontend formatTimeLocal().
    
    Args:
        utc_dt: datetime object (UTC) or ISO string
        include_seconds: if True, returns "HH:MM:SS", else "HH:MM"
    
    Returns:
        Time string in station timezone, or empty string if None
    """
    if utc_dt is None:
        return ''
    
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo
    
    # Handle ISO string input
    if isinstance(utc_dt, str):
        if not utc_dt:
            return ''
        try:
            # Parse ISO string, handle Z suffix
            utc_dt = utc_dt.replace('Z', '+00:00')
            utc_dt = datetime.fromisoformat(utc_dt)
        except:
            return ''
    
    # Ensure UTC timezone
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=timezone.utc)
    
    # Convert to station timezone
    station_tz = ZoneInfo(get_timezone())
    local_dt = utc_dt.astimezone(station_tz)
    
    if include_seconds:
        return local_dt.strftime('%H:%M:%S')
    return local_dt.strftime('%H:%M')


def format_local_datetime(utc_dt) -> str:
    """
    Convert UTC datetime to station timezone datetime string.
    Mirrors frontend formatDateTimeLocal().
    
    Args:
        utc_dt: datetime object (UTC) or ISO string
    
    Returns:
        "YYYY-MM-DD HH:MM:SS" in station timezone, or empty string if None
    """
    if utc_dt is None:
        return ''
    
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo
    
    # Handle ISO string input
    if isinstance(utc_dt, str):
        if not utc_dt:
            return ''
        try:
            utc_dt = utc_dt.replace('Z', '+00:00')
            utc_dt = datetime.fromisoformat(utc_dt)
        except:
            return ''
    
    # Ensure UTC timezone
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=timezone.utc)
    
    # Convert to station timezone
    station_tz = ZoneInfo(get_timezone())
    local_dt = utc_dt.astimezone(station_tz)
    
    return local_dt.strftime('%Y-%m-%d %H:%M:%S')


def format_local_date(utc_dt) -> str:
    """
    Convert UTC datetime to station timezone date string.
    Mirrors frontend formatDateLocal().
    
    Args:
        utc_dt: datetime object (UTC) or ISO string
    
    Returns:
        "YYYY-MM-DD" in station timezone, or empty string if None
    """
    if utc_dt is None:
        return ''
    
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo
    
    # Handle ISO string input
    if isinstance(utc_dt, str):
        if not utc_dt:
            return ''
        try:
            utc_dt = utc_dt.replace('Z', '+00:00')
            utc_dt = datetime.fromisoformat(utc_dt)
        except:
            return ''
    
    # Ensure UTC timezone
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=timezone.utc)
    
    # Convert to station timezone
    station_tz = ZoneInfo(get_timezone())
    local_dt = utc_dt.astimezone(station_tz)
    
    return local_dt.strftime('%Y-%m-%d')


# Test
if __name__ == "__main__":
    print("Settings from database:")
    print("-" * 40)
    
    settings = get_all_settings()
    for cat, values in settings.items():
        print(f"\n[{cat}]")
        for key, val in values.items():
            print(f"  {key} = {val}")
    
    print("\n" + "-" * 40)
    print("\nUnit lookups:")
    print(f"  ENG481: {get_unit_info('ENG481')}")
    print(f"  AMB891: {get_unit_info('AMB891')}")
    print(f"  QRS48:  {get_unit_info('QRS48')}")
    print(f"\nStation coords: {get_station_coords()}")
    
    # Test UTC formatting
    from datetime import datetime, timezone
    print(f"\nUTC Format test:")
    now = datetime.now(timezone.utc)
    print(f"  Input:  {now}")
    print(f"  Output: {format_utc_iso(now)}")
    
    # Test local time formatting
    print(f"\nLocal Time Format test (TZ: {get_timezone()}):")
    print(f"  format_local_time:     {format_local_time(now)}")
    print(f"  format_local_time(s):  {format_local_time(now, include_seconds=True)}")
    print(f"  format_local_datetime: {format_local_datetime(now)}")
    print(f"  format_local_date:     {format_local_date(now)}")
    # Test with ISO string
    iso_str = '2025-12-30T15:30:00Z'
    print(f"  ISO string input:      {format_local_time(iso_str, include_seconds=True)}  (from {iso_str})")
