import { useState } from 'react';
import { getNerisDisplayName } from '../RunSheetContext';

export default function NerisModal({ 
  isOpen, 
  onClose, 
  title,
  data, 
  selected, 
  onToggle, 
  maxSelections = null,
  dataType = 'children'
}) {
  const [expandedCats, setExpandedCats] = useState({});

  if (!isOpen) return null;

  const toggleCategory = (cat) => {
    setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const isMulti = Array.isArray(selected);
  const selectedArray = isMulti ? selected : (selected ? [selected] : []);
  const atLimit = maxSelections && selectedArray.length >= maxSelections;

  const handleToggle = (value) => {
    if (isMulti) {
      if (selectedArray.includes(value)) {
        onToggle(value);
      } else if (!atLimit) {
        onToggle(value);
      }
    } else {
      onToggle(value);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-dark-bg rounded-lg w-[95%] max-w-[700px] max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex justify-between items-center">
          <h3 className="text-accent-red text-lg font-semibold m-0">{title}</h3>
          <button 
            className="bg-transparent border-none text-gray-500 hover:text-white text-2xl cursor-pointer leading-none p-0"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Selected chips */}
        <div className="px-5 py-3 bg-dark-hover border-b border-dark-border min-h-[48px] flex flex-wrap gap-2 items-center">
          {selectedArray.length === 0 ? (
            <span className="text-gray-600 text-xs italic">None selected</span>
          ) : (
            selectedArray.map(val => (
              <span key={val} className="inline-flex items-center gap-1.5 bg-accent-red text-white px-2.5 py-1 rounded-full text-xs font-medium">
                {getNerisDisplayName(val)}
                <button 
                  className="bg-white/25 hover:bg-white/40 rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
                  onClick={() => onToggle(val)}
                >
                  ×
                </button>
              </span>
            ))
          )}
          {maxSelections && (
            <span className="ml-auto text-gray-600 text-xs">{selectedArray.length}/{maxSelections}</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {Object.entries(data).map(([cat, catData]) => {
            const isCategorySelectable = dataType === 'children' && !catData.children && !catData.codes;
            const isSelected = isCategorySelectable && selectedArray.includes(cat);
            const isDisabled = isCategorySelectable && !isSelected && atLimit;
            
            return (
              <div key={cat} className="mb-1.5">
                <button
                  type="button"
                  className={`w-full bg-dark-card border border-dark-border px-4 py-3 text-left font-semibold text-sm rounded-md flex justify-between items-center transition-all
                    ${expandedCats[cat] ? 'bg-dark-border text-accent-red rounded-b-none' : 'text-gray-400 hover:border-accent-red hover:text-white'}
                    ${isSelected ? 'bg-accent-red/25 border-accent-red border-2 text-white' : ''}
                    ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                  onClick={() => {
                    if (isCategorySelectable) {
                      if (!isDisabled) handleToggle(cat);
                    } else {
                      toggleCategory(cat);
                    }
                  }}
                  disabled={isDisabled}
                >
                  <span>{catData.description || cat}</span>
                  {!isCategorySelectable && (
                    <span className="text-gray-600 text-xs">{expandedCats[cat] ? '▲' : '▼'}</span>
                  )}
                </button>
                
                {expandedCats[cat] && (catData.children || catData.codes || catData.subtypes) && (
                  <div className="bg-dark-hover border border-dark-border border-t-0 rounded-b-md px-4 py-3">
                    {dataType === 'children' && catData.children && 
                      Object.entries(catData.children).map(([subcat, subData]) => (
                        <div key={subcat} className="mb-2.5 last:mb-0">
                          <div className="text-accent-red text-[11px] font-medium uppercase tracking-wide mb-1.5">
                            {subData.description || subcat}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {subData.codes?.map(item => {
                              const itemSelected = selectedArray.includes(item.value);
                              const itemDisabled = !itemSelected && atLimit;
                              return (
                                <button
                                  key={item.value}
                                  type="button"
                                  className={`px-2.5 py-1.5 bg-dark-card border border-dark-border rounded text-xs transition-all
                                    ${itemSelected ? 'bg-accent-red/25 border-accent-red text-white' : 'text-gray-400 hover:border-accent-red hover:text-white'}
                                    ${itemDisabled ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer'}
                                  `}
                                  onClick={() => !itemDisabled && handleToggle(item.value)}
                                  disabled={itemDisabled}
                                >
                                  {item.description}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    }
                    {dataType === 'children' && catData.codes && !catData.children && (
                      <div className="flex flex-wrap gap-1.5">
                        {catData.codes.map(item => {
                          const itemSelected = selectedArray.includes(item.value);
                          const itemDisabled = !itemSelected && atLimit;
                          return (
                            <button
                              key={item.value}
                              type="button"
                              className={`px-2.5 py-1.5 bg-dark-card border border-dark-border rounded text-xs transition-all
                                ${itemSelected ? 'bg-accent-red/25 border-accent-red text-white' : 'text-gray-400 hover:border-accent-red hover:text-white'}
                                ${itemDisabled ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer'}
                              `}
                              onClick={() => !itemDisabled && handleToggle(item.value)}
                              disabled={itemDisabled}
                            >
                              {item.description}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {dataType === 'subtypes' && catData.subtypes && (
                      <div className="flex flex-wrap gap-1.5">
                        {catData.subtypes.map(item => {
                          const itemSelected = selectedArray.includes(item.value);
                          return (
                            <button
                              key={item.value}
                              type="button"
                              className={`px-2.5 py-1.5 bg-dark-card border border-dark-border rounded text-xs cursor-pointer transition-all
                                ${itemSelected ? 'bg-accent-red/25 border-accent-red text-white' : 'text-gray-400 hover:border-accent-red hover:text-white'}
                              `}
                              onClick={() => handleToggle(item.value)}
                            >
                              {item.description}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-dark-border flex justify-between items-center">
          <span className="text-gray-500 text-sm">
            {selectedArray.length} selected{maxSelections ? ` of ${maxSelections} max` : ''}
          </span>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
