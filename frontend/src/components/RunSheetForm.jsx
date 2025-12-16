import { useState, useEffect } from 'react';
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
  getNerisCategory,
  getAidTypes,
  getAidDirections,
} from '../api';
import './RunSheetForm.css';

// Dynamic growing list component for Direct/Station
function DynamicPersonnelList({ label, assignedIds, onUpdate, allPersonnel, getAssignedIds }) {
  const [searchText, setSearchText] = useState('');
  const [showDropdown, setShowDropdown] = useState(null); // index of active dropdown

  // Filter out nulls to get actual assigned people
  const assigned = (assignedIds || []).filter(id => id !== null);

  // Get all assigned IDs across entire form
  const globalAssigned = getAssignedIds();

  // Available personnel: not assigned elsewhere, or is current selection
  const getAvailable = (currentIdx) => {
    const currentValue = assigned[currentIdx];
    return allPersonnel.filter(p => {
      if (p.id === currentValue) return true;
      return !globalAssigned.has(p.id);
    });
  };

  // Filter by search text
  const getFiltered = (currentIdx) => {
    const available = getAvailable(currentIdx);
    if (!searchText) return available;
    const lower = searchText.toLowerCase();
    return available.filter(p => 
      p.last_name.toLowerCase().includes(lower) || 
      p.first_name.toLowerCase().includes(lower)
    );
  };

  const handleSelect = (idx, personnelId) => {
    const newList = [...assigned];
    if (idx >= newList.length) {
      newList.push(personnelId);
    } else {
      newList[idx] = personnelId;
    }
    onUpdate(newList);
    setSearchText('');
    setShowDropdown(null);
  };

  const handleRemove = (idx) => {
    const newList = assigned.filter((_, i) => i !== idx);
    onUpdate(newList);
  };

  const getPersonName = (id) => {
    const p = allPersonnel.find(x => x.id === id);
    return p ? p.last_name : '?';
  };

  return (
    <div className="dynamic-list">
      <div className="dynamic-list-header">{label}</div>
      <div className="dynamic-list-items">
        {/* Existing assignments */}
        {assigned.map((personId, idx) => (
          <div key={idx} className="dynamic-item">
            <span className="dynamic-item-name">{getPersonName(personId)}</span>
            <button className="clear-btn" onClick={() => handleRemove(idx)}>×</button>
          </div>
        ))}
        
        {/* New entry field - always show one empty slot */}
        <div className="dynamic-item new-entry">
          <input
            type="text"
            placeholder="+ Add..."
            value={showDropdown === assigned.length ? searchText : ''}
            onChange={(e) => setSearchText(e.target.value)}
            onFocus={() => setShowDropdown(assigned.length)}
            onBlur={() => setTimeout(() => setShowDropdown(null), 200)}
          />
          {showDropdown === assigned.length && (
            <div className="typeahead-dropdown">
              {getFiltered(assigned.length).slice(0, 10).map(p => (
                <div
                  key={p.id}
                  className="typeahead-option"
                  onMouseDown={() => handleSelect(assigned.length, p.id)}
                >
                  {p.last_name}, {p.first_name}
                </div>
              ))}
              {getFiltered(assigned.length).length === 0 && (
                <div className="typeahead-empty">No matches</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Chip component for selected items
function Chip({ label, onRemove }) {
  return (
    <span className="neris-chip">
      {label}
      <button type="button" onClick={onRemove} className="chip-remove">×</button>
    </span>
  );
}

// InfoTooltip component - displays official NERIS descriptions on hover
function InfoTooltip({ text }) {
  if (!text) return null;
  return (
    <span className="info-tooltip-wrapper">
      <span className="info-icon">ⓘ</span>
      <span className="info-tooltip-text">{text}</span>
    </span>
  );
}

// Official NERIS descriptions from type files
// Field-level tooltips for UI help text
const NERIS_DESCRIPTIONS = {
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
  },
};

// Helper to get display name from NERIS value
const getNerisDisplayName = (value) => {
  if (!value) return '';
  const parts = value.split(': ');
  return parts[parts.length - 1].replace(/_/g, ' ');
};

// Helper functions to check incident type categories
// Incident types are stored as strings like "FIRE: STRUCTURE_FIRE: ROOM_AND_CONTENTS_FIRE"
const hasIncidentCategory = (types, category) => {
  if (!types || !Array.isArray(types)) return false;
  return types.some(t => t && t.startsWith(category));
};

const hasIncidentSubtype = (types, subtype) => {
  if (!types || !Array.isArray(types)) return false;
  return types.some(t => t && t.includes(subtype));
};

// Specific type checks for conditional modules
const hasFireType = (types) => hasIncidentCategory(types, 'FIRE');
const hasMedicalType = (types) => hasIncidentCategory(types, 'MEDICAL');
const hasHazsitType = (types) => hasIncidentCategory(types, 'HAZSIT');
const hasStructureFireType = (types) => hasIncidentSubtype(types, 'STRUCTURE_FIRE');
const hasOutsideFireType = (types) => hasIncidentSubtype(types, 'OUTSIDE_FIRE');

// NERIS Modal Picker
function NerisModal({ 
  isOpen, 
  onClose, 
  title,
  data, 
  selected, 
  onToggle, 
  maxSelections = null,
  dataType = 'children'
}) {
  const [expandedCats, setExpandedCats] = useState({});

  if (!isOpen) return null;

  const toggleCategory = (cat) => {
    setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const isMulti = Array.isArray(selected);
  const selectedArray = isMulti ? selected : (selected ? [selected] : []);
  const atLimit = maxSelections && selectedArray.length >= maxSelections;

  const handleToggle = (value) => {
    if (isMulti) {
      if (selectedArray.includes(value)) {
        onToggle(value);
      } else if (!atLimit) {
        onToggle(value);
      }
    } else {
      onToggle(value);
    }
  };

  return (
    <div className="neris-modal-overlay" onClick={onClose}>
      <div className="neris-modal" onClick={(e) => e.stopPropagation()}>
        <div className="neris-modal-header">
          <h3>{title}</h3>
          <button className="neris-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="neris-modal-selected">
          {selectedArray.length === 0 ? (
            <span className="neris-no-selection">None selected</span>
          ) : (
            selectedArray.map(val => (
              <span key={val} className="neris-chip">
                {getNerisDisplayName(val)}
                <button className="chip-remove" onClick={() => onToggle(val)}>×</button>
              </span>
            ))
          )}
          {maxSelections && (
            <span className="neris-counter">{selectedArray.length}/{maxSelections}</span>
          )}
        </div>

        <div className="neris-modal-content">
          {Object.entries(data).map(([cat, catData]) => {
            const isCategorySelectable = dataType === 'children' && !catData.children && !catData.codes;
            const isSelected = isCategorySelectable && selectedArray.includes(cat);
            const isDisabled = isCategorySelectable && !isSelected && atLimit;
            
            return (
            <div key={cat} className="neris-modal-category">
              <button
                type="button"
                className={`neris-modal-cat-header ${expandedCats[cat] ? 'expanded' : ''} ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                onClick={() => {
                  if (isCategorySelectable) {
                    if (!isDisabled) handleToggle(cat);
                  } else {
                    toggleCategory(cat);
                  }
                }}
                disabled={isDisabled}
              >
                <span>{catData.description || cat}</span>
                {!isCategorySelectable && <span className="neris-cat-arrow">{expandedCats[cat] ? '▲' : '▼'}</span>}
              </button>
              
              {expandedCats[cat] && (catData.children || catData.codes || catData.subtypes) && (
                <div className="neris-modal-cat-content">
                  {dataType === 'children' && catData.children && 
                    Object.entries(catData.children).map(([subcat, subData]) => (
                      <div key={subcat} className="neris-subcat">
                        <div className="neris-subcat-label">{subData.description || subcat}</div>
                        <div className="neris-items">
                          {subData.codes?.map(item => {
                            const isSelected = selectedArray.includes(item.value);
                            const isDisabled = !isSelected && atLimit;
                            return (
                              <button
                                key={item.value}
                                type="button"
                                className={`neris-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                                onClick={() => !isDisabled && handleToggle(item.value)}
                                disabled={isDisabled}
                              >
                                {item.description}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  }
                  {dataType === 'children' && catData.codes && !catData.children && (
                    <div className="neris-items">
                      {catData.codes.map(item => {
                        const isSelected = selectedArray.includes(item.value);
                        const isDisabled = !isSelected && atLimit;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            className={`neris-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                            onClick={() => !isDisabled && handleToggle(item.value)}
                            disabled={isDisabled}
                          >
                            {item.description}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {dataType === 'subtypes' && catData.subtypes && (
                    <div className="neris-items">
                      {catData.subtypes.map(item => {
                        const isSelected = selectedArray.includes(item.value);
                        return (
                          <button
                            key={item.value}
                            type="button"
                            className={`neris-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleToggle(item.value)}
                          >
                            {item.description}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );})}
        </div>

        <div className="neris-modal-footer">
          <span className="neris-modal-count">
            {selectedArray.length} selected{maxSelections ? ` of ${maxSelections} max` : ''}
          </span>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// Simple API call to save all assignments at once
const saveAllAssignments = async (incidentId, assignments) => {
  const response = await fetch(`/api/incidents/${incidentId}/assignments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignments })
  });
  if (!response.ok) throw new Error('Failed to save assignments');
  return response.json();
};

function RunSheetForm({ incident = null, onSave, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apparatus, setApparatus] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [incidentTypes, setIncidentTypes] = useState({});
  const [locationUses, setLocationUses] = useState({});
  const [actionsTaken, setActionsTaken] = useState({});
  const [showNeris, setShowNeris] = useState(false);
  const [showIncidentTypeModal, setShowIncidentTypeModal] = useState(false);
  const [showLocationUseModal, setShowLocationUseModal] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);
  
  // NERIS conditional module dropdown options (loaded from database)
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
  
  const [formData, setFormData] = useState({
    internal_incident_number: '',
    cad_event_number: '',
    cad_event_type: '',
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
    time_in_service: '',
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
    // Fire module fields
    neris_fire_investigation_need: null,
    neris_fire_investigation_type: [],
    neris_fire_arrival_conditions: null,
    neris_fire_structure_damage: null,
    neris_fire_structure_floor: null,
    neris_fire_structure_room: null,
    neris_fire_structure_cause: null,
    neris_fire_outside_cause: null,
    // Medical module fields
    neris_medical_patient_care: null,
    // Hazmat module fields
    neris_hazmat_disposition: null,
    neris_hazmat_evacuated: 0,
    neris_hazmat_chemicals: [], // Array of {dot_class, name, release_occurred}
    cad_units: [],
    created_at: null,
    updated_at: null,
    closed_at: null,
    neris_submitted_at: null,
  });

  // Simple assignments: { "ENG481": [12, null, 5, null, null, null], "ENG482": [3, 7, null, null, null, null] }
  const [assignments, setAssignments] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [
        apparatusRes,
        personnelRes,
        municipalitiesRes,
        incidentTypesRes,
        locationUsesRes,
        actionsTakenRes,
        suggestedNumberRes,
        // Conditional module codes from database
        aidTypesRes,
        aidDirectionsRes,
        noActionRes,
        rrPresenceRes,
        fireInvestNeedRes,
        fireConditionRes,
        fireDamageRes,
        fireCauseInRes,
        fireCauseOutRes,
        roomRes,
        medicalCareRes,
        hazardDispRes,
        hazardDotRes,
      ] = await Promise.all([
        getApparatus(),
        getPersonnel(),
        getMunicipalities(),
        getIncidentTypesByCategory(),
        getLocationUsesByCategory(),
        getActionsTakenByCategory(),
        suggestIncidentNumber(),
        // Load conditional module codes from neris_codes table
        getAidTypes(),
        getAidDirections(),
        getNerisCategory('type_noaction'),
        getNerisCategory('type_rr_presence'),
        getNerisCategory('type_fire_invest_need'),
        getNerisCategory('type_fire_condition_arrival'),
        getNerisCategory('type_fire_bldg_damage'),
        getNerisCategory('type_fire_cause_in'),
        getNerisCategory('type_fire_cause_out'),
        getNerisCategory('type_room'),
        getNerisCategory('type_medical_patient_care'),
        getNerisCategory('type_hazard_disposition'),
        getNerisCategory('type_hazard_dot'),
      ]);

      const activeApparatus = apparatusRes.data.filter(a => a.active);
      setApparatus(activeApparatus);
      setPersonnel(personnelRes.data.filter(p => p.active));
      setMunicipalities(municipalitiesRes.data);
      setIncidentTypes(incidentTypesRes.data);
      setLocationUses(locationUsesRes.data);
      setActionsTaken(actionsTakenRes.data);
      
      // Set conditional module dropdown options
      setAidTypes(aidTypesRes.data || []);
      setAidDirections(aidDirectionsRes.data || []);
      setNoActionCodes(noActionRes.data || []);
      setRrPresenceCodes(rrPresenceRes.data || []);
      setFireInvestNeedCodes(fireInvestNeedRes.data || []);
      setFireConditionArrivalCodes(fireConditionRes.data || []);
      setFireBldgDamageCodes(fireDamageRes.data || []);
      setFireCauseInCodes(fireCauseInRes.data || []);
      setFireCauseOutCodes(fireCauseOutRes.data || []);
      setRoomCodes(roomRes.data || []);
      setMedicalPatientCareCodes(medicalCareRes.data || []);
      setHazardDispositionCodes(hazardDispRes.data || []);
      setHazardDotCodes(hazardDotRes.data || []);

      // Initialize empty assignments for all apparatus
      // Real trucks: 6 fixed slots
      // Virtual units (Direct/Station): empty array (grows dynamically)
      const emptyAssignments = {};
      activeApparatus.forEach(a => {
        if (a.is_virtual) {
          emptyAssignments[a.unit_designator] = [];
        } else {
          emptyAssignments[a.unit_designator] = [null, null, null, null, null, null];
        }
      });

      if (incident) {
        const toLocalDatetime = (isoString) => {
          if (!isoString) return '';
          return new Date(isoString).toISOString().slice(0, 16);
        };

        setFormData({
          internal_incident_number: incident.internal_incident_number || '',
          cad_event_number: incident.cad_event_number || '',
          cad_event_type: incident.cad_event_type || '',
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
          // Fire module fields
          neris_fire_investigation_need: incident.neris_fire_investigation_need || null,
          neris_fire_investigation_type: incident.neris_fire_investigation_type || [],
          neris_fire_arrival_conditions: incident.neris_fire_arrival_conditions || null,
          neris_fire_structure_damage: incident.neris_fire_structure_damage || null,
          neris_fire_structure_floor: incident.neris_fire_structure_floor || null,
          neris_fire_structure_room: incident.neris_fire_structure_room || null,
          neris_fire_structure_cause: incident.neris_fire_structure_cause || null,
          neris_fire_outside_cause: incident.neris_fire_outside_cause || null,
          // Medical module fields
          neris_medical_patient_care: incident.neris_medical_patient_care || null,
          // Hazmat module fields
          neris_hazmat_disposition: incident.neris_hazmat_disposition || null,
          neris_hazmat_evacuated: incident.neris_hazmat_evacuated ?? 0,
          neris_hazmat_chemicals: incident.neris_hazmat_chemicals || [],
          cad_units: incident.cad_units || [],
          created_at: incident.created_at,
          updated_at: incident.updated_at,
          closed_at: incident.closed_at,
          neris_submitted_at: incident.neris_submitted_at,
        });
        
        // Load assignments
        if (incident.personnel_assignments) {
          setAssignments({ ...emptyAssignments, ...incident.personnel_assignments });
        } else {
          setAssignments(emptyAssignments);
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

  // Generate "Units Called" string from CAD units
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

  // Location use toggle - stores as object {use_type, use_subtype}
  const handleLocationUseToggle = (valueString) => {
    setFormData(prev => {
      // If clicking same value, deselect
      const currentValue = prev.neris_location_use;
      const currentString = currentValue ? `${currentValue.use_type}: ${currentValue.use_subtype}` : null;
      
      if (currentString === valueString) {
        return { ...prev, neris_location_use: null };
      }
      
      // Find the item in locationUses to get use_type and use_subtype
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

  // Get value string from location use object for display/comparison
  const getLocationUseValue = () => {
    const loc = formData.neris_location_use;
    if (!loc || !loc.use_type) return '';
    return loc.use_subtype ? `${loc.use_type}: ${loc.use_subtype}` : loc.use_type;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanData = {};
      for (const [key, value] of Object.entries(formData)) {
        if (['created_at', 'updated_at', 'closed_at', 'neris_submitted_at'].includes(key)) continue;
        cleanData[key] = (value === '' || value === undefined) ? null : value;
      }

      let incidentId;
      
      if (incident?.id) {
        await updateIncident(incident.id, cleanData);
        incidentId = incident.id;
      } else {
        // When creating, include incident_date since it can't be changed after
        const res = await createIncident({
          cad_event_number: cleanData.cad_event_number || `MANUAL-${Date.now()}`,
          cad_event_type: cleanData.cad_event_type,
          address: cleanData.address,
          municipality_code: cleanData.municipality_code,
          internal_incident_number: cleanData.internal_incident_number,
          incident_date: cleanData.incident_date,  // Must be set at creation
        });
        incidentId = res.data.id;
        await updateIncident(incidentId, cleanData);
      }

      await saveAllAssignments(incidentId, assignments);

      if (onSave) onSave(incidentId);
      if (onClose) onClose();
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
      await closeIncident(incident.id);
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
    const d = new Date(isoString);
    // Military time format: YYYY-MM-DD HH:MM
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${mins}`;
  };

  if (loading) return <div className="loading">Loading...</div>;

  const realTrucks = apparatus.filter(a => !a.is_virtual);
  const virtualUnits = apparatus.filter(a => a.is_virtual);

  return (
    <div className="runsheet-form">
      <div className="runsheet-header">
        <h2>Glen Moore Fire Company – Station 48</h2>
        <h3>Incident Report</h3>
        {incident && (
          <span className={`badge badge-${formData.status?.toLowerCase()}`}>{formData.status}</span>
        )}
      </div>

      {incident && (
        <div className="timestamps-bar">
          <span>Created: {formatTimestamp(formData.created_at)}</span>
          <span>Updated: {formatTimestamp(formData.updated_at)}</span>
          {formData.closed_at && <span>Closed: {formatTimestamp(formData.closed_at)}</span>}
          {formData.neris_submitted_at && <span>NERIS: {formatTimestamp(formData.neris_submitted_at)}</span>}
        </div>
      )}

      {/* Incident Info */}
      <div className="runsheet-top">
        <div className="runsheet-col">
          <div className="form-row">
            <div className="form-group">
              <label>Internal # {incident && <span className="locked-indicator" title="Cannot be changed after creation">🔒</span>}</label>
              <input 
                type="number" 
                value={formData.internal_incident_number} 
                onChange={(e) => handleChange('internal_incident_number', parseInt(e.target.value) || '')} 
                disabled={!!incident}
                className={incident ? 'field-locked' : ''}
              />
            </div>
            <div className="form-group">
              <label>CAD # {incident && <span className="locked-indicator" title="Cannot be changed after creation">🔒</span>}</label>
              <input 
                type="text" 
                value={formData.cad_event_number} 
                onChange={(e) => handleChange('cad_event_number', e.target.value)} 
                placeholder="F25000000"
                disabled={!!incident}
                className={incident ? 'field-locked' : ''}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Incident Date {incident && <span className="locked-indicator" title="Cannot be changed after creation">🔒</span>}</label>
            <input 
              type="date" 
              value={formData.incident_date} 
              onChange={(e) => handleChange('incident_date', e.target.value)} 
              disabled={!!incident}
              className={incident ? 'field-locked' : ''}
            />
          </div>
          <div className="form-group">
            <label>CAD Type</label>
            <input type="text" value={formData.cad_event_type} onChange={(e) => handleChange('cad_event_type', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input type="text" value={formData.address} onChange={(e) => handleChange('address', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Municipality</label>
              <select value={formData.municipality_code} onChange={(e) => handleChange('municipality_code', e.target.value)}>
                <option value="">--</option>
                {municipalities.map(m => (
                  <option key={m.code} value={m.code}>
                    {m.display_name || m.name}{m.subdivision_type ? ` ${m.subdivision_type}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>ESZ</label>
              <input type="text" value={formData.esz_box} onChange={(e) => handleChange('esz_box', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Cross Streets</label>
            <input type="text" value={formData.cross_streets} onChange={(e) => handleChange('cross_streets', e.target.value)} />
          </div>
        </div>

        <div className="runsheet-col">
          <div className="form-group"><label>Dispatched</label><input type="datetime-local" value={formData.time_dispatched} onChange={(e) => handleChange('time_dispatched', e.target.value)} /></div>
          <div className="form-group"><label>Enroute</label><input type="datetime-local" value={formData.time_first_enroute} onChange={(e) => handleChange('time_first_enroute', e.target.value)} /></div>
          <div className="form-group"><label>On Scene</label><input type="datetime-local" value={formData.time_first_on_scene} onChange={(e) => handleChange('time_first_on_scene', e.target.value)} /></div>
          <div className="form-group"><label>Under Control</label><input type="datetime-local" value={formData.time_fire_under_control} onChange={(e) => handleChange('time_fire_under_control', e.target.value)} /></div>
          <div className="form-group"><label>Cleared</label><input type="datetime-local" value={formData.time_last_cleared} onChange={(e) => handleChange('time_last_cleared', e.target.value)} /></div>
          <div className="form-group"><label>In Service</label><input type="datetime-local" value={formData.time_in_service} onChange={(e) => handleChange('time_in_service', e.target.value)} /></div>
        </div>
      </div>

      {/* Caller */}
      <div className="runsheet-section">
        <div className="form-row three-col">
          <div className="form-group"><label>Caller</label><input type="text" value={formData.caller_name} onChange={(e) => handleChange('caller_name', e.target.value)} /></div>
          <div className="form-group"><label>Phone</label><input type="text" value={formData.caller_phone} onChange={(e) => handleChange('caller_phone', e.target.value)} /></div>
          <div className="form-group"><label>Weather</label><input type="text" value={formData.weather_conditions} onChange={(e) => handleChange('weather_conditions', e.target.value)} /></div>
        </div>
      </div>

      {/* Narrative */}
      <div className="runsheet-section">
        <div className="form-group units-called-group">
          <label>Units Called</label>
          <div className="units-called-row">
            <input 
              type="text" 
              value={formData.companies_called} 
              onChange={(e) => handleChange('companies_called', e.target.value)}
              placeholder="Station 48: ENG481, CHF48 | Mutual Aid: AMB891"
            />
            {formData.cad_units && formData.cad_units.length > 0 && (
              <button 
                type="button" 
                className="auto-fill-btn"
                onClick={populateUnitsCalled}
                title="Auto-fill from CAD data"
              >
                Auto
              </button>
            )}
          </div>
        </div>
        <div className="form-group"><label>Situation Found</label><textarea rows={2} value={formData.situation_found} onChange={(e) => handleChange('situation_found', e.target.value)} /></div>
        <div className="form-group"><label>Damage</label><textarea rows={2} value={formData.extent_of_damage} onChange={(e) => handleChange('extent_of_damage', e.target.value)} /></div>
        <div className="form-group"><label>Services</label><textarea rows={2} value={formData.services_provided} onChange={(e) => handleChange('services_provided', e.target.value)} /></div>
        <div className="form-group"><label>Narrative</label><textarea rows={4} value={formData.narrative} onChange={(e) => handleChange('narrative', e.target.value)} /></div>
        <div className="form-group"><label>Problems</label><textarea rows={2} value={formData.problems_issues} onChange={(e) => handleChange('problems_issues', e.target.value)} /></div>
      </div>

      {/* CAD Responding Units */}
      {formData.cad_units && formData.cad_units.length > 0 && (
        <div className="runsheet-section">
          <h4>CAD Responding Units</h4>
          <table className="cad-units-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Dispatched</th>
                <th>Enroute</th>
                <th>Arrived</th>
                <th>Cleared</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {formData.cad_units.map((unit, idx) => (
                <tr key={idx} className={unit.is_mutual_aid ? 'mutual-aid-row' : 'our-unit-row'}>
                  <td className="unit-id-cell">
                    <strong>{unit.unit_id}</strong>
                    {unit.is_mutual_aid && <span className="mutual-aid-badge">MA</span>}
                  </td>
                  <td>{unit.time_dispatched || '-'}</td>
                  <td>{unit.time_enroute || '-'}</td>
                  <td>{unit.time_arrived || '-'}</td>
                  <td>{unit.time_cleared || '-'}</td>
                  <td>{unit.is_mutual_aid ? 'Mutual Aid' : 'Station 48'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Personnel Grid - Trucks */}
      <div className="runsheet-section">
        <h4>Personnel Assignments</h4>
        <table className="personnel-table">
          <thead>
            <tr>
              <th className="slot-col">#</th>
              {realTrucks.map(t => {
                // Only apply dispatched styling if we have actual CAD unit data
                const hasCadData = Array.isArray(formData.cad_units) && formData.cad_units.length > 0;
                const wasDispatched = hasCadData && formData.cad_units.some(u => 
                  u.unit_id === t.unit_designator && !u.is_mutual_aid
                );
                // No CAD data = manual incident = no dimming (empty class)
                const headerClass = hasCadData 
                  ? (wasDispatched ? 'truck-dispatched' : 'truck-not-dispatched')
                  : '';
                return (
                  <th key={t.id} className={headerClass}>
                    {t.unit_designator}
                    {wasDispatched && <span className="dispatched-indicator">●</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4, 5].map(slot => (
              <tr key={slot}>
                <td className="slot-col">{slot + 1}</td>
                {realTrucks.map(t => {
                  const val = assignments[t.unit_designator]?.[slot] || '';
                  // Only dim cells if we have actual CAD data and this truck wasn't dispatched
                  // No CAD data = manual incident = all trucks available (no dimming)
                  const hasCadData = Array.isArray(formData.cad_units) && formData.cad_units.length > 0;
                  const wasDispatched = hasCadData && formData.cad_units.some(u => 
                    u.unit_id === t.unit_designator && !u.is_mutual_aid
                  );
                  const shouldDim = hasCadData && !wasDispatched;
                  return (
                    <td key={t.id} className={shouldDim ? 'cell-dimmed' : ''}>
                      <div className="slot-cell">
                        <select value={val} onChange={(e) => handleAssignment(t.unit_designator, slot, e.target.value)}>
                          <option value="">-</option>
                          {getAvailablePersonnel(t.unit_designator, slot).map(p => (
                            <option key={p.id} value={p.id}>{p.last_name}</option>
                          ))}
                        </select>
                        {val && <button className="clear-btn" onClick={() => clearSlot(t.unit_designator, slot)}>×</button>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Virtual Units - Dynamic Growing Lists */}
      {virtualUnits.length > 0 && (
        <div className="runsheet-section">
          <h4>Direct / Station</h4>
          <div className="virtual-units-row">
            {virtualUnits.map(t => (
              <DynamicPersonnelList
                key={t.id}
                label={t.unit_designator}
                assignedIds={assignments[t.unit_designator] || []}
                onUpdate={(newList) => setAssignments(prev => ({ ...prev, [t.unit_designator]: newList }))}
                allPersonnel={personnel}
                getAssignedIds={getAssignedIds}
              />
            ))}
          </div>
        </div>
      )}

      {/* Officer */}
      <div className="runsheet-section">
        <div className="form-row">
          <div className="form-group">
            <label>Officer in Charge</label>
            <select value={formData.officer_in_charge} onChange={(e) => handleChange('officer_in_charge', e.target.value ? parseInt(e.target.value) : '')}>
              <option value="">--</option>
              {personnel.map(p => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Completed By</label>
            <select value={formData.completed_by} onChange={(e) => handleChange('completed_by', e.target.value ? parseInt(e.target.value) : '')}>
              <option value="">--</option>
              {personnel.map(p => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* NERIS */}
      <div className="runsheet-section">
        <button className="btn btn-secondary" onClick={() => setShowNeris(!showNeris)}>
          {showNeris ? '▲ Hide NERIS' : '▼ NERIS Fields'}
        </button>
      </div>

      {showNeris && (
        <div className="runsheet-section neris-section">
          <h4>NERIS Classification</h4>
          
          <div className="neris-field">
            <label className="neris-field-label">Incident Type (max 3)</label>
            <button type="button" className="neris-picker-btn" onClick={() => setShowIncidentTypeModal(true)}>
              <span>{formData.neris_incident_type_codes?.length > 0 ? `${formData.neris_incident_type_codes.length} selected` : 'Select incident type...'}</span>
              <span className="neris-picker-arrow">▼</span>
            </button>
            {formData.neris_incident_type_codes?.length > 0 && (
              <div className="neris-selected-chips">
                {formData.neris_incident_type_codes.map(val => (
                  <span key={val} className="neris-chip">
                    {getNerisDisplayName(val)}
                    <button className="chip-remove" type="button" onClick={() => handleNerisTypeToggle(val)}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="neris-field">
            <label className="neris-field-label">Location Use</label>
            <button type="button" className="neris-picker-btn" onClick={() => setShowLocationUseModal(true)}>
              <span>{getLocationUseValue() ? getNerisDisplayName(getLocationUseValue()) : 'Select location use...'}</span>
              <span className="neris-picker-arrow">▼</span>
            </button>
            {getLocationUseValue() && (
              <div className="neris-selected-chips">
                <span className="neris-chip">
                  {getNerisDisplayName(getLocationUseValue())}
                  <button className="chip-remove" type="button" onClick={() => handleChange('neris_location_use', null)}>×</button>
                </span>
              </div>
            )}
          </div>

          <div className="neris-field">
            <label className="neris-field-label">Actions Taken</label>
            <button type="button" className="neris-picker-btn" onClick={() => setShowActionsModal(true)}>
              <span>{formData.neris_action_codes?.length > 0 ? `${formData.neris_action_codes.length} selected` : 'Select actions taken...'}</span>
              <span className="neris-picker-arrow">▼</span>
            </button>
            {formData.neris_action_codes?.length > 0 && (
              <div className="neris-selected-chips">
                {formData.neris_action_codes.map(val => (
                  <span key={val} className="neris-chip">
                    {getNerisDisplayName(val)}
                    <button className="chip-remove" type="button" onClick={() => handleActionToggle(val)}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* No Action Reason - show only if no actions selected */}
          {(!formData.neris_action_codes || formData.neris_action_codes.length === 0) && (
            <div className="neris-field">
              <label className="neris-field-label">No Action Reason</label>
              <select 
                value={formData.neris_noaction_code || ''} 
                onChange={(e) => handleChange('neris_noaction_code', e.target.value || null)}
                className="neris-select"
              >
                <option value="">Select if no actions taken...</option>
                {noActionCodes.map(code => (
                  <option key={code.value} value={code.value}>
                    {code.description || code.display_text || code.value}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* People Present */}
          <div className="neris-field">
            <label className="neris-field-label">
              People Present at Incident?
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.people_present} />
            </label>
            <div className="neris-radio-group">
              <label className="neris-radio">
                <input 
                  type="radio" 
                  name="people_present" 
                  checked={formData.neris_people_present === true}
                  onChange={() => handleChange('neris_people_present', true)}
                />
                Yes
              </label>
              <label className="neris-radio">
                <input 
                  type="radio" 
                  name="people_present" 
                  checked={formData.neris_people_present === false}
                  onChange={() => handleChange('neris_people_present', false)}
                />
                No
              </label>
              <label className="neris-radio">
                <input 
                  type="radio" 
                  name="people_present" 
                  checked={formData.neris_people_present === null}
                  onChange={() => handleChange('neris_people_present', null)}
                />
                Unknown
              </label>
            </div>
          </div>

          {/* Displaced Number */}
          <div className="neris-field">
            <label className="neris-field-label">
              People Displaced
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.displaced} />
            </label>
            <input 
              type="number" 
              min="0" 
              value={formData.neris_displaced_number ?? 0}
              onChange={(e) => handleChange('neris_displaced_number', parseInt(e.target.value) || 0)}
              className="neris-number-input"
              placeholder="0"
            />
          </div>

          {/* Mutual Aid */}
          <div className="neris-field">
            <label className="neris-field-label">
              Mutual Aid
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.mutual_aid} />
            </label>
            <div className="neris-row">
              <div className="neris-select-with-tooltip">
                <select 
                  value={formData.neris_aid_direction || ''} 
                  onChange={(e) => handleChange('neris_aid_direction', e.target.value || null)}
                  className="neris-select"
                >
                  <option value="">No mutual aid</option>
                  {aidDirections.map(code => (
                    <option key={code.value} value={code.value}>
                      {code.description || code.value}
                    </option>
                  ))}
                </select>
              </div>
              {formData.neris_aid_direction && (
                <div className="neris-select-with-tooltip">
                  <select 
                    value={formData.neris_aid_type || ''} 
                    onChange={(e) => handleChange('neris_aid_type', e.target.value || null)}
                    className="neris-select"
                  >
                    <option value="">Select type...</option>
                    {aidTypes.map(code => (
                      <option key={code.value} value={code.value}>
                        {code.description || code.value}
                      </option>
                    ))}
                  </select>
                  {formData.neris_aid_type && (
                    <span className="neris-aid-description">
                      {aidTypes.find(c => c.value === formData.neris_aid_type)?.description || ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Risk Reduction - Smoke Alarms, Fire Alarms, Sprinklers */}
          <div className="neris-field">
            <label className="neris-field-label">
              Risk Reduction (Structure Incidents)
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.risk_reduction} />
            </label>
            <div className="neris-risk-grid">
              <div className="neris-risk-item">
                <span>Smoke Alarm</span>
                <select 
                  value={formData.neris_risk_reduction?.smoke_alarm_presence || ''} 
                  onChange={(e) => handleChange('neris_risk_reduction', {
                    ...formData.neris_risk_reduction,
                    smoke_alarm_presence: e.target.value || null
                  })}
                >
                  <option value="">--</option>
                  {rrPresenceCodes.map(code => (
                    <option key={code.value} value={code.value}>
                      {code.description || code.display_text || code.value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="neris-risk-item">
                <span>Fire Alarm</span>
                <select 
                  value={formData.neris_risk_reduction?.fire_alarm_presence || ''} 
                  onChange={(e) => handleChange('neris_risk_reduction', {
                    ...formData.neris_risk_reduction,
                    fire_alarm_presence: e.target.value || null
                  })}
                >
                  <option value="">--</option>
                  {rrPresenceCodes.map(code => (
                    <option key={code.value} value={code.value}>
                      {code.description || code.display_text || code.value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="neris-risk-item">
                <span>Sprinklers</span>
                <select 
                  value={formData.neris_risk_reduction?.fire_suppression_presence || ''} 
                  onChange={(e) => handleChange('neris_risk_reduction', {
                    ...formData.neris_risk_reduction,
                    fire_suppression_presence: e.target.value || null
                  })}
                >
                  <option value="">--</option>
                  {rrPresenceCodes.map(code => (
                    <option key={code.value} value={code.value}>
                      {code.description || code.display_text || code.value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Narrative - Impedance */}
          <div className="neris-field">
            <label className="neris-field-label">
              Impedance (obstacles/issues that impacted response)
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.impedance} />
            </label>
            <textarea 
              value={formData.neris_narrative_impedance || ''}
              onChange={(e) => handleChange('neris_narrative_impedance', e.target.value)}
              rows={2}
              placeholder="Traffic, access issues, weather, etc."
              className="neris-textarea"
            />
          </div>

          {/* Narrative - Outcome */}
          <div className="neris-field">
            <label className="neris-field-label">
              Outcome (final disposition)
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.outcome} />
            </label>
            <textarea 
              value={formData.neris_narrative_outcome || ''}
              onChange={(e) => handleChange('neris_narrative_outcome', e.target.value)}
              rows={2}
              placeholder="Brief description of how incident was resolved"
              className="neris-textarea"
            />
          </div>

          {/* ============================================
              CONDITIONAL MODULE: FIRE
              Shown when incident type starts with FIRE:
              ============================================ */}
          {hasFireType(formData.neris_incident_type_codes) && (
            <div className="neris-module neris-module-fire">
              <h5 className="neris-module-title">Fire Module</h5>
              
              {/* Fire Investigation Need - Required for all fire types */}
              <div className="neris-field">
                <label className="neris-field-label">
                  Fire Investigation Needed? <span className="neris-required">*</span>
                  <InfoTooltip text={NERIS_DESCRIPTIONS.fields.fire_investigation} />
                </label>
                <select 
                  value={formData.neris_fire_investigation_need || ''} 
                  onChange={(e) => handleChange('neris_fire_investigation_need', e.target.value || null)}
                  className="neris-select"
                >
                  <option value="">Select...</option>
                  {fireInvestNeedCodes.map(code => (
                    <option key={code.value} value={code.value}>
                      {code.description || code.display_text || code.value}
                    </option>
                  ))}
                </select>
              </div>

              {/* Structure Fire Sub-module */}
              {hasStructureFireType(formData.neris_incident_type_codes) && (
                <>
                  <div className="neris-field">
                    <label className="neris-field-label">
                      Arrival Conditions <span className="neris-required">*</span>
                      <InfoTooltip text={NERIS_DESCRIPTIONS.fields.arrival_conditions} />
                    </label>
                    <select 
                      value={formData.neris_fire_arrival_conditions || ''} 
                      onChange={(e) => handleChange('neris_fire_arrival_conditions', e.target.value || null)}
                      className="neris-select"
                    >
                      <option value="">Select...</option>
                      {fireConditionArrivalCodes.map(code => (
                        <option key={code.value} value={code.value}>
                          {code.description || code.display_text || code.value}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="neris-field">
                    <label className="neris-field-label">
                      Structure Damage <span className="neris-required">*</span>
                      <InfoTooltip text={NERIS_DESCRIPTIONS.fields.structure_damage} />
                    </label>
                    <select 
                      value={formData.neris_fire_structure_damage || ''} 
                      onChange={(e) => handleChange('neris_fire_structure_damage', e.target.value || null)}
                      className="neris-select"
                    >
                      <option value="">Select...</option>
                      {fireBldgDamageCodes.map(code => (
                        <option key={code.value} value={code.value}>
                          {code.description || code.display_text || code.value}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="neris-row">
                    <div className="neris-field" style={{flex: 1}}>
                      <label className="neris-field-label">Floor of Origin</label>
                      <input 
                        type="number" 
                        min="0" 
                        value={formData.neris_fire_structure_floor ?? ''}
                        onChange={(e) => handleChange('neris_fire_structure_floor', e.target.value ? parseInt(e.target.value) : null)}
                        className="neris-number-input"
                        placeholder="Floor #"
                        style={{width: '100%'}}
                      />
                    </div>
                    <div className="neris-field" style={{flex: 2}}>
                      <label className="neris-field-label">Room of Origin</label>
                      <select 
                        value={formData.neris_fire_structure_room || ''} 
                        onChange={(e) => handleChange('neris_fire_structure_room', e.target.value || null)}
                        className="neris-select"
                        style={{width: '100%'}}
                      >
                        <option value="">Select...</option>
                        {roomCodes.map(code => (
                          <option key={code.value} value={code.value}>
                            {code.description || code.display_text || code.value}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="neris-field">
                    <label className="neris-field-label">Fire Cause (Structure)</label>
                    <select 
                      value={formData.neris_fire_structure_cause || ''} 
                      onChange={(e) => handleChange('neris_fire_structure_cause', e.target.value || null)}
                      className="neris-select"
                    >
                      <option value="">Select...</option>
                      {fireCauseInCodes.map(code => (
                        <option key={code.value} value={code.value}>
                          {code.description || code.display_text || code.value}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Outside Fire Sub-module */}
              {hasOutsideFireType(formData.neris_incident_type_codes) && (
                <div className="neris-field">
                  <label className="neris-field-label">Fire Cause (Outside) <span className="neris-required">*</span></label>
                  <select 
                    value={formData.neris_fire_outside_cause || ''} 
                    onChange={(e) => handleChange('neris_fire_outside_cause', e.target.value || null)}
                    className="neris-select"
                  >
                    <option value="">Select...</option>
                    {fireCauseOutCodes.map(code => (
                      <option key={code.value} value={code.value}>
                        {code.description || code.display_text || code.value}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* ============================================
              CONDITIONAL MODULE: MEDICAL
              Shown when incident type starts with MEDICAL:
              ============================================ */}
          {hasMedicalType(formData.neris_incident_type_codes) && (
            <div className="neris-module neris-module-medical">
              <h5 className="neris-module-title">Medical Module</h5>
              
              <div className="neris-field">
                <label className="neris-field-label">
                  Patient Evaluation/Care <span className="neris-required">*</span>
                  <InfoTooltip text={NERIS_DESCRIPTIONS.fields.patient_care} />
                </label>
                <select 
                  value={formData.neris_medical_patient_care || ''} 
                  onChange={(e) => handleChange('neris_medical_patient_care', e.target.value || null)}
                  className="neris-select"
                >
                  <option value="">Select...</option>
                  {medicalPatientCareCodes.map(code => (
                    <option key={code.value} value={code.value}>
                      {code.description || code.display_text || code.value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ============================================
              CONDITIONAL MODULE: HAZMAT
              Shown when incident type starts with HAZSIT:
              ============================================ */}
          {hasHazsitType(formData.neris_incident_type_codes) && (
            <div className="neris-module neris-module-hazmat">
              <h5 className="neris-module-title">Hazmat Module</h5>
              
              <div className="neris-field">
                <label className="neris-field-label">
                  Hazmat Disposition <span className="neris-required">*</span>
                  <InfoTooltip text={NERIS_DESCRIPTIONS.fields.hazmat_disposition} />
                </label>
                <select 
                  value={formData.neris_hazmat_disposition || ''} 
                  onChange={(e) => handleChange('neris_hazmat_disposition', e.target.value || null)}
                  className="neris-select"
                >
                  <option value="">Select...</option>
                  {hazardDispositionCodes.map(code => (
                    <option key={code.value} value={code.value}>
                      {code.description || code.display_text || code.value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="neris-field">
                <label className="neris-field-label">
                  People Evacuated <span className="neris-required">*</span>
                  <InfoTooltip text={NERIS_DESCRIPTIONS.fields.hazmat_evacuated} />
                </label>
                <input 
                  type="number" 
                  min="0" 
                  value={formData.neris_hazmat_evacuated ?? 0}
                  onChange={(e) => handleChange('neris_hazmat_evacuated', parseInt(e.target.value) || 0)}
                  className="neris-number-input"
                  placeholder="0"
                />
              </div>

              {/* Chemical Entry */}
              <div className="neris-field">
                <label className="neris-field-label">Chemicals Involved <span className="neris-required">*</span></label>
                <div className="neris-chemicals-list">
                  {(formData.neris_hazmat_chemicals || []).map((chem, idx) => (
                    <div key={idx} className="neris-chemical-entry">
                      <select 
                        value={chem.dot_class || ''} 
                        onChange={(e) => {
                          const updated = [...formData.neris_hazmat_chemicals];
                          updated[idx] = { ...updated[idx], dot_class: e.target.value || null };
                          handleChange('neris_hazmat_chemicals', updated);
                        }}
                        className="neris-select"
                      >
                        <option value="">DOT Class...</option>
                        {hazardDotCodes.map(code => (
                          <option key={code.value} value={code.value}>
                            {code.description || code.display_text || code.value}
                          </option>
                        ))}
                      </select>
                      <input 
                        type="text"
                        value={chem.name || ''}
                        onChange={(e) => {
                          const updated = [...formData.neris_hazmat_chemicals];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          handleChange('neris_hazmat_chemicals', updated);
                        }}
                        placeholder="Chemical name..."
                        className="neris-text-input"
                      />
                      <label className="neris-checkbox-inline">
                        <input 
                          type="checkbox"
                          checked={chem.release_occurred || false}
                          onChange={(e) => {
                            const updated = [...formData.neris_hazmat_chemicals];
                            updated[idx] = { ...updated[idx], release_occurred: e.target.checked };
                            handleChange('neris_hazmat_chemicals', updated);
                          }}
                        />
                        Released
                      </label>
                      <button 
                        type="button" 
                        className="clear-btn"
                        onClick={() => {
                          const updated = formData.neris_hazmat_chemicals.filter((_, i) => i !== idx);
                          handleChange('neris_hazmat_chemicals', updated);
                        }}
                      >×</button>
                    </div>
                  ))}
                  <button 
                    type="button" 
                    className="neris-add-btn"
                    onClick={() => {
                      const updated = [...(formData.neris_hazmat_chemicals || []), { dot_class: null, name: '', release_occurred: false }];
                      handleChange('neris_hazmat_chemicals', updated);
                    }}
                  >
                    + Add Chemical
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <NerisModal
        isOpen={showIncidentTypeModal}
        onClose={() => setShowIncidentTypeModal(false)}
        title="Select Incident Type"
        data={incidentTypes}
        selected={formData.neris_incident_type_codes || []}
        onToggle={handleNerisTypeToggle}
        maxSelections={3}
        dataType="children"
      />
      <NerisModal
        isOpen={showLocationUseModal}
        onClose={() => setShowLocationUseModal(false)}
        title="Select Location Use"
        data={locationUses}
        selected={getLocationUseValue()}
        onToggle={handleLocationUseToggle}
        dataType="subtypes"
      />
      <NerisModal
        isOpen={showActionsModal}
        onClose={() => setShowActionsModal(false)}
        title="Select Actions Taken"
        data={actionsTaken}
        selected={formData.neris_action_codes || []}
        onToggle={handleActionToggle}
        dataType="children"
      />

      {/* Buttons */}
      <div className="runsheet-actions">
        {onClose && <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>}
        {incident?.id && formData.status === 'OPEN' && <button className="btn btn-warning" onClick={handleCloseIncident} disabled={saving}>Close Incident</button>}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  );
}

export default RunSheetForm;
