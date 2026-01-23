/**
 * DetailForm - Attendance Record Form
 * 
 * Used for DETAIL category records (meetings, worknights, training, drills).
 * Simpler than RunSheetForm - no CAD data, NERIS fields, or apparatus assignments.
 * 
 * Attendance stored in incident_personnel with incident_unit_id = NULL.
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  getIncident, 
  updateIncident, 
  getDetailTypes, 
  getPersonnel,
  getAttendance,
  saveAttendance,
  getUserSession
} from '../../api';
import DetailHeader from './DetailHeader';
import AttendanceGrid from './AttendanceGrid';
import NotesSection from './NotesSection';
import OfficerFields from './OfficerFields';

export default function DetailForm({ incidentId, onClose, onSaved }) {
  // Data state
  const [incident, setIncident] = useState(null);
  const [detailTypes, setDetailTypes] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [attendees, setAttendees] = useState([]); // Array of personnel IDs
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Form data (editable fields)
  const [formData, setFormData] = useState({
    detail_type: '',
    address: '',
    time_event_start: '',
    time_event_end: '',
    narrative: '',
    completed_by: null,
  });

  // Get current user for audit
  const userSession = getUserSession();
  const currentUserId = userSession?.personnel_id;

  // Load all data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [incidentRes, typesRes, personnelRes, attendanceRes] = await Promise.all([
          getIncident(incidentId),
          getDetailTypes(),
          getPersonnel(),
          getAttendance(incidentId),
        ]);

        const inc = incidentRes.data;
        setIncident(inc);
        setDetailTypes(typesRes.data || []);
        setPersonnel(personnelRes.data?.filter(p => p.active) || []);
        setAttendees(attendanceRes.data?.personnel?.map(p => p.personnel_id) || []);

        // Initialize form data from incident
        setFormData({
          detail_type: inc.detail_type || '',
          address: inc.address || 'Station 48',
          time_event_start: inc.time_event_start ? formatDateTimeLocal(inc.time_event_start) : '',
          time_event_end: inc.time_event_end ? formatDateTimeLocal(inc.time_event_end) : '',
          narrative: inc.narrative || '',
          completed_by: inc.completed_by || null,
        });

      } catch (err) {
        console.error('Failed to load detail form data:', err);
        setError('Failed to load record data');
      } finally {
        setLoading(false);
      }
    };

    if (incidentId) {
      loadData();
    }
  }, [incidentId]);

  // Format ISO datetime to datetime-local input format
  const formatDateTimeLocal = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    // Format as YYYY-MM-DDTHH:MM for datetime-local input
    return date.toISOString().slice(0, 16);
  };

  // Handle form field changes
  const handleChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }, []);

  // Handle attendance toggle
  const toggleAttendee = useCallback((personnelId) => {
    setAttendees(prev => {
      if (prev.includes(personnelId)) {
        return prev.filter(id => id !== personnelId);
      } else {
        return [...prev, personnelId];
      }
    });
    setHasChanges(true);
  }, []);

  // Mark all present
  const markAllPresent = useCallback(() => {
    setAttendees(personnel.map(p => p.id));
    setHasChanges(true);
  }, [personnel]);

  // Clear all
  const clearAll = useCallback(() => {
    setAttendees([]);
    setHasChanges(true);
  }, []);

  // Save all changes
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Build update payload - convert datetime-local to ISO
      const updateData = {
        detail_type: formData.detail_type || null,
        address: formData.address || null,
        time_event_start: formData.time_event_start ? new Date(formData.time_event_start).toISOString() : null,
        time_event_end: formData.time_event_end ? new Date(formData.time_event_end).toISOString() : null,
        narrative: formData.narrative || null,
        completed_by: formData.completed_by || null,
      };

      // Save incident fields
      await updateIncident(incidentId, updateData, currentUserId);

      // Save attendance
      await saveAttendance(incidentId, attendees, currentUserId);

      setHasChanges(false);
      
      if (onSaved) {
        onSaved();
      }

    } catch (err) {
      console.error('Failed to save:', err);
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Save and close
  const handleSaveAndClose = async () => {
    await handleSave();
    if (!error) {
      onClose();
    }
  };

  // Handle close with unsaved changes warning
  const handleClose = () => {
    if (hasChanges) {
      if (window.confirm('You have unsaved changes. Discard them?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Get detail type display name
  const getDetailTypeDisplay = () => {
    if (!formData.detail_type) return 'Attendance Record';
    const dt = detailTypes.find(t => t.code === formData.detail_type);
    return dt?.display_name || formData.detail_type;
  };

  if (loading) {
    return (
      <div className="bg-dark-bg rounded-lg p-6 max-w-4xl mx-auto">
        <div className="text-center text-gray-400 py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          Loading...
        </div>
      </div>
    );
  }

  if (error && !incident) {
    return (
      <div className="bg-dark-bg rounded-lg p-6 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={onClose} className="btn btn-secondary">Back to Incidents</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-bg rounded-lg p-4 max-w-4xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-dark-border">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleClose}
            className="btn btn-secondary btn-sm"
            title="Back to Incidents"
          >
            ← Back
          </button>
          
          <span className="px-2 py-1 rounded text-sm font-medium bg-purple-600/30 text-purple-300 border border-purple-500">
            DETAIL
          </span>
          
          <h1 className="text-xl font-semibold text-white">
            {incident?.internal_incident_number || 'New Record'}
          </h1>
          
          <span className="text-gray-400">
            — {getDetailTypeDisplay()}
          </span>
          
          {hasChanges && (
            <span className="text-xs text-yellow-400 bg-yellow-900/30 px-2 py-1 rounded">
              Unsaved changes
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">
            {attendees.length} / {personnel.length} present
          </span>
          
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="btn btn-secondary"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          
          <button
            onClick={handleSaveAndClose}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? 'Saving...' : 'Save & Close'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-600 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Form content */}
      <div className="space-y-4">
        <DetailHeader 
          formData={formData}
          detailTypes={detailTypes}
          incidentDate={incident?.incident_date}
          onChange={handleChange}
        />

        <AttendanceGrid
          personnel={personnel}
          attendees={attendees}
          onToggle={toggleAttendee}
          onMarkAll={markAllPresent}
          onClearAll={clearAll}
        />

        <NotesSection
          narrative={formData.narrative}
          onChange={(value) => handleChange('narrative', value)}
        />

        <OfficerFields
          completedBy={formData.completed_by}
          personnel={personnel}
          onChange={(value) => handleChange('completed_by', value)}
        />
      </div>
    </div>
  );
}
