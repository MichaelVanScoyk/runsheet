"""
nerisv1: incident_types builder (Section 2)

Schema: IncidentPayload.incident_types from api-test.neris.fsri.org/v1/openapi.json v1.4.38

incident_types is anyOf:
  - IncidentTypePayload[] (minItems 1, maxItems 3)
  - IncidentTypeCadPayload[] (minItems 1, maxItems 1)

IncidentTypePayload (additionalProperties: false):
  - type: TypeIncidentValue (required)
  - primary: boolean|null (optional)

IncidentTypeCadPayload (additionalProperties: false):
  - type: string, const "UNDETERMINED" (required)
"""


def build_incident_type(data: dict) -> dict:
    """
    Build a single IncidentTypePayload from a dict with NERIS-native field names.
    """
    payload = {}

    # type: TypeIncidentValue (required)
    payload["type"] = data["type"]

    # primary: boolean|null (optional)
    if data.get("primary") is not None:
        payload["primary"] = data["primary"]

    return payload


def build_incident_type_cad(data: dict) -> dict:
    """
    Build a single IncidentTypeCadPayload from a dict with NERIS-native field names.
    """
    # type: string, const "UNDETERMINED" (required)
    return {"type": data["type"]}


def build_incident_types(data_list: list) -> list:
    """
    Build the incident_types array for IncidentPayload.

    Accepts a list of dicts. If the first item has type == "UNDETERMINED",
    builds as IncidentTypeCadPayload[] (max 1). Otherwise builds as
    IncidentTypePayload[] (max 3).
    """
    if not data_list:
        raise ValueError("incident_types requires at least 1 item")

    if data_list[0].get("type") == "UNDETERMINED":
        return [build_incident_type_cad(data_list[0])]

    return [build_incident_type(item) for item in data_list]
