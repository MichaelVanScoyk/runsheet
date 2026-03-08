"""
nerisv1: medical_details builder (Section 14)

Schema: IncidentPayload.medical_details from api-test.neris.fsri.org/v1/openapi.json v1.4.38

medical_details: MedicalPayload[] | null
Conditional: only when incident type starts with MEDICAL||

MedicalPayload (additionalProperties: false, 4 fields, required: patient_care_evaluation):
  - patient_care_report_id: string|null (minLength 1, maxLength 255)
  - patient_care_evaluation: TypeMedicalPatientCareValue (6 values, required)
  - patient_status: TypeMedicalPatientStatusValue|null (3 values)
  - transport_disposition: TypeMedicalTransportValue|null (5 values)
"""


def build_medical(data: dict) -> dict:
    """Build a single MedicalPayload. 4 fields, 1 required."""
    payload = {}

    # patient_care_evaluation: TypeMedicalPatientCareValue (required)
    payload["patient_care_evaluation"] = data["patient_care_evaluation"]

    # patient_care_report_id: string|null (minLength 1, maxLength 255)
    if data.get("patient_care_report_id"):
        payload["patient_care_report_id"] = data["patient_care_report_id"]

    # patient_status: TypeMedicalPatientStatusValue|null
    if data.get("patient_status") is not None:
        payload["patient_status"] = data["patient_status"]

    # transport_disposition: TypeMedicalTransportValue|null
    if data.get("transport_disposition") is not None:
        payload["transport_disposition"] = data["transport_disposition"]

    return payload


def build_medical_details(data_list: list | None) -> list | None:
    """Build the medical_details array for IncidentPayload."""
    if data_list is None:
        return None

    if not data_list:
        return None

    return [build_medical(item) for item in data_list]
