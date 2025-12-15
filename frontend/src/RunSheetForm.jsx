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

// Save assignments using relative API path
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
    // NERIS fields - TEXT codes
    neris_incident_type_codes: [],
    neris_location_use: null,  // JSONB: {use_type, use_subtype}
    neris_action_codes: [],
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
        suggestedNumberRes
      ] = await Promise.all([
        getApparatus(),
        getPersonnel(),
        getMunicipalities(),
        getIncidentTypesByCategory(),
        getLocationUsesByCategory(),
        getActionsTakenByCategory(),
        suggestIncidentNumber()
      ]);

      const activeApparatus = apparatusRes.data.filter(a => a.active);
      setApparatus(activeApparatus);
      setPersonnel(personnelRes.data.filter(p => p.active));
      setMunicipalities(municipalitiesRes.data);
      setIncidentTypes(incidentTypesRes.data);
      setLocationUses(locationUsesRes.data);
      setActionsTaken(actionsTakenRes.data);

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
          const d = new Date(isoString);
          return d.toISOString().slice(0, 16);
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
          // NERIS fields from backend
          neris_incident_type_codes: incident.neris_incident_type_codes || [],
          neris_location_use: incident.neris_location_use || null,
          neris_action_codes: incident.neris_action_codes || [],
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

  // NERIS type toggle - uses TEXT value
  const handleNerisTypeToggle = (value) => {
    setFormData(prev => {
      const types = prev.neris_incident_type_codes || [];
      if (types.includes(value)) {
        return { ...prev, neris_incident_type_codes: types.filter(t => t !== value) };
      } else if (types.length < 3) {
        return { ...prev, neris_incident_type_codes: [...types, value] };
      }
      return prev;
    });
  };

  // NERIS action toggle - uses TEXT value
  const handleActionToggle = (value) => {
    setFormData(prev => {
      const actions = prev.neris_action_codes || [];
      if (actions.includes(value)) {
        return { ...prev, neris_action_codes: actions.filter(a => a !== value) };
      }
      return { ...prev, neris_action_codes: [...actions, value] };
    });
  };

  // Location use change - builds JSONB from selection
  const handleLocationUseChange = (selectedValue) => {
    if (!selectedValue) {
      handleChange('neris_location_use', null);
      return;
    }
    // Find the selected item to get use_type and use_subtype
    for (const [cat, data] of Object.entries(locationUses)) {
      const found = data.subtypes?.find(s => s.value === selectedValue);
      if (found) {
        handleChange('neris_location_use', {
          use_type: found.use_type,
          use_subtype: found.use_subtype
        });
        return;
      }
    }
  };

  // Get current location use value for select
  const getLocationUseValue = () => {
    const lu = formData.neris_location_use;
    if (!lu || !lu.use_type) return '';
    return `${lu.use_type}: ${lu.use_subtype || ''}`.replace(/: $/, '');
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
        <h2>Glen Moore Fire Company — Station 48</h2>
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
            <label>Event Type</label>
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
                  <option key={m.code} value={m.code}>{m.display_name || m.name || m.code}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>ESZ/Box</label>
              <input type="text" value={formData.esz_box} onChange={(e) => handleChange('esz_box', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Cross Streets</label>
            <input type="text" value={formData.cross_streets} onChange={(e) => handleChange('cross_streets', e.target.value)} />
          </div>
        </div>

        <div className="runsheet-col">
          <div className="form-row">
            <div className="form-group">
              <label>Caller Name</label>
              <input type="text" value={formData.caller_name} onChange={(e) => handleChange('caller_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Caller Phone</label>
              <input type="text" value={formData.caller_phone} onChange={(e) => handleChange('caller_phone', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Weather</label>
            <input type="text" value={formData.weather_conditions} onChange={(e) => handleChange('weather_conditions', e.target.value)} placeholder="Auto-filled from dispatch time" />
          </div>

          <div className="times-section">
            <h4>Times</h4>
            <div className="times-grid">
              <div className="form-group">
                <label>Dispatched</label>
                <input type="datetime-local" value={formData.time_dispatched} onChange={(e) => handleChange('time_dispatched', e.target.value)} />
              </div>
              <div className="form-group">
                <label>1st Enroute</label>
                <input type="datetime-local" value={formData.time_first_enroute} onChange={(e) => handleChange('time_first_enroute', e.target.value)} />
              </div>
              <div className="form-group">
                <label>1st On Scene</label>
                <input type="datetime-local" value={formData.time_first_on_scene} onChange={(e) => handleChange('time_first_on_scene', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Fire Under Ctrl</label>
                <input type="datetime-local" value={formData.time_fire_under_control} onChange={(e) => handleChange('time_fire_under_control', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Last Cleared</label>
                <input type="datetime-local" value={formData.time_last_cleared} onChange={(e) => handleChange('time_last_cleared', e.target.value)} />
              </div>
              <div className="form-group">
                <label>In Service</label>
                <input type="datetime-local" value={formData.time_in_service} onChange={(e) => handleChange('time_in_service', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CAD Unit Times */}
      {formData.cad_units && formData.cad_units.length > 0 && (
        <div className="runsheet-section cad-units-section">
          <h4>CAD Unit Times</h4>
          <table className="cad-units-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Dispatched</th>
                <th>Enroute</th>
                <th>On Scene</th>
                <th>Available</th>
                <th>Cleared</th>
              </tr>
            </thead>
            <tbody>
              {formData.cad_units.map((unit, idx) => (
                <tr key={idx} className={unit.is_mutual_aid ? 'mutual-aid' : ''}>
                  <td>{unit.unit_id} {unit.is_mutual_aid && <span className="ma-badge">MA</span>}</td>
                  <td>{unit.time_dispatched ? new Date(unit.time_dispatched).toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute: '2-digit'}) : '-'}</td>
                  <td>{unit.time_enroute ? new Date(unit.time_enroute).toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute: '2-digit'}) : '-'}</td>
                  <td>{unit.time_arrived ? new Date(unit.time_arrived).toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute: '2-digit'}) : '-'}</td>
                  <td>{unit.time_available ? new Date(unit.time_available).toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute: '2-digit'}) : '-'}</td>
                  <td>{unit.time_cleared ? new Date(unit.time_cleared).toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute: '2-digit'}) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Personnel Assignments */}
      <div className="runsheet-section personnel-section">
        <h4>Personnel</h4>
        <div className="personnel-grid">
          {/* Real trucks with fixed slots */}
          {realTrucks.map(app => (
            <div key={app.id} className="apparatus-card">
              <div className="apparatus-header">{app.name}</div>
              <div className="crew-slots">
                {['Driver', 'Officer', 'FF1', 'FF2', 'FF3', 'FF4'].slice(0, 2 + (app.ff_slots || 4)).map((role, idx) => {
                  const currentValue = assignments[app.unit_designator]?.[idx] || '';
                  const available = getAvailablePersonnel(app.unit_designator, idx);
                  return (
                    <div key={idx} className="crew-slot">
                      <span className="slot-label">{role}</span>
                      <select 
                        value={currentValue} 
                        onChange={(e) => handleAssignment(app.unit_designator, idx, e.target.value)}
                      >
                        <option value="">--</option>
                        {available.map(p => (
                          <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>
                        ))}
                      </select>
                      {currentValue && (
                        <button className="clear-btn" onClick={() => clearSlot(app.unit_designator, idx)}>×</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Virtual units with dynamic lists */}
          {virtualUnits.map(app => (
            <DynamicPersonnelList
              key={app.id}
              label={app.name}
              assignedIds={assignments[app.unit_designator] || []}
              onUpdate={(newList) => setAssignments(prev => ({ ...prev, [app.unit_designator]: newList }))}
              allPersonnel={personnel}
              getAssignedIds={getAssignedIds}
            />
          ))}
        </div>

        <div className="form-row" style={{marginTop: '1rem'}}>
          <div className="form-group">
            <label>Officer in Charge</label>
            <select value={formData.officer_in_charge} onChange={(e) => handleChange('officer_in_charge', e.target.value ? parseInt(e.target.value) : '')}>
              <option value="">--</option>
              {personnel.map(p => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Report Completed By</label>
            <select value={formData.completed_by} onChange={(e) => handleChange('completed_by', e.target.value ? parseInt(e.target.value) : '')}>
              <option value="">--</option>
              {personnel.map(p => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Narrative */}
      <div className="runsheet-section">
        <h4>Narrative</h4>
        <div className="form-group">
          <label>
            Companies Called
            <button type="button" className="btn-small" onClick={populateUnitsCalled}>Auto-fill</button>
          </label>
          <input type="text" value={formData.companies_called} onChange={(e) => handleChange('companies_called', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Situation Found</label>
          <textarea rows={2} value={formData.situation_found} onChange={(e) => handleChange('situation_found', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Extent of Damage</label>
          <textarea rows={2} value={formData.extent_of_damage} onChange={(e) => handleChange('extent_of_damage', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Services Provided</label>
          <textarea rows={2} value={formData.services_provided} onChange={(e) => handleChange('services_provided', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Narrative</label>
          <textarea rows={4} value={formData.narrative} onChange={(e) => handleChange('narrative', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Problems/Issues</label>
          <textarea rows={2} value={formData.problems_issues} onChange={(e) => handleChange('problems_issues', e.target.value)} />
        </div>
      </div>

      {/* NERIS Toggle */}
      <div className="neris-toggle">
        <button type="button" className="btn-toggle" onClick={() => setShowNeris(!showNeris)}>
          {showNeris ? '▲ Hide NERIS' : '▼ NERIS Fields'}
        </button>
      </div>

      {showNeris && (
        <div className="runsheet-section neris-section">
          <h4>NERIS Classification</h4>
          
          {/* Incident Types - max 3, uses TEXT value */}
          <div className="form-group">
            <label>Incident Type (max 3) {formData.neris_incident_type_codes?.length > 0 && <span className="count-badge">{formData.neris_incident_type_codes.length}/3</span>}</label>
            <div className="neris-checkboxes">
              {Object.entries(incidentTypes).map(([category, data]) => (
                <div key={category} className="neris-category">
                  <strong>{data.description || category}</strong>
                  {data.children && Object.entries(data.children).map(([subcat, subdata]) => (
                    <div key={subcat} className="neris-subcategory">
                      <em>{subdata.description || subcat}</em>
                      {subdata.codes?.map(item => (
                        <label key={item.value} className="checkbox-label">
                          <input 
                            type="checkbox" 
                            checked={formData.neris_incident_type_codes?.includes(item.value)} 
                            onChange={() => handleNerisTypeToggle(item.value)} 
                            disabled={!formData.neris_incident_type_codes?.includes(item.value) && formData.neris_incident_type_codes?.length >= 3} 
                          />
                          {item.description}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Location Use - dropdown builds JSONB */}
          <div className="form-group">
            <label>Property/Location Use</label>
            <select value={getLocationUseValue()} onChange={(e) => handleLocationUseChange(e.target.value)}>
              <option value="">--</option>
              {Object.entries(locationUses).map(([category, data]) => (
                <optgroup key={category} label={data.description || category}>
                  {data.subtypes?.map(item => (
                    <option key={item.value} value={item.value}>{item.description}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Actions Taken - uses TEXT value */}
          <div className="form-group">
            <label>Actions Taken {formData.neris_action_codes?.length > 0 && <span className="count-badge">{formData.neris_action_codes.length}</span>}</label>
            <div className="neris-checkboxes">
              {Object.entries(actionsTaken).map(([category, data]) => (
                <div key={category} className="neris-category">
                  <strong>{data.description || category}</strong>
                  {data.children && Object.entries(data.children).map(([subcat, subdata]) => (
                    <div key={subcat} className="neris-subcategory">
                      <em>{subdata.description || subcat}</em>
                      {subdata.codes?.map(item => (
                        <label key={item.value} className="checkbox-label">
                          <input 
                            type="checkbox" 
                            checked={formData.neris_action_codes?.includes(item.value)} 
                            onChange={() => handleActionToggle(item.value)} 
                          />
                          {item.description}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
