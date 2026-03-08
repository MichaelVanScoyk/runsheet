"""
nerisv1: DispatchPayload builder (Section 3)

Schema: DispatchPayload from api-test.neris.fsri.org/v1/openapi.json v1.4.38
Fields: 15, Required: 6 (incident_number, call_arrival, call_answered, call_create, location, unit_responses)
additionalProperties: false

Required:
  - incident_number: string (pattern [\\w\\-\\:]+)
  - call_arrival: datetime
  - call_answered: datetime
  - call_create: datetime
  - location: LocationPayload
  - unit_responses: DispatchUnitResponsePayload[]

Optional:
  - center_id: string|null (minLength 1, maxLength 255)
  - determinant_code: string|null (minLength 1, maxLength 8)
  - incident_code: string|null (minLength 1, maxLength 255)
  - disposition: string|null (minLength 1, maxLength 255)
  - automatic_alarm: boolean|null
  - incident_clear: datetime|null
  - point: GeoPoint|null
  - comments: CommentPayload[]|null
  - tactic_timestamps: DispatchTacticTimestampsPayload|null

Sub-schemas (local to dispatch):
  CommentPayload (additionalProperties: false, required: comment):
    - comment: string (minLength 1, maxLength 100000)
    - timestamp: datetime|null

  DispatchTacticTimestampsPayload (additionalProperties: false, required: none):
    - command_established: datetime|null
    - completed_sizeup: datetime|null
    - suppression_complete: datetime|null
    - primary_search_begin: datetime|null
    - primary_search_complete: datetime|null
    - water_on_fire: datetime|null
    - fire_under_control: datetime|null
    - fire_knocked_down: datetime|null
    - extrication_complete: datetime|null

  DispatchUnitResponsePayload (additionalProperties: false, required: none):
    - unit_neris_id: string|null
    - reported_unit_id: string|null (minLength 1, maxLength 255)
    - staffing: integer|null
    - unable_to_dispatch: boolean|null
    - dispatch: datetime|null
    - enroute_to_scene: datetime|null
    - on_scene: datetime|null
    - canceled_enroute: datetime|null
    - staging: datetime|null
    - unit_clear: datetime|null
    - med_responses: MedResponsePayload[]|null (shared)
    - point: GeoPoint|null
    - response_mode: TypeResponseModeValue|null (EMERGENT, NON_EMERGENT)
    - transport_mode: TypeResponseModeValue|null (EMERGENT, NON_EMERGENT)
"""

from .shared.location import build_location
from .shared.geo import build_geo_point
from .shared.med_response import build_med_responses


def build_comment(data: dict) -> dict:
    """Build a single CommentPayload."""
    payload = {}

    # comment: string (required, minLength 1, maxLength 100000)
    payload["comment"] = data["comment"]

    # timestamp: datetime|null
    if data.get("timestamp") is not None:
        payload["timestamp"] = data["timestamp"]

    return payload


def build_dispatch_tactic_timestamps(data: dict | None) -> dict | None:
    """Build DispatchTacticTimestampsPayload. 9 fields, all datetime|null, none required."""
    if data is None:
        return None

    payload = {}

    timestamp_fields = [
        "command_established",
        "completed_sizeup",
        "suppression_complete",
        "primary_search_begin",
        "primary_search_complete",
        "water_on_fire",
        "fire_under_control",
        "fire_knocked_down",
        "extrication_complete",
    ]

    for field in timestamp_fields:
        if data.get(field) is not None:
            payload[field] = data[field]

    return payload if payload else {}


