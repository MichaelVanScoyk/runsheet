"""
nerisv1: csst_hazard builder (Section 22)

Schema: IncidentPayload.csst_hazard from api-test.neris.fsri.org/v1/openapi.json v1.4.38

csst_hazard: CsstHazardPayload | null

CsstHazardPayload (additionalProperties: false, 3 fields, required: none):
  - ignition_source: boolean|null
  - lightning_suspected: TypeYesNoUnknownValue|null (NO, UNKNOWN, YES)
  - grounded: TypeYesNoUnknownValue|null (NO, UNKNOWN, YES)
"""


def build_csst_hazard(data: dict | None) -> dict | None:
    if data is None:
        return None

    payload = {}

    # ignition_source: boolean|null
    if data.get("ignition_source") is not None:
        payload["ignition_source"] = data["ignition_source"]

    # lightning_suspected: TypeYesNoUnknownValue|null
    if data.get("lightning_suspected") is not None:
        payload["lightning_suspected"] = data["lightning_suspected"]

    # grounded: TypeYesNoUnknownValue|null
    if data.get("grounded") is not None:
        payload["grounded"] = data["grounded"]

    return payload if payload else {}
