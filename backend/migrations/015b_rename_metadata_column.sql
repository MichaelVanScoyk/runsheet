-- Migration 015b: Rename metadata column to task_metadata
-- 'metadata' is a reserved attribute name in SQLAlchemy
--
-- Run: sudo -u postgres psql runsheet_db < backend/migrations/015b_rename_metadata_column.sql

-- Rename the column (safe - just renames, doesn't lose data)
ALTER TABLE review_tasks RENAME COLUMN metadata TO task_metadata;

-- Verify
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'review_tasks' AND column_name = 'task_metadata';
