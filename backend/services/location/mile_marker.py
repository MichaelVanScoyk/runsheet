"""
Mile Marker Geocoding Service

Geocodes highway mile marker addresses like "303.7 WB PA TPKE" by:
1. Parsing the address to extract mile marker, direction, and road name
2. Looking up matching highway route via alias
3. Interpolating GPS coordinates along the route from the known MM anchor

Uses Haversine formula for accurate distance calculations along route shape points.
"""

import re
import math
import logging
from typing import Optional, Tuple, List
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)

# Mile marker patterns - common formats from CAD systems
MM_PATTERNS = [
    # "303.7 WB PA TPKE", "MM 303.7 WB PA TURNPIKE"
    r'(?:MM\s*)?(\d+(?:\.\d+)?)\s*(NB|SB|EB|WB)?\s+(.+)',
    # "WB MM 303.7 PA TPKE"
    r'(NB|SB|EB|WB)\s*MM\s*(\d+(?:\.\d+)?)\s+(.+)',
    # "PA TPKE WB MM 303.7"
    r'(.+?)\s+(NB|SB|EB|WB)\s*MM\s*(\d+(?:\.\d+)?)',
]


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate great-circle distance between two points in miles.
    Uses Haversine formula.
    """
    R = 3958.8  # Earth's radius in miles
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    
    a = (math.sin(delta_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def parse_mile_marker_address(address: str) -> Optional[dict]:
    """
    Parse a mile marker address string.
    
    Returns dict with:
        mile: float (e.g., 303.7)
        direction: str or None (NB, SB, EB, WB)
        road: str (e.g., "PA TPKE")
    
    Or None if address doesn't match mile marker pattern.
    """
    if not address:
        return None
    
    addr = address.strip().upper()
    
    # Try each pattern
    for pattern in MM_PATTERNS:
        match = re.match(pattern, addr, re.IGNORECASE)
        if match:
            groups = match.groups()
            
            # Pattern 1: mile, direction, road
            if re.match(r'\d', groups[0]):
                return {
                    "mile": float(groups[0]),
                    "direction": groups[1].upper() if groups[1] else None,
                    "road": groups[2].strip(),
                }
            # Pattern 2: direction, mile, road
            elif groups[0] in ('NB', 'SB', 'EB', 'WB'):
                return {
                    "mile": float(groups[1]),
                    "direction": groups[0].upper(),
                    "road": groups[2].strip(),
                }
            # Pattern 3: road, direction, mile
            else:
                return {
                    "mile": float(groups[2]),
                    "direction": groups[1].upper() if groups[1] else None,
                    "road": groups[0].strip(),
                }
    
    return None


def is_mile_marker_address(address: str) -> bool:
    """Quick check if address looks like a mile marker."""
    return parse_mile_marker_address(address) is not None


def find_route_by_alias(db: Session, alias: str) -> Optional[dict]:
    """
    Look up a highway route by alias.
    Returns route dict with points, or None if not found.
    """
    # Check if tables exist
    table_check = db.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'highway_routes'
        )
    """)).scalar()
    
    if not table_check:
        return None
    
    # Find route by alias (case-insensitive)
    result = db.execute(text("""
        SELECT hr.id, hr.name, hr.bidirectional, hr.direction, hr.limited_access,
               hr.miles_decrease_toward, hr.mm_point_index, hr.mm_value
        FROM highway_routes hr
        JOIN highway_route_aliases hra ON hra.route_id = hr.id
        WHERE UPPER(hra.alias) = UPPER(:alias)
        LIMIT 1
    """), {"alias": alias.strip()}).fetchone()
    
    if not result:
        return None
    
    route_id = result[0]
    
    # Get points
    points_result = db.execute(text("""
        SELECT sequence, lat, lng
        FROM highway_route_points
        WHERE route_id = :route_id
        ORDER BY sequence
    """), {"route_id": route_id})
    
    points = [{"sequence": p[0], "lat": float(p[1]), "lng": float(p[2])} 
              for p in points_result]
    
    return {
        "id": route_id,
        "name": result[1],
        "bidirectional": result[2],
        "direction": result[3],
        "limited_access": result[4],
        "miles_decrease_toward": result[5],
        "mm_point_index": result[6],
        "mm_value": float(result[7]) if result[7] else None,
        "points": points,
    }


