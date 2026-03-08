"""
nerisv1: tactic_timestamps builder (Section 8)

Schema: IncidentPayload.tactic_timestamps from api-test.neris.fsri.org/v1/openapi.json v1.4.38

tactic_timestamps: IncidentTacticTimestampsPayload | null

IncidentTacticTimestampsPayload (additionalProperties: false, required: none, 9 fields):
  - command_established: datetime|null
  - completed_sizeup: datetime|null
  - suppression_complete: datetime|null
  - primary_search_begin: datetime|null
  - primary_search_complete: datetime|null
  - water_on_fire: datetime|null
  - fire_under_control: datetime|null
  - fire_knocked_down: datetime|null
  - extrication_complete: datetime|null

Note: Same 9 fields as DispatchTacticTimestampsPayload (section 3) but a
separate schema in the spec. IncidentPayload refs IncidentTacticTimestampsPayload,
DispatchPayload refs DispatchTacticTimestampsPayload.
"""


def build_tactic_timestamps(data: dict | None) -> dict | None:
    """
    Build IncidentTacticTimestampsPayload for IncidentPayload.
    9 fields, all datetime|null, none required.
    """
    if data is None:
        return None

    payload = {}

    timestamp_fields = [
        "command_established",
        "completed_sizeup",
        "suppression_complete",
        "primary_search_begin",
        "primary_search_complete",
        "water_on_fire",
        "fire_under_control",
        "fire_knocked_down",
        "extrication_complete",
    ]

    for field in timestamp_fields:
        if data.get(field) is not None:
            payload[field] = data[field]

    return payload if payload else {}
