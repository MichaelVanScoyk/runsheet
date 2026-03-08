"""
nerisv1: electric_hazards builder (Section 20)

Schema: IncidentPayload.electric_hazards from api-test.neris.fsri.org/v1/openapi.json v1.4.38

electric_hazards: ElectricHazardPayload[] | null

ElectricHazardPayload (additionalProperties: false, 4 fields, required: type):
  - fire_details: ElectricHazardFirePayload|null
  - type: TypeEmerghazElecValue (48 values)
  - source_or_target: TypeSourceTargetValue|null (SOURCE, TARGET, UNKNOWN)
  - involved_in_crash: boolean|null

ElectricHazardFirePayload (additionalProperties: false, 2 fields, required: none):
  - reignition: boolean|null
  - suppression_types: TypeEmerghazSuppressionValue[]|null (6 values)
"""


def build_electric_hazard_fire(data: dict | None) -> dict | None:
    if data is None:
        return None
    payload = {}

    # reignition: boolean|null
    if data.get("reignition") is not None:
        payload["reignition"] = data["reignition"]

    # suppression_types: TypeEmerghazSuppressionValue[]|null
    if data.get("suppression_types") is not None:
        payload["suppression_types"] = data["suppression_types"]

    return payload if payload else {}


def build_electric_hazard(data: dict) -> dict:
    """Build a single ElectricHazardPayload. 4 fields, 1 required."""
    payload = {}

    # type: TypeEmerghazElecValue (required)
    payload["type"] = data["type"]

    # fire_details: ElectricHazardFirePayload|null
    fd = build_electric_hazard_fire(data.get("fire_details"))
    if fd is not None:
        payload["fire_details"] = fd

    # source_or_target: TypeSourceTargetValue|null
    if data.get("source_or_target") is not None:
        payload["source_or_target"] = data["source_or_target"]

    # involved_in_crash: boolean|null
    if data.get("involved_in_crash") is not None:
        payload["involved_in_crash"] = data["involved_in_crash"]

    return payload


def build_electric_hazards(data_list: list | None) -> list | None:
    if data_list is None:
        return None
    if not data_list:
        return None
    return [build_electric_hazard(item) for item in data_list]
