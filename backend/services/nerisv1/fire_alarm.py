"""
nerisv1: fire_alarm builder (Section 16)

Schema: IncidentPayload.fire_alarm from api-test.neris.fsri.org/v1/openapi.json v1.4.38

fire_alarm: FireAlarmPayload | null
Conditional: required for FIRE||STRUCTURE_FIRE (unless SUPPORT_AID GIVEN)

FireAlarmPayload (additionalProperties: false, required: presence):
  - presence: oneOf FireAlarmPresentPayload | FireAlarmNotPresentPayload
    disc=type: PRESENT | NOT_PRESENT | NOT_APPLICABLE

FireAlarmPresentPayload (additionalProperties: false, required: type, 3 fields):
  - type: const "PRESENT"
  - alarm_types: TypeAlarmFireValue[]|null (AUTOMATIC, MANUAL, MANUAL_AND_AUTOMATIC)
  - operation_type: TypeAlarmOperationValue|null (5 values)

FireAlarmNotPresentPayload (additionalProperties: false, required: type):
  - type: enum NOT_PRESENT, NOT_APPLICABLE
"""


def build_fire_alarm_present(data: dict) -> dict:
    payload = {"type": "PRESENT"}

    # alarm_types: TypeAlarmFireValue[]|null
    if data.get("alarm_types") is not None:
        payload["alarm_types"] = data["alarm_types"]

    # operation_type: TypeAlarmOperationValue|null
    if data.get("operation_type") is not None:
        payload["operation_type"] = data["operation_type"]

    return payload


def build_fire_alarm_not_present(data: dict) -> dict:
    return {"type": data["type"]}


def build_fire_alarm(data: dict | None) -> dict | None:
    if data is None:
        return None

    pres = data["presence"]
    if pres.get("type") == "PRESENT":
        return {"presence": build_fire_alarm_present(pres)}
    else:
        return {"presence": build_fire_alarm_not_present(pres)}
