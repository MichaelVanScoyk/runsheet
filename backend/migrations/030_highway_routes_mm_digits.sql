-- Migration 030: Add mm_digits to highway_routes
--
-- Specifies how many digits appear BEFORE the decimal in mile marker numbers.
-- Used to parse CAD addresses that omit the decimal (e.g., "3037 WB PA TPKE" = 303.7)
--
-- Examples:
--   mm_digits = 3: PA Turnpike style (303.7 sent as 3037)
--   mm_digits = 2: Shorter highways (23.5 sent as 235)
--   mm_digits = 1: Very short highways (4.5 sent as 45)
--   mm_digits = NULL: No conversion needed (CAD always includes decimal)
--
-- If the address already contains a decimal, mm_digits is ignored.

ALTER TABLE highway_routes 
ADD COLUMN IF NOT EXISTS mm_digits INTEGER DEFAULT 3;

COMMENT ON COLUMN highway_routes.mm_digits IS 
    'Number of digits before decimal in mile markers. Used to parse CAD formats without decimals (3037 -> 303.7 when mm_digits=3). NULL means no conversion.';
