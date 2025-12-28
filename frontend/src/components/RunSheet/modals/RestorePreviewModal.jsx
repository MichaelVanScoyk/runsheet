import { useRunSheet } from '../RunSheetContext';
import { formatLocalDateTime } from '../../../utils/timeUtils';

// Format time fields for display - convert UTC to local
function formatFieldValue(field, value) {
  if (!value) return value;
  // Check if this is a time field
  if (field && field.startsWith('time_')) {
    return formatLocalDateTime(value);
  }
  return value;
}

export default function RestorePreviewModal() {
  const { 
    showRestoreModal, 
    setShowRestoreModal, 
    restorePreview, 
    setRestorePreview,
    restoreLoading,
    restoreComplete,
    setRestoreComplete,
    handleRestoreConfirm 
  } = useRunSheet();
  
  if (!showRestoreModal || !restorePreview) return null;
  
  const handleClose = () => {
    setShowRestoreModal(false);
    setRestorePreview(null);
    setRestoreComplete(false);
  };

  const hasFieldChanges = restorePreview.changes && restorePreview.changes.length > 0;
  const hasUnitChanges = restorePreview.unitChanges && restorePreview.unitChanges.length > 0;
  const totalChanges = (restorePreview.changes?.length || 0) + (restorePreview.unitChanges?.length || 0);

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
          <h3 className={`text-lg font-semibold m-0 ${restoreComplete ? 'text-status-open' : 'text-accent-red'}`}>
            {restoreComplete ? '✓ Reparse Complete' : 'Reparse from CAD'}
          </h3>
          <button 
            className="bg-transparent border-none text-gray-500 hover:text-white text-2xl cursor-pointer leading-none p-0"
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!restoreComplete && (
            <p className="text-gray-400 text-sm mb-4">
              This will reparse the stored CAD data and update all CAD-derived fields,
              including unit configurations (is_mutual_aid, counts_for_response_times).
            </p>
          )}
          
          {restoreComplete && (
            <p className="text-status-open text-sm mb-4">
              {totalChanges > 0 
                ? `Successfully applied ${totalChanges} change${totalChanges !== 1 ? 's' : ''}.`
                : 'Data is now in sync with current apparatus configuration.'
              }
            </p>
          )}
          
          {/* Field Changes */}
          {hasFieldChanges && (
            <>
              <h4 className="text-gray-300 text-sm font-medium mb-2">
                {restoreComplete ? 'Fields Updated' : 'Field Changes'}
              </h4>
              <table className="w-full text-sm border-collapse mb-4">
                <thead>
                  <tr className="bg-dark-border text-accent-red text-xs uppercase">
                    <th className="px-3 py-2 text-left">Field</th>
                    <th className="px-3 py-2 text-left">{restoreComplete ? 'Was' : 'Current Value'}</th>
                    <th className="px-3 py-2 text-left">{restoreComplete ? 'Now' : 'CAD Value'}</th>
                  </tr>
                </thead>
                <tbody>
                  {restorePreview.changes.map((change, idx) => (
                    <tr key={idx} className="border-b border-dark-border">
                      <td className="px-3 py-2 text-gray-300 font-medium">{change.field}</td>
                      <td className={`px-3 py-2 ${restoreComplete ? 'text-gray-500 line-through' : 'text-status-error'}`}>
                        {formatFieldValue(change.field, change.current) || <span className="text-gray-600 italic">empty</span>}
                      </td>
                      <td className="px-3 py-2 text-status-open">
                        {formatFieldValue(change.field, change.cad) || <span className="text-gray-600 italic">empty</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Unit Config Changes */}
          {hasUnitChanges && (
            <>
              <h4 className="text-gray-300 text-sm font-medium mb-2">
                {restoreComplete ? 'Units Updated' : 'Unit Configuration Changes'}
              </h4>
              <table className="w-full text-sm border-collapse mb-4">
                <thead>
                  <tr className="bg-dark-border text-accent-red text-xs uppercase">
                    <th className="px-3 py-2 text-left">Unit</th>
                    <th className="px-3 py-2 text-left">Field</th>
                    <th className="px-3 py-2 text-left">{restoreComplete ? 'Was' : 'Current'}</th>
                    <th className="px-3 py-2 text-left">{restoreComplete ? 'Now' : 'Will Be'}</th>
                  </tr>
                </thead>
                <tbody>
                  {restorePreview.unitChanges.map((change, idx) => (
                    <tr key={idx} className="border-b border-dark-border">
                      <td className="px-3 py-2 text-gray-300 font-medium">{change.unit_id}</td>
                      <td className="px-3 py-2 text-gray-400">{change.field}</td>
                      <td className={`px-3 py-2 ${restoreComplete ? 'text-gray-500 line-through' : 'text-status-error'}`}>
                        {change.current === null ? <span className="text-gray-600 italic">none</span> : String(change.current)}
                      </td>
                      <td className="px-3 py-2 text-status-open">
                        {typeof change.will_be === 'object' ? JSON.stringify(change.will_be) : String(change.will_be)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* No visible changes message */}
          {!hasFieldChanges && !hasUnitChanges && !restoreComplete && (
            <p className="text-gray-500 italic mb-4">
              No changes detected. You can still reparse to ensure data is in sync with current apparatus configuration.
            </p>
          )}
          
          {!hasFieldChanges && !hasUnitChanges && restoreComplete && (
            <p className="text-gray-400 italic mb-4">
              No changes were needed. Data was already in sync.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-dark-border flex justify-between items-center">
          <span className="text-gray-500 text-sm">
            {restoreComplete 
              ? (totalChanges > 0 ? `${totalChanges} change${totalChanges !== 1 ? 's' : ''} applied` : 'No changes needed')
              : (totalChanges > 0 ? `${totalChanges} change${totalChanges !== 1 ? 's' : ''} detected` : 'Full reparse will sync with current config')
            }
          </span>
          <div className="flex gap-2">
            {restoreComplete ? (
              <button className="btn btn-primary" onClick={handleClose}>Close</button>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
                <button 
                  className="btn btn-warning" 
                  onClick={handleRestoreConfirm}
                  disabled={restoreLoading}
                >
                  {restoreLoading ? 'Reparsing...' : 'Reparse'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
