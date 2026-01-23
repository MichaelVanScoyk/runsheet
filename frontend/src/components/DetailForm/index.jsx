/**
 * DetailForm - Attendance Record Form
 * 
 * Used for DETAIL category records (meetings, worknights, training, drills).
 * Simpler than RunSheetForm - no CAD data, NERIS fields, or apparatus assignments.
 * 
 * Attendance stored in incident_personnel with incident_unit_id = NULL.
 * 
 * Auth: Requires login to edit. Uses same session/audit pattern as RunSheetForm.
 * 
 * Supports both:
 * - New records: incidentId=null, creates record on first save
 * - Existing records: incidentId provided, loads and updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  getIncident, 
  updateIncident, 
  createAttendanceRecord,
  getDetailTypes, 
  getPersonnel,
  getAttendance,
  saveAttendance,
  getUserSession,
  getIncidentAuditLog,
  deleteIncident
} from '../../api';
import { useBranding } from '../../contexts/BrandingContext';
import { formatDateTimeLocal } from '../../utils/timeUtils';
import DetailHeader from './DetailHeader';
import AttendanceGrid from './AttendanceGrid';
import NotesSection from './NotesSection';
import OfficerFields from './OfficerFields';

export default function DetailForm({ incidentId, onClose, onSaved }) {
  const branding = useBranding();
  
  // Track if this is a new record (no incidentId provided)
  const [isNew, setIsNew] = useState(!incidentId);
  const [currentIncidentId, setCurrentIncidentId] = useState(incidentId);
  
  // Data state
  const [incident, setIncident] = useState(null);
  const [detailTypes, setDetailTypes] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [attendees, setAttendees] = useState([]); // Array of personnel IDs
  
  // UI state
  const [loading, setLoading] = useState(!!incidentId); // Only loading if editing existing
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Delete state
  const [deleteUnlocked, setDeleteUnlocked] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Audit log state
  const [auditLog, setAuditLog] = useState([]);
  const [showFullAuditLog, setShowFullAuditLog] = useState(false);
  const auditLogRef = useRef(null);
  
  // Form data (editable fields) - initialize with defaults for new records
  const getTodayDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  
  const [formData, setFormData] = useState({
    incident_date: incidentId ? '' : getTodayDate(), // Default to today for new
    detail_type: '', // REQUIRED - no default, user must select
    address: incidentId ? '' : (branding.stationShortName || 'Station 48'), // Default location for new
    time_event_start: '',
    time_event_end: '',
    narrative: '',
    completed_by: null,
  });

  // Get current user session for auth and audit
  const userSession = getUserSession();
  const currentUserId = userSession?.personnel_id;
  const canEdit = userSession && userSession.is_approved;
  const isAdmin = userSession?.role === 'ADMIN';
  const isOfficer = userSession?.role === 'OFFICER' || isAdmin;
  const canDelete = isOfficer && currentIncidentId && deleteUnlocked;

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

  // Load reference data (detail types, personnel) - always needed
  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [typesRes, personnelRes] = await Promise.all([
          getDetailTypes(),
          getPersonnel(),
        ]);
        setDetailTypes(typesRes.data || []);
        setPersonnel(personnelRes.data?.filter(p => p.active) || []);
      } catch (err) {
        console.error('Failed to load reference data:', err);
      }
    };
    loadReferenceData();
  }, []);

  // Load existing incident data (only if editing)
  useEffect(() => {
    const loadIncidentData = async () => {
      if (!incidentId) return; // New record, nothing to load
      
      try {
        setLoading(true);
        setError(null);

        const [incidentRes, attendanceRes] = await Promise.all([
          getIncident(incidentId),
          getAttendance(incidentId),
        ]);

        const inc = incidentRes.data;
        setIncident(inc);
        setAttendees(attendanceRes.data?.personnel?.map(p => p.personnel_id) || []);

        // Initialize form data from incident
        setFormData({
          incident_date: inc.incident_date || '',
          detail_type: inc.detail_type || '',
          address: inc.address || '',
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

    loadIncidentData();
  }, [incidentId]);

  // Format ISO datetime to datetime-local input format (local time)
  const formatForInput = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    // Format as YYYY-MM-DDTHH:MM in LOCAL time for datetime-local input
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
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

  // Validation - check required fields
  const validateForm = () => {
    const errors = [];
    
    if (!formData.detail_type) {
      errors.push('Event Type is required');
    }
    if (!formData.address || !formData.address.trim()) {
      errors.push('Location is required');
    }
    if (!formData.narrative || !formData.narrative.trim()) {
      errors.push('Notes are required');
    }
    
    return errors;
  };

  // Save all changes
  const handleSave = async () => {
    if (!canEdit) return;
    
    // Validate required fields
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setError(validationErrors.join('. '));
      return;
    }
    
    try {
      setSaving(true);
      setError(null);

      let targetIncidentId = currentIncidentId;

      // If new record, create it first
      if (isNew) {
        const createData = {
          detail_type: formData.detail_type,
          incident_date: formData.incident_date,
          address: formData.address || null,
          time_event_start: formData.time_event_start ? new Date(formData.time_event_start).toISOString() : null,
          time_event_end: formData.time_event_end ? new Date(formData.time_event_end).toISOString() : null,
          narrative: formData.narrative || null,
          completed_by: formData.completed_by || currentUserId || null,
        };
        
        const createRes = await createAttendanceRecord(createData);
        targetIncidentId = createRes.data.id;
        
        // Update state to reflect we're now editing an existing record
        setCurrentIncidentId(targetIncidentId);
        setIsNew(false);
        setIncident({ 
          id: targetIncidentId, 
          internal_incident_number: createRes.data.internal_incident_number,
          ...createData 
        });
      } else {
        // Update existing record
        const updateData = {
          incident_date: formData.incident_date || null,
          detail_type: formData.detail_type || null,
          address: formData.address || null,
          time_event_start: formData.time_event_start ? new Date(formData.time_event_start).toISOString() : null,
          time_event_end: formData.time_event_end ? new Date(formData.time_event_end).toISOString() : null,
          narrative: formData.narrative || null,
          completed_by: formData.completed_by || currentUserId || null,
        };

        await updateIncident(targetIncidentId, updateData, currentUserId);
      }

      // Save attendance (only if we have attendees)
      if (attendees.length > 0) {
        await saveAttendance(targetIncidentId, attendees, currentUserId);
      }

      // Refresh audit log (only for existing records)
      if (targetIncidentId) {
        try {
          const auditRes = await getIncidentAuditLog(targetIncidentId);
          setAuditLog(auditRes.data.entries || []);
        } catch (err) {
          console.error('Failed to refresh audit log:', err);
        }
      }

      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      
      if (onSaved) {
        onSaved();
      }

    } catch (err) {
      console.error('Failed to save:', err);
      setError('Failed to save changes: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!currentIncidentId || !canDelete) return;
    setDeleting(true);
    try {
      await deleteIncident(currentIncidentId);
      setShowDeleteConfirm(false);
      if (onClose) onClose();
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDeleting(false);
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
    if (!formData.detail_type) return 'New Attendance Record';
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

  if (error && !incident && !isNew) {
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
          
          {/* Print button - only for saved records */}
          {!isNew && currentIncidentId && (
            <button
              onClick={() => window.open(`/api/reports/pdf/rollcall/${currentIncidentId}`, '_blank')}
              className="btn btn-secondary"
              title="Print attendance report"
            >
              🖨️ Print
            </button>
          )}
          
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
          
          {/* Delete button - only visible when unlocked and not a new record */}
          {canDelete && !isNew && (
            <button 
              className="btn btn-danger" 
              onClick={() => setShowDeleteConfirm(true)} 
              disabled={saving || deleting}
              title="Permanently delete this record"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Audit Trail - matches RunSheetForm AuditTrail style - only show for existing records */}
      {currentIncidentId && auditLog.length > 0 && (
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
        
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          {isNew ? 'New Record' : (incident?.internal_incident_number || 'Record')}
          
          {/* Lock icon for officers/admins to unlock delete - only for existing records */}
          {!isNew && currentIncidentId && isOfficer && (
            <button
              type="button"
              onClick={() => setDeleteUnlocked(!deleteUnlocked)}
              className="text-sm hover:text-yellow-400 transition-colors"
              title={deleteUnlocked ? "Lock (hide delete)" : "Officer: Click to unlock delete"}
            >
              {deleteUnlocked ? '🔓' : '🔒'}
            </button>
          )}
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
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Record?</h3>
            <p className="text-gray-700 mb-4">
              Are you sure you want to permanently delete <strong>{incident?.internal_incident_number}</strong>?
            </p>
            <p className="text-red-600 text-sm mb-4 font-medium">
              ⚠️ This action is unrecoverable. The record and all attendance data will be permanently removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
