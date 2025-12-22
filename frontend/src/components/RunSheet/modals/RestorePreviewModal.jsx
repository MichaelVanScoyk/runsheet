import { useRunSheet } from '../RunSheetContext';

export default function RestorePreviewModal() {
  const { 
    showRestoreModal, 
    setShowRestoreModal, 
    restorePreview, 
    setRestorePreview,
    restoreLoading,
    handleRestoreConfirm 
  } = useRunSheet();
  
  if (!showRestoreModal || !restorePreview) return null;
  
  const handleClose = () => {
    setShowRestoreModal(false);
    setRestorePreview(null);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div 
        className="bg-dark-bg rounded-lg w-[95%] max-w-[700px] max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex justify-between items-center">
          <h3 className="text-accent-red text-lg font-semibold m-0">Restore from CAD</h3>
          <button 
            className="bg-transparent border-none text-gray-500 hover:text-white text-2xl cursor-pointer leading-none p-0"
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-gray-400 text-sm mb-4">
            The following fields will be restored from the original CAD data:
          </p>
          
          {restorePreview.changes && restorePreview.changes.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-dark-border text-accent-red text-xs uppercase">
                  <th className="px-3 py-2 text-left">Field</th>
                  <th className="px-3 py-2 text-left">Current Value</th>
                  <th className="px-3 py-2 text-left">CAD Value</th>
                </tr>
              </thead>
              <tbody>
                {restorePreview.changes.map((change, idx) => (
                  <tr key={idx} className="border-b border-dark-border">
                    <td className="px-3 py-2 text-gray-300 font-medium">{change.field}</td>
                    <td className="px-3 py-2 text-status-error">
                      {change.current || <span className="text-gray-600 italic">empty</span>}
                    </td>
                    <td className="px-3 py-2 text-status-open">
                      {change.cad || <span className="text-gray-600 italic">empty</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 italic">No changes detected. Current values match CAD data.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-dark-border flex justify-between items-center">
          <span className="text-gray-500 text-sm">
            {restorePreview.changes?.length || 0} field{restorePreview.changes?.length !== 1 ? 's' : ''} will be changed
          </span>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
            <button 
              className="btn btn-warning" 
              onClick={handleRestoreConfirm}
              disabled={restoreLoading || !restorePreview.changes?.length}
            >
              {restoreLoading ? 'Restoring...' : 'Restore'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
