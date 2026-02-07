-- Migration: Create help_texts table for contextual help system
-- Run against each tenant database

CREATE TABLE IF NOT EXISTS help_texts (
    id SERIAL PRIMARY KEY,
    page_key VARCHAR(100) NOT NULL,
    element_key VARCHAR(100) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    sort_order INTEGER DEFAULT 100,
    min_role VARCHAR(20),
    is_new BOOLEAN DEFAULT FALSE,
    version_added VARCHAR(20),
    created_by INTEGER REFERENCES personnel(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page_key, element_key)
);

CREATE INDEX IF NOT EXISTS idx_help_texts_page_key ON help_texts(page_key);

-- Add help system feature flags to settings
INSERT INTO settings (category, key, value, value_type, description)
VALUES 
    ('help', 'toggle_visible', 'true', 'boolean', 'Show help toggle in sidebar'),
    ('help', 'edit_mode', 'false', 'boolean', 'Allow admins to edit help inline')
ON CONFLICT DO NOTHING;
