/**
 * ComCatModal - CAD Comment Categorizer Modal
 * 
 * Allows officers to review and correct ML-assigned comment categories.
 * Officer corrections feed back into ML training data.
 */

import { useState, useEffect } from 'react';
import { useRunSheet } from '../RunSheetContext';

// Category colors and labels
const CATEGORY_STYLES = {
  CALLER: { 
    label: 'Caller Information', 
    color: 'bg-blue-600', 
    textColor: 'text-blue-400',
    borderColor: 'border-blue-600'
  },
  TACTICAL: { 
    label: 'Command & Tactical', 
    color: 'bg-red-600', 
    textColor: 'text-red-400',
    borderColor: 'border-red-600'
  },
  OPERATIONS: { 
    label: 'Operations', 
    color: 'bg-amber-600', 
    textColor: 'text-amber-400',
    borderColor: 'border-amber-600'
  },
  UNIT: { 
    label: 'Unit Activity', 
    color: 'bg-green-600', 
    textColor: 'text-green-400',
    borderColor: 'border-green-600'
  },
  OTHER: { 
    label: 'Other', 
    color: 'bg-gray-600', 
    textColor: 'text-gray-400',
    borderColor: 'border-gray-600'
  },
};

const CATEGORY_ORDER = ['CALLER', 'TACTICAL', 'OPERATIONS', 'UNIT', 'OTHER'];

