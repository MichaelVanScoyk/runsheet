"""
Proximity Service for Map Platform

Runs spatial queries against map data when an incident is geocoded.
Results are snapshotted as JSONB on the incident (map_snapshot column)
at dispatch time, capturing the state of the world when the call came in.

Queries:
    1. Map Feature Proximity — point_radius features (hazards, closures, TRI)
    2. Water Source Proximity — hydrants, dry hydrants, draft points within 2km
    3. Address Notes — normalized address match
    4. Boundary Check — which boundary polygon contains the incident
    5. Preplan Lookup — preplans at or near the incident address
    6. Flood/Wildfire Weather-Conditional — ST_Intersects + weather trigger check

The snapshot is what the RunSheet and IncidentHubModal display.
No re-querying on every page load.

Dependencies:
    - Phase 1 tables (map_layers, map_features, address_notes)
    - PostGIS extension (ST_DWithin, ST_Contains, ST_Intersects, ST_Distance)
    - weather_service.py (for flood/wildfire conditional alerts)
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)


# =============================================================================
# WEATHER CODES FOR CONDITIONAL ALERTS
# =============================================================================

# Open-Meteo WMO weather codes that trigger flood zone alerts
# Rain, heavy rain, thunderstorm conditions
FLOOD_TRIGGER_CODES = {
    51, 53, 55,     # Drizzle (light, moderate, dense)
    56, 57,         # Freezing drizzle
    61, 63, 65,     # Rain (slight, moderate, heavy)
    66, 67,         # Freezing rain
    80, 81, 82,     # Rain showers (slight, moderate, violent)
    95, 96, 99,     # Thunderstorm (plain, slight hail, heavy hail)
}

# Open-Meteo WMO weather codes that trigger wildfire risk alerts
# Not code-based — wildfire triggers on wind speed + humidity thresholds
# wind_speed_kmh > 40 AND humidity < 25 → elevated wildfire risk
WILDFIRE_WIND_THRESHOLD_KMH = 40
WILDFIRE_HUMIDITY_THRESHOLD = 25


# =============================================================================
# PROXIMITY QUERIES
# =============================================================================

def query_point_radius_features(db: Session, lat: float, lng: float) -> List[Dict]:
    """
    Find all point_radius features whose radius encompasses the incident.
    Covers: hazards, informational notes, TRI facilities, closures (point type
    but included here for completeness — closures also caught by layer_type query).
    
    SQL from schema doc — Proximity Alerting § 1. Map Feature Proximity
    """
    try:
        result = db.execute(text("""
            SELECT mf.id, mf.title, mf.description, mf.properties, mf.radius_meters,
                   mf.address,
                   ml.name as layer_name, ml.icon, ml.color, ml.layer_type,
                   ST_Distance(
                       mf.geometry::geography,
                       ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                   ) as distance_meters
            FROM map_features mf
            JOIN map_layers ml ON mf.layer_id = ml.id
            WHERE ml.is_active = true
              AND ml.geometry_type = 'point_radius'
              AND ST_DWithin(
                  mf.geometry::geography,
                  ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                  mf.radius_meters
              )
            ORDER BY distance_meters
        """), {"lat": lat, "lng": lng})
        
        features = []
        for row in result:
            features.append({
                "feature_id": row[0],
                "title": row[1],
                "description": row[2],
                "properties": row[3] or {},
                "radius_meters": row[4],
                "address": row[5],
                "layer_name": row[6],
                "icon": row[7],
                "color": row[8],
                "layer_type": row[9],
                "distance_meters": round(row[10], 1) if row[10] else None,
            })
        return features
    except Exception as e:
        logger.error(f"Point radius proximity query failed: {e}")
        return []


def query_nearby_water(db: Session, lat: float, lng: float, radius_meters: int = 2000) -> List[Dict]:
    """
    Find nearest water sources within configurable radius (default 2km).
    Covers: hydrants, dry hydrants, draft points.
    
    SQL from schema doc — Proximity Alerting § 1. Map Feature Proximity (water query)
    """
    try:
        result = db.execute(text("""
            SELECT mf.id, mf.title, mf.description, mf.properties, mf.address,
                   ml.name as layer_name, ml.icon, ml.layer_type,
                   ST_Distance(
                       mf.geometry::geography,
                       ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                   ) as distance_meters
            FROM map_features mf
            JOIN map_layers ml ON mf.layer_id = ml.id
            WHERE ml.is_active = true
              AND ml.layer_type IN ('hydrant', 'dry_hydrant', 'draft_point')
              AND ST_DWithin(
                  mf.geometry::geography,
                  ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                  :radius
              )
            ORDER BY distance_meters
            LIMIT 10
        """), {"lat": lat, "lng": lng, "radius": radius_meters})
        
        water_sources = []
        for row in result:
            water_sources.append({
                "feature_id": row[0],
                "title": row[1],
                "description": row[2],
                "properties": row[3] or {},
                "address": row[4],
                "layer_name": row[5],
                "icon": row[6],
                "layer_type": row[7],
                "distance_meters": round(row[8], 1) if row[8] else None,
            })
        return water_sources
    except Exception as e:
        logger.error(f"Water source proximity query failed: {e}")
        return []


def query_address_notes(db: Session, address: str) -> List[Dict]:
    """
    Look up address notes by normalized address match.
    
    SQL from schema doc — Proximity Alerting § 2. Address Notes
    """
    if not address:
        return []
    
    # Normalize: uppercase, strip whitespace
    normalized = address.strip().upper()
    
    try:
        result = db.execute(text("""
            SELECT id, address, note_type, content, priority, incident_id,
                   created_at, updated_at
            FROM address_notes
            WHERE address = :address
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
                "note_type": row[2],
                "content": row[3],
                "priority": row[4],
                "incident_id": row[5],
                "created_at": row[6].isoformat() if row[6] else None,
            })
        return notes
    except Exception as e:
        logger.error(f"Address notes lookup failed: {e}")
        return []


