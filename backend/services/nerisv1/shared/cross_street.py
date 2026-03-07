"""
nerisv1 shared: CrossStreetPayload builder

Source: LocationPayload.cross_streets from api-test.neris.fsri.org/v1/openapi.json v1.4.38
Schema: CrossStreetPayload
Fields: 15, Required: 0, additionalProperties: false

Fields (all nullable):
  - number_prefix: string|null (minLength 1, maxLength 255)
  - number: integer|null
  - number_suffix: string|null (minLength 1, maxLength 255)
  - complete_number: string|null (minLength 1, maxLength 255)
  - distance_marker: string|null (minLength 1, maxLength 255)
  - street_prefix_modifier: string|null (minLength 1, maxLength 255)
  - street_prefix_direction: string|null (minLength 1, maxLength 255)
  - street: string|null (minLength 1, maxLength 255)
  - street_postfix_direction: string|null (minLength 1, maxLength 255)
  - street_postfix_modifier: string|null (minLength 1, maxLength 255)
  - street_prefix: TypeLocSnPrePostValue|null (enum)
  - street_preposition_type_separator: TypeLocSnPreSepValue|null (enum)
  - street_postfix: TypeLocSnPrePostValue|null (enum)
  - direction_of_travel: TypeLocSnDirectionValue|null (enum)
  - cross_street_modifier: TypeLocationCrossStreetValue|null (enum: CLOSEST, INCIDENT_IN_INTERSECTION, SECOND_CLOSEST)

Used by: LocationPayload.cross_streets (array of CrossStreetPayload)
"""


def build_cross_street(data: dict) -> dict:
    """
    Build one NERIS CrossStreetPayload from a dict with NERIS-native field names.
    All 15 fields. String fields use truthiness (minLength 1).
    """
    payload = {}

    # String fields (minLength 1) — use truthiness
    for field in (
        "number_prefix", "number_suffix", "complete_number", "distance_marker",
        "street_prefix_modifier", "street_prefix_direction", "street",
        "street_postfix_direction", "street_postfix_modifier",
    ):
        if data.get(field):
            payload[field] = data[field]

    # Integer field — use is not None
    if data.get("number") is not None:
        payload["number"] = data["number"]

    # Enum fields — use truthiness (enums are never empty strings)
    for field in (
        "street_prefix", "street_preposition_type_separator",
        "street_postfix", "direction_of_travel", "cross_street_modifier",
    ):
        if data.get(field):
            payload[field] = data[field]

    return payload


def build_cross_streets(data_list: list | None) -> list | None:
    """
    Build NERIS CrossStreetPayload array.
    Returns None if input is None or empty.
    """
    if not data_list:
        return None

    result = [build_cross_street(cs) for cs in data_list if cs]
    return result if result else None
