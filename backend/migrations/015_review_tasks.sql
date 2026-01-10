-- Migration 015: Review Tasks System
-- Shared notification/task queue for items requiring officer/admin attention
--
-- Run: sudo -u postgres psql runsheet_db < backend/migrations/015_review_tasks.sql
--
-- =============================================================================
-- REVIEW TASKS SYSTEM OVERVIEW
-- =============================================================================
--
-- PURPOSE:
-- A centralized task/notification queue for items that need officer or admin
-- attention. Multiple system processes can create tasks, and authorized 
-- personnel can resolve or dismiss them through a unified interface.
--
-- TASK TYPES (extend as needed):
--   'personnel_reconciliation' - Personnel assigned to unit not in CAD CLEAR
--   'comcat_review'           - CAD comments need officer categorization review
--   'neris_validation'        - Incident missing required NERIS fields (future)
--   'out_of_sequence'         - Incident number doesn't match date order (future)
--
-- VISIBILITY:
--   - Officers (role='OFFICER') can view and resolve tasks
--   - Admins (role='ADMIN') can view and resolve tasks
--   - Members cannot see review tasks
--
-- RESOLUTION WORKFLOW:
--   1. Task created with status='pending'
--   2. Officer/Admin reviews the task
--   3. If required_action is set, perform that action first
--   4. Call /resolve or /dismiss endpoint with resolution_notes
--   5. Task marked resolved/dismissed with timestamp and resolver
--
-- FRONTEND INTEGRATION:
--   - ReviewTasksBadge component in sidebar shows pending count
--   - Dropdown shows tasks grouped by incident
--   - Clicking incident navigates to that incident
--   - Badge refreshes every 30 seconds
--
-- API ENDPOINTS:
--   GET  /api/review-tasks              - List tasks (default: pending)
--   GET  /api/review-tasks/count        - Get pending count for badge
--   GET  /api/review-tasks/grouped      - Get tasks grouped by incident
--   GET  /api/review-tasks/{id}         - Get single task with details
--   POST /api/review-tasks              - Create new task
--   POST /api/review-tasks/{id}/resolve - Mark task as resolved
--   POST /api/review-tasks/{id}/dismiss - Dismiss task (still logged)
--   POST /api/review-tasks/resolve-for-incident/{id} - Bulk resolve
--
-- HELPER FUNCTION (for backend modules):
--   from routers.review_tasks import create_review_task_for_incident
--   
--   create_review_task_for_incident(
--       db=db,
--       incident_id=incident.id,
--       task_type='personnel_reconciliation',
--       title='Personnel on non-responding unit',
--       description='Detailed explanation...',
--       metadata={'unit': 'ENG485', 'personnel_ids': [1, 2, 3]},
--       priority='normal',  # 'low', 'normal', 'high'
--       required_action={'action_type': 'confirm_move', 'details': {...}}
--   )
--
-- =============================================================================

-- =============================================================================
-- REVIEW TASKS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS review_tasks (
    id SERIAL PRIMARY KEY,
    
    -- =======================================================================
    -- WHAT NEEDS REVIEW
    -- These fields identify what the task is about
    -- =======================================================================
    
    -- Task type - defines the category of review needed
    -- Use consistent values: 'personnel_reconciliation', 'comcat_review', etc.
    task_type VARCHAR(50) NOT NULL,
    
    -- Entity reference - what object this task relates to
    -- entity_type: 'incident', 'personnel', 'apparatus', etc.
    -- entity_id: the ID in that entity's table
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER NOT NULL,
    
    -- =======================================================================
    -- HUMAN-READABLE DETAILS
    -- These are displayed in the UI
    -- =======================================================================
    
    -- Short title shown in badge dropdown and task list
    -- Example: "Personnel on non-responding unit"
    title VARCHAR(200) NOT NULL,
    
    -- Longer description with full details
    -- Example: "3 personnel were assigned to ENG485 which was not in the CAD CLEAR data"
    description TEXT,
    
    -- Structured data for programmatic use (named task_metadata because 'metadata' is reserved in SQLAlchemy)
    -- Store any data needed for resolution or display
    -- Example: {"unit": "ENG485", "personnel_ids": [1, 2, 3], "moved_to": "STATION"}
    task_metadata JSONB DEFAULT '{}',
    
    -- =======================================================================
    -- STATUS TRACKING
    -- =======================================================================
    
    -- Current status of the task
    -- 'pending'  - Needs attention (shown in badge count)
    -- 'resolved' - Successfully addressed
    -- 'dismissed' - Acknowledged but not fully resolved (still logged)
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    
    -- Priority affects sort order in UI
    -- 'high'   - Sorted first, may have visual emphasis
    -- 'normal' - Standard priority
    -- 'low'    - Sorted last
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    
    -- =======================================================================
    -- REQUIRED ACTION (Optional)
    -- For tasks that need specific actions before resolution
    -- =======================================================================
    
    -- If set, the resolver must complete this action
    -- Structure: {
    --   "action_type": "confirm_personnel_move",  -- Type of action required
    --   "details": {...}                          -- Action-specific data
    -- }
    -- The frontend can render action-specific UI based on action_type
    required_action JSONB,
    
    -- =======================================================================
    -- RESOLUTION TRACKING
    -- =======================================================================
    
    -- Who resolved/dismissed this task
    resolved_by INTEGER REFERENCES personnel(id),
    
    -- When it was resolved/dismissed
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Notes from the resolver explaining the resolution
    resolution_notes TEXT,
    
    -- =======================================================================
    -- AUDIT FIELDS
    -- =======================================================================
    
    -- When this task was created
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Who/what created this task (may be null for system-generated)
    created_by INTEGER REFERENCES personnel(id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Fast lookup of pending tasks (most common query)
CREATE INDEX IF NOT EXISTS idx_review_tasks_status ON review_tasks(status);

-- Filter by task type
CREATE INDEX IF NOT EXISTS idx_review_tasks_type ON review_tasks(task_type);

-- Find all tasks for a specific entity (e.g., all tasks for incident 123)
CREATE INDEX IF NOT EXISTS idx_review_tasks_entity ON review_tasks(entity_type, entity_id);

-- Sort by newest first
CREATE INDEX IF NOT EXISTS idx_review_tasks_created ON review_tasks(created_at DESC);

-- =============================================================================
-- VERIFY
-- =============================================================================

SELECT 'review_tasks table created' AS status;
\d review_tasks
