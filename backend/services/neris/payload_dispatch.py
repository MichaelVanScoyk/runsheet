"""
NERIS Dispatch Payload Builder

Reads directly from the incident record — no intermediary tables.

Source DB fields:
  - incidents.cad_event_number
  - incidents.time_dispatched (→ call_create)
  - incidents.time_last_cleared (→ incident_clear)
  - incidents.psap_call_arrival (→ call_arrival)
  - incidents.psap_call_answered (→ call_answered)
  - incidents.cad_units (JSONB array → unit_responses)
  - incidents.cad_event_comments (JSONB → comments)
  - incident_units (crew_count only, matched by apparatus_id)

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


def build_unit_response(cad_unit: dict, crew_count: int | None = None) -> dict:
    """
    Build one NERIS IncidentUnitResponsePayload from a cad_units JSONB entry.
    
    cad_units JSONB fields:
      unit_id, time_dispatched, time_enroute, time_arrived, time_cleared,
      is_mutual_aid, apparatus_id, station, agency, source
    
    crew_count comes from incident_units matched by apparatus_id.
    """
    resp = {}

    # Unit identification — use the CAD unit ID directly
    unit_id = cad_unit.get("unit_id")
    if unit_id:
        resp["reported_unit_id"] = unit_id

    # Staffing from incident_units (personnel assignments)
    # Default to 1 if no crew count — a unit that responded had at least 1 person
    resp["staffing"] = crew_count if crew_count is not None else 1

    # Timestamps — read directly from cad_units JSONB
    ts_map = {
        "time_dispatched": "dispatch",
        "time_enroute":    "enroute_to_scene",
        "time_arrived":    "on_scene",
        "time_cleared":    "unit_clear",
    }
    for cad_key, neris_key in ts_map.items():
        ts = _format_ts(cad_unit.get(cad_key))
        if ts:
            resp[neris_key] = ts

    return resp


def _build_crew_lookup(incident_units: list) -> dict:
    """
    Build a lookup from apparatus_id → crew_count from incident_units.
    This is the only data we pull from incident_units — crew assignments.
    """
    lookup = {}
    for iu in incident_units:
        app_id = iu.get("apparatus_id")
        count = iu.get("crew_count")
        if app_id and count is not None:
            lookup[app_id] = count
    return lookup


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
    
    Unit data comes from incidents.cad_units JSONB (the source of truth).
    Crew counts come from incident_units (personnel assignments).
    
    PSAP timestamps: call_arrival <= call_answered <= call_create
    """
    # Build crew count lookup from incident_units
    crew_lookup = _build_crew_lookup(units)

    # Build unit responses from cad_units JSONB on the incident
    # Filters:
    #   1. Skip mutual aid units (is_mutual_aid=true) — those go in aids module
    #   2. Skip units that never responded — must have time_enroute OR time_arrived
    #      (county sometimes misses enroute but records arrived, so either counts)
    cad_units = incident.get("cad_units") or []
    unit_responses = []
    for cu in cad_units:
        # Skip mutual aid units — not our department's response
        if cu.get("is_mutual_aid"):
            continue

        # Skip units that never actually responded
        has_enroute = bool(cu.get("time_enroute"))
        has_arrived = bool(cu.get("time_arrived"))
        if not has_enroute and not has_arrived:
            continue

        # Match crew count by apparatus_id
        app_id = cu.get("apparatus_id")
        crew_count = crew_lookup.get(app_id) if app_id else None
        unit_responses.append(build_unit_response(cu, crew_count))

    dispatch = {
        "incident_number": incident.get("cad_event_number", ""),
        "location": build_location(incident),
        "unit_responses": unit_responses,
    }

    # PSAP timestamps — REQUIRED by NERIS
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

    # Dispatch point
    point = build_geo_point(incident)
    if point:
        dispatch["point"] = point

    # CAD comments
    comments = build_dispatch_comments(incident)
    if comments:
        dispatch["comments"] = comments

    return dispatch
