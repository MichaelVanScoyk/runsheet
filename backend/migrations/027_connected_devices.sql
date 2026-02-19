-- Migration 027: Connected devices table for multi-worker AV alerts tracking
-- Phase D fix: in-memory device dicts are per-worker, so admin can't see all devices.
-- This table provides a shared source of truth across all workers.
--
-- Run against each TENANT database (not cadreport_master).

CREATE TABLE IF NOT EXISTS connected_devices (
    connection_id VARCHAR(16) PRIMARY KEY,
    worker_pid INTEGER NOT NULL,
    tenant_slug VARCHAR(100) NOT NULL,
    device_type VARCHAR(50) NOT NULL DEFAULT 'unknown',
    device_name VARCHAR(200) NOT NULL DEFAULT 'Unknown',
    device_id VARCHAR(100),          -- MAC address for StationBell, NULL for browsers
    ip_address VARCHAR(45),
    user_agent TEXT,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing devices by tenant (the common query)
CREATE INDEX IF NOT EXISTS idx_connected_devices_tenant ON connected_devices(tenant_slug);

-- Index for cleanup of stale rows by worker PID
CREATE INDEX IF NOT EXISTS idx_connected_devices_worker ON connected_devices(worker_pid);
