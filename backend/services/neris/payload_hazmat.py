"""
NERIS Hazmat Detail Payload Builder

Maps our DB fields → NERIS HazsitPayload.

Source DB fields:
  - incidents.neris_hazmat_disposition
  - incidents.neris_hazmat_evacuated
  - incidents.neris_hazmat_chemicals (JSONB array)
    Each chemical: {dot_class, name, release_occurred, release: {physical_state, release_cause, release_into, amount_est, amount_units}}

NERIS target: HazsitPayload with chemicals[] containing ChemicalPayload with optional ReleasePayload

CONDITIONAL: Only include if incident has HAZSIT|| type.
"""


def build_hazsit_detail(incident: dict) -> dict | None:
    """
    Build NERIS HazsitPayload.
    """
    disposition = incident.get("neris_hazmat_disposition")
    if not disposition:
        return None

    hazsit = {
        "disposition": disposition,
        "evacuated": incident.get("neris_hazmat_evacuated") or 0,
    }

    # Chemicals array
    chemicals = incident.get("neris_hazmat_chemicals") or []
    if chemicals:
        chem_list = []
        for c in chemicals:
            if not isinstance(c, dict):
                continue
            entry = {}
            if c.get("name"):
                entry["name"] = c["name"]
            if c.get("dot_class"):
                entry["dot_class"] = c["dot_class"]
            if c.get("release_occurred") is not None:
                entry["release_occurred"] = c["release_occurred"]

            # Release sub-object (gap 22)
            release_data = c.get("release")
            if release_data and isinstance(release_data, dict) and c.get("release_occurred"):
                release = {}
                for field in ("physical_state", "release_cause", "release_into", "amount_units"):
                    if release_data.get(field):
                        release[field] = release_data[field]
                if release_data.get("amount_est") is not None:
                    release["amount_est"] = release_data["amount_est"]
                if release:
                    entry["release"] = release

            if entry:
                chem_list.append(entry)
        if chem_list:
            hazsit["chemicals"] = chem_list

    return hazsit
