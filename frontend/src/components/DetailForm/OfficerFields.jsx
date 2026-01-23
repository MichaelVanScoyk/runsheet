/**
 * OfficerFields - Completed By field for attendance records
 * 
 * Simpler than RunSheet's OfficerSection - only needs completed_by.
 */

export default function OfficerFields({ completedBy, personnel, onChange }) {
  // Sort personnel by name for dropdown
  const sortedPersonnel = [...personnel].sort((a, b) => 
    `${a.last_name}, ${a.first_name}`.localeCompare(`${b.last_name}, ${b.first_name}`)
  );

  return (
    <div className="bg-dark-hover rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">Completed By</h3>
      
      <div className="max-w-xs">
        <select
          value={completedBy || ''}
          onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}
          className="form-control"
        >
          <option value="">Select person...</option>
          {sortedPersonnel.map(p => (
            <option key={p.id} value={p.id}>
              {p.last_name}, {p.first_name}
              {p.rank_abbreviation ? ` (${p.rank_abbreviation})` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
