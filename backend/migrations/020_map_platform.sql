-- Migration 020: Map Platform
-- Creates the spatial layer system for map overlays, proximity alerting,
-- GIS import, address notes, and mutual aid station management.
-- Run this per tenant database (e.g., runsheet_gmfc2)
--
-- Prerequisites: PostGIS 3.4 extension (already installed)
--
-- Tables created:
--   1. map_layers         - Layer definitions (seeded with 13 defaults)
--   2. map_features       - Individual features within layers (PostGIS geometry)
--   3. address_notes      - Historical preplan notes tied to addresses
--   4. gis_import_configs - Saved import configurations for re-importing GIS data
--   5. mutual_aid_stations - Neighboring fire/EMS stations for routing
--
-- Also:
--   - ALTER apparatus: add clearance_height_ft, gross_weight_tons
--   - ALTER incidents: add map_snapshot JSONB
--   - INSERT 5 feature flag settings


-- =============================================================================
-- ENSURE POSTGIS EXTENSION
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS postgis;


-- =============================================================================
-- TABLE 1: map_layers
-- =============================================================================
CREATE TABLE IF NOT EXISTS map_layers (
    id              SERIAL PRIMARY KEY,
    layer_type      TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    icon            TEXT NOT NULL DEFAULT 'ℹ️',
    color           TEXT NOT NULL DEFAULT '#3B82F6',
    opacity         NUMERIC DEFAULT 0.3,
    geometry_type   TEXT NOT NULL DEFAULT 'point',
    property_schema JSONB DEFAULT '{}',
    is_system       BOOLEAN DEFAULT false,
    route_check     BOOLEAN DEFAULT false,
    sort_order      INTEGER DEFAULT 100,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- =============================================================================
-- TABLE 2: map_features
-- =============================================================================
CREATE TABLE IF NOT EXISTS map_features (
    id              SERIAL PRIMARY KEY,
    layer_id        INTEGER NOT NULL REFERENCES map_layers(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    geometry        GEOMETRY(Geometry, 4326) NOT NULL,
    radius_meters   INTEGER,
    address         TEXT,
    properties      JSONB DEFAULT '{}',
    external_id     TEXT,
    import_source   TEXT,
    imported_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Spatial index for proximity queries
CREATE INDEX IF NOT EXISTS idx_map_features_geometry
    ON map_features USING GIST (geometry);

-- Layer lookup
CREATE INDEX IF NOT EXISTS idx_map_features_layer_id
    ON map_features (layer_id);

-- GIS import dedup (unique per layer + external_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_map_features_external_id
    ON map_features (layer_id, external_id) WHERE external_id IS NOT NULL;

-- Address-based lookups
CREATE INDEX IF NOT EXISTS idx_map_features_address
    ON map_features (address) WHERE address IS NOT NULL;


-- =============================================================================
-- TABLE 3: address_notes
-- =============================================================================
CREATE TABLE IF NOT EXISTS address_notes (
    id              SERIAL PRIMARY KEY,
    address         TEXT NOT NULL,
    municipality_id INTEGER REFERENCES municipalities(id),
    incident_id     INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
    note_type       TEXT NOT NULL DEFAULT 'general',
    content         TEXT NOT NULL,
    priority        TEXT DEFAULT 'normal',
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Fast lookup by address
CREATE INDEX IF NOT EXISTS idx_address_notes_address
    ON address_notes (address);


-- =============================================================================
-- TABLE 4: gis_import_configs
-- =============================================================================
CREATE TABLE IF NOT EXISTS gis_import_configs (
    id              SERIAL PRIMARY KEY,
    layer_id        INTEGER NOT NULL REFERENCES map_layers(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    source_type     TEXT NOT NULL,
    source_url      TEXT,
    field_mapping   JSONB NOT NULL DEFAULT '{}',
    import_options  JSONB DEFAULT '{}',
    auto_refresh    BOOLEAN DEFAULT false,
    refresh_interval_days INTEGER,
    last_refresh_at TIMESTAMPTZ,
    last_refresh_status TEXT,
    last_refresh_count INTEGER,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- =============================================================================
-- TABLE 5: mutual_aid_stations
-- =============================================================================
CREATE TABLE IF NOT EXISTS mutual_aid_stations (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    department      TEXT,
    station_number  TEXT,
    address         TEXT,
    latitude        NUMERIC NOT NULL,
    longitude       NUMERIC NOT NULL,
    geometry        GEOMETRY(Point, 4326) NOT NULL,
    dispatch_phone  TEXT,
    radio_channel   TEXT,
    apparatus       JSONB DEFAULT '[]',
    external_id     TEXT,
    import_source   TEXT,
    relationship    TEXT DEFAULT 'mutual_aid',
    notes           TEXT,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Spatial index for map display
CREATE INDEX IF NOT EXISTS idx_mutual_aid_stations_geometry
    ON mutual_aid_stations USING GIST (geometry);

-- Dedup for import
CREATE UNIQUE INDEX IF NOT EXISTS idx_mutual_aid_stations_external_id
    ON mutual_aid_stations (external_id) WHERE external_id IS NOT NULL;


-- =============================================================================
-- ALTER EXISTING TABLES
-- =============================================================================

-- Apparatus: physical specs for route hazard checks
ALTER TABLE apparatus ADD COLUMN IF NOT EXISTS clearance_height_ft NUMERIC;
ALTER TABLE apparatus ADD COLUMN IF NOT EXISTS gross_weight_tons NUMERIC;

-- Incidents: proximity snapshot captured at dispatch time
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS map_snapshot JSONB;


-- =============================================================================
-- SEED: Default Layer Types (13 layers)
-- =============================================================================

-- Boundary layers
INSERT INTO map_layers (layer_type, name, icon, color, opacity, geometry_type, property_schema, is_system, sort_order)
VALUES
('boundary', 'First Due', '🟥', '#EF4444', 0.15, 'polygon', '{}', true, 10),
('boundary', 'Second Due', '🟨', '#F59E0B', 0.10, 'polygon', '{}', true, 11),
('boundary', 'Mutual Aid Zone', '🟦', '#3B82F6', 0.08, 'polygon', '{}', true, 12);

-- Water supply layers
INSERT INTO map_layers (layer_type, name, icon, color, geometry_type, property_schema, is_system, sort_order)
VALUES
('hydrant', 'Fire Hydrants', '🧱', '#DC2626', 'point',
 '{"gpm": {"type": "number", "label": "Flow Rate (GPM)"},
   "size": {"type": "text", "label": "Connection Size"},
   "hydrant_id": {"type": "text", "label": "Hydrant ID"},
   "status": {"type": "select", "label": "Status", "options": ["in_service", "out_of_service", "unknown"]},
   "last_tested": {"type": "date", "label": "Last Flow Test"},
   "notes": {"type": "text", "label": "Notes"}}',
 true, 20),

('dry_hydrant', 'Dry Hydrants', '💧', '#92400E', 'point',
 '{"condition": {"type": "select", "label": "Condition", "options": ["good", "fair", "poor", "out_of_service"]},
   "access_notes": {"type": "text", "label": "Access Notes"},
   "draft_depth_ft": {"type": "number", "label": "Draft Depth (ft)"},
   "last_inspected": {"type": "date", "label": "Last Inspected"},
   "notes": {"type": "text", "label": "Notes"}}',
 true, 21),

('draft_point', 'Drafting Points', '💧', '#2563EB', 'point',
 '{"water_source": {"type": "select", "label": "Source Type", "options": ["pond", "stream", "river", "tank", "pool", "other"]},
   "estimated_capacity": {"type": "text", "label": "Estimated Capacity"},
   "access_notes": {"type": "text", "label": "Access Notes"},
   "seasonal": {"type": "select", "label": "Seasonal Availability", "options": ["year_round", "seasonal", "drought_risk"]},
   "notes": {"type": "text", "label": "Notes"}}',
 true, 22);

-- Hazard & informational layers
INSERT INTO map_layers (layer_type, name, icon, color, geometry_type, property_schema, is_system, route_check, sort_order)
VALUES
('hazard', 'Hazards', '⚠️', '#DC2626', 'point_radius',
 '{"hazard_type": {"type": "select", "label": "Hazard Type", "options": ["low_bridge", "weight_limit", "narrow_road", "dead_end", "gated_access", "steep_grade", "other"]},
   "clearance_ft": {"type": "number", "label": "Clearance (ft)"},
   "weight_limit_tons": {"type": "number", "label": "Weight Limit (tons)"},
   "restriction": {"type": "text", "label": "Restriction Details"},
   "severity": {"type": "select", "label": "Severity", "options": ["critical", "warning", "caution"]}}',
 true, true, 30),

('informational', 'Informational Notes', 'ℹ️', '#6366F1', 'point_radius',
 '{"info_type": {"type": "text", "label": "Note Type"},
   "notes": {"type": "text", "label": "Details"}}',
 true, false, 31);

-- Closure layer (temporary — hard delete when reopened)
INSERT INTO map_layers (layer_type, name, icon, color, geometry_type, property_schema, is_system, route_check, sort_order)
VALUES
('closure', 'Road & Bridge Closures', '🚫', '#991B1B', 'point',
 '{"closure_type": {"type": "select", "label": "Closure Type", "options": ["road_closure", "bridge_closure"]},
   "closed_date": {"type": "date", "label": "Closed Since"},
   "expected_reopen": {"type": "date", "label": "Expected Reopen Date"},
   "closure_reason": {"type": "text", "label": "Reason"},
   "authority": {"type": "text", "label": "Closed By (PennDOT, township, etc.)"},
   "notes": {"type": "text", "label": "Notes"}}',
 true, true, 29);

-- Preplan layer
INSERT INTO map_layers (layer_type, name, icon, color, geometry_type, property_schema, is_system, sort_order)
VALUES
('preplan', 'Preplans', '📋', '#059669', 'point',
 '{"building_type": {"type": "select", "label": "Building Type", "options": ["residential", "commercial", "industrial", "institutional", "agricultural", "mixed_use", "other"]},
   "stories": {"type": "number", "label": "Stories"},
   "construction_type": {"type": "select", "label": "Construction", "options": ["wood_frame", "masonry", "steel", "concrete", "mixed", "other"]},
   "occupancy": {"type": "text", "label": "Typical Occupancy"},
   "key_box": {"type": "text", "label": "Key Box Location"},
   "alarm_panel": {"type": "text", "label": "Alarm Panel Location"},
   "shutoffs": {"type": "text", "label": "Utility Shutoff Locations"},
   "access_notes": {"type": "text", "label": "Access Notes"},
   "driveway_length_ft": {"type": "number", "label": "Driveway Length (ft)"},
   "contacts": {"type": "json", "label": "Emergency Contacts"},
   "notes": {"type": "text", "label": "Additional Notes"}}',
 true, 40);

-- Railroad crossings layer
INSERT INTO map_layers (layer_type, name, icon, color, geometry_type, property_schema, is_system, route_check, sort_order)
VALUES
('railroad_crossing', 'Railroad Crossings', '🚂', '#6B7280', 'point',
 '{"crossing_id": {"type": "text", "label": "FRA Crossing ID"},
   "railroad": {"type": "text", "label": "Railroad Company"},
   "street": {"type": "text", "label": "Street Name"},
   "warning_devices": {"type": "select", "label": "Warning Devices", "options": ["gates", "flashing_lights", "crossbucks_only", "stop_sign", "none", "other"]},
   "num_tracks": {"type": "number", "label": "Number of Tracks"},
   "train_speed_mph": {"type": "number", "label": "Max Train Speed (mph)"},
   "emergency_phone": {"type": "text", "label": "Railroad Emergency Phone"},
   "crossing_type": {"type": "select", "label": "Crossing Type", "options": ["at_grade", "overpass", "underpass"]},
   "notes": {"type": "text", "label": "Notes"}}',
 true, true, 32);

