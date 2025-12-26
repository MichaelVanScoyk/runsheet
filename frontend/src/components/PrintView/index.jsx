import { useState, useEffect } from 'react';
import { getIncident, getApparatus, getPersonnel, getPrintSettings } from '../../api';
import './PrintView.css';

// Default print settings - will be overridden by API config
const DEFAULT_PRINT_SETTINGS = {
  showHeader: true,
  showTimes: true,
  showLocation: true,
  showDispatchInfo: true,
  showSituationFound: true,
  showExtentOfDamage: true,
  showServicesProvided: true,
  showNarrative: true,
  showPersonnelGrid: true,
  showEquipmentUsed: true,
  showOfficerInfo: true,
  showProblemsIssues: true,
  showCadUnits: true,
  showNerisInfo: false,
  showWeather: true,
  showCrossStreets: true,
  showCallerInfo: false,
};

export default function PrintView({ incidentId, onClose }) {
  const [incident, setIncident] = useState(null);
  const [apparatus, setApparatus] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printSettings, setPrintSettings] = useState(DEFAULT_PRINT_SETTINGS);
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    loadData();
  }, [incidentId]);

  // Inject landscape style when toggled
  useEffect(() => {
    const styleId = 'print-orientation-style';
    let styleEl = document.getElementById(styleId);
    
    if (landscape) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = '@media print { @page { size: letter landscape; } }';
    } else if (styleEl) {
      styleEl.remove();
    }
    
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, [landscape]);

  const loadData = async () => {
    try {
      const [incidentRes, apparatusRes, personnelRes, settingsRes] = await Promise.all([
        getIncident(incidentId),
        getApparatus(),
        getPersonnel(),
        getPrintSettings().catch(() => ({ data: DEFAULT_PRINT_SETTINGS })),
      ]);
      setIncident(incidentRes.data);
      setApparatus(apparatusRes.data.filter(a => a.active));
      setPersonnel(personnelRes.data);
      setPrintSettings({ ...DEFAULT_PRINT_SETTINGS, ...settingsRes.data });
    } catch (err) {
      console.error('Failed to load incident:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const match = isoString.match(/(\d{2}:\d{2}:\d{2})/);
    return match ? match[1] : '';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return dateStr;
  };

  const getPersonnelName = (personnelId) => {
    const person = personnel.find(p => p.id === personnelId);
    if (!person) return '';
    return `${person.last_name}, ${person.first_name}`;
  };

  const getOfficerName = (personnelId) => {
    if (!personnelId) return '';
    return getPersonnelName(personnelId);
  };

  // Calculate total personnel
  const getTotalPersonnel = () => {
    if (!incident?.personnel_assignments) return 0;
    let total = 0;
    Object.values(incident.personnel_assignments).forEach(slots => {
      total += slots.filter(id => id !== null).length;
    });
    return total;
  };

  // Get units that have personnel assigned
  const getAssignedUnits = () => {
    if (!incident?.personnel_assignments) return [];
    return apparatus.filter(a => {
      const slots = incident.personnel_assignments[a.unit_designator];
      return slots && slots.some(id => id !== null);
    });
  };

  // Calculate in-service duration
  const getInServiceDuration = () => {
    if (!incident?.time_dispatched || !incident?.time_last_cleared) return '';
    const start = new Date(incident.time_dispatched);
    const end = new Date(incident.time_last_cleared);
    const diffMs = end - start;
    if (diffMs < 0) return '';
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  if (loading) {
    return (
      <div className="print-view-container">
        <div className="print-controls no-print">
          <button onClick={onClose}>← Back</button>
        </div>
        <div className="print-loading">Loading...</div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="print-view-container">
        <div className="print-controls no-print">
          <button onClick={onClose}>← Back</button>
        </div>
        <div className="print-error">Incident not found</div>
      </div>
    );
  }

  const assignedUnits = getAssignedUnits();

  return (
    <div className="print-view-container">
      {/* Controls - hidden when printing */}
      <div className="print-controls no-print">
        <button onClick={onClose}>← Back to List</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ccc', fontSize: '0.9rem' }}>
          <input
            type="checkbox"
            checked={landscape}
            onChange={(e) => setLandscape(e.target.checked)}
          />
          Landscape
        </label>
        <button onClick={handlePrint} className="print-btn">🖨️ Print</button>
      </div>

      {/* Print Content */}
      <div className="print-content">
        {/* Header */}
        {printSettings.showHeader && (
          <div className="print-header">
            <h1>Glen Moore Fire Company — Station 48</h1>
            <h2>Incident Report</h2>
          </div>
        )}

        {/* Top Info Row */}
        <div className="print-row print-top-info">
          <div className="print-col-left">
            <div className="print-field">
              <span className="print-label">Incident #:</span>
              <span className="print-value print-value-bold">{incident.internal_incident_number}</span>
              <span className={`print-badge print-badge-${incident.call_category?.toLowerCase()}`}>
                {incident.call_category}
              </span>
            </div>
            <div className="print-field">
              <span className="print-label">Date:</span>
              <span className="print-value">{formatDate(incident.incident_date)}</span>
            </div>
            <div className="print-field">
              <span className="print-label">Municipality:</span>
              <span className="print-value">{incident.municipality_code || ''}</span>
            </div>
            {printSettings.showWeather && incident.weather_conditions && (
              <div className="print-field">
                <span className="print-label">Weather:</span>
                <span className="print-value">{incident.weather_conditions}</span>
              </div>
            )}
            <div className="print-field">
              <span className="print-label">ESZ/Box:</span>
              <span className="print-value">{incident.esz_box || ''}</span>
            </div>
          </div>

          {/* Times Column */}
          {printSettings.showTimes && (
            <div className="print-col-right">
              <div className="print-times-grid">
                <div className="print-time-row">
                  <span className="print-time-label">Dispatched:</span>
                  <span className="print-time-value">{formatTime(incident.time_dispatched)}</span>
                </div>
                <div className="print-time-row">
                  <span className="print-time-label">Enroute:</span>
                  <span className="print-time-value">{formatTime(incident.time_first_enroute)}</span>
                </div>
                <div className="print-time-row">
                  <span className="print-time-label">On Scene:</span>
                  <span className="print-time-value">{formatTime(incident.time_first_on_scene)}</span>
                </div>
                <div className="print-time-row">
                  <span className="print-time-label">Under Ctrl:</span>
                  <span className="print-time-value">{formatTime(incident.time_fire_under_control)}</span>
                </div>
                <div className="print-time-row">
                  <span className="print-time-label">Cleared:</span>
                  <span className="print-time-value">{formatTime(incident.time_last_cleared)}</span>
                </div>
                <div className="print-time-row">
                  <span className="print-time-label">In Service:</span>
                  <span className="print-time-value">{getInServiceDuration()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Location */}
        {printSettings.showLocation && (
          <div className="print-section">
            <div className="print-field print-field-full">
              <span className="print-label">Location:</span>
              <span className="print-value">{incident.address || ''}</span>
            </div>
            {printSettings.showCrossStreets && incident.cross_streets && (
              <div className="print-field print-field-full">
                <span className="print-label">Cross Streets:</span>
                <span className="print-value">{incident.cross_streets}</span>
              </div>
            )}
          </div>
        )}

        {/* CAD Units Called */}
        {printSettings.showCadUnits && incident.cad_units?.length > 0 && (
          <div className="print-section">
            <div className="print-field print-field-full">
              <span className="print-label">Units Called:</span>
              <span className="print-value">
                {incident.cad_units.map(u => u.unit_id).join(', ')}
              </span>
            </div>
          </div>
        )}

        {/* Dispatch Info */}
        {printSettings.showDispatchInfo && (
          <div className="print-section">
            <div className="print-field print-field-full">
              <span className="print-label">Dispatched As:</span>
              <span className="print-value">
                {incident.cad_event_type}
                {incident.cad_event_subtype && ` / ${incident.cad_event_subtype}`}
              </span>
            </div>
          </div>
        )}

        {/* Situation / Damage / Services */}
        {printSettings.showSituationFound && incident.situation_found && (
          <div className="print-section">
            <div className="print-field print-field-full">
              <span className="print-label">Situation Found:</span>
              <span className="print-value">{incident.situation_found}</span>
            </div>
          </div>
        )}

        {printSettings.showExtentOfDamage && incident.extent_of_damage && (
          <div className="print-section">
            <div className="print-field print-field-full">
              <span className="print-label">Extent of Damage:</span>
              <span className="print-value">{incident.extent_of_damage}</span>
            </div>
          </div>
        )}

        {printSettings.showServicesProvided && incident.services_provided && (
          <div className="print-section">
            <div className="print-field print-field-full">
              <span className="print-label">Services Provided:</span>
              <span className="print-value">{incident.services_provided}</span>
            </div>
          </div>
        )}

        {/* Narrative */}
        {printSettings.showNarrative && incident.narrative && (
          <div className="print-section">
            <div className="print-field print-field-full">
              <span className="print-label">Narrative:</span>
              <div className="print-value print-narrative">{incident.narrative}</div>
            </div>
          </div>
        )}

        {/* Equipment Used */}
        {printSettings.showEquipmentUsed && incident.equipment_used?.length > 0 && (
          <div className="print-section">
            <div className="print-field print-field-full">
              <span className="print-label">Equipment Used:</span>
              <span className="print-value">{incident.equipment_used.join(', ')}</span>
            </div>
          </div>
        )}

        {/* Personnel Grid */}
        {printSettings.showPersonnelGrid && assignedUnits.length > 0 && (
          <div className="print-section">
            <div className="print-label" style={{ marginBottom: '0.25rem' }}>Personnel:</div>
            <table className="print-personnel-table">
              <thead>
                <tr>
                  <th>Role</th>
                  {assignedUnits.map(a => (
                    <th key={a.unit_designator}>{a.unit_designator}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {['Driver', 'Officer', 'FF', 'FF', 'FF', 'FF'].map((role, idx) => {
                  // Check if this row has any data
                  const hasData = assignedUnits.some(a => {
                    const slots = incident.personnel_assignments[a.unit_designator];
                    return slots && slots[idx];
                  });
                  if (!hasData) return null;
                  
                  return (
                    <tr key={idx}>
                      <td className="print-role-cell">{role}</td>
                      {assignedUnits.map(a => {
                        const slots = incident.personnel_assignments[a.unit_designator] || [];
                        const personnelId = slots[idx];
                        return (
                          <td key={a.unit_designator}>
                            {personnelId ? getPersonnelName(personnelId) : ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="print-field" style={{ marginTop: '0.25rem' }}>
              <span className="print-label">Total Personnel:</span>
              <span className="print-value">{getTotalPersonnel()}</span>
            </div>
          </div>
        )}

        {/* Officer / Completed By */}
        {printSettings.showOfficerInfo && (
          <div className="print-section print-row">
            <div className="print-field">
              <span className="print-label">Officer in Charge:</span>
              <span className="print-value">{getOfficerName(incident.officer_in_charge)}</span>
            </div>
            <div className="print-field">
              <span className="print-label">Report Completed By:</span>
              <span className="print-value">{getOfficerName(incident.completed_by)}</span>
            </div>
          </div>
        )}

        {/* Problems/Issues */}
        {printSettings.showProblemsIssues && incident.problems_issues && (
          <div className="print-section">
            <div className="print-field print-field-full">
              <span className="print-label">Problems/Issues:</span>
              <span className="print-value">{incident.problems_issues}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="print-footer">
          <span>CAD Event: {incident.cad_event_number}</span>
          <span>Status: {incident.status}</span>
          <span>Printed: {new Date().toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
