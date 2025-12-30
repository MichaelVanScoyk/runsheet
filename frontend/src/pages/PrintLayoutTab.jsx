import { useState, useEffect } from 'react';
import { getPrintLayout, updatePrintLayout, resetPrintLayout } from '../api';

export default function PrintLayoutTab() {
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [draggedBlock, setDraggedBlock] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);

  useEffect(() => {
    loadLayout();
  }, []);

  const loadLayout = async () => {
    try {
      setLoading(true);
      const data = await getPrintLayout();
      setLayout(data);
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
    if (!confirm('Reset to default layout?')) return;
    try {
      await resetPrintLayout();
      await loadLayout();
    } catch (err) {
      setError('Failed to reset');
    }
  };

  const toggleBlock = (blockId) => {
    setLayout(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => 
        b.id === blockId ? { ...b, enabled: !b.enabled } : b
      )
    }));
    setHasChanges(true);
  };

  const moveToPage = (blockId, targetPage) => {
    const block = layout.blocks.find(b => b.id === blockId);
    if (block?.locked) return;
    
    setLayout(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => 
        b.id === blockId ? { ...b, page: targetPage } : b
      )
    }));
    setHasChanges(true);
  };

  // Drag handlers
  const handleDragStart = (e, block) => {
    if (block.locked) {
      e.preventDefault();
      return;
    }
    setDraggedBlock(block);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, targetBlock) => {
    e.preventDefault();
    if (!draggedBlock || draggedBlock.id === targetBlock.id) return;
    setDragOverTarget(targetBlock.id);
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  const handleDrop = (e, targetBlock, targetPage) => {
    e.preventDefault();
    if (!draggedBlock) return;
    
    const blocks = [...layout.blocks];
    const dragIdx = blocks.findIndex(b => b.id === draggedBlock.id);
    const dropIdx = blocks.findIndex(b => b.id === targetBlock.id);
    
    // Update page
    blocks[dragIdx] = { ...blocks[dragIdx], page: targetPage };
    
    // Reorder
    const pageBlocks = blocks.filter(b => b.page === targetPage && b.id !== 'footer');
    const targetOrder = targetBlock.order;
    
    pageBlocks.forEach((b, i) => {
      if (b.id === draggedBlock.id) {
        b.order = targetOrder;
      } else if (b.order >= targetOrder) {
        b.order = b.order + 1;
      }
    });
    
    // Renumber
    pageBlocks.sort((a, b) => a.order - b.order);
    pageBlocks.forEach((b, i) => { b.order = i + 1; });
    
    setLayout({ ...layout, blocks });
    setDraggedBlock(null);
    setDragOverTarget(null);
    setHasChanges(true);
  };

  const handleDropOnPage = (e, targetPage) => {
    e.preventDefault();
    if (!draggedBlock || draggedBlock.locked) return;
    
    setLayout(prev => {
      const blocks = prev.blocks.map(b => {
        if (b.id === draggedBlock.id) {
          const pageBlocks = prev.blocks.filter(x => x.page === targetPage);
          const maxOrder = Math.max(...pageBlocks.map(x => x.order), 0);
          return { ...b, page: targetPage, order: maxOrder + 1 };
        }
        return b;
      });
      return { ...prev, blocks };
    });
    
    setDraggedBlock(null);
    setDragOverTarget(null);
    setHasChanges(true);
  };

  const handleDragEnd = () => {
    setDraggedBlock(null);
    setDragOverTarget(null);
  };

  if (loading) return <div className="p-4">Loading...</div>;

  const page1Blocks = layout?.blocks?.filter(b => b.page === 1).sort((a, b) => a.order - b.order) || [];
  const page2Blocks = layout?.blocks?.filter(b => b.page === 2).sort((a, b) => a.order - b.order) || [];
  const page1Enabled = page1Blocks.filter(b => b.enabled).length;
  const page2Enabled = page2Blocks.filter(b => b.enabled).length;

  const renderBlock = (block, page) => {
    const isDragging = draggedBlock?.id === block.id;
    const isDragOver = dragOverTarget === block.id;
    
    return (
      <div
        key={block.id}
        draggable={!block.locked}
        onDragStart={(e) => handleDragStart(e, block)}
        onDragOver={(e) => handleDragOver(e, block)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, block, page)}
        onDragEnd={handleDragEnd}
        className={`
          flex items-center gap-2 p-2 rounded border mb-1
          ${isDragging ? 'opacity-50' : ''}
          ${isDragOver ? 'border-blue-500 border-2' : 'border-gray-600'}
          ${block.locked ? 'bg-gray-700' : 'bg-gray-800 cursor-move'}
        `}
      >
        {/* Drag handle */}
        <span className="text-gray-500">{block.locked ? '🔒' : '⋮⋮'}</span>
        
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
        
        {/* Fire badge */}
        {block.fireOnly && (
          <span className="text-xs bg-red-600 text-white px-1 rounded">FIRE</span>
        )}
        
        {/* Move button */}
        {!block.locked && (
          <button
            onClick={() => moveToPage(block.id, page === 1 ? 2 : 1)}
            className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded"
          >
            {page === 1 ? '→ P2' : '← P1'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold">Print Layout Designer</h2>
          <p className="text-sm text-gray-400">Drag fields to reorder. Toggle visibility. Move between pages.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
          >
            Reset to Defaults
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
        {/* Page 1 */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDropOnPage(e, 1)}
          className="bg-gray-900 p-3 rounded min-h-96"
        >
          <h3 className="font-bold mb-2 text-sm">
            📄 Page 1 <span className="text-gray-500">({page1Enabled} enabled)</span>
          </h3>
          {page1Blocks.map(b => renderBlock(b, 1))}
        </div>

        {/* Page 2 */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDropOnPage(e, 2)}
          className="bg-gray-900 p-3 rounded min-h-96"
        >
          <h3 className="font-bold mb-2 text-sm">
            📄 Page 2 <span className="text-gray-500">({page2Enabled} enabled)</span>
          </h3>
          {page2Blocks.map(b => renderBlock(b, 2))}
        </div>
      </div>

      <div className="mt-4 p-3 bg-gray-800 rounded text-xs text-gray-400">
        <strong>Tips:</strong><br/>
        • Page 1 — Main report content<br/>
        • Page 2 — Extended details, CAD unit table, NERIS data<br/>
        • 🔥 FIRE fields only appear on FIRE incidents<br/>
        • 🔒 Footer cannot be moved<br/>
        • Disabled fields won't print
      </div>
    </div>
  );
}
