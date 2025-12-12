import { useState, useEffect, useRef } from 'react';
import { 
  getApparatus, 
  getPersonnel, 
  suggestIncidentNumber,
  getIncidentTypesByCategory,
  getPropertyUsesByCategory,
  getActionsTakenByCategory,
  getMunicipalities,
  createIncident,
  updateIncident,
  closeIncident,
} from '../api';
import './RunSheetForm.css';

// Simple date + time fields - uncontrolled
function DateTimeInput24({ value, onChange, disabled }) {
  const dateRef = useRef(null);
  const timeRef = useRef(null);

  const getDate = () => value ? value.split('T')[0] : '';
  const getTime = () => value && value.includes('T') ? value.split('T')[1].substring(0, 5) : '';

  const emitChange = () => {
    const d = dateRef.current?.value;
    const t = timeRef.current?.value;
    if (d) {
      onChange(`${d}T${t || '00:00'}:00`);
    }
  };

  const handleTimeBlur = () => {
    // Format: "1300" -> "13:00"
    let val = timeRef.current.value.replace(/[^0-9]/g, '');
    if (val.length === 3) val = '0' + val;
    if (val.length === 4) {
      timeRef.current.value = val.substring(0, 2) + ':' + val.substring(2);
    }
    emitChange();
  };

  return (
    <div className="datetime-24-input">
      <input
        ref={dateRef}
        type="date"
        defaultValue={getDate()}
        onBlur={emitChange}
        disabled={disabled}
        className="datetime-24-date"
      />
      <input
        ref={timeRef}
        type="text"
        defaultValue={getTime()}
        onBlur={handleTimeBlur}
        placeholder="HH:MM"
        disabled={disabled}
        className="datetime-24-time"
      />
    </div>
  );
}

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

// Simple API call to save all assignments at once
const saveAllAssignments = async (incidentId, assignments) => {
  const response = await fetch(`http://192.168.1.189:8001/api/incidents/${incidentId}/assignments`, {
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
  const [propertyUses, setPropertyUses] = useState({});
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
    neris_incident_types: [],
    neris_property_use: '',
    neris_actions_taken: [],
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
        propertyUsesRes,
        actionsTakenRes,
        suggestedNumberRes
      ] = await Promise.all([
        getApparatus(),
        getPersonnel(),
        getMunicipalities(),
        getIncidentTypesByCategory(),
        getPropertyUsesByCategory(),
        getActionsTakenByCategory(),
        suggestIncidentNumber()
      ]);

      const activeApparatus = apparatusRes.data.filter(a => a.active);
      setApparatus(activeApparatus);
      setPersonnel(personnelRes.data.filter(p => p.active));
      setMunicipalities(municipalitiesRes.data);
      setIncidentTypes(incidentTypesRes.data);
      setPropertyUses(propertyUsesRes.data);
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
          neris_incident_types: incident.neris_incident_types || [],
          neris_property_use: incident.neris_property_use || '',
          neris_actions_taken: incident.neris_actions_taken || [],
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
      const types = prev.neris_incident_types || [];
      if (types.includes(code)) {
        return { ...prev, neris_incident_types: types.filter(t => t !== code) };
      } else if (types.length < 3) {
        return { ...prev, neris_incident_types: [...types, code] };
      }
      return prev;
    });
  };

  const handleActionToggle = (code) => {
    setFormData(prev => {
      const actions = prev.neris_actions_taken || [];
      if (actions.includes(code)) {
        return { ...prev, neris_actions_taken: actions.filter(a => a !== code) };
      }
      return { ...prev, neris_actions_taken: [...actions, code] };
    });
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
          <div className="form-group"><label>Dispatched</label><DateTimeInput24 value={formData.time_dispatched} onChange={(v) => handleChange('time_dispatched', v)} /></div>
          <div className="form-group"><label>Enroute</label><DateTimeInput24 value={formData.time_first_enroute} onChange={(v) => handleChange('time_first_enroute', v)} /></div>
          <div className="form-group"><label>On Scene</label><DateTimeInput24 value={formData.time_first_on_scene} onChange={(v) => handleChange('time_first_on_scene', v)} /></div>
          <div className="form-group"><label>Under Control</label><DateTimeInput24 value={formData.time_fire_under_control} onChange={(v) => handleChange('time_fire_under_control', v)} /></div>
          <div className="form-group"><label>Cleared</label><DateTimeInput24 value={formData.time_last_cleared} onChange={(v) => handleChange('time_last_cleared', v)} /></div>
          <div className="form-group"><label>In Service</label><DateTimeInput24 value={formData.time_in_service} onChange={(v) => handleChange('time_in_service', v)} /></div>
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
          <h4>NERIS</h4>
          <div className="form-group">
            <label>Incident Type (max 3)</label>
            <div className="neris-checkboxes">
              {Object.entries(incidentTypes).map(([cat, types]) => (
                <div key={cat} className="neris-category">
                  <strong>{cat}</strong>
                  {types.map(t => (
                    <label key={t.code} className="checkbox-label">
                      <input type="checkbox" checked={formData.neris_incident_types?.includes(t.code)} onChange={() => handleNerisTypeToggle(t.code)} disabled={!formData.neris_incident_types?.includes(t.code) && formData.neris_incident_types?.length >= 3} />
                      {t.display}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Property Use</label>
            <select value={formData.neris_property_use} onChange={(e) => handleChange('neris_property_use', e.target.value ? parseInt(e.target.value) : '')}>
              <option value="">--</option>
              {Object.entries(propertyUses).map(([cat, uses]) => (
                <optgroup key={cat} label={cat}>{uses.map(u => <option key={u.code} value={u.code}>{u.display}</option>)}</optgroup>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Actions Taken</label>
            <div className="neris-checkboxes">
              {Object.entries(actionsTaken).map(([cat, actions]) => (
                <div key={cat} className="neris-category">
                  <strong>{cat}</strong>
                  {actions.map(a => (
                    <label key={a.code} className="checkbox-label">
                      <input type="checkbox" checked={formData.neris_actions_taken?.includes(a.code)} onChange={() => handleActionToggle(a.code)} />
                      {a.display}
                    </label>
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