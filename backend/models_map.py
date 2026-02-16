"""
SQLAlchemy models for Map Platform
Migration: 020_map_platform.sql

Tables:
    - MapLayer: Layer definitions (boundary, hydrant, hazard, etc.)
    - MapFeature: Individual features within layers (PostGIS geometry)
    - AddressNote: Historical preplan notes tied to addresses
    - GisImportConfig: Saved GIS import configurations
    - MutualAidStation: Neighboring fire/EMS stations for routing

Note: PostGIS geometry columns use geoalchemy2. If geoalchemy2 is not installed,
the models still work for basic ORM operations — spatial queries use raw SQL via
ST_DWithin, ST_Contains, etc. in the proximity service.
"""

from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import TIMESTAMP, JSONB
from sqlalchemy.sql import func

from database import Base

# Try to import geoalchemy2 for geometry column type hints.
# If not installed, fall back to generic Column — spatial queries
# are done via raw SQL (text()) in the proximity service anyway.
try:
    from geoalchemy2 import Geometry
    HAS_GEOALCHEMY2 = True
except ImportError:
    HAS_GEOALCHEMY2 = False
    Geometry = None


# =============================================================================
# MAP LAYERS
# =============================================================================

class MapLayer(Base):
    """
    Layer definitions for the map platform.
    
    Each tenant gets 13 system-seeded layers (boundary, hydrant, hazard, etc.).
    Tenants can also create custom layers with their own property schemas.
    
    The property_schema JSONB defines what fields features in this layer have,
    driving dynamic form generation in the frontend FeatureEditor.
    """
    __tablename__ = "map_layers"

    id = Column(Integer, primary_key=True)
    layer_type = Column(Text, nullable=False)           # 'boundary', 'hydrant', 'hazard', etc.
    name = Column(Text, nullable=False)                 # "Fire Hydrants", "Hazards"
    description = Column(Text)
    icon = Column(Text, nullable=False, default='ℹ️')   # Emoji for map markers
    color = Column(Text, nullable=False, default='#3B82F6')  # Hex color
    opacity = Column(Numeric, default=0.3)              # Fill opacity for polygons/radius circles
    geometry_type = Column(Text, nullable=False, default='point')  # 'point', 'polygon', 'point_radius'
    property_schema = Column(JSONB, default={})         # Dynamic field definitions
    is_system = Column(Boolean, default=False)          # System-seeded vs tenant-created
    route_check = Column(Boolean, default=False)        # Check features against route polylines
    sort_order = Column(Integer, default=100)
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


# =============================================================================
# MAP FEATURES
# =============================================================================

class MapFeature(Base):
    """
    Individual items within a layer — hydrants, hazard pins, boundary polygons, etc.
    
    Geometry stored as PostGIS GEOMETRY(Geometry, 4326) — supports Point, Polygon,
    MultiPolygon. Spatial queries (ST_DWithin, ST_Contains) run against this column.
    
    Properties JSONB stores type-specific data whose schema is defined by the
    parent layer's property_schema field.
    
    External ID + layer_id unique constraint prevents duplicates on GIS re-import.
    """
    __tablename__ = "map_features"

    id = Column(Integer, primary_key=True)
    layer_id = Column(Integer, ForeignKey("map_layers.id", ondelete="CASCADE"), nullable=False)
    title = Column(Text, nullable=False)                # "Hydrant H-412", "Low Bridge Fairview Rd"
    description = Column(Text)
    # geometry column exists in DB as GEOMETRY(Geometry, 4326)
    # Accessed via raw SQL for spatial operations
    radius_meters = Column(Integer)                     # Alert radius for point_radius features
    address = Column(Text)                              # Optional address association
    properties = Column(JSONB, default={})              # Type-specific data
    external_id = Column(Text)                          # Source system ID for import dedup
    import_source = Column(Text)                        # "chester_county_gis", "manual", "file_upload"
    imported_at = Column(TIMESTAMP(timezone=True))
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


