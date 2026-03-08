"""
nerisv1: cooking_fire_suppression builder (Section 19)

Schema: IncidentPayload.cooking_fire_suppression from api-test.neris.fsri.org/v1/openapi.json v1.4.38

cooking_fire_suppression: CookingFireSuppressionPayload | null
Conditional: required for FIRE||STRUCTURE_FIRE||CONFINED_COOKING_APPLIANCE_FIRE (unless SUPPORT_AID GIVEN)

CookingFireSuppressionPayload (additionalProperties: false, required: presence):
  - presence: oneOf CookingFireSuppressionPresentPayload | CookingFireSuppressionNotPresentPayload
    disc=type: PRESENT | NOT_PRESENT | NOT_APPLICABLE

CookingFireSuppressionPresentPayload (additionalProperties: false, required: type, 3 fields):
  - type: const "PRESENT"
  - suppression_types: TypeSuppressCookingValue[]|null
    (COMMERCIAL_HOOD_SUPPRESSION, ELECTRIC_POWER_CUTOFF_DEVICE, OTHER,
     RESIDENTIAL_HOOD_MOUNTED, TEMPERATURE_LIMITING_STOVE)
  - operation_type: TypeSuppressOperationValue|null
    (NO_OPERATION, OPERATED_EFFECTIVE, OPERATED_NOT_EFFECTIVE)

CookingFireSuppressionNotPresentPayload (additionalProperties: false, required: type):
  - type: enum NOT_PRESENT, NOT_APPLICABLE
"""


def build_cooking_present(data: dict) -> dict:
    payload = {"type": "PRESENT"}

    # suppression_types: TypeSuppressCookingValue[]|null
    if data.get("suppression_types") is not None:
        payload["suppression_types"] = data["suppression_types"]

    # operation_type: TypeSuppressOperationValue|null
    if data.get("operation_type") is not None:
        payload["operation_type"] = data["operation_type"]

    return payload


def build_cooking_not_present(data: dict) -> dict:
    return {"type": data["type"]}


def build_cooking_fire_suppression(data: dict | None) -> dict | None:
    if data is None:
        return None

    pres = data["presence"]
    if pres.get("type") == "PRESENT":
        return {"presence": build_cooking_present(pres)}
    else:
        return {"presence": build_cooking_not_present(pres)}
