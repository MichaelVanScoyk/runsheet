-- Migration 040: Remove unused duplicate NERIS settings keys
--
-- Two keys were seeded into settings but are never referenced in code:
--
--   fd_neris_id   — duplicate of department_neris_id (which is the live key
--                   used by neris_submit.py and builder.py for all API calls)
--
--   api_endpoint  — duplicate of environment (which is used by _get_client()
--                   in neris_submit.py to derive the correct API URL)
--
-- Neither key has any consumers in backend Python or frontend JSX.
-- Removing now before the entity service is built to keep settings clean.

DELETE FROM settings
WHERE category = 'neris'
  AND key IN ('fd_neris_id', 'api_endpoint');

-- Verify remaining neris keys
SELECT key, value, description
  FROM settings
 WHERE category = 'neris'
 ORDER BY key;
