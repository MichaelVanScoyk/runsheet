"""
NERIS Medical Detail Payload Builder

Maps our DB fields → NERIS MedicalPayload[].

Source DB fields:
  - incidents.neris_medical_patient_care
  - incidents.neris_additional_data (JSONB — patient_status, transport, pcr_id)

NERIS target: MedicalPayload[]
Note: NERIS accepts an ARRAY of medical details (multiple patients possible).

CONDITIONAL: Only include if incident has MEDICAL|| type.
"""


def build_medical_details(incident: dict) -> list | None:
    """
    Build NERIS MedicalPayload array.
    
    Currently we store a single patient care value.
    Future: support multiple patients via JSONB array.
    """
    care = incident.get("neris_medical_patient_care")
    if not care:
        return None

    additional = incident.get("neris_additional_data") or {}

    med = {
        "patient_care_evaluation": care,
    }

    # Optional fields from additional_data
    pcr_id = additional.get("patient_care_report_id")
    if pcr_id:
        med["patient_care_report_id"] = pcr_id

    patient_status = additional.get("medical_patient_status")
    if patient_status:
        med["patient_status"] = patient_status

    transport = additional.get("medical_transport_disposition")
    if transport:
        med["transport_disposition"] = transport

    return [med]
