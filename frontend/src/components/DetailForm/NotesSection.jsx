/**
 * NotesSection - Narrative/notes field for attendance records
 */

export default function NotesSection({ narrative, onChange }) {
  return (
    <div className="bg-dark-hover rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">Notes</h3>
      
      <textarea
        value={narrative || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Optional notes about this event..."
        className="form-control w-full resize-none"
      />
    </div>
  );
}
