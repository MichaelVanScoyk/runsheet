"""
Route Service — Google Directions API

Fetches driving route from station to incident.
Returns encoded polyline for frontend rendering.
Called once at geocode time, result cached on incident.

Dependencies:
    - httpx (already used in geocoding.py)
    - Google Maps API key with Directions API enabled
"""

import logging
from typing import Optional, Dict

import httpx

logger = logging.getLogger(__name__)

DIRECTIONS_BASE = "https://maps.googleapis.com/maps/api/directions/json"
DIRECTIONS_TIMEOUT = 10


def fetch_route(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    google_api_key: str,
) -> Optional[Dict]:
    """
    Fetch driving route from origin (station) to destination (incident).

    Returns:
        {
            "polyline": "encoded_polyline_string",
            "distance_meters": 12345,
            "duration_seconds": 600,
            "summary": "US-30 W",
        }
        or None on failure.
    """
    if not google_api_key:
        logger.warning("No Google API key — skipping route fetch")
        return None

    params = {
        "origin": f"{origin_lat},{origin_lng}",
        "destination": f"{dest_lat},{dest_lng}",
        "mode": "driving",
        "key": google_api_key,
    }

    try:
        resp = httpx.get(DIRECTIONS_BASE, params=params, timeout=DIRECTIONS_TIMEOUT)
        data = resp.json()

        if data.get("status") != "OK" or not data.get("routes"):
            logger.warning(f"Directions API returned status={data.get('status')}")
            return None

        route = data["routes"][0]
        leg = route["legs"][0]

        return {
            "polyline": route["overview_polyline"]["points"],
            "distance_meters": leg["distance"]["value"],
            "duration_seconds": leg["duration"]["value"],
            "summary": route.get("summary", ""),
        }

    except httpx.TimeoutException:
        logger.warning("Directions API timed out")
        return None
    except Exception as e:
        logger.error(f"Directions API error: {e}")
        return None
