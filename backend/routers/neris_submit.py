"""
NERIS Submit Router

Endpoints for building, validating, and submitting NERIS payloads.

Routes:
  GET  /api/neris/preview/{incident_id}   — Build + validate payload (no submit)
  POST /api/neris/submit/{incident_id}    — Validate + POST to NERIS
  POST /api/neris/resubmit/{incident_id}  — Validate + PATCH to NERIS
  GET  /api/neris/status/{incident_id}    — Check submission status

All endpoints are admin-only.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import logging

from database import get_db
from models import Incident, IncidentUnit, Setting
from services.neris.builder import build_and_validate
from services.neris.api_client import NerisApiClient, NerisApiError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["neris"])


def _get_neris_settings(db: Session) -> dict:
    """Load NERIS settings from tenant database."""
    rows = db.query(Setting).filter(Setting.category == "neris").all()
    settings = {}
    for row in rows:
        settings[row.key] = row.value
    return settings


def _get_client(settings: dict) -> NerisApiClient:
    """Create NERIS API client from tenant settings."""
    client_id = settings.get("client_id")
    client_secret = settings.get("client_secret")
    environment = settings.get("environment", "test")

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=400,
            detail="NERIS API credentials not configured. Set client_id and client_secret in settings.",
        )

    return NerisApiClient(
        client_id=client_id,
        client_secret=client_secret,
        environment=environment,
    )


def _incident_to_dict(incident) -> dict:
    """Convert SQLAlchemy Incident row to dict for payload builder."""
    return {c.name: getattr(incident, c.name) for c in incident.__table__.columns}


def _units_to_dicts(units) -> list:
    """Convert SQLAlchemy IncidentUnit rows to list of dicts."""
    return [
        {c.name: getattr(u, c.name) for c in u.__table__.columns}
        for u in units
    ]


def _build_preview(incident, db: Session, settings: dict) -> dict:
    """Build and validate NERIS payload. Returns {payload, errors, warnings, valid}."""
    # Read fd_neris_id from neris_entity table (authoritative source).
    # Falls back to settings.department_neris_id for backward compatibility.
    entity_row = db.execute(
        text("SELECT fd_neris_id FROM neris_entity LIMIT 1")
    ).fetchone()
    department_neris_id = entity_row[0] if entity_row and entity_row[0] else settings.get("department_neris_id")

    # Load related data
    units = db.query(IncidentUnit).filter(IncidentUnit.incident_id == incident.id).all()

    # Convert ORM objects to dicts (builder expects dicts)
    incident_dict = _incident_to_dict(incident)
    units_dicts = _units_to_dicts(units)

    # TODO: Load mutual aid departments when needed
    # aid_departments = _load_aid_departments(incident, db)

    try:
        result = build_and_validate(
            incident=incident_dict,
            units=units_dicts,
            department_neris_id=department_neris_id or "",
        )
    except Exception as e:
        logger.exception("Failed to build NERIS payload for incident %d", incident.id)
        raise HTTPException(status_code=500, detail=f"Payload build failed: {str(e)}")

    return result


@router.get("/preview/{incident_id}")
async def preview_neris_payload(incident_id: int, db: Session = Depends(get_db)):
    """Build and validate NERIS payload without submitting."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    settings = _get_neris_settings(db)
    return _build_preview(incident, db, settings)


