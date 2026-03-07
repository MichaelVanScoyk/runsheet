"""
nerisv1: IncidentBasePayload builder (Section 1)

Schema: IncidentBasePayload from api-test.neris.fsri.org/v1/openapi.json v1.4.38
Fields: 12, Required: 3 (department_neris_id, incident_number, location)
additionalProperties: false

Required:
  - department_neris_id: string
  - incident_number: string
  - location: LocationPayload

Optional:
  - people_present: boolean|null
  - animals_rescued: integer|null
  - impediment_narrative: string|null (maxLength 100000)
  - outcome_narrative: string|null (maxLength 100000)
  - displacement_count: integer|null
  - displacement_causes: array|null
  - point: GeoPoint|null
  - polygon: HighPrecisionGeoMultipolygon|null
  - location_use: LocationUsePayload|null
"""

from .shared.location import build_location
from .shared.geo import build_geo_point, build_high_precision_geo_multipolygon
from .shared.location_use import build_location_use


def build_base(data: dict) -> dict:
    """
    Build NERIS IncidentBasePayload from a dict with NERIS-native field names.
    Pass-through: reads NERIS names, outputs NERIS names.
    All 12 fields implemented.
    """
    payload = {}

    # --- Required ---

    # department_neris_id: string (required)
    payload["department_neris_id"] = data["department_neris_id"]

    # incident_number: string (required)
    payload["incident_number"] = data["incident_number"]

    # location: LocationPayload (required)
    payload["location"] = build_location(data["location"])

    # --- Optional ---

    # people_present: boolean|null
    if data.get("people_present") is not None:
        payload["people_present"] = data["people_present"]

    # animals_rescued: integer|null
    if data.get("animals_rescued") is not None:
        payload["animals_rescued"] = data["animals_rescued"]

    # impediment_narrative: string|null (minLength 1, maxLength 100000)
    if data.get("impediment_narrative"):
        payload["impediment_narrative"] = data["impediment_narrative"]

    # outcome_narrative: string|null (minLength 1, maxLength 100000)
    if data.get("outcome_narrative"):
        payload["outcome_narrative"] = data["outcome_narrative"]

    # displacement_count: integer|null
    if data.get("displacement_count") is not None:
        payload["displacement_count"] = data["displacement_count"]

    # displacement_causes: array|null
    if data.get("displacement_causes") is not None:
        payload["displacement_causes"] = data["displacement_causes"]

    # point: GeoPoint|null
    point = build_geo_point(data.get("point"))
    if point is not None:
        payload["point"] = point

    # polygon: HighPrecisionGeoMultipolygon|null
    polygon = build_high_precision_geo_multipolygon(data.get("polygon"))
    if polygon is not None:
        payload["polygon"] = polygon

    # location_use: LocationUsePayload|null
    location_use = build_location_use(data.get("location_use"))
    if location_use is not None:
        payload["location_use"] = location_use

    return payload
