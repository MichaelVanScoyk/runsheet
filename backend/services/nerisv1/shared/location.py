"""
nerisv1 shared: LocationPayload builder

Source: IncidentPayload → base.location, dispatch.location, exposures[].location
Schema: LocationPayload from api-test.neris.fsri.org/v1/openapi.json v1.4.38
Fields: 40, Required: 0, additionalProperties: false

All string fields have minLength 1, maxLength 255 — empty strings are invalid.
Enum fields also cannot be empty strings.
Integer field (number) uses is not None check.
Object field (additional_attributes) uses is not None check.
Array fields (cross_streets, location_aliases) use is not None check.

Sub-schemas:
  - cross_streets: CrossStreetPayload[] (array|null)
  - location_aliases: array|null (strings)
  - additional_attributes: object|null

DATA SOURCE: Incident geocode_data JSONB column, populated by
services/location/geocoding.py. An adapter (services/nerisv1/adapters/geocode_adapter.py,
not yet created) will translate geocode_data field names to NERIS LocationPayload
field names before this builder receives them. This builder never reads old
field names — it expects NERIS-native input.

Sub-schema builders:
  - cross_streets: built by shared/cross_street.py build_cross_streets()
  - location_aliases: recursive — array of LocationPayload objects (each is a full 40-field location)
  - additional_attributes: freeform object (e.g. {"common_name": "Eastside Walmart"})
"""

from .cross_street import build_cross_streets


def build_location(data: dict) -> dict:
    """
    Build NERIS LocationPayload from a dict with NERIS-native field names.
    Pass-through: reads NERIS names, outputs NERIS names.
    All 40 fields included.

    String fields use truthiness check (not empty) because spec requires minLength 1.
    Non-string fields use is not None check.
    """
    payload = {}

    # --- Address identification ---
    # additional_attributes: object|null
    if data.get("additional_attributes") is not None:
        payload["additional_attributes"] = data["additional_attributes"]

    # place_type: TypeLocPlaceValue|null (enum — non-empty by definition)
    if data.get("place_type"):
        payload["place_type"] = data["place_type"]

    # --- Community / jurisdiction --- (all string, minLength 1)
    if data.get("postal_community"):
        payload["postal_community"] = data["postal_community"]

    if data.get("neighborhood_community"):
        payload["neighborhood_community"] = data["neighborhood_community"]

    if data.get("unincorporated_community"):
        payload["unincorporated_community"] = data["unincorporated_community"]

    if data.get("incorporated_municipality"):
        payload["incorporated_municipality"] = data["incorporated_municipality"]

    if data.get("county"):
        payload["county"] = data["county"]

    # state: StatesTerrs|null (enum)
    if data.get("state"):
        payload["state"] = data["state"]

    # postal_code: string|null (minLength 1)
    if data.get("postal_code"):
        payload["postal_code"] = data["postal_code"]

    # postal_code_extension: string|null (minLength 1)
    if data.get("postal_code_extension"):
        payload["postal_code_extension"] = data["postal_code_extension"]

    # country: TypeLocCspCountryValue|null (enum)
    if data.get("country"):
        payload["country"] = data["country"]

    # --- Street name components --- (all string minLength 1 or enum)
    if data.get("street_prefix_modifier"):
        payload["street_prefix_modifier"] = data["street_prefix_modifier"]

    if data.get("street_prefix_direction"):
        payload["street_prefix_direction"] = data["street_prefix_direction"]

    if data.get("street"):
        payload["street"] = data["street"]

    if data.get("street_postfix_direction"):
        payload["street_postfix_direction"] = data["street_postfix_direction"]

    if data.get("street_postfix_modifier"):
        payload["street_postfix_modifier"] = data["street_postfix_modifier"]

    # street_prefix: TypeLocSnPrePostValue|null (enum)
    if data.get("street_prefix"):
        payload["street_prefix"] = data["street_prefix"]

    # street_preposition_type_separator: TypeLocSnPreSepValue|null (enum)
    if data.get("street_preposition_type_separator"):
        payload["street_preposition_type_separator"] = data["street_preposition_type_separator"]

    # street_postfix: TypeLocSnPrePostValue|null (enum)
    if data.get("street_postfix"):
        payload["street_postfix"] = data["street_postfix"]

    # direction_of_travel: TypeLocSnDirectionValue|null (enum)
    if data.get("direction_of_travel"):
        payload["direction_of_travel"] = data["direction_of_travel"]

    # --- Address number components ---
    # number_prefix: string|null (minLength 1)
    if data.get("number_prefix"):
        payload["number_prefix"] = data["number_prefix"]

    # number: integer|null (NOT a string — use is not None)
    if data.get("number") is not None:
        payload["number"] = data["number"]

    # number_suffix: string|null (minLength 1)
    if data.get("number_suffix"):
        payload["number_suffix"] = data["number_suffix"]

    # complete_number: string|null (minLength 1)
    if data.get("complete_number"):
        payload["complete_number"] = data["complete_number"]

    # distance_marker: string|null (minLength 1)
    if data.get("distance_marker"):
        payload["distance_marker"] = data["distance_marker"]

    # --- Sub-address components --- (all string minLength 1)
    if data.get("structure"):
        payload["structure"] = data["structure"]

    if data.get("subsite"):
        payload["subsite"] = data["subsite"]

    if data.get("site"):
        payload["site"] = data["site"]

    if data.get("wing"):
        payload["wing"] = data["wing"]

    if data.get("floor"):
        payload["floor"] = data["floor"]

    if data.get("unit_prefix"):
        payload["unit_prefix"] = data["unit_prefix"]

    if data.get("unit_value"):
        payload["unit_value"] = data["unit_value"]

    if data.get("room"):
        payload["room"] = data["room"]

    if data.get("section"):
        payload["section"] = data["section"]

    if data.get("row"):
        payload["row"] = data["row"]

    if data.get("seat"):
        payload["seat"] = data["seat"]

    # additional_info: string|null (minLength 1)
    if data.get("additional_info"):
        payload["additional_info"] = data["additional_info"]

    # marker: string|null (minLength 1)
    if data.get("marker"):
        payload["marker"] = data["marker"]

    # --- Cross streets ---
    # cross_streets: CrossStreetPayload[]|null
    cross_streets = build_cross_streets(data.get("cross_streets"))
    if cross_streets is not None:
        payload["cross_streets"] = cross_streets

    # --- Location aliases ---
    # location_aliases: LocationPayload[]|null (recursive — each alias is a full LocationPayload)
    aliases = data.get("location_aliases")
    if aliases is not None:
        payload["location_aliases"] = [build_location(a) for a in aliases if a]

    return payload
