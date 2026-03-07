"""
nerisv1 shared: LocationUsePayload builder

Source: Used by IncidentBasePayload, ExposurePayload
Schema: api-test.neris.fsri.org/v1/openapi.json v1.4.38

LocationUsePayload:
  - in_use: InusePayload|null
  - use_type: TypeLocationUseValue|null (enum)
  - vacancy_cause: TypeVacancyValue|null (enum)
  - secondary_use: TypeLocationUseValue|null (enum)
  Fields: 4, Required: 0, additionalProperties: false

InusePayload:
  - in_use: boolean (required)
  - intended: boolean|null
  Fields: 2, Required: 1
"""


def build_location_use(data: dict) -> dict | None:
    """
    Build NERIS LocationUsePayload from a dict with NERIS-native field names.
    Pass-through: reads NERIS names, outputs NERIS names.
    Returns None if data is None/empty.
    """
    if not data:
        return None

    payload = {}

    # in_use: InusePayload|null
    in_use_data = data.get("in_use")
    if in_use_data is not None:
        in_use = {"in_use": in_use_data["in_use"]}
        if in_use_data.get("intended") is not None:
            in_use["intended"] = in_use_data["intended"]
        payload["in_use"] = in_use

    # use_type: TypeLocationUseValue|null (enum)
    if data.get("use_type") is not None:
        payload["use_type"] = data["use_type"]

    # vacancy_cause: TypeVacancyValue|null (enum)
    if data.get("vacancy_cause") is not None:
        payload["vacancy_cause"] = data["vacancy_cause"]

    # secondary_use: TypeLocationUseValue|null (enum)
    if data.get("secondary_use") is not None:
        payload["secondary_use"] = data["secondary_use"]

    return payload if payload else None
