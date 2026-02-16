"""
Pydantic Schemas for Map Platform
Covers: layers, features, address notes, GIS import, mutual aid stations,
        proximity queries, and route planner.

Organized by domain area matching the API endpoint groups.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# =============================================================================
# MAP LAYERS
# =============================================================================

class PropertyFieldSchema(BaseModel):
    """Schema for a single field in a layer's property_schema"""
    type: str                                   # 'text', 'number', 'select', 'date', 'json'
    label: str                                  # Display label
    options: Optional[List[str]] = None         # For 'select' type


class MapLayerCreate(BaseModel):
    """Create a custom layer"""
    layer_type: str = "custom"
    name: str
    description: Optional[str] = None
    icon: str = "ℹ️"
    color: str = "#3B82F6"
    opacity: float = 0.3
    geometry_type: str = "point"                # 'point', 'polygon', 'point_radius'
    property_schema: Dict[str, Any] = {}
    route_check: bool = False
    sort_order: int = 100


class MapLayerUpdate(BaseModel):
    """Update layer settings"""
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    opacity: Optional[float] = None
    property_schema: Optional[Dict[str, Any]] = None
    route_check: Optional[bool] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class MapLayerResponse(BaseModel):
    """Layer returned from API"""
    id: int
    layer_type: str
    name: str
    description: Optional[str] = None
    icon: str
    color: str
    opacity: float
    geometry_type: str
    property_schema: Dict[str, Any] = {}
    is_system: bool
    route_check: bool
    sort_order: int
    is_active: bool
    feature_count: Optional[int] = None         # Populated by list endpoint
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =============================================================================
# MAP FEATURES
# =============================================================================

class MapFeatureCreate(BaseModel):
    """Create a feature (manual entry)"""
    title: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    radius_meters: Optional[int] = None         # For point_radius features
    address: Optional[str] = None
    properties: Dict[str, Any] = {}
    # For polygon features, geometry is passed as GeoJSON
    geometry_geojson: Optional[Dict[str, Any]] = None


class MapFeatureUpdate(BaseModel):
    """Update a feature"""
    title: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_meters: Optional[int] = None
    address: Optional[str] = None
    properties: Optional[Dict[str, Any]] = None
    geometry_geojson: Optional[Dict[str, Any]] = None


class MapFeatureResponse(BaseModel):
    """Feature returned from API"""
    id: int
    layer_id: int
    title: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    radius_meters: Optional[int] = None
    address: Optional[str] = None
    properties: Dict[str, Any] = {}
    external_id: Optional[str] = None
    import_source: Optional[str] = None
    imported_at: Optional[datetime] = None
    # Layer info (joined)
    layer_name: Optional[str] = None
    layer_type: Optional[str] = None
    layer_icon: Optional[str] = None
    layer_color: Optional[str] = None
    # For polygon features
    geometry_geojson: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =============================================================================
# ADDRESS NOTES
# =============================================================================

class AddressNoteCreate(BaseModel):
    """Create an address note"""
    address: str
    municipality_id: Optional[int] = None
    incident_id: Optional[int] = None
    note_type: str = "general"                  # 'water_supply', 'access', 'hazard', 'preplan', 'general'
    content: str
    priority: str = "normal"                    # 'critical', 'high', 'normal', 'low'


class AddressNoteUpdate(BaseModel):
    """Update an address note"""
    note_type: Optional[str] = None
    content: Optional[str] = None
    priority: Optional[str] = None


class AddressNoteResponse(BaseModel):
    """Address note returned from API"""
    id: int
    address: str
    municipality_id: Optional[int] = None
    incident_id: Optional[int] = None
    note_type: str
    content: str
    priority: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =============================================================================
# GIS IMPORT
# =============================================================================

class GisImportPreviewUrl(BaseModel):
    """Request to preview an ArcGIS REST endpoint"""
    url: str
    layer_id: int


class GisImportPreviewFile(BaseModel):
    """Metadata for file upload preview (file sent as multipart)"""
    layer_id: int
    filename: str


class GisFieldMapping(BaseModel):
    """Field mapping from source to CADReport properties"""
    field_mapping: Dict[str, str]               # {"FLOW_RATE": "gpm", "OBJECTID": "__external_id"}
    import_options: Dict[str, Any] = {}         # Coordinate fields, filters, etc.


class GisImportExecute(BaseModel):
    """Execute an import with field mapping"""
    layer_id: int
    source_type: str                            # 'arcgis_rest', 'geojson_file', etc.
    source_url: Optional[str] = None
    field_mapping: Dict[str, str]
    import_options: Dict[str, Any] = {}
    save_config: bool = False                   # Save as reusable config
    config_name: Optional[str] = None


class GisImportPreviewResponse(BaseModel):
    """Preview response showing source metadata and sample features"""
    source_name: str
    geometry_type: str
    record_count: int
    fields: List[Dict[str, str]]                # [{"name": "FLOW_RATE", "type": "Double"}]
    sample_features: List[Dict[str, Any]]       # First N features for preview


class GisImportResult(BaseModel):
    """Result of an import execution"""
    success: bool
    features_imported: int = 0
    features_updated: int = 0
    features_skipped: int = 0
    errors: List[str] = []
    config_id: Optional[int] = None             # If save_config was true


class GisImportConfigResponse(BaseModel):
    """Saved import config returned from API"""
    id: int
    layer_id: int
    name: str
    source_type: str
    source_url: Optional[str] = None
    field_mapping: Dict[str, str] = {}
    import_options: Dict[str, Any] = {}
    auto_refresh: bool
    refresh_interval_days: Optional[int] = None
    last_refresh_at: Optional[datetime] = None
    last_refresh_status: Optional[str] = None
    last_refresh_count: Optional[int] = None
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =============================================================================
# MUTUAL AID STATIONS
# =============================================================================

