"""
Map Router — Map Platform API

Phase 2 - Proximity:
    GET  /api/map/nearby?lat=X&lng=Y     - Proximity snapshot for coordinates
    GET  /api/map/nearby/{incident_id}   - Proximity snapshot from incident coords
    GET  /api/map/config                 - Frontend initialization config

Phase 3 - Layers & Features (read):
    GET  /api/map/layers                 - List layers with feature counts
    GET  /api/map/layers/{id}/features   - List features in a layer (bbox filter)
    GET  /api/map/layers/{id}/features/geojson - GeoJSON FeatureCollection for map
    GET  /api/map/mutual-aid/stations    - List mutual aid stations

Phase 4 - Feature CRUD & Address Notes:
    POST   /api/map/layers/{id}/features - Create feature
    PUT    /api/map/features/{id}        - Update feature
    DELETE /api/map/features/{id}        - Delete feature
    GET    /api/map/address-notes        - Get notes for address
    POST   /api/map/address-notes        - Create address note
    PUT    /api/map/address-notes/{id}   - Update address note
    DELETE /api/map/address-notes/{id}   - Delete address note

Phase 5a - GIS Import (ArcGIS REST):
    POST /api/map/gis/arcgis/preview     - Preview ArcGIS endpoint metadata
    POST /api/map/gis/arcgis/import      - Import features from ArcGIS
    GET  /api/map/gis/configs            - List saved import configs
    POST /api/map/gis/configs/{id}/refresh - Re-run saved import
    DELETE /api/map/gis/configs/{id}      - Delete saved config

Phase 5b - GIS Import (File Upload):
    POST /api/map/gis/file/upload        - Upload + parse file for preview
    POST /api/map/gis/file/import        - Import parsed file into layer

Phase A - Viewport Optimization:
    POST /api/map/layers/batch/clustered  - Batch viewport query (multiple layers, single request)
"""

import json
import logging
import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional

