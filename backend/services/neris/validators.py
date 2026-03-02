"""
NERIS Payload Validators

Pre-submission validation rules that mirror what the NERIS API will reject.
Run these before sending to catch errors early and show them in the UI.

These do NOT modify data — they only report issues.
"""


def validate_payload(payload: dict) -> list:
    """
    Validate a complete NERIS IncidentPayload dict.
    Returns list of validation error dicts: [{field, message, severity}]
    severity: "error" (will be rejected), "warning" (quality issue)
    """
    errors = []

    # ---- REQUIRED FIELDS ----
    
    base = payload.get("base") or {}
    if not base.get("department_neris_id"):
        errors.append(_err("base.department_neris_id", "Department NERIS ID is required"))
    if not base.get("incident_number"):
        errors.append(_err("base.incident_number", "Incident number is required"))
    if not base.get("location"):
        errors.append(_err("base.location", "Location is required"))

    incident_types = payload.get("incident_types") or []
    if not incident_types:
        errors.append(_err("incident_types", "At least one incident type is required"))

    dispatch = payload.get("dispatch") or {}
    if not dispatch.get("incident_number"):
        errors.append(_err("dispatch.incident_number", "CAD event number is required"))
    if not dispatch.get("call_arrival"):
        errors.append(_err("dispatch.call_arrival", "PSAP call_arrival timestamp is required"))
    if not dispatch.get("call_answered"):
        errors.append(_err("dispatch.call_answered", "PSAP call_answered timestamp is required"))
    if not dispatch.get("call_create"):
        errors.append(_err("dispatch.call_create", "PSAP call_create timestamp is required"))

    unit_responses = dispatch.get("unit_responses") or []
    if not unit_responses:
        errors.append(_err("dispatch.unit_responses", "At least one unit response is required"))

    # ---- TIMESTAMP SEQUENCE ----
    
    ca = dispatch.get("call_arrival")
    cans = dispatch.get("call_answered")
    cc = dispatch.get("call_create")
    if ca and cans and ca > cans:
        errors.append(_err("dispatch.call_arrival",
                           "call_arrival must be <= call_answered"))
    if cans and cc and cans > cc:
        errors.append(_err("dispatch.call_answered",
                           "call_answered must be <= call_create"))

    # ---- CONDITIONAL MODULE RULES ----
    
    type_codes = [t.get("type", "") for t in incident_types]
    has_fire = any(t.startswith("FIRE") for t in type_codes)
    has_structure_fire = any("STRUCTURE_FIRE" in t for t in type_codes)
    has_cooking_fire = any("CONFINED_COOKING_APPLIANCE_FIRE" in t for t in type_codes)
    has_medical = any(t.startswith("MEDICAL") for t in type_codes)
    has_hazsit = any(t.startswith("HAZSIT") for t in type_codes)

    # fire_detail only with FIRE type
    if payload.get("fire_detail") and not has_fire:
        errors.append(_err("fire_detail",
                           "fire_detail only allowed with FIRE|| incident type"))
    
    # medical_details only with MEDICAL type
    if payload.get("medical_details") and not has_medical:
        errors.append(_err("medical_details",
                           "medical_details only allowed with MEDICAL|| incident type"))

    # hazsit_detail only with HAZSIT type
    if payload.get("hazsit_detail") and not has_hazsit:
        errors.append(_err("hazsit_detail",
                           "hazsit_detail only allowed with HAZSIT|| incident type"))

    # Structure fire requires alarm/suppression modules
    if has_structure_fire:
        if not payload.get("smoke_alarm"):
            errors.append(_err("smoke_alarm",
                               "smoke_alarm required for FIRE||STRUCTURE_FIRE"))
        if not payload.get("fire_alarm"):
            errors.append(_err("fire_alarm",
                               "fire_alarm required for FIRE||STRUCTURE_FIRE"))
        if not payload.get("other_alarm"):
            errors.append(_err("other_alarm",
                               "other_alarm required for FIRE||STRUCTURE_FIRE"))
        if not payload.get("fire_suppression"):
            errors.append(_err("fire_suppression",
                               "fire_suppression required for FIRE||STRUCTURE_FIRE"))

    # Cooking fire requires cooking suppression
    if has_cooking_fire:
        if not payload.get("cooking_fire_suppression"):
            errors.append(_err("cooking_fire_suppression",
                               "cooking_fire_suppression required for CONFINED_COOKING_APPLIANCE_FIRE"))

    # ---- ACTIONS MUTUAL EXCLUSIVITY ----
    
    at = payload.get("actions_tactics") or {}
    an = at.get("action_noaction") or {}
    if an.get("type") == "ACTION" and an.get("noaction_type"):
        errors.append(_err("actions_tactics",
                           "Cannot have both ACTION and NOACTION"))

    # ---- QUALITY WARNINGS (not rejections) ----
    
    if not base.get("outcome_narrative"):
        errors.append(_warn("base.outcome_narrative",
                            "Outcome narrative is highly desired"))
    if not payload.get("actions_tactics"):
        errors.append(_warn("actions_tactics",
                            "Actions/tactics is highly desired"))
    if not base.get("point"):
        errors.append(_warn("base.point",
                            "GeoJSON point is highly desired"))
    if not base.get("location_use"):
        errors.append(_warn("base.location_use",
                            "Location use is highly desired"))

    return errors


def _err(field: str, message: str) -> dict:
    return {"field": field, "message": message, "severity": "error"}


def _warn(field: str, message: str) -> dict:
    return {"field": field, "message": message, "severity": "warning"}
