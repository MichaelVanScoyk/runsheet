"""
Incident Duplication Routes - Admin Feature
Extracted from incidents.py for maintainability.

Allows duplicating an incident to a different category (FIRE→EMS, etc.)
- GET /{incident_id}/duplicate-check - Check if duplication is allowed
- POST /{incident_id}/duplicate - Create duplicate incident
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone
import logging

from database import get_db
from models import Incident, IncidentUnit, IncidentPersonnel
from schemas_incidents import IncidentDuplicate
from incident_helpers import (
    log_incident_audit,
    maybe_generate_neris_id,
    CATEGORY_PREFIXES,
    claim_incident_number,
)

# Settings helper
try:
    from routers.settings import get_setting_value
    SETTINGS_AVAILABLE = True
except ImportError:
    SETTINGS_AVAILABLE = False

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{incident_id}/duplicate-check")
async def check_duplicate_status(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Check if an incident has already been duplicated.
    Returns info needed for the confirmation dialog.
    """
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Check if feature is enabled
    feature_enabled = False
    if SETTINGS_AVAILABLE:
        feature_enabled = get_setting_value(db, 'features', 'allow_incident_duplication', False)
    
    if not feature_enabled:
        return {
            "feature_enabled": False,
            "incident_id": incident_id,
            "existing_copies": 0,
            "copy_cad_numbers": []
        }
    
    # Find existing copies by looking for CAD numbers that start with this one + "C"
    base_cad = incident.cad_event_number
    
    # Look for pattern: {base_cad}C, {base_cad}C2, {base_cad}C3, etc.
    existing_copies = db.execute(text("""
        SELECT cad_event_number, call_category, internal_incident_number
        FROM incidents
        WHERE (
            cad_event_number = :cad_c
            OR cad_event_number LIKE :cad_c_pattern
        )
        AND deleted_at IS NULL
        ORDER BY cad_event_number
    """), {
        "cad_c": f"{base_cad}C",
        "cad_c_pattern": f"{base_cad}C%"
    }).fetchall()
    
    copy_info = [
        {
            "cad_event_number": row[0],
            "call_category": row[1],
            "internal_incident_number": row[2]
        }
        for row in existing_copies
    ]
    
    return {
        "feature_enabled": True,
        "incident_id": incident_id,
        "source_cad_number": base_cad,
        "source_category": incident.call_category,
        "source_internal_number": incident.internal_incident_number,
        "existing_copies": len(copy_info),
        "copy_info": copy_info
    }


