"""
nerisv1: casualty_rescues builder (Section 11)

Schema: IncidentPayload.casualty_rescues from api-test.neris.fsri.org/v1/openapi.json v1.4.38

casualty_rescues: CasualtyRescuePayload[] | null

CasualtyRescuePayload (additionalProperties: false, required: type, 8 fields):
  - type: enum FF, NONFF (required)
  - rank: string|null (minLength 1, maxLength 255) — FF only
  - years_of_service: number|null — FF only
  - casualty: CasualtyPayload|null
  - rescue: RescuePayload|null
  - birth_month_year: string|null (minLength 7, maxLength 7, MM/YYYY)
  - gender: TypeGenderValue|null (6 values)
  - race: TypeRaceValue|null (9 values)

CasualtyPayload (additionalProperties: false, required: injury_or_noninjury):
  - injury_or_noninjury: oneOf InjuryPayload | NoinjuryPayload
    disc=type: INJURED_FATAL->Injury, INJURED_NONFATAL->Injury, UNINJURED->Noinjury

InjuryPayload (additionalProperties: false, required: type):
  - type: enum INJURED_NONFATAL, INJURED_FATAL
  - cause: TypeCasualtyCauseValue|null (9 values)
  - ff_injury_details: FfInjuryDetailsPayload|null

NoinjuryPayload (additionalProperties: false, required: type):
  - type: const "UNINJURED"

FfInjuryDetailsPayload (additionalProperties: false, required: none, 9 fields):
  - unit_neris_id: string|null
  - reported_unit_id: string|null
  - unit_continuity: boolean|null
  - incident_command: boolean|null
  - job_classification: TypeJobClassificationValue|null (8 values)
  - duty_type: TypeDutyValue|null (7 values)
  - action_type: TypeCasualtyActionValue|null (13 values)
  - incident_stage: TypeCasualtyTimelineValue|null (6 values)
  - ppe_items: TypeCasualtyPpeValue[]|null (14 values)

RescuePayload (additionalProperties: false, required: ffrescue_or_nonffrescue):
  - presence_known: PresenceKnownPayload|null
  - mayday: MaydayPayload|null
  - ffrescue_or_nonffrescue: oneOf FfRescuePayload | NonFfRescuePayload
    disc=type: RESCUED_BY_FIREFIGHTER->Ff, RESCUED_BY_FF_RIT->Ff,
    EVAC_ASSISTED_BY_FIREFIGHTER->Ff, RESCUED_BY_NONFIREFIGHTER->NonFf,
    SELF_EVACUATION->NonFf, NO_RESCUE_NEEDED->NonFf

PresenceKnownPayload (additionalProperties: false, required: presence_known_type):
  - presence_known_type: TypeRescuePresenceKnownValue (3 values)

MaydayPayload (additionalProperties: false, required: none):
  - mayday: boolean, const true
  - rit_activated: boolean|null
  - relative_suppression_time: TypeSuppressTimeValue|null (3 values)

FfRescuePayload (additionalProperties: false, required: removal_or_nonremoval, type):
  - actions: TypeRescueActionValue[]|null (9 values)
  - removal_or_nonremoval: oneOf RemovalPayload | NonremovalPayload
    disc=type: REMOVAL_FROM_STRUCTURE->Removal, EXTRICATION/DISENTANGLEMENT/RECOVERY/OTHER->Nonremoval
  - type: enum RESCUED_BY_FIREFIGHTER, RESCUED_BY_FF_RIT, EVAC_ASSISTED_BY_FIREFIGHTER
  - impediments: TypeRescueImpedimentValue[]|null (6 values)

NonFfRescuePayload (additionalProperties: false, required: type):
  - type: enum RESCUED_BY_NONFIREFIGHTER, SELF_EVACUATION, NO_RESCUE_NEEDED

RemovalPayload (additionalProperties: false, required: type):
  - gas_isolation: boolean|null
  - type: const "REMOVAL_FROM_STRUCTURE"
  - room_type: TypeRoomValue|null (14 values)
  - elevation_type: TypeRescueElevationValue|null (4 values)
  - rescue_path_type: TypeRescuePathValue|null (2 values)
  - fire_removal: FireRemovalPayload|null

NonremovalPayload (additionalProperties: false, required: type):
  - type: enum EXTRICATION, DISENTANGLEMENT, RECOVERY, OTHER

FireRemovalPayload (additionalProperties: false, required: none):
  - relative_suppression_time: TypeSuppressTimeValue|null (3 values)
"""


# --- Leaf builders ---

def build_fire_removal(data: dict | None) -> dict | None:
    if data is None:
        return None
    payload = {}
    if data.get("relative_suppression_time") is not None:
        payload["relative_suppression_time"] = data["relative_suppression_time"]
    return payload if payload else {}


def build_removal(data: dict) -> dict:
    payload = {"type": "REMOVAL_FROM_STRUCTURE"}
    if data.get("gas_isolation") is not None:
        payload["gas_isolation"] = data["gas_isolation"]
    if data.get("room_type") is not None:
        payload["room_type"] = data["room_type"]
    if data.get("elevation_type") is not None:
        payload["elevation_type"] = data["elevation_type"]
    if data.get("rescue_path_type") is not None:
        payload["rescue_path_type"] = data["rescue_path_type"]
    fr = build_fire_removal(data.get("fire_removal"))
    if fr is not None:
        payload["fire_removal"] = fr
    return payload


