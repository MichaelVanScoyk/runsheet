"""
NERIS Tactic Timestamps Payload Builder

Maps our DB fields → NERIS IncidentTacticTimestampsPayload
                   + DispatchTacticTimestampsPayload

Source DB fields:
  - incidents.time_command_established
  - incidents.time_sizeup_completed
  - incidents.time_suppression_complete
  - incidents.time_primary_search_begin
  - incidents.time_primary_search_complete
  - incidents.time_water_on_fire
  - incidents.time_fire_under_control
  - incidents.time_fire_knocked_down
  - incidents.time_extrication_complete

NERIS target: IncidentTacticTimestampsPayload, DispatchTacticTimestampsPayload
Note: Both payloads have identical fields in the NERIS API.
      Incident-level = our department's timestamps.
      Dispatch-level = PSAP/CAD-reported timestamps (if available).
"""


def _format_ts(val) -> str | None:
    if val is None:
        return None
    if isinstance(val, str):
        return val if val else None
    return val.isoformat()


# Our DB field → NERIS field mapping
_TS_MAP = {
    "time_command_established":      "command_established",
    "time_sizeup_completed":         "completed_sizeup",
    "time_suppression_complete":     "suppression_complete",
    "time_primary_search_begin":     "primary_search_begin",
    "time_primary_search_complete":  "primary_search_complete",
    "time_water_on_fire":            "water_on_fire",
    "time_fire_under_control":       "fire_under_control",
    "time_fire_knocked_down":        "fire_knocked_down",
    "time_extrication_complete":     "extrication_complete",
}


def build_tactic_timestamps(incident: dict) -> dict | None:
    """
    Build NERIS IncidentTacticTimestampsPayload from incident row.
    Returns None if no tactic timestamps exist.
    """
    payload = {}

    for our_key, neris_key in _TS_MAP.items():
        ts = _format_ts(incident.get(our_key))
        if ts:
            payload[neris_key] = ts

    return payload if payload else None


def build_dispatch_tactic_timestamps(incident: dict) -> dict | None:
    """
    Build NERIS DispatchTacticTimestampsPayload.
    
    These are CAD-reported tactic timestamps — separate from our department's.
    Currently we store them in the same incident fields.
    If a tenant has separate CAD-reported tactic data, it would go here.
    
    For now, returns None — dispatch tactic timestamps are the same structure
    but sourced differently. We'll populate when CAD provides them.
    """
    # Future: read from cad_event_comments.detected_timestamps or similar
    return None
