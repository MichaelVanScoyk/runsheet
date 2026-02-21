"""
Geocoding Service for Location Services

Primary:  Google Geocoding API (best accuracy, rooftop precision, requires API key)
Fallback: US Census Geocoder (free, no API key, government authoritative)
Last:     Geocodio (free tier 2500/day, requires API key)

Strategy:
    1. If Google key configured -> try Google first
    2. If Google fails/unavailable -> fall back to Census
    3. If Census fails -> try Geocodio if key configured
    4. Pick the match closest to the station's stored coordinates
    5. If all fail -> return None (incident flagged "needs review")

All results are normalized to a common format for storage.
"""

import logging
import httpx
from typing import Optional
from .distance import closest_match

logger = logging.getLogger(__name__)

# Google Geocoding API
GOOGLE_BASE = "https://maps.googleapis.com/maps/api/geocode/json"
GOOGLE_TIMEOUT = 10

# Census Geocoder API
CENSUS_BASE = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
CENSUS_TIMEOUT = 15  # seconds - government API can be slow

# Geocodio API
GEOCODIO_BASE = "https://api.geocod.io/v1.7/geocode"
GEOCODIO_TIMEOUT = 10


def geocode_address(
    address: str,
    station_lat: float,
    station_lng: float,
    state: str = "PA",
    google_api_key: Optional[str] = None,
    geocodio_api_key: Optional[str] = None,
) -> Optional[dict]:
    """
    Geocode an address using Google (primary), Census (fallback), Geocodio (last).
    Returns the best match closest to station, or None.
    
    Returns dict with:
        latitude, longitude, matched_address,
        street_number, street_name, street_suffix, street_prefix,
        city, state, zip_code, county, county_fips,
        census_tract, census_block, state_fips,
        provider (str: 'google', 'census', or 'geocodio'),
        confidence (float: 0-1),
        distance_km (float: distance from station),
        all_matches (int: total matches before filtering)
    """
    if not address or not address.strip():
        return None
    
    # Try Google first if API key configured (best accuracy)
    if google_api_key:
        result = _geocode_google(address, station_lat, station_lng, state, google_api_key)
        if result:
            # ROOFTOP = Google has the real address, trust it
            if result.get('location_type') == 'ROOFTOP':
                return result
            # RANGE_INTERPOLATED = Google guessed, check Census for actual 911 address
            census_result = _geocode_census(address, station_lat, station_lng, state)
            if census_result and census_result.get('distance_km', 9999) < result.get('distance_km', 9999):
                return census_result
            return result
    
    # Fallback to Census if no Google key
    result = _geocode_census(address, station_lat, station_lng, state)
    if result:
        return result
    
    # Last resort: Geocodio if API key configured
    if geocodio_api_key:
        result = _geocode_geocodio(address, station_lat, station_lng, state, geocodio_api_key)
        if result:
            return result
    
    logger.warning(f"Geocoding failed for: {address}")
    return None


