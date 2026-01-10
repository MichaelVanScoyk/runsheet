"""
Review Tasks Router - Shared notification/task queue for officer/admin attention

=============================================================================
REVIEW TASKS SYSTEM - IMPLEMENTATION GUIDE
=============================================================================

This module provides a centralized task/notification queue for items requiring
officer or admin attention. Use this system when you need to flag something
for human review.

WHEN TO CREATE A REVIEW TASK:
-----------------------------
1. System detected an anomaly that needs human verification
2. Automated process made changes that should be reviewed
3. Data requires manual categorization or validation
4. Incident flagged for officer review

CURRENT TASK TYPES:
-------------------
- 'personnel_reconciliation': Personnel assigned to unit not in CAD CLEAR
- 'comcat_review': CAD comments need officer categorization review
- 'neris_validation': (future) Incident missing required NERIS fields
- 'out_of_sequence': (future) Incident number doesn't match date order

ADDING A NEW TASK TYPE:
-----------------------
1. Add the type string to the valid_types list in create_review_task()
2. Document the type in this header and the migration file
3. If the type needs special resolution UI, update ReviewTasksBadge.jsx
4. Consider if you need required_action for mandatory resolution steps

HOW TO CREATE TASKS FROM OTHER MODULES:
---------------------------------------
Option 1 - Use the helper function (recommended):

    from routers.review_tasks import create_review_task_for_incident
    
    create_review_task_for_incident(
        db=db,
        incident_id=incident.id,
        task_type='personnel_reconciliation',
        title='Personnel on non-responding unit',
        description='3 personnel assigned to ENG485 which was not on CAD CLEAR',
        metadata={
            'unit': 'ENG485',
            'personnel_ids': [1, 2, 3],
            'moved_to': 'STATION'
        },
        priority='normal',
        required_action={
            'action_type': 'confirm_personnel_move',
            'details': {'from_unit': 'ENG485', 'to_unit': 'STATION'}
        }
    )
    db.commit()  # Don't forget to commit!

Option 2 - Direct model creation:

    from models import ReviewTask
    
    task = ReviewTask(
        task_type='comcat_review',
        entity_type='incident',
        entity_id=incident.id,
        title='CAD comments need review',
        description='15 comments require categorization',
        metadata={'comment_count': 15},
        priority='normal',
        status='pending'
    )
    db.add(task)
    db.commit()

METADATA FIELD GUIDELINES:
--------------------------
Use metadata to store structured data that:
- Helps the frontend render appropriate UI
- Provides context for resolution
- Can be used for filtering/reporting

Common metadata patterns:
- personnel_ids: [1, 2, 3] - List of affected personnel
- unit: 'ENG485' - Unit designator involved
- moved_to: 'STATION' - Where personnel were moved
- comment_count: 15 - Count of items to review
- original_value: '...' - Before state
- new_value: '...' - After state

REQUIRED_ACTION FIELD:
----------------------
Use when resolution requires a specific action, not just acknowledgment.

Structure:
{
    "action_type": "confirm_personnel_move",  # Unique action identifier
    "details": {                               # Action-specific data
        "from_unit": "ENG485",
        "to_unit": "STATION",
        "personnel": [{"id": 1, "name": "Smith, John"}, ...]
    }
}

The frontend can check action_type to render custom resolution UI.

PRIORITY GUIDELINES:
--------------------
- 'high': Affects incident accuracy, needs immediate attention
- 'normal': Should be reviewed soon, but not urgent
- 'low': Can be reviewed during regular maintenance

RESOLUTION FLOW:
----------------
1. Task appears in ReviewTasksBadge dropdown
2. Officer/Admin clicks to view incident
3. Reviews the issue described in title/description
4. If required_action exists, completes that action
5. Calls resolve or dismiss endpoint with notes
6. Task removed from pending count

API ENDPOINTS SUMMARY:
----------------------
GET  /api/review-tasks              - List with filters (status, task_type, etc.)
GET  /api/review-tasks/count        - Pending count for sidebar badge
GET  /api/review-tasks/grouped      - Tasks grouped by incident for dropdown
GET  /api/review-tasks/{id}         - Single task with full details
POST /api/review-tasks              - Create new task (for admin/testing)
POST /api/review-tasks/{id}/resolve - Mark resolved with notes
POST /api/review-tasks/{id}/dismiss - Dismiss without full resolution
POST /api/review-tasks/resolve-for-incident/{id} - Bulk resolve for incident

=============================================================================
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel
import logging

from database import get_db
from models import ReviewTask, Personnel, Incident

# Import UTC formatting helper
try:
    from settings_helper import format_utc_iso
except ImportError:
    def format_utc_iso(dt):
        if dt is None:
            return None
        if hasattr(dt, 'isoformat'):
            iso = dt.isoformat()
            if not iso.endswith('Z') and '+' not in iso:
                iso += 'Z'
            return iso
        return str(dt)

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# VALID TASK TYPES
# Add new task types here when extending the system
# =============================================================================

VALID_TASK_TYPES = [
    'personnel_reconciliation',  # Personnel on unit not in CAD CLEAR
    'incomplete_narrative',      # Narrative field empty on close
    'comcat_review',             # CAD comments need categorization
    'neris_validation',          # Missing required NERIS fields
    'out_of_sequence',           # Incident number doesn't match date order
]


# =============================================================================
# SCHEMAS
# =============================================================================

class ReviewTaskCreate(BaseModel):
    """
    Schema for creating a new review task.
    
    Example:
        {
            "task_type": "personnel_reconciliation",
            "entity_type": "incident",
            "entity_id": 123,
            "title": "Personnel on non-responding unit",
            "description": "3 personnel assigned to ENG485...",
            "metadata": {"unit": "ENG485", "personnel_ids": [1, 2, 3]},
            "priority": "normal",
            "required_action": null
        }
    """
    task_type: str
    entity_type: str
    entity_id: int
    title: str
    description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    priority: str = 'normal'
    required_action: Optional[Dict[str, Any]] = None
    created_by: Optional[int] = None


class ReviewTaskResolve(BaseModel):
    """
    Schema for resolving a review task.
    
    Example:
        {
            "resolution_notes": "Confirmed personnel moved to STATION",
            "resolved_by": 5
        }
    """
    resolution_notes: Optional[str] = None
    resolved_by: int


class ReviewTaskDismiss(BaseModel):
    """
    Schema for dismissing a review task.
    Use when task is acknowledged but not fully resolved.
    
    Example:
        {
            "resolution_notes": "False alarm - data entry error",
            "resolved_by": 5
        }
    """
    resolution_notes: Optional[str] = None
    resolved_by: int


# =============================================================================
# LIST / GET TASKS
# =============================================================================

@router.get("")
async def list_review_tasks(
    status: Optional[str] = Query(None, description="Filter by status: pending, resolved, dismissed"),
    task_type: Optional[str] = Query(None, description="Filter by task type"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type (e.g., 'incident')"),
    entity_id: Optional[int] = Query(None, description="Filter by specific entity ID"),
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    List review tasks with optional filters.
    
    Default behavior: Returns pending tasks, sorted by priority then newest first.
    
    Use cases:
    - Sidebar badge: GET /api/review-tasks (pending only)
    - History view: GET /api/review-tasks?status=resolved
    - Incident detail: GET /api/review-tasks?entity_type=incident&entity_id=123
    """
    query = db.query(ReviewTask)
    
    # Default to pending if no status specified
    if status:
        query = query.filter(ReviewTask.status == status)
    else:
        query = query.filter(ReviewTask.status == 'pending')
    
    if task_type:
        query = query.filter(ReviewTask.task_type == task_type)
    
    if entity_type:
        query = query.filter(ReviewTask.entity_type == entity_type)
    
    if entity_id:
        query = query.filter(ReviewTask.entity_id == entity_id)
    
    # Order by priority (high first), then by created_at (newest first)
    query = query.order_by(
        text("CASE priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END"),
        ReviewTask.created_at.desc()
    )
    
    total = query.count()
    tasks = query.offset(offset).limit(limit).all()
    
    return {
        "total": total,
        "tasks": [_format_task(t, db) for t in tasks]
    }


