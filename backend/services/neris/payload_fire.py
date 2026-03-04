"""
NERIS Fire Detail Payload Builder

Maps our DB fields → NERIS FirePayload + alarm/suppression modules.

Source DB fields:
  - incidents.neris_fire_* fields
  - incidents.neris_rr_* fields (risk reduction / alarm / suppression)

NERIS target: FirePayload, SmokeAlarmPayload, FireAlarmPayload,
              OtherAlarmPayload, FireSuppressionPayload, CookingFireSuppressionPayload

CONDITIONAL: Only include fire_detail if incident has FIRE|| type.
             Alarm/suppression modules required for FIRE||STRUCTURE_FIRE.
"""


def build_fire_detail(incident: dict) -> dict | None:
    """
    Build NERIS FirePayload.
    
    Two discriminated variants:
      - STRUCTURE: floor_of_origin, arrival_condition, damage_type, room, cause (all required)
      - OUTSIDE: acres_burned (optional), cause (required)
    
    We determine type from neris_fire_structure_cause vs neris_fire_outside_cause.
    """
    structure_cause = incident.get("neris_fire_structure_cause")
    outside_cause = incident.get("neris_fire_outside_cause")

    # Determine fire sub-type from incident type codes
    type_codes = incident.get("neris_incident_type_codes") or []
    has_structure = any(t and "STRUCTURE_FIRE" in t for t in type_codes)
    has_outside = any(t and "OUTSIDE_FIRE" in t for t in type_codes)
    has_transport = any(t and "TRANSPORTATION_FIRE" in t for t in type_codes)

    if not structure_cause and not outside_cause:
        # Check if any fire detail fields exist at all
        has_any = (incident.get("neris_fire_investigation_need")
                   or incident.get("neris_fire_water_supply")
                   or incident.get("neris_fire_suppression_appliances"))
        if not has_any:
            return None

    # Common fields
    fire = {}

    if incident.get("neris_fire_investigation_need"):
        fire["investigation_needed"] = incident["neris_fire_investigation_need"]

    inv_types = incident.get("neris_fire_investigation_type") or []
    if inv_types:
        fire["investigation_types"] = inv_types
    else:
        fire["investigation_types"] = []

    # Water supply
    water = incident.get("neris_fire_water_supply")
    if water:
        fire["water_supply"] = water

    # Suppression appliances
    appliances = incident.get("neris_fire_suppression_appliances") or []
    if appliances:
        fire["suppression_appliances"] = appliances

    # Location detail — structure vs outside
    if structure_cause:
        detail = {
            "type": "STRUCTURE",
            "cause": structure_cause,
        }
        if incident.get("neris_fire_structure_floor") is not None:
            detail["floor_of_origin"] = incident["neris_fire_structure_floor"]
        if incident.get("neris_fire_arrival_conditions"):
            detail["arrival_condition"] = incident["neris_fire_arrival_conditions"]
        if incident.get("neris_fire_structure_damage"):
            detail["damage_type"] = incident["neris_fire_structure_damage"]
        if incident.get("neris_fire_structure_room"):
            detail["room_of_origin_type"] = incident["neris_fire_structure_room"]
        # Optional
        if incident.get("neris_fire_progression_evident") is not None:
            detail["progression_evident"] = incident["neris_fire_progression_evident"]

        fire["location_detail"] = detail

    elif outside_cause:
        detail = {
            "type": "OUTSIDE",
            "cause": outside_cause,
        }
        additional = incident.get("neris_additional_data") or {}
        if additional.get("acres_burned") is not None:
            detail["acres_burned"] = additional["acres_burned"]

        fire["location_detail"] = detail

    return fire if fire else None