def query_boundary(db: Session, lat: float, lng: float) -> Optional[str]:
    """
    Check which boundary polygon contains the incident point.
    Returns the boundary name (e.g. "First Due", "Second Due") or None.
    
    SQL from schema doc — Proximity Alerting § 3. Boundary Check
    """
    try:
        result = db.execute(text("""
            SELECT mf.title, ml.name, ml.color
            FROM map_features mf
            JOIN map_layers ml ON mf.layer_id = ml.id
            WHERE ml.layer_type = 'boundary'
              AND ml.is_active = true
              AND ST_Contains(
                  mf.geometry,
                  ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
              )
            ORDER BY ml.sort_order ASC
            LIMIT 1
        """), {"lat": lat, "lng": lng})
        
        row = result.fetchone()
        if row:
            # Return the most specific boundary (lowest sort_order = First Due)
            return row[0] or row[1]  # title or layer name
        return None
    except Exception as e:
        logger.error(f"Boundary check query failed: {e}")
        return None


def query_nearby_preplans(db: Session, lat: float, lng: float, address: str = None) -> List[Dict]:
    """
    Find preplans near the incident — by address match first, then by proximity.
    """
    preplans = []
    
    # 1. Address match (exact)
    if address:
        normalized = address.strip().upper()
        try:
            result = db.execute(text("""
                SELECT mf.id, mf.title, mf.description, mf.properties, mf.address,
                       ml.icon,
                       ST_Distance(
                           mf.geometry::geography,
                           ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                       ) as distance_meters
                FROM map_features mf
                JOIN map_layers ml ON mf.layer_id = ml.id
                WHERE ml.layer_type = 'preplan'
                  AND ml.is_active = true
                  AND UPPER(mf.address) = :address
                ORDER BY distance_meters
            """), {"lat": lat, "lng": lng, "address": normalized})
            
            for row in result:
                preplans.append({
                    "feature_id": row[0],
                    "title": row[1],
                    "description": row[2],
                    "properties": row[3] or {},
                    "address": row[4],
                    "icon": row[5],
                    "distance_meters": round(row[6], 1) if row[6] else None,
                    "match_type": "address",
                })
        except Exception as e:
            logger.error(f"Preplan address lookup failed: {e}")
    
    # 2. Proximity (within 200m, if no address match found)
    if not preplans:
        try:
            result = db.execute(text("""
                SELECT mf.id, mf.title, mf.description, mf.properties, mf.address,
                       ml.icon,
                       ST_Distance(
                           mf.geometry::geography,
                           ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                       ) as distance_meters
                FROM map_features mf
                JOIN map_layers ml ON mf.layer_id = ml.id
                WHERE ml.layer_type = 'preplan'
                  AND ml.is_active = true
                  AND ST_DWithin(
                      mf.geometry::geography,
                      ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                      200
                  )
                ORDER BY distance_meters
                LIMIT 5
            """), {"lat": lat, "lng": lng})
            
            for row in result:
                preplans.append({
                    "feature_id": row[0],
                    "title": row[1],
                    "description": row[2],
                    "properties": row[3] or {},
                    "address": row[4],
                    "icon": row[5],
                    "distance_meters": round(row[6], 1) if row[6] else None,
                    "match_type": "proximity",
                })
        except Exception as e:
            logger.error(f"Preplan proximity lookup failed: {e}")
    
    return preplans