@router.get("/count")
async def get_pending_count(
    db: Session = Depends(get_db)
):
    """
    Get count of pending review tasks.
    
    Used by: ReviewTasksBadge component for sidebar badge number.
    Refreshed every 30 seconds by frontend.
    """
    count = db.query(ReviewTask).filter(ReviewTask.status == 'pending').count()
    return {"pending_count": count}


@router.get("/grouped")
async def get_tasks_grouped_by_incident(
    status: str = 'pending',
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db)
):
    """
    Get review tasks grouped by incident for sidebar dropdown.
    
    Returns structure optimized for ReviewTasksBadge dropdown:
    {
        "incidents": [
            {
                "incident_id": 123,
                "incident_number": "F260007",
                "incident_address": "123 Main St",
                "tasks": [
                    {"id": 1, "task_type": "...", "title": "...", "priority": "..."},
                    ...
                ]
            },
            ...
        ]
    }
    
    Used by: ReviewTasksBadge dropdown component
    """
    # Get tasks filtered by status
    tasks = db.query(ReviewTask).filter(
        ReviewTask.status == status,
        ReviewTask.entity_type == 'incident'
    ).order_by(
        text("CASE priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END"),
        ReviewTask.created_at.desc()
    ).limit(limit * 5).all()  # Get more than needed since we'll group
    
    # Group by incident
    incidents_map = {}
    for task in tasks:
        incident_id = task.entity_id
        if incident_id not in incidents_map:
            # Fetch incident details
            incident = db.query(Incident).filter(Incident.id == incident_id).first()
            if incident:
                incidents_map[incident_id] = {
                    "incident_id": incident_id,
                    "incident_number": incident.internal_incident_number,
                    "incident_address": incident.address,
                    "incident_date": incident.incident_date.isoformat() if incident.incident_date else None,
                    "tasks": []
                }
        
        if incident_id in incidents_map:
            incidents_map[incident_id]["tasks"].append({
                "id": task.id,
                "task_type": task.task_type,
                "title": task.title,
                "priority": task.priority,
                "created_at": format_utc_iso(task.created_at),
            })
    
    # Convert to list and limit
    result = list(incidents_map.values())[:limit]
    
    return {
        "total_incidents": len(result),
        "total_tasks": sum(len(inc["tasks"]) for inc in result),
        "incidents": result
    }