# =============================================================================
# ADDRESS NOTES
# =============================================================================

class AddressNote(Base):
    """
    Historical preplan notes tied to specific addresses.
    
    Separate from map_features because these are address-keyed (not map-pin-keyed)
    and accumulate over time from incident responses. Looked up by normalized
    address during proximity queries.
    
    Note types: 'water_supply', 'access', 'hazard', 'preplan', 'general'
    Priority: 'critical', 'high', 'normal', 'low'
    """
    __tablename__ = "address_notes"

    id = Column(Integer, primary_key=True)
    address = Column(Text, nullable=False)              # Normalized: "1710 CREEK RD"
    municipality_id = Column(Integer, ForeignKey("municipalities.id"))
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="SET NULL"))
    note_type = Column(Text, nullable=False, default='general')
    content = Column(Text, nullable=False)
    priority = Column(Text, default='normal')
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


# =============================================================================
# GIS IMPORT CONFIGS
# =============================================================================

class GisImportConfig(Base):
    """
    Saved import configurations for re-importing GIS data from external sources.
    
    Supports ArcGIS REST API, GeoJSON, KML, Shapefile, and CSV imports.
    Field mapping maps source field names to CADReport property names.
    Special keys: __external_id -> map_features.external_id,
                  __title -> map_features.title,
                  __description -> map_features.description
    
    Auto-refresh allows periodic re-import from ArcGIS REST endpoints.
    """
    __tablename__ = "gis_import_configs"

    id = Column(Integer, primary_key=True)
    layer_id = Column(Integer, ForeignKey("map_layers.id", ondelete="CASCADE"), nullable=False)
    name = Column(Text, nullable=False)                 # "Chester County Hydrants"
    source_type = Column(Text, nullable=False)          # 'arcgis_rest', 'geojson_file', etc.
    source_url = Column(Text)                           # ArcGIS REST endpoint URL
    field_mapping = Column(JSONB, nullable=False, default={})
    import_options = Column(JSONB, default={})
    auto_refresh = Column(Boolean, default=False)
    refresh_interval_days = Column(Integer)
    last_refresh_at = Column(TIMESTAMP(timezone=True))
    last_refresh_status = Column(Text)                  # 'success', 'failed', 'partial'
    last_refresh_count = Column(Integer)
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())


# =============================================================================
# MUTUAL AID STATIONS
# =============================================================================

class MutualAidStation(Base):
    """
    Neighboring fire/EMS stations used as routing origins in the route planner.
    
    Populated from USGS/HIFLD fire station dataset (tenant picks relevant ones)
    and/or manual entry. The mutual_aid_station entry in map_layers provides
    display config (icon, color, visibility toggle) only — no features are stored
    in map_features for this layer type. This table is the single source of truth.
    
    Apparatus JSONB stores known units with physical specs for route hazard checks:
    [{"name": "Engine 33", "type": "engine", "clearance_height_ft": 11.0, "gross_weight_tons": 30.0}]
    When empty, route checks use conservative defaults per apparatus type.
    
    Relationship types: 'mutual_aid', 'automatic_aid', 'special_service', 'other'
    """
    __tablename__ = "mutual_aid_stations"

    id = Column(Integer, primary_key=True)
    name = Column(Text, nullable=False)                 # "Elverson Fire Co Station 33"
    department = Column(Text)
    station_number = Column(Text)
    address = Column(Text)
    latitude = Column(Numeric, nullable=False)
    longitude = Column(Numeric, nullable=False)
    # geometry column exists in DB as GEOMETRY(Point, 4326)
    # Accessed via raw SQL for spatial operations
    dispatch_phone = Column(Text)
    radio_channel = Column(Text)
    apparatus = Column(JSONB, default=[])
    external_id = Column(Text)                          # HIFLD/USGS feature ID for dedup
    import_source = Column(Text)                        # "hifld", "usgs", "manual"
    relationship = Column(Text, default='mutual_aid')
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.current_timestamp())
