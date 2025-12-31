import { useState, useEffect, useCallback } from 'react';
import { useRunSheet } from '../RunSheetContext';

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
    handleCloseIncident, 
    handleSave,
    setShowCadModal,
    setShowComCatModal,
    handleRestorePreview
  } = useRunSheet();
  
  const [modelTrainedAt, setModelTrainedAt] = useState(null);
  
  const hasCADData = incident && (formData.cad_raw_dispatch || formData.cad_raw_clear);
  const hasEventComments = formData.cad_event_comments?.comments?.length > 0;
  const isFireIncident = formData.call_category === 'FIRE';
  
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
    
    const officerCount = relevantComments.filter(c => c.category_source === 'OFFICER').length;
    const total = relevantComments.length;
    
    if (officerCount === 0) return 'pending';
    if (officerCount < total) return 'partial';
    
    // All validated - check if trained
    if (modelTrainedAt) {
      const officerReviewedAt = formData.cad_event_comments?.officer_reviewed_at;
      if (officerReviewedAt && modelTrainedAt > officerReviewedAt) {
        return 'trained';
      }
    }
    return 'validated';
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
      trained: '#8b5cf6',
      validated: '#22c55e',
      partial: '#f59e0b',
      pending: '#6b7280'
    };
    
    const titles = {
      trained: 'Validated & ML trained',
      validated: 'Validated by officer',
      partial: 'Partially reviewed',
      pending: 'Needs review'
    };
    
    return <span style={{ ...dotStyle, backgroundColor: colors[status] }} title={titles[status]} />;
  };
  
  const handlePrint = () => {
    if (incident?.id) {
      window.open(`/print/${incident.id}`, '_blank');
    }
  };
  
  return (
    <div className="bg-dark-hover rounded px-3 py-2 mb-2 flex items-center justify-between gap-3 flex-wrap">
      {/* Left side - Back link */}
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
        
        {/* Warnings */}
        {!userSession && (
          <span className="text-status-warning text-sm">⚠️ Log in to edit</span>
        )}
        {userSession && !userSession.is_approved && (
          <span className="text-status-warning text-sm">⚠️ Pending approval</span>
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
            >
              View CAD
            </button>
            {hasEventComments && isFireIncident && (
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => setShowComCatModal(true)}
                title="Review and categorize event comments"
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
          disabled={saving || !userSession}
          title={!userSession ? 'Please log in first' : ''}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
