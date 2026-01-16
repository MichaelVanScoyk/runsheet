import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getApparatus, getPersonnel, updateIncident, getIncident } from '../../api';
import IncidentTabs from './IncidentTabs';
import IncidentDisplay from './IncidentDisplay';
import StationDirectSection from './StationDirectSection';
import QuickEntrySection from './QuickEntrySection';

/**
 * Incident Hub Modal - Kiosk-style incident data entry.
 * Matches the branding style of the Monthly Report template.
 * 
 * Early Entry Mode: When enabled, shows unit assignments and narrative fields
 * even before CAD CLEAR arrives. This allows personnel to start documentation
 * during long incidents without waiting for closeout.
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
  
  // Early entry mode - allows editing before CAD CLEAR
  const [earlyEntryEnabled, setEarlyEntryEnabled] = useState(false);
  const [earlyEntryLoading, setEarlyEntryLoading] = useState(true);
  
  const [branding, setBranding] = useState({
    logo: null,
    stationName: '',
    stationNumber: '',
    primaryColor: '#016a2b',
    secondaryColor: '#eeee01',
  });
  
  const [assignments, setAssignments] = useState({});
  const [formData, setFormData] = useState({
    situation_found: '',
    services_provided: '',
    narrative: '',
    officer_in_charge: '',
    completed_by: '',
  });
  
  // Manual save state (for Save button)
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);
  
  // Auto-save state
  const [autoSaveStatus, setAutoSaveStatus] = useState(null); // null, 'saving', 'saved', 'error'
  const autoSaveTimeoutRef = useRef(null);
  const pendingChangesRef = useRef({ assignments: null, formData: null });

  // ==========================================================================
  // AUTO-SAVE LOGIC
  // Optimistic save: updates local state immediately, saves in background
  // Does NOT refresh form from API response to avoid interrupting user input
  // ==========================================================================
  
  const performAutoSave = useCallback(async () => {
    if (!selectedIncident) return;
    
    const { assignments: pendingAssignments, formData: pendingFormData } = pendingChangesRef.current;
    if (!pendingAssignments && !pendingFormData) return;
    
    setAutoSaveStatus('saving');
    
    try {
      // Save assignments if changed
      if (pendingAssignments) {
        const assignmentPayload = {};
        Object.entries(pendingAssignments).forEach(([unitKey, personIds]) => {
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
      }
      
      // Save form data if changed (narrative fields + officer fields)
      if (pendingFormData) {
        const updatePayload = {};
        if (pendingFormData.situation_found !== undefined) updatePayload.situation_found = pendingFormData.situation_found;
        if (pendingFormData.services_provided !== undefined) updatePayload.services_provided = pendingFormData.services_provided;
        if (pendingFormData.narrative !== undefined) updatePayload.narrative = pendingFormData.narrative;
        if (pendingFormData.officer_in_charge !== undefined) updatePayload.officer_in_charge = pendingFormData.officer_in_charge || null;
        if (pendingFormData.completed_by !== undefined) updatePayload.completed_by = pendingFormData.completed_by || null;

        if (Object.keys(updatePayload).length > 0) {
          await updateIncident(selectedIncident.id, updatePayload);
        }
      }
      
      // Clear pending changes
      pendingChangesRef.current = { assignments: null, formData: null };
      
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus(null), 2000);
      
      // Silently refetch incident list (for badge counts, etc.) but DON'T update form state
      if (refetch) {
        refetch().catch(() => {}); // Ignore errors
      }
      
    } catch (err) {
      console.error('Auto-save failed:', err);
      setAutoSaveStatus('error');
      setTimeout(() => setAutoSaveStatus(null), 3000);
    }
  }, [selectedIncident, apparatus, refetch]);

  const scheduleAutoSave = useCallback(() => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Schedule new save after 2 seconds of inactivity
    autoSaveTimeoutRef.current = setTimeout(() => {
      performAutoSave();
    }, 2000);
  }, [performAutoSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // ==========================================================================
  // LOAD EARLY ENTRY SETTING
  // ==========================================================================
  
  useEffect(() => {
    async function loadEarlyEntrySetting() {
      try {
        const res = await fetch('/api/settings/incident_modal/enable_early_entry');
        if (res.ok) {
          const data = await res.json();
          setEarlyEntryEnabled(data.value === true || data.value === 'true');
        }
      } catch (err) {
        console.error('Failed to load early entry setting:', err);
      } finally {
        setEarlyEntryLoading(false);
      }
    }
    loadEarlyEntrySetting();
  }, []);

  const toggleEarlyEntry = async () => {
    const newValue = !earlyEntryEnabled;
    setEarlyEntryEnabled(newValue);
    
    try {
      await fetch('/api/settings/incident_modal/enable_early_entry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue.toString() }),
      });
    } catch (err) {
      console.error('Failed to save early entry setting:', err);
      // Revert on error
      setEarlyEntryEnabled(!newValue);
    }
  };

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
          officer_in_charge: inc.officer_in_charge || '',
          completed_by: inc.completed_by || '',
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

  // Assignment change with auto-save
  const handleAssignmentChange = useCallback((unitDesignator, newList) => {
    setAssignments(prev => {
      const updated = {
        ...prev,
        [unitDesignator]: newList,
      };
      // Mark assignments as pending for auto-save
      pendingChangesRef.current.assignments = updated;
      return updated;
    });
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  // Form change with auto-save
  const handleFormChange = useCallback((field, value) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [field]: value,
      };
      // Mark form data as pending for auto-save
      pendingChangesRef.current.formData = updated;
      return updated;
    });
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const stationUnit = useMemo(() => 
    apparatus.find(a => a.unit_category === 'STATION'),
    [apparatus]
  );
  
  const directUnit = useMemo(() => 
    apparatus.find(a => a.unit_category === 'DIRECT'),
    [apparatus]
  );

  // Dispatched apparatus (from CAD data OR units with assignments)
  const dispatchedApparatus = useMemo(() => {
    const result = new Set();
    
    // Add units from CAD data
    if (selectedIncident?.cad_units) {
      const dispatchedIds = selectedIncident.cad_units
        .filter(u => !u.is_mutual_aid)
        .map(u => u.unit_id);
      
      apparatus.forEach(a => {
        if (dispatchedIds.includes(a.unit_designator) ||
            dispatchedIds.includes(a.cad_unit_id) ||
            (a.cad_unit_aliases || []).some(alias => dispatchedIds.includes(alias))) {
          result.add(a);
        }
      });
    }
    
    // Also add units that have personnel assignments (for manual incidents)
    if (selectedIncident?.personnel_assignments) {
      Object.entries(selectedIncident.personnel_assignments).forEach(([unitKey, slots]) => {
        // Check if any personnel assigned
        const hasAssignments = slots.some(id => id !== null);
        if (hasAssignments) {
          const unit = apparatus.find(a => a.unit_designator === unitKey);
          // Only add APPARATUS units (not STATION/DIRECT)
          if (unit && unit.unit_category !== 'STATION' && unit.unit_category !== 'DIRECT') {
            result.add(unit);
          }
        }
      });
    }
    
    return Array.from(result);
  }, [selectedIncident, apparatus]);

  // All apparatus with slots (for early entry mode)
  const allApparatusWithSlots = useMemo(() => {
    const getSlotCount = (unit) => (unit.has_driver ? 1 : 0) + (unit.has_officer ? 1 : 0) + (unit.ff_slots || 0);
    return apparatus.filter(a => 
      (a.unit_category === 'APPARATUS' || !a.unit_category) && 
      getSlotCount(a) > 0
    );
  }, [apparatus]);

  // Manual save handler (Save button)
  const handleSave = async () => {
    if (!selectedIncident) return;

    // Clear any pending auto-save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

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

      // Save narrative fields + officer fields (allowed in early entry mode OR when closed)
      if (isClosed || earlyEntryEnabled) {
        const updatePayload = {};
        if (formData.situation_found) updatePayload.situation_found = formData.situation_found;
        if (formData.services_provided) updatePayload.services_provided = formData.services_provided;
        if (formData.narrative) updatePayload.narrative = formData.narrative;
        // Officer fields - always include (even if empty to allow clearing)
        updatePayload.officer_in_charge = formData.officer_in_charge || null;
        updatePayload.completed_by = formData.completed_by || null;

        if (Object.keys(updatePayload).length > 0) {
          await updateIncident(selectedIncident.id, updatePayload);
        }
      }

      // Clear pending changes
      pendingChangesRef.current = { assignments: null, formData: null };

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
  
  // Show QuickEntrySection if: closed OR (open AND early entry enabled)
  const showQuickEntry = isClosed || (isActive && earlyEntryEnabled);
  
  // Use all apparatus when early entry is enabled and incident is OPEN
  // Use dispatched apparatus when closed (real CAD data available)
  const apparatusForQuickEntry = (isActive && earlyEntryEnabled) ? allApparatusWithSlots : dispatchedApparatus;

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
          
          <div style={styles.headerRight}>
            {/* Auto-save status indicator */}
            {autoSaveStatus && (
              <div style={{
                fontSize: '11px',
                color: autoSaveStatus === 'error' ? '#dc2626' : '#666',
                marginRight: '12px',
              }}>
                {autoSaveStatus === 'saving' && '⏳ Saving...'}
                {autoSaveStatus === 'saved' && '✓ Saved'}
                {autoSaveStatus === 'error' && '⚠ Save failed'}
              </div>
            )}
            
            {incidents.length > 1 && (
              <div style={{ ...styles.badge, backgroundColor: branding.primaryColor }}>
                {incidents.length} Incidents
              </div>
            )}
          </div>
        </div>

        {/* Accent line under header - like the report */}
        <div style={{ height: '3px', backgroundColor: branding.primaryColor }} />

        {/* Early Entry Toggle - only show when incident is OPEN */}
        {isActive && !earlyEntryLoading && (
          <div style={styles.earlyEntryBar}>
            <label style={styles.earlyEntryToggle}>
              <input
                type="checkbox"
                checked={earlyEntryEnabled}
                onChange={toggleEarlyEntry}
                style={{ marginRight: '8px' }}
              />
              <span style={styles.earlyEntryLabel}>
                Enable Narrative and Unit Assignments
              </span>
              <span style={styles.earlyEntrySubtext}>
                (Don't wait for closeout)
              </span>
            </label>
          </div>
        )}

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

          {showQuickEntry && (
            <QuickEntrySection
              incident={selectedIncident}
              assignments={assignments}
              onAssignmentChange={handleAssignmentChange}
              formData={formData}
              onFormChange={handleFormChange}
              allPersonnel={personnel}
              getAssignedIds={getAssignedIds}
              dispatchedApparatus={apparatusForQuickEntry}
              primaryColor={branding.primaryColor}
              showNarrative={true}
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
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
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
  earlyEntryBar: {
    padding: '8px 20px',
    backgroundColor: '#fef3c7',
    borderBottom: '1px solid #fcd34d',
  },
  earlyEntryToggle: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    fontSize: '13px',
  },
  earlyEntryLabel: {
    fontWeight: '600',
    color: '#92400e',
  },
  earlyEntrySubtext: {
    marginLeft: '6px',
    color: '#a16207',
    fontStyle: 'italic',
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