-- FEMA Flood zones (NOT route_check — weather-conditional alerting)
INSERT INTO map_layers (layer_type, name, icon, color, opacity, geometry_type, property_schema, is_system, sort_order)
VALUES
('flood_zone', 'FEMA Flood Zones', '🌊', '#1D4ED8', 0.15, 'polygon',
 '{"flood_zone": {"type": "select", "label": "Zone", "options": ["A", "AE", "AH", "AO", "V", "VE", "X_500", "X_minimal", "D"]},
   "zone_description": {"type": "text", "label": "Description"},
   "bfe_ft": {"type": "number", "label": "Base Flood Elevation (ft)"},
   "static_bfe": {"type": "number", "label": "Static BFE"},
   "source": {"type": "text", "label": "FIRM Panel"}}',
 true, 33);

-- EPA TRI hazmat facilities (NOT route_check — proximity alert on incident location)
INSERT INTO map_layers (layer_type, name, icon, color, geometry_type, property_schema, is_system, route_check, sort_order)
VALUES
('tri_facility', 'Hazmat Facilities (TRI)', '☣️', '#7C2D12', 'point_radius',
 '{"facility_name": {"type": "text", "label": "Facility Name"},
   "tri_id": {"type": "text", "label": "TRI Facility ID"},
   "industry": {"type": "text", "label": "Industry/NAICS"},
   "chemicals": {"type": "json", "label": "Reported Chemicals"},
   "total_releases_lbs": {"type": "number", "label": "Total Releases (lbs/yr)"},
   "top_chemicals": {"type": "text", "label": "Top Chemicals Summary"},
   "parent_company": {"type": "text", "label": "Parent Company"},
   "emergency_contact": {"type": "text", "label": "Emergency Contact"},
   "notes": {"type": "text", "label": "Notes"}}',
 true, false, 34);

