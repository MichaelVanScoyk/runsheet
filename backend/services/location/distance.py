"""
Distance Calculations for Location Services

Haversine formula for great-circle distance between two lat/lng points.
Used to pick the closest geocoding match to the station.
"""

import math
from typing import Optional


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate great-circle distance between two points in kilometers.
    Uses the Haversine formula.
    """
    R = 6371.0  # Earth radius in km
    
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def closest_match(
    matches: list[dict],
    station_lat: float,
    station_lng: float,
) -> Optional[dict]:
    """
    Pick the geocoding match closest to the station coordinates.
    
    Each match dict must have 'latitude' and 'longitude' keys.
    Returns the closest match dict with 'distance_km' added, or None if empty.
    """
    if not matches:
        return None
    
    best = None
    best_dist = float('inf')
    
    for match in matches:
        lat = match.get('latitude')
        lng = match.get('longitude')
        if lat is None or lng is None:
            continue
        
        dist = haversine_km(station_lat, station_lng, lat, lng)
        match['distance_km'] = round(dist, 2)
        
        if dist < best_dist:
            best_dist = dist
            best = match
    
    return best
