"""
NERIS Emerging Hazards Payload Builder

Maps our DB fields → NERIS ElectricHazardPayload[], PowergenHazardPayload[],
                      CsstHazardPayload.

Source DB fields:
  - incidents.neris_emerging_hazard (JSONB)
    New structure: {electric_hazards: [...], powergen_hazards: [...], csst: {present: bool}}
    Legacy structure: {ev_battery: {...}, solar_pv: {...}, csst: {...}}
  - incidents.neris_csst_* (dedicated columns)

NERIS target: electric_hazards[], powergen_hazards[], csst_hazard
"""


def build_electric_hazards(incident: dict) -> list | None:
    """
    Build NERIS ElectricHazardPayload array.
    
    New format: neris_emerging_hazard.electric_hazards = array of entries
    Legacy: neris_emerging_hazard.ev_battery = single entry
    """
    hazard = incident.get("neris_emerging_hazard") or {}

    # New format — array of entries
    entries = hazard.get("electric_hazards")
    if entries and isinstance(entries, list):
        result = []
        for e in entries:
            if not isinstance(e, dict):
                continue
            entry = {}
            if e.get("type"):
                entry["type"] = e["type"]
            if e.get("source_or_target"):
                entry["source_or_target"] = e["source_or_target"]
            if e.get("involved_in_crash") is not None:
                entry["involved_in_crash"] = e["involved_in_crash"]
            fire = e.get("fire_details")
            if fire and isinstance(fire, dict):
                fd = {}
                if fire.get("reignition") is not None:
                    fd["reignition"] = fire["reignition"]
                if fire.get("suppression_types"):
                    fd["suppression_types"] = fire["suppression_types"]
                if fd:
                    entry["fire_details"] = fd
            if entry:
                result.append(entry)
        return result if result else None

    # Legacy fallback
    ev = hazard.get("ev_battery")
    if not ev or not isinstance(ev, dict) or not ev.get("present"):
        return None

    entry = {}
    if ev.get("type"):
        entry["type"] = ev["type"]
    if ev.get("source_or_target"):
        entry["source_or_target"] = ev["source_or_target"]
    if ev.get("involved_in_crash") is not None:
        entry["involved_in_crash"] = ev["involved_in_crash"]
    fire = ev.get("fire_details")
    if fire and isinstance(fire, dict):
        entry["fire_details"] = fire

    return [entry] if entry else None


def build_powergen_hazards(incident: dict) -> list | None:
    """
    Build NERIS PowergenHazardPayload array.
    
    New format: neris_emerging_hazard.powergen_hazards = array of entries
    Legacy: neris_emerging_hazard.solar_pv = single entry
    
    NERIS discriminates by type:
      SOLAR_PV → PvPowergenHazardPayload (has pv_type)
      WIND/GENERATOR/FUEL_CELL → OtherPowergenHazardPayload
    """
    hazard = incident.get("neris_emerging_hazard") or {}

    # New format — array of entries
    entries = hazard.get("powergen_hazards")
    if entries and isinstance(entries, list):
        result = []
        for pg in entries:
            if not isinstance(pg, dict):
                continue
            pg_type = pg.get("type")
            if not pg_type:
                continue

            if pg_type == "SOLAR_PV":
                entry = {"pv_other": {"type": "SOLAR_PV"}}
                pv = entry["pv_other"]
                if pg.get("pv_type"):
                    pv["pv_type"] = pg["pv_type"]
                if pg.get("source_or_target"):
                    pv["source_or_target"] = pg["source_or_target"]
            else:
                entry = {"pv_other": {"type": pg_type}}
                if pg.get("source_or_target"):
                    entry["pv_other"]["source_or_target"] = pg["source_or_target"]

            result.append(entry)
        return result if result else None

    # Legacy fallback
    solar = hazard.get("solar_pv")
    if not solar or not isinstance(solar, dict) or not solar.get("present"):
        return None

    entry = {"pv_other": solar}
    return [entry] if entry else None


def build_csst_hazard(incident: dict) -> dict | None:
    """
    Build NERIS CsstHazardPayload.
    
    Reads from dedicated columns first, falls back to neris_emerging_hazard JSONB.
    """
    # Check dedicated columns first
    ign = incident.get("neris_csst_ignition_source")
    lightning = incident.get("neris_csst_lightning_suspected")
    grounded = incident.get("neris_csst_grounded")

    if ign is not None or lightning or grounded:
        payload = {}
        if ign is not None:
            payload["ignition_source"] = ign
        if lightning:
            payload["lightning_suspected"] = lightning
        if grounded:
            payload["grounded"] = grounded
        return payload if payload else None

    # Fallback: legacy JSONB
    hazard = incident.get("neris_emerging_hazard") or {}
    csst = hazard.get("csst")
    if not csst or not isinstance(csst, dict) or not csst.get("present"):
        return None

    payload = {}
    if csst.get("ignition_source") is not None:
        payload["ignition_source"] = csst["ignition_source"]
    if csst.get("lightning_suspected"):
        payload["lightning_suspected"] = csst["lightning_suspected"]
    if csst.get("grounded"):
        payload["grounded"] = csst["grounded"]

    return payload if payload else None
