/**
 * SequenceAlertBadge - Sidebar notification for out-of-sequence incidents
 * 
 * Shows alerts for each category (Fire, EMS, Detail) that has incidents
 * out of chronological sequence. Only visible to Officers and Admins.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSequenceStatus } from '../api';

export default function SequenceAlertBadge({ userSession, primaryColor }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  // Only Officers and Admins can see this
  const canView = userSession?.role === 'OFFICER' || userSession?.role === 'ADMIN';

  // Fetch status on mount and every 60 seconds
  useEffect(() => {
    if (!canView) return;

    const fetchStatus = async () => {
      try {
        const res = await getSequenceStatus();
        setStatus(res.data);
      } catch (err) {
        console.error('Failed to fetch sequence status:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [canView]);

  if (!canView || loading) return null;

  // Check which categories have issues
  const issues = [];
  if (status?.fire?.out_of_sequence > 0) {
    issues.push({ category: 'Fire', count: status.fire.out_of_sequence, color: '#dc2626' });
  }
  if (status?.ems?.out_of_sequence > 0) {
    issues.push({ category: 'EMS', count: status.ems.out_of_sequence, color: '#2563eb' });
  }
  if (status?.detail?.out_of_sequence > 0) {
    issues.push({ category: 'Detail', count: status.detail.out_of_sequence, color: '#8b5cf6' });
  }

  if (issues.length === 0) return null;

  const handleClick = () => {
    navigate('/admin');
    // Delay slightly to ensure page loads, then switch to sequence tab
    setTimeout(() => {
      const sequenceTab = document.querySelector('button[class*="active"]');
      if (sequenceTab) {
        // Find and click the sequence tab button
        const tabs = document.querySelectorAll('.admin-tabs button');
        tabs.forEach(tab => {
          if (tab.textContent.includes('Incident Sequence')) {
            tab.click();
          }
        });
      }
    }, 100);
  };

  return (
    <div className="sequence-alert-container">
      {issues.map(issue => (
        <button
          key={issue.category}
          className="sequence-alert-badge"
          onClick={handleClick}
          title={`${issue.count} ${issue.category} incident${issue.count !== 1 ? 's' : ''} out of sequence`}
          style={{ borderLeftColor: issue.color }}
        >
          <span className="sequence-alert-icon">⚠️</span>
          <span className="sequence-alert-text">
            {issue.count} {issue.category} out of sequence
          </span>
        </button>
      ))}

      <style>{`
        .sequence-alert-container {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          margin-top: 0.5rem;
        }

        .sequence-alert-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-left: 3px solid #dc2626;
          border-radius: 6px;
          cursor: pointer;
          color: #991b1b;
          font-size: 0.8rem;
          font-weight: 500;
          text-align: left;
          transition: all 0.15s;
        }

        .sequence-alert-badge:hover {
          background: #fee2e2;
          border-color: #fca5a5;
        }

        .sequence-alert-icon {
          font-size: 0.9rem;
        }

        .sequence-alert-text {
          flex: 1;
        }
      `}</style>
    </div>
  );
}
