"""
nerisv1: NERIS Code Sync Endpoint

Pulls current enum values directly from the live NERIS OpenAPI spec
and upserts them into the neris_codes table. Replaces the manual
CSV download/import workflow with a one-click sync.

The admin NERIS Codes page (Browse, Import, Validate, Update Incidents)
remains untouched — it reads from the same neris_codes table.

Usage:
  POST /api/nerisv1/sync-codes
  POST /api/nerisv1/sync-codes?api_url=https://api.neris.fsri.org/v1

Default: api-test.neris.fsri.org (test environment)
Switch to api.neris.fsri.org for production when ready.
"""

import logging
import httpx
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

# Mapping: OpenAPI spec enum name → neris_codes category name
# Category names match the existing CSV filenames from ulfsri/neris-framework
# and the categories already in the neris_codes table.
ENUM_TO_CATEGORY = {
    # Actions / Tactics
    "TypeActionTacticValue": "type_action_tactic",
    "TypeActionValue": "type_action",
    "TypeNoactionValue": "type_noaction",
    "TypeSpecialModifierValue": "type_special_modifier",
    # Aid
    "TypeAidValue": "type_aid",
    "TypeAidDirectionValue": "type_aid_direction",
    "TypeAidNonfdValue": "type_aid_nonfd",
    # Alarms
    "TypeAlarmFailureValue": "type_alarm_failure",
    "TypeAlarmFireValue": "type_alarm_fire",
    "TypeAlarmOperationValue": "type_alarm_operation",
    "TypeAlarmOtherValue": "type_alarm_other",
    "TypeAlarmSmokeValue": "type_alarm_smoke",
    # Casualty / Rescue
    "TypeCasualtyActionValue": "type_casualty_action",
    "TypeCasualtyCauseValue": "type_casualty_cause",
    "TypeCasualtyPpeValue": "type_casualty_ppe",
    "TypeCasualtyTimelineValue": "type_casualty_timeline",
    "TypeGenderValue": "type_gender",
    "TypeRaceValue": "type_race",
    "TypeRescueActionValue": "type_rescue_action",
    "TypeRescueElevationValue": "type_rescue_elevation",
    "TypeRescueImpedimentValue": "type_rescue_impediment",
    "TypeRescueModeValue": "type_rescue_mode",
    "TypeRescuePathValue": "type_rescue_path",
    "TypeRescuePresenceKnownValue": "type_rescue_presence_known",
    # Dispatch
    "TypeDispProtoFireValue": "type_disp_proto_fire",
    "TypeDispProtoMedValue": "type_disp_proto_med",
    "TypeResponseModeValue": "type_response_mode",
    # Displacement
    "TypeDisplaceCauseValueRelIncident": "type_displace_cause_incident",
    "TypeDisplaceCauseValueRelExposure": "type_displace_cause_exposure",
    # Duty
    "TypeDutyValue": "type_duty",
    "TypeJobClassificationValue": "type_job_classification",
    # Emerging Hazards
    "TypeEmerghazElecValue": "type_emerghaz_elec",
    "TypeEmerghazPvValue": "type_emerghaz_pv",
    "TypeEmerghazPvIgnValue": "type_emerghaz_pv_ign",
    "TypeEmerghazSuppressionValue": "type_emerghaz_suppression",
    "TypeSourceTargetValue": "type_source_target",
    # Entity / Department
    "TypeDeptValue": "type_dept",
    "TypeEntityValue": "type_entity",
    # Exposure
    "TypeExposureDamageValue": "type_exposure_damage",
    "TypeExposureItemValue": "type_exposure_item",
    # Fire
    "TypeFireBldgDamageValue": "type_fire_bldg_damage",
    "TypeFireCauseInValue": "type_fire_cause_in",
    "TypeFireCauseOutValue": "type_fire_cause_out",
    "TypeFireConditionArrivalValue": "type_fire_condition_arrival",
    "TypeFireInvestValue": "type_fire_invest",
    "TypeFireInvestNeedValue": "type_fire_invest_need",
    "TypeFireProgressionValue": "type_fire_progression",
    "TypeFullPartialValue": "type_full_partial",
    "TypeRoomValue": "type_room",
    "TypeWaterSupplyValue": "type_water_supply",
    # Hazmat
    "TypeHazardCauseValue": "type_hazard_cause",
    "TypeHazardDispositionValue": "type_hazard_disposition",
    "TypeHazardDotValue": "type_hazard_dot",
    "TypeHazardPhysicalStateValue": "type_hazard_physical_state",
    "TypeHazardReleasedIntoValue": "type_hazard_released_into",
    "TypeHazardUnitValue": "type_hazard_unit",
    # Incident
    "TypeIncidentValue": "type_incident",
    # Location
    "TypeLocCspCountryValue": "type_loc_csp_country",
    "TypeLocPlaceValue": "type_loc_place",
    "TypeLocSnDirectionValue": "type_loc_sn_direction",
    "TypeLocSnPrePostValue": "type_loc_sn_pre_post",
    "TypeLocSnPreSepValue": "type_loc_sn_pre_sep",
    "TypeLocationCrossStreetValue": "type_location_cross_street",
    "TypeLocationUseValue": "type_location_use",
    "TypeVacancyValue": "type_vacancy",
    # Medical
    "TypeMedicalPatientCareValue": "type_medical_patient_care",
    "TypeMedicalPatientStatusValue": "type_medical_patient_status",
    "TypeMedicalTransportValue": "type_medical_transport",
    # Occupant
    "TypeOccupantResponseValue": "type_occupant_response",
    # PSAP
    "TypePsapValue": "type_psap",
    "TypePsapCapaValue": "type_psap_capa",
    "TypePsapDiscValue": "type_psap_disc",
    "TypePsapJurisValue": "type_psap_juris",
    # Region
    "TypeRegionValue": "type_region",
    # Risk Reduction / Suppression
    "TypeSuppressApplianceValue": "type_suppress_appliance",
    "TypeSuppressCookingValue": "type_suppress_cooking",
    "TypeSuppressFireValue": "type_suppress_fire",
    "TypeSuppressNoOperationValue": "type_suppress_no_operation",
    "TypeSuppressOperationValue": "type_suppress_operation",
    "TypeSuppressTimeValue": "type_suppress_time",
    # Services
    "TypeServEmsValue": "type_serv_ems",
    "TypeServFdValue": "type_serv_fd",
    "TypeServInvestValue": "type_serv_invest",
    # Unit
    "TypeUnitValue": "type_unit",
    # Yes/No/Unknown
    "TypeYesNoUnknownValue": "type_yes_no_unknown",
    # Powergen (maps to existing)
    "TypeEmerghazPowergenValue": "type_emerghaz_powergen",
    # RR presence
    "TypeRrPresenceValue": "type_rr_presence",
    # Rescue type
    "TypeRescueValue": "type_rescue",
}

