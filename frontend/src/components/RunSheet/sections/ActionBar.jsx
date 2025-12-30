import { useRunSheet } from '../RunSheetContext';

export default function ActionBar() {
  const { 
    incident, 
    formData, 
    userSession, 
    saving,
    saveSuccess,
    restoreLoading,
    onClose, 
    handleCloseIncident, 
    handleSave,
    setShowCadModal,
    handleRestorePreview
  } = useRunSheet();
  
  const hasCADData = incident && (formData.cad_raw_dispatch || formData.cad_raw_clear);
  
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
