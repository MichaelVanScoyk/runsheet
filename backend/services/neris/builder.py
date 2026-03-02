"""
NERIS Payload Builder — Orchestrator

Assembles a complete NERIS IncidentPayload from an incident dict + related data.
Each section is built by its own module. This file just calls them and assembles.

Usage:
    from services.neris.builder import build_neris_payload
    
    payload = build_neris_payload(
        incident=incident_row_as_dict,
        units=list_of_incident_unit_dicts,
        department_neris_id="FD42029593",
        aid_departments=list_of_mutual_aid_dept_dicts,  # optional
    )
    
    # payload is a dict ready to json.dumps() and POST to NERIS API
"""

from .payload_base import build_base, build_incident_types
from .payload_dispatch import build_dispatch
from .payload_timestamps import build_tactic_timestamps
from .payload_actions import build_actions_tactics, build_aids, build_nonfd_aids
from .payload_fire import (
    build_fire_detail, build_smoke_alarm, build_fire_alarm,
    build_other_alarm, build_fire_suppression, build_cooking_fire_suppression,
)
from .payload_medical import build_medical_details
from .payload_hazmat import build_hazsit_detail
from .payload_casualties import build_casualty_rescues, build_exposures
from .payload_emerging import build_electric_hazards, build_powergen_hazards, build_csst_hazard
from .validators import validate_payload


def build_neris_payload(
    incident: dict,
    units: list,
    department_neris_id: str,
    aid_departments: list | None = None,
) -> dict:
    """
    Build complete NERIS IncidentPayload from DB data.
    
    Args:
        incident: incident row as dict (all columns)
        units: list of incident_unit rows as dicts
        department_neris_id: tenant's FD NERIS ID from settings
        aid_departments: pre-looked-up mutual aid departments with neris_department_id
    
    Returns:
        dict matching NERIS IncidentPayload structure
    """
    payload = {}

    # === REQUIRED SECTIONS ===
    payload["base"] = build_base(incident, department_neris_id)
    payload["incident_types"] = build_incident_types(incident)
    payload["dispatch"] = build_dispatch(incident, units)

    # === OPTIONAL: Unit responses at incident level ===
    # NERIS has unit_responses at both dispatch and incident level.
    # Dispatch-level is required (built inside build_dispatch).
    # Incident-level is optional — same data, different context.
    # We don't duplicate for now.

    # === OPTIONAL: Tactic timestamps ===
    ts = build_tactic_timestamps(incident)
    if ts:
        payload["tactic_timestamps"] = ts

    # === OPTIONAL: Actions/tactics ===
    at = build_actions_tactics(incident)
    if at:
        payload["actions_tactics"] = at

    # === OPTIONAL: Aids ===
    aids = build_aids(incident, aid_departments)
    if aids:
        payload["aids"] = aids

    nonfd = build_nonfd_aids(incident)
    if nonfd:
        payload["nonfd_aids"] = nonfd

    # === OPTIONAL: Special modifiers ===
    additional = incident.get("neris_additional_data") or {}
    modifiers = additional.get("special_modifiers")
    if modifiers:
        payload["special_modifiers"] = modifiers

    # === CONDITIONAL: Fire detail ===
    fire = build_fire_detail(incident)
    if fire:
        payload["fire_detail"] = fire

    # === CONDITIONAL: Alarm/suppression modules ===
    sa = build_smoke_alarm(incident)
    if sa:
        payload["smoke_alarm"] = sa

    fa = build_fire_alarm(incident)
    if fa:
        payload["fire_alarm"] = fa

    oa = build_other_alarm(incident)
    if oa:
        payload["other_alarm"] = oa

    fs = build_fire_suppression(incident)
    if fs:
        payload["fire_suppression"] = fs

    cfs = build_cooking_fire_suppression(incident)
    if cfs:
        payload["cooking_fire_suppression"] = cfs

    # === CONDITIONAL: Medical ===
    med = build_medical_details(incident)
    if med:
        payload["medical_details"] = med

    # === CONDITIONAL: Hazmat ===
    haz = build_hazsit_detail(incident)
    if haz:
        payload["hazsit_detail"] = haz

    # === OPTIONAL: Casualty/rescues ===
    cr = build_casualty_rescues(incident)
    if cr:
        payload["casualty_rescues"] = cr

    # === OPTIONAL: Exposures ===
    exp = build_exposures(incident)
    if exp:
        payload["exposures"] = exp

    # === OPTIONAL: Emerging hazards ===
    eh = build_electric_hazards(incident)
    if eh:
        payload["electric_hazards"] = eh

    ph = build_powergen_hazards(incident)
    if ph:
        payload["powergen_hazards"] = ph

    csst = build_csst_hazard(incident)
    if csst:
        payload["csst_hazard"] = csst

    return payload


def build_and_validate(
    incident: dict,
    units: list,
    department_neris_id: str,
    aid_departments: list | None = None,
) -> dict:
    """
    Build payload and run validation. Returns both.
    
    Returns:
        {
            "payload": dict,       # The NERIS payload
            "errors": list,        # Validation errors (severity: error)
            "warnings": list,      # Quality warnings (severity: warning)
            "valid": bool,         # True if no errors (warnings OK)
        }
    """
    payload = build_neris_payload(incident, units, department_neris_id, aid_departments)
    issues = validate_payload(payload)

    errors = [i for i in issues if i["severity"] == "error"]
    warnings = [i for i in issues if i["severity"] == "warning"]

    return {
        "payload": payload,
        "errors": errors,
        "warnings": warnings,
        "valid": len(errors) == 0,
    }