def query_flood_wildfire_zones(db: Session, lat: float, lng: float) -> List[Dict]:
    """
    Check if incident falls within flood zone or wildfire risk polygons.
    Returns zone info — weather-conditional alerting is applied by the snapshot builder.
    
    SQL from schema doc — Weather-Conditional Alerting
    """
    try:
        result = db.execute(text("""
            SELECT mf.id, mf.title, mf.properties, ml.layer_type, ml.name, ml.icon
            FROM map_features mf
            JOIN map_layers ml ON mf.layer_id = ml.id
            WHERE ml.layer_type IN ('flood_zone', 'wildfire_risk')
              AND ml.is_active = true
              AND ST_Intersects(
                  mf.geometry,
                  ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
              )
        """), {"lat": lat, "lng": lng})
        
        zones = []
        for row in result:
            zones.append({
                "feature_id": row[0],
                "title": row[1],
                "properties": row[2] or {},
                "layer_type": row[3],
                "layer_name": row[4],
                "icon": row[5],
            })
        return zones
    except Exception as e:
        logger.error(f"Flood/wildfire zone query failed: {e}")
        return []


def query_nearby_closures(db: Session, lat: float, lng: float, radius_meters: int = 3000) -> List[Dict]:
    """
    Find active road/bridge closures near the incident.
    Closures are point type (not point_radius), so we use a fixed search radius.
    """
    try:
        result = db.execute(text("""
            SELECT mf.id, mf.title, mf.description, mf.properties, mf.address,
                   ml.icon,
                   ST_Distance(
                       mf.geometry::geography,
                       ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                   ) as distance_meters
            FROM map_features mf
            JOIN map_layers ml ON mf.layer_id = ml.id
            WHERE ml.layer_type = 'closure'
              AND ml.is_active = true
              AND ST_DWithin(
                  mf.geometry::geography,
                  ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                  :radius
              )
            ORDER BY distance_meters
        """), {"lat": lat, "lng": lng, "radius": radius_meters})
        
        closures = []
        for row in result:
            closures.append({
                "feature_id": row[0],
                "title": row[1],
                "description": row[2],
                "properties": row[3] or {},
                "address": row[4],
                "icon": row[5],
                "distance_meters": round(row[6], 1) if row[6] else None,
            })
        return closures
    except Exception as e:
        logger.error(f"Closure proximity query failed: {e}")
        return []


# =============================================================================
# WEATHER-CONDITIONAL ALERT EVALUATION
# =============================================================================

