"""
NERIS Location Payload Builder

Reads directly from incidents.geocode_data (JSONB) — the single source of truth.
No intermediate neris_location column needed.

geocode_data is populated by whichever provider the user selected:
  - Google:   street_name has full name ("Fairview Road"), street_suffix/prefix empty
  - Census:   street_name, street_suffix, street_prefix already split
  - Geocodio: street_name, street_suffix, street_prefix already split

This builder handles the Google parsing at build time.

Source DB fields:
  - incidents.geocode_data (JSONB) — full geocode result from any provider
  - incidents.latitude, incidents.longitude — GPS coordinates
  - incidents.cross_streets — cross street text
  - incidents.location_name — common name / place name

NERIS target: LocationPayload (NG911 CLDXF) + GeoPoint
"""

import re
import logging

logger = logging.getLogger(__name__)

# ── Street suffix lookup ──────────────────────────────────────────────
# Common street type abbreviations → NERIS/NG911 standard abbreviations.
# Used to parse Google results where "Fairview Road" needs to become
# street="Fairview", street_postfix="RD".
# Keys are lowercase for matching; values are the standardized abbreviation.

STREET_SUFFIXES = {
    "alley": "ALY", "avenue": "AVE", "boulevard": "BLVD", "bridge": "BRG",
    "bypass": "BYP", "circle": "CIR", "commons": "CMNS", "corner": "COR",
    "court": "CT", "cove": "CV", "creek": "CRK", "crescent": "CRES",
    "crossing": "XING", "drive": "DR", "estate": "EST", "expressway": "EXPY",
    "extension": "EXT", "fork": "FRK", "freeway": "FWY", "garden": "GDN",
    "gardens": "GDNS", "gateway": "GTWY", "glen": "GLN", "green": "GRN",
    "grove": "GRV", "harbor": "HBR", "heights": "HTS", "highway": "HWY",
    "hill": "HL", "hills": "HLS", "hollow": "HOLW", "inlet": "INLT",
    "island": "IS", "junction": "JCT", "key": "KY", "knoll": "KNL",
    "lake": "LK", "lane": "LN", "light": "LGT", "landing": "LNDG",
    "loop": "LOOP", "mall": "MALL", "manor": "MNR", "meadow": "MDW",
    "meadows": "MDWS", "mount": "MT", "mountain": "MTN", "oval": "OVAL",
    "park": "PARK", "parkway": "PKWY", "pass": "PASS", "path": "PATH",
    "pike": "PIKE", "pine": "PNE", "pines": "PNES", "place": "PL",
    "plain": "PLN", "plains": "PLNS", "plaza": "PLZ", "point": "PT",
    "port": "PRT", "ranch": "RNCH", "rapids": "RPDS", "ridge": "RDG",
    "river": "RIV", "road": "RD", "route": "RTE", "row": "ROW",
    "run": "RUN", "shore": "SHR", "spring": "SPG", "springs": "SPGS",
    "spur": "SPUR", "square": "SQ", "station": "STA", "stream": "STRM",
    "street": "ST", "summit": "SMT", "terrace": "TER", "trace": "TRCE",
    "track": "TRAK", "trail": "TRL", "tunnel": "TUNL", "turnpike": "TPKE",
    "valley": "VLY", "view": "VW", "village": "VLG", "vista": "VIS",
    "walk": "WALK", "way": "WAY",
    # Common abbreviations as keys too (user might type "rd" not "road")
    "aly": "ALY", "ave": "AVE", "blvd": "BLVD", "brg": "BRG",
    "byp": "BYP", "cir": "CIR", "ct": "CT", "cv": "CV",
    "dr": "DR", "est": "EST", "expy": "EXPY", "ext": "EXT",
    "fwy": "FWY", "hts": "HTS", "hwy": "HWY", "jct": "JCT",
    "ln": "LN", "lp": "LOOP", "mnr": "MNR", "mt": "MT",
    "mtn": "MTN", "pkwy": "PKWY", "pl": "PL", "plz": "PLZ",
    "pt": "PT", "rd": "RD", "rte": "RTE", "sq": "SQ",
    "st": "ST", "ter": "TER", "trl": "TRL", "tpke": "TPKE",
    "vw": "VW", "wy": "WAY",
}

# Directional prefixes/suffixes
DIRECTIONALS = {
    "north": "N", "south": "S", "east": "E", "west": "W",
    "northeast": "NE", "northwest": "NW", "southeast": "SE", "southwest": "SW",
    "n": "N", "s": "S", "e": "E", "w": "W",
    "ne": "NE", "nw": "NW", "se": "SE", "sw": "SW",
}


