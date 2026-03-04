"""
NERIS Medical Detail Payload Builder

Maps our DB fields → NERIS MedicalPayload[].

Source DB fields:
  - incidents.neris_medical_patient_care     → patient_care_evaluation (REQUIRED)
  - incidents.neris_medical_pcr_id           → patient_care_report_id
  - incidents.neris_medical_patient_status   → patient_status
  - incidents.neris_medical_transport_disposition → transport_disposition

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

    med = {
        "patient_care_evaluation": care,
    }

    pcr_id = incident.get("neris_medical_pcr_id")
    if pcr_id:
        med["patient_care_report_id"] = pcr_id

    patient_status = incident.get("neris_medical_patient_status")
    if patient_status:
        med["patient_status"] = patient_status

    transport = incident.get("neris_medical_transport_disposition")
    if transport:
        med["transport_disposition"] = transport

    return [med]
