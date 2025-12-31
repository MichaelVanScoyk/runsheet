"""
ComCat Router - CAD Comment Categorizer API
Created: 2025-12-31

Provides API endpoints for:
- Viewing comment categorizations for an incident
- Officer corrections to categories (training data)
- Model retraining
- Training statistics

All officer corrections are stored in the cad_event_comments JSONB field
with category_source="OFFICER", which then feeds into ML retraining.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import text
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import logging
import json

from database import get_db
from models import Incident, Personnel, AuditLog

# Import ComCat components
import sys
import os
# Add /opt/runsheet to path (3 levels up from backend/routers/comcat.py)
_project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

try:
    from cad.comcat_seeds import VALID_CATEGORIES, CATEGORY_INFO
    from cad.comcat_model import (
        get_model, retrain_model, ComCatModel,
        CONFIDENCE_THRESHOLD, SKLEARN_AVAILABLE
    )
    from cad.comment_processor import (
        get_comments_needing_review,
        get_comments_by_category,
        get_training_data_from_comments
    )
    COMCAT_AVAILABLE = True
except ImportError as e:
    COMCAT_AVAILABLE = False
    VALID_CATEGORIES = ["CALLER", "TACTICAL", "OPERATIONS", "UNIT", "OTHER"]
    CATEGORY_INFO = {}
    CONFIDENCE_THRESHOLD = 0.50
    SKLEARN_AVAILABLE = False

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/comcat", tags=["comcat"])


# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

class CommentCategory(BaseModel):
    """Single comment category update"""
    index: int = Field(..., description="Index of comment in comments array")
    category: str = Field(..., description="New category (CALLER, TACTICAL, OPERATIONS, UNIT, OTHER)")


class CategoryUpdateRequest(BaseModel):
    """Request to update comment categories"""
    updates: List[CommentCategory]
    edited_by: Optional[int] = Field(None, description="Personnel ID of officer making corrections")


class CategoryUpdateResponse(BaseModel):
    """Response from category update"""
    success: bool
    updated_count: int
    incident_number: str
    message: str


class RetrainRequest(BaseModel):
    """Request to retrain ML model"""
    force: bool = Field(False, description="Force retrain even if recently trained")


class RetrainResponse(BaseModel):
    """Response from model retraining"""
    success: bool
    total_examples: int
    seed_examples: int
    officer_examples: int
    cv_accuracy: Optional[float]
    trained_at: str
    message: str


class CommentResponse(BaseModel):
    """Single comment with category info"""
    index: int
    time: str
    time_iso: Optional[str]
    operator: str
    operator_type: str
    text: str
    is_noise: bool
    category: str
    category_source: str
    category_confidence: Optional[float]
    needs_review: bool


class IncidentCommentsResponse(BaseModel):
    """All comments for an incident"""
    incident_id: int
    incident_number: str
    comments: List[CommentResponse]
    review_count: int
    categories_available: List[Dict[str, Any]]
    ml_available: bool
    confidence_threshold: float


class TrainingStatsResponse(BaseModel):
    """ML model training statistics"""
    ml_available: bool
    sklearn_installed: bool
    model_trained: bool
    total_training_examples: int
    seed_examples: int
    officer_examples: int
    cv_accuracy: Optional[float]
    last_trained_at: Optional[str]
    confidence_threshold: float
    category_counts: Dict[str, int]


# =============================================================================
# AUDIT LOGGING
# =============================================================================

def log_comcat_audit(
    db: Session,
    action: str,
    incident: Incident,
    edited_by_id: Optional[int],
    summary: str,
    details: Optional[dict] = None
):
    """Log ComCat changes to audit trail."""
    personnel_name = None
    if edited_by_id:
        person = db.query(Personnel).filter(Personnel.id == edited_by_id).first()
        if person:
            personnel_name = f"{person.last_name}, {person.first_name}"
    
    log_entry = AuditLog(
        personnel_id=edited_by_id,
        personnel_name=personnel_name or "System",
        action=action,
        entity_type="incident_comments",
        entity_id=incident.id,
        entity_display=f"Incident {incident.internal_incident_number}",
        summary=summary,
        fields_changed=details,
    )
    db.add(log_entry)


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/categories")
def get_categories():
    """
    Get available comment categories with metadata.
    
    Returns category list with labels, colors, and descriptions for UI.
    """
    categories = []
    for cat in VALID_CATEGORIES:
        info = CATEGORY_INFO.get(cat, {})
        categories.append({
            "value": cat,
            "label": info.get("label", cat.title()),
            "description": info.get("description", ""),
            "color": info.get("color", "#6B7280"),
            "icon": info.get("icon", "tag")
        })
    
    return {
        "categories": categories,
        "ml_available": COMCAT_AVAILABLE and SKLEARN_AVAILABLE,
        "confidence_threshold": CONFIDENCE_THRESHOLD
    }


@router.get("/comments/{incident_id}", response_model=IncidentCommentsResponse)
def get_incident_comments(incident_id: int, db: Session = Depends(get_db)):
    """
    Get all comments for an incident with their categorizations.
    
    Returns comments with:
    - Current category
    - Category source (PATTERN, ML, OFFICER)
    - Confidence score (for ML)
    - Review flag (for low-confidence ML)
    """
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Get comments from JSONB field
    cad_event_comments = incident.cad_event_comments or {}
    raw_comments = cad_event_comments.get("comments", [])
    
    # Build response with review flags
    comments = []
    review_count = 0
    
    for i, comment in enumerate(raw_comments):
        # Skip noise for the response (but keep index accurate)
        confidence = comment.get("category_confidence")
        source = comment.get("category_source", "PATTERN")
        
        # Determine if needs review
        needs_review = False
        if source == "ML" and confidence is not None:
            needs_review = confidence < CONFIDENCE_THRESHOLD
            if needs_review:
                review_count += 1
        
        comments.append(CommentResponse(
            index=i,
            time=comment.get("time", ""),
            time_iso=comment.get("time_iso"),
            operator=comment.get("operator", ""),
            operator_type=comment.get("operator_type", "UNKNOWN"),
            text=comment.get("text", ""),
            is_noise=comment.get("is_noise", False),
            category=comment.get("category", "OTHER"),
            category_source=source,
            category_confidence=confidence,
            needs_review=needs_review
        ))
    
    # Build categories for dropdown
    categories_available = []
    for cat in VALID_CATEGORIES:
        info = CATEGORY_INFO.get(cat, {})
        categories_available.append({
            "value": cat,
            "label": info.get("label", cat.title()),
            "color": info.get("color", "#6B7280")
        })
    
    return IncidentCommentsResponse(
        incident_id=incident.id,
        incident_number=incident.internal_incident_number,
        comments=comments,
        review_count=review_count,
        categories_available=categories_available,
        ml_available=COMCAT_AVAILABLE and SKLEARN_AVAILABLE,
        confidence_threshold=CONFIDENCE_THRESHOLD
    )


@router.put("/comments/{incident_id}", response_model=CategoryUpdateResponse)
def update_comment_categories(
    incident_id: int,
    request: CategoryUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    Update categories for comments (officer corrections).
    
    Sets category_source to "OFFICER" for manual corrections,
    which becomes ground truth training data for ML.
    
    RESTRICTED: Only OFFICER or ADMIN roles can make corrections.
    """
    # Validate editor has officer/admin role
    if not request.edited_by:
        raise HTTPException(
            status_code=403,
            detail="Login required to edit comment categories"
        )
    
    editor = db.query(Personnel).filter(Personnel.id == request.edited_by).first()
    if not editor:
        raise HTTPException(status_code=403, detail="Invalid editor")
    
    if editor.role not in ('OFFICER', 'ADMIN'):
        raise HTTPException(
            status_code=403,
            detail="Only officers and admins can edit comment categories"
        )
    
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Validate categories
    for update in request.updates:
        if update.category not in VALID_CATEGORIES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid category: {update.category}. Valid: {VALID_CATEGORIES}"
            )
    
    # Get current comments
    cad_event_comments = incident.cad_event_comments or {}
    comments = cad_event_comments.get("comments", [])
    
    if not comments:
        raise HTTPException(status_code=400, detail="No comments to update")
    
    # Apply updates
    updated_count = 0
    changes = []
    
    for update in request.updates:
        if 0 <= update.index < len(comments):
            old_category = comments[update.index].get("category", "OTHER")
            old_source = comments[update.index].get("category_source", "PATTERN")
            
            # Only update if actually changed
            if old_category != update.category or old_source != "OFFICER":
                comments[update.index]["category"] = update.category
                comments[update.index]["category_source"] = "OFFICER"
                comments[update.index]["category_confidence"] = None  # Clear ML confidence
                
                changes.append({
                    "index": update.index,
                    "text": comments[update.index].get("text", "")[:50],
                    "old": old_category,
                    "new": update.category
                })
                updated_count += 1
    
    if updated_count > 0:
        # Update the JSONB field - must use flag_modified for SQLAlchemy to detect change
        cad_event_comments["comments"] = comments
        cad_event_comments["officer_reviewed_at"] = datetime.now(timezone.utc).isoformat()  # Track when reviewed
        incident.cad_event_comments = cad_event_comments
        flag_modified(incident, "cad_event_comments")
        incident.updated_at = datetime.now(timezone.utc)
        
        # Log the change
        log_comcat_audit(
            db=db,
            action="COMCAT_CORRECTION",
            incident=incident,
            edited_by_id=request.edited_by,
            summary=f"Officer corrected {updated_count} comment categories",
            details={"changes": changes}
        )
        
        db.commit()
    elif request.edited_by:
        # No changes but officer clicked "Mark Reviewed" - still update timestamp
        cad_event_comments["officer_reviewed_at"] = datetime.now(timezone.utc).isoformat()
        incident.cad_event_comments = cad_event_comments
        flag_modified(incident, "cad_event_comments")
        incident.updated_at = datetime.now(timezone.utc)
        
        log_comcat_audit(
            db=db,
            action="COMCAT_REVIEWED",
            incident=incident,
            edited_by_id=request.edited_by,
            summary="Officer marked comments as reviewed (no changes)",
            details=None
        )
        
        db.commit()
    
    return CategoryUpdateResponse(
        success=True,
        updated_count=updated_count,
        incident_number=incident.internal_incident_number,
        message=f"Updated {updated_count} comment categories"
    )