def _parse_google_street(street_name: str) -> dict:
    """
    Parse a Google-style combined street name into components.
    
    Google returns route as "Fairview Road" or "N Main St" or "US Route 30".
    We need to split into: prefix_direction, street_name, street_postfix.
    
    Returns dict with keys: street, street_postfix, street_prefix_direction,
                            street_postfix_direction
    """
    if not street_name or not street_name.strip():
        return {"street": ""}

    parts = street_name.strip().split()
    if not parts:
        return {"street": ""}

    result = {
        "street": "",
        "street_postfix": "",
        "street_prefix_direction": "",
        "street_postfix_direction": "",
    }

    # Check first word for directional prefix
    if len(parts) > 1 and parts[0].lower() in DIRECTIONALS:
        result["street_prefix_direction"] = DIRECTIONALS[parts[0].lower()]
        parts = parts[1:]

    # Check last word for directional suffix (rare but exists: "Main St N")
    if len(parts) > 1 and parts[-1].lower() in DIRECTIONALS:
        result["street_postfix_direction"] = DIRECTIONALS[parts[-1].lower()]
        parts = parts[:-1]

    # Check last word for street suffix
    if len(parts) > 1 and parts[-1].lower() in STREET_SUFFIXES:
        result["street_postfix"] = STREET_SUFFIXES[parts[-1].lower()]
        parts = parts[:-1]

    # Everything remaining is the street name
    result["street"] = " ".join(parts)

    return result


def build_location(incident: dict) -> dict:
    """
    Build NERIS LocationPayload from incident's geocode_data.
    
    Reads directly from geocode_data JSONB — no neris_location column.
    Handles all three providers: Google, Census, Geocodio.
    """
    geo = incident.get("geocode_data") or {}
    if not geo:
        return {}

    provider = geo.get("provider", "").lower()
    payload = {}

    # ── Street number ──
    number = geo.get("street_number")
    if number:
        payload["number"] = str(number)

    # ── Street name + suffix + directionals ──
    # Census and Geocodio already split these fields.
    # Google puts everything in street_name — we parse it.
    street_name = geo.get("street_name", "")
    street_suffix = geo.get("street_suffix", "")
    street_prefix = geo.get("street_prefix", "")

    if provider == "google" and street_name and not street_suffix:
        # Google: parse the combined street name
        parsed = _parse_google_street(street_name)
        if parsed["street"]:
            payload["street"] = parsed["street"]
        if parsed["street_postfix"]:
            payload["street_postfix"] = parsed["street_postfix"]
        if parsed["street_prefix_direction"]:
            payload["street_prefix_direction"] = parsed["street_prefix_direction"]
        if parsed["street_postfix_direction"]:
            payload["street_postfix_direction"] = parsed["street_postfix_direction"]
    else:
        # Census / Geocodio: fields already split
        if street_name:
            payload["street"] = street_name
        if street_suffix:
            # Normalize suffix to standard abbreviation
            normalized = STREET_SUFFIXES.get(street_suffix.lower(), street_suffix.upper())
            payload["street_postfix"] = normalized
        if street_prefix:
            # Normalize directional
            normalized = DIRECTIONALS.get(street_prefix.lower(), street_prefix.upper())
            payload["street_prefix_direction"] = normalized

    # ── City: NERIS wants postal community, not township ──
    # geocode_data.city is the postal city from all three providers.
    # This is NOT the township/municipality from CAD.
    city = geo.get("city")
    if city:
        payload["postal_community"] = city

    # ── County ──
    county = geo.get("county")
    if county:
        payload["county"] = county

    # ── State ──
    state = geo.get("state")
    if state:
        payload["state"] = state

    # ── Zip ──
    zip_code = geo.get("zip_code")
    if zip_code:
        # Split zip+4 if present
        if "-" in str(zip_code):
            parts = str(zip_code).split("-", 1)
            payload["postal_code"] = parts[0]
            if len(parts) > 1 and parts[1]:
                payload["postal_code_extension"] = parts[1]
        else:
            payload["postal_code"] = str(zip_code)

    # ── Country (default US) ──
    payload["country"] = "US"

    # ── Location name → additional_attributes.common_name ──
    location_name = incident.get("location_name")
    if location_name:
        payload["additional_attributes"] = {"common_name": location_name}

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
    
    Our DB stores: "FAIRVIEW RD AND HOWSON LN" as a single string.
    NERIS wants: [{street: "FAIRVIEW", street_postfix: "RD"}, ...]
    
    We parse each cross street to split name from suffix.
    """
    raw = incident.get("cross_streets")
    if not raw:
        return None

    # Split on common delimiters
    streets = [s.strip() for s in re.split(r'\s+AND\s+|/|&', raw, flags=re.IGNORECASE) if s.strip()]
    if not streets:
        return None

    result = []
    for s in streets:
        parsed = _parse_google_street(s)  # reuse the parser — works on any street string
        entry = {}
        if parsed["street"]:
            entry["street"] = parsed["street"]
        if parsed["street_postfix"]:
            entry["street_postfix"] = parsed["street_postfix"]
        if parsed["street_prefix_direction"]:
            entry["street_prefix_direction"] = parsed["street_prefix_direction"]
        if entry:
            result.append(entry)

    return result if result else None
