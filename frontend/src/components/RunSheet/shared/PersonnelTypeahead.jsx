import { useState } from 'react';

// Typeahead component for personnel selection
// CRITICAL: Keyboard navigation and assignment logic must not change
export default function PersonnelTypeahead({ value, availablePersonnel, allPersonnel, onSelect, onClear }) {
  const [searchText, setSearchText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  
  // Get current person's name for display
  const currentPerson = value ? allPersonnel.find(p => p.id === parseInt(value)) : null;
  const displayValue = isOpen ? searchText : (currentPerson ? `${currentPerson.last_name}, ${currentPerson.first_name}` : '');
  
  // Filter available personnel by search text
  const filtered = searchText 
    ? availablePersonnel.filter(p => {
        const search = searchText.toLowerCase();
        return p.last_name.toLowerCase().includes(search) || 
               p.first_name.toLowerCase().includes(search);
      })
    : availablePersonnel;
  
  const handleFocus = () => {
    setIsOpen(true);
    setSearchText('');
    setHighlightedIndex(-1);
  };
  
  const handleBlur = () => {
    // Delay to allow click on dropdown
    setTimeout(() => {
      setIsOpen(false);
      setSearchText('');
      setHighlightedIndex(-1);
    }, 150);
  };
  
  const handleChange = (e) => {
    setSearchText(e.target.value);
    setHighlightedIndex(-1);
    if (!isOpen) setIsOpen(true);
  };
  
  const handleSelect = (person) => {
    onSelect(person.id);
    setIsOpen(false);
    setSearchText('');
    setHighlightedIndex(-1);
  };
  
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
          handleSelect(filtered[highlightedIndex]);
        } else if (filtered.length === 1) {
          handleSelect(filtered[0]);
        }
        break;
      case 'Tab':
        if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
          handleSelect(filtered[highlightedIndex]);
        } else if (searchText && filtered.length === 1) {
          handleSelect(filtered[0]);
        }
        setIsOpen(false);
        setSearchText('');
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchText('');
        setHighlightedIndex(-1);
        break;
    }
  };
  
  return (
    <div className="relative flex items-center gap-1">
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="-"
        className="flex-1 min-w-0 bg-theme-card border border-theme rounded px-2 py-1 text-theme-primary text-sm w-full focus:outline-none focus:border-accent-red"
      />
      {value && !isOpen && (
        <button 
          className="flex-shrink-0 bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded text-sm flex items-center justify-center" 
          onClick={onClear} 
          type="button"
        >
          ×
        </button>
      )}
      {isOpen && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-theme-card border border-theme border-t-0 rounded-b max-h-48 overflow-y-auto z-50 shadow-lg">
          {filtered.slice(0, 10).map((p, idx) => (
            <div
              key={p.id}
              className={`px-2 py-1.5 cursor-pointer text-sm ${idx === highlightedIndex ? 'bg-theme-section text-theme-primary' : 'text-theme-muted hover:bg-theme-section hover:text-theme-primary'}`}
              onMouseDown={() => handleSelect(p)}
              onMouseEnter={() => setHighlightedIndex(idx)}
            >
              {p.last_name}, {p.first_name}
            </div>
          ))}
        </div>
      )}
      {isOpen && searchText && filtered.length === 0 && (
        <div className="absolute top-full left-0 right-0 bg-theme-card border border-theme border-t-0 rounded-b z-50 shadow-lg">
          <div className="px-2 py-1.5 text-theme-hint text-sm italic">No matches</div>
        </div>
      )}
    </div>
  );
}
