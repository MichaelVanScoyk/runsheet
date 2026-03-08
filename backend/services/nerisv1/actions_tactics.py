"""
nerisv1: actions_tactics builder (Section 7)

Schema: IncidentPayload.actions_tactics from api-test.neris.fsri.org/v1/openapi.json v1.4.38

actions_tactics: ActionTacticPayload | null

ActionTacticPayload (additionalProperties: false, required: action_noaction):
  - action_noaction: oneOf ActionPayload | NoactionPayload
    discriminator: type -> ACTION | NOACTION

ActionPayload (additionalProperties: false, required: none):
  - type: string, const "ACTION", default "ACTION"
  - actions: TypeActionTacticValue[] | null (89-value enum)

NoactionPayload (additionalProperties: false, required: noaction_type):
  - type: string, const "NOACTION", default "NOACTION"
  - noaction_type: TypeNoactionValue (CANCELLED, NO_INCIDENT_FOUND, STAGED_STANDBY)
"""


def build_action_payload(data: dict) -> dict:
    """Build an ActionPayload."""
    payload = {"type": "ACTION"}

    # actions: TypeActionTacticValue[] | null
    if data.get("actions") is not None:
        payload["actions"] = data["actions"]

    return payload


def build_noaction_payload(data: dict) -> dict:
    """Build a NoactionPayload."""
    payload = {"type": "NOACTION"}

    # noaction_type: TypeNoactionValue (required)
    payload["noaction_type"] = data["noaction_type"]

    return payload


def build_actions_tactics(data: dict | None) -> dict | None:
    """
    Build the actions_tactics object for IncidentPayload.
    Discriminates on action_noaction.type: ACTION or NOACTION.
    """
    if data is None:
        return None

    an = data.get("action_noaction")
    if an is None:
        return None

    if an.get("type") == "NOACTION":
        return {"action_noaction": build_noaction_payload(an)}
    else:
        return {"action_noaction": build_action_payload(an)}
