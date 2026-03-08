"""
nerisv1: Incident NERIS Data Endpoints

Load, save, validate, and submit NERIS data for an incident.
Uses the adapter for two-way mapping between DB and NERIS fields.

Routes:
  GET  /api/nerisv1/incident/{id}          — Load NERIS data (mapped + overflow)
  PUT  /api/nerisv1/incident/{id}          — Save edits (mapped → DB, unmapped → overflow)
  POST /api/nerisv1/incident/{id}/validate — Build payload + validate against NERIS API
  POST /api/nerisv1/incident/{id}/submit   — Build payload + submit to NERIS API
"""

import json
import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel

from database import get_db
from services.nerisv1.adapter import load_neris_data, save_neris_data

logger = logging.getLogger(__name__)

router = APIRouter()


class NerisSaveRequest(BaseModel):
    """Flat dict of {neris_field_path: value} pairs from the form."""
    data: Dict[str, Any]


# ============================================================================
# LOAD — DB → NERIS dict for the form
# ============================================================================

@router.get("/incident/{incident_id}")
def get_neris_incident(
    incident_id: int,
    db: Session = Depends(get_db),
):
    """
    Load NERIS data for an incident.
    Reads mapping config, fetches from source tables, applies transforms.
    Returns nested NERIS dict + metadata about what mapped/empty/errors.
    """
    result = load_neris_data(incident_id, db)

    if any(e.get("path") == "*" for e in result["errors"]):
        raise HTTPException(404, result["errors"][0]["error"])

    return result


# ============================================================================
# SAVE — NERIS dict from form → DB
# ============================================================================

@router.put("/incident/{incident_id}")
def save_neris_incident(
    incident_id: int,
    body: NerisSaveRequest,
    db: Session = Depends(get_db),
):
    """
    Save edited NERIS data back to the database.
    Mapped fields write to original source columns.
    Unmapped fields write to incidents.nerisv1_data JSONB.
    """
    # Verify incident exists
    row = db.execute(text("SELECT id FROM incidents WHERE id = :id"), {"id": incident_id}).fetchone()
    if not row:
        raise HTTPException(404, "Incident not found")

    result = save_neris_data(incident_id, body.data, db)
    return result


# ============================================================================
# VALIDATE — Build payload + check against NERIS API
# ============================================================================

