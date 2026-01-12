import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  getApparatus, 
  getPersonnel, 
  suggestIncidentNumber,
  getIncidentTypesByCategory,
  getLocationUsesByCategory,
  getActionsTakenByCategory,
  getMunicipalities,
  createIncident,
  updateIncident,
  closeIncident,
  getAllNerisDropdowns,
  getUserSession,
  getIncidentAuditLog,
} from '../../api';
import { formatDateTimeLocal } from '../../utils/timeUtils';

const RunSheetContext = createContext(null);

// Helper to get display name from NERIS value
export const getNerisDisplayName = (value) => {
  if (!value) return '';
  const parts = value.split(': ');
  return parts[parts.length - 1].replace(/_/g, ' ');
};

// Helper functions to check incident type categories
export const hasIncidentCategory = (types, category) => {
  if (!types || !Array.isArray(types)) return false;
  return types.some(t => t && t.startsWith(category));
};

export const hasIncidentSubtype = (types, subtype) => {
  if (!types || !Array.isArray(types)) return false;
  return types.some(t => t && t.includes(subtype));
};

export const hasFireType = (types) => hasIncidentCategory(types, 'FIRE');
export const hasMedicalType = (types) => hasIncidentCategory(types, 'MEDICAL');
export const hasHazsitType = (types) => hasIncidentCategory(types, 'HAZSIT');
export const hasStructureFireType = (types) => hasIncidentSubtype(types, 'STRUCTURE_FIRE');
export const hasOutsideFireType = (types) => hasIncidentSubtype(types, 'OUTSIDE_FIRE');

