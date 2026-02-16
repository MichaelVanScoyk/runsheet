-- 025_layer_style_columns.sql
-- Add stroke styling columns to map_layers for per-layer polygon rendering control.
-- Existing 'color' = fill color, 'opacity' = fill opacity.
-- New columns control stroke (outline) independently.

ALTER TABLE map_layers ADD COLUMN IF NOT EXISTS stroke_color TEXT DEFAULT '#333333';
ALTER TABLE map_layers ADD COLUMN IF NOT EXISTS stroke_opacity NUMERIC DEFAULT 0.8;
ALTER TABLE map_layers ADD COLUMN IF NOT EXISTS stroke_weight INTEGER DEFAULT 2;

-- Update boundary layers to sensible defaults: red outline, no fill
UPDATE map_layers
SET color = '#DC2626',
    opacity = 0,
    stroke_color = '#DC2626',
    stroke_opacity = 0.9,
    stroke_weight = 2
WHERE layer_type = 'boundary';

-- Flood zones: blue, light fill
UPDATE map_layers
SET color = '#2563EB',
    opacity = 0.15,
    stroke_color = '#2563EB',
    stroke_opacity = 0.7,
    stroke_weight = 1
WHERE layer_type = 'flood_zone';

-- Wildfire risk: orange, light fill
UPDATE map_layers
SET color = '#EA580C',
    opacity = 0.15,
    stroke_color = '#EA580C',
    stroke_opacity = 0.7,
    stroke_weight = 1
WHERE layer_type = 'wildfire_risk';
