"""
nerisv1: unit_responses builder (Section 9)

Schema: IncidentPayload.unit_responses from api-test.neris.fsri.org/v1/openapi.json v1.4.38

unit_responses: IncidentUnitResponsePayload[] | null

IncidentUnitResponsePayload (additionalProperties: false, required: none, 14 fields):
  - unit_neris_id: string|null (pattern ^FD\\d{8}S\\d{3}U\\d{3}$)
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
  - point: GeoPoint|null (shared)
  - response_mode: TypeResponseModeValue|null (EMERGENT, NON_EMERGENT)
  - transport_mode: TypeResponseModeValue|null (EMERGENT, NON_EMERGENT)

Note: Same 14 fields as DispatchUnitResponsePayload (section 3) but a
separate schema in the spec. IncidentPayload refs IncidentUnitResponsePayload,
DispatchPayload refs DispatchUnitResponsePayload.
"""

from .shared.geo import build_geo_point
from .shared.med_response import build_med_responses


def build_incident_unit_response(data: dict) -> dict:
    """Build a single IncidentUnitResponsePayload. 14 fields, none required."""
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


def build_unit_responses(data_list: list | None) -> list | None:
    """Build the unit_responses array for IncidentPayload."""
    if data_list is None:
        return None

    if not data_list:
        return None

    return [build_incident_unit_response(item) for item in data_list]
