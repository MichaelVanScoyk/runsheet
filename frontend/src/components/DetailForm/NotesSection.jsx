/**
 * NotesSection - Narrative/notes field for attendance records
 * Notes are REQUIRED for detail records.
 */

export default function NotesSection({ narrative, onChange, disabled }) {
  const isEmpty = !narrative || !narrative.trim();
  
  return (
    <div className="bg-dark-hover rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">
        Notes <span className="text-yellow-500">*</span>
      </h3>
      
      <textarea
        value={narrative || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Describe the event, topics covered, activities performed..."
        className={`form-control w-full resize-none ${isEmpty ? 'border-yellow-500' : ''}`}
        disabled={disabled}
        required
      />
      {isEmpty && (
        <span className="text-xs text-yellow-500 mt-1 block">Required - Please add notes about this event</span>
      )}
    </div>
  );
}
