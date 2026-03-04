"""
NERIS Dispatch Payload Builder

Reads from both:
  - incidents.cad_units JSONB (CAD timestamps)
  - incident_units table (crew assignments, staging, med_responses)

Source DB fields:
  - incidents.cad_event_number
  - incidents.time_dispatched (→ call_create)
  - incidents.time_last_cleared (→ incident_clear)
  - incidents.psap_call_arrival (→ call_arrival)
  - incidents.psap_call_answered (→ call_answered)
  - incidents.cad_units (JSONB array → base unit timestamps)
  - incidents.cad_event_comments (JSONB → comments)
  - incident_units table (crew_count, staging, canceled, med_response timestamps)

NERIS target: DispatchPayload with unit_responses[], also top-level unit_responses[]
"""

from .payload_location import build_location, build_geo_point


def _format_ts(val) -> str | None:
    """Format a datetime/string value as ISO 8601 with timezone."""
    if val is None:
        return None
    if isinstance(val, str):
        return val if val else None
    return val.isoformat()


def _build_unit_lookup(incident_units: list) -> dict:
    """
    Build lookup from apparatus_id → incident_unit dict.
    Includes crew_count, staging, canceled, med_response timestamps.
    """
    lookup = {}
    for iu in incident_units:
        app_id = iu.get("apparatus_id")
        if app_id:
            lookup[app_id] = iu
    return lookup


def build_unit_response(cad_unit: dict, iu: dict | None = None) -> dict:
    """
    Build one NERIS unit response from cad_units JSONB + incident_units row.
    
    cad_units provides: unit_id, core CAD timestamps
    incident_units provides: crew_count, staging, canceled_enroute, med_response timestamps
    """
    resp = {}

    unit_id = cad_unit.get("unit_id")
    if unit_id:
        resp["reported_unit_id"] = unit_id

    # Staffing from incident_units crew_count, default 1
    crew = iu.get("crew_count") if iu else None
    resp["staffing"] = crew if crew is not None else 1

    # Core timestamps from cad_units JSONB
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

    # Additional timestamps from incident_units
    if iu:
        staging = _format_ts(iu.get("time_staging"))
        if staging:
            resp["staging"] = staging

        # Canceled enroute — boolean in NERIS, we have a timestamp
        if iu.get("time_canceled_enroute") or iu.get("cancelled"):
            resp["canceled_enroute"] = True

        # Response mode
        mode = iu.get("response_mode")
        if mode:
            resp["response_mode"] = mode

        # Transport mode (EMS)
        transport = iu.get("transport_mode")
        if transport:
            resp["transport_mode"] = transport

        # Med responses — build array if any EMS timestamps present
        med = _build_med_response(iu)
        if med:
            resp["med_responses"] = [med]

    return resp


def _build_med_response(iu: dict) -> dict | None:
    """
    Build MedResponsePayload from incident_unit timestamps.
    Only returns if at least one med timestamp exists.
    """
    fields = {
        "time_at_patient":       "at_patient",
        "time_enroute_hospital": "enroute_to_hospital",
        "time_arrived_hospital": "arrived_at_hospital",
        "time_hospital_clear":   "hospital_cleared",
    }

    med = {}
    for db_key, neris_key in fields.items():
        ts = _format_ts(iu.get(db_key))
        if ts:
            med[neris_key] = ts

    dest = iu.get("hospital_destination")
    if dest:
        med["hospital_destination"] = dest

    return med if med else None


def build_dispatch_comments(incident: dict) -> list | None:
    """
    Build NERIS CommentPayload array from cad_event_comments.
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
    
    Unit data merges cad_units JSONB (CAD timestamps) with incident_units
    (crew, staging, med_responses).
    """
    # Build lookup from incident_units by apparatus_id
    unit_lookup = _build_unit_lookup(units)

    cad_units = incident.get("cad_units") or []
    unit_responses = []
    for cu in cad_units:
        if cu.get("is_mutual_aid"):
            continue

        has_enroute = bool(cu.get("time_enroute"))
        has_arrived = bool(cu.get("time_arrived"))
        if not has_enroute and not has_arrived:
            continue

        # Match incident_unit row by apparatus_id
        app_id = cu.get("apparatus_id")
        iu = unit_lookup.get(app_id) if app_id else None
        unit_responses.append(build_unit_response(cu, iu))

    dispatch = {
        "incident_number": incident.get("cad_event_number", ""),
        "location": build_location(incident),
        "unit_responses": unit_responses,
    }

    # PSAP timestamps
    # IMPORTANT: NERIS requires call_arrival <= call_answered <= call_create
    # call_create is the LATEST — when CAD incident was formally opened (after call answered)
    # If call_arrival or call_answered are unknown, they may equal call_create per NERIS guidance.
    # Source: NERIS Minimum Data Requirements FAQ (neris.atlassian.net/wiki/spaces/NKB)
    call_arrival = _format_ts(incident.get("psap_call_arrival"))
    call_answered = _format_ts(incident.get("psap_call_answered"))
    call_create = _format_ts(incident.get("time_dispatched"))

    # Fallback: if PSAP timestamps missing, derive from call_create (acceptable per NERIS)
    if call_create:
        dispatch["call_create"] = call_create
        dispatch["call_arrival"] = call_arrival if call_arrival else call_create
        dispatch["call_answered"] = call_answered if call_answered else call_create
    else:
        if call_arrival:
            dispatch["call_arrival"] = call_arrival
        if call_answered:
            dispatch["call_answered"] = call_answered

    clear = _format_ts(incident.get("time_last_cleared"))
    if clear:
        dispatch["incident_clear"] = clear

    point = build_geo_point(incident)
    if point:
        dispatch["point"] = point

    comments = build_dispatch_comments(incident)
    if comments:
        dispatch["comments"] = comments

    # Incident code — from CAD event type
    incident_code = incident.get("cad_event_type")
    if incident_code:
        dispatch["incident_code"] = incident_code

    # Determinant code (EMD/EFD)
    det_code = incident.get("neris_dispatch_determinant_code")
    if det_code:
        dispatch["determinant_code"] = det_code

    # Automatic alarm
    auto_alarm = incident.get("neris_dispatch_automatic_alarm")
    if auto_alarm is not None:
        dispatch["automatic_alarm"] = auto_alarm

    # Disposition
    disposition = incident.get("neris_dispatch_disposition")
    if disposition:
        dispatch["disposition"] = disposition

    # Center ID (PSAP)
    center_id = incident.get("neris_dispatch_center_id")
    if center_id:
        dispatch["center_id"] = center_id

    return dispatch


def build_incident_unit_responses(incident: dict, units: list) -> list | None:
    """
    Build top-level unit_responses[] — units that ACTUALLY responded.
    
    NERIS has unit_responses at two levels:
      dispatch.unit_responses = units that were DISPATCHED
      (top-level) unit_responses = units that ACTUALLY RESPONDED
    
    For most incidents these are identical. A unit dispatched then
    canceled_enroute would appear in dispatch but not top-level.
    """
    unit_lookup = _build_unit_lookup(units)

    cad_units = incident.get("cad_units") or []
    responded = []
    for cu in cad_units:
        if cu.get("is_mutual_aid"):
            continue

        # For top-level: must have actually arrived on scene
        has_arrived = bool(cu.get("time_arrived"))
        if not has_arrived:
            continue

        app_id = cu.get("apparatus_id")
        iu = unit_lookup.get(app_id) if app_id else None

        # Skip if canceled enroute
        if iu and (iu.get("time_canceled_enroute") or iu.get("cancelled")):
            continue

        responded.append(build_unit_response(cu, iu))

    return responded if responded else None
