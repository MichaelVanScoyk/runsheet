"""
nerisv1: other_alarm builder (Section 17)

Schema: IncidentPayload.other_alarm from api-test.neris.fsri.org/v1/openapi.json v1.4.38

other_alarm: OtherAlarmPayload | null
Conditional: required for FIRE||STRUCTURE_FIRE (unless SUPPORT_AID GIVEN)

OtherAlarmPayload (additionalProperties: false, required: presence):
  - presence: oneOf OtherAlarmPresentPayload | OtherAlarmNotPresentPayload
    disc=type: PRESENT | NOT_PRESENT | NOT_APPLICABLE

OtherAlarmPresentPayload (additionalProperties: false, required: type, 2 fields):
  - type: const "PRESENT"
  - alarm_types: TypeAlarmOtherValue[]|null
    (CARBON_MONOXIDE, HEAT_DETECTOR, NATURAL_GAS, OTHER_CHEMICAL_DETECTOR)

OtherAlarmNotPresentPayload (additionalProperties: false, required: type):
  - type: enum NOT_PRESENT, NOT_APPLICABLE
"""


def build_other_alarm_present(data: dict) -> dict:
    payload = {"type": "PRESENT"}

    # alarm_types: TypeAlarmOtherValue[]|null
    if data.get("alarm_types") is not None:
        payload["alarm_types"] = data["alarm_types"]

    return payload


def build_other_alarm_not_present(data: dict) -> dict:
    return {"type": data["type"]}


def build_other_alarm(data: dict | None) -> dict | None:
    if data is None:
        return None

    pres = data["presence"]
    if pres.get("type") == "PRESENT":
        return {"presence": build_other_alarm_present(pres)}
    else:
        return {"presence": build_other_alarm_not_present(pres)}