@router.post("/submit/{incident_id}")
async def submit_to_neris(incident_id: int, db: Session = Depends(get_db)):
    """Validate and POST incident to NERIS."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if incident.neris_submission_id:
        raise HTTPException(
            status_code=400,
            detail=f"Already submitted as {incident.neris_submission_id}. Use resubmit to update.",
        )

    settings = _get_neris_settings(db)
    entity_row = db.execute(
        text("SELECT fd_neris_id FROM neris_entity LIMIT 1")
    ).fetchone()
    department_neris_id = entity_row[0] if entity_row and entity_row[0] else settings.get("department_neris_id")

    if not department_neris_id:
        raise HTTPException(status_code=400, detail="fd_neris_id not configured in neris_entity.")

    # Build and validate
    result = _build_preview(incident, db, settings)
    if not result["valid"]:
        return {
            "success": False,
            "message": "Validation failed",
            "errors": result["errors"],
            "warnings": result["warnings"],
        }

    # Submit to NERIS: POST /incident/{department_neris_id}
    client = _get_client(settings)
    try:
        api_result = await client.create_incident(department_neris_id, result["payload"])
    except NerisApiError as e:
        return {
            "success": False,
            "api_error": e.detail,
            "body": e.body,
            "errors": [],
            "warnings": result["warnings"],
        }

    # Update incident with submission tracking
    neris_id = api_result.get("neris_id") or api_result.get("id") or api_result.get("incident_neris_id")
    incident.neris_submission_id = neris_id
    incident.neris_submitted_at = datetime.now(timezone.utc)
    incident.neris_validation_errors = None
    incident.neris_last_validated_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "success": True,
        "neris_id": neris_id,
        "body": api_result,
        "warnings": result["warnings"],
    }


@router.post("/resubmit/{incident_id}")
async def resubmit_to_neris(incident_id: int, db: Session = Depends(get_db)):
    """Validate and PATCH existing incident in NERIS."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if not incident.neris_submission_id:
        raise HTTPException(
            status_code=400,
            detail="Incident has not been submitted yet. Use submit first.",
        )

    settings = _get_neris_settings(db)
    entity_row = db.execute(
        text("SELECT fd_neris_id FROM neris_entity LIMIT 1")
    ).fetchone()
    department_neris_id = entity_row[0] if entity_row and entity_row[0] else settings.get("department_neris_id")

    if not department_neris_id:
        raise HTTPException(status_code=400, detail="fd_neris_id not configured in neris_entity.")

    # Build and validate
    result = _build_preview(incident, db, settings)
    if not result["valid"]:
        return {
            "success": False,
            "message": "Validation failed",
            "errors": result["errors"],
            "warnings": result["warnings"],
        }

    # PATCH to NERIS: PATCH /incident/{department_neris_id}/{incident_neris_id}
    client = _get_client(settings)
    try:
        api_result = await client.update_incident(
            department_neris_id,
            incident.neris_submission_id,
            result["payload"],
        )
    except NerisApiError as e:
        return {
            "success": False,
            "api_error": e.detail,
            "body": e.body,
            "errors": [],
            "warnings": result["warnings"],
        }

    # Update tracking
    incident.neris_submitted_at = datetime.now(timezone.utc)
    incident.neris_last_validated_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "success": True,
        "neris_id": incident.neris_submission_id,
        "body": api_result,
        "warnings": result["warnings"],
        "message": "Incident updated in NERIS",
    }


@router.get("/status/{incident_id}")
async def get_neris_status(incident_id: int, db: Session = Depends(get_db)):
    """Check NERIS submission status for an incident."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    return {
        "submitted": incident.neris_submission_id is not None,
        "neris_id": incident.neris_submission_id,
        "submitted_at": incident.neris_submitted_at.isoformat() if incident.neris_submitted_at else None,
        "last_validated_at": incident.neris_last_validated_at.isoformat() if incident.neris_last_validated_at else None,
        "validation_errors": incident.neris_validation_errors,
    }


# Pydantic model for PSAP timestamp updates
from pydantic import BaseModel
from typing import Optional

class PsapTimestampUpdate(BaseModel):
    psap_call_arrival: Optional[str] = None
    psap_call_answered: Optional[str] = None


@router.patch("/psap/{incident_id}")
async def update_psap(incident_id: int, data: PsapTimestampUpdate, db: Session = Depends(get_db)):
    """Update PSAP timestamps on an incident. Values are ISO 8601 strings or null to clear."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    from datetime import datetime as dt

    if data.psap_call_arrival is not None:
        incident.psap_call_arrival = dt.fromisoformat(data.psap_call_arrival) if data.psap_call_arrival else None
    if data.psap_call_answered is not None:
        incident.psap_call_answered = dt.fromisoformat(data.psap_call_answered) if data.psap_call_answered else None

    db.commit()
    return {"success": True}