def build_dispatch_unit_response(data: dict) -> dict:
    """Build a single DispatchUnitResponsePayload. 14 fields, none required."""
    payload = {}

    # unit_neris_id: string|null
    if data.get("unit_neris_id"):
        payload["unit_neris_id"] = data["unit_neris_id"]

    # reported_unit_id: string|null (minLength 1, maxLength 255)
    if data.get("reported_unit_id"):
        payload["reported_unit_id"] = data["reported_unit_id"]

    # staffing: integer|null
    if data.get("staffing") is not None:
        payload["staffing"] = data["staffing"]

    # unable_to_dispatch: boolean|null
    if data.get("unable_to_dispatch") is not None:
        payload["unable_to_dispatch"] = data["unable_to_dispatch"]

    # dispatch: datetime|null
    if data.get("dispatch") is not None:
        payload["dispatch"] = data["dispatch"]

    # enroute_to_scene: datetime|null
    if data.get("enroute_to_scene") is not None:
        payload["enroute_to_scene"] = data["enroute_to_scene"]

    # on_scene: datetime|null
    if data.get("on_scene") is not None:
        payload["on_scene"] = data["on_scene"]

    # canceled_enroute: datetime|null
    if data.get("canceled_enroute") is not None:
        payload["canceled_enroute"] = data["canceled_enroute"]

    # staging: datetime|null
    if data.get("staging") is not None:
        payload["staging"] = data["staging"]

    # unit_clear: datetime|null
    if data.get("unit_clear") is not None:
        payload["unit_clear"] = data["unit_clear"]

    # med_responses: MedResponsePayload[]|null
    med = build_med_responses(data.get("med_responses"))
    if med is not None:
        payload["med_responses"] = med

    # point: GeoPoint|null
    point = build_geo_point(data.get("point"))
    if point is not None:
        payload["point"] = point

    # response_mode: TypeResponseModeValue|null (EMERGENT, NON_EMERGENT)
    if data.get("response_mode") is not None:
        payload["response_mode"] = data["response_mode"]

    # transport_mode: TypeResponseModeValue|null (EMERGENT, NON_EMERGENT)
    if data.get("transport_mode") is not None:
        payload["transport_mode"] = data["transport_mode"]

    return payload


def build_dispatch(data: dict) -> dict:
    """
    Build NERIS DispatchPayload from a dict with NERIS-native field names.
    Pass-through: reads NERIS names, outputs NERIS names.
    All 15 fields implemented.
    """
    payload = {}

    # --- Required ---

    # incident_number: string (required)
    payload["incident_number"] = data["incident_number"]

    # call_arrival: datetime (required)
    payload["call_arrival"] = data["call_arrival"]

    # call_answered: datetime (required)
    payload["call_answered"] = data["call_answered"]

    # call_create: datetime (required)
    payload["call_create"] = data["call_create"]

    # location: LocationPayload (required)
    payload["location"] = build_location(data["location"])

    # unit_responses: DispatchUnitResponsePayload[] (required)
    payload["unit_responses"] = [
        build_dispatch_unit_response(ur) for ur in data["unit_responses"]
    ]

    # --- Optional ---

    # center_id: string|null (minLength 1, maxLength 255)
    if data.get("center_id"):
        payload["center_id"] = data["center_id"]

    # determinant_code: string|null (minLength 1, maxLength 8)
    if data.get("determinant_code"):
        payload["determinant_code"] = data["determinant_code"]

    # incident_code: string|null (minLength 1, maxLength 255)
    if data.get("incident_code"):
        payload["incident_code"] = data["incident_code"]

    # disposition: string|null (minLength 1, maxLength 255)
    if data.get("disposition"):
        payload["disposition"] = data["disposition"]

    # automatic_alarm: boolean|null
    if data.get("automatic_alarm") is not None:
        payload["automatic_alarm"] = data["automatic_alarm"]

    # incident_clear: datetime|null
    if data.get("incident_clear") is not None:
        payload["incident_clear"] = data["incident_clear"]

    # point: GeoPoint|null
    point = build_geo_point(data.get("point"))
    if point is not None:
        payload["point"] = point

    # comments: CommentPayload[]|null
    if data.get("comments") is not None:
        payload["comments"] = [build_comment(c) for c in data["comments"]]

    # tactic_timestamps: DispatchTacticTimestampsPayload|null
    tt = build_dispatch_tactic_timestamps(data.get("tactic_timestamps"))
    if tt is not None:
        payload["tactic_timestamps"] = tt

    return payload
