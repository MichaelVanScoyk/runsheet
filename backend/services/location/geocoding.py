"""
Geocoding Service for Location Services

Primary:  US Census Geocoder (free, no API key, government authoritative)
Fallback: Geocodio (free tier 2500/day, requires API key in settings)

Strategy:
    1. Send "[address], PA" to Census -> get multiple matches
    2. Pick the match closest to the station's stored coordinates
    3. If Census fails/returns nothing -> try Geocodio
    4. If both fail -> return None (incident flagged "needs review")

Census returns lat/lng + FIPS codes + address components.
All results are normalized to a common format for storage.
"""

import logging
import httpx
from typing import Optional
from .distance import closest_match

logger = logging.getLogger(__name__)

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
    geocodio_api_key: Optional[str] = None,
) -> Optional[dict]:
    """
    Geocode an address using Census (primary) then Geocodio (fallback).
    Returns the best match closest to station, or None.
    
    Returns dict with:
        latitude, longitude, matched_address,
        street_number, street_name, street_suffix, street_prefix,
        city, state, zip_code, county, county_fips,
        census_tract, census_block, state_fips,
        provider (str: 'census' or 'geocodio'),
        confidence (float: 0-1),
        distance_km (float: distance from station),
        all_matches (int: total matches before filtering)
    """
    if not address or not address.strip():
        return None
    
    # Try Census first
    result = _geocode_census(address, station_lat, station_lng, state)
    if result:
        return result
    
    # Fallback to Geocodio if API key configured
    if geocodio_api_key:
        result = _geocode_geocodio(address, station_lat, station_lng, state, geocodio_api_key)
        if result:
            return result
    
    logger.warning(f"Geocoding failed for: {address}")
    return None


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
    Query Geocodio API as fallback and return best match closest to station.
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