@router.get("/review/{incident_id}")
def get_comments_for_review(
    incident_id: int,
    threshold: float = CONFIDENCE_THRESHOLD,
    db: Session = Depends(get_db)
):
    """
    Get only comments that need officer review (low ML confidence).
    
    Useful for focused review workflow.
    """
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    cad_event_comments = incident.cad_event_comments or {}
    
    if COMCAT_AVAILABLE:
        needs_review = get_comments_needing_review(cad_event_comments, threshold)
    else:
        # Manual implementation if comcat not available
        needs_review = []
        for i, comment in enumerate(cad_event_comments.get("comments", [])):
            if comment.get("category_source") == "ML":
                conf = comment.get("category_confidence", 0)
                if conf is not None and conf < threshold:
                    needs_review.append({**comment, "index": i})
    
    return {
        "incident_id": incident.id,
        "incident_number": incident.internal_incident_number,
        "threshold": threshold,
        "review_count": len(needs_review),
        "comments": needs_review
    }


@router.post("/retrain", response_model=RetrainResponse)
def retrain_ml_model(
    request: RetrainRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Trigger ML model retraining with officer corrections.
    
    v2.0: Now includes operator_type in training data for context-aware learning.
    Gathers training data from all incidents and retrains the Random Forest model.
    """
    if not COMCAT_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="ComCat ML not available - check server dependencies"
        )
    
    if not SKLEARN_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="scikit-learn not installed on server"
        )
    
    # Gather training data from all incidents
    # v2.0: (text, operator_type, category) tuples
    officer_examples = []
    
    incidents = db.query(Incident).filter(
        Incident.cad_event_comments.isnot(None)
    ).all()
    
    for incident in incidents:
        cad_event_comments = incident.cad_event_comments or {}
        
        # Directly gather OFFICER corrections with operator_type
        for comment in cad_event_comments.get("comments", []):
            if comment.get("category_source") == "OFFICER":
                text = comment.get("text", "")
                operator_type = comment.get("operator_type", "UNKNOWN")
                category = comment.get("category", "OTHER")
                if text and category:
                    officer_examples.append((text, operator_type, category))
    
    # Retrain the model
    try:
        stats = retrain_model(officer_examples)
    except Exception as e:
        logger.error(f"Model retraining failed: {e}")
        raise HTTPException(status_code=500, detail=f"Retraining failed: {str(e)}")
    
    return RetrainResponse(
        success=True,
        total_examples=stats.get("total_examples", 0),
        seed_examples=stats.get("seed_examples", 0),
        officer_examples=len(officer_examples),
        cv_accuracy=stats.get("cv_accuracy"),
        trained_at=stats.get("trained_at", datetime.now(timezone.utc).isoformat()),
        message=f"Model retrained with {stats.get('total_examples', 0)} examples"
    )


@router.get("/stats", response_model=TrainingStatsResponse)
def get_training_stats(db: Session = Depends(get_db)):
    """
    Get ML model training statistics.
    
    Returns:
    - Model status (trained, available)
    - Training data counts
    - Cross-validation accuracy
    - Category distribution
    """
    # Count officer corrections across all incidents
    officer_count = 0
    category_counts = {cat: 0 for cat in VALID_CATEGORIES}
    
    incidents = db.query(Incident).filter(
        Incident.cad_event_comments.isnot(None)
    ).all()
    
    for incident in incidents:
        cad_event_comments = incident.cad_event_comments or {}
        for comment in cad_event_comments.get("comments", []):
            if comment.get("category_source") == "OFFICER":
                officer_count += 1
                cat = comment.get("category", "OTHER")
                if cat in category_counts:
                    category_counts[cat] += 1
    
    # Get model stats
    model_trained = False
    training_stats = {}
    
    if COMCAT_AVAILABLE and SKLEARN_AVAILABLE:
        try:
            model = get_model()
            model_trained = model.is_trained
            training_stats = model.training_stats or {}
        except Exception as e:
            logger.warning(f"Could not get model stats: {e}")
    
    return TrainingStatsResponse(
        ml_available=COMCAT_AVAILABLE,
        sklearn_installed=SKLEARN_AVAILABLE,
        model_trained=model_trained,
        total_training_examples=training_stats.get("total_examples", 0),
        seed_examples=training_stats.get("seed_examples", 0),
        officer_examples=officer_count,
        cv_accuracy=training_stats.get("cv_accuracy"),
        last_trained_at=training_stats.get("trained_at"),
        confidence_threshold=CONFIDENCE_THRESHOLD,
        category_counts=category_counts
    )


@router.get("/grouped/{incident_id}")
def get_comments_grouped(incident_id: int, db: Session = Depends(get_db)):
    """
    Get comments grouped by category for display.
    
    Useful for PDF rendering or structured display.
    """
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    cad_event_comments = incident.cad_event_comments or {}
    
    if COMCAT_AVAILABLE:
        grouped = get_comments_by_category(cad_event_comments)
    else:
        # Manual implementation
        grouped = {cat: [] for cat in VALID_CATEGORIES}
        for comment in cad_event_comments.get("comments", []):
            if not comment.get("is_noise"):
                cat = comment.get("category", "OTHER")
                if cat in grouped:
                    grouped[cat].append(comment)
                else:
                    grouped["OTHER"].append(comment)
        # Remove empty categories
        grouped = {k: v for k, v in grouped.items() if v}
    
    return {
        "incident_id": incident.id,
        "incident_number": incident.internal_incident_number,
        "grouped_comments": grouped,
        "category_order": VALID_CATEGORIES
    }


@router.post("/predict")
def predict_category(text: str, operator_type: str = "UNKNOWN"):
    """
    Predict category for a single comment.
    
    v2.0: Now accepts operator_type for context-aware prediction.
    
    Args:
        text: Comment text
        operator_type: Who entered it (CALLTAKER, DISPATCHER, UNIT, SYSTEM, UNKNOWN)
    """
    if not COMCAT_AVAILABLE:
        raise HTTPException(status_code=503, detail="ComCat not available")
    
    if not SKLEARN_AVAILABLE:
        raise HTTPException(status_code=503, detail="scikit-learn not installed")
    
    try:
        model = get_model()
        if not model.is_trained:
            raise HTTPException(status_code=503, detail="Model not trained")
        
        category, confidence = model.predict(text, operator_type)
        needs_review = confidence < CONFIDENCE_THRESHOLD if confidence else True
        
        return {
            "text": text,
            "operator_type": operator_type,
            "category": category,
            "confidence": confidence,
            "needs_review": needs_review,
            "threshold": CONFIDENCE_THRESHOLD
        }
    except Exception as e:
        logger.error(f"Prediction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
