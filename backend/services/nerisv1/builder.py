"""
nerisv1: IncidentPayload orchestrator (builder.py)

Schema: IncidentPayload from api-test.neris.fsri.org/v1/openapi.json v1.4.38
Fields: 23, Required: 3 (base, incident_types, dispatch)
additionalProperties: false

Assembles all 23 section builders into the final IncidentPayload.
Clean pass-through: NERIS data in -> NERIS payload out.
"""

from .base import build_base
from .incident_types import build_incident_types
from .dispatch import build_dispatch
from .special_modifiers import build_special_modifiers
from .aids import build_aids
from .nonfd_aids import build_nonfd_aids
from .actions_tactics import build_actions_tactics
from .tactic_timestamps import build_tactic_timestamps
from .unit_responses import build_unit_responses
from .exposures import build_exposures
from .casualty_rescues import build_casualty_rescues
from .fire_detail import build_fire_detail
from .hazsit_detail import build_hazsit_detail
from .medical_details import build_medical_details
from .smoke_alarm import build_smoke_alarm
from .fire_alarm import build_fire_alarm
from .other_alarm import build_other_alarm
from .fire_suppression import build_fire_suppression
from .cooking_fire_suppression import build_cooking_fire_suppression
from .electric_hazards import build_electric_hazards
from .powergen_hazards import build_powergen_hazards
from .csst_hazard import build_csst_hazard
from .medical_oxygen_hazard import build_medical_oxygen_hazard


def build_incident_payload(data: dict) -> dict:
    """
    Build the complete NERIS IncidentPayload from a dict with NERIS-native field names.

    All 23 top-level fields mapped 1:1 to the spec.
    Required: base, incident_types, dispatch.
    Optional fields included only when present and non-null.
    additionalProperties: false — only spec fields emitted.
    """
    payload = {}

    # --- Required (3) ---

    # base: IncidentBasePayload
    payload["base"] = build_base(data["base"])

    # incident_types: IncidentTypePayload[] or IncidentTypeCadPayload[]
    payload["incident_types"] = build_incident_types(data["incident_types"])

    # dispatch: DispatchPayload
    payload["dispatch"] = build_dispatch(data["dispatch"])

    # --- Optional (20) ---

    # special_modifiers: TypeSpecialModifierValue[] | null
    sm = build_special_modifiers(data.get("special_modifiers"))
    if sm is not None:
        payload["special_modifiers"] = sm

    # aids: AidPayload[] | null
    aids = build_aids(data.get("aids"))
    if aids is not None:
        payload["aids"] = aids

    # nonfd_aids: TypeAidNonfdValue[] | null
    nfa = build_nonfd_aids(data.get("nonfd_aids"))
    if nfa is not None:
        payload["nonfd_aids"] = nfa

    # actions_tactics: ActionTacticPayload | null
    at = build_actions_tactics(data.get("actions_tactics"))
    if at is not None:
        payload["actions_tactics"] = at

    # tactic_timestamps: IncidentTacticTimestampsPayload | null
    tt = build_tactic_timestamps(data.get("tactic_timestamps"))
    if tt is not None:
        payload["tactic_timestamps"] = tt

    # unit_responses: IncidentUnitResponsePayload[] | null
    ur = build_unit_responses(data.get("unit_responses"))
    if ur is not None:
        payload["unit_responses"] = ur

    # exposures: ExposurePayload[] | null
    exp = build_exposures(data.get("exposures"))
    if exp is not None:
        payload["exposures"] = exp

    # casualty_rescues: CasualtyRescuePayload[] | null
    cr = build_casualty_rescues(data.get("casualty_rescues"))
    if cr is not None:
        payload["casualty_rescues"] = cr

    # fire_detail: FirePayload | null
    fd = build_fire_detail(data.get("fire_detail"))
    if fd is not None:
        payload["fire_detail"] = fd

    # hazsit_detail: HazsitPayload | null
    hd = build_hazsit_detail(data.get("hazsit_detail"))
    if hd is not None:
        payload["hazsit_detail"] = hd

    # medical_details: MedicalPayload[] | null
    md = build_medical_details(data.get("medical_details"))
    if md is not None:
        payload["medical_details"] = md

    # smoke_alarm: SmokeAlarmPayload | null
    sa = build_smoke_alarm(data.get("smoke_alarm"))
    if sa is not None:
        payload["smoke_alarm"] = sa

    # fire_alarm: FireAlarmPayload | null
    fa = build_fire_alarm(data.get("fire_alarm"))
    if fa is not None:
        payload["fire_alarm"] = fa

    # other_alarm: OtherAlarmPayload | null
    oa = build_other_alarm(data.get("other_alarm"))
    if oa is not None:
        payload["other_alarm"] = oa

    # fire_suppression: FireSuppressionPayload | null
    fs = build_fire_suppression(data.get("fire_suppression"))
    if fs is not None:
        payload["fire_suppression"] = fs

    # cooking_fire_suppression: CookingFireSuppressionPayload | null
    cfs = build_cooking_fire_suppression(data.get("cooking_fire_suppression"))
    if cfs is not None:
        payload["cooking_fire_suppression"] = cfs

    # electric_hazards: ElectricHazardPayload[] | null
    eh = build_electric_hazards(data.get("electric_hazards"))
    if eh is not None:
        payload["electric_hazards"] = eh

    # powergen_hazards: PowergenHazardPayload[] | null
    ph = build_powergen_hazards(data.get("powergen_hazards"))
    if ph is not None:
        payload["powergen_hazards"] = ph

    # csst_hazard: CsstHazardPayload | null
    ch = build_csst_hazard(data.get("csst_hazard"))
    if ch is not None:
        payload["csst_hazard"] = ch

    # medical_oxygen_hazard: MedicalOxygenHazardPayload | null
    moh = build_medical_oxygen_hazard(data.get("medical_oxygen_hazard"))
    if moh is not None:
        payload["medical_oxygen_hazard"] = moh

    return payload