def calculate_route_distances(points: List[dict]) -> List[float]:
    """
    Calculate cumulative distance along route from first point.
    Returns list of distances in miles, same length as points.
    """
    if not points:
        return []
    
    distances = [0.0]  # First point is 0 miles
    
    for i in range(1, len(points)):
        prev = points[i - 1]
        curr = points[i]
        segment_dist = haversine_miles(prev["lat"], prev["lng"], curr["lat"], curr["lng"])
        distances.append(distances[-1] + segment_dist)
    
    return distances


def interpolate_position(
    points: List[dict],
    distances: List[float],
    target_distance: float,
) -> Optional[Tuple[float, float]]:
    """
    Find lat/lng at a given distance along the route.
    Uses linear interpolation within segments.
    
    Returns (lat, lng) tuple or None if distance is out of range.
    """
    if not points or not distances:
        return None
    
    total_length = distances[-1]
    
    # Clamp to route bounds
    if target_distance < 0:
        return (points[0]["lat"], points[0]["lng"])
    if target_distance >= total_length:
        return (points[-1]["lat"], points[-1]["lng"])
    
    # Find the segment containing target_distance
    for i in range(1, len(distances)):
        if distances[i] >= target_distance:
            # Interpolate within this segment
            prev_dist = distances[i - 1]
            segment_length = distances[i] - prev_dist
            
            if segment_length == 0:
                return (points[i]["lat"], points[i]["lng"])
            
            t = (target_distance - prev_dist) / segment_length
            
            lat = points[i - 1]["lat"] + t * (points[i]["lat"] - points[i - 1]["lat"])
            lng = points[i - 1]["lng"] + t * (points[i]["lng"] - points[i - 1]["lng"])
            
            return (lat, lng)
    
    return (points[-1]["lat"], points[-1]["lng"])