class MutualAidStationCreate(BaseModel):
    """Create a mutual aid station manually"""
    name: str
    department: Optional[str] = None
    station_number: Optional[str] = None
    address: Optional[str] = None
    latitude: float
    longitude: float
    dispatch_phone: Optional[str] = None
    radio_channel: Optional[str] = None
    apparatus: List[Dict[str, Any]] = []        # [{"name": "Engine 33", "type": "engine", ...}]
    relationship: str = "mutual_aid"
    notes: Optional[str] = None


class MutualAidStationUpdate(BaseModel):
    """Update a mutual aid station"""
    name: Optional[str] = None
    department: Optional[str] = None
    station_number: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    dispatch_phone: Optional[str] = None
    radio_channel: Optional[str] = None
    apparatus: Optional[List[Dict[str, Any]]] = None
    relationship: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class MutualAidStationResponse(BaseModel):
    """Mutual aid station returned from API"""
    id: int
    name: str
    department: Optional[str] = None
    station_number: Optional[str] = None
    address: Optional[str] = None
    latitude: float
    longitude: float
    dispatch_phone: Optional[str] = None
    radio_channel: Optional[str] = None
    apparatus: List[Dict[str, Any]] = []
    external_id: Optional[str] = None
    import_source: Optional[str] = None
    relationship: str
    notes: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MutualAidImportPreview(BaseModel):
    """Request to search federal dataset for nearby stations"""
    radius_miles: float = 20.0                  # Search radius from own station
    max_results: int = 50


class MutualAidImportSelect(BaseModel):
    """Select stations from preview to import"""
    station_ids: List[str]                      # External IDs from federal dataset


# =============================================================================
# PROXIMITY / SNAPSHOT
# =============================================================================

class ProximityRequest(BaseModel):
    """Request nearby features for a location"""
    latitude: float
    longitude: float
    water_radius_meters: int = 2000             # Search radius for water sources
    include_weather: bool = True                # Fetch weather for conditional alerts


class ProximityAlert(BaseModel):
    """Single alert from proximity query"""
    alert_type: str                             # 'closure', 'hazard', 'water', 'preplan', etc.
    severity: str                               # 'critical', 'warning', 'info'
    icon: str                                   # Emoji
    title: str                                  # "Low Bridge — Fairview Rd"
    description: Optional[str] = None
    distance_meters: Optional[float] = None
    properties: Dict[str, Any] = {}             # Full feature properties
    feature_id: Optional[int] = None
    layer_type: Optional[str] = None


class ProximitySnapshot(BaseModel):
    """Full snapshot stored on incident as map_snapshot JSONB"""
    nearby_water: List[ProximityAlert] = []
    hazards: List[ProximityAlert] = []
    closures: List[ProximityAlert] = []
    address_notes: List[Dict[str, Any]] = []
    preplans: List[ProximityAlert] = []
    railroad_crossings: List[ProximityAlert] = []
    tri_facilities: List[ProximityAlert] = []
    flood_zones: List[ProximityAlert] = []
    wildfire_risk: List[ProximityAlert] = []
    boundary: Optional[str] = None              # "First Due", "Second Due", etc.
    weather: Optional[Dict[str, Any]] = None
    generated_at: Optional[datetime] = None


# =============================================================================
# ROUTE PLANNER
# =============================================================================

class RouteHazardConflict(BaseModel):
    """Hazard found along a route"""
    type: str                                   # 'closure', 'low_bridge', 'weight_limit', 'railroad_crossing'
    severity: str                               # 'hard_block', 'apparatus_block', 'awareness'
    title: str
    icon: str
    feature_id: Optional[int] = None
    properties: Dict[str, Any] = {}             # clearance_ft, weight_limit_tons, crossing_id, etc.
    distance_from_route_meters: Optional[float] = None


class RouteResult(BaseModel):
    """Single route result"""
    distance_mi: float
    duration_min: float
    polyline: str                               # Encoded polyline for map display
    hazard_conflicts: List[RouteHazardConflict] = []
    is_clear: bool = True                       # No hard blocks


class StationRouteResult(BaseModel):
    """Route result for one station"""
    station: MutualAidStationResponse
    apparatus: Optional[Dict[str, Any]] = None  # Selected apparatus specs
    primary_route: RouteResult
    alternate_route: Optional[RouteResult] = None


class RouteCalculateRequest(BaseModel):
    """Request to calculate routes from stations to destination"""
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None
    incident_id: Optional[int] = None           # Alternative: use incident coords
    station_ids: List[int]                      # Mutual aid station IDs
    apparatus_type: Optional[str] = None        # Default apparatus type for threshold lookup
    include_own_station: bool = True


class RouteCalculateResponse(BaseModel):
    """Multi-station route comparison"""
    destination: Dict[str, Any]                 # {lat, lng, address}
    routes: List[StationRouteResult]
    calculated_at: datetime


class SavedRouteAnalysis(BaseModel):
    """Saved route analysis for box alarm planning"""
    id: Optional[int] = None
    name: str
    destination: Dict[str, Any]
    routes: List[Dict[str, Any]]
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


# =============================================================================
# MAP CONFIG (frontend initialization)
# =============================================================================

class MapConfigResponse(BaseModel):
    """Configuration for frontend map initialization"""
    google_api_key_configured: bool
    enabled_features: Dict[str, bool]           # Feature flag states
    station_lat: Optional[float] = None
    station_lng: Optional[float] = None
    layers: List[MapLayerResponse] = []
