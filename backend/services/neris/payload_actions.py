"""
NERIS Actions/Tactics Payload Builder

Maps our DB fields → NERIS ActionTacticPayload + AidPayload[] + nonfd_aids

Source DB fields:
  - incidents.neris_action_codes (text array)
  - incidents.neris_noaction_code (text)
  - incidents.neris_aid_direction
  - incidents.neris_aid_type
  - incidents.mutual_aid_department_ids (→ lookup NERIS IDs)

NERIS target: ActionTacticPayload, AidPayload[], TypeAidNonfdValue[]
"""


def build_actions_tactics(incident: dict) -> dict | None:
    """
    Build NERIS ActionTacticPayload.
    
    Mutually exclusive: ACTION with actions list, or NOACTION with reason.
    Never both.
    """
    actions = incident.get("neris_action_codes") or []
    noaction = incident.get("neris_noaction_code")

    # NOACTION takes priority if set (cancelled, no incident found, etc.)
    if noaction:
        return {
            "action_noaction": {
                "type": "NOACTION",
                "noaction_type": noaction,
            }
        }

    # ACTION with list of action codes
    if actions:
        return {
            "action_noaction": {
                "type": "ACTION",
                "actions": [a for a in actions if a],
            }
        }

    return None


def build_aids(incident: dict, aid_departments: list | None = None) -> list | None:
    """
    Build NERIS AidPayload array.
    
    Our DB stores:
      - neris_aid_direction: GIVEN or RECEIVED
      - neris_aid_type: SUPPORT_AID, IN_LIEU_AID, ACTING_AS_AID
      - mutual_aid_department_ids: row IDs from neris_mutual_aid_departments
    
    aid_departments: pre-looked-up list of dicts with neris_department_id field
    """
    direction = incident.get("neris_aid_direction")
    aid_type = incident.get("neris_aid_type")

    if not direction or not aid_type:
        return None

    if not aid_departments:
        return None

    aids = []
    for dept in aid_departments:
        dept_neris_id = dept.get("neris_department_id")
        if not dept_neris_id:
            continue
        aids.append({
            "department_neris_id": dept_neris_id,
            "aid_type": aid_type,
            "aid_direction": direction,
        })

    return aids if aids else None


def build_nonfd_aids(incident: dict) -> list | None:
    """
    Build NERIS nonfd_aids array.
    
    Our DB: neris_additional_data JSONB may contain nonfd_aids.
    Values: LAW_ENFORCEMENT, SOCIAL_SERVICES, ANIMAL_SERVICES, etc.
    """
    additional = incident.get("neris_additional_data") or {}
    nonfd = additional.get("nonfd_aids")

    if not nonfd or not isinstance(nonfd, list):
        return None

    return [a for a in nonfd if a]
