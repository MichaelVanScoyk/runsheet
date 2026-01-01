import { useState, useEffect, useCallback, useMemo } from 'react';
import { getApparatus, getPersonnel, updateIncident, getIncident } from '../../api';
import IncidentTabs from './IncidentTabs';
import IncidentDisplay from './IncidentDisplay';
import StationDirectSection from './StationDirectSection';
import QuickEntrySection from './QuickEntrySection';

/**
 * Incident Hub Modal - Kiosk-style incident data entry.
 * Matches the branding style of the Monthly Report template.
 */
export default function IncidentHubModal({
  incidents,
  initialIncidentId,
  onClose,
  onTabClose,
  onNavigateToEdit,
  refetch,
}) {
  const [selectedId, setSelectedId] = useState(initialIncidentId || incidents[0]?.id);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [apparatus, setApparatus] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [loadingRef, setLoadingRef] = useState(true);
  
  const [branding, setBranding] = useState({
    logo: null,
    stationName: '',
    stationNumber: '',
    primaryColor: '#1a5f2a',
    secondaryColor: '#1a365d',
  });
  
  const [assignments, setAssignments] = useState({});
  const [formData, setFormData] = useState({
    situation_found: '',
    services_provided: '',
    narrative: '',
  });
  
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Load branding
  useEffect(() => {
    async function loadBranding() {
      try {
        const [logoRes, stationRes, primaryRes, secondaryRes] = await Promise.allSettled([
          fetch('/api/settings/branding/logo'),
          fetch('/api/settings'),
          fetch('/api/settings/branding/primary_color'),
          fetch('/api/settings/branding/secondary_color'),
        ]);
        
        const newBranding = { ...branding };
        
        if (logoRes.status === 'fulfilled' && logoRes.value.ok) {
          const logoData = await logoRes.value.json();
          if (logoData.has_logo && logoData.data && logoData.mime_type) {
            newBranding.logo = `data:${logoData.mime_type};base64,${logoData.data}`;
          }
        }
        
        if (stationRes.status === 'fulfilled' && stationRes.value.ok) {
          const settings = await stationRes.value.json();
          const stationSettings = settings.station || [];
          const nameEntry = stationSettings.find(s => s.key === 'name');
          const numberEntry = stationSettings.find(s => s.key === 'station_number');
          if (nameEntry) newBranding.stationName = nameEntry.raw_value || nameEntry.value || '';
          if (numberEntry) newBranding.stationNumber = numberEntry.raw_value || numberEntry.value || '';
        }
        
        if (primaryRes.status === 'fulfilled' && primaryRes.value.ok) {
          const data = await primaryRes.value.json();
          if (data.raw_value) newBranding.primaryColor = data.raw_value;
        }
        
        if (secondaryRes.status === 'fulfilled' && secondaryRes.value.ok) {
          const data = await secondaryRes.value.json();
          if (data.raw_value) newBranding.secondaryColor = data.raw_value;
        }
        
        setBranding(newBranding);
      } catch (err) {
        console.error('Failed to load branding:', err);
      }
    }
    loadBranding();
  }, []);

  // Load reference data
  useEffect(() => {
    async function loadRefData() {
      try {
        const [appRes, persRes] = await Promise.all([
          getApparatus(),
          getPersonnel(),
        ]);
        setApparatus(appRes.data.filter(a => a.active));
        setPersonnel(persRes.data.filter(p => p.active));
      } catch (err) {
        console.error('Failed to load reference data:', err);
        setError('Failed to load reference data');
      } finally {
        setLoadingRef(false);
      }
    }
    loadRefData();
  }, []);

  // Load incident data
  useEffect(() => {
    async function loadIncident() {
      if (!selectedId) {
        setSelectedIncident(null);
        return;
      }

      try {
        const res = await getIncident(selectedId);
        const inc = res.data;
        setSelectedIncident(inc);

        const newAssignments = {};
        apparatus.forEach(a => {
          newAssignments[a.unit_designator] = [];
        });

        if (inc.personnel_assignments) {
          Object.entries(inc.personnel_assignments).forEach(([unitKey, slots]) => {
            newAssignments[unitKey] = slots.filter(id => id !== null);
          });
        }
        setAssignments(newAssignments);

        setFormData({
          situation_found: inc.situation_found || '',
          services_provided: inc.services_provided || '',
          narrative: inc.narrative || '',
        });

        setError(null);
      } catch (err) {
        console.error('Failed to load incident:', err);
        setError('Failed to load incident details');
      }
    }

    if (!loadingRef) {
      loadIncident();
    }
  }, [selectedId, loadingRef, apparatus]);

  useEffect(() => {
    if (incidents.length > 0 && !incidents.find(i => i.id === selectedId)) {
      setSelectedId(incidents[0].id);
    } else if (incidents.length === 0) {
      setSelectedId(null);
      setSelectedIncident(null);
    }
  }, [incidents, selectedId]);

  const getAssignedIds = useCallback(() => {
    const assigned = new Set();
    Object.values(assignments).forEach(slots => {
      slots.forEach(id => {
        if (id) assigned.add(id);
      });
    });
    return assigned;
  }, [assignments]);

  const handleAssignmentChange = useCallback((unitDesignator, newList) => {
    setAssignments(prev => ({
      ...prev,
      [unitDesignator]: newList,
    }));
  }, []);

  const handleFormChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const stationUnit = useMemo(() => 
    apparatus.find(a => a.unit_category === 'STATION'),
    [apparatus]
  );
  
  const directUnit = useMemo(() => 
    apparatus.find(a => a.unit_category === 'DIRECT'),
    [apparatus]
  );

  const dispatchedApparatus = useMemo(() => {
    if (!selectedIncident?.cad_units) return [];
    
    const dispatchedIds = selectedIncident.cad_units
      .filter(u => !u.is_mutual_aid)
      .map(u => u.unit_id);
    
    return apparatus.filter(a => 
      dispatchedIds.includes(a.unit_designator) ||
      dispatchedIds.includes(a.cad_unit_id) ||
      (a.cad_unit_aliases || []).some(alias => dispatchedIds.includes(alias))
    );
  }, [selectedIncident, apparatus]);

  const handleSave = async () => {
    if (!selectedIncident) return;

    setSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const assignmentPayload = {};
      Object.entries(assignments).forEach(([unitKey, personIds]) => {
        const unit = apparatus.find(a => a.unit_designator === unitKey);
        if (unit && (unit.unit_category === 'STATION' || unit.unit_category === 'DIRECT')) {
          assignmentPayload[unitKey] = personIds;
        } else {
          const slots = [null, null, null, null, null, null];
          personIds.forEach((id, idx) => {
            if (idx < 6) slots[idx] = id;
          });
          assignmentPayload[unitKey] = slots;
        }
      });

      await fetch(`/api/incidents/${selectedIncident.id}/assignments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: assignmentPayload }),
      });

      if (selectedIncident.status === 'CLOSED') {
        const updatePayload = {};
        if (formData.situation_found) updatePayload.situation_found = formData.situation_found;
        if (formData.services_provided) updatePayload.services_provided = formData.services_provided;
        if (formData.narrative) updatePayload.narrative = formData.narrative;

        if (Object.keys(updatePayload).length > 0) {
          await updateIncident(selectedIncident.id, updatePayload);
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      if (refetch) await refetch();

      const res = await getIncident(selectedIncident.id);
      setSelectedIncident(res.data);

    } catch (err) {
      console.error('Failed to save:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    if (!selectedIncident) return;
    window.open(`/api/reports/pdf/incident/${selectedIncident.id}`, '_blank');
  };

  const handleFullEdit = () => {
    if (!selectedIncident || !onNavigateToEdit) return;
    onNavigateToEdit(selectedIncident.id);
  };

  const handleTabClose = (incidentId) => {
    if (onTabClose) {
      onTabClose(incidentId);
    } else if (incidents.length === 1) {
      onClose();
    }
  };

  const isActive = selectedIncident?.status === 'OPEN';
  const isClosed = selectedIncident?.status === 'CLOSED';

  if (loadingRef) {
    return (
      <div style={styles.overlay}>
        <div style={{ ...styles.modal, padding: '2rem', textAlign: 'center', color: '#333' }}>
          Loading...
        </div>
      </div>
    );
  }

  if (incidents.length === 0) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header - matches report header style */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            {branding.logo && (
              <img 
                src={branding.logo} 
                alt="Logo" 
                style={styles.logo}
              />
            )}
            <div>
              <div style={styles.stationName}>
                {(branding.stationName || 'Fire Department').toUpperCase()}
              </div>
              {branding.stationNumber && (
                <div style={{ ...styles.stationSubtitle, color: branding.primaryColor }}>
                  Station {branding.stationNumber}
                </div>
              )}
            </div>
          </div>
          
          {incidents.length > 1 && (
            <div style={{ ...styles.badge, backgroundColor: branding.primaryColor }}>
              {incidents.length} Incidents
            </div>
          )}
        </div>

        {/* Accent line under header - like the report */}
        <div style={{ height: '3px', backgroundColor: branding.primaryColor }} />

        {/* Tabs */}
        <IncidentTabs
          incidents={incidents}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onClose={handleTabClose}
          primaryColor={branding.primaryColor}
        />

        {/* Content */}
        <div style={styles.content}>
          <IncidentDisplay 
            incident={selectedIncident} 
            primaryColor={branding.primaryColor}
          />

          <StationDirectSection
            assignments={assignments}
            onAssignmentChange={handleAssignmentChange}
            allPersonnel={personnel}
            getAssignedIds={getAssignedIds}
            stationUnit={stationUnit}
            directUnit={directUnit}
            primaryColor={branding.primaryColor}
          />

          {isClosed && (
            <QuickEntrySection
              incident={selectedIncident}
              assignments={assignments}
              onAssignmentChange={handleAssignmentChange}
              formData={formData}
              onFormChange={handleFormChange}
              allPersonnel={personnel}
              getAssignedIds={getAssignedIds}
              dispatchedApparatus={dispatchedApparatus}
              primaryColor={branding.primaryColor}
            />
          )}

          {error && (
            <div style={styles.error}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div style={styles.footerLeft}>
            <button
              style={{
                ...styles.button,
                backgroundColor: saving ? '#999' : saveSuccess ? '#22c55e' : branding.primaryColor,
              }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : saveSuccess ? '✓ Saved' : 'Save'}
            </button>

            {isClosed && (
              <>
                <button style={styles.buttonSecondary} onClick={handlePrint}>
                  Print
                </button>
                <button style={styles.buttonSecondary} onClick={handleFullEdit}>
                  Full Edit
                </button>
              </>
            )}
          </div>

          <button
            style={{ ...styles.buttonSecondary, backgroundColor: '#f5f5f5' }}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Active indicator */}
        {isActive && (
          <div style={{ ...styles.activeIndicator, backgroundColor: '#22c55e' }} />
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '4px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    width: '100%',
    maxWidth: '800px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
  },
  header: {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logo: {
    width: '50px',
    height: '50px',
    objectFit: 'contain',
  },
  stationName: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#333',
    letterSpacing: '0.5px',
  },
  stationSubtitle: {
    fontSize: '12px',
    fontWeight: '500',
  },
  badge: {
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    backgroundColor: '#e8e8e8',
  },
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid #e0e0e0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  footerLeft: {
    display: 'flex',
    gap: '8px',
  },
  button: {
    padding: '10px 20px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    color: '#fff',
  },
  buttonSecondary: {
    padding: '10px 20px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    backgroundColor: '#fff',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    color: '#333',
  },
  error: {
    margin: '12px 0',
    padding: '10px',
    backgroundColor: '#fee',
    border: '1px solid #fcc',
    borderRadius: '4px',
    color: '#c00',
    fontSize: '13px',
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '3px',
  },
};
