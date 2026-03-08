"""
nerisv1: fire_suppression builder (Section 18)

Schema: IncidentPayload.fire_suppression from api-test.neris.fsri.org/v1/openapi.json v1.4.38

fire_suppression: FireSuppressionPayload | null
Conditional: required for FIRE||STRUCTURE_FIRE (unless SUPPORT_AID GIVEN)

FireSuppressionPayload (additionalProperties: false, required: presence):
  - presence: oneOf FireSuppressionPresentPayload | FireSuppressionNotPresentPayload
    disc=type: PRESENT | NOT_PRESENT | NOT_APPLICABLE

FireSuppressionPresentPayload (additionalProperties: false, required: type, 3 fields):
  - type: const "PRESENT"
  - suppression_types: FireSuppressionTypePayload[]|null
  - operation_type: FireSuppressionOperationPayload|null

FireSuppressionNotPresentPayload (additionalProperties: false, required: type):
  - type: enum NOT_PRESENT, NOT_APPLICABLE

FireSuppressionTypePayload (additionalProperties: false, required: type, 2 fields):
  - type: TypeSuppressFireValue (8 values)
  - full_partial: TypeFullPartialValue|null (EXTENT_UNKNOWN, FULL, PARTIAL)

FireSuppressionOperationPayload (additionalProperties: false, required: effectiveness):
  - effectiveness: oneOf disc=type:
    OPERATED_EFFECTIVE -> FireSuppressionEffectivePayload
    OPERATED_NOT_EFFECTIVE -> FireSuppressionIneffectivePayload
    NO_OPERATION -> FireSuppressionFailedPayload

FireSuppressionEffectivePayload (additionalProperties: false, required: type, 2 fields):
  - sprinklers_activated: integer|null
  - type: const "OPERATED_EFFECTIVE"

FireSuppressionIneffectivePayload (additionalProperties: false, required: type, 3 fields):
  - sprinklers_activated: integer|null
  - type: const "OPERATED_NOT_EFFECTIVE"
  - failure_reason: TypeSuppressNoOperationValue|null (8 values)

FireSuppressionFailedPayload (additionalProperties: false, required: type, 2 fields):
  - type: const "NO_OPERATION"
  - failure_reason: TypeSuppressNoOperationValue|null (8 values)
"""


def build_suppression_type(data: dict) -> dict:
    """Build a single FireSuppressionTypePayload."""
    payload = {"type": data["type"]}
    if data.get("full_partial") is not None:
        payload["full_partial"] = data["full_partial"]
    return payload


def build_effective(data: dict) -> dict:
    payload = {"type": "OPERATED_EFFECTIVE"}
    if data.get("sprinklers_activated") is not None:
        payload["sprinklers_activated"] = data["sprinklers_activated"]
    return payload


def build_ineffective(data: dict) -> dict:
    payload = {"type": "OPERATED_NOT_EFFECTIVE"}
    if data.get("sprinklers_activated") is not None:
        payload["sprinklers_activated"] = data["sprinklers_activated"]
    if data.get("failure_reason") is not None:
        payload["failure_reason"] = data["failure_reason"]
    return payload


def build_failed(data: dict) -> dict:
    payload = {"type": "NO_OPERATION"}
    if data.get("failure_reason") is not None:
        payload["failure_reason"] = data["failure_reason"]
    return payload


def build_operation(data: dict | None) -> dict | None:
    if data is None:
        return None
    eff = data["effectiveness"]
    eff_type = eff.get("type")
    if eff_type == "OPERATED_EFFECTIVE":
        return {"effectiveness": build_effective(eff)}
    elif eff_type == "OPERATED_NOT_EFFECTIVE":
        return {"effectiveness": build_ineffective(eff)}
    else:
        return {"effectiveness": build_failed(eff)}


def build_fire_suppression_present(data: dict) -> dict:
    payload = {"type": "PRESENT"}

    # suppression_types: FireSuppressionTypePayload[]|null
    if data.get("suppression_types") is not None:
        payload["suppression_types"] = [build_suppression_type(st) for st in data["suppression_types"]]

    # operation_type: FireSuppressionOperationPayload|null
    op = build_operation(data.get("operation_type"))
    if op is not None:
        payload["operation_type"] = op

    return payload


def build_fire_suppression_not_present(data: dict) -> dict:
    return {"type": data["type"]}


def build_fire_suppression(data: dict | None) -> dict | None:
    if data is None:
        return None

    pres = data["presence"]
    if pres.get("type") == "PRESENT":
        return {"presence": build_fire_suppression_present(pres)}
    else:
        return {"presence": build_fire_suppression_not_present(pres)}
