"""
Location Background Task — Geocode → Route → Proximity at CAD Ingest

Fires as a FastAPI BackgroundTask when:
    1. New incident created (POST /api/incidents)
    2. Address changes on update (PUT /api/incidents/{id})
    3. Backfill endpoint (POST /api/location/backfill)

Logic:
    1. Read incident address, lat, lng, route_polyline, map_snapshot
    2. If no coords → geocode (Google → Census → Geocodio)
    3. If coords exist but no route → fetch route
    4. If coords exist but no proximity → build proximity snapshot
    5. If everything exists → do nothing

All failures are non-fatal. Geocode failure sets geocode_needs_review = true.
Route/proximity failures log warnings but don't block each other.

Database: Creates its own session via get_db_for_tenant() since background
tasks run outside the request lifecycle.
"""

import json
import logging
from typing import Optional

from sqlalchemy import text

logger = logging.getLogger(__name__)


def process_incident_location(incident_id: int, tenant_slug: str):
    """
    Background task: ensure incident has full location data.

    Args:
        incident_id: The incident to process
        tenant_slug: Tenant slug for database routing
    """
    from database import get_db_for_tenant

    db = next(get_db_for_tenant(tenant_slug))
    try:
        _process(db, incident_id)
    except Exception as e:
        logger.error(f"Location background task failed for incident {incident_id}: {e}", exc_info=True)
    finally:
        db.close()


def _process(db, incident_id: int):
    """Core processing logic with its own DB session."""

    from routers.settings import (
        is_location_enabled, get_station_coords,
        get_google_api_key, get_geocodio_api_key, get_default_state,
    )

    # ── Feature flag check ──────────────────────────────────────────────
    if not is_location_enabled(db):
        logger.debug(f"Location services disabled — skipping incident {incident_id}")
        return

    # ── Read current incident state ─────────────────────────────────────
    row = db.execute(text("""
        SELECT address, latitude, longitude, route_polyline, map_snapshot,
               geocode_data, geocode_needs_review
        FROM incidents
        WHERE id = :id AND deleted_at IS NULL
    """), {"id": incident_id}).fetchone()

    if not row:
        logger.warning(f"Incident {incident_id} not found — skipping")
        return

    address = row[0]
    latitude = row[1]
    longitude = row[2]
    has_route = row[3] is not None
    has_snapshot = row[4] is not None
    has_geocode_data = row[5] is not None
    needs_review = row[6]

    # Nothing to do without an address
    if not address or not address.strip():
        logger.debug(f"Incident {incident_id} has no address — skipping")
        return

    # If already flagged as needs review and nothing changed, don't retry
    # (backfill with force=true clears this flag before queueing)
    if needs_review and not latitude and not longitude:
        logger.debug(f"Incident {incident_id} already flagged needs_review — skipping")
        return

    # ── Load settings ───────────────────────────────────────────────────
    station_lat, station_lng = get_station_coords(db)
    google_key = get_google_api_key(db)
    geocodio_key = get_geocodio_api_key(db)
    default_state = get_default_state(db)

    has_coords = (
        latitude is not None and longitude is not None
        and str(latitude).strip() != '' and str(longitude).strip() != ''
    )

    # ── Step 1: Geocode if needed ───────────────────────────────────────
    if not has_coords:
        if station_lat is None or station_lng is None:
            logger.warning(f"Station coords not configured — cannot geocode incident {incident_id}")
            return

        from services.location.mile_marker import geocode_with_mile_marker_fallback

        result = geocode_with_mile_marker_fallback(
            db=db,
            address=address,
            station_lat=station_lat,
            station_lng=station_lng,
            state=default_state or "PA",
            google_api_key=google_key,
            geocodio_api_key=geocodio_key,
        )

        if result:
            latitude = str(result["latitude"])
            longitude = str(result["longitude"])
            db.execute(text("""
                UPDATE incidents
                SET latitude = :lat,
                    longitude = :lng,
                    geocode_data = :data,
                    geocode_needs_review = false,
                    updated_at = NOW()
                WHERE id = :id
            """), {
                "lat": latitude,
                "lng": longitude,
                "data": json.dumps(result),
                "id": incident_id,
            })
            db.commit()
            has_coords = True
            logger.info(
                f"Geocoded incident {incident_id}: "
                f"{result.get('matched_address')} ({result.get('provider')}, "
                f"{result.get('distance_km')}km)"
            )
        else:
            # Geocode failed — flag for review, stop processing
            db.execute(text("""
                UPDATE incidents
                SET geocode_needs_review = true, updated_at = NOW()
                WHERE id = :id
            """), {"id": incident_id})
            db.commit()
            logger.warning(f"Geocode failed for incident {incident_id} ({address}) — flagged for review")
            return

    # From here we have coords — convert to float for service calls
    lat_f = float(latitude)
    lng_f = float(longitude)

    # ── Step 2: Route if needed ─────────────────────────────────────────
    if not has_route and google_key and station_lat is not None:
        try:
            from services.location.route import fetch_route

            route_data = fetch_route(
                origin_lat=station_lat,
                origin_lng=station_lng,
                dest_lat=lat_f,
                dest_lng=lng_f,
                google_api_key=google_key,
            )
            if route_data:
                db.execute(text("""
                    UPDATE incidents
                    SET route_polyline = :polyline,
                        route_geometry = ST_LineFromEncodedPolyline(:polyline),
                        updated_at = NOW()
                    WHERE id = :id
                """), {"polyline": route_data["polyline"], "id": incident_id})
                db.commit()
                logger.info(
                    f"Route cached for incident {incident_id}: "
                    f"{route_data['distance_meters']}m, {route_data['duration_seconds']}s"
                )
        except Exception as e:
            logger.warning(f"Route fetch failed for incident {incident_id}: {e}")
            # Continue to proximity — map works without route

    # ── Step 3: Proximity snapshot if needed ─────────────────────────────
    if not has_snapshot:
        try:
            from services.location.proximity import build_proximity_snapshot

            # Try to get weather data from incident (may have been auto-fetched)
            weather_row = db.execute(text(
                "SELECT weather_api_data FROM incidents WHERE id = :id"
            ), {"id": incident_id}).fetchone()
            weather_data = weather_row[0] if weather_row and weather_row[0] else None

            # If no weather yet, try fetching
            if not weather_data:
                try:
                    from weather_service import get_weather_for_incident
                    from datetime import datetime, timezone as tz
                    weather_data = get_weather_for_incident(
                        timestamp=datetime.now(tz.utc),
                        latitude=lat_f,
                        longitude=lng_f,
                    )
                except Exception:
                    pass  # Weather is optional

            snapshot = build_proximity_snapshot(
                db=db,
                lat=lat_f,
                lng=lng_f,
                address=address,
                weather_data=weather_data,
            )

            db.execute(text(
                "UPDATE incidents SET map_snapshot = :snapshot, updated_at = NOW() WHERE id = :id"
            ), {"snapshot": json.dumps(snapshot), "id": incident_id})
            db.commit()
            logger.info(f"Proximity snapshot stored for incident {incident_id}")
        except Exception as e:
            logger.warning(f"Proximity snapshot failed for incident {incident_id}: {e}")

    logger.info(f"Location processing complete for incident {incident_id}")
