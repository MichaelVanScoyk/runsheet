"""
nerisv1: aids builder (Section 5)

Schema: IncidentPayload.aids from api-test.neris.fsri.org/v1/openapi.json v1.4.38

aids: AidPayload[] | null

AidPayload (additionalProperties: false, all 3 required):
  - department_neris_id: string (required, pattern ^FD\\d{8}$ or ^FM\\d{8}$)
  - aid_type: TypeAidValue (required) — ACTING_AS_AID, IN_LIEU_AID, SUPPORT_AID
  - aid_direction: TypeAidDirectionValue (required) — GIVEN, RECEIVED
"""


def build_aid(data: dict) -> dict:
    """Build a single AidPayload."""
    return {
        "department_neris_id": data["department_neris_id"],
        "aid_type": data["aid_type"],
        "aid_direction": data["aid_direction"],
    }


def build_aids(data_list: list | None) -> list | None:
    """Build the aids array for IncidentPayload."""
    if data_list is None:
        return None

    if not data_list:
        return None

    return [build_aid(item) for item in data_list]
