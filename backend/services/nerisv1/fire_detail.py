"""
nerisv1: fire_detail builder (Section 12)

Schema: IncidentPayload.fire_detail from api-test.neris.fsri.org/v1/openapi.json v1.4.38

fire_detail: FirePayload | null
Conditional: only when incident type starts with FIRE||

FirePayload (additionalProperties: false, 5 fields,
  required: location_detail, water_supply, investigation_needed, investigation_types):
  - location_detail: oneOf StructureFireLocationDetailPayload | OutsideFireLocationDetailPayload
    disc=type: STRUCTURE | OUTSIDE
  - water_supply: TypeWaterSupplyValue (9 values)
  - investigation_needed: TypeFireInvestNeedValue (6 values)
  - investigation_types: TypeFireInvestValue[] (8 values, required array)
  - suppression_appliances: TypeSuppressApplianceValue[]|null (12 values)

StructureFireLocationDetailPayload (additionalProperties: false, 7 fields,
  required: floor_of_origin, arrival_condition, damage_type, room_of_origin_type, cause):
  - type: const "STRUCTURE"
  - progression_evident: boolean|null
  - floor_of_origin: integer (required)
  - arrival_condition: TypeFireConditionArrivalValue (6 values, required)
  - damage_type: TypeFireBldgDamageValue (4 values, required)
  - room_of_origin_type: TypeRoomValue (14 values, required)
  - cause: TypeFireCauseInValue (13 values, required)

OutsideFireLocationDetailPayload (additionalProperties: false, 3 fields, required: cause):
  - type: const "OUTSIDE"
  - acres_burned: number|null
  - cause: TypeFireCauseOutValue (14 values, required)
"""


def build_structure_fire_location_detail(data: dict) -> dict:
    """Build StructureFireLocationDetailPayload. 7 fields, 5 required."""
    payload = {"type": "STRUCTURE"}

    # floor_of_origin: integer (required)
    payload["floor_of_origin"] = data["floor_of_origin"]

    # arrival_condition: TypeFireConditionArrivalValue (required)
    payload["arrival_condition"] = data["arrival_condition"]

    # damage_type: TypeFireBldgDamageValue (required)
    payload["damage_type"] = data["damage_type"]

    # room_of_origin_type: TypeRoomValue (required)
    payload["room_of_origin_type"] = data["room_of_origin_type"]

    # cause: TypeFireCauseInValue (required)
    payload["cause"] = data["cause"]

    # progression_evident: boolean|null
    if data.get("progression_evident") is not None:
        payload["progression_evident"] = data["progression_evident"]

    return payload


def build_outside_fire_location_detail(data: dict) -> dict:
    """Build OutsideFireLocationDetailPayload. 3 fields, 1 required."""
    payload = {"type": "OUTSIDE"}

    # cause: TypeFireCauseOutValue (required)
    payload["cause"] = data["cause"]

    # acres_burned: number|null
    if data.get("acres_burned") is not None:
        payload["acres_burned"] = data["acres_burned"]

    return payload


def build_fire_detail(data: dict | None) -> dict | None:
    """
    Build FirePayload for IncidentPayload.
    5 fields, 4 required. Pass-through with NERIS-native field names.
    """
    if data is None:
        return None

    payload = {}

    # --- Required ---

    # location_detail: oneOf, discriminator on type
    ld = data["location_detail"]
    if ld.get("type") == "STRUCTURE":
        payload["location_detail"] = build_structure_fire_location_detail(ld)
    else:
        payload["location_detail"] = build_outside_fire_location_detail(ld)

    # water_supply: TypeWaterSupplyValue (required)
    payload["water_supply"] = data["water_supply"]

    # investigation_needed: TypeFireInvestNeedValue (required)
    payload["investigation_needed"] = data["investigation_needed"]

    # investigation_types: TypeFireInvestValue[] (required)
    payload["investigation_types"] = data["investigation_types"]

    # --- Optional ---

    # suppression_appliances: TypeSuppressApplianceValue[]|null
    if data.get("suppression_appliances") is not None:
        payload["suppression_appliances"] = data["suppression_appliances"]

    return payload
