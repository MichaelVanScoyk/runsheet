import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Unified personnel selection component with typeahead
 * - Portal rendering to escape overflow containers
 * - Auto-flip: opens upward when near bottom of viewport
 * - Optional exclusion of already-assigned personnel
 */
export default function PersonnelSelect({ 
  value, 
  personnel,          // Full personnel list
  excludeIds = null,  // Set of IDs to exclude (null = show all)
  onSelect, 
  onClear,
  placeholder = "-"
}) {
  const [searchText, setSearchText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const [flipUp, setFlipUp] = useState(false);
  
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  
  // Normalize value to number for comparison
  const valueNum = value ? parseInt(value) : null;
  
  // Available personnel (either full list or filtered by excludeIds)
  const availablePersonnel = excludeIds 
    ? personnel.filter(p => !excludeIds.has(p.id) || p.id === valueNum)
    : personnel;
  
  // Get current person's name for display
  const currentPerson = valueNum ? personnel.find(p => p.id === valueNum) : null;
  const displayValue = isOpen ? searchText : (currentPerson ? `${currentPerson.last_name}, ${currentPerson.first_name}` : '');
  
  // Filter by search text
  const filtered = searchText 
    ? availablePersonnel.filter(p => {
        const search = searchText.toLowerCase();
        return p.last_name.toLowerCase().includes(search) || 
               p.first_name.toLowerCase().includes(search);
      })
    : availablePersonnel;
  
  // Position dropdown using viewport coordinates
  const updateDropdownPosition = () => {
    if (!inputRef.current) return;
    
    const rect = inputRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = Math.min(filtered.length * 32, 192); // max-h-48 = 192px
    
    // Flip up if not enough space below and more space above
    const shouldFlipUp = spaceBelow < dropdownHeight + 8 && spaceAbove > spaceBelow;
    setFlipUp(shouldFlipUp);
    
    if (shouldFlipUp) {
      setDropdownStyle({
        position: 'fixed',
        left: rect.left,
        bottom: viewportHeight - rect.top + 2,
        width: rect.width,
        maxHeight: Math.min(spaceAbove - 8, 192),
      });
    } else {
      setDropdownStyle({
        position: 'fixed',
        left: rect.left,
        top: rect.bottom + 2,
        width: rect.width,
        maxHeight: Math.min(spaceBelow - 8, 192),
      });
    }
  };
  
  // Update position when dropdown opens or filtered list changes
  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      window.addEventListener('scroll', updateDropdownPosition, true);
      window.addEventListener('resize', updateDropdownPosition);
      return () => {
        window.removeEventListener('scroll', updateDropdownPosition, true);
        window.removeEventListener('resize', updateDropdownPosition);
      };
    }
  }, [isOpen, filtered.length]);
  
  const handleFocus = () => {
    setIsOpen(true);
    setSearchText('');
    setHighlightedIndex(-1);
  };
  
  const handleBlur = () => {
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
  
  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.children;
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);
  
  const dropdown = isOpen && filtered.length > 0 && createPortal(
    <div 
      ref={dropdownRef}
      style={dropdownStyle}
      className={`bg-white border border-gray-300 shadow-lg overflow-y-auto z-[9999] ${flipUp ? 'rounded-t' : 'rounded-b'}`}
    >
      {filtered.slice(0, 50).map((p, idx) => (
        <div
          key={p.id}
          className={`px-2 py-1.5 cursor-pointer text-sm ${
            idx === highlightedIndex 
              ? 'bg-blue-100 text-gray-900' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          onMouseDown={() => handleSelect(p)}
          onMouseEnter={() => setHighlightedIndex(idx)}
        >
          {p.last_name}, {p.first_name}
        </div>
      ))}
    </div>,
    document.body
  );
  
  const noResults = isOpen && searchText && filtered.length === 0 && createPortal(
    <div 
      style={dropdownStyle}
      className={`bg-white border border-gray-300 shadow-lg z-[9999] ${flipUp ? 'rounded-t' : 'rounded-b'}`}
    >
      <div className="px-2 py-1.5 text-gray-400 text-sm italic">No matches</div>
    </div>,
    document.body
  );
  
  return (
    <div className="relative flex items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-1 text-gray-900 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      />
      {value && !isOpen && onClear && (
        <button 
          className="flex-shrink-0 bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded text-xs flex items-center justify-center" 
          onClick={onClear} 
          type="button"
        >
          ×
        </button>
      )}
      {dropdown}
      {noResults}
    </div>
  );
}
