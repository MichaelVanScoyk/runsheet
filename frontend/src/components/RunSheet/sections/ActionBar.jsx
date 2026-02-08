import { useState, useEffect, useCallback } from 'react';
import { useRunSheet } from '../RunSheetContext';
import { getAdjacentIncidents, deleteIncident, checkDuplicateStatus, duplicateIncident } from '../../../api';

export default function ActionBar() {
  const { 
    incident, 
    formData, 
    setFormData,
    userSession, 
    saving,
    saveSuccess,
    restoreLoading,
    onClose, 
    onNavigate,
    handleCloseIncident, 
    handleSave,
    setShowCadModal,
    setShowComCatModal,
    handleRestorePreview,
    unlockedFields,
  } = useRunSheet();
  
  const [modelTrainedAt, setModelTrainedAt] = useState(null);
  const [adjacentIds, setAdjacentIds] = useState({ newer_id: null, older_id: null });
  const [navLoading, setNavLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Duplicate feature state
  const [duplicateEnabled, setDuplicateEnabled] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [duplicateTarget, setDuplicateTarget] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState(null);
  
  const hasCADData = incident && (formData.cad_raw_dispatch || formData.cad_raw_clear);
  const hasEventComments = formData.cad_event_comments?.comments?.length > 0;
  const isFireIncident = formData.call_category === 'FIRE';
  const isAdmin = userSession?.role === 'ADMIN';
  const canDelete = isAdmin && incident?.id && unlockedFields['cad_event_number'];
  const canDuplicate = isAdmin && incident?.id && unlockedFields['cad_event_number'] && duplicateEnabled;
  
  // Fetch adjacent incident IDs for navigation (once per incident)
  useEffect(() => {
    if (incident?.id && userSession) {
      getAdjacentIncidents(incident.id)
        .then(res => {
          setAdjacentIds({
            newer_id: res.data.newer_id,
            older_id: res.data.older_id
          });
        })
        .catch(err => {
          console.error('Failed to fetch adjacent incidents:', err);
        });
    }
  }, [incident?.id]);
  
  // Check if duplicate feature is enabled
  useEffect(() => {
    if (incident?.id && isAdmin) {
      checkDuplicateStatus(incident.id)
        .then(res => {
          setDuplicateEnabled(res.data.feature_enabled);
          setDuplicateInfo(res.data);
        })
        .catch(err => {
          console.error('Failed to check duplicate status:', err);
          setDuplicateEnabled(false);
        });
    }
  }, [incident?.id, isAdmin]);
  
  // Fetch model trained timestamp for "trained" status (FIRE only)
  const fetchModelStats = useCallback(() => {
    if (isFireIncident && hasEventComments) {
      fetch('/api/comcat/stats', { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.last_trained_at) {
            setModelTrainedAt(data.last_trained_at);
          }
        })
        .catch(() => {});
    }
  }, [isFireIncident, hasEventComments]);
  
  useEffect(() => {
    fetchModelStats();
  }, [fetchModelStats]);
  
  // Listen for comcat-saved event to refresh cad_event_comments
  useEffect(() => {
    const handleComCatSaved = async (e) => {
      if (e.detail?.incidentId === incident?.id) {
        // Refetch incident to get updated cad_event_comments
        try {
          const res = await fetch(`/api/incidents/${incident.id}`, { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            setFormData(prev => ({
              ...prev,
              cad_event_comments: data.cad_event_comments
            }));
          }
        } catch (err) {
          console.error('Failed to refresh after ComCat save:', err);
        }
        fetchModelStats();
      }
    };
    
    window.addEventListener('comcat-saved', handleComCatSaved);
    return () => window.removeEventListener('comcat-saved', handleComCatSaved);
  }, [incident?.id, setFormData, fetchModelStats]);
  
  // Calculate ComCat status (FIRE incidents only)
  const getComCatStatus = () => {
    if (!isFireIncident) return null;
    
    const comments = formData.cad_event_comments?.comments || [];
    if (!comments.length) return null;
    
    const relevantComments = comments.filter(c => !c.is_noise);
    if (!relevantComments.length) return null;
    
    const officerReviewedAt = formData.cad_event_comments?.officer_reviewed_at;
    
    // Status is based on whether officer clicked "Mark Reviewed"
    // NOT on whether every comment was manually corrected
    if (!officerReviewedAt) {
      return 'pending';  // Officer hasn't reviewed yet
    }
    
    // Officer reviewed - check if model has been trained since
    if (modelTrainedAt && modelTrainedAt > officerReviewedAt) {
      return 'trained';  // Reviewed AND model includes these corrections
    }
    
    return 'validated';  // Reviewed, waiting for retrain
  };
  
  const comcatStatus = hasEventComments ? getComCatStatus() : null;
  
  // Status dot component
  const StatusDot = ({ status }) => {
    if (!status) return null;
    
    const dotStyle = {
      display: 'inline-block',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      marginLeft: '4px'
    };
    
    const colors = {
      trained: '#8b5cf6',    // purple - in model
      validated: '#22c55e',  // green - reviewed
      pending: '#6b7280'     // gray - needs review
    };
    
    const titles = {
      trained: 'Reviewed & included in ML model',
      validated: 'Reviewed by officer (retrain to include)',
      pending: 'Comments need officer review'
    };
    
    return <span style={{ ...dotStyle, backgroundColor: colors[status] }} title={titles[status]} />;
  };
  
  const handlePrint = () => {
    if (incident?.id) {
      window.open(`/api/reports/pdf/incident/${incident.id}`, '_blank');
    }
  };
  
  const handleNavigate = async (targetId) => {
    if (!targetId || !onNavigate) return;
    setNavLoading(true);
    try {
      await onNavigate(targetId);
    } finally {
      setNavLoading(false);
    }
  };
  
  const handleDelete = async () => {
    if (!incident?.id || !canDelete) return;
    setDeleting(true);
    try {
      await deleteIncident(incident.id);
      setShowDeleteConfirm(false);
      if (onClose) onClose();
    } catch (err) {
      console.error('Failed to delete incident:', err);
      alert('Failed to delete incident: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDeleting(false);
    }
  };
  
  const openDuplicateModal = () => {
    // Set default target to a different category than current
    const currentCat = formData.call_category;
    if (currentCat === 'EMS') {
      setDuplicateTarget('FIRE');
    } else if (currentCat === 'FIRE') {
      setDuplicateTarget('EMS');
    } else {
      setDuplicateTarget('FIRE');
    }
    setDuplicateResult(null);
    setShowDuplicateModal(true);
  };
  
  const handleDuplicate = async () => {
    if (!incident?.id || !duplicateTarget) return;
    setDuplicating(true);
    try {
      const res = await duplicateIncident(incident.id, duplicateTarget, userSession?.id);
      setDuplicateResult(res.data);
    } catch (err) {
      console.error('Failed to duplicate incident:', err);
      alert('Failed to duplicate incident: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDuplicating(false);
    }
  };
  
  const closeDuplicateModal = () => {
    setShowDuplicateModal(false);
    setDuplicateResult(null);
    // Refresh duplicate info after successful duplication
    if (duplicateResult && incident?.id) {
      checkDuplicateStatus(incident.id)
        .then(res => {
          setDuplicateInfo(res.data);
        })
        .catch(() => {});
    }
  };
  
  // Get available target categories (exclude current)
  const getAvailableTargets = () => {
    const all = ['FIRE', 'EMS', 'DETAIL'];
    return all.filter(cat => cat !== formData.call_category);
  };
  
  return (
    <div className="bg-dark-hover rounded px-3 py-2 mb-2 flex items-center justify-between gap-3 flex-wrap" data-help-id="action_bar">
      {/* Left side - Back link and navigation */}
      <div className="flex items-center gap-3">
        {onClose && (
          <button 
            className="text-gray-400 hover:text-white text-sm"
            onClick={onClose}
            disabled={saving}
          >
            ← Back to List
          </button>
        )}
        
        {/* Quick navigation - only when logged in and viewing an existing incident */}
        {userSession && incident?.id && onNavigate && (
          <div className="flex items-center gap-1 text-sm">
            <button
              className={`px-2 py-1 rounded ${adjacentIds.newer_id ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 cursor-not-allowed'}`}
              onClick={() => handleNavigate(adjacentIds.newer_id)}
              disabled={!adjacentIds.newer_id || navLoading || saving}
              title={adjacentIds.newer_id ? 'Go to next newer incident' : 'No newer incidents'}
            >
              &lt;&lt; Next Newer
            </button>
            <span className="text-gray-500">|</span>
            <button
              className={`px-2 py-1 rounded ${adjacentIds.older_id ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 cursor-not-allowed'}`}
              onClick={() => handleNavigate(adjacentIds.older_id)}
              disabled={!adjacentIds.older_id || navLoading || saving}
              title={adjacentIds.older_id ? 'Go to next older incident' : 'No older incidents'}
            >
              Next Older &gt;&gt;
            </button>
          </div>
        )}
        
        {/* Warnings - only show if NOT logged in */}
        {!userSession && (
          <span className="text-status-warning text-sm">⚠️ Log in to edit</span>
        )}
        {userSession && !userSession.is_approved && userSession.can_edit && (
          <span className="text-status-warning text-sm">⚠️ Pending approval — you may edit 1 incident</span>
        )}
        {userSession && !userSession.is_approved && !userSession.can_edit && (
          <span className="text-status-warning text-sm">🔒 Edit limit reached — awaiting admin approval</span>
        )}
      </div>

      <div className="flex gap-2 items-center">
        {saveSuccess && (
          <span className="text-green-500 text-sm">✓ Saved</span>
        )}
        
        {/* Print button */}
        {incident?.id && (
          <button 
            type="button" 
            className="btn btn-secondary"
            onClick={handlePrint}
            data-help-id="btn_print"
          >
            Print
          </button>
        )}
        
        {/* CAD Data buttons */}
        {hasCADData && (
          <>
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={() => setShowCadModal(true)}
              title="View raw CAD data"
              data-help-id="btn_view_cad"
            >
              View CAD
            </button>
            {hasEventComments && isFireIncident && (
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => setShowComCatModal(true)}
                title="Review and categorize event comments"
                data-help-id="btn_comments"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
              >
                Comments
                <StatusDot status={comcatStatus} />
              </button>
            )}
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={handleRestorePreview}
              disabled={restoreLoading || !userSession}
              title={!userSession ? 'Please log in first' : 'Reparse incident from stored CAD data'}
              data-help-id="btn_reparse"
            >
              {restoreLoading ? 'Loading...' : 'Reparse'}
            </button>
          </>
        )}
        
        {onClose && (
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        )}
        {incident?.id && formData.status === 'OPEN' && (
          <button 
            className="btn btn-warning" 
            onClick={handleCloseIncident} 
            disabled={saving || !userSession}
          >
            Close Incident
          </button>
        )}
        <button 
          className="btn btn-primary" 
          onClick={handleSave} 
          disabled={saving || !userSession || (userSession && !userSession.is_approved && userSession.can_edit === false)}
          title={!userSession ? 'Please log in first' : (userSession && !userSession.is_approved && userSession.can_edit === false) ? 'Edit limit reached - awaiting approval' : ''}
          data-help-id="btn_save"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        
        {/* Duplicate button - only visible when CAD # is unlocked (admin only) and feature enabled */}
        {canDuplicate && (
          <button 
            className="btn btn-secondary" 
            onClick={openDuplicateModal} 
            disabled={saving || duplicating}
            title="Duplicate this incident to another category"
          >
            Duplicate
          </button>
        )}
        
        {/* Delete button - only visible when CAD # is unlocked (admin only) */}
        {canDelete && (
          <button 
            className="btn btn-danger" 
            onClick={() => setShowDeleteConfirm(true)} 
            disabled={saving || deleting}
            title="Permanently delete this incident"
          >
            Delete
          </button>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Incident?</h3>
            <p className="text-gray-700 mb-4">
              Are you sure you want to permanently delete incident <strong>{formData.internal_incident_number}</strong>?
            </p>
            <p className="text-red-600 text-sm mb-4 font-medium">
              ⚠️ This action is unrecoverable. The incident and all associated data will be permanently removed.
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
      
      {/* Duplicate Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            {!duplicateResult ? (
              <>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Duplicate Incident</h3>
                <p className="text-gray-700 mb-4">
                  Create a copy of <strong>{formData.internal_incident_number}</strong> in a different category.
                </p>
                
                {/* Warning if already copied */}
                {duplicateInfo?.existing_copies > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                    <p className="text-yellow-800 text-sm font-medium">
                      ⚠️ This incident has already been duplicated {duplicateInfo.existing_copies} time{duplicateInfo.existing_copies > 1 ? 's' : ''}:
                    </p>
                    <ul className="text-yellow-700 text-sm mt-1">
                      {duplicateInfo.copy_info?.map((copy, idx) => (
                        <li key={idx}>
                          {copy.internal_incident_number} ({copy.call_category}) - CAD: {copy.cad_event_number}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duplicate to category:
                  </label>
                  <select
                    value={duplicateTarget}
                    onChange={(e) => setDuplicateTarget(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                  >
                    {getAvailableTargets().map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                
                <p className="text-gray-600 text-sm mb-4">
                  The copy will have:
                </p>
                <ul className="text-gray-600 text-sm mb-4 list-disc list-inside">
                  <li>A new incident number in the {duplicateTarget} sequence</li>
                  <li>CAD # with "C" suffix ({formData.cad_event_number}C{duplicateInfo?.existing_copies > 0 ? (duplicateInfo.existing_copies + 1) : ''})</li>
                  <li>All incident data, personnel, and times copied</li>
                </ul>
                
                <div className="flex gap-3 justify-end">
                  <button 
                    className="btn btn-secondary" 
                    onClick={closeDuplicateModal}
                    disabled={duplicating}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleDuplicate}
                    disabled={duplicating || !duplicateTarget}
                  >
                    {duplicating ? 'Duplicating...' : 'Create Copy'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-gray-900 mb-2">✓ Incident Duplicated</h3>
                <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
                  <p className="text-green-800 mb-2">
                    Successfully created copy:
                  </p>
                  <ul className="text-green-700 text-sm">
                    <li><strong>New Number:</strong> {duplicateResult.new_internal_number}</li>
                    <li><strong>Category:</strong> {duplicateResult.new_category}</li>
                    <li><strong>CAD #:</strong> {duplicateResult.new_cad_number}</li>
                  </ul>
                </div>
                <p className="text-gray-600 text-sm mb-4">
                  The new incident is now available in the {duplicateResult.new_category} incident list.
                </p>
                <div className="flex gap-3 justify-end">
                  <button 
                    className="btn btn-primary" 
                    onClick={closeDuplicateModal}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
