import { useState } from 'react';
import { formatNerisCode } from './nerisUtils';

export default function HierarchicalCodePicker({
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

  const getDisplayName = (val) => {
    if (!val) return '';
    const parts = val.split('||');
    const last = parts[parts.length - 1];
    return last.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '8px', width: '95%', maxWidth: '700px',
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}
          >×</button>
        </div>

        {/* Selected chips */}
        <div style={{
          padding: '0.75rem 1.25rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
          minHeight: '44px', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center'
        }}>
          {selectedArray.length === 0 ? (
            <span style={{ color: '#9ca3af', fontSize: '0.8rem', fontStyle: 'italic' }}>None selected</span>
          ) : (
            selectedArray.map(val => (
              <span key={val} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                background: '#2563eb', color: '#fff', padding: '0.25rem 0.6rem',
                borderRadius: '999px', fontSize: '0.75rem', fontWeight: 500
              }}>
                {getDisplayName(val)}
                <button
                  onClick={() => onToggle(val)}
                  style={{
                    background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: '50%',
                    width: '16px', height: '16px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '0.7rem', color: '#fff', cursor: 'pointer'
                  }}
                >×</button>
              </span>
            ))
          )}
          {maxSelections && (
            <span style={{ marginLeft: 'auto', color: '#9ca3af', fontSize: '0.75rem' }}>
              {selectedArray.length}/{maxSelections}
            </span>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem' }}>
          {Object.entries(data).map(([cat, catData]) => {
            const isCategorySelectable = dataType === 'children' && !catData.children && !catData.codes;
            const isSelected = isCategorySelectable && selectedArray.includes(cat);
            const isDisabled = isCategorySelectable && !isSelected && atLimit;

            return (
              <div key={cat} style={{ marginBottom: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (isCategorySelectable) {
                      if (!isDisabled) handleToggle(cat);
                    } else {
                      toggleCategory(cat);
                    }
                  }}
                  disabled={isDisabled}
                  style={{
                    width: '100%', padding: '0.6rem 0.75rem', textAlign: 'left',
                    fontWeight: 600, fontSize: '0.8rem', borderRadius: '6px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.4 : 1,
                    background: isSelected ? '#dbeafe' : expandedCats[cat] ? '#f3f4f6' : '#fff',
                    border: `1px solid ${isSelected ? '#93c5fd' : '#e5e7eb'}`,
                    color: isSelected ? '#1d4ed8' : '#374151',
                  }}
                >
                  <span>{catData.description || cat}</span>
                  {!isCategorySelectable && (
                    <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>{expandedCats[cat] ? '▲' : '▼'}</span>
                  )}
                </button>

                {expandedCats[cat] && (catData.children || catData.codes || catData.subtypes) && (
                  <div style={{
                    border: '1px solid #e5e7eb', borderTop: 'none',
                    borderRadius: '0 0 6px 6px', padding: '0.75rem', background: '#fafafa'
                  }}>
                    {dataType === 'children' && catData.children &&
                      Object.entries(catData.children).map(([subcat, subData]) => (
                        <div key={subcat} style={{ marginBottom: '0.6rem' }}>
                          <div style={{ color: '#2563eb', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                            {subData.description || subcat}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {subData.codes?.map(item => {
                              const itemSelected = selectedArray.includes(item.value);
                              const itemDisabled = !itemSelected && atLimit;
                              return (
                                <button
                                  key={item.value}
                                  type="button"
                                  onClick={() => !itemDisabled && handleToggle(item.value)}
                                  disabled={itemDisabled}
                                  style={{
                                    padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '4px',
                                    cursor: itemDisabled ? 'not-allowed' : 'pointer',
                                    opacity: itemDisabled ? 0.35 : 1,
                                    background: itemSelected ? '#dbeafe' : '#fff',
                                    border: `1px solid ${itemSelected ? '#93c5fd' : '#d1d5db'}`,
                                    color: itemSelected ? '#1d4ed8' : '#374151',
                                  }}
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
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {catData.codes.map(item => {
                          const itemSelected = selectedArray.includes(item.value);
                          const itemDisabled = !itemSelected && atLimit;
                          return (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => !itemDisabled && handleToggle(item.value)}
                              disabled={itemDisabled}
                              style={{
                                padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '4px',
                                cursor: itemDisabled ? 'not-allowed' : 'pointer',
                                opacity: itemDisabled ? 0.35 : 1,
                                background: itemSelected ? '#dbeafe' : '#fff',
                                border: `1px solid ${itemSelected ? '#93c5fd' : '#d1d5db'}`,
                                color: itemSelected ? '#1d4ed8' : '#374151',
                              }}
                            >
                              {item.description}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {dataType === 'subtypes' && catData.subtypes && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {catData.subtypes.map(item => {
                          const itemSelected = selectedArray.includes(item.value);
                          return (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => handleToggle(item.value)}
                              style={{
                                padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '4px',
                                cursor: 'pointer',
                                background: itemSelected ? '#dbeafe' : '#fff',
                                border: `1px solid ${itemSelected ? '#93c5fd' : '#d1d5db'}`,
                                color: itemSelected ? '#1d4ed8' : '#374151',
                              }}
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
        <div style={{
          padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>
            {selectedArray.length} selected{maxSelections ? ` of ${maxSelections} max` : ''}
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '0.4rem 1rem', fontSize: '0.8rem', fontWeight: 500,
              background: '#2563eb', color: '#fff', border: 'none',
              borderRadius: '5px', cursor: 'pointer'
            }}
          >Done</button>
        </div>
      </div>
    </div>
  );
}
