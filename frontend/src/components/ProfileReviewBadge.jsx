/**
 * ProfileReviewBadge - Sidebar notification for personnel needing profile review
 * 
 * Shows a badge when there are personnel records that were manually added
 * (e.g., during roll call attendance) and need their profiles completed.
 * 
 * Only visible to Officers and Admins.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPersonnelNeedingReview, completeProfileReview, updatePersonnel, getRanks } from '../api';

export default function ProfileReviewBadge({ userSession, primaryColor }) {
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [personnel, setPersonnel] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ rank_id: '', email: '' });
  const dropdownRef = useRef(null);

  // Only Officers and Admins can see this
  const canView = userSession?.role === 'OFFICER' || userSession?.role === 'ADMIN';

  // Fetch count
  const fetchCount = async () => {
    try {
      const res = await getPersonnelNeedingReview();
      setPendingCount(res.data.count || 0);
      setPersonnel(res.data.personnel || []);
    } catch (err) {
      console.error('Failed to fetch personnel needing review:', err);
    }
  };

  // Load ranks for dropdown
  useEffect(() => {
    if (!canView) return;
    getRanks()
      .then(res => setRanks(res.data || []))
      .catch(err => console.error('Failed to load ranks:', err));
  }, [canView]);

  // Fetch on mount and every 60 seconds
  useEffect(() => {
    if (!canView) return;

    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [canView]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
        setEditingId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Start editing a person
  const handleEdit = (person) => {
    setEditingId(person.id);
    setEditForm({
      rank_id: person.rank_id || '',
      email: person.email || ''
    });
  };

  // Save changes and mark as reviewed
  const handleSave = async (personId) => {
    setLoading(true);
    try {
      // Update the person's profile
      await updatePersonnel(personId, {
        rank_id: editForm.rank_id || null,
        email: editForm.email || null
      });
      // Mark as reviewed
      await completeProfileReview(personId);
      // Refresh
      await fetchCount();
      setEditingId(null);
    } catch (err) {
      console.error('Failed to save profile:', err);
      alert(err.response?.data?.detail || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  // Skip review (just clear the flag without updating)
  const handleSkip = async (personId) => {
    setLoading(true);
    try {
      await completeProfileReview(personId);
      await fetchCount();
    } catch (err) {
      console.error('Failed to skip review:', err);
    } finally {
      setLoading(false);
    }
  };

  // Navigate to full personnel page
  const handleGoToPersonnel = () => {
    setShowDropdown(false);
    navigate('/admin');
    // Could potentially deep-link to personnel tab
  };

  if (!canView) return null;

  const hasPending = pendingCount > 0;

  if (!hasPending) return null; // Don't show if nothing to review

  return (
    <div className="profile-review-container" ref={dropdownRef}>
      <button
        className="profile-review-badge"
        onClick={() => setShowDropdown(!showDropdown)}
        title={`${pendingCount} personnel need profile review`}
      >
        <span className="profile-icon">👤</span>
        <span className="profile-label">Profile Review</span>
        <span className="profile-count">{pendingCount}</span>
      </button>

      {showDropdown && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-header">
            <span className="profile-dropdown-title">Needs Profile Review</span>
            <span className="profile-dropdown-count">{pendingCount} new</span>
          </div>

          <div className="profile-dropdown-info">
            These personnel were manually added during roll call and need their profiles completed.
          </div>

          {personnel.length === 0 ? (
            <div className="profile-empty">No pending reviews</div>
          ) : (
            <div className="profile-list">
              {personnel.map((person) => (
                <div key={person.id} className="profile-item">
                  {editingId === person.id ? (
                    // Edit mode
                    <div className="profile-edit-form">
                      <div className="profile-name">{person.display_name}</div>
                      <div className="profile-form-row">
                        <label>Rank:</label>
                        <select
                          value={editForm.rank_id}
                          onChange={(e) => setEditForm({ ...editForm, rank_id: e.target.value })}
                        >
                          <option value="">-- Select --</option>
                          {ranks.map(r => (
                            <option key={r.id} value={r.id}>{r.rank_name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="profile-form-row">
                        <label>Email:</label>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          placeholder="email@example.com"
                        />
                      </div>
                      <div className="profile-form-actions">
                        <button 
                          onClick={() => handleSave(person.id)}
                          disabled={loading}
                          className="btn-save"
                        >
                          {loading ? '...' : 'Save'}
                        </button>
                        <button 
                          onClick={() => setEditingId(null)}
                          disabled={loading}
                          className="btn-cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <div className="profile-view">
                      <div className="profile-info">
                        <span className="profile-name">{person.display_name}</span>
                        <span className="profile-meta">
                          {person.rank_id ? '' : 'No rank'} 
                          {!person.rank_id && !person.email ? ' • ' : ''}
                          {person.email ? '' : 'No email'}
                        </span>
                      </div>
                      <div className="profile-actions">
                        <button onClick={() => handleEdit(person)} className="btn-edit">
                          Edit
                        </button>
                        <button onClick={() => handleSkip(person.id)} className="btn-skip" title="Mark as reviewed without changes">
                          Skip
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="profile-dropdown-footer">
            <button onClick={handleGoToPersonnel} className="btn-go-personnel">
              Go to Personnel Page →
            </button>
          </div>
        </div>
      )}

      <style>{`
        .profile-review-container {
          position: relative;
          margin-top: 0.5rem;
        }

        .profile-review-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.65rem 0.75rem;
          background: #fffbeb;
          border: 1px solid #fbbf24;
          border-left: 3px solid #f59e0b;
          border-radius: 6px;
          cursor: pointer;
          color: #92400e;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.15s;
        }

        .profile-review-badge:hover {
          background: #fef3c7;
        }

        .profile-icon {
          font-size: 1rem;
        }

        .profile-label {
          flex: 1;
          text-align: left;
        }

        .profile-count {
          background: #f59e0b;
          color: #fff;
          padding: 0.15rem 0.5rem;
          border-radius: 10px;
          font-size: 0.75rem;
          font-weight: 600;
          min-width: 20px;
          text-align: center;
        }

        .profile-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 4px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-top: 3px solid #f59e0b;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1000;
          max-height: 450px;
          overflow-y: auto;
        }

        .profile-dropdown-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
          background: #fffbeb;
        }

        .profile-dropdown-title {
          font-weight: 600;
          color: #92400e;
          font-size: 0.9rem;
        }

        .profile-dropdown-count {
          font-size: 0.75rem;
          color: #b45309;
        }

        .profile-dropdown-info {
          padding: 0.5rem 0.75rem;
          background: #f9fafb;
          font-size: 0.75rem;
          color: #6b7280;
          border-bottom: 1px solid #e5e7eb;
        }

        .profile-empty {
          padding: 1.5rem;
          text-align: center;
          color: #9ca3af;
          font-size: 0.85rem;
        }

        .profile-list {
          padding: 0.5rem 0;
        }

        .profile-item {
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid #f3f4f6;
        }

        .profile-item:last-child {
          border-bottom: none;
        }

        .profile-view {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .profile-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .profile-name {
          font-weight: 500;
          font-size: 0.85rem;
          color: #111827;
        }

        .profile-meta {
          font-size: 0.7rem;
          color: #9ca3af;
        }

        .profile-actions {
          display: flex;
          gap: 4px;
        }

        .btn-edit, .btn-skip, .btn-save, .btn-cancel {
          padding: 4px 8px;
          font-size: 0.7rem;
          border-radius: 4px;
          cursor: pointer;
          border: 1px solid;
        }

        .btn-edit {
          background: #fff;
          border-color: #d1d5db;
          color: #374151;
        }

        .btn-edit:hover {
          background: #f3f4f6;
        }

        .btn-skip {
          background: #fff;
          border-color: #d1d5db;
          color: #9ca3af;
        }

        .btn-skip:hover {
          background: #f3f4f6;
        }

        .btn-save {
          background: #059669;
          border-color: #059669;
          color: #fff;
        }

        .btn-save:hover {
          background: #047857;
        }

        .btn-cancel {
          background: #fff;
          border-color: #d1d5db;
          color: #6b7280;
        }

        .profile-edit-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .profile-form-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .profile-form-row label {
          font-size: 0.75rem;
          color: #6b7280;
          width: 50px;
        }

        .profile-form-row select,
        .profile-form-row input {
          flex: 1;
          padding: 4px 8px;
          font-size: 0.8rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
        }

        .profile-form-actions {
          display: flex;
          gap: 6px;
          margin-top: 4px;
        }

        .profile-dropdown-footer {
          padding: 0.5rem 0.75rem;
          border-top: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .btn-go-personnel {
          width: 100%;
          padding: 6px;
          font-size: 0.8rem;
          background: #fff;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          color: #374151;
          cursor: pointer;
        }

        .btn-go-personnel:hover {
          background: #f3f4f6;
        }
      `}</style>
    </div>
  );
}
