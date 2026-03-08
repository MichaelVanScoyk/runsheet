"""
nerisv1: Mapping Adapter

Two-way bridge between incident DB data and NERIS-native dict.

LOAD (DB → NERIS): Read mapping config, fetch incident data, apply transforms,
output NERIS-native dict for the form/builder.

SAVE (NERIS → DB): Take edited NERIS field values from the form, reverse-walk
the mapping config, write back to original source columns. Unmapped fields
go to incidents.nerisv1_data JSONB.

The adapter is the ONLY place where DB column names meet NERIS field names.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)


# ============================================================================
# Transform functions (forward: DB → NERIS)
# ============================================================================

def _fwd_direct(value, params):
    return value


def _fwd_timestamp_iso(value, params):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.strftime('%Y-%m-%dT%H:%M:%SZ')
        return value.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    if isinstance(value, str):
        v = value.strip()
        if v.endswith('+00:00') or v.endswith('+00'):
            v = v.rsplit('+', 1)[0] + 'Z'
        if not v.endswith('Z') and 'T' in v:
            v = v + 'Z'
        return v
    return str(value)


def _fwd_geo_point(lat, lng, params):
    """Special: takes two values (lat, lng) and builds GeoPoint."""
    if lat is None or lng is None:
        return None
    try:
        return {
            "crs": 4326,
            "geometry": {
                "type": "Point",
                "coordinates": [float(lng), float(lat)]
            }
        }
    except (ValueError, TypeError):
        return None


def _fwd_json_extract(value, params):
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return None
    if not isinstance(value, dict):
        return value
    path = (params or {}).get("path", "")
    for key in path.split("."):
        if not key:
            continue
        if isinstance(value, dict):
            value = value.get(key)
        else:
            return None
    return value


# ============================================================================
# Reverse transform functions (NERIS → DB)
# ============================================================================

def _rev_direct(value, params):
    return value


def _rev_timestamp_iso(value, params):
    """Convert ISO string back to a datetime-compatible string for DB."""
    if value is None:
        return None
    # DB expects timestamp with timezone — pass through, PG handles ISO strings
    return value


def _rev_geo_point(value, params):
    """Extract lat/lng from GeoPoint. Returns dict with lat and lng keys."""
    if value is None:
        return {"lat": None, "lng": None}
    try:
        coords = value.get("geometry", {}).get("coordinates", [])
        if len(coords) >= 2:
            return {"lat": str(coords[1]), "lng": str(coords[0])}
    except (AttributeError, TypeError):
        pass
    return {"lat": None, "lng": None}


def _rev_json_extract(value, params):
    """Reverse of json_extract — needs the full JSONB to update a nested key."""
    # This is complex — for now, return value as-is.
    # The save layer handles JSONB merging.
    return value


FORWARD_TRANSFORMS = {
    "direct": _fwd_direct,
    "timestamp_iso": _fwd_timestamp_iso,
    "json_extract": _fwd_json_extract,
    "enum_map": _fwd_direct,
    "address_parse": _fwd_direct,
    "lookup": _fwd_direct,
    "row_per_entry": _fwd_direct,
}

REVERSE_TRANSFORMS = {
    "direct": _rev_direct,
    "timestamp_iso": _rev_timestamp_iso,
    "json_extract": _rev_json_extract,
    "enum_map": _rev_direct,
    "address_parse": _rev_direct,
    "lookup": _rev_direct,
    "row_per_entry": _rev_direct,
}


# ============================================================================
# Load mappings from config table
# ============================================================================

def _load_mappings(db):
    """Load all active mappings, ordered by path + priority."""
    rows = db.execute(text("""
        SELECT neris_section, neris_field_path, neris_type, neris_required,
               source_table, source_column, transform, transform_params, priority
        FROM neris_field_mapping
        WHERE is_active = TRUE
        ORDER BY neris_field_path, priority
    """)).fetchall()

    mappings = []
    for r in rows:
        mappings.append({
            "section": r[0],
            "path": r[1],
            "type": r[2],
            "required": r[3],
            "source_table": r[4],
            "source_column": r[5],
            "transform": r[6],
            "transform_params": r[7],
            "priority": r[8],
        })
    return mappings


# ============================================================================
# Load source data from DB
# ============================================================================

def _load_source_data(incident_id, db):
    """
    Fetch all source data for an incident from all relevant tables.
    Returns dict keyed by table name, each containing the row(s) as dicts.
    """
    data = {}

    # incidents — single row
    row = db.execute(text("SELECT * FROM incidents WHERE id = :id"), {"id": incident_id}).fetchone()
    if row is None:
        return None
    cols = row._mapping.keys()
    data["incidents"] = dict(zip(cols, row))

    # incident_units — multiple rows
    rows = db.execute(text(
        "SELECT * FROM incident_units WHERE incident_id = :id ORDER BY id"
    ), {"id": incident_id}).fetchall()
    if rows:
        cols = rows[0]._mapping.keys()
        data["incident_units"] = [dict(zip(cols, r)) for r in rows]
    else:
        data["incident_units"] = []

    # incident_personnel — multiple rows
    rows = db.execute(text(
        "SELECT * FROM incident_personnel WHERE incident_id = :id ORDER BY id"
    ), {"id": incident_id}).fetchall()
    if rows:
        cols = rows[0]._mapping.keys()
        data["incident_personnel"] = [dict(zip(cols, r)) for r in rows]
    else:
        data["incident_personnel"] = []

    # municipalities — single row via incident's municipality_id
    muni_id = data["incidents"].get("municipality_id")
    if muni_id:
        row = db.execute(text("SELECT * FROM municipalities WHERE id = :id"), {"id": muni_id}).fetchone()
        if row:
            cols = row._mapping.keys()
            data["municipalities"] = dict(zip(cols, row))

    # apparatus — keyed by id for lookup
    rows = db.execute(text("SELECT * FROM apparatus WHERE active = true ORDER BY id")).fetchall()
    if rows:
        cols = rows[0]._mapping.keys()
        data["apparatus"] = {r[0]: dict(zip(cols, r)) for r in rows}
    else:
        data["apparatus"] = {}

    # settings — flatten category.key = value
    rows = db.execute(text("SELECT category, key, value FROM settings")).fetchall()
    settings = {}
    for r in rows:
        settings[r[0] + "." + r[1]] = r[2]
    data["settings"] = settings

    return data


def _get_source_value(source_table, source_column, source_data):
    """
    Read a value from the source data dict.
    Handles the different table structures (single row vs keyed vs flat).
    """
    if source_table == "incidents":
        return source_data.get("incidents", {}).get(source_column)
    elif source_table == "settings":
        return source_data.get("settings", {}).get(source_column)
    elif source_table == "municipalities":
        return source_data.get("municipalities", {}).get(source_column)
    elif source_table == "incident_units":
        # For unit-level fields, return the whole list — caller handles per-row
        return source_data.get("incident_units", [])
    elif source_table == "incident_personnel":
        return source_data.get("incident_personnel", [])
    elif source_table == "apparatus":
        return source_data.get("apparatus", {})
    return None


# ============================================================================
# Set a value in a nested dict by dot-path
# ============================================================================

def _set_nested(d, path, value):
    """Set a value in a nested dict using dot notation. Creates intermediate dicts."""
    keys = path.split(".")
    for key in keys[:-1]:
        if key not in d or not isinstance(d[key], dict):
            d[key] = {}
        d = d[key]
    d[keys[-1]] = value


def _get_nested(d, path, default=None):
    """Get a value from a nested dict using dot notation."""
    keys = path.split(".")
    for key in keys:
        if isinstance(d, dict):
            d = d.get(key, default)
        else:
            return default
    return d


# ============================================================================
# LOAD: DB → NERIS dict
# ============================================================================

def load_neris_data(incident_id, db):
    """
    Read mapping config, fetch incident data, apply transforms.
    Returns:
    {
        "neris_data": { nested NERIS dict },
        "mapped": [ paths that got values ],
        "empty": [ paths mapped but source was null ],
        "unmapped": [ paths with no mapping config ],
        "errors": [ {path, error} ],
        "incident_id": int,
        "incident_number": str,
    }
    """
    result = {
        "neris_data": {},
        "mapped": [],
        "empty": [],
        "unmapped": [],
        "errors": [],
        "incident_id": incident_id,
        "incident_number": None,
    }

    # Load mappings
    mappings = _load_mappings(db)

    # Load source data
    source_data = _load_source_data(incident_id, db)
    if source_data is None:
        result["errors"].append({"path": "*", "error": "Incident not found"})
        return result

    result["incident_number"] = source_data["incidents"].get("internal_incident_number")

    # Load overflow data (unmapped fields stored previously)
    overflow = source_data["incidents"].get("nerisv1_data") or {}
    if isinstance(overflow, str):
        try:
            overflow = json.loads(overflow)
        except (json.JSONDecodeError, TypeError):
            overflow = {}

    # Group mappings by path (for priority/fallback)
    path_mappings = {}
    for m in mappings:
        p = m["path"]
        if p not in path_mappings:
            path_mappings[p] = []
        path_mappings[p].append(m)

    # Process each mapped path
    for path, maps in path_mappings.items():
        value = None
        used_map = None

        # Try each mapping in priority order
        for m in sorted(maps, key=lambda x: x["priority"]):
            transform_fn = FORWARD_TRANSFORMS.get(m["transform"], _fwd_direct)

            # Special handling for geo_point (multi-column)
            if m["transform"] == "geo_point" and "," in (m["source_column"] or ""):
                col_parts = m["source_column"].split(",")
                if len(col_parts) == 2:
                    lat = _get_source_value(m["source_table"], col_parts[0].strip(), source_data)
                    lng = _get_source_value(m["source_table"], col_parts[1].strip(), source_data)
                    value = _fwd_geo_point(lat, lng, m["transform_params"])
                    if value is not None:
                        used_map = m
                        break
                continue

            raw = _get_source_value(m["source_table"], m["source_column"], source_data)

            # Skip list types (incident_units, incident_personnel) for now
            # These need row_per_entry handling
            if isinstance(raw, list):
                value = raw  # Pass through for now
                used_map = m
                break

            try:
                value = transform_fn(raw, m["transform_params"])
            except Exception as e:
                result["errors"].append({"path": path, "error": str(e)})
                continue

            if value is not None:
                used_map = m
                break

        if used_map is not None and value is not None:
            _set_nested(result["neris_data"], path, value)
            result["mapped"].append(path)
        elif used_map is not None:
            result["empty"].append(path)
        # else: no mapping exists — check overflow
        else:
            ov_val = _get_nested(overflow, path)
            if ov_val is not None:
                _set_nested(result["neris_data"], path, ov_val)
                result["mapped"].append(path)

    # Merge any overflow data for paths not covered by mappings
    _merge_overflow(result["neris_data"], overflow, path_mappings)

    return result


def _merge_overflow(neris_data, overflow, mapped_paths):
    """Merge overflow JSONB data for paths that have no mapping config."""
    if not overflow or not isinstance(overflow, dict):
        return
    _merge_recursive(neris_data, overflow, "", mapped_paths)


def _merge_recursive(target, source, prefix, mapped_paths):
    for key, val in source.items():
        full_path = (prefix + "." + key) if prefix else key
        if full_path in mapped_paths:
            continue  # Mapped field — adapter already handled it
        if isinstance(val, dict) and not any(full_path == p or p.startswith(full_path + ".") for p in mapped_paths):
            # Whole sub-dict is unmapped — merge it
            if key not in target or not isinstance(target[key], dict):
                target[key] = {}
            _merge_recursive(target[key], val, full_path, mapped_paths)
        elif full_path not in mapped_paths:
            target[key] = val


# ============================================================================
# SAVE: NERIS dict → DB
# ============================================================================

def save_neris_data(incident_id, neris_data, db):
    """
    Take a NERIS-native dict from the form, reverse-walk mappings,
    write mapped fields back to original source columns.
    Unmapped fields go to incidents.nerisv1_data JSONB.

    neris_data: flat dict of {neris_field_path: value} pairs

    Returns:
    {
        "saved_to_db": [ {path, table, column} ],
        "saved_to_overflow": [ paths ],
        "errors": [ {path, error} ],
    }
    """
    result = {
        "saved_to_db": [],
        "saved_to_overflow": [],
        "errors": [],
    }

    mappings = _load_mappings(db)

    # Index mappings by path (priority 1 only for writes — write to primary source)
    primary_map = {}
    for m in mappings:
        if m["path"] not in primary_map or m["priority"] < primary_map[m["path"]]["priority"]:
            primary_map[m["path"]] = m

    # Collect updates by table
    table_updates = {}  # {table: {column: value}}
    overflow_updates = {}

    for path, value in neris_data.items():
        m = primary_map.get(path)

        if m and m["source_table"] and m["source_column"]:
            table = m["source_table"]
            col = m["source_column"]
            rev_fn = REVERSE_TRANSFORMS.get(m["transform"], _rev_direct)

            # Special: geo_point writes to two columns
            if m["transform"] == "geo_point" and "," in col:
                col_parts = [c.strip() for c in col.split(",")]
                if len(col_parts) == 2:
                    coords = _rev_geo_point(value, m["transform_params"])
                    if table not in table_updates:
                        table_updates[table] = {}
                    table_updates[table][col_parts[0]] = coords["lat"]
                    table_updates[table][col_parts[1]] = coords["lng"]
                    result["saved_to_db"].append({"path": path, "table": table, "column": col})
                continue

            try:
                db_value = rev_fn(value, m["transform_params"])
            except Exception as e:
                result["errors"].append({"path": path, "error": str(e)})
                continue

            if table not in table_updates:
                table_updates[table] = {}
            table_updates[table][col] = db_value
            result["saved_to_db"].append({"path": path, "table": table, "column": col})
        else:
            # No mapping — goes to overflow
            _set_nested(overflow_updates, path, value)
            result["saved_to_overflow"].append(path)

    # Execute updates per table
    for table, updates in table_updates.items():
        if table == "incidents":
            _update_incidents(incident_id, updates, db)
        elif table == "settings":
            _update_settings(updates, db)
        # incident_units and incident_personnel need per-row handling
        # (future: match by unit_id or personnel_id)

    # Save overflow to nerisv1_data JSONB
    if overflow_updates:
        # Merge with existing overflow (don't clobber)
        existing = db.execute(text(
            "SELECT nerisv1_data FROM incidents WHERE id = :id"
        ), {"id": incident_id}).fetchone()
        existing_data = {}
        if existing and existing[0]:
            existing_data = existing[0] if isinstance(existing[0], dict) else json.loads(existing[0]) if isinstance(existing[0], str) else {}

        # Deep merge
        _deep_merge(existing_data, overflow_updates)

        db.execute(text(
            "UPDATE incidents SET nerisv1_data = :data::jsonb, updated_at = NOW() WHERE id = :id"
        ), {"data": json.dumps(existing_data), "id": incident_id})

    db.commit()
    return result


def _update_incidents(incident_id, updates, db):
    """Write column values back to the incidents table."""
    if not updates:
        return
    set_parts = []
    params = {"id": incident_id}
    for i, (col, val) in enumerate(updates.items()):
        param_name = "v" + str(i)
        set_parts.append('"' + col + '" = :' + param_name)
        params[param_name] = val

    set_parts.append("updated_at = NOW()")
    sql = "UPDATE incidents SET " + ", ".join(set_parts) + " WHERE id = :id"
    db.execute(text(sql), params)


def _update_settings(updates, db):
    """Write values back to the settings table (category.key format)."""
    for full_key, val in updates.items():
        parts = full_key.split(".", 1)
        if len(parts) == 2:
            db.execute(text("""
                UPDATE settings SET value = :val, updated_at = NOW()
                WHERE category = :cat AND key = :key
            """), {"val": str(val) if val is not None else None, "cat": parts[0], "key": parts[1]})


def _deep_merge(base, overlay):
    """Recursively merge overlay into base dict."""
    for key, val in overlay.items():
        if key in base and isinstance(base[key], dict) and isinstance(val, dict):
            _deep_merge(base[key], val)
        else:
            base[key] = val
