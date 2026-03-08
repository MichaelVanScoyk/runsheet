"""
nerisv1: special_modifiers builder (Section 4)

Schema: IncidentPayload.special_modifiers from api-test.neris.fsri.org/v1/openapi.json v1.4.38

special_modifiers: TypeSpecialModifierValue[] | null

TypeSpecialModifierValue: string enum:
  - ACTIVE_ASSAILANT
  - COUNTY_LOCAL_DECLARED_DISASTER
  - FEDERAL_DECLARED_DISASTER
  - MCI
  - STATE_DECLARED_DISASTER
  - URBAN_CONFLAGRATION
  - VIOLENCE_AGAINST_RESPONDER
"""


def build_special_modifiers(data_list: list | None) -> list | None:
    """
    Build the special_modifiers array for IncidentPayload.
    Pass-through: list of TypeSpecialModifierValue strings or None.
    """
    if data_list is None:
        return None

    if not data_list:
        return None

    return list(data_list)