# Enums that use hierarchical || separator (have value_1, value_2, value_3 columns)
HIERARCHICAL_CATEGORIES = {
    "type_action_tactic",
    "type_emerghaz_elec",
    "type_incident",
    "type_location_use",
}


def _parse_hierarchical_value(value: str) -> dict:
    """Parse a || separated hierarchical value into components."""
    parts = value.split("||")
    return {
        "value_1": parts[0] if len(parts) > 0 else None,
        "value_2": parts[1] if len(parts) > 1 else None,
        "value_3": parts[2] if len(parts) > 2 else None,
    }


@router.post("/sync-codes")
async def sync_codes(
    api_url: str = Query(
        "https://api-test.neris.fsri.org/v1",
        description="NERIS API base URL. Use https://api.neris.fsri.org/v1 for production."
    ),
    db: Session = Depends(get_db),
):
    """
    Sync NERIS enum codes from the live OpenAPI spec into neris_codes table.

    Fetches the OpenAPI spec from the given API URL, extracts all enum types,
    and upserts them into neris_codes. Does not delete existing values —
    only adds missing ones and reports what changed.

    Returns a detailed report of what was synced.
    """
    spec_url = f"{api_url.rstrip('/')}/openapi.json"

    # Fetch the live spec
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(spec_url)
            resp.raise_for_status()
            spec = resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch OpenAPI spec from {spec_url}: {e}")
        return {"error": f"Failed to fetch spec: {e}", "spec_url": spec_url}

    version = spec.get("info", {}).get("version", "unknown")
    schemas = spec.get("components", {}).get("schemas", {})

    report = {
        "spec_url": spec_url,
        "spec_version": version,
        "categories_synced": 0,
        "values_added": 0,
        "values_already_existed": 0,
        "categories_not_in_spec": [],
        "details": [],
    }

    for spec_name, category in ENUM_TO_CATEGORY.items():
        schema = schemas.get(spec_name)
        if not schema or not schema.get("enum"):
            report["categories_not_in_spec"].append({
                "spec_name": spec_name,
                "category": category,
            })
            continue

        spec_values = schema["enum"]
        is_hierarchical = category in HIERARCHICAL_CATEGORIES

        # Get existing values for this category
        existing = db.execute(
            text("SELECT value FROM neris_codes WHERE category = :cat"),
            {"cat": category},
        ).fetchall()
        existing_values = {r[0] for r in existing}

        added = []
        already_existed = 0

        for value in spec_values:
            if value in existing_values:
                already_existed += 1
                continue

            # Build insert params
            params = {
                "category": category,
                "value": value,
                "active": True,
                "import_source": f"nerisv1-sync:{version}",
            }

            if is_hierarchical:
                parts = _parse_hierarchical_value(value)
                params.update(parts)
                db.execute(text("""
                    INSERT INTO neris_codes (category, value, active, value_1, value_2, value_3, import_source, imported_at)
                    VALUES (:category, :value, :active, :value_1, :value_2, :value_3, :import_source, CURRENT_TIMESTAMP)
                """), params)
            else:
                db.execute(text("""
                    INSERT INTO neris_codes (category, value, active, import_source, imported_at)
                    VALUES (:category, :value, :active, :import_source, CURRENT_TIMESTAMP)
                """), params)

            added.append(value)

        cat_detail = {
            "category": category,
            "spec_name": spec_name,
            "spec_count": len(spec_values),
            "db_existed": already_existed,
            "added": len(added),
        }

        # Check for values in DB that are no longer in spec
        removed_from_spec = existing_values - set(spec_values)
        if removed_from_spec:
            cat_detail["no_longer_in_spec"] = sorted(removed_from_spec)
            cat_detail["no_longer_in_spec_count"] = len(removed_from_spec)

        if added:
            cat_detail["added_values"] = added

        report["details"].append(cat_detail)
        report["categories_synced"] += 1
        report["values_added"] += len(added)
        report["values_already_existed"] += already_existed

    # Record in import history
    db.execute(text("""
        INSERT INTO neris_import_history
            (category, rows_imported, rows_updated, rows_removed, source_filename, import_mode)
        VALUES
            (:cat, :imported, 0, 0, :source, 'sync')
    """), {
        "cat": f"nerisv1-sync-all:{version}",
        "imported": report["values_added"],
        "source": spec_url,
    })

    db.commit()

    return report
