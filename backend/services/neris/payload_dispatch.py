"""
NERIS Dispatch Payload Builder

Maps our DB fields → NERIS DispatchPayload + unit_responses.

Source DB fields:
  - incidents.cad_event_number
  - incidents.time_dispatched (→ call_create)
  - incidents.time_last_cleared (→ incident_clear)
  - incidents.cad_event_comments (JSONB with parsed comments)
  - incident_units table (→ unit_responses)
  - apparatus table (→ unit_neris_id resolution)

NERIS target: DispatchPayload, IncidentUnitResponsePayload[]
"""

from .payload_location import build_location, build_geo_point


def _format_ts(val) -> str | None:
    """Format a datetime/string value as ISO 8601 with timezone."""
    if val is None:
        return None
    if isinstance(val, str):
        return val if val else None
    # datetime object
    return val.isoformat()


def build_unit_response(unit: dict) -> dict:
    """
    Build one NERIS IncidentUnitResponsePayload from an incident_unit row.
    
    Our incident_units table fields map to NERIS fields.
    """
    resp = {}

    # Unit identification
    if unit.get("neris_unit_id_linked"):
        resp["unit_neris_id"] = unit["neris_unit_id_linked"]
    
    reported = unit.get("neris_unit_id_reported") or unit.get("cad_unit_id")
    if reported:
        resp["reported_unit_id"] = reported

    # Staffing
    if unit.get("crew_count") is not None:
        resp["staffing"] = unit["crew_count"]

    # Unable to dispatch
    if unit.get("cancelled"):
        resp["unable_to_dispatch"] = True

    # Timestamps
    TS_MAP = {
        "time_dispatch":           "dispatch",
        "time_enroute_to_scene":   "enroute_to_scene",
        "time_on_scene":           "on_scene",
        "time_canceled_enroute":   "canceled_enroute",
        "time_staging":            "staging",
        "time_unit_clear":         "unit_clear",
    }
    for our_key, neris_key in TS_MAP.items():
        ts = _format_ts(unit.get(our_key))
        if ts:
            resp[neris_key] = ts

    # Response mode
    mode = unit.get("response_mode")
    if mode:
        resp["response_mode"] = mode

    # Transport mode
    transport = unit.get("transport_mode")
    if transport:
        resp["transport_mode"] = transport

    # EMS med_responses (hospital times)
    med = build_med_response(unit)
    if med:
        resp["med_responses"] = [med]

    return resp


def build_med_response(unit: dict) -> dict | None:
    """
    Build NERIS MedResponsePayload from unit's EMS timestamps.
    Only populated if any EMS transport timestamps exist.
    """
    TS_MAP = {
        "time_at_patient":       "at_patient",
        "time_enroute_hospital": "enroute_to_hospital",
        "time_arrived_hospital": "arrived_at_hospital",
        "time_hospital_clear":   "hospital_cleared",
    }

    med = {}
    for our_key, neris_key in TS_MAP.items():
        ts = _format_ts(unit.get(our_key))
        if ts:
            med[neris_key] = ts

    if unit.get("hospital_destination"):
        med["hospital_destination"] = unit["hospital_destination"]

    # Also check for transferred_to timestamps if we add them later
    # "transferred_to_agency" and "transferred_to_facility" not yet in our schema

    return med if med else None


def build_dispatch_comments(incident: dict) -> list | None:
    """
    Build NERIS CommentPayload array from cad_event_comments.
    
    Our cad_event_comments JSONB: {comments: [{text, timestamp, ...}], ...}
    NERIS wants: [{comment: str, timestamp: datetime}, ...]
    """
    comments_data = incident.get("cad_event_comments") or {}
    comments = comments_data.get("comments")
    if not comments or not isinstance(comments, list):
        return None

    result = []
    for c in comments:
        text = c.get("text") or c.get("comment")
        if not text:
            continue
        entry = {"comment": text}
        ts = _format_ts(c.get("timestamp"))
        if ts:
            entry["timestamp"] = ts
        result.append(entry)

    return result if result else None


def build_dispatch(incident: dict, units: list) -> dict:
    """
    Build NERIS DispatchPayload.
    
    PSAP timestamps: call_arrival <= call_answered <= call_create
    Per tenant CAD parser profile, these are either real data or derived.
    We read whatever is in the DB — derivation happens upstream.
    """
    dispatch = {
        "incident_number": incident.get("cad_event_number", ""),
        "location": build_location(incident),
        "unit_responses": [build_unit_response(u) for u in units],
    }

    # PSAP timestamps — REQUIRED by NERIS
    # These come from the DB as-is. Derivation logic lives elsewhere.
    call_arrival = _format_ts(incident.get("psap_call_arrival"))
    call_answered = _format_ts(incident.get("psap_call_answered"))
    call_create = _format_ts(incident.get("time_dispatched"))

    if call_arrival:
        dispatch["call_arrival"] = call_arrival
    if call_answered:
        dispatch["call_answered"] = call_answered
    if call_create:
        dispatch["call_create"] = call_create

    # Incident clear
    clear = _format_ts(incident.get("time_last_cleared"))
    if clear:
        dispatch["incident_clear"] = clear

    # Dispatch point (same as base point typically)
    point = build_geo_point(incident)
    if point:
        dispatch["point"] = point

    # CAD comments
    comments = build_dispatch_comments(incident)
    if comments:
        dispatch["comments"] = comments

    return dispatch
