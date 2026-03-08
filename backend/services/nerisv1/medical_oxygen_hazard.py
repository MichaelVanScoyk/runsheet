"""
nerisv1: medical_oxygen_hazard builder (Section 23)

Schema: IncidentPayload.medical_oxygen_hazard from api-test.neris.fsri.org/v1/openapi.json v1.4.38

medical_oxygen_hazard: MedicalOxygenHazardPayload | null

MedicalOxygenHazardPayload (additionalProperties: false, required: presence):
  - presence: oneOf MedicalOxygenHazardPresentPayload | MedicalOxygenHazardNotPresentPayload
    disc=type: PRESENT | NOT_PRESENT | NOT_APPLICABLE

MedicalOxygenHazardPresentPayload (additionalProperties: false, required: type, 2 fields):
  - type: const "PRESENT"
  - contributed_to_flame_spread: boolean|null

MedicalOxygenHazardNotPresentPayload (additionalProperties: false, required: type):
  - type: enum NOT_PRESENT, NOT_APPLICABLE
"""


def build_med_oxygen_present(data: dict) -> dict:
    payload = {"type": "PRESENT"}

    # contributed_to_flame_spread: boolean|null
    if data.get("contributed_to_flame_spread") is not None:
        payload["contributed_to_flame_spread"] = data["contributed_to_flame_spread"]

    return payload


def build_med_oxygen_not_present(data: dict) -> dict:
    return {"type": data["type"]}


def build_medical_oxygen_hazard(data: dict | None) -> dict | None:
    if data is None:
        return None

    pres = data["presence"]
    if pres.get("type") == "PRESENT":
        return {"presence": build_med_oxygen_present(pres)}
    else:
        return {"presence": build_med_oxygen_not_present(pres)}
