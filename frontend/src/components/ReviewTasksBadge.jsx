/**
 * ReviewTasksBadge - Sidebar notification badge for pending review tasks
 * 
 * =============================================================================
 * REVIEW TASKS SYSTEM - FRONTEND COMPONENT GUIDE
 * =============================================================================
 * 
 * This component displays the review tasks badge in the sidebar and provides
 * a dropdown showing pending tasks grouped by incident.
 * 
 * VISIBILITY:
 * -----------
 * Only Officers and Admins can see this component. The component checks
 * userSession.role and returns null for Members.
 * 
 * STYLING:
 * --------
 * Uses CSS variables from App.css to match sidebar theme:
 * - --bg-card, --bg-hover, --border-color
 * - --primary-color, --secondary-color
 * - --text-primary, --text-muted
 * 
 * =============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ReviewTasksBadge({ userSession, primaryColor }) {
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [groupedTasks, setGroupedTasks] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Only Officers and Admins can see review tasks
  const canView = userSession?.role === 'OFFICER' || userSession?.role === 'ADMIN';

  // Fetch count function - extracted so it can be called on-demand
  const fetchCount = async () => {
    try {
      const res = await fetch('/api/review-tasks/count');
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.pending_count || 0);
      }
    } catch (err) {
      console.error('Failed to fetch review task count:', err);
    }
  };

  // Fetch pending count on mount and every 30 seconds
  useEffect(() => {
    if (!canView) return;

    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [canView]);

  // Listen for incident save/close events to refresh immediately
  useEffect(() => {
    if (!canView) return;

    const handleRefresh = () => {
      fetchCount();
      // Also refresh the dropdown if it's open
      if (showDropdown) {
        fetch('/api/review-tasks/grouped?limit=10')
          .then(res => res.ok ? res.json() : null)
          .then(data => data && setGroupedTasks(data.incidents || []))
          .catch(err => console.error('Failed to refresh grouped tasks:', err));
      }
    };

    window.addEventListener('review-tasks-refresh', handleRefresh);
    return () => window.removeEventListener('review-tasks-refresh', handleRefresh);
  }, [canView, showDropdown]);

  // Fetch grouped tasks when dropdown opens
  useEffect(() => {
    if (!showDropdown || !canView) return;

    const fetchGrouped = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/review-tasks/grouped?limit=10');
        if (res.ok) {
          const data = await res.json();
          setGroupedTasks(data.incidents || []);
        }
      } catch (err) {
        console.error('Failed to fetch grouped tasks:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGrouped();
  }, [showDropdown, canView]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Handle incident click - navigate to incidents page
  const handleIncidentClick = (incidentId) => {
    setShowDropdown(false);
    navigate(`/?incident=${incidentId}`);
  };

  // Task type icons
  const getTaskIcon = (taskType) => {
    const icons = {
      'personnel_reconciliation': '👥',
      'comcat_review': '💬',
      'neris_validation': '📋',
      'out_of_sequence': '🔢',
    };
    return icons[taskType] || '⚠️';
  };

  if (!canView) return null;

  const hasPending = pendingCount > 0;

  return (
    <div className="review-tasks-container" ref={dropdownRef}>
      <button
        className={`review-tasks-badge ${hasPending ? 'has-pending' : ''}`}
        onClick={() => setShowDropdown(!showDropdown)}
        title={`${pendingCount} pending review task${pendingCount !== 1 ? 's' : ''}`}
      >
        <span className="review-icon">📋</span>
        <span className="review-label">Review Tasks</span>
        {hasPending && (
          <span className="review-count">{pendingCount}</span>
        )}
      </button>

      {showDropdown && (
        <div className="review-dropdown">
          <div className="review-dropdown-header">
            <span className="review-dropdown-title">Pending Review</span>
            <span className="review-dropdown-count">
              {pendingCount} task{pendingCount !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div className="review-loading">Loading...</div>
          ) : groupedTasks.length === 0 ? (
            <div className="review-empty">No pending tasks</div>
          ) : (
            <div className="review-task-list">
              {groupedTasks.map((incident) => (
                <div key={incident.incident_id} className="review-incident-group">
                  <button
                    className="review-incident-link"
                    onClick={() => handleIncidentClick(incident.incident_id)}
                  >
                    <span className="review-incident-number">
                      {incident.incident_number}
                    </span>
                    <span className="review-incident-address">
                      {incident.incident_address || 'No address'}
                    </span>
                  </button>
                  
                  <ul className="review-task-items">
                    {incident.tasks.map((task) => (
                      <li key={task.id} className={`review-task-item priority-${task.priority}`}>
                        <span className="review-task-icon">{getTaskIcon(task.task_type)}</span>
                        {task.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .review-tasks-container {
          position: relative;
          margin-top: 0.5rem;
        }

        .review-tasks-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.65rem 0.75rem;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-left: 3px solid var(--border-color);
          border-radius: 6px;
          cursor: pointer;
          color: var(--text-muted);
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.15s;
        }

        .review-tasks-badge:hover {
          background: var(--bg-hover);
          color: var(--primary-color);
          border-left-color: var(--secondary-color);
        }

        .review-tasks-badge.has-pending {
          border-left-color: var(--secondary-color);
          color: var(--text-primary);
        }

        .review-icon {
          font-size: 1rem;
        }

        .review-label {
          flex: 1;
          text-align: left;
        }

        .review-count {
          background: var(--primary-color);
          color: #fff;
          padding: 0.15rem 0.5rem;
          border-radius: 10px;
          font-size: 0.75rem;
          font-weight: 600;
          min-width: 20px;
          text-align: center;
        }

        .review-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 4px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-top: 3px solid var(--secondary-color);
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1000;
          max-height: 400px;
          overflow-y: auto;
        }

        .review-dropdown-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          border-bottom: 2px solid var(--primary-color);
          background: var(--bg-hover);
        }

        .review-dropdown-title {
          font-weight: 600;
          color: var(--primary-color);
          font-size: 0.9rem;
        }

        .review-dropdown-count {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .review-loading,
        .review-empty {
          padding: 1.5rem;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.85rem;
        }

        .review-task-list {
          padding: 0.5rem 0;
        }

        .review-incident-group {
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid var(--border-color);
        }

        .review-incident-group:last-child {
          border-bottom: none;
        }

        .review-incident-link {
          display: flex;
          flex-direction: column;
          gap: 2px;
          width: 100%;
          padding: 0.25rem 0;
          border: none;
          background: none;
          cursor: pointer;
          text-align: left;
          border-radius: 4px;
          transition: background 0.15s;
        }

        .review-incident-link:hover {
          background: var(--bg-hover);
        }

        .review-incident-number {
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--primary-color);
        }

        .review-incident-address {
          font-size: 0.8rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .review-task-items {
          margin: 0.5rem 0 0 0;
          padding: 0 0 0 0.75rem;
          list-style: none;
        }

        .review-task-item {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.25rem 0.5rem;
          margin-bottom: 0.25rem;
          background: var(--bg-hover);
          border-radius: 4px;
          font-size: 0.75rem;
          color: var(--text-primary);
        }

        .review-task-item.priority-high {
          background: #fef2f2;
          color: #991b1b;
          border-left: 2px solid #dc2626;
        }

        .review-task-icon {
          font-size: 0.8rem;
        }
      `}</style>
    </div>
  );
}
