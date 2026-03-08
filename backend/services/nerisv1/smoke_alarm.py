"""
nerisv1: smoke_alarm builder (Section 15)

Schema: IncidentPayload.smoke_alarm from api-test.neris.fsri.org/v1/openapi.json v1.4.38

smoke_alarm: SmokeAlarmPayload | null
Conditional: required for FIRE||STRUCTURE_FIRE (unless SUPPORT_AID GIVEN)

SmokeAlarmPayload (additionalProperties: false, required: presence):
  - presence: oneOf SmokeAlarmPresentPayload | SmokeAlarmNotPresentPayload
    disc=type: PRESENT | NOT_PRESENT | NOT_APPLICABLE

SmokeAlarmPresentPayload (additionalProperties: false, required: type):
  - type: const "PRESENT"
  - working: boolean|null
  - alarm_types: TypeAlarmSmokeValue[]|null (8 values)
  - operation: SmokeAlarmOperationPayload|null

SmokeAlarmNotPresentPayload (additionalProperties: false, required: type):
  - type: enum NOT_PRESENT, NOT_APPLICABLE

SmokeAlarmOperationPayload (additionalProperties: false, required: alerted_failed_other):
  - alerted_failed_other: oneOf disc=type:
    OPERATED_ALERTED_OCCUPANT -> SmokeAlarmAlertedPayload
    FAILED_TO_OPERATE -> SmokeAlarmFailedPayload
    OPERATED_FAILED_TO_ALERT_OCCUPANT -> SmokeAlarmOtherPayload
    NO_OCCUPANT_TO_NOTIFY -> SmokeAlarmOtherPayload
    INSUFFICIENT_SOURCE -> SmokeAlarmOtherPayload

SmokeAlarmAlertedPayload (additionalProperties: false, required: type):
  - type: const "OPERATED_ALERTED_OCCUPANT"
  - occupant_action: TypeOccupantResponseValue|null (7 values)

SmokeAlarmFailedPayload (additionalProperties: false, required: type):
  - type: const "FAILED_TO_OPERATE"
  - failure_reason: TypeAlarmFailureValue|null (7 values)

SmokeAlarmOtherPayload (additionalProperties: false, required: type):
  - type: enum OPERATED_FAILED_TO_ALERT_OCCUPANT, NO_OCCUPANT_TO_NOTIFY, INSUFFICIENT_SOURCE
"""


def build_smoke_alarm_alerted(data: dict) -> dict:
    payload = {"type": "OPERATED_ALERTED_OCCUPANT"}
    if data.get("occupant_action") is not None:
        payload["occupant_action"] = data["occupant_action"]
    return payload


def build_smoke_alarm_failed(data: dict) -> dict:
    payload = {"type": "FAILED_TO_OPERATE"}
    if data.get("failure_reason") is not None:
        payload["failure_reason"] = data["failure_reason"]
    return payload


def build_smoke_alarm_other(data: dict) -> dict:
    return {"type": data["type"]}


def build_smoke_alarm_operation(data: dict | None) -> dict | None:
    if data is None:
        return None

    afo = data["alerted_failed_other"]
    afo_type = afo.get("type")

    if afo_type == "OPERATED_ALERTED_OCCUPANT":
        built = build_smoke_alarm_alerted(afo)
    elif afo_type == "FAILED_TO_OPERATE":
        built = build_smoke_alarm_failed(afo)
    else:
        built = build_smoke_alarm_other(afo)

    return {"alerted_failed_other": built}


def build_smoke_alarm_present(data: dict) -> dict:
    payload = {"type": "PRESENT"}

    # working: boolean|null
    if data.get("working") is not None:
        payload["working"] = data["working"]

    # alarm_types: TypeAlarmSmokeValue[]|null
    if data.get("alarm_types") is not None:
        payload["alarm_types"] = data["alarm_types"]

    # operation: SmokeAlarmOperationPayload|null
    op = build_smoke_alarm_operation(data.get("operation"))
    if op is not None:
        payload["operation"] = op

    return payload


def build_smoke_alarm_not_present(data: dict) -> dict:
    return {"type": data["type"]}


def build_smoke_alarm(data: dict | None) -> dict | None:
    if data is None:
        return None

    pres = data["presence"]
    if pres.get("type") == "PRESENT":
        return {"presence": build_smoke_alarm_present(pres)}
    else:
        return {"presence": build_smoke_alarm_not_present(pres)}