def build_nonremoval(data: dict) -> dict:
    return {"type": data["type"]}


def build_ff_rescue(data: dict) -> dict:
    payload = {}
    payload["type"] = data["type"]
    # removal_or_nonremoval (required)
    ron = data["removal_or_nonremoval"]
    if ron.get("type") == "REMOVAL_FROM_STRUCTURE":
        payload["removal_or_nonremoval"] = build_removal(ron)
    else:
        payload["removal_or_nonremoval"] = build_nonremoval(ron)
    if data.get("actions") is not None:
        payload["actions"] = data["actions"]
    if data.get("impediments") is not None:
        payload["impediments"] = data["impediments"]
    return payload


def build_nonff_rescue(data: dict) -> dict:
    return {"type": data["type"]}


def build_presence_known(data: dict | None) -> dict | None:
    if data is None:
        return None
    return {"presence_known_type": data["presence_known_type"]}


def build_mayday(data: dict | None) -> dict | None:
    if data is None:
        return None
    payload = {"mayday": True}
    if data.get("rit_activated") is not None:
        payload["rit_activated"] = data["rit_activated"]
    if data.get("relative_suppression_time") is not None:
        payload["relative_suppression_time"] = data["relative_suppression_time"]
    return payload


def build_rescue(data: dict | None) -> dict | None:
    if data is None:
        return None
    payload = {}
    pk = build_presence_known(data.get("presence_known"))
    if pk is not None:
        payload["presence_known"] = pk
    md = build_mayday(data.get("mayday"))
    if md is not None:
        payload["mayday"] = md
    # ffrescue_or_nonffrescue (required)
    fon = data["ffrescue_or_nonffrescue"]
    ff_types = ["RESCUED_BY_FIREFIGHTER", "RESCUED_BY_FF_RIT", "EVAC_ASSISTED_BY_FIREFIGHTER"]
    if fon.get("type") in ff_types:
        payload["ffrescue_or_nonffrescue"] = build_ff_rescue(fon)
    else:
        payload["ffrescue_or_nonffrescue"] = build_nonff_rescue(fon)
    return payload


def build_ff_injury_details(data: dict | None) -> dict | None:
    if data is None:
        return None
    payload = {}
    if data.get("unit_neris_id"):
        payload["unit_neris_id"] = data["unit_neris_id"]
    if data.get("reported_unit_id"):
        payload["reported_unit_id"] = data["reported_unit_id"]
    if data.get("unit_continuity") is not None:
        payload["unit_continuity"] = data["unit_continuity"]
    if data.get("incident_command") is not None:
        payload["incident_command"] = data["incident_command"]
    if data.get("job_classification") is not None:
        payload["job_classification"] = data["job_classification"]
    if data.get("duty_type") is not None:
        payload["duty_type"] = data["duty_type"]
    if data.get("action_type") is not None:
        payload["action_type"] = data["action_type"]
    if data.get("incident_stage") is not None:
        payload["incident_stage"] = data["incident_stage"]
    if data.get("ppe_items") is not None:
        payload["ppe_items"] = data["ppe_items"]
    return payload if payload else {}


def build_injury(data: dict) -> dict:
    payload = {"type": data["type"]}
    if data.get("cause") is not None:
        payload["cause"] = data["cause"]
    fid = build_ff_injury_details(data.get("ff_injury_details"))
    if fid is not None:
        payload["ff_injury_details"] = fid
    return payload


def build_noinjury(data: dict) -> dict:
    return {"type": "UNINJURED"}


def build_casualty(data: dict | None) -> dict | None:
    if data is None:
        return None
    ion = data["injury_or_noninjury"]
    if ion.get("type") == "UNINJURED":
        return {"injury_or_noninjury": build_noinjury(ion)}
    else:
        return {"injury_or_noninjury": build_injury(ion)}


# --- Top-level ---

def build_casualty_rescue(data: dict) -> dict:
    """Build a single CasualtyRescuePayload. 8 fields, 1 required (type)."""
    payload = {}
    payload["type"] = data["type"]
    if data.get("rank"):
        payload["rank"] = data["rank"]
    if data.get("years_of_service") is not None:
        payload["years_of_service"] = data["years_of_service"]
    cas = build_casualty(data.get("casualty"))
    if cas is not None:
        payload["casualty"] = cas
    res = build_rescue(data.get("rescue"))
    if res is not None:
        payload["rescue"] = res
    if data.get("birth_month_year"):
        payload["birth_month_year"] = data["birth_month_year"]
    if data.get("gender") is not None:
        payload["gender"] = data["gender"]
    if data.get("race") is not None:
        payload["race"] = data["race"]
    return payload


def build_casualty_rescues(data_list: list | None) -> list | None:
    if data_list is None:
        return None
    if not data_list:
        return None
    return [build_casualty_rescue(item) for item in data_list]
