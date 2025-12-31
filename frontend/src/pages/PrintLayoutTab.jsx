import { useState, useEffect } from 'react';
import { getPrintLayout, updatePrintLayout, resetPrintLayout } from '../api';

const WIDTH_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '1/4', label: '25%' },
  { value: '1/3', label: '33%' },
  { value: '1/2', label: '50%' },
  { value: '2/3', label: '67%' },
  { value: '3/4', label: '75%' },
  { value: 'full', label: '100%' },
];

const SIZE_OPTIONS = [
  { value: 'xs', label: 'XS (10px)' },
  { value: 'sm', label: 'Small (12px)' },
  { value: 'base', label: 'Normal (14px)' },
  { value: 'lg', label: 'Large (16px)' },
  { value: 'xl', label: 'XL (18px)' },
];

export default function PrintLayoutTab() {
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedBlock, setExpandedBlock] = useState(null);

  useEffect(() => {
    loadLayout();
  }, []);

  const loadLayout = async () => {
    try {
      setLoading(true);
      const res = await getPrintLayout();
      setLayout(res.data);
      setHasChanges(false);
    } catch (err) {
      setError('Failed to load layout');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updatePrintLayout(layout);
      setHasChanges(false);
      setError(null);
    } catch (err) {
      setError('Failed to save layout');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset to default V4 layout? This will replace your current layout.')) return;
    try {
      await resetPrintLayout();
      await loadLayout();
    } catch (err) {
      setError('Failed to reset');
    }
  };

  const updateBlock = (blockId, updates) => {
    setLayout(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => 
        b.id === blockId ? { ...b, ...updates } : b
      )
    }));
    setHasChanges(true);
  };

  const toggleBlock = (blockId) => {
    const block = layout.blocks.find(b => b.id === blockId);
    updateBlock(blockId, { enabled: !block.enabled });
  };

  const moveToPage = (blockId, targetPage) => {
    const block = layout.blocks.find(b => b.id === blockId);
    if (block?.locked) return;
    updateBlock(blockId, { page: targetPage });
  };

  if (loading) return <div className="p-4">Loading...</div>;

  // Group blocks by page, then by row
  const getPageRows = (page) => {
    const pageBlocks = layout?.blocks?.filter(b => b.page === page) || [];
    const rows = {};
    
    pageBlocks.forEach(block => {
      const rowNum = block.row ?? 99;
      if (!rows[rowNum]) rows[rowNum] = [];
      rows[rowNum].push(block);
    });
    
    // Sort blocks within each row by order
    Object.keys(rows).forEach(rowNum => {
      rows[rowNum].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    });
    
    return rows;
  };

  const page1Rows = getPageRows(1);
  const page2Rows = getPageRows(2);
  
  const page1Enabled = layout?.blocks?.filter(b => b.page === 1 && b.enabled).length || 0;
  const page2Enabled = layout?.blocks?.filter(b => b.page === 2 && b.enabled).length || 0;

  const renderBlock = (block, page) => {
    const isExpanded = expandedBlock === block.id;
    
    return (
      <div
        key={block.id}
        className={`
          border rounded mb-1 overflow-hidden
          ${block.locked ? 'bg-gray-700 border-gray-600' : 'bg-gray-800 border-gray-600'}
          ${!block.enabled ? 'opacity-60' : ''}
        `}
      >
        {/* Main row - always visible */}
        <div className="flex items-center gap-2 p-2">
          {/* Lock/expand indicator */}
          <button
            onClick={() => setExpandedBlock(isExpanded ? null : block.id)}
            className="text-gray-400 hover:text-white w-5"
            disabled={block.locked && block.id !== 'footer'}
          >
            {block.locked && block.id !== 'footer' ? '[L]' : (isExpanded ? '[-]' : '[+]')}
          </button>
          
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={block.enabled}
            onChange={() => toggleBlock(block.id)}
            className="w-4 h-4"
          />
          
          {/* Name */}
          <span className={`flex-1 text-sm ${!block.enabled ? 'text-gray-500' : 'text-white'}`}>
            {block.name}
          </span>
          
          {/* Quick info badges */}
          <span className="text-xs text-gray-500 font-mono">
            R{block.row ?? '?'}.{block.order ?? '?'}
          </span>
          
          <span className="text-xs bg-gray-700 text-gray-300 px-1 rounded">
            {block.width || 'auto'}
          </span>
          
          {/* Font size badge (if not default) */}
          {block.fontSize && block.fontSize !== 'base' && (
            <span className="text-xs bg-purple-700 text-white px-1 rounded">
              {block.fontSize}
            </span>
          )}
          
          {/* Bold badge */}
          {block.bold && (
            <span className="text-xs bg-yellow-600 text-white px-1 rounded font-bold">B</span>
          )}
          
          {block.fireOnly && (
            <span className="text-xs bg-red-600 text-white px-1 rounded">FIRE</span>
          )}
          
          {block.float && (
            <span className="text-xs bg-blue-600 text-white px-1 rounded">float</span>
          )}
          
          {block.headerPosition && (
            <span className="text-xs bg-cyan-600 text-white px-1 rounded">hdr</span>
          )}
          
          {block.stickyFooter && (
            <span className="text-xs bg-orange-600 text-white px-1 rounded">sticky</span>
          )}
          
          {/* Move button */}
          {!block.locked && (
            <button
              onClick={() => moveToPage(block.id, page === 1 ? 2 : 1)}
              className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded"
            >
              {page === 1 ? '> P2' : '< P1'}
            </button>
          )}
        </div>
        
        {/* Expanded controls */}
        {isExpanded && (!block.locked || block.id === 'footer') && (
          <div className="px-2 pb-2 pt-1 border-t border-gray-700 bg-gray-750">
            {/* Row 1: Position controls */}
            <div className="grid grid-cols-4 gap-2 mb-2">
              {/* Row */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Row</label>
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={block.row ?? 1}
                  onChange={(e) => updateBlock(block.id, { row: parseInt(e.target.value) || 1 })}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                />
              </div>
              
              {/* Order */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Order</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={block.order ?? 1}
                  onChange={(e) => updateBlock(block.id, { order: parseInt(e.target.value) || 1 })}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                />
              </div>
              
              {/* Width */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Width</label>
                <select
                  value={block.width || 'auto'}
                  onChange={(e) => updateBlock(block.id, { width: e.target.value })}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                >
                  {WIDTH_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Page */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Page</label>
                <select
                  value={block.page}
                  onChange={(e) => updateBlock(block.id, { page: parseInt(e.target.value) })}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                >
                  <option value={1}>Page 1</option>
                  <option value={2}>Page 2</option>
                </select>
              </div>
            </div>
            
            {/* Row 2: Style controls */}
            <div className="grid grid-cols-4 gap-2">
              {/* Font Size */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Font Size</label>
                <select
                  value={block.fontSize || 'base'}
                  onChange={(e) => updateBlock(block.id, { fontSize: e.target.value })}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                >
                  {SIZE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Bold */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Bold</label>
                <button
                  onClick={() => updateBlock(block.id, { bold: !block.bold })}
                  className={`w-full px-2 py-1 rounded text-sm font-bold ${
                    block.bold 
                      ? 'bg-yellow-600 text-white' 
                      : 'bg-gray-700 border border-gray-600 text-gray-400'
                  }`}
                >
                  {block.bold ? 'Bold ON' : 'Bold OFF'}
                </button>
              </div>
              
              {/* Label Bold (for label: value fields) */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Label Bold</label>
                <button
                  onClick={() => updateBlock(block.id, { labelBold: !block.labelBold })}
                  className={`w-full px-2 py-1 rounded text-sm ${
                    block.labelBold !== false
                      ? 'bg-green-700 text-white' 
                      : 'bg-gray-700 border border-gray-600 text-gray-400'
                  }`}
                >
                  {block.labelBold !== false ? 'ON' : 'OFF'}
                </button>
              </div>
              
              {/* Hide Label */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Hide Label</label>
                <button
                  onClick={() => updateBlock(block.id, { hideLabel: !block.hideLabel })}
                  className={`w-full px-2 py-1 rounded text-sm ${
                    block.hideLabel 
                      ? 'bg-red-700 text-white' 
                      : 'bg-gray-700 border border-gray-600 text-gray-400'
                  }`}
                >
                  {block.hideLabel ? 'Hidden' : 'Visible'}
                </button>
              </div>
            </div>
            
            {/* Row 3: Special options for times_group */}
            {block.id === 'times_group' && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Position in Header</label>
                  <button
                    onClick={() => updateBlock(block.id, { headerPosition: !block.headerPosition })}
                    className={`w-full px-2 py-1 rounded text-sm ${
                      block.headerPosition 
                        ? 'bg-cyan-600 text-white' 
                        : 'bg-gray-700 border border-gray-600 text-gray-400'
                    }`}
                  >
                    {block.headerPosition ? 'In Header (above line)' : 'Below Header'}
                  </button>
                </div>
              </div>
            )}
            
            {/* Row 3: Special options for footer */}
            {block.id === 'footer' && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Sticky Footer</label>
                  <button
                    onClick={() => updateBlock(block.id, { stickyFooter: !block.stickyFooter })}
                    className={`w-full px-2 py-1 rounded text-sm ${
                      block.stickyFooter 
                        ? 'bg-orange-600 text-white' 
                        : 'bg-gray-700 border border-gray-600 text-gray-400'
                    }`}
                  >
                    {block.stickyFooter ? 'Sticky (bottom of page)' : 'Normal (after content)'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderPage = (pageNum, rows, enabledCount) => {
    const sortedRowNums = Object.keys(rows).map(Number).sort((a, b) => a - b);
    
    return (
      <div className="bg-gray-900 p-3 rounded min-h-96">
        <h3 className="font-bold mb-2 text-sm">
          Page {pageNum} <span className="text-gray-500">({enabledCount} enabled)</span>
        </h3>
        
        {sortedRowNums.map(rowNum => (
          <div key={rowNum} className="mb-2">
            {/* Row header */}
            <div className="text-xs text-gray-500 mb-1 flex items-center gap-2">
              <span className="bg-gray-700 px-2 py-0.5 rounded">Row {rowNum}</span>
              <span className="text-gray-600">
                {rows[rowNum].length} field{rows[rowNum].length !== 1 ? 's' : ''}
                {rows[rowNum].length > 1 && ' (side-by-side)'}
              </span>
            </div>
            
            {/* Row blocks */}
            <div className="pl-2 border-l-2 border-gray-700">
              {rows[rowNum].map(block => renderBlock(block, pageNum))}
            </div>
          </div>
        ))}
        
        {sortedRowNums.length === 0 && (
          <div className="text-gray-500 text-sm p-4 text-center">No fields on this page</div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold">Print Layout Designer</h2>
          <p className="text-sm text-gray-400">
            V{layout?.version || '?'} - Click [+] to edit position and style. Same row = side-by-side.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
          >
            Reset to V4 Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`px-4 py-1 rounded text-sm ${
              hasChanges ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-600'
            }`}
          >
            {saving ? 'Saving...' : 'Save Layout'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900 text-red-200 p-2 rounded mb-4">{error}</div>
      )}
      
      {hasChanges && (
        <div className="bg-yellow-900 text-yellow-200 p-2 rounded mb-4">
          Unsaved changes
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {renderPage(1, page1Rows, page1Enabled)}
        {renderPage(2, page2Rows, page2Enabled)}
      </div>

      <div className="mt-4 p-3 bg-gray-800 rounded text-xs text-gray-400">
        <strong>V4 Layout Tips:</strong><br/>
        - <strong>Row</strong> - Fields with same row number appear side-by-side<br/>
        - <strong>Order</strong> - Left-to-right order within a row (1 = leftmost)<br/>
        - <strong>Width</strong> - Horizontal space: auto, 25%, 33%, 50%, 67%, 75%, 100%<br/>
        - <strong>Font Size</strong> - XS (10px) to XL (18px)<br/>
        - <strong>Bold</strong> - Make the entire field bold<br/>
        - <strong>Label Bold</strong> - Bold just the label (e.g., "Address:")<br/>
        - <strong>Hide Label</strong> - Show only the value, no label<br/>
        - <span className="bg-blue-600 text-white px-1 rounded">float</span> fields position absolutely (like Times)
      </div>
    </div>
  );
}
