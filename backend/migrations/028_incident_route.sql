-- Migration 028: Incident Route Data
-- Adds cached Google Directions route for station → incident display.
-- Route polyline is fetched once at geocode time and cached permanently.
--
-- route_polyline:  Google encoded polyline string (for frontend rendering)
-- route_geometry:  PostGIS LineString decoded from polyline (for spatial queries)
--
-- Future use: route_geometry enables ST_DWithin corridor queries against
-- map_features (route_check=true layers: hazards, closures, railroad crossings)

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS route_polyline TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS route_geometry GEOMETRY(LineString, 4326);

-- Spatial index for future corridor queries
CREATE INDEX IF NOT EXISTS idx_incidents_route_geometry
    ON incidents USING GIST (route_geometry)
    WHERE route_geometry IS NOT NULL;