def evaluate_weather_alerts(zones: List[Dict], weather_data: Optional[Dict]) -> List[Dict]:
    """
    Evaluate flood/wildfire zones against current weather conditions.
    Returns only zones where weather conditions trigger an active alert.
    
    Per schema doc — Weather-Conditional Alerting:
    - Flood Zone (A/AE/V/VE) + Rain/heavy rain/thunderstorm → active alert
    - Wildfire Risk (high/extreme) + high wind + low humidity → active alert
    - Without matching weather → no alert (zone still visible on map overlay)
    """
    if not zones or not weather_data:
        return []
    
    alerts = []
    weather_code = weather_data.get("weather_code")
    wind_kmh = weather_data.get("wind_speed_kmh") or 0
    humidity = weather_data.get("humidity") or 100
    
    for zone in zones:
        layer_type = zone.get("layer_type")
        props = zone.get("properties", {})
        
        if layer_type == "flood_zone":
            # Only alert for high-risk flood zones with active precipitation
            flood_zone_code = props.get("flood_zone", "")
            high_risk_zones = {"A", "AE", "AH", "AO", "V", "VE"}
            
            if flood_zone_code in high_risk_zones and weather_code in FLOOD_TRIGGER_CODES:
                alerts.append({
                    "alert_type": "flood",
                    "severity": "warning",
                    "icon": "🌊",
                    "title": f"FLOOD ZONE {flood_zone_code} — ACTIVE RAINFALL",
                    "description": zone.get("title"),
                    "properties": props,
                    "feature_id": zone.get("feature_id"),
                    "layer_type": "flood_zone",
                })
        
        elif layer_type == "wildfire_risk":
            risk_level = props.get("risk_level", "")
            high_risk_levels = {"extreme", "very_high", "high"}
            
            if (risk_level in high_risk_levels
                    and wind_kmh > WILDFIRE_WIND_THRESHOLD_KMH
                    and humidity < WILDFIRE_HUMIDITY_THRESHOLD):
                alerts.append({
                    "alert_type": "wildfire",
                    "severity": "warning",
                    "icon": "🔥",
                    "title": f"HIGH WILDFIRE RISK — WEATHER CONDITIONS ELEVATED",
                    "description": f"{zone.get('title')} (Risk: {risk_level})",
                    "properties": props,
                    "feature_id": zone.get("feature_id"),
                    "layer_type": "wildfire_risk",
                })
    
    return alerts


# =============================================================================
# SNAPSHOT BUILDER
# =============================================================================

def _classify_point_radius_features(features: List[Dict]) -> Dict[str, List[Dict]]:
    """
    Sort point_radius features into alert categories by layer_type.
    """
    classified = {
        "hazards": [],
        "tri_facilities": [],
        "informational": [],
    }
    
    for f in features:
        lt = f.get("layer_type", "")
        alert = {
            "alert_type": lt,
            "severity": _get_severity(f),
            "icon": f.get("icon", "⚠️"),
            "title": f.get("title", ""),
            "description": f.get("description"),
            "distance_meters": f.get("distance_meters"),
            "properties": f.get("properties", {}),
            "feature_id": f.get("feature_id"),
            "layer_type": lt,
        }
        
        if lt == "hazard":
            classified["hazards"].append(alert)
        elif lt == "tri_facility":
            classified["tri_facilities"].append(alert)
        elif lt == "informational":
            classified["informational"].append(alert)
        else:
            # Unknown point_radius type — still include as hazard
            classified["hazards"].append(alert)
    
    return classified


def _get_severity(feature: Dict) -> str:
    """Determine alert severity from feature properties."""
    props = feature.get("properties", {})
    layer_type = feature.get("layer_type", "")
    
    if layer_type == "hazard":
        return props.get("severity", "warning")
    elif layer_type == "tri_facility":
        return "warning"
    elif layer_type == "closure":
        return "critical"
    return "info"


def _format_water_alert(water: Dict) -> Dict:
    """Format a water source into a ProximityAlert-compatible dict."""
    return {
        "alert_type": "water",
        "severity": "info",
        "icon": water.get("icon", "💧"),
        "title": water.get("title", ""),
        "description": water.get("description"),
        "distance_meters": water.get("distance_meters"),
        "properties": water.get("properties", {}),
        "feature_id": water.get("feature_id"),
        "layer_type": water.get("layer_type"),
    }


