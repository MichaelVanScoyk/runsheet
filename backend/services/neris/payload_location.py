"""
NERIS Location Payload Builder

Maps our DB fields → NERIS LocationPayload (NG911 CLDXF format).

Source DB fields:
  - incidents.neris_location (JSONB) — structured address components
  - incidents.latitude, incidents.longitude — GPS coordinates
  - incidents.cross_streets — cross street text
  - municipalities table — county, state

NERIS target: LocationPayload + GeoPoint
"""


def build_location(incident: dict) -> dict:
    """
    Build NERIS LocationPayload from incident row.
    
    Our neris_location JSONB maps to NERIS NG911 fields.
    Returns empty dict if no location data available.
    """
    loc = incident.get("neris_location") or {}
    if not loc:
        return {}

    payload = {}

    # Direct field mappings: our key → NERIS key
    FIELD_MAP = {
        "an_number":                "number",
        "sn_street_name":           "street",
        "sn_post_type":             "street_postfix",
        "sn_pre_directional":       "street_prefix_direction",
        "sn_post_directional":      "street_postfix_direction",
        "sn_pre_modifier":          "street_prefix_modifier",
        "sn_post_modifier":         "street_postfix_modifier",
        "sn_pre_type":              "street_prefix",
        "csop_incorporated_muni":   "incorporated_municipality",
        "csop_postal_community":    "postal_community",
        "csop_county":              "county",
        "csop_state":               "state",
        "csop_postal_code":         "postal_code",
        "csop_postal_code_ext":     "postal_code_extension",
        "csop_country":             "country",
        "subsite":                  "subsite",
        "site":                     "site",
        "floor":                    "floor",
        "unit_prefix":              "unit_prefix",
        "unit_value":               "unit_value",
        "room":                     "room",
        "place_type":               "place_type",
        "additional_info":          "additional_info",
        "structure":                "structure",
    }

    for our_key, neris_key in FIELD_MAP.items():
        val = loc.get(our_key)
        if val is not None and val != "":
            payload[neris_key] = val

    # additional_attributes pass-through (JSONB → dict)
    attrs = loc.get("additional_attributes")
    if attrs:
        payload["additional_attributes"] = attrs

    # Location name goes into additional_attributes.common_name
    location_name = incident.get("location_name")
    if location_name:
        if "additional_attributes" not in payload:
            payload["additional_attributes"] = {}
        payload["additional_attributes"]["common_name"] = location_name

    return payload


def build_geo_point(incident: dict) -> dict | None:
    """
    Build NERIS GeoPoint from lat/lon.
    
    CRITICAL: NERIS GeoJSON uses [longitude, latitude] order.
    Our DB stores them as separate string fields.
    """
    lat = incident.get("latitude")
    lon = incident.get("longitude")

    if not lat or not lon:
        return None

    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (ValueError, TypeError):
        return None

    return {
        "crs": 4326,
        "geometry": {
            "type": "Point",
            "coordinates": [lon_f, lat_f]  # [lon, lat] — NERIS order
        }
    }


def build_cross_streets(incident: dict) -> list | None:
    """
    Build NERIS CrossStreetPayload array from our cross_streets string.
    
    Our DB stores: "Oak Ave / Elm St" as a single string.
    NERIS wants: [{street: "Oak", street_postfix: "AVENUE"}, ...]
    
    We pass the raw street names — no type parsing here.
    If structured cross street data lands in neris_location, use that instead.
    """
    loc = incident.get("neris_location") or {}
    structured = loc.get("cross_streets")
    if structured and isinstance(structured, list):
        return structured

    raw = incident.get("cross_streets")
    if not raw:
        return None

    streets = [s.strip() for s in raw.replace("&", "/").split("/") if s.strip()]
    if not streets:
        return None

    return [{"street": s} for s in streets]