def geocode_mile_marker(
    db: Session,
    address: str,
) -> Optional[dict]:
    """
    Geocode a mile marker address.
    
    Returns dict with:
        latitude, longitude, matched_address, provider='mile_marker',
        route_name, mile_marker, direction, limited_access
    
    Or None if:
        - Address doesn't match MM pattern
        - No route found for the road alias
        - Interpolation fails
    """
    # Parse the address
    parsed = parse_mile_marker_address(address)
    if not parsed:
        return None
    
    mile = parsed["mile"]
    direction = parsed["direction"]
    road = parsed["road"]
    
    logger.info(f"Mile marker parse: mile={mile}, direction={direction}, road='{road}'")
    
    # Find route by alias
    route = find_route_by_alias(db, road)
    if not route:
        logger.info(f"No highway route found for alias '{road}'")
        return None
    
    points = route["points"]
    if len(points) < 2:
        logger.warning(f"Route '{route['name']}' has insufficient points")
        return None
    
    # Calculate distances along route
    distances = calculate_route_distances(points)
    
    # Determine which direction miles increase/decrease
    mm_anchor_index = route["mm_point_index"]
    mm_anchor_value = route["mm_value"]
    miles_decrease_toward = route["miles_decrease_toward"]
    
    if mm_anchor_index is None or mm_anchor_value is None:
        logger.warning(f"Route '{route['name']}' has no MM anchor defined")
        return None
    
    # Calculate distance from anchor to target mile marker
    mile_diff = mile - mm_anchor_value
    
    # Determine direction along route:
    # If miles_decrease_toward is "WB" and we're going WB, miles decrease
    # So if mile_diff < 0 (target mile is less than anchor), we go toward WB
    #
    # The route points are ordered in the direction they were drawn.
    # We need to figure out which way along the points corresponds to
    # increasing vs decreasing mile markers.
    #
    # miles_decrease_toward tells us which compass direction has decreasing miles.
    # If mm_anchor is at index 5, and we traced WB to EB:
    #   - Points 0-4 are toward WB (miles decrease)
    #   - Points 6+ are toward EB (miles increase)
    
    anchor_distance = distances[mm_anchor_index]
    
    # Determine which end of the route corresponds to "miles_decrease_toward"
    # Simple heuristic: check if point 0 is more in that direction than the last point
    first_pt = points[0]
    last_pt = points[-1]
    
    # Determine if lower mile markers are toward the START of the route (index 0)
    # by checking if point 0 is in the "miles_decrease_toward" direction from the last point.
    #
    # For EW routes: WB means west = more negative longitude
    # For NS routes: SB means south = more negative latitude
    #
    # If first point is MORE WEST than last point, and miles decrease toward WB,
    # then lower miles are toward the start.
    if miles_decrease_toward in ("WB", "EB"):
        # East-West route - compare longitudes
        # WB = west = more negative longitude
        first_is_west_of_last = first_pt["lng"] < last_pt["lng"]
        if miles_decrease_toward == "WB":
            decrease_at_start = first_is_west_of_last
        else:  # EB
            decrease_at_start = not first_is_west_of_last
    else:
        # North-South route - compare latitudes
        # SB = south = more negative latitude
        first_is_south_of_last = first_pt["lat"] < last_pt["lat"]
        if miles_decrease_toward == "SB":
            decrease_at_start = first_is_south_of_last
        else:  # NB
            decrease_at_start = not first_is_south_of_last
    
    # If miles decrease toward the start (index 0), then:
    #   - Negative mile_diff (lower mile) = move toward start = subtract from anchor_distance
    #   - Positive mile_diff (higher mile) = move toward end = add to anchor_distance
    # If miles decrease toward the end (last index):
    #   - Negative mile_diff = move toward end = add to anchor_distance
    #   - Positive mile_diff = move toward start = subtract from anchor_distance
    
    if decrease_at_start:
        # Lower miles are toward start (index 0)
        target_distance = anchor_distance + mile_diff
    else:
        # Lower miles are toward end
        target_distance = anchor_distance - mile_diff
    
    logger.info(
        f"MM interpolation: anchor={mm_anchor_value} at dist={anchor_distance:.2f}mi, "
        f"target={mile}, diff={mile_diff:.2f}, decrease_at_start={decrease_at_start}, "
        f"target_dist={target_distance:.2f}mi"
    )
    
    # Check if target is within route bounds (with some tolerance)
    tolerance = 0.5  # Allow 0.5 mile extrapolation
    if target_distance < -tolerance or target_distance > distances[-1] + tolerance:
        logger.warning(
            f"Mile marker {mile} is out of route range "
            f"(route covers {distances[-1]:.2f} miles)"
        )
        # Still attempt, will clamp to endpoints
    
    # Interpolate position
    position = interpolate_position(points, distances, target_distance)
    if not position:
        logger.warning(f"Failed to interpolate position for MM {mile}")
        return None
    
    lat, lng = position
    
    # Build matched address string
    dir_str = f" {direction}" if direction else ""
    matched_address = f"MM {mile}{dir_str} {route['name']}"
    
    return {
        "latitude": round(lat, 7),
        "longitude": round(lng, 7),
        "matched_address": matched_address,
        "provider": "mile_marker",
        "confidence": 0.9,  # High confidence for MM interpolation
        "route_name": route["name"],
        "route_id": route["id"],
        "mile_marker": mile,
        "direction": direction,
        "limited_access": route.get("limited_access", False),
        "original_address": address,
    }


def geocode_with_mile_marker_fallback(
    db: Session,
    address: str,
    station_lat: float,
    station_lng: float,
    state: str = "PA",
    google_api_key: Optional[str] = None,
    geocodio_api_key: Optional[str] = None,
) -> Optional[dict]:
    """
    Wrapper that tries mile marker geocoding first, then falls back to standard geocoding.
    
    Use this as the primary geocoding entry point for incidents.
    """
    # Try mile marker first
    if is_mile_marker_address(address):
        result = geocode_mile_marker(db, address)
        if result:
            logger.info(f"Mile marker geocode success: {address} -> {result['latitude']}, {result['longitude']}")
            return result
        else:
            logger.info(f"Mile marker parse succeeded but geocode failed for: {address}")
    
    # Fall back to standard geocoding
    from .geocoding import geocode_address
    return geocode_address(
        address=address,
        station_lat=station_lat,
        station_lng=station_lng,
        state=state,
        google_api_key=google_api_key,
        geocodio_api_key=geocodio_api_key,
    )