@router.get("/{task_id}")
async def get_review_task(
    task_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a single review task by ID with full details.
    
    Includes entity_details with incident information if entity_type is 'incident'.
    Used for detailed task view / resolution UI.
    """
    task = db.query(ReviewTask).filter(ReviewTask.id == task_id).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Review task not found")
    
    return _format_task(task, db, include_entity_details=True)


# =============================================================================
# CREATE TASK
# =============================================================================

@router.post("")
async def create_review_task(
    data: ReviewTaskCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new review task.
    
    Primarily used for testing/admin. In production, use the helper function
    create_review_task_for_incident() from backend code.
    """
    
    # Validate task_type
    if data.task_type not in VALID_TASK_TYPES:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid task_type. Must be one of: {VALID_TASK_TYPES}"
        )
    
    # Validate priority
    if data.priority not in ['low', 'normal', 'high']:
        data.priority = 'normal'
    
    task = ReviewTask(
        task_type=data.task_type,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        title=data.title,
        description=data.description,
        task_metadata=data.metadata or {},
        priority=data.priority,
        required_action=data.required_action,
        created_by=data.created_by,
        status='pending',
    )
    
    db.add(task)
    db.commit()
    db.refresh(task)
    
    logger.info(f"Review task created: {task.task_type} for {task.entity_type}:{task.entity_id}")
    
    return {"status": "ok", "id": task.id}


