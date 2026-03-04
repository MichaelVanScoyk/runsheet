"""
NERIS Casualty/Rescue + Exposures Payload Builder

Maps our DB fields → NERIS CasualtyRescuePayload[] + ExposurePayload[].

Source DB fields:
  - incidents.neris_rescue_ff (JSONB array of per-person records)
  - incidents.neris_rescue_nonff (JSONB array of per-person records)
  - incidents.neris_exposures (JSONB array)

Per-person record fields:
  person_type, gender, race, birth_month_year, rank (FF only),
  years_of_service (FF only), has_casualty, patient_care,
  has_rescue, mayday, presence_known

NERIS target: CasualtyRescuePayload[], ExposurePayload[]
"""

from .payload_location import build_location


def build_casualty_rescues(incident: dict) -> list | None:
    """
    Build NERIS CasualtyRescuePayload array.
    
    DB stores FF and non-FF as separate JSONB arrays.
    NERIS wants a single array with type discriminator (FIREFIGHTER/CIVILIAN).
    """
    ff = incident.get("neris_rescue_ff") or []
    nonff = incident.get("neris_rescue_nonff") or []

    # Handle legacy integer format (old count-only fields)
    if isinstance(ff, (int, float)):
        ff = []
    if isinstance(nonff, (int, float)):
        nonff = []

    if not ff and not nonff:
        return None

    result = []

    for entry in ff:
        if not isinstance(entry, dict):
            continue
        cr = {"type": "FIREFIGHTER"}
        _map_person_fields(entry, cr, is_ff=True)
        result.append(cr)

    for entry in nonff:
        if not isinstance(entry, dict):
            continue
        cr = {"type": "CIVILIAN"}
        _map_person_fields(entry, cr, is_ff=False)
        result.append(cr)

    return result if result else None


def _map_person_fields(src: dict, dest: dict, is_ff: bool = False):
    """Map per-person fields from our JSONB to NERIS CasualtyRescuePayload."""
    # Demographics
    if src.get("birth_month_year"):
        dest["birth_month_year"] = src["birth_month_year"]
    if src.get("gender"):
        dest["gender"] = src["gender"]
    if src.get("race"):
        dest["race"] = src["race"]

    # FF-specific
    if is_ff:
        if src.get("rank"):
            dest["rank"] = src["rank"]
        if src.get("years_of_service") is not None:
            dest["years_of_service"] = src["years_of_service"]

    # Casualty sub-object
    if src.get("has_casualty"):
        casualty = {}
        patient_care = src.get("patient_care")
        if patient_care:
            # Determine injury vs non-injury based on patient care type
            if patient_care in ("PATIENT_DEAD_ON_ARRIVAL",):
                casualty["injury_or_noninjury"] = {
                    "type": "NON_INJURY",
                    "patient_care_evaluation": patient_care,
                }
            else:
                casualty["injury_or_noninjury"] = {
                    "type": "INJURY",
                    "patient_care_evaluation": patient_care,
                }
        dest["casualty"] = casualty

    # Legacy casualty format
    elif src.get("injury") or src.get("casualty"):
        injury = src.get("injury") or src.get("casualty")
        if isinstance(injury, dict):
            dest["casualty"] = {"injury_or_noninjury": injury}

    # Rescue sub-object
    if src.get("has_rescue"):
        rescue = {}
        if src.get("mayday") is not None:
            rescue["mayday"] = src["mayday"]
        if src.get("presence_known") is not None:
            rescue["presence_known"] = src["presence_known"]

        # Discriminated: FF rescue vs non-FF rescue
        if is_ff:
            rescue["ffrescue_or_nonffrescue"] = {"type": "FIREFIGHTER"}
        else:
            rescue["ffrescue_or_nonffrescue"] = {"type": "NON_FIREFIGHTER"}

        dest["rescue"] = rescue

    # Legacy rescue format
    elif src.get("rescue"):
        if isinstance(src["rescue"], dict):
            dest["rescue"] = src["rescue"]


def build_exposures(incident: dict) -> list | None:
    """
    Build NERIS ExposurePayload array.
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
            if exp.get("floor"):
                entry["location_detail"]["floor"] = exp["floor"]
            if exp.get("room"):
                entry["location_detail"]["room"] = exp["room"]

        # Location
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
        if exp.get("displacement_causes"):
            entry["displacement_causes"] = exp["displacement_causes"]
        if exp.get("people_present") is not None:
            entry["people_present"] = exp["people_present"]
        if exp.get("location_use"):
            entry["location_use"] = exp["location_use"]

        if entry:
            result.append(entry)

    return result if result else None
