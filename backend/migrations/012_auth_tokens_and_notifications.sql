-- Migration 012: Auth Tokens and Notification Preferences
-- Date: 2026-01-05
-- Purpose: Add password reset tokens, invitation tokens, notification preferences,
--          and pending email change fields to personnel table
--
-- Run with: psql runsheet_db < backend/migrations/012_auth_tokens_and_notifications.sql

BEGIN;

-- =============================================================================
-- PASSWORD RESET TOKENS
-- =============================================================================

-- Token for password reset emails (expires in 1 hour)
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS reset_token VARCHAR(100);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Unique index for token lookup (only on non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_reset_token 
    ON personnel(reset_token) 
    WHERE reset_token IS NOT NULL;

-- =============================================================================
-- INVITATION TOKENS
-- =============================================================================

-- Token for admin-sent invitation emails (expires in 24 hours)
-- When accepted, user is automatically activated AND approved
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS invite_token VARCHAR(100);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Unique index for token lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_invite_token 
    ON personnel(invite_token) 
    WHERE invite_token IS NOT NULL;

-- =============================================================================
-- NOTIFICATION PREFERENCES
-- =============================================================================

-- JSONB field for flexible notification settings
-- Structure: {
--   "admin_notifications": true/false,    -- Self-activation alerts, new user requests
--   "incident_notifications": true/false  -- Future: new incident alerts
-- }
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}';

-- =============================================================================
-- PENDING EMAIL CHANGE
-- =============================================================================

-- When a user requests to change their email, store the new email here
-- until they verify it via the token sent to the NEW address
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS pending_email_token VARCHAR(100);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS pending_email_expires_at TIMESTAMP WITH TIME ZONE;

-- Unique index for pending email token lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_pending_email_token 
    ON personnel(pending_email_token) 
    WHERE pending_email_token IS NOT NULL;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- =============================================================================

-- Check columns were added:
-- \d personnel

-- Expected new columns:
-- reset_token                | character varying(100)
-- reset_token_expires_at     | timestamp with time zone
-- invite_token               | character varying(100)
-- invite_token_expires_at    | timestamp with time zone
-- notification_preferences   | jsonb
-- pending_email              | character varying(255)
-- pending_email_token        | character varying(100)
-- pending_email_expires_at   | timestamp with time zone
