import { useRunSheet } from '../RunSheetContext';

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
    
    return entries.map(([field, change]) => {
      const oldVal = change?.old || '(empty)';
      const newVal = change?.new || '(empty)';
      // Truncate long values
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
  
  return (
    <div 
      ref={auditLogRef}
      className="bg-dark-hover rounded px-3 py-2 mb-2 text-xs"
    >
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setShowFullAuditLog(!showFullAuditLog)}
      >
        <div>
          <span className="mr-2">📝</span>
          Last edit: <span className="text-white">{getDisplayName(auditLog[0])}</span>
          {' — '}
          <span className="text-gray-400">{auditLog[0]?.summary}</span>
          {' — '}
          <span className="text-gray-500">
            {auditLog[0]?.created_at ? new Date(auditLog[0].created_at).toLocaleString() : ''}
          </span>
        </div>
        <span className="text-gray-500">
          {showFullAuditLog ? '▲' : '▼'} {auditLog.length} edit{auditLog.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      {showFullAuditLog && (
        <div className="mt-2 pt-2 border-t border-dark-border max-h-96 overflow-y-auto">
          {auditLog.map((entry, idx) => {
            const fieldChanges = formatFieldChanges(entry.fields_changed);
            
            return (
              <div 
                key={entry.id || idx} 
                className={`py-2 ${idx < auditLog.length - 1 ? 'border-b border-dark-border/50' : ''}`}
              >
                {/* Main row */}
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-gray-500 mr-2 text-[10px] uppercase">{entry.action}</span>
                    <span className="text-white">{getDisplayName(entry)}</span>
                    {entry.summary && (
                      <span className="text-gray-400 ml-2">— {entry.summary}</span>
                    )}
                  </div>
                  <span className="text-gray-500 text-[11px] whitespace-nowrap ml-2">
                    {entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}
                  </span>
                </div>
                
                {/* Field changes detail */}
                {fieldChanges && fieldChanges.length > 0 && (
                  <div className="mt-1.5 ml-4 pl-2 border-l-2 border-dark-border">
                    {fieldChanges.map((fc, fcIdx) => (
                      <div key={fcIdx} className="text-[11px] py-0.5">
                        <span className="text-gray-500">{fc.field}:</span>
                        <span className="text-status-error ml-1">{fc.old}</span>
                        <span className="text-gray-600 mx-1">→</span>
                        <span className="text-status-open">{fc.new}</span>
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
