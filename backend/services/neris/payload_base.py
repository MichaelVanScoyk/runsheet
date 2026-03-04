"""
NERIS Base Payload Builder

Maps our DB fields → NERIS IncidentBasePayload.

Source DB fields:
  - incidents.neris_incident_type_codes (text array)
  - incidents.neris_incident_type_primary (bool array)
  - incidents.neris_people_present
  - incidents.neris_rescue_animal
  - incidents.neris_narrative_impedance
  - incidents.neris_narrative_outcome
  - incidents.neris_displaced_number
  - incidents.neris_location_use (JSONB)
  - Tenant setting: department_neris_id
  - incidents.internal_incident_number

NERIS target: IncidentBasePayload + IncidentTypePayload[]
"""

from .payload_location import build_location, build_geo_point


def build_incident_types(incident: dict) -> list:
    """
    Build NERIS IncidentTypePayload array.
    
    Our DB: parallel arrays neris_incident_type_codes + neris_incident_type_primary
    NERIS: [{type: "FIRE||STRUCTURE_FIRE", primary: true}, ...]
    """
    codes = incident.get("neris_incident_type_codes") or []
    primaries = incident.get("neris_incident_type_primary") or []

    types = []
    for i, code in enumerate(codes):
        if not code:
            continue
        entry = {"type": code}
        if i < len(primaries) and primaries[i]:
            entry["primary"] = True
        types.append(entry)

    return types


def build_location_use(incident: dict) -> dict | None:
    """
    Build NERIS LocationUsePayload from our neris_location_use JSONB.
    
    Our DB stores the full module as JSONB.
    Map our field names to NERIS field names.
    """
    lu = incident.get("neris_location_use")
    if not lu:
        return None

    payload = {}

    # use_type maps to NERIS use_type (hierarchical code)
    use_type = lu.get("use_type")
    use_subtype = lu.get("use_subtype")
    if use_type:
        # NERIS wants the hierarchical value: "RESIDENTIAL||DETACHED_SINGLE_FAMILY_DWELLING"
        if use_subtype:
            payload["use_type"] = f"{use_type}||{use_subtype}"
        else:
            payload["use_type"] = use_type

    # Secondary use
    sec_type = lu.get("use_type_secondary")
    sec_subtype = lu.get("use_subtype_secondary")
    if sec_type:
        if sec_subtype:
            payload["secondary_use"] = f"{sec_type}||{sec_subtype}"
        else:
            payload["secondary_use"] = sec_type

    # Vacancy cause
    vacancy = lu.get("use_vacancy") or lu.get("vacancy_cause")
    if vacancy and vacancy not in ("OCCUPIED", ""):
        payload["vacancy_cause"] = vacancy

    # In-use status — FLAT boolean per OpenAPI v1.4.34
    in_use = lu.get("in_use")
    if in_use is None:
        # Legacy: derive from use_status
        use_status = lu.get("use_status")
        if use_status is not None:
            in_use = bool(use_status)
    if in_use is not None:
        payload["in_use"] = in_use

    return payload if payload else None


def build_base(incident: dict, department_neris_id: str) -> dict:
    """
    Build NERIS IncidentBasePayload.
    """
    base = {
        "department_neris_id": department_neris_id,
        "incident_number": incident.get("internal_incident_number", ""),
        "location": build_location(incident),
    }

    # Optional fields — only include if we have data
    point = build_geo_point(incident)
    if point:
        base["point"] = point

    location_use = build_location_use(incident)
    if location_use:
        base["location_use"] = location_use

    if incident.get("neris_people_present") is not None:
        base["people_present"] = incident["neris_people_present"]

    if incident.get("neris_rescue_animal") is not None:
        base["animals_rescued"] = incident["neris_rescue_animal"]

    if incident.get("neris_narrative_impedance"):
        base["impediment_narrative"] = incident["neris_narrative_impedance"]

    if incident.get("neris_narrative_outcome"):
        base["outcome_narrative"] = incident["neris_narrative_outcome"]

    if incident.get("neris_displaced_number") is not None:
        base["displacement_count"] = incident["neris_displaced_number"]

    causes = incident.get("neris_displacement_causes") or []
    if causes:
        base["displacement_causes"] = causes

    return base
