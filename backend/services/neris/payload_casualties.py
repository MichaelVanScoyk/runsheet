"""
NERIS Casualty/Rescue + Exposures Payload Builder

Maps our DB fields → NERIS CasualtyRescuePayload[] + ExposurePayload[].

Source DB fields:
  - incidents.neris_rescue_ff (JSONB array)
  - incidents.neris_rescue_nonff (JSONB array)
  - incidents.neris_exposures (JSONB array)

NERIS target: CasualtyRescuePayload[], ExposurePayload[]
"""

from .payload_location import build_location


def build_casualty_rescues(incident: dict) -> list | None:
    """
    Build NERIS CasualtyRescuePayload array.
    
    Our DB stores FF and non-FF as separate JSONB arrays.
    NERIS wants a single array with type discriminator (FF vs NONFF).
    """
    ff = incident.get("neris_rescue_ff") or []
    nonff = incident.get("neris_rescue_nonff") or []

    if not ff and not nonff:
        return None

    result = []

    for entry in ff:
        if not isinstance(entry, dict):
            continue
        cr = {"type": "FF"}
        _map_casualty_fields(entry, cr)
        result.append(cr)

    for entry in nonff:
        if not isinstance(entry, dict):
            continue
        cr = {"type": "NONFF"}
        _map_casualty_fields(entry, cr)
        result.append(cr)

    return result if result else None


def _map_casualty_fields(src: dict, dest: dict):
    """Map common casualty/rescue fields from our JSONB to NERIS."""
    # Demographics
    if src.get("birth_month_year"):
        dest["birth_month_year"] = src["birth_month_year"]
    if src.get("gender"):
        dest["gender"] = src["gender"]
    if src.get("race"):
        dest["race"] = src["race"]

    # FF-specific
    if src.get("rank"):
        dest["rank"] = src["rank"]
    if src.get("years_of_service") is not None:
        dest["years_of_service"] = src["years_of_service"]

    # Casualty sub-object
    injury = src.get("injury") or src.get("casualty")
    if injury and isinstance(injury, dict):
        dest["casualty"] = {"injury_or_noninjury": injury}

    # Rescue sub-object
    rescue = src.get("rescue")
    if rescue and isinstance(rescue, dict):
        dest["rescue"] = rescue


def build_exposures(incident: dict) -> list | None:
    """
    Build NERIS ExposurePayload array.
    
    Our neris_exposures JSONB: [{exposure_type, address, damage, ...}]
    NERIS wants structured location + location_detail + damage_type.
    """
    exposures = incident.get("neris_exposures") or []
    if not exposures:
        return None

    result = []
    for exp in exposures:
        if not isinstance(exp, dict):
            continue

        entry = {}

        # Location detail — internal vs external exposure
        exp_type = exp.get("exposure_type")
        if exp_type:
            entry["location_detail"] = {"type": exp_type}
            # Internal exposures have floor/room
            if exp.get("floor"):
                entry["location_detail"]["floor"] = exp["floor"]
            if exp.get("room"):
                entry["location_detail"]["room"] = exp["room"]

        # Location — pass through if structured, otherwise minimal
        loc = exp.get("location")
        if loc and isinstance(loc, dict):
            entry["location"] = loc
        else:
            entry["location"] = {}

        # Damage
        if exp.get("damage") or exp.get("damage_type"):
            entry["damage_type"] = exp.get("damage_type") or exp.get("damage")

        # Optional
        if exp.get("displaced") is not None:
            entry["displacement_count"] = exp["displaced"]
        if exp.get("people_present") is not None:
            entry["people_present"] = exp["people_present"]

        # Location use
        if exp.get("location_use"):
            entry["location_use"] = exp["location_use"]

        if entry:
            result.append(entry)

    return result if result else None