def _geocode_google(
    address: str,
    station_lat: float,
    station_lng: float,
    state: str,
    api_key: str,
) -> Optional[dict]:
    """
    Query Google Geocoding API and return best match closest to station.
    """
    query_address = address.strip()
    if not any(s in query_address.upper() for s in [f', {state}', f',{state}', f' {state} ']):
        query_address = f"{query_address}, {state}"
    
    params = {
        "address": query_address,
        "key": api_key,
    }
    
    # Bias results toward station area (not a filter — results outside bounds still returned)
    if station_lat and station_lng:
        # ~30km box around station
        offset = 0.27  # ~30km in degrees
        params["bounds"] = (f"{station_lat - offset},{station_lng - offset}"
                            f"|{station_lat + offset},{station_lng + offset}")
    
    try:
        with httpx.Client(timeout=GOOGLE_TIMEOUT) as client:
            response = client.get(GOOGLE_BASE, params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException:
        logger.warning(f"Google geocoder timeout for: {address}")
        return None
    except Exception as e:
        logger.error(f"Google geocoder error for '{address}': {e}")
        return None
    
    status = data.get("status", "")
    if status != "OK":
        logger.info(f"Google: status '{status}' for '{query_address}'")
        return None
    
    results = data.get("results", [])
    if not results:
        logger.info(f"Google: no results for '{query_address}'")
        return None
    
    # Normalize all matches
    matches = []
    for r in results:
        geo = r.get("geometry", {})
        loc = geo.get("location", {})
        location_type = geo.get("location_type", "")
        
        # Parse address components
        components = {}
        for comp in r.get("address_components", []):
            types = comp.get("types", [])
            for t in types:
                components[t] = comp
        
        # Map Google confidence from location_type
        confidence_map = {
            "ROOFTOP": 1.0,
            "RANGE_INTERPOLATED": 0.8,
            "GEOMETRIC_CENTER": 0.6,
            "APPROXIMATE": 0.4,
        }
        
        matches.append({
            "latitude": loc.get("lat"),
            "longitude": loc.get("lng"),
            "matched_address": r.get("formatted_address", ""),
            "street_number": components.get("street_number", {}).get("long_name", ""),
            "street_name": components.get("route", {}).get("long_name", ""),
            "street_suffix": "",
            "street_prefix": "",
            "city": components.get("locality", {}).get("long_name", ""),
            "state": components.get("administrative_area_level_1", {}).get("short_name", ""),
            "zip_code": components.get("postal_code", {}).get("long_name", ""),
            "county": components.get("administrative_area_level_2", {}).get("long_name", "").replace(" County", ""),
            "county_fips": "",
            "county_subdivision": components.get("administrative_area_level_3", {}).get("long_name", ""),
            "state_fips": "",
            "census_tract": "",
            "census_block": "",
            "provider": "google",
            "confidence": confidence_map.get(location_type, 0.5),
            "location_type": location_type,
        })
    
    # Pick closest to station
    best = closest_match(matches, station_lat, station_lng)
    if best:
        best["all_matches"] = len(matches)
        logger.info(
            f"Google: {len(matches)} results for '{query_address}', "
            f"selected '{best.get('matched_address')}' ({best.get('location_type', '')}) "
            f"at {best.get('distance_km')}km"
        )
    
    return best


def _geocode_census(
    address: str,
    station_lat: float,
    station_lng: float,
    state: str,
) -> Optional[dict]:
    """
    Query US Census Geocoder and return best match closest to station.
    """
    # Append state if not already present
    query_address = address.strip()
    if not any(s in query_address.upper() for s in [f', {state}', f',{state}', f' {state} ']):
        query_address = f"{query_address}, {state}"
    
    params = {
        "address": query_address,
        "benchmark": "Public_AR_Current",
        "vintage": "Current_Current",
        "format": "json",
    }
    
    try:
        with httpx.Client(timeout=CENSUS_TIMEOUT) as client:
            response = client.get(CENSUS_BASE, params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException:
        logger.warning(f"Census geocoder timeout for: {address}")
        return None
    except Exception as e:
        logger.error(f"Census geocoder error for '{address}': {e}")
        return None
    
    matches_raw = data.get("result", {}).get("addressMatches", [])
    if not matches_raw:
        logger.info(f"Census: no matches for '{query_address}'")
        return None
    
    # Normalize all matches
    matches = []
    for m in matches_raw:
        coords = m.get("coordinates", {})
        addr_comp = m.get("addressComponents", {})
        geographies = m.get("geographies", {})
        
        # Extract county subdivision and county from geographies
        county_sub = geographies.get("County Subdivisions", [{}])[0] if geographies.get("County Subdivisions") else {}
        counties = geographies.get("Counties", [{}])[0] if geographies.get("Counties") else {}
        census_tracts = geographies.get("Census Tracts", [{}])[0] if geographies.get("Census Tracts") else {}
        
        matches.append({
            "latitude": coords.get("y"),
            "longitude": coords.get("x"),
            "matched_address": m.get("matchedAddress", ""),
            "street_number": addr_comp.get("fromAddress", "") or addr_comp.get("toAddress", ""),
            "street_name": addr_comp.get("streetName", ""),
            "street_suffix": addr_comp.get("suffixType", ""),
            "street_prefix": addr_comp.get("preDirectional", ""),
            "city": addr_comp.get("city", ""),
            "state": addr_comp.get("state", ""),
            "zip_code": addr_comp.get("zip", ""),
            "county": counties.get("BASENAME", "") or county_sub.get("COUNTY", ""),
            "county_fips": counties.get("COUNTY", ""),
            "county_subdivision": county_sub.get("BASENAME", ""),
            "state_fips": counties.get("STATE", "") or census_tracts.get("STATE", ""),
            "census_tract": census_tracts.get("TRACT", ""),
            "census_block": census_tracts.get("BLOCK", ""),
            "provider": "census",
            "confidence": 1.0,  # Census doesn't provide confidence scores
        })
    
    # Pick closest to station
    best = closest_match(matches, station_lat, station_lng)
    if best:
        best["all_matches"] = len(matches)
        logger.info(
            f"Census: {len(matches)} matches for '{query_address}', "
            f"selected '{best.get('matched_address')}' at {best.get('distance_km')}km"
        )
    
    return best


def _geocode_geocodio(
    address: str,
    station_lat: float,
    station_lng: float,
    state: str,
    api_key: str,
) -> Optional[dict]:
    """
    Query Geocodio API as last resort and return best match closest to station.
    """
    query_address = address.strip()
    if not any(s in query_address.upper() for s in [f', {state}', f',{state}', f' {state} ']):
        query_address = f"{query_address}, {state}"
    
    params = {
        "q": query_address,
        "api_key": api_key,
        "fields": "census",
    }
    
    try:
        with httpx.Client(timeout=GEOCODIO_TIMEOUT) as client:
            response = client.get(GEOCODIO_BASE, params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException:
        logger.warning(f"Geocodio timeout for: {address}")
        return None
    except Exception as e:
        logger.error(f"Geocodio error for '{address}': {e}")
        return None
    
    results = data.get("results", [])
    if not results:
        logger.info(f"Geocodio: no results for '{query_address}'")
        return None
    
    # Normalize matches
    matches = []
    for r in results:
        loc = r.get("location", {})
        addr = r.get("address_components", {})
        census_fields = r.get("fields", {}).get("census", {}).get("2020", {}) or {}
        
        matches.append({
            "latitude": loc.get("lat"),
            "longitude": loc.get("lng"),
            "matched_address": r.get("formatted_address", ""),
            "street_number": addr.get("number", ""),
            "street_name": addr.get("street", ""),
            "street_suffix": addr.get("suffix", ""),
            "street_prefix": addr.get("predirectional", ""),
            "city": addr.get("city", ""),
            "state": addr.get("state", ""),
            "zip_code": addr.get("zip", ""),
            "county": addr.get("county", ""),
            "county_fips": census_fields.get("county_fips", ""),
            "county_subdivision": "",
            "state_fips": census_fields.get("state_fips", ""),
            "census_tract": census_fields.get("tract_code", ""),
            "census_block": census_fields.get("block_code", ""),
            "provider": "geocodio",
            "confidence": r.get("accuracy", 0),
        })
    
    # Pick closest to station
    best = closest_match(matches, station_lat, station_lng)
    if best:
        best["all_matches"] = len(matches)
        logger.info(
            f"Geocodio: {len(matches)} results for '{query_address}', "
            f"selected '{best.get('matched_address')}' at {best.get('distance_km')}km"
        )
    
    return best


def geocode_incident(
    address: str,
    station_lat: float,
    station_lng: float,
    state: str = "PA",
    google_api_key: Optional[str] = None,
    geocodio_api_key: Optional[str] = None,
) -> dict:
    """
    Geocode an incident address and return a result dict ready for DB storage.
    
    Returns dict with:
        success (bool), latitude, longitude, geocode_data (full result dict),
        needs_review (bool)
    """
    result = geocode_address(
        address=address,
        station_lat=station_lat,
        station_lng=station_lng,
        state=state,
        google_api_key=google_api_key,
        geocodio_api_key=geocodio_api_key,
    )
    
    if result:
        return {
            "success": True,
            "latitude": result["latitude"],
            "longitude": result["longitude"],
            "geocode_data": result,
            "needs_review": False,
        }
    
    return {
        "success": False,
        "latitude": None,
        "longitude": None,
        "geocode_data": None,
        "needs_review": True,
    }


def geocode_all_matches(
    address: str,
    station_lat: float,
    station_lng: float,
    state: str = "PA",
    google_api_key: Optional[str] = None,
) -> list:
    """
    Return ALL geocode matches from Google + Census, each with distance_km.
    Sorted by distance to station. Used by the manual location picker UI.
    """
    from .distance import haversine_km

    if not address or not address.strip():
        return []

    all_matches = []

    # Google
    if google_api_key:
        all_matches.extend(_get_raw_google(address, state, google_api_key))

    # Census
    all_matches.extend(_get_raw_census(address, state))

    # Add distance via distance.py haversine
    for m in all_matches:
        lat = m.get("latitude")
        lng = m.get("longitude")
        if lat is not None and lng is not None:
            m["distance_km"] = round(haversine_km(station_lat, station_lng, lat, lng), 2)
        else:
            m["distance_km"] = 9999

    # Dedupe by coords
    seen = set()
    deduped = []
    for m in all_matches:
        key = (round(m.get("latitude", 0), 5), round(m.get("longitude", 0), 5))
        if key not in seen:
            seen.add(key)
            deduped.append(m)

    deduped.sort(key=lambda m: m["distance_km"])
    return deduped


def _get_raw_google(address: str, state: str, api_key: str) -> list:
    """Fetch all Google results as normalized dicts."""
    query_address = address.strip()
    if not any(s in query_address.upper() for s in [f', {state}', f',{state}', f' {state} ']):
        query_address = f"{query_address}, {state}"

    try:
        with httpx.Client(timeout=GOOGLE_TIMEOUT) as client:
            response = client.get(GOOGLE_BASE, params={"address": query_address, "key": api_key})
            response.raise_for_status()
            data = response.json()
    except Exception:
        return []

    if data.get("status") != "OK":
        return []

    confidence_map = {"ROOFTOP": 1.0, "RANGE_INTERPOLATED": 0.8, "GEOMETRIC_CENTER": 0.6, "APPROXIMATE": 0.4}
    matches = []
    for r in data.get("results", []):
        geo = r.get("geometry", {})
        loc = geo.get("location", {})
        location_type = geo.get("location_type", "")
        components = {}
        for comp in r.get("address_components", []):
            for t in comp.get("types", []):
                components[t] = comp
        matches.append({
            "latitude": loc.get("lat"),
            "longitude": loc.get("lng"),
            "matched_address": r.get("formatted_address", ""),
            "city": components.get("locality", {}).get("long_name", ""),
            "state": components.get("administrative_area_level_1", {}).get("short_name", ""),
            "county": components.get("administrative_area_level_2", {}).get("long_name", "").replace(" County", ""),
            "provider": "google",
            "confidence": confidence_map.get(location_type, 0.5),
        })
    return matches


def _get_raw_census(address: str, state: str) -> list:
    """Fetch all Census results as normalized dicts."""
    query_address = address.strip()
    if not any(s in query_address.upper() for s in [f', {state}', f',{state}', f' {state} ']):
        query_address = f"{query_address}, {state}"

    try:
        with httpx.Client(timeout=CENSUS_TIMEOUT) as client:
            response = client.get(CENSUS_BASE, params={
                "address": query_address,
                "benchmark": "Public_AR_Current",
                "vintage": "Current_Current",
                "format": "json",
            })
            response.raise_for_status()
            data = response.json()
    except Exception:
        return []

    matches = []
    for m in data.get("result", {}).get("addressMatches", []):
        coords = m.get("coordinates", {})
        addr_comp = m.get("addressComponents", {})
        geographies = m.get("geographies", {})
        county_sub = geographies.get("County Subdivisions", [{}])[0] if geographies.get("County Subdivisions") else {}
        counties = geographies.get("Counties", [{}])[0] if geographies.get("Counties") else {}
        matches.append({
            "latitude": coords.get("y"),
            "longitude": coords.get("x"),
            "matched_address": m.get("matchedAddress", ""),
            "city": addr_comp.get("city", ""),
            "state": addr_comp.get("state", ""),
            "county": counties.get("BASENAME", "") or county_sub.get("COUNTY", ""),
            "provider": "census",
            "confidence": 1.0,
        })
    return matches
