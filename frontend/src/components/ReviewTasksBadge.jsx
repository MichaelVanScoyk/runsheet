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
 * BADGE BEHAVIOR:
 * ---------------
 * - Red background when pendingCount > 0
 * - Gray background when pendingCount === 0
 * - Count refreshes every 30 seconds via /api/review-tasks/count
 * 
 * DROPDOWN BEHAVIOR:
 * ------------------
 * - Opens on badge click
 * - Shows incidents with pending tasks, grouped
 * - Each incident shows: number (clickable), address, list of task titles
 * - Clicking incident number navigates to /?incident={id}
 * - Closes when clicking outside
 * 
 * EXTENDING THIS COMPONENT:
 * -------------------------
 * If you add a new task_type that needs special handling:
 * 
 * 1. The task will appear automatically (uses title from backend)
 * 
 * 2. For custom icons per task_type, modify the taskItems mapping:
 *    
 *    const taskIcons = {
 *      'personnel_reconciliation': '👥',
 *      'comcat_review': '💬',
 *      'neris_validation': '📋',
 *    };
 * 
 * 3. For custom resolution UI, you'll need to:
 *    - Create a resolution modal component
 *    - Check task.required_action.action_type
 *    - Render appropriate UI
 *    - Call /api/review-tasks/{id}/resolve when done
 * 
 * API ENDPOINTS USED:
 * -------------------
 * GET /api/review-tasks/count   - Pending count for badge
 * GET /api/review-tasks/grouped - Tasks grouped by incident for dropdown
 * 
 * NAVIGATION:
 * -----------
 * When user clicks an incident, we navigate to /?incident={id}
 * The IncidentsPage should handle this query param to open that incident.
 * (This navigation pattern may need adjustment based on your routing setup)
 * 
 * STYLING:
 * --------
 * Uses inline styles for portability. Accepts primaryColor prop from branding.
 * Badge and dropdown follow the sidebar color scheme.
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

  // ==========================================================================
  // VISIBILITY CHECK
  // Only Officers and Admins can see review tasks
  // ==========================================================================
  const canView = userSession?.role === 'OFFICER' || userSession?.role === 'ADMIN';

  // ==========================================================================
  // FETCH PENDING COUNT
  // Runs on mount and every 30 seconds
  // ==========================================================================
  useEffect(() => {
    if (!canView) return;

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

    fetchCount();
    const interval = setInterval(fetchCount, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [canView]);

  // ==========================================================================
  // FETCH GROUPED TASKS WHEN DROPDOWN OPENS
  // ==========================================================================
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

  // ==========================================================================
  // CLOSE DROPDOWN ON OUTSIDE CLICK
  // ==========================================================================
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

  // ==========================================================================
  // HANDLE INCIDENT CLICK
  // Navigate to incidents page with incident param
  // The IncidentsPage should handle opening this incident
  // ==========================================================================
  const handleIncidentClick = (incidentId) => {
    setShowDropdown(false);
    // Navigate to incidents page with the incident selected
    // TODO: IncidentsPage needs to handle ?incident= query param
    navigate(`/?incident=${incidentId}`);
  };

  // ==========================================================================
  // TASK TYPE ICONS (extend as needed)
  // ==========================================================================
  const getTaskIcon = (taskType) => {
    const icons = {
      'personnel_reconciliation': '👥',
      'comcat_review': '💬',
      'neris_validation': '📋',
      'out_of_sequence': '🔢',
    };
    return icons[taskType] || '⚠️';
  };

  // Don't render for non-officers
  if (!canView) return null;

  return (
    <div style={styles.container} ref={dropdownRef}>
      {/* Badge button */}
      <button
        style={{
          ...styles.badge,
          backgroundColor: pendingCount > 0 ? '#dc2626' : '#6b7280',
        }}
        onClick={() => setShowDropdown(!showDropdown)}
        title={`${pendingCount} pending review task${pendingCount !== 1 ? 's' : ''}`}
      >
        <span style={styles.icon}>⚠️</span>
        <span style={styles.label}>Review</span>
        {pendingCount > 0 && (
          <span style={styles.count}>{pendingCount}</span>
        )}
      </button>

      {/* Dropdown panel */}
      {showDropdown && (
        <div style={styles.dropdown}>
          {/* Header */}
          <div style={{ ...styles.dropdownHeader, borderBottomColor: primaryColor }}>
            <span style={styles.dropdownTitle}>Pending Review</span>
            <span style={styles.dropdownCount}>
              {pendingCount} task{pendingCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Content */}
          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : groupedTasks.length === 0 ? (
            <div style={styles.empty}>No pending tasks</div>
          ) : (
            <div style={styles.taskList}>
              {groupedTasks.map((incident) => (
                <div key={incident.incident_id} style={styles.incidentGroup}>
                  {/* Clickable incident header */}
                  <button
                    style={styles.incidentLink}
                    onClick={() => handleIncidentClick(incident.incident_id)}
                  >
                    <span style={{ ...styles.incidentNumber, color: primaryColor }}>
                      {incident.incident_number}
                    </span>
                    <span style={styles.incidentAddress}>
                      {incident.incident_address || 'No address'}
                    </span>
                  </button>
                  
                  {/* Task list for this incident */}
                  <ul style={styles.taskItems}>
                    {incident.tasks.map((task) => (
                      <li key={task.id} style={styles.taskItem}>
                        <span style={{
                          ...styles.taskPriority,
                          backgroundColor: task.priority === 'high' ? '#fef2f2' : '#f9fafb',
                          color: task.priority === 'high' ? '#991b1b' : '#374151',
                        }}>
                          <span style={styles.taskIcon}>{getTaskIcon(task.task_type)}</span>
                          {task.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// STYLES
// Using inline styles for portability
// =============================================================================

const styles = {
  container: {
    position: 'relative',
    marginTop: '10px',
    marginBottom: '10px',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#fff',
    fontSize: '0.85rem',
    fontWeight: '500',
  },
  icon: {
    fontSize: '1rem',
  },
  label: {
    flex: 1,
    textAlign: 'left',
  },
  count: {
    backgroundColor: '#fff',
    color: '#dc2626',
    padding: '2px 6px',
    borderRadius: '10px',
    fontSize: '0.75rem',
    fontWeight: '600',
    minWidth: '20px',
    textAlign: 'center',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 1000,
    maxHeight: '400px',
    overflowY: 'auto',
  },
  dropdownHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '2px solid',
    backgroundColor: '#f9fafb',
  },
  dropdownTitle: {
    fontWeight: '600',
    color: '#111827',
    fontSize: '0.9rem',
  },
  dropdownCount: {
    fontSize: '0.75rem',
    color: '#6b7280',
  },
  loading: {
    padding: '20px',
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '0.85rem',
  },
  empty: {
    padding: '20px',
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: '0.85rem',
  },
  taskList: {
    padding: '8px 0',
  },
  incidentGroup: {
    padding: '8px 12px',
    borderBottom: '1px solid #f3f4f6',
  },
  incidentLink: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: '100%',
    padding: '4px 0',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  incidentNumber: {
    fontWeight: '600',
    fontSize: '0.9rem',
  },
  incidentAddress: {
    fontSize: '0.8rem',
    color: '#6b7280',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  taskItems: {
    margin: '6px 0 0 0',
    padding: '0 0 0 12px',
    listStyle: 'none',
  },
  taskItem: {
    marginBottom: '4px',
  },
  taskIcon: {
    marginRight: '4px',
  },
  taskPriority: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '0.75rem',
  },
};
