"""
nerisv1: hazsit_detail builder (Section 13)

Schema: IncidentPayload.hazsit_detail from api-test.neris.fsri.org/v1/openapi.json v1.4.38

hazsit_detail: HazsitPayload | null
Conditional: only when incident type starts with HAZSIT||

HazsitPayload (additionalProperties: false, 3 fields, required: evacuated, disposition):
  - evacuated: integer (required)
  - chemicals: ChemicalPayload[]|null
  - disposition: TypeHazardDispositionValue (8 values, required)

ChemicalPayload (additionalProperties: false, 4 fields, required: name, release_occurred, dot_class):
  - name: string (minLength 1, maxLength 255, required)
  - release_occurred: boolean (required)
  - release: ReleasePayload|null
  - dot_class: TypeHazardDotValue (9 values, required)

ReleasePayload (additionalProperties: false, 5 fields, required: none):
  - estimated_amount: number|null
  - unit_of_measurement: TypeHazardUnitValue|null (33 values)
  - physical_state: TypeHazardPhysicalStateValue|null (5 values)
  - released_into: TypeHazardReleasedIntoValue|null (3 values)
  - cause: TypeHazardCauseValue|null (5 values)
"""


def build_release(data: dict | None) -> dict | None:
    """Build ReleasePayload. 5 fields, none required."""
    if data is None:
        return None

    payload = {}

    # estimated_amount: number|null
    if data.get("estimated_amount") is not None:
        payload["estimated_amount"] = data["estimated_amount"]

    # unit_of_measurement: TypeHazardUnitValue|null
    if data.get("unit_of_measurement") is not None:
        payload["unit_of_measurement"] = data["unit_of_measurement"]

    # physical_state: TypeHazardPhysicalStateValue|null
    if data.get("physical_state") is not None:
        payload["physical_state"] = data["physical_state"]

    # released_into: TypeHazardReleasedIntoValue|null
    if data.get("released_into") is not None:
        payload["released_into"] = data["released_into"]

    # cause: TypeHazardCauseValue|null
    if data.get("cause") is not None:
        payload["cause"] = data["cause"]

    return payload if payload else {}


def build_chemical(data: dict) -> dict:
    """Build a single ChemicalPayload. 4 fields, 3 required."""
    payload = {}

    # name: string (required)
    payload["name"] = data["name"]

    # release_occurred: boolean (required)
    payload["release_occurred"] = data["release_occurred"]

    # dot_class: TypeHazardDotValue (required)
    payload["dot_class"] = data["dot_class"]

    # release: ReleasePayload|null
    rel = build_release(data.get("release"))
    if rel is not None:
        payload["release"] = rel

    return payload


def build_hazsit_detail(data: dict | None) -> dict | None:
    """
    Build HazsitPayload for IncidentPayload.
    3 fields, 2 required. Pass-through with NERIS-native field names.
    """
    if data is None:
        return None

    payload = {}

    # --- Required ---

    # evacuated: integer (required)
    payload["evacuated"] = data["evacuated"]

    # disposition: TypeHazardDispositionValue (required)
    payload["disposition"] = data["disposition"]

    # --- Optional ---

    # chemicals: ChemicalPayload[]|null
    if data.get("chemicals") is not None:
        payload["chemicals"] = [build_chemical(c) for c in data["chemicals"]]

    return payload
