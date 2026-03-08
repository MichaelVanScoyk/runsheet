"""
nerisv1 shared: MedResponsePayload builder

Schema: MedResponsePayload from api-test.neris.fsri.org/v1/openapi.json v1.4.38
Fields: 7, Required: 0
additionalProperties: false

Used by: DispatchUnitResponsePayload (section 3), IncidentUnitResponsePayload (section 9)

  - hospital_destination: string|null (minLength 1, maxLength 255)
  - at_patient: datetime|null
  - enroute_to_hospital: datetime|null
  - arrived_at_hospital: datetime|null
  - transferred_to_agency: datetime|null
  - transferred_to_facility: datetime|null
  - hospital_cleared: datetime|null
"""


def build_med_response(data: dict) -> dict | None:
    if data is None:
        return None

    payload = {}

    # hospital_destination: string|null (minLength 1, maxLength 255)
    if data.get("hospital_destination"):
        payload["hospital_destination"] = data["hospital_destination"]

    # at_patient: datetime|null
    if data.get("at_patient") is not None:
        payload["at_patient"] = data["at_patient"]

    # enroute_to_hospital: datetime|null
    if data.get("enroute_to_hospital") is not None:
        payload["enroute_to_hospital"] = data["enroute_to_hospital"]

    # arrived_at_hospital: datetime|null
    if data.get("arrived_at_hospital") is not None:
        payload["arrived_at_hospital"] = data["arrived_at_hospital"]

    # transferred_to_agency: datetime|null
    if data.get("transferred_to_agency") is not None:
        payload["transferred_to_agency"] = data["transferred_to_agency"]

    # transferred_to_facility: datetime|null
    if data.get("transferred_to_facility") is not None:
        payload["transferred_to_facility"] = data["transferred_to_facility"]

    # hospital_cleared: datetime|null
    if data.get("hospital_cleared") is not None:
        payload["hospital_cleared"] = data["hospital_cleared"]

    return payload if payload else {}


def build_med_responses(data_list: list | None) -> list | None:
    if data_list is None:
        return None
    return [build_med_response(item) for item in data_list]
