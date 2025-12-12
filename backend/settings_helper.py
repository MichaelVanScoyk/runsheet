"""
Settings Helper - Read settings from database
For use by standalone scripts (cad_listener, etc.)
"""

import json
from typing import Any, List, Optional
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
# CONVENIENCE FUNCTIONS
# =============================================================================

def get_station_units() -> List[str]:
    """Get list of station unit IDs"""
    units = get_setting('units', 'station_units', [])
    if isinstance(units, list):
        return [u.upper() for u in units]
    return []


def is_station_unit(unit_id: str) -> bool:
    """Check if unit belongs to this station"""
    if not unit_id:
        return False
    units = get_station_units()
    return unit_id.upper() in units


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
    print(f"Station units: {get_station_units()}")
    print(f"Is ENG481 ours? {is_station_unit('ENG481')}")
    print(f"Is AMB891 ours? {is_station_unit('AMB891')}")
    print(f"Station coords: {get_station_coords()}")
