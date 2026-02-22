-- Migration 029: Highway Routes for Mile Marker Geocoding
-- 
-- Stores tenant-drawn highway routes (turnpikes, interstates) with known
-- mile marker reference points for interpolating GPS coordinates from
-- CAD addresses like "303.7 WB PA TPKE".
--
-- Lives in tenant database (no tenant_id needed - DB isolation per tenant)

-- Routes table (one per drawn highway segment)
CREATE TABLE IF NOT EXISTS highway_routes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,                          -- "PA Turnpike"
    bidirectional BOOLEAN DEFAULT TRUE,          -- true = serves both EB/WB
    direction TEXT,                              -- if one-way only: "WB", "EB", "NB", "SB"
    limited_access BOOLEAN DEFAULT FALSE,        -- no routing to incidents on this road
    miles_decrease_toward TEXT NOT NULL,         -- "WB", "EB", "NB", "SB" - which compass direction has lower mile markers
    mm_point_index INTEGER NOT NULL,             -- which point (by sequence) is the MM anchor
    mm_value NUMERIC(8,2) NOT NULL,              -- mile marker value at anchor (e.g., 303.00)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shape points along each route (ordered by sequence)
-- More points on curves = better interpolation accuracy
CREATE TABLE IF NOT EXISTS highway_route_points (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES highway_routes(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,                   -- order along the line (0, 1, 2, ...)
    lat NUMERIC(10,7) NOT NULL,
    lng NUMERIC(10,7) NOT NULL,
    UNIQUE(route_id, sequence)
);

-- Aliases for matching CAD address text to routes
-- CAD might send "PA TPKE", "PA TURNPIKE", "I-76", etc. for the same road
-- Aliases are learned from actual incidents when officers link unmatched addresses
CREATE TABLE IF NOT EXISTS highway_route_aliases (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES highway_routes(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,                         -- "PA TPKE", "I-76", "TURNPIKE" (stored uppercase)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(route_id, alias)
);

-- Index for fast alias lookups during address parsing
CREATE INDEX IF NOT EXISTS idx_highway_route_aliases_alias_upper 
    ON highway_route_aliases(UPPER(alias));

-- Index for loading points by route
CREATE INDEX IF NOT EXISTS idx_highway_route_points_route 
    ON highway_route_points(route_id, sequence);
