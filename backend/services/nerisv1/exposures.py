"""
nerisv1: exposures builder (Section 10)

Schema: IncidentPayload.exposures from api-test.neris.fsri.org/v1/openapi.json v1.4.38

exposures: ExposurePayload[] | null

ExposurePayload (additionalProperties: false, required: location_detail, location, damage_type, 9 fields):
  - people_present: boolean|null
  - displacement_count: integer|null
  - location_detail: oneOf ExternalExposurePayload | InternalExposurePayload
    discriminator: type -> EXTERNAL_EXPOSURE | INTERNAL_EXPOSURE
  - location: LocationPayload (shared)
  - location_use: LocationUsePayload|null (shared)
  - point: GeoPoint|null (shared)
  - polygon: HighPrecisionGeoMultipolygon|null (shared)
  - damage_type: TypeExposureDamageValue (MAJOR_DAMAGE, MINOR_DAMAGE, MODERATE_DAMAGE, NO_DAMAGE)
  - displacement_causes: TypeDisplaceCauseValueRelExposure[]|null
    (COLLAPSE, FIRE, HAZARDOUS_SITUATION, OTHER, SMOKE, UTILITIES, WATER)

ExternalExposurePayload (additionalProperties: false, required: type, item_type):
  - type: const "EXTERNAL_EXPOSURE"
  - item_type: TypeExposureItemValue (OBJECT_OTHER, OUTDOOR_ENVIRONMENT, STRUCTURE, VEHICLE)

InternalExposurePayload (additionalProperties: false, required: type):
  - type: const "INTERNAL_EXPOSURE"
"""

from .shared.location import build_location
from .shared.location_use import build_location_use
from .shared.geo import build_geo_point, build_high_precision_geo_multipolygon


def build_external_exposure(data: dict) -> dict:
    """Build ExternalExposurePayload."""
    return {
        "type": "EXTERNAL_EXPOSURE",
        "item_type": data["item_type"],
    }


def build_internal_exposure(data: dict) -> dict:
    """Build InternalExposurePayload."""
    return {"type": "INTERNAL_EXPOSURE"}


def build_exposure(data: dict) -> dict:
    """Build a single ExposurePayload. 9 fields, 3 required."""
    payload = {}

    # --- Required ---

    # location_detail: oneOf, discriminator on type
    ld = data["location_detail"]
    if ld.get("type") == "EXTERNAL_EXPOSURE":
        payload["location_detail"] = build_external_exposure(ld)
    else:
        payload["location_detail"] = build_internal_exposure(ld)

    # location: LocationPayload (required)
    payload["location"] = build_location(data["location"])

    # damage_type: TypeExposureDamageValue (required)
    payload["damage_type"] = data["damage_type"]

    # --- Optional ---

    # people_present: boolean|null
    if data.get("people_present") is not None:
        payload["people_present"] = data["people_present"]

    # displacement_count: integer|null
    if data.get("displacement_count") is not None:
        payload["displacement_count"] = data["displacement_count"]

    # location_use: LocationUsePayload|null
    location_use = build_location_use(data.get("location_use"))
    if location_use is not None:
        payload["location_use"] = location_use

    # point: GeoPoint|null
    point = build_geo_point(data.get("point"))
    if point is not None:
        payload["point"] = point

    # polygon: HighPrecisionGeoMultipolygon|null
    polygon = build_high_precision_geo_multipolygon(data.get("polygon"))
    if polygon is not None:
        payload["polygon"] = polygon

    # displacement_causes: TypeDisplaceCauseValueRelExposure[]|null
    if data.get("displacement_causes") is not None:
        payload["displacement_causes"] = data["displacement_causes"]

    return payload


def build_exposures(data_list: list | None) -> list | None:
    """Build the exposures array for IncidentPayload."""
    if data_list is None:
        return None

    if not data_list:
        return None

    return [build_exposure(item) for item in data_list]