def build_smoke_alarm(incident: dict) -> dict | None:
    """Build NERIS SmokeAlarmPayload from neris_rr_smoke_alarm_* fields."""
    rr = incident.get("neris_risk_reduction") or {}
    presence = rr.get("smoke_alarm_presence")

    if not presence:
        return None

    if presence in ("NOT_PRESENT", "UNDETERMINED"):
        return {"presence": {"type": presence}}

    # PRESENT
    payload = {"presence": {"type": "PRESENT"}}
    present = payload["presence"]

    if incident.get("neris_rr_smoke_alarm_working") is not None:
        present["working"] = incident["neris_rr_smoke_alarm_working"]

    alarm_types = incident.get("neris_rr_smoke_alarm_type") or []
    if alarm_types:
        present["alarm_types"] = alarm_types

    # Operation sub-object
    operation = incident.get("neris_rr_smoke_alarm_operation")
    if operation:
        # Operation contains the alerted/failed/other discriminator
        present["operation"] = {"alerted_failed_other": operation}

    return payload


def build_fire_alarm(incident: dict) -> dict | None:
    """Build NERIS FireAlarmPayload from neris_rr_fire_alarm_* fields."""
    rr = incident.get("neris_risk_reduction") or {}
    presence = rr.get("fire_alarm_presence")

    if not presence:
        return None

    if presence in ("NOT_PRESENT", "UNDETERMINED"):
        return {"presence": {"type": presence}}

    payload = {"presence": {"type": "PRESENT"}}
    present = payload["presence"]

    alarm_types = incident.get("neris_rr_fire_alarm_type") or []
    if alarm_types:
        present["alarm_types"] = alarm_types

    if incident.get("neris_rr_fire_alarm_operation"):
        present["operation_type"] = incident["neris_rr_fire_alarm_operation"]

    return payload


def build_other_alarm(incident: dict) -> dict | None:
    """Build NERIS OtherAlarmPayload."""
    rr = incident.get("neris_risk_reduction") or {}
    presence = rr.get("other_alarm_presence") or incident.get("neris_rr_other_alarm")

    if not presence:
        return None

    if presence in ("NOT_PRESENT", "UNDETERMINED"):
        return {"presence": {"type": presence}}

    payload = {"presence": {"type": "PRESENT"}}
    present = payload["presence"]

    alarm_types = incident.get("neris_rr_other_alarm_type") or []
    if alarm_types:
        present["alarm_types"] = alarm_types

    return payload


def build_fire_suppression(incident: dict) -> dict | None:
    """Build NERIS FireSuppressionPayload from neris_rr_sprinkler_* fields."""
    rr = incident.get("neris_risk_reduction") or {}
    presence = rr.get("fire_suppression_presence")

    if not presence:
        return None

    if presence in ("NOT_PRESENT", "UNDETERMINED"):
        return {"presence": {"type": presence}}

    payload = {"presence": {"type": "PRESENT"}}
    present = payload["presence"]

    # Suppression types
    sprinkler_types = incident.get("neris_rr_sprinkler_type") or []
    if sprinkler_types:
        type_entries = []
        for st in sprinkler_types:
            entry = {"type": st}
            coverage = incident.get("neris_rr_sprinkler_coverage")
            if coverage:
                entry["full_partial"] = coverage
            type_entries.append(entry)
        present["suppression_types"] = type_entries

    # Operation / effectiveness
    operation = incident.get("neris_rr_sprinkler_operation")
    if operation:
        op = {"effectiveness": {}}
        heads = incident.get("neris_rr_sprinkler_heads_activated")
        if operation == "EFFECTIVE":
            op["effectiveness"] = {"type": "EFFECTIVE"}
            if heads is not None:
                op["effectiveness"]["sprinklers_activated"] = heads
        elif operation == "INEFFECTIVE":
            op["effectiveness"] = {"type": "INEFFECTIVE"}
            failure = incident.get("neris_rr_sprinkler_failure")
            if failure:
                op["effectiveness"]["failure_reason"] = failure
        else:
            op["effectiveness"] = {"type": operation}
        present["operation_type"] = op

    return payload


def build_cooking_fire_suppression(incident: dict) -> dict | None:
    """Build NERIS CookingFireSuppressionPayload."""
    presence = incident.get("neris_rr_cooking_suppression")

    if not presence:
        return None

    if presence in ("NOT_PRESENT", "UNDETERMINED"):
        return {"presence": {"type": presence}}

    payload = {"presence": {"type": "PRESENT"}}
    present = payload["presence"]

    types = incident.get("neris_rr_cooking_suppression_type") or []
    if types:
        present["suppression_types"] = types

    return payload
