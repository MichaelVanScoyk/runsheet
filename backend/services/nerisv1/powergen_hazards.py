"""
nerisv1: powergen_hazards builder (Section 21)

Schema: IncidentPayload.powergen_hazards from api-test.neris.fsri.org/v1/openapi.json v1.4.38

powergen_hazards: PowergenHazardPayload[] | null

PowergenHazardPayload (additionalProperties: false, 1 field, required: pv_other):
  - pv_other: oneOf PvPowergenHazardPayload | OtherPowergenHazardPayload
    disc=type: PHOTOVOLTAICS -> PvPowergenHazardPayload
               WIND_TURBINE, OTHER, NOT_APPLICABLE -> OtherPowergenHazardPayload

PvPowergenHazardPayload (additionalProperties: false, 3 fields, required: type):
  - type: const "PHOTOVOLTAICS"
  - source_or_target: TypeEmerghazPvIgnValue|null (SOURCE, TARGET)
  - pv_type: TypeEmerghazPvValue|null
    (OTHER, PANEL_POWER_GENERATION, PANEL_WATER_HEATING,
     THIN_FILM_POWER_GENERATION, TILE_POWER_GENERATION)

OtherPowergenHazardPayload (additionalProperties: false, 1 field, required: type):
  - type: enum WIND_TURBINE, OTHER, NOT_APPLICABLE
"""


def build_pv_powergen(data: dict) -> dict:
    payload = {"type": "PHOTOVOLTAICS"}

    # source_or_target: TypeEmerghazPvIgnValue|null
    if data.get("source_or_target") is not None:
        payload["source_or_target"] = data["source_or_target"]

    # pv_type: TypeEmerghazPvValue|null
    if data.get("pv_type") is not None:
        payload["pv_type"] = data["pv_type"]

    return payload


def build_other_powergen(data: dict) -> dict:
    return {"type": data["type"]}


def build_powergen_hazard(data: dict) -> dict:
    """Build a single PowergenHazardPayload."""
    pv_other = data["pv_other"]
    if pv_other.get("type") == "PHOTOVOLTAICS":
        return {"pv_other": build_pv_powergen(pv_other)}
    else:
        return {"pv_other": build_other_powergen(pv_other)}


def build_powergen_hazards(data_list: list | None) -> list | None:
    if data_list is None:
        return None
    if not data_list:
        return None
    return [build_powergen_hazard(item) for item in data_list]