def _format_closure_alert(closure: Dict) -> Dict:
    """Format a closure into a ProximityAlert-compatible dict."""
    return {
        "alert_type": "closure",
        "severity": "critical",
        "icon": closure.get("icon", "🚫"),
        "title": closure.get("title", ""),
        "description": closure.get("description"),
        "distance_meters": closure.get("distance_meters"),
        "properties": closure.get("properties", {}),
        "feature_id": closure.get("feature_id"),
        "layer_type": "closure",
    }


def _format_preplan_alert(preplan: Dict) -> Dict:
    """Format a preplan into a ProximityAlert-compatible dict."""
    return {
        "alert_type": "preplan",
        "severity": "info",
        "icon": preplan.get("icon", "📋"),
        "title": preplan.get("title", ""),
        "description": preplan.get("description"),
        "distance_meters": preplan.get("distance_meters"),
        "properties": preplan.get("properties", {}),
        "feature_id": preplan.get("feature_id"),
        "layer_type": "preplan",
    }


def build_proximity_snapshot(
    db: Session,
    lat: float,
    lng: float,
    address: Optional[str] = None,
    weather_data: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Build a complete proximity snapshot for an incident location.
    
    This is the main entry point called after geocoding succeeds.
    Runs all proximity queries and assembles results into the JSONB
    structure stored in incidents.map_snapshot.
    
    Args:
        db: Database session (tenant-specific)
        lat: Incident latitude
        lng: Incident longitude
        address: Incident address (for address notes and preplan lookup)
        weather_data: Weather API response (for flood/wildfire conditional alerts)
    
    Returns:
        Dict matching the ProximitySnapshot schema from schemas_map.py
    """
    logger.info(f"Building proximity snapshot for ({lat}, {lng}), address={address}")
    
    # 1. Point-radius features (hazards, TRI, informational)
    point_radius_features = query_point_radius_features(db, lat, lng)
    classified = _classify_point_radius_features(point_radius_features)
    
    # 2. Nearby water sources (2km radius)
    water_sources = query_nearby_water(db, lat, lng)
    
    # 3. Address notes
    address_notes = query_address_notes(db, address)
    
    # 4. Boundary check
    boundary = query_boundary(db, lat, lng)
    
    # 5. Nearby preplans
    preplans = query_nearby_preplans(db, lat, lng, address)
    
    # 6. Nearby closures (3km radius)
    closures = query_nearby_closures(db, lat, lng)
    
    # 7. Flood/wildfire zones + weather-conditional evaluation
    zones = query_flood_wildfire_zones(db, lat, lng)
    flood_alerts = []
    wildfire_alerts = []
    weather_alerts = evaluate_weather_alerts(zones, weather_data)
    for alert in weather_alerts:
        if alert.get("layer_type") == "flood_zone":
            flood_alerts.append(alert)
        elif alert.get("layer_type") == "wildfire_risk":
            wildfire_alerts.append(alert)
    
    # Assemble snapshot
    snapshot = {
        "nearby_water": [_format_water_alert(w) for w in water_sources],
        "hazards": classified["hazards"],
        "closures": [_format_closure_alert(c) for c in closures],
        "address_notes": address_notes,
        "preplans": [_format_preplan_alert(p) for p in preplans],
        "railroad_crossings": [],  # Populated by route planner (Phase 6), not proximity
        "tri_facilities": classified["tri_facilities"],
        "flood_zones": flood_alerts,
        "wildfire_risk": wildfire_alerts,
        "boundary": boundary,
        "weather": weather_data,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    
    # Log summary
    counts = {k: len(v) if isinstance(v, list) else (1 if v else 0) for k, v in snapshot.items()}
    logger.info(f"Proximity snapshot built: {counts}")
    
    return snapshot