@router.post("/incident/{incident_id}/validate")
def validate_neris_incident(
    incident_id: int,
    db: Session = Depends(get_db),
):
    """
    Build the full NERIS payload from current data and validate
    against the NERIS test API. Does NOT submit.
    """
    import httpx
    from services.nerisv1.builder import build_incident_payload

    # Load current data through adapter
    loaded = load_neris_data(incident_id, db)
    if any(e.get("path") == "*" for e in loaded["errors"]):
        raise HTTPException(404, loaded["errors"][0]["error"])

    neris_data = loaded["neris_data"]

    # Build payload
    try:
        payload = build_incident_payload(neris_data)
    except Exception as e:
        return {
            "valid": False,
            "build_error": str(e),
            "payload": neris_data,
            "mapped_count": len(loaded["mapped"]),
            "empty_count": len(loaded["empty"]),
        }

    # Get NERIS credentials
    settings = _get_neris_settings(db)
    department_id = settings.get("department_neris_id") or settings.get("fd_neris_id")
    if not department_id:
        return {
            "valid": False,
            "build_error": "No department NERIS ID configured",
            "payload": payload,
        }

    # Get auth token
    client_id = settings.get("client_id")
    client_secret = settings.get("client_secret")
    environment = settings.get("environment", "test")
    base_url = "https://api-test.neris.fsri.org/v1" if environment == "test" else "https://api.neris.fsri.org/v1"

    if not client_id or not client_secret:
        return {
            "valid": None,
            "build_error": None,
            "payload": payload,
            "note": "No API credentials configured — payload built but not validated against NERIS",
            "mapped_count": len(loaded["mapped"]),
            "empty_count": len(loaded["empty"]),
        }

    try:
        # Get token
        token_resp = httpx.post(
            base_url + "/token",
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        token_resp.raise_for_status()
        token = token_resp.json().get("access_token")

        # Validate
        val_resp = httpx.post(
            base_url + "/incident/" + department_id + "/validate",
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )

        return {
            "valid": val_resp.status_code == 200,
            "status_code": val_resp.status_code,
            "response": val_resp.json() if val_resp.headers.get("content-type", "").startswith("application/json") else val_resp.text,
            "payload": payload,
            "mapped_count": len(loaded["mapped"]),
            "empty_count": len(loaded["empty"]),
        }
    except Exception as e:
        return {
            "valid": False,
            "api_error": str(e),
            "payload": payload,
            "mapped_count": len(loaded["mapped"]),
            "empty_count": len(loaded["empty"]),
        }


# ============================================================================
# SUBMIT — Build payload + POST to NERIS API
# ============================================================================

@router.post("/incident/{incident_id}/submit")
def submit_neris_incident(
    incident_id: int,
    db: Session = Depends(get_db),
):
    """
    Build the full NERIS payload and submit to the NERIS API.
    On success, stores submission ID and timestamp on the incident.
    """
    import httpx
    from services.nerisv1.builder import build_incident_payload

    # Load + build
    loaded = load_neris_data(incident_id, db)
    if any(e.get("path") == "*" for e in loaded["errors"]):
        raise HTTPException(404, loaded["errors"][0]["error"])

    try:
        payload = build_incident_payload(loaded["neris_data"])
    except Exception as e:
        raise HTTPException(400, "Payload build failed: " + str(e))

    # Get credentials
    settings = _get_neris_settings(db)
    department_id = settings.get("department_neris_id") or settings.get("fd_neris_id")
    client_id = settings.get("client_id")
    client_secret = settings.get("client_secret")
    environment = settings.get("environment", "test")
    base_url = "https://api-test.neris.fsri.org/v1" if environment == "test" else "https://api.neris.fsri.org/v1"

    if not all([department_id, client_id, client_secret]):
        raise HTTPException(400, "NERIS credentials not fully configured")

    try:
        # Token
        token_resp = httpx.post(
            base_url + "/token",
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        token_resp.raise_for_status()
        token = token_resp.json().get("access_token")

        # Submit
        submit_resp = httpx.post(
            base_url + "/incident/" + department_id,
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )

        resp_data = submit_resp.json() if submit_resp.headers.get("content-type", "").startswith("application/json") else {"raw": submit_resp.text}

        if submit_resp.status_code in (200, 201):
            # Write submission metadata back to incident
            submission_id = resp_data.get("id") or resp_data.get("submission_id")
            db.execute(text("""
                UPDATE incidents SET
                    neris_submitted_at = NOW(),
                    neris_submission_id = :sub_id,
                    neris_validation_errors = NULL,
                    neris_last_validated_at = NOW(),
                    updated_at = NOW()
                WHERE id = :id
            """), {"sub_id": submission_id, "id": incident_id})
            db.commit()

            return {
                "submitted": True,
                "status_code": submit_resp.status_code,
                "response": resp_data,
                "submission_id": submission_id,
            }
        else:
            # Store validation errors
            db.execute(text("""
                UPDATE incidents SET
                    neris_validation_errors = :errors::jsonb,
                    neris_last_validated_at = NOW(),
                    updated_at = NOW()
                WHERE id = :id
            """), {"errors": json.dumps(resp_data), "id": incident_id})
            db.commit()

            return {
                "submitted": False,
                "status_code": submit_resp.status_code,
                "response": resp_data,
            }
    except httpx.HTTPError as e:
        raise HTTPException(502, "NERIS API error: " + str(e))


# ============================================================================
# Helper
# ============================================================================

def _get_neris_settings(db):
    """Load NERIS settings as flat dict."""
    rows = db.execute(text(
        "SELECT key, value FROM settings WHERE category = 'neris'"
    )).fetchall()
    return {r[0]: r[1] for r in rows}
