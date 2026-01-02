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

  if (loading) return <div className="p-4 text-gray-600">Loading...</div>;

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
          ${block.locked ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-300'}
          ${!block.enabled ? 'opacity-60' : ''}
        `}
      >
        {/* Main row - always visible */}
        <div className="flex items-center gap-2 p-2">
          {/* Lock/expand indicator */}
          <button
            onClick={() => setExpandedBlock(isExpanded ? null : block.id)}
            className="text-gray-500 hover:text-gray-800 w-5"
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
          <span className={`flex-1 text-sm ${!block.enabled ? 'text-gray-400' : 'text-gray-800'}`}>
            {block.name}
          </span>
          
          {/* Quick info badges */}
          <span className="text-xs text-gray-500 font-mono">
            R{block.row ?? '?'}.{block.order ?? '?'}
          </span>
          
          <span className="text-xs bg-gray-200 text-gray-700 px-1 rounded">
            {block.width || 'auto'}
          </span>
          
          {/* Font size badge (if not default) */}
          {block.fontSize && block.fontSize !== 'base' && (
            <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded border border-purple-300">
              {block.fontSize}
            </span>
          )}
          
          {/* Bold badge */}
          {block.bold && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-1 rounded border border-yellow-400 font-bold">B</span>
          )}
          
          {block.fireOnly && (
            <span className="text-xs bg-red-100 text-red-700 px-1 rounded border border-red-300">FIRE</span>
          )}
          
          {block.float && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded border border-blue-300">float</span>
          )}
          
          {block.headerPosition && (
            <span className="text-xs bg-cyan-100 text-cyan-700 px-1 rounded border border-cyan-300">hdr</span>
          )}
          
          {block.stickyFooter && (
            <span className="text-xs bg-orange-100 text-orange-700 px-1 rounded border border-orange-300">sticky</span>
          )}
          
          {block.showWhenEmpty && (
            <span className="text-xs bg-green-100 text-green-700 px-1 rounded border border-green-300">show∅</span>
          )}
          
          {/* Move button */}
          {!block.locked && (
            <button
              onClick={() => moveToPage(block.id, page === 1 ? 2 : 1)}
              className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-700"
            >
              {page === 1 ? '> P2' : '< P1'}
            </button>
          )}
        </div>
        
        {/* Expanded controls */}
        {isExpanded && (!block.locked || block.id === 'footer') && (
          <div className="px-2 pb-2 pt-1 border-t border-gray-200 bg-gray-50">
            {/* Row 1: Position controls */}
            <div className="grid grid-cols-4 gap-2 mb-2">
              {/* Row */}
              <div>
                <label className="text-xs text-gray-600 block mb-1">Row</label>
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={block.row ?? 1}
                  onChange={(e) => updateBlock(block.id, { row: parseInt(e.target.value) || 1 })}
                  className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-sm text-gray-800"
                />
              </div>
              
              {/* Order */}
              <div>
                <label className="text-xs text-gray-600 block mb-1">Order</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={block.order ?? 1}
                  onChange={(e) => updateBlock(block.id, { order: parseInt(e.target.value) || 1 })}
                  className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-sm text-gray-800"
                />
              </div>
              
              {/* Width */}
              <div>
                <label className="text-xs text-gray-600 block mb-1">Width</label>
                <select
                  value={block.width || 'auto'}
                  onChange={(e) => updateBlock(block.id, { width: e.target.value })}
                  className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-sm text-gray-800"
                >
                  {WIDTH_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Page */}
              <div>
                <label className="text-xs text-gray-600 block mb-1">Page</label>
                <select
                  value={block.page}
                  onChange={(e) => updateBlock(block.id, { page: parseInt(e.target.value) })}
                  className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-sm text-gray-800"
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
                <label className="text-xs text-gray-600 block mb-1">Font Size</label>
                <select
                  value={block.fontSize || 'base'}
                  onChange={(e) => updateBlock(block.id, { fontSize: e.target.value })}
                  className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-sm text-gray-800"
                >
                  {SIZE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Bold */}
              <div>
                <label className="text-xs text-gray-600 block mb-1">Bold</label>
                <button
                  onClick={() => updateBlock(block.id, { bold: !block.bold })}
                  className={`w-full px-2 py-1 rounded text-sm font-bold ${
                    block.bold 
                      ? 'bg-yellow-400 text-yellow-900 border border-yellow-500' 
                      : 'bg-white border border-gray-300 text-gray-500'
                  }`}
                >
                  {block.bold ? 'Bold ON' : 'Bold OFF'}
                </button>
              </div>
              
              {/* Label Bold (for label: value fields) */}
              <div>
                <label className="text-xs text-gray-600 block mb-1">Label Bold</label>
                <button
                  onClick={() => updateBlock(block.id, { labelBold: !block.labelBold })}
                  className={`w-full px-2 py-1 rounded text-sm ${
                    block.labelBold !== false
                      ? 'bg-green-500 text-white border border-green-600' 
                      : 'bg-white border border-gray-300 text-gray-500'
                  }`}
                >
                  {block.labelBold !== false ? 'ON' : 'OFF'}
                </button>
              </div>
              
              {/* Hide Label */}
              <div>
                <label className="text-xs text-gray-600 block mb-1">Hide Label</label>
                <button
                  onClick={() => updateBlock(block.id, { hideLabel: !block.hideLabel })}
                  className={`w-full px-2 py-1 rounded text-sm ${
                    block.hideLabel 
                      ? 'bg-red-500 text-white border border-red-600' 
                      : 'bg-white border border-gray-300 text-gray-500'
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
                  <label className="text-xs text-gray-600 block mb-1">Position in Header</label>
                  <button
                    onClick={() => updateBlock(block.id, { headerPosition: !block.headerPosition })}
                    className={`w-full px-2 py-1 rounded text-sm ${
                      block.headerPosition 
                        ? 'bg-cyan-500 text-white border border-cyan-600' 
                        : 'bg-white border border-gray-300 text-gray-500'
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
                  <label className="text-xs text-gray-600 block mb-1">Sticky Footer</label>
                  <button
                    onClick={() => updateBlock(block.id, { stickyFooter: !block.stickyFooter })}
                    className={`w-full px-2 py-1 rounded text-sm ${
                      block.stickyFooter 
                        ? 'bg-orange-500 text-white border border-orange-600' 
                        : 'bg-white border border-gray-300 text-gray-500'
                    }`}
                  >
                    {block.stickyFooter ? 'Sticky (bottom of page)' : 'Normal (after content)'}
                  </button>
                </div>
              </div>
            )}
            
            {/* Row 3: Special options for personnel blocks */}
            {['personnel_apparatus', 'personnel_direct', 'personnel_station'].includes(block.id) && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                <div className="col-span-2">
                  <label className="text-xs text-gray-600 block mb-1">Show When Empty</label>
                  <button
                    onClick={() => updateBlock(block.id, { showWhenEmpty: !block.showWhenEmpty })}
                    className={`w-full px-2 py-1 rounded text-sm ${
                      block.showWhenEmpty 
                        ? 'bg-green-500 text-white border border-green-600' 
                        : 'bg-white border border-gray-300 text-gray-500'
                    }`}
                  >
                    {block.showWhenEmpty ? 'Show table even if empty' : 'Hide when no assignments'}
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
      <div className="bg-gray-100 p-3 rounded border border-gray-300 min-h-96">
        <h3 className="font-bold mb-2 text-sm text-gray-800">
          Page {pageNum} <span className="text-gray-500">({enabledCount} enabled)</span>
        </h3>
        
        {sortedRowNums.map(rowNum => (
          <div key={rowNum} className="mb-2">
            {/* Row header */}
            <div className="text-xs text-gray-500 mb-1 flex items-center gap-2">
              <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded">Row {rowNum}</span>
              <span className="text-gray-500">
                {rows[rowNum].length} field{rows[rowNum].length !== 1 ? 's' : ''}
                {rows[rowNum].length > 1 && ' (side-by-side)'}
              </span>
            </div>
            
            {/* Row blocks */}
            <div className="pl-2 border-l-2 border-gray-300">
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
          <h2 className="text-xl font-bold text-gray-800" style={{ color: 'var(--primary-color)' }}>Print Layout Designer</h2>
          <p className="text-sm text-gray-600">
            V{layout?.version || '?'} - Click [+] to edit position and style. Same row = side-by-side.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm text-gray-700 border border-gray-300"
          >
            Reset to V4 Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`px-4 py-1 rounded text-sm text-white ${
              hasChanges ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400'
            }`}
            style={hasChanges ? { backgroundColor: 'var(--primary-color)' } : {}}
          >
            {saving ? 'Saving...' : 'Save Layout'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 border border-red-300 p-2 rounded mb-4">{error}</div>
      )}
      
      {hasChanges && (
        <div className="bg-yellow-100 text-yellow-800 border border-yellow-400 p-2 rounded mb-4">
          Unsaved changes
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {renderPage(1, page1Rows, page1Enabled)}
        {renderPage(2, page2Rows, page2Enabled)}
      </div>

      <div className="mt-4 p-3 bg-white rounded border border-gray-300 text-xs text-gray-600">
        <strong className="text-gray-800">V4 Layout Tips:</strong><br/>
        - <strong>Row</strong> - Fields with same row number appear side-by-side<br/>
        - <strong>Order</strong> - Left-to-right order within a row (1 = leftmost)<br/>
        - <strong>Width</strong> - Horizontal space: auto, 25%, 33%, 50%, 67%, 75%, 100%<br/>
        - <strong>Font Size</strong> - XS (10px) to XL (18px)<br/>
        - <strong>Bold</strong> - Make the entire field bold<br/>
        - <strong>Label Bold</strong> - Bold just the label (e.g., "Address:")<br/>
        - <strong>Hide Label</strong> - Show only the value, no label<br/>
        - <span className="bg-blue-100 text-blue-700 px-1 rounded border border-blue-300">float</span> fields position absolutely (like Times)
      </div>
    </div>
  );
}
