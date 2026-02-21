"""
Location Services Router

Endpoints for geocoding addresses and managing incident coordinates.
Feature-flagged via 'enable_location_services' in settings.

Endpoints:
    POST /api/location/geocode          - Geocode a raw address string
    POST /api/location/geocode/{id}     - Geocode an incident by ID (updates DB)
    GET  /api/location/config           - Get location service config (for frontend)
"""

import json
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional

from database import get_db, _extract_slug
from routers.settings import (
    get_station_coords, get_google_api_key, get_geocodio_api_key,
    get_default_state, is_location_enabled,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# SCHEMAS
# =============================================================================

class GeocodeRequest(BaseModel):
    address: str
    state: Optional[str] = None


class GeocodeResponse(BaseModel):
    success: bool
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    matched_address: Optional[str] = None
    provider: Optional[str] = None
    distance_km: Optional[float] = None
    all_matches: Optional[int] = None
    needs_review: bool = False
    geocode_data: Optional[dict] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/geocode", response_model=GeocodeResponse)
async def geocode_address_endpoint(
    request: GeocodeRequest,
    db: Session = Depends(get_db),
):
    """
    Geocode a raw address string.
    Returns the best match closest to the station.
    Does not save to database - use geocode/{incident_id} for that.
    """
    if not is_location_enabled(db):
        raise HTTPException(status_code=403, detail="Location services not enabled")
    
    from services.location.geocoding import geocode_address
    
    station_lat, station_lng = get_station_coords(db)
    google_key = get_google_api_key(db)
    geocodio_key = get_geocodio_api_key(db)
    state = request.state or get_default_state(db)
    
    result = geocode_address(
        address=request.address,
        station_lat=station_lat,
        station_lng=station_lng,
        state=state,
        google_api_key=google_key,
        geocodio_api_key=geocodio_key,
    )
    
    if result:
        return GeocodeResponse(
            success=True,
            latitude=result.get("latitude"),
            longitude=result.get("longitude"),
            matched_address=result.get("matched_address"),
            provider=result.get("provider"),
            distance_km=result.get("distance_km"),
            all_matches=result.get("all_matches"),
            needs_review=False,
            geocode_data=result,
        )
    
    return GeocodeResponse(success=False, needs_review=True)


@router.post("/geocode/{incident_id}", response_model=GeocodeResponse)
async def geocode_incident_endpoint(
    incident_id: int,
    db: Session = Depends(get_db),
):
    """
    Geocode an incident by ID. Reads the address from the incident,
    geocodes it, and updates the incident with lat/lng + geocode data.
    """
    if not is_location_enabled(db):
        raise HTTPException(status_code=403, detail="Location services not enabled")
    
    # Get the incident
    incident = db.execute(
        text("SELECT id, address, latitude, longitude FROM incidents WHERE id = :id"),
        {"id": incident_id}
    ).fetchone()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    address = incident[1]
    if not address:
        raise HTTPException(status_code=400, detail="Incident has no address")
    
    from services.location.geocoding import geocode_address
    
    station_lat, station_lng = get_station_coords(db)
    google_key = get_google_api_key(db)
    geocodio_key = get_geocodio_api_key(db)
    state = get_default_state(db)
    
    result = geocode_address(
        address=address,
        station_lat=station_lat,
        station_lng=station_lng,
        state=state,
        google_api_key=google_key,
        geocodio_api_key=geocodio_key,
    )
    
    if result:
        # Update incident with geocode results
        db.execute(
            text("""
                UPDATE incidents 
                SET latitude = :lat,
                    longitude = :lng,
                    geocode_data = :data,
                    geocode_needs_review = false,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {
                "lat": str(result["latitude"]),
                "lng": str(result["longitude"]),
                "data": json.dumps(result),
                "id": incident_id,
            }
        )
        db.commit()
        
        logger.info(f"Geocoded incident {incident_id}: {result.get('matched_address')} ({result.get('provider')})")
        
        # =================================================================
        # DRIVING ROUTE — Station → Incident
        # Cached as encoded polyline (frontend) + PostGIS geometry (spatial queries)
        # =================================================================
        try:
            from services.location.route import fetch_route
            
            if google_key:
                route_data = fetch_route(
                    origin_lat=station_lat,
                    origin_lng=station_lng,
                    dest_lat=result["latitude"],
                    dest_lng=result["longitude"],
                    google_api_key=google_key,
                )
                if route_data:
                    db.execute(
                        text("""
                            UPDATE incidents
                            SET route_polyline = :polyline,
                                route_geometry = ST_LineFromEncodedPolyline(:polyline)
                            WHERE id = :id
                        """),
                        {"polyline": route_data["polyline"], "id": incident_id},
                    )
                    db.commit()
                    logger.info(
                        f"Route cached for incident {incident_id}: "
                        f"{route_data['distance_meters']}m, {route_data['duration_seconds']}s"
                    )
        except Exception as e:
            logger.warning(f"Route caching failed for incident {incident_id}: {e}")
        
        # =================================================================
        # PROXIMITY SNAPSHOT — Phase 2 Map Platform
        # After geocoding succeeds, run proximity queries and store snapshot.
        # Reuses incident weather data for flood/wildfire conditional alerts.
        # =================================================================
        try:
            from services.location.proximity import build_proximity_snapshot
            
            # Get incident's weather data (already fetched by incident update flow)
            weather_row = db.execute(
                text("SELECT weather_api_data FROM incidents WHERE id = :id"),
                {"id": incident_id}
            ).fetchone()
            weather_data = weather_row[0] if weather_row and weather_row[0] else None
            
            # If no weather stored yet, fetch it now
            if not weather_data:
                try:
                    from weather_service import get_weather_for_incident
                    from datetime import datetime, timezone
                    weather_data = get_weather_for_incident(
                        timestamp=datetime.now(timezone.utc),
                        latitude=result["latitude"],
                        longitude=result["longitude"],
                    )
                except Exception:
                    pass  # Weather is optional for proximity
            
            snapshot = build_proximity_snapshot(
                db=db,
                lat=result["latitude"],
                lng=result["longitude"],
                address=address,
                weather_data=weather_data,
            )
            
            db.execute(
                text("UPDATE incidents SET map_snapshot = :snapshot, updated_at = NOW() WHERE id = :id"),
                {"snapshot": json.dumps(snapshot), "id": incident_id}
            )
            db.commit()
            logger.info(f"Proximity snapshot stored for incident {incident_id}")
        except Exception as e:
            logger.warning(f"Proximity snapshot failed for incident {incident_id}: {e}")
            # Don't fail the geocode response if proximity fails
        
        return GeocodeResponse(
            success=True,
            latitude=result.get("latitude"),
            longitude=result.get("longitude"),
            matched_address=result.get("matched_address"),
            provider=result.get("provider"),
            distance_km=result.get("distance_km"),
            all_matches=result.get("all_matches"),
            needs_review=False,
            geocode_data=result,
        )
    
    # Mark as needs review
    db.execute(
        text("UPDATE incidents SET geocode_needs_review = true, updated_at = NOW() WHERE id = :id"),
        {"id": incident_id}
    )
    db.commit()
    
    return GeocodeResponse(success=False, needs_review=True)


@router.get("/config")
async def get_location_config(db: Session = Depends(get_db)):
    """
    Get location services configuration for the frontend.
    Returns whether the feature is enabled and basic config.
    """
    enabled = is_location_enabled(db)
    station_lat, station_lng = get_station_coords(db)
    google_key = get_google_api_key(db)
    has_geocodio = bool(get_geocodio_api_key(db))
    
    return {
        "enabled": enabled,
        "station_latitude": station_lat,
        "station_longitude": station_lng,
        "google_api_key": google_key if enabled else None,
        "has_google": bool(google_key),
        "has_geocodio": has_geocodio,
        "default_state": get_default_state(db),
    }


@router.post("/backfill")
async def backfill_location_data(
    request: Request,
    background_tasks: BackgroundTasks,
    year: Optional[int] = Query(None, description="Process all incidents from this year"),
    incident_id: Optional[int] = Query(None, description="Process a single incident"),
    force: bool = Query(False, description="Clear existing location data first"),
    db: Session = Depends(get_db),
):
    """
    Queue background location processing for incidents.

    Use cases:
        - Enable location services for the first time → backfill all
        - Switch geocoding providers → force=true for a year
        - Import new hydrant GIS layer → re-run proximity
        - Change station coordinates → force=true to regenerate routes
    """
    if not is_location_enabled(db):
        raise HTTPException(status_code=403, detail="Location services not enabled")

    if not year and not incident_id:
        raise HTTPException(status_code=400, detail="Provide year or incident_id")

    from services.location.background_task import process_incident_location

    tenant_slug = _extract_slug(request.headers.get('host', ''))

    # Build query for matching incidents
    if incident_id:
        rows = db.execute(text(
            "SELECT id FROM incidents WHERE id = :id AND deleted_at IS NULL"
        ), {"id": incident_id}).fetchall()
    else:
        rows = db.execute(text(
            "SELECT id FROM incidents WHERE year_prefix = :year AND deleted_at IS NULL ORDER BY id"
        ), {"year": year}).fetchall()

    if not rows:
        return {"queued": 0, "year": year, "incident_id": incident_id}

    # If force, clear existing location data so background task re-processes
    if force:
        ids = [r[0] for r in rows]
        # Use ANY() for array parameter
        db.execute(text("""
            UPDATE incidents SET
                latitude = NULL, longitude = NULL,
                route_polyline = NULL, route_geometry = NULL,
                map_snapshot = NULL, geocode_data = NULL,
                geocode_needs_review = false
            WHERE id = ANY(:ids)
        """), {"ids": ids})
        db.commit()

    # Queue background tasks
    queued = 0
    for r in rows:
        background_tasks.add_task(process_incident_location, r[0], tenant_slug)
        queued += 1

    logger.info(f"Backfill queued {queued} incidents (year={year}, force={force})")

    return {"queued": queued, "year": year, "incident_id": incident_id, "force": force}
