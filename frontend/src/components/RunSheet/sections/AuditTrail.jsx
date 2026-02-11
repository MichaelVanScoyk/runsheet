import { useRunSheet } from '../RunSheetContext';
import { formatDateTimeLocal } from '../../../utils/timeUtils';

export default function AuditTrail() {
  const { 
    incident, 
    auditLog, 
    showFullAuditLog, 
    setShowFullAuditLog, 
    auditLogRef 
  } = useRunSheet();
  
  if (!incident?.id || auditLog.length === 0) return null;
  
  // Helper to get display name - "CAD Parser" for system actions
  const getDisplayName = (entry) => {
    if (entry.personnel_name) return entry.personnel_name;
    // No user - check if it's a parser action
    if (entry.action === 'CREATE' || entry.summary?.includes('CAD') || entry.summary?.includes('cad_')) {
      return 'CAD Parser';
    }
    return 'System';
  };
  
  // Helper to format field changes for display
  const formatFieldChanges = (fieldsChanged) => {
    if (!fieldsChanged || typeof fieldsChanged !== 'object') return null;
    
    const entries = Object.entries(fieldsChanged);
    if (entries.length === 0) return null;
    
    // Truncate long values
    const truncate = (val, max = 50) => {
      const str = String(val);
      return str.length > max ? str.substring(0, max) + '...' : str;
    };
    
    return entries
      .filter(([, change]) => {
        // Must be {old, new} format - skip anything else
        if (!change || typeof change !== 'object') return false;
        if (!('old' in change) && !('new' in change)) return false;
        // Skip if both are empty
        if (!change.old && !change.new) return false;
        return true;
      })
      .map(([field, change]) => {
        const oldVal = change.old;
        const newVal = change.new;
        const hasOld = oldVal !== null && oldVal !== undefined && oldVal !== '';
        const hasNew = newVal !== null && newVal !== undefined && newVal !== '';
        
        return {
          field,
          old: hasOld ? truncate(oldVal) : null,
          new: hasNew ? truncate(newVal) : null,
          // "set to" when old was empty, "cleared" when new is empty
          isSet: !hasOld && hasNew,
          isCleared: hasOld && !hasNew,
        };
      });
  };
  
  return (
    <div 
      ref={auditLogRef}
      data-help-id="audit_trail"
      className="bg-theme-section rounded px-3 py-2 mb-2 text-xs border border-theme-light"
    >
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setShowFullAuditLog(!showFullAuditLog)}
      >
        <div>
          <span className="mr-2">📝</span>
          Last edit: <span className="text-theme-primary font-medium">{getDisplayName(auditLog[0])}</span>
          {' — '}
          <span className="text-theme-muted">{auditLog[0]?.summary}</span>
          {' — '}
          <span className="text-theme-hint">
            {formatDateTimeLocal(auditLog[0]?.created_at)}
          </span>
        </div>
        <span className="text-theme-hint">
          {showFullAuditLog ? '▲' : '▼'} {auditLog.length} edit{auditLog.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      {showFullAuditLog && (
        <div className="mt-2 pt-2 border-t border-theme-light max-h-96 overflow-y-auto">
          {auditLog.map((entry, idx) => {
            const fieldChanges = formatFieldChanges(entry.fields_changed);
            
            return (
              <div 
                key={entry.id || idx} 
                className={`py-2 ${idx < auditLog.length - 1 ? 'border-b border-theme-light' : ''}`}
              >
                {/* Main row */}
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-theme-hint mr-2 text-[10px] uppercase">{entry.action}</span>
                    <span className="text-theme-primary font-medium">{getDisplayName(entry)}</span>
                    {entry.summary && (
                      <span className="text-theme-muted ml-2">— {entry.summary}</span>
                    )}
                  </div>
                  <span className="text-theme-hint text-[11px] whitespace-nowrap ml-2">
                    {formatDateTimeLocal(entry.created_at)}
                  </span>
                </div>
                
                {/* Field changes detail */}
                {fieldChanges && fieldChanges.length > 0 && (
                  <div className="mt-1.5 ml-4 pl-2 border-l-2 border-theme">
                    {fieldChanges.map((fc, fcIdx) => (
                      <div key={fcIdx} className="text-[11px] py-0.5">
                        <span className="text-theme-hint">{fc.field}:</span>
                        {fc.isSet ? (
                          /* Value was empty, now set */
                          <span className="text-green-600 ml-1">{fc.new}</span>
                        ) : fc.isCleared ? (
                          /* Value was set, now cleared */
                          <>
                            <span className="text-red-600 ml-1 line-through">{fc.old}</span>
                            <span className="text-theme-hint ml-1">(cleared)</span>
                          </>
                        ) : (
                          /* Changed from one value to another */
                          <>
                            <span className="text-red-600 ml-1">{fc.old}</span>
                            <span className="text-theme-hint mx-1">→</span>
                            <span className="text-green-600">{fc.new}</span>
                          </>
                        )}
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
  );
}