# =============================================================================
# RESOLVE / DISMISS TASK
# =============================================================================

@router.post("/{task_id}/resolve")
async def resolve_review_task(
    task_id: int,
    data: ReviewTaskResolve,
    db: Session = Depends(get_db)
):
    """
    Resolve a review task.
    
    Call this after the issue has been addressed. If the task has required_action,
    that action should be completed before calling this endpoint.
    
    The resolved_by field should be the personnel_id of the logged-in user.
    """
    task = db.query(ReviewTask).filter(ReviewTask.id == task_id).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Review task not found")
    
    if task.status != 'pending':
        raise HTTPException(status_code=400, detail=f"Task already {task.status}")
    
    task.status = 'resolved'
    task.resolved_by = data.resolved_by
    task.resolved_at = datetime.now(timezone.utc)
    task.resolution_notes = data.resolution_notes
    
    db.commit()
    
    logger.info(f"Review task {task_id} resolved by personnel {data.resolved_by}")
    
    return {"status": "ok", "id": task_id}


@router.post("/{task_id}/dismiss")
async def dismiss_review_task(
    task_id: int,
    data: ReviewTaskDismiss,
    db: Session = Depends(get_db)
):
    """
    Dismiss a review task without fully resolving it.
    
    Use for tasks that:
    - Were created in error
    - Are no longer relevant
    - Cannot be resolved but should be acknowledged
    
    The task is still logged and can be viewed in history.
    """
    task = db.query(ReviewTask).filter(ReviewTask.id == task_id).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Review task not found")
    
    if task.status != 'pending':
        raise HTTPException(status_code=400, detail=f"Task already {task.status}")
    
    task.status = 'dismissed'
    task.resolved_by = data.resolved_by
    task.resolved_at = datetime.now(timezone.utc)
    task.resolution_notes = data.resolution_notes
    
    db.commit()
    
    logger.info(f"Review task {task_id} dismissed by personnel {data.resolved_by}")
    
    return {"status": "ok", "id": task_id}


# =============================================================================
# BULK OPERATIONS
# =============================================================================

@router.post("/resolve-for-incident/{incident_id}")
async def resolve_tasks_for_incident(
    incident_id: int,
    data: ReviewTaskResolve,
    task_type: Optional[str] = Query(None, description="Only resolve specific task type"),
    db: Session = Depends(get_db)
):
    """
    Resolve all pending tasks for a specific incident.
    
    Useful when an incident is fully reviewed and all associated tasks
    can be marked resolved at once.
    
    Optionally filter by task_type to only resolve specific types.
    """
    query = db.query(ReviewTask).filter(
        ReviewTask.entity_type == 'incident',
        ReviewTask.entity_id == incident_id,
        ReviewTask.status == 'pending'
    )
    
    if task_type:
        query = query.filter(ReviewTask.task_type == task_type)
    
    tasks = query.all()
    
    now = datetime.now(timezone.utc)
    for task in tasks:
        task.status = 'resolved'
        task.resolved_by = data.resolved_by
        task.resolved_at = now
        task.resolution_notes = data.resolution_notes
    
    db.commit()
    
    logger.info(f"Resolved {len(tasks)} tasks for incident {incident_id}")
    
    return {"status": "ok", "resolved_count": len(tasks)}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _format_task(task: ReviewTask, db: Session, include_entity_details: bool = False) -> dict:
    """
    Format a review task for API response.
    
    Internal helper - not part of public API.
    """
    result = {
        "id": task.id,
        "task_type": task.task_type,
        "entity_type": task.entity_type,
        "entity_id": task.entity_id,
        "title": task.title,
        "description": task.description,
        "metadata": task.task_metadata,
        "status": task.status,
        "priority": task.priority,
        "required_action": task.required_action,
        "resolved_by": task.resolved_by,
        "resolved_at": format_utc_iso(task.resolved_at),
        "resolution_notes": task.resolution_notes,
        "created_at": format_utc_iso(task.created_at),
        "created_by": task.created_by,
    }
    
    # Add resolver name if resolved
    if task.resolved_by:
        resolver = db.query(Personnel).filter(Personnel.id == task.resolved_by).first()
        if resolver:
            result["resolved_by_name"] = f"{resolver.last_name}, {resolver.first_name}"
    
    # Add entity details if requested
    if include_entity_details and task.entity_type == 'incident':
        incident = db.query(Incident).filter(Incident.id == task.entity_id).first()
        if incident:
            result["entity_details"] = {
                "incident_number": incident.internal_incident_number,
                "address": incident.address,
                "incident_date": incident.incident_date.isoformat() if incident.incident_date else None,
                "status": incident.status,
            }
    
    return result