@router.post("/{incident_id}/duplicate")
async def duplicate_incident(
    incident_id: int,
    data: IncidentDuplicate,
    edited_by: int = Query(None, description="Personnel ID of admin duplicating"),
    db: Session = Depends(get_db)
):
    """
    Duplicate an incident to a different category.
    
    This creates a complete copy of the incident with:
    - New internal incident number in the target category sequence
    - Modified CAD event number with "C" suffix (C, C2, C3, etc.)
    - All incident data copied
    - Audit trail noting the original incident
    
    Admin-only feature, must be enabled in settings.
    """
    # Check if feature is enabled
    feature_enabled = False
    if SETTINGS_AVAILABLE:
        feature_enabled = get_setting_value(db, 'features', 'allow_incident_duplication', False)
    
    if not feature_enabled:
        raise HTTPException(
            status_code=403, 
            detail="Incident duplication is not enabled. Enable it in Settings > Features."
        )
    
    # Validate target category
    target_category = data.target_category.upper()
    if target_category not in CATEGORY_PREFIXES:
        raise HTTPException(status_code=400, detail=f"Invalid target category: {target_category}")
    
    # Get source incident
    source = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.deleted_at.is_(None)
    ).first()
    
    if not source:
        raise HTTPException(status_code=404, detail="Source incident not found")
    
    # Generate new CAD event number with C suffix
    base_cad = source.cad_event_number
    
    # Find existing copies to determine next suffix
    existing_copies = db.execute(text("""
        SELECT cad_event_number
        FROM incidents
        WHERE (
            cad_event_number = :cad_c
            OR cad_event_number LIKE :cad_c_pattern
        )
        AND deleted_at IS NULL
        ORDER BY cad_event_number
    """), {
        "cad_c": f"{base_cad}C",
        "cad_c_pattern": f"{base_cad}C%"
    }).fetchall()
    
    if not existing_copies:
        new_cad_number = f"{base_cad}C"
    else:
        # Find the highest C number
        max_suffix = 1
        for row in existing_copies:
            cad = row[0]
            # Parse suffix: "...C" = 1, "...C2" = 2, "...C3" = 3, etc.
            suffix_part = cad[len(base_cad) + 1:]  # Everything after the "C"
            if suffix_part == "":
                current_suffix = 1
            else:
                try:
                    current_suffix = int(suffix_part)
                except ValueError:
                    current_suffix = 1
            max_suffix = max(max_suffix, current_suffix)
        
        new_cad_number = f"{base_cad}C{max_suffix + 1}"
    
    # Get new internal incident number for target category
    new_internal_number = claim_incident_number(db, source.year_prefix, target_category)
    
    # Create the duplicate incident
    # Copy all fields except ID, internal_incident_number, cad_event_number, call_category, neris_id
    new_incident = Incident(
        internal_incident_number=new_internal_number,
        year_prefix=source.year_prefix,
        call_category=target_category,
        detail_type=source.detail_type if target_category == 'DETAIL' else None,
        status=source.status,
        
        # Modified CAD number
        cad_event_number=new_cad_number,
        cad_event_id=source.cad_event_id,
        cad_event_type=source.cad_event_type,
        cad_event_subtype=source.cad_event_subtype,
        cad_raw_dispatch=source.cad_raw_dispatch,
        cad_raw_updates=source.cad_raw_updates,
        cad_raw_clear=source.cad_raw_clear,
        cad_dispatch_received_at=source.cad_dispatch_received_at,
        cad_clear_received_at=source.cad_clear_received_at,
        cad_last_updated_at=source.cad_last_updated_at,
        cad_reopen_count=0,
        cad_units=source.cad_units,
        cad_event_comments=source.cad_event_comments,
        
        # Location
        address=source.address,
        municipality_id=source.municipality_id,
        municipality_code=source.municipality_code,
        cross_streets=source.cross_streets,
        esz_box=source.esz_box,
        neris_location=source.neris_location,
        latitude=source.latitude,
        longitude=source.longitude,
        
        # Times
        incident_date=source.incident_date,
        time_dispatched=source.time_dispatched,
        time_first_enroute=source.time_first_enroute,
        time_first_on_scene=source.time_first_on_scene,
        time_last_cleared=source.time_last_cleared,
        time_in_service=source.time_in_service,
        time_event_start=source.time_event_start,
        time_event_end=source.time_event_end,
        
        # Tactic timestamps
        time_command_established=source.time_command_established,
        time_sizeup_completed=source.time_sizeup_completed,
        time_primary_search_begin=source.time_primary_search_begin,
        time_primary_search_complete=source.time_primary_search_complete,
        time_water_on_fire=source.time_water_on_fire,
        time_fire_under_control=source.time_fire_under_control,
        time_fire_knocked_down=source.time_fire_knocked_down,
        time_suppression_complete=source.time_suppression_complete,
        time_extrication_complete=source.time_extrication_complete,
        time_secondary_search_begin=source.time_secondary_search_begin,
        time_secondary_search_complete=source.time_secondary_search_complete,
        time_ventilation_start=source.time_ventilation_start,
        time_ventilation_complete=source.time_ventilation_complete,
        time_overhaul_start=source.time_overhaul_start,
        time_overhaul_complete=source.time_overhaul_complete,
        time_rit_activated=source.time_rit_activated,
        time_mayday_declared=source.time_mayday_declared,
        time_mayday_cleared=source.time_mayday_cleared,
        time_extrication_start=source.time_extrication_start,
        
        # EMS timestamps
        time_patient_contact=source.time_patient_contact,
        time_patient_assessment_complete=source.time_patient_assessment_complete,
        time_cpr_started=source.time_cpr_started,
        time_aed_applied=source.time_aed_applied,
        time_aed_shock_delivered=source.time_aed_shock_delivered,
        time_rosc_achieved=source.time_rosc_achieved,
        time_airway_secured=source.time_airway_secured,
        time_iv_access=source.time_iv_access,
        
        # Operational timestamps
        time_par_started=source.time_par_started,
        time_par_complete=source.time_par_complete,
        time_evac_ordered=source.time_evac_ordered,
        time_water_supply_established=source.time_water_supply_established,
        time_all_clear=source.time_all_clear,
        time_loss_stop=source.time_loss_stop,
        time_utilities_secured=source.time_utilities_secured,
        time_rehab_established=source.time_rehab_established,
        time_investigation_requested=source.time_investigation_requested,
        
        # Hazmat timestamps
        time_hazmat_identified=source.time_hazmat_identified,
        time_hazmat_contained=source.time_hazmat_contained,
        time_decon_started=source.time_decon_started,
        time_decon_complete=source.time_decon_complete,
        
        # Technical rescue timestamps
        time_victim_located=source.time_victim_located,
        time_victim_accessed=source.time_victim_accessed,
        time_victim_freed=source.time_victim_freed,
        
        # Wildland timestamps
        time_wildland_contained=source.time_wildland_contained,
        time_wildland_controlled=source.time_wildland_controlled,
        time_wildland_mopup_complete=source.time_wildland_mopup_complete,
        
        # Caller
        caller_name=source.caller_name,
        caller_phone=source.caller_phone,
        caller_source=source.caller_source,
        
        # Weather
        weather_conditions=source.weather_conditions,
        weather_fetched_at=source.weather_fetched_at,
        weather_api_data=source.weather_api_data,
        
        # Narrative fields
        companies_called=source.companies_called,
        situation_found=source.situation_found,
        extent_of_damage=source.extent_of_damage,
        services_provided=source.services_provided,
        narrative=source.narrative,
        equipment_used=source.equipment_used,
        problems_issues=source.problems_issues,
        
        # Chiefs report fields
        property_value_at_risk=source.property_value_at_risk,
        fire_damages_estimate=source.fire_damages_estimate,
        ff_injuries_count=source.ff_injuries_count,
        civilian_injuries_count=source.civilian_injuries_count,
        
        # NERIS classification (will need new NERIS ID)
        neris_id=None,  # Will be generated separately
        neris_incident_type_codes=source.neris_incident_type_codes,
        neris_incident_type_primary=source.neris_incident_type_primary,
        neris_location_use=source.neris_location_use,
        neris_action_codes=source.neris_action_codes,
        neris_noaction_code=source.neris_noaction_code,
        neris_aid_direction=source.neris_aid_direction,
        neris_aid_type=source.neris_aid_type,
        neris_aid_departments=source.neris_aid_departments,
        neris_additional_data=source.neris_additional_data,
        neris_people_present=source.neris_people_present,
        neris_displaced_number=source.neris_displaced_number,
        neris_risk_reduction=source.neris_risk_reduction,
        neris_rescue_ff=source.neris_rescue_ff,
        neris_rescue_nonff=source.neris_rescue_nonff,
        neris_rescue_animal=source.neris_rescue_animal,
        neris_narrative_impedance=source.neris_narrative_impedance,
        neris_narrative_outcome=source.neris_narrative_outcome,
        
        # NERIS Fire module
        neris_fire_investigation_need=source.neris_fire_investigation_need,
        neris_fire_investigation_type=source.neris_fire_investigation_type,
        neris_fire_arrival_conditions=source.neris_fire_arrival_conditions,
        neris_fire_structure_damage=source.neris_fire_structure_damage,
        neris_fire_structure_floor=source.neris_fire_structure_floor,
        neris_fire_structure_room=source.neris_fire_structure_room,
        neris_fire_structure_cause=source.neris_fire_structure_cause,
        neris_fire_outside_cause=source.neris_fire_outside_cause,
        
        # NERIS Medical module
        neris_medical_patient_care=source.neris_medical_patient_care,
        
        # NERIS Hazmat module
        neris_hazmat_disposition=source.neris_hazmat_disposition,
        neris_hazmat_evacuated=source.neris_hazmat_evacuated,
        neris_hazmat_chemicals=source.neris_hazmat_chemicals,
        
        # NERIS Exposures and Emerging Hazards
        neris_exposures=source.neris_exposures,
        neris_emerging_hazard=source.neris_emerging_hazard,
        
        # NERIS Risk Reduction Details
        neris_rr_smoke_alarm_type=source.neris_rr_smoke_alarm_type,
        neris_rr_smoke_alarm_working=source.neris_rr_smoke_alarm_working,
        neris_rr_smoke_alarm_operation=source.neris_rr_smoke_alarm_operation,
        neris_rr_smoke_alarm_failure=source.neris_rr_smoke_alarm_failure,
        neris_rr_smoke_alarm_action=source.neris_rr_smoke_alarm_action,
        neris_rr_fire_alarm_type=source.neris_rr_fire_alarm_type,
        neris_rr_fire_alarm_operation=source.neris_rr_fire_alarm_operation,
        neris_rr_other_alarm=source.neris_rr_other_alarm,
        neris_rr_other_alarm_type=source.neris_rr_other_alarm_type,
        neris_rr_sprinkler_type=source.neris_rr_sprinkler_type,
        neris_rr_sprinkler_coverage=source.neris_rr_sprinkler_coverage,
        neris_rr_sprinkler_operation=source.neris_rr_sprinkler_operation,
        neris_rr_sprinkler_heads_activated=source.neris_rr_sprinkler_heads_activated,
        neris_rr_sprinkler_failure=source.neris_rr_sprinkler_failure,
        neris_rr_cooking_suppression=source.neris_rr_cooking_suppression,
        neris_rr_cooking_suppression_type=source.neris_rr_cooking_suppression_type,
        
        # Audit - don't copy submission status
        neris_submitted_at=None,
        neris_submission_id=None,
        neris_validation_errors=None,
        neris_last_validated_at=None,
        
        # Review
        officer_in_charge=source.officer_in_charge,
        completed_by=edited_by or source.completed_by,
        review_status='pending',
        reviewed_by=None,
        reviewed_at=None,
        out_of_sequence=False,
        
        # Timestamps
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        deleted_at=None,
    )
    
    db.add(new_incident)
    db.flush()
    
    # Generate NERIS ID for the new incident
    neris_id = maybe_generate_neris_id(db, new_incident)
    if neris_id:
        new_incident.neris_id = neris_id
    
    # Copy personnel assignments (units and personnel)
    for source_unit in source.units:
        # Create new unit record
        new_unit = IncidentUnit(
            incident_id=new_incident.id,
            apparatus_id=source_unit.apparatus_id,
            cad_unit_id=source_unit.cad_unit_id,
            neris_unit_id_linked=source_unit.neris_unit_id_linked,
            neris_unit_id_reported=source_unit.neris_unit_id_reported,
            crew_count=source_unit.crew_count,
            response_mode=source_unit.response_mode,
            time_dispatch=source_unit.time_dispatch,
            time_enroute_to_scene=source_unit.time_enroute_to_scene,
            time_on_scene=source_unit.time_on_scene,
            time_canceled_enroute=source_unit.time_canceled_enroute,
            time_staging=source_unit.time_staging,
            time_at_patient=source_unit.time_at_patient,
            time_enroute_hospital=source_unit.time_enroute_hospital,
            time_arrived_hospital=source_unit.time_arrived_hospital,
            time_hospital_clear=source_unit.time_hospital_clear,
            time_unit_clear=source_unit.time_unit_clear,
            hospital_destination=source_unit.hospital_destination,
            transport_mode=source_unit.transport_mode,
            cancelled=source_unit.cancelled,
            is_mutual_aid=source_unit.is_mutual_aid,
        )
        db.add(new_unit)
        db.flush()
        
        # Copy personnel for this unit
        for source_person in source_unit.personnel:
            new_person = IncidentPersonnel(
                incident_id=new_incident.id,
                incident_unit_id=new_unit.id,
                personnel_id=source_person.personnel_id,
                personnel_first_name=source_person.personnel_first_name,
                personnel_last_name=source_person.personnel_last_name,
                rank_id=source_person.rank_id,
                rank_name_snapshot=source_person.rank_name_snapshot,
                role=source_person.role,
                slot_index=source_person.slot_index,
                assignment_source='DUPLICATED',
            )
            db.add(new_person)
    
    # Also copy any attendance records (incident_personnel with NULL unit)
    attendance = db.query(IncidentPersonnel).filter(
        IncidentPersonnel.incident_id == source.id,
        IncidentPersonnel.incident_unit_id.is_(None)
    ).all()
    
    for source_att in attendance:
        new_att = IncidentPersonnel(
            incident_id=new_incident.id,
            incident_unit_id=None,
            personnel_id=source_att.personnel_id,
            personnel_first_name=source_att.personnel_first_name,
            personnel_last_name=source_att.personnel_last_name,
            rank_id=source_att.rank_id,
            rank_name_snapshot=source_att.rank_name_snapshot,
            role=source_att.role,
            slot_index=source_att.slot_index,
            assignment_source='DUPLICATED',
        )
        db.add(new_att)
    
    # Audit log for new incident
    log_incident_audit(
        db=db,
        action="DUPLICATE",
        incident=new_incident,
        completed_by_id=edited_by,
        summary=f"Duplicated from {source.internal_incident_number} ({source.call_category} → {target_category})",
        fields_changed={
            "source_incident_id": source.id,
            "source_internal_number": source.internal_incident_number,
            "source_cad_number": source.cad_event_number,
            "source_category": source.call_category,
            "target_category": target_category,
        }
    )
    
    # Also add note to source incident's audit log
    log_incident_audit(
        db=db,
        action="DUPLICATE_SOURCE",
        incident=source,
        completed_by_id=edited_by,
        summary=f"Duplicated to {new_internal_number} ({target_category})",
        fields_changed={
            "new_incident_id": new_incident.id,
            "new_internal_number": new_internal_number,
            "new_cad_number": new_cad_number,
            "target_category": target_category,
        }
    )
    
    db.commit()
    
    logger.info(
        f"ADMIN: Duplicated incident {source.internal_incident_number} → "
        f"{new_internal_number} ({source.call_category} → {target_category}) "
        f"by personnel {edited_by}"
    )
    
    return {
        "status": "ok",
        "source_id": source.id,
        "source_internal_number": source.internal_incident_number,
        "source_cad_number": source.cad_event_number,
        "new_id": new_incident.id,
        "new_internal_number": new_internal_number,
        "new_cad_number": new_cad_number,
        "new_category": target_category,
        "neris_id": new_incident.neris_id,
    }
