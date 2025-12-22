// Chip component for selected items
export default function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-accent-red text-white px-2.5 py-1 rounded-full text-xs font-medium">
      {label}
      <button 
        type="button" 
        onClick={onRemove} 
        className="bg-white/25 hover:bg-white/40 rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
      >
        ×
      </button>
    </span>
  );
}
