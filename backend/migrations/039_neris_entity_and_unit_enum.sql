-- Migration 039: NERIS entity registration settings + apparatus unit ID + unit enum reseed
--
-- Three parts:
--
--   Part 1: Add station registration fields to settings table (neris category)
--           All NERIS entity config lives here alongside existing credentials.
--           station_neris_id is blank until registration occurs — either we
--           create it, the tenant brings it, or we pull it from GET /entity.
--
--   Part 2: Add neris_unit_id to apparatus table (nullable, populated later)
--           Unit IDs are per-apparatus and may come from tenant, be created
--           by us during onboarding, or pulled from NERIS. Left blank until known.
--           neris_station_id is NOT stored on apparatus — it's singular per tenant
--           and lives in settings with the rest of the station config.
--
--   Part 3: Reseed neris_codes type_unit with correct TypeUnitValue enum values
--           Old values (ENGINE, RESCUE, etc.) were rejected by NERIS API.
--           Correct values confirmed from live NERIS sandbox (March 2026).


-- ============================================================================
-- PART 1: Station registration settings (neris category)
-- ============================================================================

INSERT INTO settings (category, key, value, value_type, description)
VALUES
  ('neris', 'station_neris_id',
   NULL, 'string',
   'NERIS-assigned station ID (e.g. FD09190828S001). Populated after entity registration or imported from existing NERIS account.'),

  ('neris', 'station_name',
   NULL, 'string',
   'Station name as it will appear in NERIS (e.g. Station 48). Used in entity registration payload.'),

  ('neris', 'station_address_line1',
   NULL, 'string',
   'Street address of the station (e.g. 1443 Cornog Road). Used in entity registration payload.'),

  ('neris', 'station_city',
   NULL, 'string',
   'City of the station (e.g. Glenmoore). Used in entity registration payload.'),

  ('neris', 'station_state',
   NULL, 'string',
   'Two-letter state abbreviation (e.g. PA). Used in entity registration payload.'),

  ('neris', 'station_zip',
   NULL, 'string',
   'ZIP code of the station (e.g. 19343). Used in entity registration payload.')

ON CONFLICT DO NOTHING;


-- ============================================================================
-- PART 2: neris_unit_id on apparatus
-- ============================================================================

ALTER TABLE apparatus
  ADD COLUMN IF NOT EXISTS neris_unit_id TEXT;

COMMENT ON COLUMN apparatus.neris_unit_id IS
  'NERIS-assigned unit ID (e.g. FD09190828S001U000). Nullable — populated after '
  'entity registration, tenant onboarding, or import from existing NERIS account. '
  'Station-level NERIS ID is in settings (neris.station_neris_id), not here.';


-- ============================================================================
-- PART 3: Reseed correct TypeUnitValue enum into neris_codes
-- ============================================================================

-- Wipe any old/incorrect type_unit rows before reseeding
DELETE FROM neris_codes WHERE category = 'type_unit';

INSERT INTO neris_codes (category, value, description, active) VALUES
  -- Engines
  ('type_unit', 'ENGINE_STRUCT',       'Engine (Structural)',           true),
  ('type_unit', 'ENGINE_WILDLAND',     'Engine (Wildland)',             true),
  ('type_unit', 'ENGINE_COMBO',        'Engine (Combination)',          true),
  -- Ladders / Aerials
  ('type_unit', 'LADDER_TALL',         'Ladder / Aerial',              true),
  ('type_unit', 'PLATFORM',            'Platform / Snorkel',           true),
  -- Rescue
  ('type_unit', 'RESCUE_LIGHT',        'Rescue (Light)',               true),
  ('type_unit', 'RESCUE_MEDIUM',       'Rescue (Medium)',              true),
  ('type_unit', 'RESCUE_HEAVY',        'Rescue (Heavy)',               true),
  ('type_unit', 'RESCUE_USAR',         'Rescue (USAR)',                true),
  ('type_unit', 'RESCUE_WATER',        'Rescue (Water)',               true),
  -- Tankers / Tenders
  ('type_unit', 'TENDER',              'Tanker / Tender',              true),
  -- Brush / Wildland
  ('type_unit', 'BRUSH',               'Brush / Wildland Unit',        true),
  -- EMS
  ('type_unit', 'ALS_AMB',            'ALS Ambulance',                true),
  ('type_unit', 'BLS_AMB',            'BLS Ambulance',                true),
  ('type_unit', 'MED_SUPERVISOR',      'Medical Supervisor',           true),
  -- Command / Staff
  ('type_unit', 'CHIEF_STAFF_COMMAND', 'Chief / Staff / Command',      true),
  -- Hazmat
  ('type_unit', 'HAZMAT',              'HazMat Unit',                  true),
  -- Foam / Special
  ('type_unit', 'FOAM',                'Foam Unit',                    true),
  ('type_unit', 'MOBILE_AIR',          'Mobile Air / SCBA Rehab',     true),
  -- Fire Police / Safety
  ('type_unit', 'FIRE_POLICE',         'Fire Police',                  true),
  -- Boats / Water Rescue
  ('type_unit', 'BOAT',                'Boat / Marine Unit',           true),
  -- Utility / Support
  ('type_unit', 'UTILITY',             'Utility / Service Vehicle',    true),
  -- Other
  ('type_unit', 'OTHER',               'Other',                        true);


-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT key, description
  FROM settings
 WHERE category = 'neris'
 ORDER BY key;

SELECT COUNT(*) AS unit_type_count
  FROM neris_codes
 WHERE category = 'type_unit';

SELECT column_name
  FROM information_schema.columns
 WHERE table_name = 'apparatus'
   AND column_name = 'neris_unit_id';