from database import get_db
from routers.settings import (
    get_setting_value, get_station_coords, get_google_api_key,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# HELPERS
# =============================================================================

def _get_feature_flag(db: Session, key: str) -> bool:
    """Check a map feature flag from settings."""
    return bool(get_setting_value(db, 'features', key, False))


# =============================================================================
# PROXIMITY ENDPOINTS
# =============================================================================

@router.get("/nearby")
async def get_nearby(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    address: Optional[str] = Query(None, description="Address for notes/preplan lookup"),
    water_radius: int = Query(2000, description="Water source search radius in meters"),
    db: Session = Depends(get_db),
):
    """
    Get proximity snapshot for arbitrary coordinates.
    Used by RunSheet, incident creation, and manual queries.
    
    Returns the same structure as incidents.map_snapshot JSONB.
    """
    if not _get_feature_flag(db, 'enable_proximity_alerts'):
        return {"error": "Proximity alerts not enabled", "enabled": False}
    
    from services.location.proximity import build_proximity_snapshot
    
    # Optionally fetch weather for conditional alerts
    weather_data = None
    try:
        from weather_service import get_weather_for_incident
        from datetime import datetime, timezone
        weather_data = get_weather_for_incident(
            timestamp=datetime.now(timezone.utc),
            latitude=lat,
            longitude=lng,
        )
    except Exception as e:
        logger.warning(f"Weather fetch failed for proximity query: {e}")
    
    snapshot = build_proximity_snapshot(
        db=db,
        lat=lat,
        lng=lng,
        address=address,
        weather_data=weather_data,
    )
    
    return snapshot


@router.get("/nearby/{incident_id}")
async def get_nearby_for_incident(
    incident_id: int,
    db: Session = Depends(get_db),
):
    """
    Get proximity snapshot using an incident's stored coordinates.
    If the incident already has a map_snapshot, returns it directly.
    Otherwise builds one on the fly (and stores it).
    """
    if not _get_feature_flag(db, 'enable_proximity_alerts'):
        return {"error": "Proximity alerts not enabled", "enabled": False}
    
    # Get incident
    result = db.execute(
        text("SELECT id, latitude, longitude, address, map_snapshot, weather_api_data FROM incidents WHERE id = :id"),
        {"id": incident_id}
    ).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    inc_id, lat_str, lng_str, address, existing_snapshot, weather_api_data = result
    
    # If snapshot already exists, return it
    if existing_snapshot:
        return existing_snapshot
    
    # Need coordinates to build snapshot
    if not lat_str or not lng_str:
        return {"error": "Incident has no coordinates", "latitude": None, "longitude": None}
    
    lat = float(lat_str)
    lng = float(lng_str)
    
    from services.location.proximity import build_proximity_snapshot
    
    # Use incident's stored weather data if available
    weather_data = weather_api_data
    if not weather_data:
        try:
            from weather_service import get_weather_for_incident
            from datetime import datetime, timezone
            weather_data = get_weather_for_incident(
                timestamp=datetime.now(timezone.utc),
                latitude=lat,
                longitude=lng,
            )
        except Exception as e:
            logger.warning(f"Weather fetch failed for incident {incident_id}: {e}")
    
    snapshot = build_proximity_snapshot(
        db=db,
        lat=lat,
        lng=lng,
        address=address,
        weather_data=weather_data,
    )
    
    # Store snapshot on incident
    try:
        db.execute(
            text("UPDATE incidents SET map_snapshot = :snapshot, updated_at = NOW() WHERE id = :id"),
            {"snapshot": json.dumps(snapshot), "id": incident_id}
        )
        db.commit()
        logger.info(f"Stored proximity snapshot on incident {incident_id}")
    except Exception as e:
        logger.error(f"Failed to store snapshot on incident {incident_id}: {e}")
    
    return snapshot


# =============================================================================
# MAP CONFIG
# =============================================================================

@router.get("/config")
async def get_map_config(db: Session = Depends(get_db)):
    """
    Get map configuration for frontend initialization.
    Returns API key status, feature flags, station coords, and layer list.
    """
    station_lat, station_lng = get_station_coords(db)
    
    # Feature flags
    enabled_features = {
        "enable_map_layers": _get_feature_flag(db, 'enable_map_layers'),
        "enable_gis_import": _get_feature_flag(db, 'enable_gis_import'),
        "enable_address_notes": _get_feature_flag(db, 'enable_address_notes'),
        "enable_proximity_alerts": _get_feature_flag(db, 'enable_proximity_alerts'),
        "enable_mutual_aid_planner": _get_feature_flag(db, 'enable_mutual_aid_planner'),
    }
    
    # Active layers with feature counts
    layers = []
    try:
        result = db.execute(text("""
            SELECT ml.id, ml.layer_type, ml.name, ml.description, ml.icon, ml.color,
                   ml.opacity, ml.geometry_type, ml.property_schema, ml.is_system,
                   ml.route_check, ml.sort_order, ml.is_active,
                   COALESCE(fc.cnt, 0) as feature_count,
                   ml.stroke_color, ml.stroke_opacity, ml.stroke_weight
            FROM map_layers ml
            LEFT JOIN (
                SELECT layer_id, COUNT(*) as cnt
                FROM map_features
                GROUP BY layer_id
            ) fc ON fc.layer_id = ml.id
            WHERE ml.is_active = true
            ORDER BY ml.sort_order, ml.name
        """))
        
        for row in result:
            layers.append({
                "id": row[0],
                "layer_type": row[1],
                "name": row[2],
                "description": row[3],
                "icon": row[4],
                "color": row[5],
                "opacity": float(row[6]) if row[6] else 0.3,
                "geometry_type": row[7],
                "property_schema": row[8] or {},
                "is_system": row[9],
                "route_check": row[10],
                "sort_order": row[11],
                "is_active": row[12],
                "feature_count": row[13],
                "stroke_color": row[14] or '#333333',
                "stroke_opacity": float(row[15]) if row[15] is not None else 0.8,
                "stroke_weight": row[16] or 2,
            })
    except Exception as e:
        logger.error(f"Failed to load map layers: {e}")
    
    return {
        "google_api_key_configured": bool(get_google_api_key(db)),
        "enabled_features": enabled_features,
        "station_lat": station_lat,
        "station_lng": station_lng,
        "layers": layers,
    }


# =============================================================================
# LAYER ENDPOINTS (Phase 3)
# =============================================================================

@router.get("/layers")
async def list_layers(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    """
    List all layers with feature counts.
    By default only active layers. Admin can include inactive.
    """
    active_filter = "" if include_inactive else "WHERE ml.is_active = true"

    try:
        result = db.execute(text(f"""
            SELECT ml.id, ml.layer_type, ml.name, ml.description, ml.icon, ml.color,
                   ml.opacity, ml.geometry_type, ml.property_schema, ml.is_system,
                   ml.route_check, ml.sort_order, ml.is_active,
                   ml.created_at, ml.updated_at,
                   COALESCE(fc.cnt, 0) as feature_count,
                   ml.stroke_color, ml.stroke_opacity, ml.stroke_weight
            FROM map_layers ml
            LEFT JOIN (
                SELECT layer_id, COUNT(*) as cnt
                FROM map_features
                GROUP BY layer_id
            ) fc ON fc.layer_id = ml.id
            {active_filter}
            ORDER BY ml.sort_order, ml.name
        """))

        layers = []
        for row in result:
            layers.append({
                "id": row[0],
                "layer_type": row[1],
                "name": row[2],
                "description": row[3],
                "icon": row[4],
                "color": row[5],
                "opacity": float(row[6]) if row[6] else 0.3,
                "geometry_type": row[7],
                "property_schema": row[8] or {},
                "is_system": row[9],
                "route_check": row[10],
                "sort_order": row[11],
                "is_active": row[12],
                "created_at": row[13].isoformat() if row[13] else None,
                "updated_at": row[14].isoformat() if row[14] else None,
                "feature_count": row[15],
                "stroke_color": row[16] or '#333333',
                "stroke_opacity": float(row[17]) if row[17] is not None else 0.8,
                "stroke_weight": row[18] or 2,
            })

        # Append virtual incident layers with feature counts
        for key, vl in INCIDENT_VIRTUAL_LAYERS.items():
            try:
                from datetime import datetime as _dt, date as _date
                _now = _dt.now()
                _date_start = _date(_now.year, 1, 1)
                count = db.execute(text("""
                    SELECT COUNT(*) FROM incidents
                    WHERE call_category = :cat
                      AND deleted_at IS NULL
                      AND latitude IS NOT NULL AND longitude IS NOT NULL
                      AND latitude != '' AND longitude != ''
                      AND incident_date >= :ds
                """), {"cat": vl["call_category"], "ds": _date_start}).scalar() or 0
            except Exception:
                count = 0
            layer_copy = {k: v for k, v in vl.items() if k not in ("call_category",)}
            layer_copy["feature_count"] = count
            layers.append(layer_copy)

        return {"layers": layers}
    except Exception as e:
        logger.error(f"Failed to list layers: {e}")
        raise HTTPException(status_code=500, detail="Failed to load layers")


# =============================================================================
# LAYER STYLE UPDATE
# =============================================================================

class LayerStyleUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None          # fill color
    opacity: Optional[float] = None      # fill opacity
    stroke_color: Optional[str] = None
    stroke_opacity: Optional[float] = None
    stroke_weight: Optional[int] = None


@router.put("/layers/{layer_id}/style")
async def update_layer_style(
    layer_id: int,
    style: LayerStyleUpdate,
    db: Session = Depends(get_db),
):
    """
    Update a layer's rendering style (fill color/opacity, stroke color/opacity/weight).
    Admin only — frontend enforces role check.
    """
    existing = db.execute(
        text("SELECT id FROM map_layers WHERE id = :id"),
        {"id": layer_id}
    ).fetchone()

    if not existing:
        raise HTTPException(status_code=404, detail="Layer not found")

    set_clauses = ["updated_at = NOW()"]
    params = {"id": layer_id}

    if style.name is not None:
        set_clauses.append("name = :name")
        params["name"] = style.name.strip()
    if style.icon is not None:
        set_clauses.append("icon = :icon")
        params["icon"] = style.icon.strip()
    if style.color is not None:
        set_clauses.append("color = :color")
        params["color"] = style.color
    if style.opacity is not None:
        set_clauses.append("opacity = :opacity")
        params["opacity"] = max(0, min(1, style.opacity))
    if style.stroke_color is not None:
        set_clauses.append("stroke_color = :stroke_color")
        params["stroke_color"] = style.stroke_color
    if style.stroke_opacity is not None:
        set_clauses.append("stroke_opacity = :stroke_opacity")
        params["stroke_opacity"] = max(0, min(1, style.stroke_opacity))
    if style.stroke_weight is not None:
        set_clauses.append("stroke_weight = :stroke_weight")
        params["stroke_weight"] = max(0, min(10, style.stroke_weight))

    try:
        db.execute(
            text(f"UPDATE map_layers SET {', '.join(set_clauses)} WHERE id = :id"),
            params
        )
        db.commit()
        logger.info(f"Updated style for layer {layer_id}")
        return {"updated": True, "layer_id": layer_id}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update layer style {layer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update layer style")


# =============================================================================
# FEATURE ENDPOINTS (Phase 3 — read only, Phase 4 adds write)
# =============================================================================

@router.get("/layers/{layer_id}/features")
async def list_layer_features(
    layer_id: int,
    bbox: Optional[str] = Query(None, description="Bounding box: west,south,east,north"),
    limit: int = Query(500, le=5000),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """
    List features in a layer. Supports bounding box filter for viewport-based loading.
    Returns coordinates extracted from PostGIS geometry.
    """
    # Verify layer exists
    layer = db.execute(
        text("SELECT id, layer_type, name, icon, color, geometry_type FROM map_layers WHERE id = :id"),
        {"id": layer_id}
    ).fetchone()

    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")

    layer_info = {
        "id": layer[0],
        "layer_type": layer[1],
        "name": layer[2],
        "icon": layer[3],
        "color": layer[4],
        "geometry_type": layer[5],
    }

    # Build query with optional bbox filter
    bbox_filter = ""
    params = {"layer_id": layer_id, "limit": limit, "offset": offset}

    if bbox:
        try:
            west, south, east, north = [float(x) for x in bbox.split(",")]
            bbox_filter = """
                AND ST_Intersects(
                    mf.geometry,
                    ST_MakeEnvelope(:west, :south, :east, :north, 4326)
                )
            """
            params.update({"west": west, "south": south, "east": east, "north": north})
        except (ValueError, IndexError):
            pass  # Ignore malformed bbox, return all

    try:
        result = db.execute(text(f"""
            SELECT mf.id, mf.title, mf.description, mf.radius_meters,
                   mf.address, mf.properties, mf.external_id, mf.import_source,
                   mf.imported_at, mf.created_at, mf.updated_at,
                   ST_Y(ST_Centroid(mf.geometry)) as latitude,
                   ST_X(ST_Centroid(mf.geometry)) as longitude,
                   ST_AsGeoJSON(mf.geometry) as geojson
            FROM map_features mf
            WHERE mf.layer_id = :layer_id
            {bbox_filter}
            ORDER BY mf.title
            LIMIT :limit OFFSET :offset
        """), params)

        features = []
        for row in result:
            feature = {
                "id": row[0],
                "layer_id": layer_id,
                "title": row[1],
                "description": row[2],
                "radius_meters": row[3],
                "address": row[4],
                "properties": row[5] or {},
                "external_id": row[6],
                "import_source": row[7],
                "imported_at": row[8].isoformat() if row[8] else None,
                "created_at": row[9].isoformat() if row[9] else None,
                "updated_at": row[10].isoformat() if row[10] else None,
                "latitude": row[11],
                "longitude": row[12],
                "layer_name": layer_info["name"],
                "layer_type": layer_info["layer_type"],
                "layer_icon": layer_info["icon"],
                "layer_color": layer_info["color"],
            }

            # Include GeoJSON for polygon features (for rendering)
            if layer_info["geometry_type"] in ("polygon",) and row[13]:
                try:
                    feature["geometry_geojson"] = json.loads(row[13])
                except (json.JSONDecodeError, TypeError):
                    pass

            features.append(feature)

        # Get total count
        count_result = db.execute(text(f"""
            SELECT COUNT(*) FROM map_features mf
            WHERE mf.layer_id = :layer_id {bbox_filter}
        """), params).scalar()

        return {
            "layer": layer_info,
            "features": features,
            "total": count_result,
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        logger.error(f"Failed to list features for layer {layer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to load features")


@router.get("/layers/{layer_id}/features/geojson")
async def get_layer_features_geojson(
    layer_id: int,
    bbox: Optional[str] = Query(None, description="Bounding box: west,south,east,north"),
    db: Session = Depends(get_db),
):
    """
    Get all features in a layer as GeoJSON FeatureCollection.
    Optimized for Google Maps Data Layer rendering.
    """
    layer = db.execute(
        text("SELECT id, layer_type, name, icon, color FROM map_layers WHERE id = :id AND is_active = true"),
        {"id": layer_id}
    ).fetchone()

    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")

    bbox_filter = ""
    params = {"layer_id": layer_id}

    if bbox:
        try:
            west, south, east, north = [float(x) for x in bbox.split(",")]
            bbox_filter = """
                AND ST_Intersects(
                    mf.geometry,
                    ST_MakeEnvelope(:west, :south, :east, :north, 4326)
                )
            """
            params.update({"west": west, "south": south, "east": east, "north": north})
        except (ValueError, IndexError):
            pass

    try:
        result = db.execute(text(f"""
            SELECT mf.id, mf.title, mf.description, mf.properties,
                   mf.radius_meters, mf.address,
                   ST_AsGeoJSON(mf.geometry) as geojson
            FROM map_features mf
            WHERE mf.layer_id = :layer_id
            {bbox_filter}
        """), params)

        geojson_features = []
        for row in result:
            try:
                geometry = json.loads(row[6])
            except (json.JSONDecodeError, TypeError):
                continue

            properties = row[3] or {}
            properties.update({
                "id": row[0],
                "title": row[1],
                "description": row[2],
                "radius_meters": row[4],
                "address": row[5],
                "layer_icon": layer[3],
                "layer_color": layer[4],
                "layer_type": layer[1],
            })

            geojson_features.append({
                "type": "Feature",
                "geometry": geometry,
                "properties": properties,
            })

        return {
            "type": "FeatureCollection",
            "features": geojson_features,
        }
    except Exception as e:
        logger.error(f"Failed to get GeoJSON for layer {layer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to load GeoJSON")


# =============================================================================
# VIEWPORT CLUSTERED FEATURES (server-side clustering for large datasets)
# =============================================================================

def _query_clustered_layer(
    db: Session,
    layer_id: int,
    west: float, south: float, east: float, north: float,
    zoom: int,
) -> dict:
    """
    Internal helper: query clustered/individual features for a single layer.
    Returns the layer result dict or None if layer not found.
    Used by both the individual GET endpoint and the batch POST endpoint.
    """
    layer = db.execute(
        text("SELECT id, layer_type, name, icon, color, geometry_type, opacity, stroke_color, stroke_opacity, stroke_weight FROM map_layers WHERE id = :id AND is_active = true"),
        {"id": layer_id}
    ).fetchone()

    if not layer:
        return None

    layer_style = {
        "fill_color": layer[4],
        "fill_opacity": float(layer[6]) if layer[6] is not None else 0.3,
        "stroke_color": layer[7] or '#333333',
        "stroke_opacity": float(layer[8]) if layer[8] is not None else 0.8,
        "stroke_weight": layer[9] or 2,
    }

    params = {
        "layer_id": layer_id,
        "west": west, "south": south, "east": east, "north": north,
    }

    is_point_layer = layer[5] in ('point', 'point_radius')
    CLUSTER_THRESHOLD_ZOOM = 16

    if is_point_layer and zoom < CLUSTER_THRESHOLD_ZOOM:
        # --- SERVER-SIDE GRID CLUSTERING ---
        cell_size = 360.0 / (2 ** zoom) / 4
        params["cell_size"] = cell_size

        result = db.execute(text("""
            SELECT
                COUNT(*) as point_count,
                AVG(ST_Y(geometry)) as center_lat,
                AVG(ST_X(geometry)) as center_lng,
                MIN(id) as sample_id,
                MIN(title) as sample_title,
                CASE WHEN COUNT(*) = 1 THEN MIN(description) ELSE NULL END as single_description,
                CASE WHEN COUNT(*) = 1 THEN MIN(properties::text)::jsonb ELSE NULL END as single_properties,
                CASE WHEN COUNT(*) = 1 THEN MIN(address) ELSE NULL END as single_address,
                CASE WHEN COUNT(*) = 1 THEN MIN(radius_meters) ELSE NULL END as single_radius,
                CASE WHEN COUNT(*) = 1 THEN MIN(notes) ELSE NULL END as single_notes
            FROM map_features
            WHERE layer_id = :layer_id
              AND ST_Intersects(
                  geometry,
                  ST_MakeEnvelope(:west, :south, :east, :north, 4326)
              )
            GROUP BY
                FLOOR(ST_X(geometry) / :cell_size),
                FLOOR(ST_Y(geometry) / :cell_size)
            ORDER BY point_count DESC
        """), params)

        items = []
        for row in result:
            count = row[0]
            if count == 1:
                items.append({
                    "type": "feature",
                    "id": row[3],
                    "lat": float(row[1]),
                    "lng": float(row[2]),
                    "title": row[4],
                    "description": row[5],
                    "properties": row[6] or {},
                    "address": row[7],
                    "radius_meters": row[8],
                    "notes": row[9],
                })
            else:
                items.append({
                    "type": "cluster",
                    "count": count,
                    "lat": float(row[1]),
                    "lng": float(row[2]),
                })

        return {
            "layer_id": layer_id,
            "layer_type": layer[1],
            "layer_color": layer[4],
            "layer_icon": layer[3],
            "layer_style": layer_style,
            "zoom": zoom,
            "clustered": True,
            "items": items,
            "total_items": len(items),
        }

    else:
        # --- INDIVIDUAL FEATURES (high zoom or polygon layers) ---
        result = db.execute(text("""
            SELECT mf.id, mf.title, mf.description, mf.properties,
                   mf.radius_meters, mf.address, mf.notes,
                   ST_Y(ST_Centroid(mf.geometry)) as lat,
                   ST_X(ST_Centroid(mf.geometry)) as lng,
                   ST_AsGeoJSON(mf.geometry) as geojson
            FROM map_features mf
            WHERE mf.layer_id = :layer_id
              AND ST_Intersects(
                  mf.geometry,
                  ST_MakeEnvelope(:west, :south, :east, :north, 4326)
              )
            LIMIT 2000
        """), params)

        items = []
        for row in result:
            item = {
                "type": "feature",
                "id": row[0],
                "title": row[1],
                "description": row[2],
                "properties": row[3] or {},
                "radius_meters": row[4],
                "address": row[5],
                "notes": row[6],
                "lat": float(row[7]) if row[7] else None,
                "lng": float(row[8]) if row[8] else None,
                "layer_type": layer[1],
                "layer_icon": layer[3],
                "layer_color": layer[4],
            }
            if layer[5] == 'polygon' and row[9]:
                try:
                    item["geometry"] = json.loads(row[9])
                except (json.JSONDecodeError, TypeError):
                    pass
            items.append(item)

        return {
            "layer_id": layer_id,
            "layer_type": layer[1],
            "layer_color": layer[4],
            "layer_icon": layer[3],
            "layer_style": layer_style,
            "zoom": zoom,
            "clustered": False,
            "items": items,
            "total_items": len(items),
        }


@router.get("/layers/{layer_id}/features/clustered")
async def get_clustered_features(
    layer_id: int,
    bbox: str = Query(..., description="Bounding box: west,south,east,north"),
    zoom: int = Query(14, ge=0, le=22),
    db: Session = Depends(get_db),
):
    """
    Server-side clustered features for a single layer.
    Kept for backward compatibility and single-layer use cases.
    For multi-layer viewport loading, use POST /layers/batch/clustered.
    """
    try:
        west, south, east, north = [float(x) for x in bbox.split(",")]
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid bbox format. Use: west,south,east,north")

    try:
        result = _query_clustered_layer(db, layer_id, west, south, east, north, zoom)
        if result is None:
            raise HTTPException(status_code=404, detail="Layer not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get clustered features for layer {layer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to load clustered features")


# =============================================================================
# BATCH VIEWPORT CLUSTERED FEATURES (Phase A — reduces N requests to 1)
# =============================================================================

class BatchClusteredRequest(BaseModel):
    layer_ids: List  # int for map_layers, str for virtual layers ("incident_fire", "incident_ems")
    bbox: str
    zoom: int = 14


# =============================================================================
# VIRTUAL INCIDENT LAYERS — query incidents table with same clustering pattern
# =============================================================================

# Virtual layer definitions (appended to /api/map/layers response)
INCIDENT_VIRTUAL_LAYERS = {
    "incident_fire": {
        "id": "incident_fire",
        "layer_type": "incident_fire",
        "name": "Fire Incidents",
        "description": "Fire incidents (YTD)",
        "icon": "🔥",
        "color": "#DC2626",
        "opacity": 0.9,
        "geometry_type": "point",
        "property_schema": {},
        "is_system": True,
        "route_check": False,
        "sort_order": 900,
        "is_active": True,
        "stroke_color": "#DC2626",
        "stroke_opacity": 0.8,
        "stroke_weight": 2,
        "is_virtual": True,
        "call_category": "FIRE",
    },
    "incident_ems": {
        "id": "incident_ems",
        "layer_type": "incident_ems",
        "name": "EMS Incidents",
        "description": "EMS incidents (YTD)",
        "icon": "🚑",
        "color": "#2563EB",
        "opacity": 0.9,
        "geometry_type": "point",
        "property_schema": {},
        "is_system": True,
        "route_check": False,
        "sort_order": 901,
        "is_active": True,
        "stroke_color": "#2563EB",
        "stroke_opacity": 0.8,
        "stroke_weight": 2,
        "is_virtual": True,
        "call_category": "EMS",
    },
}


def _query_incident_layer(
    db: Session,
    layer_key: str,
    west: float, south: float, east: float, north: float,
    zoom: int,
    date_range: str = "ytd",
) -> Optional[dict]:
    """
    Query incidents as a virtual map layer with server-side clustering.
    Same pattern as _query_clustered_layer but sources from incidents table.
    """
    from datetime import datetime, date as date_type

    layer_def = INCIDENT_VIRTUAL_LAYERS.get(layer_key)
    if not layer_def:
        return None

    category = layer_def["call_category"]
    color = layer_def["color"]

    # Date filter
    now = datetime.now()
    if date_range == "90days":
        from datetime import timedelta
        date_start = (now - timedelta(days=90)).date()
    else:
        # YTD
        date_start = date_type(now.year, 1, 1)

    params = {
        "category": category,
        "date_start": date_start,
        "west": west, "south": south, "east": east, "north": north,
    }

    CLUSTER_THRESHOLD_ZOOM = 16

    if zoom < CLUSTER_THRESHOLD_ZOOM:
        # --- SERVER-SIDE GRID CLUSTERING ---
        cell_size = 360.0 / (2 ** zoom) / 4
        params["cell_size"] = cell_size

        result = db.execute(text("""
            SELECT
                COUNT(*) as point_count,
                AVG(CAST(latitude AS DOUBLE PRECISION)) as center_lat,
                AVG(CAST(longitude AS DOUBLE PRECISION)) as center_lng,
                MIN(id) as sample_id,
                MIN(internal_incident_number) as sample_title,
                CASE WHEN COUNT(*) = 1 THEN MIN(address) ELSE NULL END as single_address,
                CASE WHEN COUNT(*) = 1 THEN MIN(cad_event_type) ELSE NULL END as single_type,
                CASE WHEN COUNT(*) = 1 THEN MIN(cad_event_subtype) ELSE NULL END as single_subtype,
                CASE WHEN COUNT(*) = 1 THEN MIN(incident_date::text) ELSE NULL END as single_date,
                CASE WHEN COUNT(*) = 1 THEN MIN(internal_incident_number) ELSE NULL END as single_number
            FROM incidents
            WHERE call_category = :category
              AND deleted_at IS NULL
              AND latitude IS NOT NULL AND longitude IS NOT NULL
              AND latitude != '' AND longitude != ''
              AND incident_date >= :date_start
              AND CAST(longitude AS DOUBLE PRECISION) BETWEEN :west AND :east
              AND CAST(latitude AS DOUBLE PRECISION) BETWEEN :south AND :north
            GROUP BY
                FLOOR(CAST(longitude AS DOUBLE PRECISION) / :cell_size),
                FLOOR(CAST(latitude AS DOUBLE PRECISION) / :cell_size)
            ORDER BY point_count DESC
        """), params)

        items = []
        for row in result:
            count = row[0]
            if count == 1:
                items.append({
                    "type": "feature",
                    "id": row[3],
                    "lat": float(row[1]),
                    "lng": float(row[2]),
                    "title": row[9],
                    "properties": {
                        "incident_number": row[9],
                        "address": row[5],
                        "cad_event_type": row[6],
                        "cad_event_subtype": row[7],
                        "incident_date": row[8],
                        "call_category": category,
                    },
                })
            else:
                items.append({
                    "type": "cluster",
                    "count": count,
                    "lat": float(row[1]),
                    "lng": float(row[2]),
                })

        return {
            "layer_id": layer_key,
            "layer_type": layer_def["layer_type"],
            "layer_color": color,
            "layer_icon": layer_def["icon"],
            "layer_style": {
                "fill_color": color,
                "fill_opacity": 0.9,
                "stroke_color": color,
                "stroke_opacity": 0.8,
                "stroke_weight": 2,
            },
            "zoom": zoom,
            "clustered": True,
            "items": items,
            "total_items": len(items),
        }

    else:
        # --- INDIVIDUAL FEATURES (high zoom) ---
        result = db.execute(text("""
            SELECT id, internal_incident_number, address, cad_event_type,
                   cad_event_subtype, incident_date::text, call_category,
                   CAST(latitude AS DOUBLE PRECISION) as lat,
                   CAST(longitude AS DOUBLE PRECISION) as lng,
                   location_name, municipality_code
            FROM incidents
            WHERE call_category = :category
              AND deleted_at IS NULL
              AND latitude IS NOT NULL AND longitude IS NOT NULL
              AND latitude != '' AND longitude != ''
              AND incident_date >= :date_start
              AND CAST(longitude AS DOUBLE PRECISION) BETWEEN :west AND :east
              AND CAST(latitude AS DOUBLE PRECISION) BETWEEN :south AND :north
            ORDER BY incident_date DESC
            LIMIT 2000
        """), params)

        items = []
        for row in result:
            items.append({
                "type": "feature",
                "id": row[0],
                "lat": float(row[7]),
                "lng": float(row[8]),
                "title": row[1],
                "properties": {
                    "incident_number": row[1],
                    "address": row[2],
                    "cad_event_type": row[3],
                    "cad_event_subtype": row[4],
                    "incident_date": row[5],
                    "call_category": row[6],
                    "location_name": row[9],
                    "municipality_code": row[10],
                },
            })

        return {
            "layer_id": layer_key,
            "layer_type": layer_def["layer_type"],
            "layer_color": color,
            "layer_icon": layer_def["icon"],
            "layer_style": {
                "fill_color": color,
                "fill_opacity": 0.9,
                "stroke_color": color,
                "stroke_opacity": 0.8,
                "stroke_weight": 2,
            },
            "zoom": zoom,
            "clustered": False,
            "items": items,
            "total_items": len(items),
        }


@router.post("/layers/batch/clustered")
async def get_batch_clustered_features(
    request: BatchClusteredRequest,
    db: Session = Depends(get_db),
):
    """
    Batch viewport query — returns clustered features for multiple layers
    in a single request. Replaces N parallel GETs from the frontend.

    Supports both real map_layers (integer IDs) and virtual incident layers
    (string IDs: "incident_fire", "incident_ems").

    Request: { "layer_ids": [1,3,5,"incident_fire"], "bbox": "west,south,east,north", "zoom": 14 }
    Response: { "layers": { "1": {...}, "3": {...}, "incident_fire": {...} }, "zoom": 14 }
    """
    try:
        west, south, east, north = [float(x) for x in request.bbox.split(",")]
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid bbox format. Use: west,south,east,north")

    if not request.layer_ids:
        return {"layers": {}, "zoom": request.zoom}

    if len(request.layer_ids) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 layers per batch request")

    layers_result = {}
    for lid in request.layer_ids:
        try:
            # Virtual incident layers use string IDs
            if isinstance(lid, str) and lid.startswith("incident_"):
                data = _query_incident_layer(db, lid, west, south, east, north, request.zoom)
            else:
                data = _query_clustered_layer(db, int(lid), west, south, east, north, request.zoom)
            if data is not None:
                layers_result[str(lid)] = data
        except Exception as e:
            logger.warning(f"Batch: failed to query layer {lid}: {e}")
            # Skip failed layers, don't fail the whole batch

    return {"layers": layers_result, "zoom": request.zoom}


# =============================================================================
# MUTUAL AID STATIONS — READ ONLY (Phase 3, display on map)
# Full CRUD in Phase 6
# =============================================================================

@router.get("/mutual-aid/stations")
async def list_mutual_aid_stations(
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    """List mutual aid stations for map display."""
    active_filter = "WHERE is_active = true" if active_only else ""

    try:
        result = db.execute(text(f"""
            SELECT id, name, department, station_number, address,
                   latitude, longitude, dispatch_phone, radio_channel,
                   apparatus, external_id, import_source, relationship,
                   notes, is_active, created_at
            FROM mutual_aid_stations
            {active_filter}
            ORDER BY name
        """))

        stations = []
        for row in result:
            stations.append({
                "id": row[0],
                "name": row[1],
                "department": row[2],
                "station_number": row[3],
                "address": row[4],
                "latitude": float(row[5]) if row[5] else None,
                "longitude": float(row[6]) if row[6] else None,
                "dispatch_phone": row[7],
                "radio_channel": row[8],
                "apparatus": row[9] or [],
                "external_id": row[10],
                "import_source": row[11],
                "relationship": row[12],
                "notes": row[13],
                "is_active": row[14],
                "created_at": row[15].isoformat() if row[15] else None,
            })

        return {"stations": stations}
    except Exception as e:
        logger.error(f"Failed to list mutual aid stations: {e}")
        raise HTTPException(status_code=500, detail="Failed to load stations")


# =============================================================================
# FEATURE CRUD (Phase 4 — create, update, delete features)
# Officers and Admins only (frontend enforces role check)
# =============================================================================

class FeatureCreate(BaseModel):
    """Create a new feature in a layer."""
    title: str
    description: Optional[str] = None
    notes: Optional[str] = None
    latitude: float
    longitude: float
    radius_meters: Optional[int] = None
    address: Optional[str] = None
    properties: Optional[dict] = {}
    # For polygon features, pass GeoJSON geometry instead of lat/lng
    geometry_geojson: Optional[dict] = None

class FeatureUpdate(BaseModel):
    """Update an existing feature."""
    title: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_meters: Optional[int] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    properties: Optional[dict] = None
    geometry_geojson: Optional[dict] = None


@router.post("/layers/{layer_id}/features")
async def create_feature(
    layer_id: int,
    feature: FeatureCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new feature in a layer.
    For point features: provide latitude + longitude.
    For polygon features: provide geometry_geojson (GeoJSON Polygon/MultiPolygon).
    For point_radius features: provide latitude + longitude + radius_meters.
    """
    # Verify layer exists
    layer = db.execute(
        text("SELECT id, layer_type, name, geometry_type FROM map_layers WHERE id = :id AND is_active = true"),
        {"id": layer_id}
    ).fetchone()

    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")

    geometry_type = layer[3]

    # Build geometry SQL
    if feature.geometry_geojson and geometry_type == 'polygon':
        # Polygon from GeoJSON
        geom_sql = "ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)"
        geom_params = {"geojson": json.dumps(feature.geometry_geojson)}
    elif feature.latitude is not None and feature.longitude is not None:
        # Point from lat/lng
        geom_sql = "ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)"
        geom_params = {"lat": feature.latitude, "lng": feature.longitude}
    else:
        raise HTTPException(status_code=400, detail="Must provide latitude/longitude or geometry_geojson")

    try:
        result = db.execute(
            text(f"""
                INSERT INTO map_features (layer_id, title, description, notes, geometry, radius_meters, address, properties, import_source)
                VALUES (:layer_id, :title, :description, :notes, {geom_sql}, :radius_meters, :address, :properties, 'manual')
                RETURNING id, ST_Y(ST_Centroid(geometry)) as lat, ST_X(ST_Centroid(geometry)) as lng
            """),
            {
                "layer_id": layer_id,
                "title": feature.title,
                "description": feature.description,
                "notes": feature.notes,
                "radius_meters": feature.radius_meters,
                "address": feature.address,
                "properties": json.dumps(feature.properties or {}),
                **geom_params,
            }
        )
        row = result.fetchone()
        db.commit()

        logger.info(f"Created feature '{feature.title}' in layer {layer_id} (id={row[0]})")

        return {
            "id": row[0],
            "layer_id": layer_id,
            "title": feature.title,
            "latitude": row[1],
            "longitude": row[2],
            "layer_type": layer[1],
            "layer_name": layer[2],
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create feature in layer {layer_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create feature: {str(e)}")


@router.put("/features/{feature_id}")
async def update_feature(
    feature_id: int,
    update: FeatureUpdate,
    db: Session = Depends(get_db),
):
    """
    Update an existing feature. Only provided fields are updated.
    """
    # Verify feature exists
    existing = db.execute(
        text("SELECT id, layer_id FROM map_features WHERE id = :id"),
        {"id": feature_id}
    ).fetchone()

    if not existing:
        raise HTTPException(status_code=404, detail="Feature not found")

    # Build dynamic update
    set_clauses = ["updated_at = NOW()"]
    params = {"id": feature_id}

    if update.title is not None:
        set_clauses.append("title = :title")
        params["title"] = update.title

    if update.description is not None:
        set_clauses.append("description = :description")
        params["description"] = update.description

    if update.radius_meters is not None:
        set_clauses.append("radius_meters = :radius_meters")
        params["radius_meters"] = update.radius_meters

    if update.address is not None:
        set_clauses.append("address = :address")
        params["address"] = update.address

    if update.notes is not None:
        set_clauses.append("notes = :notes")
        params["notes"] = update.notes

    if update.properties is not None:
        set_clauses.append("properties = :properties")
        params["properties"] = json.dumps(update.properties)

    # Geometry update — either from GeoJSON or lat/lng
    if update.geometry_geojson is not None:
        set_clauses.append("geometry = ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)")
        params["geojson"] = json.dumps(update.geometry_geojson)
    elif update.latitude is not None and update.longitude is not None:
        set_clauses.append("geometry = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)")
        params["lat"] = update.latitude
        params["lng"] = update.longitude

    try:
        db.execute(
            text(f"""
                UPDATE map_features
                SET {', '.join(set_clauses)}
                WHERE id = :id
            """),
            params
        )
        db.commit()

        # Return updated feature
        updated = db.execute(
            text("""
                SELECT mf.id, mf.title, mf.description, mf.radius_meters, mf.address,
                       mf.properties, mf.layer_id, mf.notes,
                       ST_Y(ST_Centroid(mf.geometry)) as lat,
                       ST_X(ST_Centroid(mf.geometry)) as lng,
                       ml.name as layer_name, ml.layer_type
                FROM map_features mf
                JOIN map_layers ml ON ml.id = mf.layer_id
                WHERE mf.id = :id
            """),
            {"id": feature_id}
        ).fetchone()

        logger.info(f"Updated feature {feature_id}")

        return {
            "id": updated[0],
            "title": updated[1],
            "description": updated[2],
            "radius_meters": updated[3],
            "address": updated[4],
            "properties": updated[5] or {},
            "layer_id": updated[6],
            "notes": updated[7],
            "latitude": updated[8],
            "longitude": updated[9],
            "layer_name": updated[10],
            "layer_type": updated[11],
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update feature {feature_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update feature: {str(e)}")


@router.delete("/features/{feature_id}")
async def delete_feature(
    feature_id: int,
    hard_delete: bool = Query(False, description="Hard delete (for closures). Default is soft-delete."),
    db: Session = Depends(get_db),
):
    """
    Delete a feature.
    - Closures: hard_delete=true removes the row entirely ("road reopened")
    - Everything else: soft-delete by removing from layer (or just delete since no soft-delete column)
    
    For Phase 4, all deletes are hard deletes since map_features has no is_active column.
    """
    existing = db.execute(
        text("""
            SELECT mf.id, mf.title, ml.layer_type
            FROM map_features mf
            JOIN map_layers ml ON ml.id = mf.layer_id
            WHERE mf.id = :id
        """),
        {"id": feature_id}
    ).fetchone()

    if not existing:
        raise HTTPException(status_code=404, detail="Feature not found")

    try:
        db.execute(
            text("DELETE FROM map_features WHERE id = :id"),
            {"id": feature_id}
        )
        db.commit()

        logger.info(f"Deleted feature {feature_id} ('{existing[1]}', type={existing[2]})")

        return {
            "deleted": True,
            "id": feature_id,
            "title": existing[1],
            "layer_type": existing[2],
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete feature {feature_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete feature: {str(e)}")


# =============================================================================
# ADDRESS NOTES CRUD (Phase 4)
# =============================================================================

class AddressNoteCreate(BaseModel):
    address: str
    content: str
    note_type: Optional[str] = 'general'
    priority: Optional[str] = 'normal'
    municipality_id: Optional[int] = None
    incident_id: Optional[int] = None

class AddressNoteUpdate(BaseModel):
    content: Optional[str] = None
    note_type: Optional[str] = None
    priority: Optional[str] = None


@router.get("/address-notes")
async def get_address_notes(
    address: str = Query(..., description="Address to look up"),
    db: Session = Depends(get_db),
):
    """Get all notes for a normalized address."""
    normalized = address.strip().upper()

    try:
        result = db.execute(text("""
            SELECT id, address, municipality_id, incident_id, note_type,
                   content, priority, created_at, updated_at
            FROM address_notes
            WHERE UPPER(TRIM(address)) = :address
            ORDER BY
                CASE priority
                    WHEN 'critical' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'normal' THEN 3
                    WHEN 'low' THEN 4
                    ELSE 5
                END,
                created_at DESC
        """), {"address": normalized})

        notes = []
        for row in result:
            notes.append({
                "id": row[0],
                "address": row[1],
                "municipality_id": row[2],
                "incident_id": row[3],
                "note_type": row[4],
                "content": row[5],
                "priority": row[6],
                "created_at": row[7].isoformat() if row[7] else None,
                "updated_at": row[8].isoformat() if row[8] else None,
            })

        return {"address": normalized, "notes": notes}
    except Exception as e:
        logger.error(f"Failed to get address notes: {e}")
        raise HTTPException(status_code=500, detail="Failed to load address notes")


@router.post("/address-notes")
async def create_address_note(
    note: AddressNoteCreate,
    db: Session = Depends(get_db),
):
    """Create an address note."""
    normalized = note.address.strip().upper()

    try:
        result = db.execute(
            text("""
                INSERT INTO address_notes (address, content, note_type, priority, municipality_id, incident_id)
                VALUES (:address, :content, :note_type, :priority, :municipality_id, :incident_id)
                RETURNING id, created_at
            """),
            {
                "address": normalized,
                "content": note.content,
                "note_type": note.note_type or 'general',
                "priority": note.priority or 'normal',
                "municipality_id": note.municipality_id,
                "incident_id": note.incident_id,
            }
        )
        row = result.fetchone()
        db.commit()

        logger.info(f"Created address note for '{normalized}' (id={row[0]})")

        return {
            "id": row[0],
            "address": normalized,
            "content": note.content,
            "note_type": note.note_type,
            "priority": note.priority,
            "created_at": row[1].isoformat() if row[1] else None,
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create address note: {e}")
        raise HTTPException(status_code=500, detail="Failed to create address note")


@router.put("/address-notes/{note_id}")
async def update_address_note(
    note_id: int,
    update: AddressNoteUpdate,
    db: Session = Depends(get_db),
):
    """Update an address note."""
    existing = db.execute(
        text("SELECT id FROM address_notes WHERE id = :id"),
        {"id": note_id}
    ).fetchone()

    if not existing:
        raise HTTPException(status_code=404, detail="Address note not found")

    set_clauses = ["updated_at = NOW()"]
    params = {"id": note_id}

    if update.content is not None:
        set_clauses.append("content = :content")
        params["content"] = update.content
    if update.note_type is not None:
        set_clauses.append("note_type = :note_type")
        params["note_type"] = update.note_type
    if update.priority is not None:
        set_clauses.append("priority = :priority")
        params["priority"] = update.priority

    try:
        db.execute(
            text(f"UPDATE address_notes SET {', '.join(set_clauses)} WHERE id = :id"),
            params
        )
        db.commit()

        logger.info(f"Updated address note {note_id}")
        return {"updated": True, "id": note_id}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update address note {note_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update address note")


@router.delete("/address-notes/{note_id}")
async def delete_address_note(
    note_id: int,
    db: Session = Depends(get_db),
):
    """Delete an address note."""
    existing = db.execute(
        text("SELECT id, address FROM address_notes WHERE id = :id"),
        {"id": note_id}
    ).fetchone()

    if not existing:
        raise HTTPException(status_code=404, detail="Address note not found")

    try:
        db.execute(
            text("DELETE FROM address_notes WHERE id = :id"),
            {"id": note_id}
        )
        db.commit()

        logger.info(f"Deleted address note {note_id} for '{existing[1]}'")
        return {"deleted": True, "id": note_id, "address": existing[1]}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete address note {note_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete address note")


# =============================================================================
# GIS IMPORT — ArcGIS REST (Phase 5a)
# Admin only (frontend enforces role check)
# =============================================================================

class ArcGISPreviewRequest(BaseModel):
    url: str

class ArcGISFetchValuesRequest(BaseModel):
    url: str
    field: str  # Field name to fetch unique values for


@router.post("/gis/arcgis/values")
async def arcgis_fetch_values(request: ArcGISFetchValuesRequest):
    """
    Fetch all unique values for a specific field from an ArcGIS endpoint.
    Used by the import wizard to show a feature picker (e.g. all station names).
    Returns attributes only — no geometry — so it's fast.
    """
    from services.location.gis_import import _normalize_arcgis_url
    rest_url = _normalize_arcgis_url(request.url)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Fetch all features with just the requested field + OBJECTID
            all_records = []
            offset = 0
            page_size = 1000
            while True:
                resp = await client.get(
                    f"{rest_url}/query",
                    params={
                        "where": "1=1",
                        "outFields": f"OBJECTID,{request.field}",
                        "returnGeometry": "false",
                        "f": "json",
                        "resultOffset": str(offset),
                        "resultRecordCount": str(page_size),
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                features = data.get("features", [])
                if not features:
                    break
                for feat in features:
                    attrs = feat.get("attributes", {})
                    all_records.append({
                        "objectid": attrs.get("OBJECTID"),
                        "value": attrs.get(request.field),
                    })
                if len(features) < page_size:
                    break
                offset += len(features)

        return {
            "field": request.field,
            "total": len(all_records),
            "records": all_records,
        }
    except Exception as e:
        logger.error(f"ArcGIS values fetch failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch values: {str(e)}")


class ArcGISImportRequest(BaseModel):
    url: str
    layer_id: int
    field_mapping: dict  # {"SOURCE_FIELD": "target_property", ...}
    filter_expression: Optional[str] = None
    save_config: bool = False
    config_name: Optional[str] = None


@router.post("/gis/arcgis/preview")
async def arcgis_preview(request: ArcGISPreviewRequest):
    """
    Fetch metadata + sample features from an ArcGIS REST endpoint.
    Admin uses this to see available fields and map them.
    """
    from services.location.gis_import import fetch_arcgis_preview

    try:
        result = await fetch_arcgis_preview(request.url, sample_count=5)
        return result
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"ArcGIS server returned {e.response.status_code}")
    except Exception as e:
        logger.error(f"ArcGIS preview failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch ArcGIS metadata: {str(e)}")


@router.post("/gis/arcgis/import")
async def arcgis_import(
    request: ArcGISImportRequest,
    db: Session = Depends(get_db),
):
    """
    Import features from ArcGIS REST endpoint into a layer.
    Fetches all features (paginated), applies field mapping, bulk inserts.
    Uses external_id for upsert (update existing, insert new).
    """
    import httpx as httpx_lib
    from services.location.gis_import import fetch_arcgis_features
    from services.location.import_pipeline import import_features_to_layer

    # Verify layer exists
    layer = db.execute(
        text("SELECT id, layer_type, name FROM map_layers WHERE id = :id"),
        {"id": request.layer_id}
    ).fetchone()

    if not layer:
        raise HTTPException(status_code=404, detail="Target layer not found")

    try:
        # Fetch metadata for field schema auto-generation
        from services.location.gis_import import fetch_arcgis_metadata
        metadata = await fetch_arcgis_metadata(request.url)
        source_fields = metadata.get("fields", [])

        # Fetch features from ArcGIS
        where = request.filter_expression or "1=1"
        features = await fetch_arcgis_features(request.url, where=where)

        if not features:
            return {"success": True, "message": "No features found at source", "stats": {"imported": 0}}

        # Import into layer — stores ALL fields, auto-generates property_schema
        stats = import_features_to_layer(
            db=db,
            layer_id=request.layer_id,
            features=features,
            field_mapping=request.field_mapping,
            import_source="arcgis_rest",
            upsert=True,
            source_fields=source_fields,
        )

        # Optionally save import config for re-import
        if request.save_config and request.config_name:
            # Count actual features in layer
            total_features = db.execute(
                text("SELECT COUNT(*) FROM map_features WHERE layer_id = :lid"),
                {"lid": request.layer_id}
            ).scalar() or 0

            db.execute(
                text("""
                    INSERT INTO gis_import_configs
                        (layer_id, name, source_type, source_url, field_mapping,
                         import_options, last_refresh_at, last_refresh_status, last_refresh_count)
                    VALUES
                        (:layer_id, :name, 'arcgis_rest', :url, :mapping,
                         :options, NOW(), 'success', :count)
                    ON CONFLICT DO NOTHING
                """),
                {
                    "layer_id": request.layer_id,
                    "name": request.config_name,
                    "url": request.url,
                    "mapping": json.dumps(request.field_mapping),
                    "options": json.dumps({"filter_expression": request.filter_expression}),
                    "count": total_features,
                },
            )
            db.commit()

        return {
            "success": True,
            "layer_id": request.layer_id,
            "layer_name": layer[2],
            "stats": stats,
        }
    except httpx_lib.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"ArcGIS server returned {e.response.status_code}")
    except Exception as e:
        db.rollback()
        logger.error(f"ArcGIS import failed: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")


# =============================================================================
# SAVED IMPORT CONFIGS (Phase 5a)
# =============================================================================

@router.get("/gis/configs")
async def list_import_configs(db: Session = Depends(get_db)):
    """List saved GIS import configurations."""
    try:
        result = db.execute(text("""
            SELECT gc.id, gc.layer_id, gc.name, gc.source_type, gc.source_url,
                   gc.field_mapping, gc.import_options, gc.auto_refresh,
                   gc.refresh_interval_days, gc.last_refresh_at,
                   gc.last_refresh_status, gc.last_refresh_count,
                   gc.is_active, gc.created_at,
                   ml.name as layer_name, ml.layer_type, ml.icon
            FROM gis_import_configs gc
            JOIN map_layers ml ON ml.id = gc.layer_id
            ORDER BY gc.name
        """))

        configs = []
        for row in result:
            configs.append({
                "id": row[0],
                "layer_id": row[1],
                "name": row[2],
                "source_type": row[3],
                "source_url": row[4],
                "field_mapping": row[5] or {},
                "import_options": row[6] or {},
                "auto_refresh": row[7],
                "refresh_interval_days": row[8],
                "last_refresh_at": row[9].isoformat() if row[9] else None,
                "last_refresh_status": row[10],
                "last_refresh_count": row[11],
                "is_active": row[12],
                "created_at": row[13].isoformat() if row[13] else None,
                "layer_name": row[14],
                "layer_type": row[15],
                "layer_icon": row[16],
            })

        return {"configs": configs}
    except Exception as e:
        logger.error(f"Failed to list import configs: {e}")
        raise HTTPException(status_code=500, detail="Failed to load import configs")


@router.post("/gis/configs/{config_id}/refresh")
async def refresh_import_config(
    config_id: int,
    db: Session = Depends(get_db),
):
    """
    Re-run a saved import configuration.
    Fetches fresh data from the source and upserts into the target layer.
    """
    import httpx as httpx_lib
    from services.location.gis_import import fetch_arcgis_features
    from services.location.import_pipeline import import_features_to_layer

    config = db.execute(
        text("SELECT id, layer_id, source_type, source_url, field_mapping, import_options FROM gis_import_configs WHERE id = :id"),
        {"id": config_id}
    ).fetchone()

    if not config:
        raise HTTPException(status_code=404, detail="Import config not found")

    if config[2] != "arcgis_rest":
        raise HTTPException(status_code=400, detail=f"Refresh not supported for source type: {config[2]}")

    try:
        options = config[5] or {}
        where = options.get("filter_expression", "1=1")

        # Fetch metadata for field schema auto-generation
        from services.location.gis_import import fetch_arcgis_metadata
        metadata = await fetch_arcgis_metadata(config[3])
        source_fields = metadata.get("fields", [])

        features = await fetch_arcgis_features(config[3], where=where)

        stats = import_features_to_layer(
            db=db,
            layer_id=config[1],
            features=features,
            field_mapping=config[4] or {},
            import_source="arcgis_rest",
            upsert=True,
            source_fields=source_fields,
        )

        # Update config with refresh status — use actual feature count from DB
        # Force fresh transaction to see committed data from import
        db.commit()
        total_features = db.execute(
            text("SELECT COUNT(*) FROM map_features WHERE layer_id = :lid"),
            {"lid": config[1]}
        ).scalar() or 0
        logger.info(f"Config {config_id} refresh complete: COUNT={total_features}, stats={stats}")

        db.execute(
            text("""
                UPDATE gis_import_configs
                SET last_refresh_at = NOW(),
                    last_refresh_status = 'success',
                    last_refresh_count = :count,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"count": total_features, "id": config_id},
        )
        db.commit()

        return {"success": True, "stats": stats}
    except Exception as e:
        # Record failure
        db.execute(
            text("""
                UPDATE gis_import_configs
                SET last_refresh_at = NOW(), last_refresh_status = 'failed', updated_at = NOW()
                WHERE id = :id
            """),
            {"id": config_id},
        )
        db.commit()
        logger.error(f"Config refresh failed for config {config_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Refresh failed: {str(e)}")


@router.delete("/gis/configs/{config_id}")
async def delete_import_config(
    config_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete a saved import configuration AND all imported features in its layer.
    This is a destructive operation — the confirmation dialog warns the user.
    """
    existing = db.execute(
        text("SELECT gc.id, gc.name, gc.layer_id, gc.source_url FROM gis_import_configs gc WHERE gc.id = :id"),
        {"id": config_id},
    ).fetchone()

    if not existing:
        raise HTTPException(status_code=404, detail="Import config not found")

    layer_id = existing[2]

    # Delete all features in the layer that were imported from this source
    # Since one config = one layer, delete all features in the layer
    deleted_count = db.execute(
        text("DELETE FROM map_features WHERE layer_id = :layer_id"),
        {"layer_id": layer_id}
    ).rowcount

    # Delete the config
    db.execute(text("DELETE FROM gis_import_configs WHERE id = :id"), {"id": config_id})
    db.commit()

    logger.info(f"Deleted import config {config_id} ('{existing[1]}') and {deleted_count} features from layer {layer_id}")

    return {"deleted": True, "id": config_id, "name": existing[1], "features_deleted": deleted_count}


# =============================================================================
# GIS IMPORT — FILE UPLOAD (Phase 5b)
# Two-step: upload+parse → preview → confirm import
# =============================================================================

# Disk-based storage for parsed uploads awaiting confirmation (Phase D — multi-worker safe)
import os as _os
PENDING_UPLOADS_DIR = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))), "data", "tmp_uploads")
_os.makedirs(PENDING_UPLOADS_DIR, exist_ok=True)


@router.post("/gis/file/upload")
async def file_upload_preview(
    file: UploadFile = File(...),
):
    """
    Upload a GIS file and parse it for preview.
    Returns field metadata + sample features + a temp_id for the import step.

    Supported formats: GeoJSON, KML, KMZ, Shapefile (.zip), CSV/TSV
    Max size: 50MB
    """
    import os
    import uuid
    import tempfile
    from services.location.file_parser import parse_gis_file, SUPPORTED_EXTENSIONS
    from pathlib import Path

    # Validate extension
    ext = Path(file.filename or '').suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {ext}. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    # Save to temp file
    upload_dir = os.path.join(tempfile.gettempdir(), 'cadreport_uploads')
    os.makedirs(upload_dir, exist_ok=True)

    temp_id = str(uuid.uuid4())
    temp_path = os.path.join(upload_dir, f"{temp_id}{ext}")

    try:
        contents = await file.read()
        if len(contents) > 50 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Maximum is 50MB.")

        with open(temp_path, 'wb') as f:
            f.write(contents)

        # Parse the file
        result = parse_gis_file(temp_path, file.filename or 'unknown')

        # Store parsed result to disk for import step (multi-worker safe)
        pending_path = os.path.join(PENDING_UPLOADS_DIR, f"{temp_id}.json")
        with open(pending_path, 'w') as pf:
            json.dump({
                "filepath": temp_path,
                "parsed_result": result,
            }, pf)

        # Build sample values (same format as ArcGIS preview)
        sample_values = {}
        for feature in result["features"][:5]:
            props = feature.get("properties", {})
            for key, val in props.items():
                if key not in sample_values:
                    sample_values[key] = []
                if val is not None and len(sample_values[key]) < 3:
                    sample_values[key].append(str(val)[:100])

        return {
            "temp_id": temp_id,
            "filename": file.filename,
            "format": result["format"],
            "geometry_type": result["geometry_type"],
            "feature_count": result["feature_count"],
            "fields": result["fields"],
            "sample_values": sample_values,
            "sample_features": result["features"][:5],
        }

    except ValueError as e:
        # Clean up temp file on parse error
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logger.error(f"File upload parse failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse file: {str(e)}")


class FileImportRequest(BaseModel):
    temp_id: str
    layer_id: int
    field_mapping: dict = {}
    save_config: bool = False
    config_name: Optional[str] = None


@router.post("/gis/file/import")
async def file_import(
    request: FileImportRequest,
    db: Session = Depends(get_db),
):
    """
    Import previously uploaded+parsed file into a layer.
    Uses the temp_id from the upload/preview step.
    """
    import os
    from services.location.import_pipeline import import_features_to_layer

    # Look up pending upload from disk (multi-worker safe)
    pending_path = os.path.join(PENDING_UPLOADS_DIR, f"{request.temp_id}.json")
    if not os.path.exists(pending_path):
        raise HTTPException(
            status_code=404,
            detail="Upload not found. It may have expired. Please re-upload the file."
        )

    try:
        with open(pending_path, 'r') as pf:
            pending = json.load(pf)
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f"Failed to read pending upload {request.temp_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to read upload data")

    parsed = pending["parsed_result"]

    # Verify layer exists
    layer = db.execute(
        text("SELECT id, layer_type, name FROM map_layers WHERE id = :id"),
        {"id": request.layer_id}
    ).fetchone()

    if not layer:
        raise HTTPException(status_code=404, detail="Target layer not found")

    try:
        # Build external_id from filename + index if no field mapped to __external_id
        has_ext_id = '__external_id' in (request.field_mapping or {}).values()
        features = parsed["features"]

        if not has_ext_id:
            # Auto-assign external_id: filename_NNNN
            from pathlib import Path
            base = Path(parsed.get("source_filename", "upload")).stem
            for i, feat in enumerate(features):
                feat["properties"]["__auto_external_id"] = f"{base}_{i:05d}"
            # Add to field mapping
            field_mapping = dict(request.field_mapping or {})
            field_mapping["__auto_external_id"] = "__external_id"
        else:
            field_mapping = request.field_mapping or {}

        stats = import_features_to_layer(
            db=db,
            layer_id=request.layer_id,
            features=features,
            field_mapping=field_mapping,
            import_source=f"file_upload:{parsed.get('format', 'unknown')}",
            upsert=True,
            source_fields=parsed.get("fields", []),
        )

        # Optionally save config
        if request.save_config and request.config_name:
            total_features = db.execute(
                text("SELECT COUNT(*) FROM map_features WHERE layer_id = :lid"),
                {"lid": request.layer_id}
            ).scalar() or 0

            db.execute(
                text("""
                    INSERT INTO gis_import_configs
                        (layer_id, name, source_type, source_url, field_mapping,
                         import_options, last_refresh_at, last_refresh_status, last_refresh_count)
                    VALUES
                        (:layer_id, :name, :source_type, :source_url, :mapping,
                         :options, NOW(), 'success', :count)
                    ON CONFLICT DO NOTHING
                """),
                {
                    "layer_id": request.layer_id,
                    "name": request.config_name,
                    "source_type": f"file_upload:{parsed.get('format', 'unknown')}",
                    "source_url": parsed.get("source_filename", ""),
                    "mapping": json.dumps(field_mapping),
                    "options": json.dumps({"original_filename": parsed.get("source_filename")}),
                    "count": total_features,
                },
            )
            db.commit()

        # Clean up temp file and pending entry
        _cleanup_pending(request.temp_id)

        return {
            "success": True,
            "layer_id": request.layer_id,
            "layer_name": layer[2],
            "stats": stats,
            "source": parsed.get("source_filename"),
            "format": parsed.get("format"),
        }

    except Exception as e:
        db.rollback()
        logger.error(f"File import failed: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")


def _cleanup_pending(temp_id: str):
    """Remove a pending upload JSON and its associated temp file from disk."""
    import os
    pending_path = os.path.join(PENDING_UPLOADS_DIR, f"{temp_id}.json")
    if os.path.exists(pending_path):
        try:
            with open(pending_path, 'r') as pf:
                pending = json.load(pf)
            # Remove the original uploaded file
            filepath = pending.get("filepath", "")
            if filepath and os.path.exists(filepath):
                os.remove(filepath)
        except (json.JSONDecodeError, OSError):
            pass
        # Remove the pending JSON
        try:
            os.remove(pending_path)
        except OSError:
            pass


def cleanup_expired_uploads(max_age_hours: int = 1):
    """Remove pending uploads older than max_age_hours based on file mtime."""
    import os
    import time

    cutoff_time = time.time() - (max_age_hours * 3600)
    expired_count = 0

    try:
        for filename in os.listdir(PENDING_UPLOADS_DIR):
            if not filename.endswith('.json'):
                continue
            filepath = os.path.join(PENDING_UPLOADS_DIR, filename)
            try:
                if os.path.getmtime(filepath) < cutoff_time:
                    temp_id = filename[:-5]  # Strip .json
                    _cleanup_pending(temp_id)
                    expired_count += 1
            except OSError:
                pass
    except OSError:
        pass

    if expired_count:
        logger.info(f"Cleaned up {expired_count} expired file uploads")
