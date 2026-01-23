/**
 * DetailForm - Attendance Record Form
 * 
 * Used for DETAIL category records (meetings, worknights, training, drills).
 * Simpler than RunSheetForm - no CAD data, NERIS fields, or apparatus assignments.
 * 
 * Attendance stored in incident_personnel with incident_unit_id = NULL.
 * 
 * Auth: Requires login to edit. Uses same session/audit pattern as RunSheetForm.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  getIncident, 
  updateIncident, 
  getDetailTypes, 
  getPersonnel,
  getAttendance,
  saveAttendance,
  getUserSession,
  getIncidentAuditLog
} from '../../api';
import { formatDateTimeLocal } from '../../utils/timeUtils';
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
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Audit log state
  const [auditLog, setAuditLog] = useState([]);
  const [showFullAuditLog, setShowFullAuditLog] = useState(false);
  const auditLogRef = useRef(null);
  
  // Form data (editable fields)
  const [formData, setFormData] = useState({
    detail_type: '',
    address: '',
    time_event_start: '',
    time_event_end: '',
    narrative: '',
    completed_by: null,
  });

  // Get current user session for auth and audit
  const userSession = getUserSession();
  const currentUserId = userSession?.personnel_id;
  const canEdit = userSession && userSession.is_approved;

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
          time_event_start: inc.time_event_start ? formatForInput(inc.time_event_start) : '',
          time_event_end: inc.time_event_end ? formatForInput(inc.time_event_end) : '',
          narrative: inc.narrative || '',
          completed_by: inc.completed_by || null,
        });

        // Load audit log
        try {
          const auditRes = await getIncidentAuditLog(incidentId);
          setAuditLog(auditRes.data.entries || []);
        } catch (err) {
          console.error('Failed to load audit log:', err);
          setAuditLog([]);
        }

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
  const formatForInput = (isoString) => {
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

  // Handle quick-add personnel from AttendanceGrid
  const handlePersonnelAdded = useCallback((newPerson) => {
    // Add to personnel list
    setPersonnel(prev => {
      // Check if already exists
      if (prev.find(p => p.id === newPerson.id)) {
        return prev;
      }
      return [...prev, {
        id: newPerson.id,
        first_name: newPerson.first_name,
        last_name: newPerson.last_name,
        display_name: newPerson.display_name,
        rank_order: 999,
        rank_abbreviation: null,
        active: true
      }];
    });
    // Mark as present
    setAttendees(prev => {
      if (prev.includes(newPerson.id)) return prev;
      return [...prev, newPerson.id];
    });
    setHasChanges(true);
  }, []);

  // Save all changes
  const handleSave = async () => {
    if (!canEdit) return;
    
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
        completed_by: formData.completed_by || currentUserId || null,
      };

      // Save incident fields
      await updateIncident(incidentId, updateData, currentUserId);

      // Save attendance
      await saveAttendance(incidentId, attendees, currentUserId);

      // Refresh audit log
      try {
        const auditRes = await getIncidentAuditLog(incidentId);
        setAuditLog(auditRes.data.entries || []);
      } catch (err) {
        console.error('Failed to refresh audit log:', err);
      }

      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      
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

  // Helper for audit log display
  const getAuditDisplayName = (entry) => {
    if (entry.personnel_name) return entry.personnel_name;
    return 'System';
  };

  // Format field changes for audit display
  const formatFieldChanges = (fieldsChanged) => {
    if (!fieldsChanged || typeof fieldsChanged !== 'object') return null;
    
    const entries = Object.entries(fieldsChanged);
    if (entries.length === 0) return null;
    
    return entries.map(([field, change]) => {
      const oldVal = change?.old || '(empty)';
      const newVal = change?.new || '(empty)';
      const truncate = (val, max = 30) => {
        const str = String(val);
        return str.length > max ? str.substring(0, max) + '...' : str;
      };
      return {
        field,
        old: truncate(oldVal),
        new: truncate(newVal)
      };
    });
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
      {/* Action Bar - matches RunSheetForm ActionBar style */}
      <div className="bg-dark-hover rounded px-3 py-2 mb-2 flex items-center justify-between gap-3 flex-wrap">
        {/* Left side - Back link and auth warnings */}
        <div className="flex items-center gap-3">
          <button 
            className="text-gray-400 hover:text-white text-sm"
            onClick={handleClose}
            disabled={saving}
          >
            ← Back to List
          </button>
          
          {/* Auth warnings */}
          {!userSession && (
            <span className="text-yellow-500 text-sm">⚠️ Log in to edit</span>
          )}
          {userSession && !userSession.is_approved && (
            <span className="text-yellow-500 text-sm">⚠️ Pending approval</span>
          )}
        </div>

        {/* Right side - Actions */}
        <div className="flex gap-2 items-center">
          {saveSuccess && (
            <span className="text-green-500 text-sm">✓ Saved</span>
          )}
          
          <span className="text-sm text-gray-400">
            {attendees.length} / {personnel.length} present
          </span>
          
          <button 
            className="btn btn-secondary" 
            onClick={handleClose} 
            disabled={saving}
          >
            Cancel
          </button>
          
          <button
            onClick={handleSave}
            disabled={saving || !canEdit}
            className="btn btn-secondary"
            title={!canEdit ? 'Please log in first' : ''}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          
          <button
            onClick={handleSaveAndClose}
            disabled={saving || !canEdit}
            className="btn btn-primary"
            title={!canEdit ? 'Please log in first' : ''}
          >
            {saving ? 'Saving...' : 'Save & Close'}
          </button>
        </div>
      </div>

      {/* Audit Trail - matches RunSheetForm AuditTrail style */}
      {incident?.id && auditLog.length > 0 && (
        <div 
          ref={auditLogRef}
          className="bg-dark-hover rounded px-3 py-2 mb-2 text-xs border border-gray-700"
        >
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowFullAuditLog(!showFullAuditLog)}
          >
            <div>
              <span className="mr-2">📝</span>
              Last edit: <span className="text-blue-400 font-medium">{getAuditDisplayName(auditLog[0])}</span>
              {' — '}
              <span className="text-gray-400">{auditLog[0]?.summary}</span>
              {' — '}
              <span className="text-gray-500">
                {formatDateTimeLocal(auditLog[0]?.created_at)}
              </span>
            </div>
            <span className="text-gray-500">
              {showFullAuditLog ? '▲' : '▼'} {auditLog.length} edit{auditLog.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          {showFullAuditLog && (
            <div className="mt-2 pt-2 border-t border-gray-700 max-h-96 overflow-y-auto">
              {auditLog.map((entry, idx) => {
                const fieldChanges = formatFieldChanges(entry.fields_changed);
                
                return (
                  <div 
                    key={entry.id || idx} 
                    className={`py-2 ${idx < auditLog.length - 1 ? 'border-b border-gray-700' : ''}`}
                  >
                    {/* Main row */}
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-gray-500 mr-2 text-[10px] uppercase">{entry.action}</span>
                        <span className="text-blue-400 font-medium">{getAuditDisplayName(entry)}</span>
                        {entry.summary && (
                          <span className="text-gray-400 ml-2">— {entry.summary}</span>
                        )}
                      </div>
                      <span className="text-gray-500 text-[11px] whitespace-nowrap ml-2">
                        {formatDateTimeLocal(entry.created_at)}
                      </span>
                    </div>
                    
                    {/* Field changes detail */}
                    {fieldChanges && fieldChanges.length > 0 && (
                      <div className="mt-1.5 ml-4 pl-2 border-l-2 border-gray-600">
                        {fieldChanges.map((fc, fcIdx) => (
                          <div key={fcIdx} className="text-[11px] py-0.5">
                            <span className="text-gray-500">{fc.field}:</span>
                            <span className="text-red-400 ml-1">{fc.old}</span>
                            <span className="text-gray-500 mx-1">→</span>
                            <span className="text-green-400">{fc.new}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-dark-border">
        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: '500', backgroundColor: '#6b7280', color: '#fff' }}>
          DETAIL
        </span>
        
        <h1 className="text-xl font-semibold text-white">
          {incident?.internal_incident_number || 'New Record'}
        </h1>
        
        <span className="text-gray-400">
          — {getDetailTypeDisplay()}
        </span>
        
        {hasChanges && (
          <span style={{ fontSize: '0.75rem', backgroundColor: '#ca8a04', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>
            Unsaved changes
          </span>
        )}
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
          disabled={!canEdit}
        />

        <AttendanceGrid
          personnel={personnel}
          attendees={attendees}
          onToggle={toggleAttendee}
          onPersonnelAdded={handlePersonnelAdded}
          disabled={!canEdit}
        />

        <NotesSection
          narrative={formData.narrative}
          onChange={(value) => handleChange('narrative', value)}
          disabled={!canEdit}
        />

        <OfficerFields
          completedBy={formData.completed_by}
          personnel={personnel}
          onChange={(value) => handleChange('completed_by', value)}
          disabled={!canEdit}
        />
      </div>
    </div>
  );
}
