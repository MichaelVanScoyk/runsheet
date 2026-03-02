"""
NERIS Emerging Hazards Payload Builder

Maps our DB fields → NERIS ElectricHazardPayload[], PowergenHazardPayload[],
                      CsstHazardPayload.

Source DB fields:
  - incidents.neris_emerging_hazard (JSONB)

NERIS target: electric_hazards[], powergen_hazards[], csst_hazard
"""


def build_electric_hazards(incident: dict) -> list | None:
    """
    Build NERIS ElectricHazardPayload array.
    
    Our neris_emerging_hazard JSONB has ev_battery sub-object.
    NERIS wants array of electric hazard entries.
    """
    hazard = incident.get("neris_emerging_hazard") or {}
    ev = hazard.get("ev_battery")

    if not ev or not isinstance(ev, dict):
        return None

    if not ev.get("present"):
        return None

    entry = {}

    if ev.get("type"):
        entry["type"] = ev["type"]
    if ev.get("source_or_target"):
        entry["source_or_target"] = ev["source_or_target"]
    if ev.get("involved_in_crash") is not None:
        entry["involved_in_crash"] = ev["involved_in_crash"]

    # Fire details sub-object
    fire = ev.get("fire_details")
    if fire and isinstance(fire, dict):
        entry["fire_details"] = fire

    return [entry] if entry else None


def build_powergen_hazards(incident: dict) -> list | None:
    """
    Build NERIS PowergenHazardPayload array.
    
    Our neris_emerging_hazard JSONB has solar_pv sub-object.
    NERIS wants array with discriminated pv_other field.
    """
    hazard = incident.get("neris_emerging_hazard") or {}
    solar = hazard.get("solar_pv")

    if not solar or not isinstance(solar, dict):
        return None

    if not solar.get("present"):
        return None

    # NERIS discriminates between PV and OTHER powergen types
    entry = {"pv_other": solar}

    return [entry] if entry else None


def build_csst_hazard(incident: dict) -> dict | None:
    """
    Build NERIS CsstHazardPayload.
    
    Our neris_emerging_hazard JSONB has csst sub-object.
    """
    hazard = incident.get("neris_emerging_hazard") or {}
    csst = hazard.get("csst")

    if not csst or not isinstance(csst, dict):
        return None

    if not csst.get("present"):
        return None

    payload = {}

    if csst.get("ignition_source") is not None:
        payload["ignition_source"] = csst["ignition_source"]
    if csst.get("lightning_suspected"):
        payload["lightning_suspected"] = csst["lightning_suspected"]
    if csst.get("grounded"):
        payload["grounded"] = csst["grounded"]

    return payload if payload else None