# =============================================================================
# HELPER FUNCTION FOR OTHER MODULES
# =============================================================================

def create_review_task_for_incident(
    db: Session,
    incident_id: int,
    task_type: str,
    title: str,
    description: str = None,
    metadata: dict = None,
    priority: str = 'normal',
    required_action: dict = None,
    created_by: int = None
) -> ReviewTask:
    """
    Helper function for other modules to create review tasks.
    
    USE THIS when creating tasks from backend code (e.g., CAD processor,
    incident close handler, etc.)
    
    IMPORTANT: This function calls db.flush() but NOT db.commit().
    You must commit the transaction in your calling code.
    
    Parameters:
    -----------
    db : Session
        SQLAlchemy database session
    incident_id : int
        ID of the incident this task relates to
    task_type : str
        One of: 'personnel_reconciliation', 'comcat_review', 'neris_validation', 'out_of_sequence'
    title : str
        Short title shown in badge dropdown (max 200 chars)
    description : str, optional
        Longer description with full details
    metadata : dict, optional
        Structured data for frontend/reporting. Common keys:
        - personnel_ids: list of affected personnel IDs
        - unit: unit designator involved
        - moved_to: where personnel were moved
    priority : str
        'low', 'normal', or 'high'. Default 'normal'
    required_action : dict, optional
        If set, resolver must complete this action. Structure:
        {"action_type": "...", "details": {...}}
    created_by : int, optional
        Personnel ID of who/what created this task
    
    Returns:
    --------
    ReviewTask
        The created task object (already flushed to get ID)
    
    Example:
    --------
    from routers.review_tasks import create_review_task_for_incident
    
    task = create_review_task_for_incident(
        db=db,
        incident_id=incident.id,
        task_type='personnel_reconciliation',
        title='Personnel on non-responding unit',
        description='3 personnel assigned to ENG485 which was not on CAD CLEAR',
        metadata={
            'unit': 'ENG485',
            'personnel_ids': [1, 2, 3],
            'moved_to': 'STATION',
            'personnel_names': ['Smith, John', 'Doe, Jane', 'Brown, Bob']
        },
        priority='normal'
    )
    
    # Don't forget to commit!
    db.commit()
    
    print(f"Created task {task.id}")
    """
    # Validate task_type
    if task_type not in VALID_TASK_TYPES:
        raise ValueError(f"Invalid task_type '{task_type}'. Must be one of: {VALID_TASK_TYPES}")
    
    # Validate priority
    if priority not in ['low', 'normal', 'high']:
        priority = 'normal'
    
    task = ReviewTask(
        task_type=task_type,
        entity_type='incident',
        entity_id=incident_id,
        title=title,
        description=description,
        task_metadata=metadata or {},
        priority=priority,
        required_action=required_action,
        created_by=created_by,
        status='pending',
    )
    
    db.add(task)
    db.flush()  # Get ID without committing - caller must commit
    
    logger.info(f"Review task created: {task_type} for incident:{incident_id} (task_id={task.id})")
    
    return task
