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
          Last edit: <span className="text-white">{auditLog[0]?.personnel_name || 'Unknown'}</span>
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
        <div className="mt-2 pt-2 border-t border-dark-border max-h-72 overflow-y-auto">
          {auditLog.map((entry, idx) => (
            <div 
              key={entry.id || idx} 
              className={`py-1.5 flex justify-between items-start ${idx < auditLog.length - 1 ? 'border-b border-dark-border/50' : ''}`}
            >
              <div>
                <span className="text-gray-500 mr-2 text-[10px]">{entry.action}</span>
                <span className="text-white">{entry.personnel_name || 'Unknown'}</span>
                {entry.summary && (
                  <span className="text-gray-400 ml-2">— {entry.summary}</span>
                )}
              </div>
              <span className="text-gray-500 text-[11px] whitespace-nowrap ml-2">
                {entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