export default function ComCatModal() {
  const { 
    showComCatModal, 
    setShowComCatModal, 
    incident,
    userSession 
  } = useRunSheet();
  
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [changes, setChanges] = useState({});  // {index: newCategory}
  const [stats, setStats] = useState(null);
  const [filterReviewOnly, setFilterReviewOnly] = useState(false);
  const [mlAvailable, setMlAvailable] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  
  // Fetch comments when modal opens
  useEffect(() => {
    if (showComCatModal && incident?.id) {
      fetchComments();
    }
  }, [showComCatModal, incident?.id]);
  
  const fetchComments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/comcat/comments/${incident.id}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch comments');
      const data = await res.json();
      setComments(data.comments || []);
      setMlAvailable(data.ml_available);
      setConfidenceThreshold(data.confidence_threshold);
      setChanges({});
    } catch (err) {
      console.error('ComCat fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/comcat/stats', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Stats fetch error:', err);
    }
  };
  
  useEffect(() => {
    if (showComCatModal) {
      fetchStats();
    }
  }, [showComCatModal]);
  
  const handleCategoryChange = (index, newCategory) => {
    const original = comments[index]?.category;
    if (newCategory === original && !changes[index]) {
      // No change
      return;
    }
    
    if (newCategory === original) {
      // Reverting to original - remove from changes
      const newChanges = { ...changes };
      delete newChanges[index];
      setChanges(newChanges);
    } else {
      // New change
      setChanges(prev => ({ ...prev, [index]: newCategory }));
    }
  };
  
  const handleSave = async () => {
    const updates = Object.entries(changes).map(([index, category]) => ({
      index: parseInt(index),
      category
    }));
    
    if (updates.length === 0) {
      setShowComCatModal(false);
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/comcat/comments/${incident.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          updates,
          edited_by: userSession?.personnel_id || null
        })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to save');
      }
      
      // Refresh comments to show updated data
      await fetchComments();
      
      // Close modal on success
      setShowComCatModal(false);
    } catch (err) {
      console.error('ComCat save error:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  
  const handleRetrain = async () => {
    if (!confirm('Retrain ML model with current corrections? This may take a moment.')) {
      return;
    }
    
    try {
      const res = await fetch('/api/comcat/retrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ force: true })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Retrain failed');
      }
      
      const data = await res.json();
      alert(`Model retrained with ${data.total_examples} examples. CV Accuracy: ${(data.cv_accuracy * 100).toFixed(1)}%`);
      await fetchStats();
    } catch (err) {
      console.error('Retrain error:', err);
      alert('Retrain failed: ' + err.message);
    }
  };
  
  if (!showComCatModal) return null;
  
  // Filter comments based on filter setting
  const displayComments = filterReviewOnly 
    ? comments.filter(c => c.needs_review && !c.is_noise)
    : comments.filter(c => !c.is_noise);
  
  const reviewCount = comments.filter(c => c.needs_review && !c.is_noise).length;
  const changeCount = Object.keys(changes).length;
  
  return (
    <div 
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-50"
      onClick={() => !saving && setShowComCatModal(false)}
    >
      <div 
        className="bg-dark-bg rounded-lg w-[95%] max-w-[1000px] max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex justify-between items-center">
          <div>
            <h3 className="text-accent-red text-lg font-semibold m-0">
              Comment Categorizer
            </h3>
            <p className="text-gray-500 text-sm m-0 mt-1">
              {incident?.internal_incident_number} • {displayComments.length} comments
              {reviewCount > 0 && (
                <span className="text-amber-400 ml-2">• {reviewCount} need review</span>
              )}
            </p>
          </div>
          <button 
            className="bg-transparent border-none text-gray-500 hover:text-white text-2xl cursor-pointer leading-none p-0"
            onClick={() => !saving && setShowComCatModal(false)}
            disabled={saving}
          >
            ×
          </button>
        </div>
        
        {/* Stats bar */}
        {stats && (
          <div className="px-5 py-2 bg-dark-card border-b border-dark-border flex gap-4 text-xs text-gray-400">
            <span>ML: {stats.ml_available ? (
              <span className="text-green-400">Available</span>
            ) : (
              <span className="text-red-400">Unavailable</span>
            )}</span>
            {stats.ml_available && (
              <>
                <span>Training: {stats.total_training_examples} examples</span>
                <span>Officer corrections: {stats.officer_examples}</span>
                {stats.cv_accuracy && (
                  <span>Accuracy: {(stats.cv_accuracy * 100).toFixed(1)}%</span>
                )}
              </>
            )}
          </div>
        )}
        
        {/* Filter toggle */}
        <div className="px-5 py-2 border-b border-dark-border flex justify-between items-center">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={filterReviewOnly}
              onChange={(e) => setFilterReviewOnly(e.target.checked)}
              className="form-checkbox"
            />
            Show only comments needing review ({reviewCount})
          </label>
          {changeCount > 0 && (
            <span className="text-amber-400 text-sm">{changeCount} unsaved changes</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-center text-gray-400 py-12">Loading comments...</div>
          ) : error ? (
            <div className="text-center text-red-400 py-12">{error}</div>
          ) : displayComments.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              {filterReviewOnly ? 'No comments need review' : 'No comments to display'}
            </div>
          ) : (
            <div className="space-y-2">
              {displayComments.map((comment, idx) => {
                const actualIndex = comments.findIndex(c => c === comment);
                const currentCategory = changes[actualIndex] || comment.category;
                const hasChange = changes[actualIndex] !== undefined;
                const style = CATEGORY_STYLES[currentCategory] || CATEGORY_STYLES.OTHER;
                
                return (
                  <div 
                    key={actualIndex}
                    className={`
                      bg-dark-card rounded border-l-4 p-3 flex gap-4 items-start
                      ${style.borderColor}
                      ${hasChange ? 'ring-1 ring-amber-500/50' : ''}
                      ${comment.needs_review ? 'bg-dark-card/80' : ''}
                    `}
                  >
                    {/* Time */}
                    <div className="text-gray-500 text-sm font-mono w-20 shrink-0">
                      {comment.time}
                    </div>
                    
                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-200 text-sm break-words">
                        {comment.text}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        <span>{comment.operator}</span>
                        {comment.category_source === 'ML' && (
                          <span className={comment.needs_review ? 'text-amber-400' : 'text-gray-400'}>
                            ML: {(comment.category_confidence * 100).toFixed(0)}%
                            {comment.needs_review && ' ⚠️'}
                          </span>
                        )}
                        {comment.category_source === 'PATTERN' && (
                          <span className="text-blue-400">Pattern</span>
                        )}
                        {comment.category_source === 'OFFICER' && (
                          <span className="text-green-400">Officer ✓</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Category selector */}
                    <div className="shrink-0">
                      <select
                        value={currentCategory}
                        onChange={(e) => handleCategoryChange(actualIndex, e.target.value)}
                        className={`
                          form-select text-sm py-1 px-2 rounded border-0
                          ${style.color} text-white
                          ${hasChange ? 'ring-2 ring-amber-400' : ''}
                        `}
                        disabled={saving}
                      >
                        {CATEGORY_ORDER.map(cat => (
                          <option key={cat} value={cat}>
                            {CATEGORY_STYLES[cat]?.label || cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-dark-border flex justify-between items-center gap-3">
          <div className="flex gap-2">
            {mlAvailable && (
              <button 
                className="btn btn-secondary text-sm"
                onClick={handleRetrain}
                disabled={saving}
                title="Retrain ML model with all corrections"
              >
                🔄 Retrain Model
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowComCatModal(false)}
              disabled={saving}
            >
              Cancel
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handleSave}
              disabled={saving || changeCount === 0}
            >
              {saving ? 'Saving...' : `Save ${changeCount > 0 ? `(${changeCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
