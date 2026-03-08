"""
nerisv1: nonfd_aids builder (Section 6)

Schema: IncidentPayload.nonfd_aids from api-test.neris.fsri.org/v1/openapi.json v1.4.38

nonfd_aids: TypeAidNonfdValue[] | null

TypeAidNonfdValue: string enum:
  - ANIMAL_SERVICES
  - EMS
  - HOUSING_SERVICES
  - LAW_ENFORCEMENT
  - REMEDIATION_SERVICES
  - SOCIAL_SERVICES
  - UTILITIES_PUBLIC_WORKS
"""


def build_nonfd_aids(data_list: list | None) -> list | None:
    """
    Build the nonfd_aids array for IncidentPayload.
    Pass-through: list of TypeAidNonfdValue strings or None.
    """
    if data_list is None:
        return None

    if not data_list:
        return None

    return list(data_list)