// Save all assignments API call
const saveAllAssignments = async (incidentId, assignments, editedBy) => {
  const params = editedBy ? `?edited_by=${editedBy}` : '';
  const response = await fetch(`/api/incidents/${incidentId}/assignments${params}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignments })
  });
  if (!response.ok) throw new Error('Failed to save assignments');
  return response.json();
};

// Official NERIS descriptions for tooltips
export const NERIS_DESCRIPTIONS = {
  fields: {
    people_present: "Were people present at the incident location when units arrived?",
    displaced: "Number of people displaced from their residence due to this incident",
    mutual_aid: "Track mutual/automatic aid given to or received from other entities",
    risk_reduction: "Record presence of fire safety systems. Required for NERIS structure fire reports.",
    impedance: "Obstacles or issues that impacted response (traffic, access, weather, etc.)",
    outcome: "Brief description of incident resolution",
    fire_investigation: "Assessment of whether formal fire investigation is needed",
    arrival_conditions: "Fire conditions observed upon arrival at scene",
    structure_damage: "Extent of damage to structure",
    patient_care: "Outcome of patient evaluation and care",
    hazmat_disposition: "Final disposition of hazardous materials incident",
    hazmat_evacuated: "Number of occupants/businesses evacuated during response",
    smoke_alarm_type: "Type of smoke alarm (battery, hardwired, interconnected, etc.)",
    smoke_alarm_working: "Was the smoke alarm functional at time of incident?",
    smoke_alarm_operation: "Did the alarm operate and alert occupants?",
    smoke_alarm_failure: "If alarm failed, what was the cause?",
    fire_alarm_type: "Type of fire alarm system (manual, automatic, or both)",
    fire_alarm_operation: "Did the fire alarm operate and alert occupants?",
    other_alarm: "Presence of other detection systems (CO, gas, heat)",
    other_alarm_type: "Type of other detection system present",
    sprinkler_type: "Type of sprinkler/suppression system installed",
    sprinkler_coverage: "Full or partial coverage of the structure",
    sprinkler_operation: "Did the sprinkler system operate during the incident?",
    sprinkler_heads: "Number of sprinkler heads that activated",
    sprinkler_failure: "If system failed, what was the cause?",
    cooking_suppression: "Presence of cooking fire suppression system",
    cooking_suppression_type: "Type of cooking suppression system",
    emerging_hazards: "Document modern hazards: EV/batteries, solar PV, CSST gas lines",
    ev_battery: "Electric vehicle or battery storage system present",
    ev_battery_type: "Type of electric/battery system involved",
    ev_crash: "Was this related to a vehicle crash?",
    solar_pv: "Solar photovoltaic system present at incident",
    solar_energized: "Did the solar system remain energized during operations?",
    solar_ignition: "Was the solar system a source of ignition?",
    csst: "Corrugated Stainless Steel Tubing gas lines present",
    csst_damage: "Was there damage or gas leak from CSST?",
    exposures: "Properties affected beyond the origin building",
    exposure_type: "Location of exposure relative to origin",
    exposure_item: "Type of property or item exposed",
  },
};

const initialFormData = {
  internal_incident_number: '',
  call_category: 'FIRE',
  cad_event_number: '',
  cad_event_type: '',
  cad_event_subtype: '',
  cad_raw_dispatch: '',
  cad_raw_updates: [],
  cad_raw_clear: '',
  status: 'OPEN',
  incident_date: new Date().toISOString().split('T')[0],
  address: '',
  municipality_code: '',
  cross_streets: '',
  esz_box: '',
  time_dispatched: '',
  time_first_enroute: '',
  time_first_on_scene: '',
  time_fire_under_control: '',
  time_last_cleared: '',
  caller_name: '',
  caller_phone: '',
  weather_conditions: '',
  companies_called: '',
  situation_found: '',
  extent_of_damage: '',
  services_provided: '',
  narrative: '',
  equipment_used: [],
  problems_issues: '',
  officer_in_charge: '',
  completed_by: '',
  neris_incident_type_codes: [],
  neris_location_use: null,
  neris_action_codes: [],
  neris_noaction_code: null,
  neris_people_present: null,
  neris_aid_direction: null,
  neris_aid_type: null,
  neris_aid_departments: [],
  neris_displaced_number: 0,
  neris_risk_reduction: null,
  neris_narrative_impedance: '',
  neris_narrative_outcome: '',
  neris_fire_investigation_need: null,
  neris_fire_investigation_type: [],
  neris_fire_arrival_conditions: null,
  neris_fire_structure_damage: null,
  neris_fire_structure_floor: null,
  neris_fire_structure_room: null,
  neris_fire_structure_cause: null,
  neris_fire_outside_cause: null,
  neris_medical_patient_care: null,
  neris_hazmat_disposition: null,
  neris_hazmat_evacuated: 0,
  neris_hazmat_chemicals: [],
  neris_exposures: [],
  neris_emerging_hazard: null,
  neris_rr_smoke_alarm_type: [],
  neris_rr_smoke_alarm_working: null,
  neris_rr_smoke_alarm_operation: null,
  neris_rr_smoke_alarm_failure: null,
  neris_rr_smoke_alarm_action: null,
  neris_rr_fire_alarm_type: [],
  neris_rr_fire_alarm_operation: null,
  neris_rr_other_alarm: null,
  neris_rr_other_alarm_type: [],
  neris_rr_sprinkler_type: [],
  neris_rr_sprinkler_coverage: null,
  neris_rr_sprinkler_operation: null,
  neris_rr_sprinkler_heads_activated: null,
  neris_rr_sprinkler_failure: null,
  neris_rr_cooking_suppression: null,
  neris_rr_cooking_suppression_type: [],
  cad_units: [],
  cad_event_comments: null,
  // Chiefs Report Fields
  property_value_at_risk: 0,
  fire_damages_estimate: 0,
  ff_injuries_count: 0,
  civilian_injuries_count: 0,
  // Timestamps
  created_at: null,
  updated_at: null,
  closed_at: null,
  neris_submitted_at: null,
};

export function RunSheetProvider({ incident, onSave, onClose, onNavigate, children }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [apparatus, setApparatus] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [incidentTypes, setIncidentTypes] = useState({});
  const [locationUses, setLocationUses] = useState({});
  const [actionsTaken, setActionsTaken] = useState({});
  const [showNeris, setShowNeris] = useState(false);
  const [showCadModal, setShowCadModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreComplete, setRestoreComplete] = useState(false);
  const [showIncidentTypeModal, setShowIncidentTypeModal] = useState(false);
  const [showLocationUseModal, setShowLocationUseModal] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [showComCatModal, setShowComCatModal] = useState(false);
  
  // Category change state (for instant-save on category switch)
  const [categoryChanging, setCategoryChanging] = useState(false);
  
  // Admin unlock state (shared between IncidentInfo and ActionBar)
  const [unlockedFields, setUnlockedFields] = useState({});
  
  const toggleUnlock = (field) => {
    setUnlockedFields(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };
  
  // Audit log
  const [auditLog, setAuditLog] = useState([]);
  const [showFullAuditLog, setShowFullAuditLog] = useState(false);
  const auditLogRef = useRef(null);
  
  // User session
  const userSession = getUserSession();
  
  // NERIS dropdown options
  const [aidTypes, setAidTypes] = useState([]);
  const [aidDirections, setAidDirections] = useState([]);
  const [noActionCodes, setNoActionCodes] = useState([]);
  const [rrPresenceCodes, setRrPresenceCodes] = useState([]);
  const [fireInvestNeedCodes, setFireInvestNeedCodes] = useState([]);
  const [fireConditionArrivalCodes, setFireConditionArrivalCodes] = useState([]);
  const [fireBldgDamageCodes, setFireBldgDamageCodes] = useState([]);
  const [fireCauseInCodes, setFireCauseInCodes] = useState([]);
  const [fireCauseOutCodes, setFireCauseOutCodes] = useState([]);
  const [roomCodes, setRoomCodes] = useState([]);
  const [medicalPatientCareCodes, setMedicalPatientCareCodes] = useState([]);
  const [hazardDispositionCodes, setHazardDispositionCodes] = useState([]);
  const [hazardDotCodes, setHazardDotCodes] = useState([]);
  const [smokeAlarmTypeCodes, setSmokeAlarmTypeCodes] = useState([]);
  const [fireAlarmTypeCodes, setFireAlarmTypeCodes] = useState([]);
  const [otherAlarmTypeCodes, setOtherAlarmTypeCodes] = useState([]);
  const [alarmOperationCodes, setAlarmOperationCodes] = useState([]);
  const [alarmFailureCodes, setAlarmFailureCodes] = useState([]);
  const [sprinklerTypeCodes, setSprinklerTypeCodes] = useState([]);
  const [sprinklerOperationCodes, setSprinklerOperationCodes] = useState([]);
  const [cookingSuppressionCodes, setCookingSuppressionCodes] = useState([]);
  const [fullPartialCodes, setFullPartialCodes] = useState([]);
  const [exposureLocCodes, setExposureLocCodes] = useState([]);
  const [exposureItemCodes, setExposureItemCodes] = useState([]);
  const [emergHazElecCodes, setEmergHazElecCodes] = useState([]);
  const [emergHazPvCodes, setEmergHazPvCodes] = useState([]);
  const [emergHazPvIgnCodes, setEmergHazPvIgnCodes] = useState([]);
  
  const [formData, setFormData] = useState(initialFormData);
  const [assignments, setAssignments] = useState({});

  // Close audit log when clicking outside
  useEffect(() => {
    if (!showFullAuditLog) return;
    
    const handleClickOutside = (e) => {
      if (auditLogRef.current && !auditLogRef.current.contains(e.target)) {
        setShowFullAuditLog(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showFullAuditLog]);

  useEffect(() => {
    loadData();
  }, []);

  // Track if this is a new incident (for auto-suggest logic)
  const isNewIncident = !incident;
  const isNewIncidentRef = useRef(isNewIncident);
  
  // For NEW incidents only: re-fetch suggested incident number when category or date changes
  useEffect(() => {
    // Only for new incidents (no existing incident prop)
    if (!isNewIncidentRef.current) return;
    // Don't run during initial load
    if (loading) return;
    
    const fetchSuggestedNumber = async () => {
      try {
        // Parse year from incident_date
        const year = formData.incident_date 
          ? new Date(formData.incident_date).getFullYear() 
          : new Date().getFullYear();
        const category = formData.call_category || 'FIRE';
        
        const res = await suggestIncidentNumber(year, category);
        setFormData(prev => ({
          ...prev,
          internal_incident_number: res.data.suggested_number,
        }));
      } catch (err) {
        console.error('Failed to fetch suggested incident number:', err);
      }
    };
    
    fetchSuggestedNumber();
  }, [loading, formData.call_category, formData.incident_date]);

  // Pass through ISO timestamps as-is - they're true UTC now
  // Frontend formatters will convert to local for display
  const toLocalDatetime = (isoString) => {
    if (!isoString) return '';
    return isoString;
  };

  const loadData = async () => {
    try {
      // Load core data and ALL NERIS codes in minimal API calls
      // This replaces 34 parallel calls with just 8
      const [
        apparatusRes,
        personnelRes,
        municipalitiesRes,
        incidentTypesRes,
        locationUsesRes,
        actionsTakenRes,
        suggestedNumberRes,
        nerisDropdownsRes,
      ] = await Promise.all([
        getApparatus(),
        getPersonnel(),
        getMunicipalities(),
        getIncidentTypesByCategory(),
        getLocationUsesByCategory(),
        getActionsTakenByCategory(),
        suggestIncidentNumber(),
        getAllNerisDropdowns(),
      ]);

      const activeApparatus = apparatusRes.data.filter(a => a.active);
      setApparatus(activeApparatus);
      setPersonnel(personnelRes.data.filter(p => p.active));
      setMunicipalities(municipalitiesRes.data);
      setIncidentTypes(incidentTypesRes.data);
      setLocationUses(locationUsesRes.data);
      setActionsTaken(actionsTakenRes.data);
      
      // Extract NERIS dropdown codes from single response
      const cats = nerisDropdownsRes.data.categories || {};
      setAidTypes(cats.type_aid || []);
      setAidDirections(cats.type_aid_direction || []);
      setNoActionCodes(cats.type_noaction || []);
      setRrPresenceCodes(cats.type_rr_presence || []);
      setFireInvestNeedCodes(cats.type_fire_invest_need || []);
      setFireConditionArrivalCodes(cats.type_fire_condition_arrival || []);
      setFireBldgDamageCodes(cats.type_fire_bldg_damage || []);
      setFireCauseInCodes(cats.type_fire_cause_in || []);
      setFireCauseOutCodes(cats.type_fire_cause_out || []);
      setRoomCodes(cats.type_room || []);
      setMedicalPatientCareCodes(cats.type_medical_patient_care || []);
      setHazardDispositionCodes(cats.type_hazard_disposition || []);
      setHazardDotCodes(cats.type_hazard_dot || []);
      setSmokeAlarmTypeCodes(cats.type_alarm_smoke || []);
      setFireAlarmTypeCodes(cats.type_alarm_fire || []);
      setOtherAlarmTypeCodes(cats.type_alarm_other || []);
      setAlarmOperationCodes(cats.type_alarm_operation || []);
      setAlarmFailureCodes(cats.type_alarm_failure || []);
      setSprinklerTypeCodes(cats.type_suppress_fire || []);
      setSprinklerOperationCodes(cats.type_suppress_operation || []);
      setCookingSuppressionCodes(cats.type_suppress_cooking || []);
      setFullPartialCodes(cats.type_full_partial || []);
      setExposureLocCodes(cats.type_exposure_loc || []);
      setExposureItemCodes(cats.type_exposure_item || []);
      setEmergHazElecCodes(cats.type_emerghaz_elec || []);
      setEmergHazPvCodes(cats.type_emerghaz_pv || []);
      setEmergHazPvIgnCodes(cats.type_emerghaz_pv_ign || []);

      // Build empty assignments from apparatus config
      const emptyAssignments = {};
      activeApparatus.forEach(a => {
        if (a.is_virtual) {
          emptyAssignments[a.unit_designator] = [];
        } else {
          emptyAssignments[a.unit_designator] = [null, null, null, null, null, null];
        }
      });

      if (incident) {
        setFormData({
          internal_incident_number: incident.internal_incident_number || '',
          call_category: incident.call_category || 'FIRE',
          cad_event_number: incident.cad_event_number || '',
          cad_event_type: incident.cad_event_type || '',
          cad_event_subtype: incident.cad_event_subtype || '',
          cad_raw_dispatch: incident.cad_raw_dispatch || '',
          cad_raw_updates: incident.cad_raw_updates || [],
          cad_raw_clear: incident.cad_raw_clear || '',
          status: incident.status || 'OPEN',
          incident_date: incident.incident_date || new Date().toISOString().split('T')[0],
          address: incident.address || '',
          municipality_code: incident.municipality_code || '',
          cross_streets: incident.cross_streets || '',
          esz_box: incident.esz_box || '',
          time_dispatched: toLocalDatetime(incident.time_dispatched),
          time_first_enroute: toLocalDatetime(incident.time_first_enroute),
          time_first_on_scene: toLocalDatetime(incident.time_first_on_scene),
          time_fire_under_control: toLocalDatetime(incident.time_fire_under_control),
          time_last_cleared: toLocalDatetime(incident.time_last_cleared),
          time_in_service: toLocalDatetime(incident.time_in_service),
          caller_name: incident.caller_name || '',
          caller_phone: incident.caller_phone || '',
          weather_conditions: incident.weather_conditions || '',
          companies_called: incident.companies_called || '',
          situation_found: incident.situation_found || '',
          extent_of_damage: incident.extent_of_damage || '',
          services_provided: incident.services_provided || '',
          narrative: incident.narrative || '',
          equipment_used: incident.equipment_used || [],
          problems_issues: incident.problems_issues || '',
          officer_in_charge: incident.officer_in_charge || '',
          completed_by: incident.completed_by || '',
          neris_incident_type_codes: incident.neris_incident_type_codes || [],
          neris_location_use: incident.neris_location_use || null,
          neris_action_codes: incident.neris_action_codes || [],
          neris_noaction_code: incident.neris_noaction_code || null,
          neris_people_present: incident.neris_people_present,
          neris_aid_direction: incident.neris_aid_direction || null,
          neris_aid_type: incident.neris_aid_type || null,
          neris_aid_departments: incident.neris_aid_departments || [],
          neris_displaced_number: incident.neris_displaced_number ?? 0,
          neris_risk_reduction: incident.neris_risk_reduction || null,
          neris_narrative_impedance: incident.neris_narrative_impedance || '',
          neris_narrative_outcome: incident.neris_narrative_outcome || '',
          neris_fire_investigation_need: incident.neris_fire_investigation_need || null,
          neris_fire_investigation_type: incident.neris_fire_investigation_type || [],
          neris_fire_arrival_conditions: incident.neris_fire_arrival_conditions || null,
          neris_fire_structure_damage: incident.neris_fire_structure_damage || null,
          neris_fire_structure_floor: incident.neris_fire_structure_floor || null,
          neris_fire_structure_room: incident.neris_fire_structure_room || null,
          neris_fire_structure_cause: incident.neris_fire_structure_cause || null,
          neris_fire_outside_cause: incident.neris_fire_outside_cause || null,
          neris_medical_patient_care: incident.neris_medical_patient_care || null,
          neris_hazmat_disposition: incident.neris_hazmat_disposition || null,
          neris_hazmat_evacuated: incident.neris_hazmat_evacuated ?? 0,
          neris_hazmat_chemicals: incident.neris_hazmat_chemicals || [],
          neris_exposures: incident.neris_exposures || [],
          neris_emerging_hazard: incident.neris_emerging_hazard || null,
          neris_rr_smoke_alarm_type: incident.neris_rr_smoke_alarm_type || [],
          neris_rr_smoke_alarm_working: incident.neris_rr_smoke_alarm_working,
          neris_rr_smoke_alarm_operation: incident.neris_rr_smoke_alarm_operation || null,
          neris_rr_smoke_alarm_failure: incident.neris_rr_smoke_alarm_failure || null,
          neris_rr_smoke_alarm_action: incident.neris_rr_smoke_alarm_action || null,
          neris_rr_fire_alarm_type: incident.neris_rr_fire_alarm_type || [],
          neris_rr_fire_alarm_operation: incident.neris_rr_fire_alarm_operation || null,
          neris_rr_other_alarm: incident.neris_rr_other_alarm || null,
          neris_rr_other_alarm_type: incident.neris_rr_other_alarm_type || [],
          neris_rr_sprinkler_type: incident.neris_rr_sprinkler_type || [],
          neris_rr_sprinkler_coverage: incident.neris_rr_sprinkler_coverage || null,
          neris_rr_sprinkler_operation: incident.neris_rr_sprinkler_operation || null,
          neris_rr_sprinkler_heads_activated: incident.neris_rr_sprinkler_heads_activated,
          neris_rr_sprinkler_failure: incident.neris_rr_sprinkler_failure || null,
          neris_rr_cooking_suppression: incident.neris_rr_cooking_suppression || null,
          neris_rr_cooking_suppression_type: incident.neris_rr_cooking_suppression_type || [],
          cad_units: incident.cad_units || [],
          cad_event_comments: incident.cad_event_comments || null,
          // Chiefs Report Fields
          property_value_at_risk: incident.property_value_at_risk ?? 0,
          fire_damages_estimate: incident.fire_damages_estimate ?? 0,
          ff_injuries_count: incident.ff_injuries_count ?? 0,
          civilian_injuries_count: incident.civilian_injuries_count ?? 0,
          // Timestamps
          created_at: incident.created_at,
          updated_at: incident.updated_at,
          closed_at: incident.closed_at,
          neris_submitted_at: incident.neris_submitted_at,
        });
        
        if (incident.personnel_assignments) {
          setAssignments({ ...emptyAssignments, ...incident.personnel_assignments });
        } else {
          setAssignments(emptyAssignments);
        }
        
        try {
          const auditRes = await getIncidentAuditLog(incident.id);
          setAuditLog(auditRes.data.entries || []);
        } catch (err) {
          console.error('Failed to load audit log:', err);
          setAuditLog([]);
        }
      } else {
        setFormData(prev => ({
          ...prev,
          internal_incident_number: suggestedNumberRes.data.suggested_number,
        }));
        setAssignments(emptyAssignments);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  /**
   * Handle category change with instant save.
   * When category changes (FIRE ↔ EMS ↔ DETAIL), immediately save to backend
   * which assigns a new incident number from the target category's sequence.
   * The form then updates to show the new number.
   */
  const handleCategoryChange = async (newCategory) => {
    // For new incidents (not yet saved), just update the local state
    // The suggested number effect will handle fetching the right number
    if (!incident?.id) {
      setFormData(prev => ({ ...prev, call_category: newCategory }));
      return;
    }
    
    // Don't do anything if category didn't actually change
    if (newCategory === formData.call_category) return;
    
    // Validate category
    if (!['FIRE', 'EMS', 'DETAIL'].includes(newCategory)) return;
    
    setCategoryChanging(true);
    try {
      const editedBy = userSession?.personnel_id || null;
      
      // Send only the category change to the backend
      // Backend will assign new number and return it
      await updateIncident(incident.id, { call_category: newCategory }, editedBy);
      
      // Fetch the updated incident to get the new number
      const response = await fetch(`/api/incidents/${incident.id}`);
      const updatedIncident = await response.json();
      
      // Update form with new category and new incident number
      setFormData(prev => ({
        ...prev,
        call_category: updatedIncident.call_category,
        internal_incident_number: updatedIncident.internal_incident_number,
      }));
      
      // Refresh audit log to show the category change
      try {
        const auditRes = await getIncidentAuditLog(incident.id);
        setAuditLog(auditRes.data.entries || []);
      } catch (err) {
        console.error('Failed to refresh audit log:', err);
      }
      
      // Brief success indication
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      
    } catch (err) {
      console.error('Failed to change category:', err);
      alert('Failed to change category: ' + (err.message || 'Unknown error'));
      // Revert the dropdown to the original value
      setFormData(prev => ({ ...prev, call_category: formData.call_category }));
    } finally {
      setCategoryChanging(false);
    }
  };

  const handleAssignment = (unitDesignator, slotIndex, personnelId) => {
    setAssignments(prev => {
      const updated = { ...prev };
      if (!updated[unitDesignator]) {
        updated[unitDesignator] = [null, null, null, null, null, null];
      }
      updated[unitDesignator] = [...updated[unitDesignator]];
      updated[unitDesignator][slotIndex] = personnelId ? parseInt(personnelId) : null;
      return updated;
    });
  };

  const clearSlot = (unitDesignator, slotIndex) => {
    handleAssignment(unitDesignator, slotIndex, null);
  };

  const getAssignedIds = () => {
    const assigned = new Set();
    Object.values(assignments).forEach(slots => {
      slots.forEach(id => {
        if (id) assigned.add(id);
      });
    });
    return assigned;
  };

  const getAvailablePersonnel = (unitDesignator, slotIndex) => {
    const assigned = getAssignedIds();
    const currentValue = assignments[unitDesignator]?.[slotIndex];
    return personnel.filter(p => !assigned.has(p.id) || p.id === currentValue);
  };

  const generateUnitsCalled = () => {
    if (!formData.cad_units || formData.cad_units.length === 0) return '';
    
    const stationUnits = formData.cad_units
      .filter(u => !u.is_mutual_aid)
      .map(u => u.unit_id);
    
    const mutualAidUnits = formData.cad_units
      .filter(u => u.is_mutual_aid)
      .map(u => u.unit_id);
    
    let result = '';
    if (stationUnits.length > 0) {
      result += `Station 48: ${stationUnits.join(', ')}`;
    }
    if (mutualAidUnits.length > 0) {
      if (result) result += ' | ';
      result += `Mutual Aid: ${mutualAidUnits.join(', ')}`;
    }
    return result;
  };

  const populateUnitsCalled = () => {
    const generated = generateUnitsCalled();
    if (generated) {
      handleChange('companies_called', generated);
    }
  };

  const handleNerisTypeToggle = (code) => {
    setFormData(prev => {
      const types = prev.neris_incident_type_codes || [];
      if (types.includes(code)) {
        return { ...prev, neris_incident_type_codes: types.filter(t => t !== code) };
      } else if (types.length < 3) {
        return { ...prev, neris_incident_type_codes: [...types, code] };
      }
      return prev;
    });
  };

  const handleActionToggle = (code) => {
    setFormData(prev => {
      const actions = prev.neris_action_codes || [];
      if (actions.includes(code)) {
        return { ...prev, neris_action_codes: actions.filter(a => a !== code) };
      }
      return { ...prev, neris_action_codes: [...actions, code] };
    });
  };

  const handleLocationUseToggle = (valueString) => {
    setFormData(prev => {
      const currentValue = prev.neris_location_use;
      const currentString = currentValue ? `${currentValue.use_type}: ${currentValue.use_subtype}` : null;
      
      if (currentString === valueString) {
        return { ...prev, neris_location_use: null };
      }
      
      for (const catData of Object.values(locationUses)) {
        if (catData.subtypes) {
          const item = catData.subtypes.find(s => s.value === valueString);
          if (item) {
            return { 
              ...prev, 
              neris_location_use: { 
                use_type: item.use_type, 
                use_subtype: item.use_subtype 
              } 
            };
          }
        }
      }
      return prev;
    });
  };

  const getLocationUseValue = () => {
    const loc = formData.neris_location_use;
    if (!loc || !loc.use_type) return '';
    return loc.use_subtype ? `${loc.use_type}: ${loc.use_subtype}` : loc.use_type;
  };

  const handleRestorePreview = async () => {
    if (!incident?.id) return;
    setRestoreLoading(true);
    try {
      const response = await fetch(`/api/backup/preview-restore/${incident.id}`);
      const data = await response.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      
      // Backend now returns field_changes and unit_config_changes directly
      // Map to the format expected by RestorePreviewModal
      const changes = (data.field_changes || []).map(fc => ({
        field: fc.field,
        current: fc.current,
        cad: fc.will_be,  // Modal expects 'cad' not 'will_be'
      }));
      
      setRestorePreview({
        ...data,
        changes,
        unitChanges: data.unit_config_changes || [],
      });
      setRestoreComplete(false);  // Reset completion state
      setShowRestoreModal(true);
    } catch (err) {
      console.error('Failed to preview restore:', err);
      alert('Failed to preview restore from CAD');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!incident?.id) return;
    setRestoreLoading(true);
    try {
      // Pass logged-in user for audit trail
      const params = userSession?.personnel_id ? `?edited_by=${userSession.personnel_id}` : '';
      const response = await fetch(`/api/backup/restore-from-cad/${incident.id}${params}`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      
      // Show completion in modal instead of alert
      setRestoreComplete(true);
      
      // Reload data in background
      await loadData();
    } catch (err) {
      console.error('Failed to restore from CAD:', err);
      alert('Failed to restore from CAD');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanData = {};
      for (const [key, value] of Object.entries(formData)) {
        if (['created_at', 'updated_at', 'closed_at', 'neris_submitted_at'].includes(key)) continue;
        cleanData[key] = (value === '' || value === undefined) ? null : value;
      }

      if (userSession?.personnel_id && !cleanData.completed_by) {
        cleanData.completed_by = userSession.personnel_id;
      }

      const editedBy = userSession?.personnel_id || null;

      let incidentId;
      
      if (incident?.id) {
        await updateIncident(incident.id, cleanData, editedBy);
        incidentId = incident.id;
      } else {
        // Use provided CAD number, or generate MANUAL- only if completely empty
        const cadNumber = formData.cad_event_number?.trim() || `MANUAL-${Date.now()}`;
        const res = await createIncident({
          cad_event_number: cadNumber,
          cad_event_type: cleanData.cad_event_type,
          cad_event_subtype: cleanData.cad_event_subtype,
          address: cleanData.address,
          municipality_code: cleanData.municipality_code,
          internal_incident_number: cleanData.internal_incident_number,
          incident_date: cleanData.incident_date,
          call_category: cleanData.call_category || 'FIRE',
        });
        incidentId = res.data.id;
        await updateIncident(incidentId, cleanData, editedBy);
      }

      await saveAllAssignments(incidentId, assignments, editedBy);

      // Refresh audit log after save
      try {
        const auditRes = await getIncidentAuditLog(incidentId);
        setAuditLog(auditRes.data.entries || []);
      } catch (err) {
        console.error('Failed to refresh audit log:', err);
      }

      // Show success message
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      if (onSave) onSave(incidentId);
      // Don't call onClose - stay on form after save
    } catch (err) {
      console.error('Failed to save:', err);
      alert('Failed to save incident: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleCloseIncident = async () => {
    if (!incident?.id) return;
    if (!confirm('Close this incident?')) return;
    
    try {
      const editedBy = userSession?.personnel_id || null;
      await closeIncident(incident.id, editedBy);
      setFormData(prev => ({ ...prev, status: 'CLOSED' }));
      alert('Incident closed');
      if (onSave) onSave(incident.id);
      if (onClose) onClose();
    } catch (err) {
      console.error('Failed to close:', err);
      alert('Failed to close incident');
    }
  };

  const formatTimestamp = (isoString) => {
    if (!isoString) return '-';
    // Use station timezone from timeUtils for consistent display
    const formatted = formatDateTimeLocal(isoString);
    // Remove seconds for cleaner display (YYYY-MM-DD HH:MM)
    return formatted ? formatted.slice(0, 16) : '-';
  };

  const value = {
    // Props
    incident,
    onSave,
    onClose,
    onNavigate,
    
    // Loading state
    loading,
    saving,
    saveSuccess,
    
    // Reference data
    apparatus,
    personnel,
    municipalities,
    incidentTypes,
    locationUses,
    actionsTaken,
    
    // NERIS dropdown options
    aidTypes,
    aidDirections,
    noActionCodes,
    rrPresenceCodes,
    fireInvestNeedCodes,
    fireConditionArrivalCodes,
    fireBldgDamageCodes,
    fireCauseInCodes,
    fireCauseOutCodes,
    roomCodes,
    medicalPatientCareCodes,
    hazardDispositionCodes,
    hazardDotCodes,
    smokeAlarmTypeCodes,
    fireAlarmTypeCodes,
    otherAlarmTypeCodes,
    alarmOperationCodes,
    alarmFailureCodes,
    sprinklerTypeCodes,
    sprinklerOperationCodes,
    cookingSuppressionCodes,
    fullPartialCodes,
    exposureLocCodes,
    exposureItemCodes,
    emergHazElecCodes,
    emergHazPvCodes,
    emergHazPvIgnCodes,
    
    // UI state
    showNeris,
    setShowNeris,
    showCadModal,
    setShowCadModal,
    showRestoreModal,
    setShowRestoreModal,
    restorePreview,
    setRestorePreview,
    restoreLoading,
    restoreComplete,
    setRestoreComplete,
    showIncidentTypeModal,
    setShowIncidentTypeModal,
    showLocationUseModal,
    setShowLocationUseModal,
    showActionsModal,
    setShowActionsModal,
    showComCatModal,
    setShowComCatModal,
    
    // Category change state
    categoryChanging,
    
    // Admin unlock state
    unlockedFields,
    toggleUnlock,
    
    // Audit log
    auditLog,
    showFullAuditLog,
    setShowFullAuditLog,
    auditLogRef,
    
    // Auth
    userSession,
    
    // Form data
    formData,
    setFormData,
    assignments,
    setAssignments,
    
    // Handlers
    handleChange,
    handleCategoryChange,
    handleAssignment,
    clearSlot,
    getAssignedIds,
    getAvailablePersonnel,
    generateUnitsCalled,
    populateUnitsCalled,
    handleNerisTypeToggle,
    handleActionToggle,
    handleLocationUseToggle,
    getLocationUseValue,
    handleRestorePreview,
    handleRestoreConfirm,
    handleSave,
    handleCloseIncident,
    formatTimestamp,
  };

  return (
    <RunSheetContext.Provider value={value}>
      {children}
    </RunSheetContext.Provider>
  );
}

export function useRunSheet() {
  const context = useContext(RunSheetContext);
  if (!context) {
    throw new Error('useRunSheet must be used within RunSheetProvider');
  }
  return context;
}
