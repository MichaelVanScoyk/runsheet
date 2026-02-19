-- Phase C Migration: JWT Refresh Tokens
-- Run against cadreport_master database
-- 
-- Usage: sudo -u postgres psql -d cadreport_master -f /opt/runsheet/backend/migrations/026_jwt_refresh_tokens.sql
--
-- This is ADDITIVE ONLY. No existing tables are modified or deleted.
-- The tenant_sessions table stays in parallel until JWT is proven stable.

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    
    -- Who this token belongs to
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER,                          -- Null for tenant-level auth
    auth_level VARCHAR(20) NOT NULL DEFAULT 'tenant',  -- "tenant" or "user"
    
    -- The token itself (opaque, not JWT)
    token VARCHAR(255) NOT NULL UNIQUE,
    
    -- Lifecycle
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,                   -- Null = active, set = revoked
    
    -- Context (for audit / device management)
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_info VARCHAR(200),
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for token lookup (most common query path)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- Index for cleanup queries (find expired / revoked tokens)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- Index for per-tenant token listing (admin view, revocation)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant ON refresh_tokens(tenant_id);

-- Verify
SELECT 'refresh_tokens table created successfully' AS status;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'refresh_tokens' 
ORDER BY ordinal_position;
