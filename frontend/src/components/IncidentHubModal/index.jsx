import { useState, useEffect, useCallback, useMemo } from 'react';
import { getApparatus, getPersonnel, updateIncident, getIncident } from '../../api';
import IncidentTabs from './IncidentTabs';
import IncidentDisplay from './IncidentDisplay';
import StationDirectSection from './StationDirectSection';
import QuickEntrySection from './QuickEntrySection';
import './IncidentHubModal.css';

/**
 * Incident Hub Modal - Kiosk-style incident data entry.
 * 
 * Provides a simplified interface for entering personnel assignments
 * and basic narrative fields during and immediately after incidents.
 * No authentication required (like paper).
 * 
 * Props:
 * - incidents: Array of qualifying incidents
 * - initialIncidentId: ID of incident to select initially (optional)
 * - onClose: Called when modal is closed
 * - onNavigateToEdit: Called when Full Edit button is clicked
 * - refetch: Function to refresh incident data
 */
export default function IncidentHubModal({
  incidents,
  initialIncidentId,
  onClose,
  onNavigateToEdit,
  refetch,
}) {
  // Selected incident
  const [selectedId, setSelectedId] = useState(initialIncidentId || incidents[0]?.id);
  const [selectedIncident, setSelectedIncident] = useState(null);
  
  // Reference data
  const [apparatus, setApparatus] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [loadingRef, setLoadingRef] = useState(true);
  
  // Branding
  const [branding, setBranding] = useState({
    logo: null,
    stationName: '',
    stationNumber: '',
    primaryColor: '#e94560',
    secondaryColor: '#0f3460',
  });
  
  // Form state
  const [assignments, setAssignments] = useState({});
  const [formData, setFormData] = useState({
    situation_found: '',
    services_provided: '',
    narrative: '',
  });
  
  // UI state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Load branding from settings
  useEffect(() => {
    async function loadBranding() {
      try {
        // Load all branding in parallel
        const [logoRes, stationRes, primaryRes, secondaryRes] = await Promise.allSettled([
          fetch('/api/settings/branding/logo'),
          fetch('/api/settings'),
          fetch('/api/settings/branding/primary_color'),
          fetch('/api/settings/branding/secondary_color'),
        ]);
        
        const newBranding = { ...branding };
        
        // Logo
        if (logoRes.status === 'fulfilled' && logoRes.value.ok) {
          const logoData = await logoRes.value.json();
          if (logoData.has_logo && logoData.data && logoData.mime_type) {
            newBranding.logo = `data:${logoData.mime_type};base64,${logoData.data}`;
          }
        }
        
        // Station settings
        if (stationRes.status === 'fulfilled' && stationRes.value.ok) {
          const settings = await stationRes.value.json();
          const stationSettings = settings.station || [];
          const nameEntry = stationSettings.find(s => s.key === 'name');
          const numberEntry = stationSettings.find(s => s.key === 'station_number');
          if (nameEntry) newBranding.stationName = nameEntry.raw_value || nameEntry.value || '';
          if (numberEntry) newBranding.stationNumber = numberEntry.raw_value || numberEntry.value || '';
        }
        
        // Colors
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

  // Load reference data once
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

  // Load full incident data when selection changes
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

        // Initialize assignments from incident
        const newAssignments = {};
        apparatus.forEach(a => {
          newAssignments[a.unit_designator] = [];
        });

        // Merge existing assignments
        if (inc.personnel_assignments) {
          Object.entries(inc.personnel_assignments).forEach(([unitKey, slots]) => {
            newAssignments[unitKey] = slots.filter(id => id !== null);
          });
        }
        setAssignments(newAssignments);

        // Initialize form data
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

  // Update selection when incidents list changes (new dispatch)
  useEffect(() => {
    if (incidents.length > 0 && !incidents.find(i => i.id === selectedId)) {
      // Current selection no longer in list, select first
      setSelectedId(incidents[0].id);
    } else if (incidents.length === 0) {
      setSelectedId(null);
      setSelectedIncident(null);
    }
  }, [incidents, selectedId]);

  // Get assigned IDs across all units (for depletion)
  const getAssignedIds = useCallback(() => {
    const assigned = new Set();
    Object.values(assignments).forEach(slots => {
      slots.forEach(id => {
        if (id) assigned.add(id);
      });
    });
    return assigned;
  }, [assignments]);

  // Handle assignment changes
  const handleAssignmentChange = useCallback((unitDesignator, newList) => {
    setAssignments(prev => ({
      ...prev,
      [unitDesignator]: newList,
    }));
  }, []);

  // Handle form field changes
  const handleFormChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  // Find Station and Direct units
  const stationUnit = useMemo(() => 
    apparatus.find(a => a.unit_category === 'STATION'),
    [apparatus]
  );
  
  const directUnit = useMemo(() => 
    apparatus.find(a => a.unit_category === 'DIRECT'),
    [apparatus]
  );

  // Get apparatus that were dispatched to this incident
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

  // Save handler
  const handleSave = async () => {
    if (!selectedIncident) return;

    setSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      // Build assignments payload - convert arrays to the expected format
      const assignmentPayload = {};
      Object.entries(assignments).forEach(([unitKey, personIds]) => {
        const unit = apparatus.find(a => a.unit_designator === unitKey);
        if (unit && (unit.unit_category === 'STATION' || unit.unit_category === 'DIRECT')) {
          // Virtual units: just the array of IDs
          assignmentPayload[unitKey] = personIds;
        } else {
          // Apparatus units: array with null slots
          const slots = [null, null, null, null, null, null];
          personIds.forEach((id, idx) => {
            if (idx < 6) slots[idx] = id;
          });
          assignmentPayload[unitKey] = slots;
        }
      });

      // Save assignments
      await fetch(`/api/incidents/${selectedIncident.id}/assignments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: assignmentPayload }),
      });

      // Save form data (only if CLOSED and fields have content)
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

      // Refresh data
      if (refetch) {
        await refetch();
      }

      // Reload incident to get updated data
      const res = await getIncident(selectedIncident.id);
      setSelectedIncident(res.data);

    } catch (err) {
      console.error('Failed to save:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Print handler - direct to PDF
  const handlePrint = () => {
    if (!selectedIncident) return;
    window.open(`/api/reports/pdf/incident/${selectedIncident.id}`, '_blank');
  };

  // Full Edit handler
  const handleFullEdit = () => {
    if (!selectedIncident || !onNavigateToEdit) return;
    onNavigateToEdit(selectedIncident.id);
  };

  // Tab close handler
  const handleTabClose = (incidentId) => {
    // Just remove from local view, doesn't affect the incident
    if (incidents.length === 1) {
      // Last tab - close the modal
      onClose();
    } else {
      // Switch to another tab if closing selected
      if (incidentId === selectedId) {
        const remaining = incidents.filter(i => i.id !== incidentId);
        setSelectedId(remaining[0]?.id);
      }
    }
  };

  const isActive = selectedIncident?.status === 'OPEN';
  const isClosed = selectedIncident?.status === 'CLOSED';

  if (loadingRef) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-dark-card rounded-lg p-8 text-center">
          <div className="text-white">Loading...</div>
        </div>
      </div>
    );
  }

  if (incidents.length === 0) {
    return null; // No qualifying incidents
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-dark-bg rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ 
          border: `2px solid ${branding.secondaryColor}`,
        }}
      >
        {/* Header with branding */}
        <div 
          className="px-6 py-3 flex items-center justify-between"
          style={{ 
            background: `linear-gradient(135deg, ${branding.secondaryColor} 0%, ${branding.primaryColor}22 100%)`,
            borderBottom: `1px solid ${branding.secondaryColor}`,
          }}
        >
          <div className="flex items-center gap-3">
            {/* Logo or placeholder */}
            {branding.logo ? (
              <img 
                src={branding.logo} 
                alt="Department Logo" 
                style={{
                  width: '48px',
                  height: '48px',
                  minWidth: '48px',
                  minHeight: '48px',
                  maxWidth: '48px',
                  maxHeight: '48px',
                  objectFit: 'contain',
                  borderRadius: '4px',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div 
                className="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl"
                style={{ 
                  backgroundColor: branding.primaryColor,
                  color: '#fff',
                }}
              >
                {branding.stationNumber || '48'}
              </div>
            )}
            <div>
              <div className="text-white font-semibold text-lg">
                {branding.stationName || 'FIRE DEPARTMENT'}
              </div>
              {branding.stationNumber && (
                <div className="text-gray-400 text-sm">
                  Station {branding.stationNumber}
                </div>
              )}
            </div>
          </div>
          
          {/* Incident count badge */}
          {incidents.length > 1 && (
            <div 
              className="px-3 py-1 rounded-full text-sm font-medium"
              style={{ 
                backgroundColor: branding.primaryColor,
                color: '#fff',
              }}
            >
              {incidents.length} Incidents
            </div>
          )}
        </div>

        {/* Tabs (if multiple incidents) */}
        <IncidentTabs
          incidents={incidents}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onClose={handleTabClose}
          primaryColor={branding.primaryColor}
        />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Incident Display */}
          <IncidentDisplay 
            incident={selectedIncident} 
            primaryColor={branding.primaryColor}
          />

          {/* Station / Direct Section (always available) */}
          <StationDirectSection
            assignments={assignments}
            onAssignmentChange={handleAssignmentChange}
            allPersonnel={personnel}
            getAssignedIds={getAssignedIds}
            stationUnit={stationUnit}
            directUnit={directUnit}
            primaryColor={branding.primaryColor}
          />

          {/* Quick Entry Section (only when CLOSED) */}
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

          {/* Error message */}
          {error && (
            <div className="mx-6 mb-4 p-3 bg-red-500/20 border border-red-500 rounded text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer with buttons */}
        <div 
          className="px-6 py-4 flex items-center justify-between"
          style={{ 
            backgroundColor: branding.secondaryColor + '33',
            borderTop: `1px solid ${branding.secondaryColor}`,
          }}
        >
          <div className="flex items-center gap-3">
            {/* Print button (only when CLOSED) */}
            {isClosed && (
              <button
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded
                           flex items-center gap-2 transition-colors"
                onClick={handlePrint}
              >
                🖨️ Print
              </button>
            )}

            {/* Save button */}
            <button
              className="px-4 py-2 rounded flex items-center gap-2 transition-colors"
              style={{
                backgroundColor: saving 
                  ? '#666' 
                  : saveSuccess 
                    ? '#22c55e' 
                    : branding.primaryColor,
                color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '💾 Saving...' : saveSuccess ? '✓ Saved!' : '💾 Save'}
            </button>

            {/* Full Edit button (only when CLOSED) */}
            {isClosed && (
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded
                           flex items-center gap-2 transition-colors"
                onClick={handleFullEdit}
              >
                📋 Full Edit
              </button>
            )}
          </div>

          {/* Close button */}
          <button
            className="px-4 py-2 rounded transition-colors"
            style={{
              backgroundColor: branding.secondaryColor,
              color: '#fff',
            }}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Active indicator overlay */}
        {isActive && (
          <div 
            className="absolute top-0 left-0 right-0 h-1 animate-pulse"
            style={{ backgroundColor: '#22c55e' }}
          />
        )}
      </div>
    </div>
  );
}