-- Wildfire risk (NOT route_check — weather-conditional alerting)
INSERT INTO map_layers (layer_type, name, icon, color, opacity, geometry_type, property_schema, is_system, sort_order)
VALUES
('wildfire_risk', 'Wildfire Risk', '🔥', '#B91C1C', 0.12, 'polygon',
 '{"risk_level": {"type": "select", "label": "Risk Level", "options": ["extreme", "very_high", "high", "moderate", "low"]},
   "wui_class": {"type": "select", "label": "WUI Classification", "options": ["interface", "intermix", "non_wui"]},
   "fuel_model": {"type": "text", "label": "Fuel Model"},
   "source": {"type": "text", "label": "Data Source"},
   "notes": {"type": "text", "label": "Notes"}}',
 true, 35);

-- Fire stations (display config only — data lives in mutual_aid_stations table)
INSERT INTO map_layers (layer_type, name, icon, color, geometry_type, property_schema, is_system, sort_order)
VALUES
('mutual_aid_station', 'Fire Stations', '🏠', '#4338CA', 'point',
 '{"station_number": {"type": "text", "label": "Station Number"},
   "department": {"type": "text", "label": "Department"},
   "relationship": {"type": "select", "label": "Aid Type", "options": ["mutual_aid", "automatic_aid", "special_service", "other"]}}',
 true, 50);


-- =============================================================================
-- SEED: Feature Flag Settings
-- =============================================================================
INSERT INTO settings (category, key, value, value_type, description) VALUES
('features', 'enable_map_layers', 'true', 'boolean', 'Enable map layer management and overlays'),
('features', 'enable_gis_import', 'true', 'boolean', 'Enable GIS data import from ArcGIS/files'),
('features', 'enable_address_notes', 'true', 'boolean', 'Enable address-based preplan notes'),
('features', 'enable_proximity_alerts', 'true', 'boolean', 'Enable automatic proximity hazard/water alerts on incidents'),
('features', 'enable_mutual_aid_planner', 'true', 'boolean', 'Enable mutual aid route planner and station management');


-- =============================================================================
-- CLEANUP: Remove test file if it exists
-- =============================================================================
-- (no cleanup needed for SQL migration)
