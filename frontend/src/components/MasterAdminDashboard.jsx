import { useState, useEffect } from 'react';
import {
  masterAdminLogin,
  masterAdminLogout,
  masterAdminGetMe,
  masterAdminGetTenants,
  masterAdminGetStats,
  masterAdminApproveTenant,
  masterAdminSuspendTenant,
  masterAdminReactivateTenant,
  masterAdminRejectTenant,
  masterAdminGetAuditLog,
} from '../api';

/**
 * Master Admin Dashboard
 * 
 * System administration for CADReport platform.
 * - View/manage tenants
 * - Approve pending signups
 * - System stats
 */
function MasterAdminDashboard({ onExit }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Dashboard state
  const [activeTab, setActiveTab] = useState('tenants');
  const [tenants, setTenants] = useState([]);
  const [stats, setStats] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // Check if already logged in
  useEffect(() => {
    masterAdminGetMe()
      .then(res => setAdmin(res.data))
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false));
  }, []);

  // Load data when logged in
  useEffect(() => {
    if (admin) {
      loadTenants();
      loadStats();
    }
  }, [admin, filterStatus]);

  const loadTenants = async () => {
    try {
      const res = await masterAdminGetTenants(filterStatus || null);
      setTenants(res.data.tenants || []);
    } catch (err) {
      console.error('Failed to load tenants:', err);
    }
  };

  const loadStats = async () => {
    try {
      const res = await masterAdminGetStats();
      setStats(res.data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadAuditLog = async () => {
    try {
      const res = await masterAdminGetAuditLog(100);
      setAuditLog(res.data.entries || []);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await masterAdminLogin(loginEmail, loginPassword);
      setAdmin(res.data.admin);
      setLoginEmail('');
      setLoginPassword('');
    } catch (err) {
      setLoginError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await masterAdminLogout();
    } catch (err) {
      console.error('Logout error:', err);
    }
    setAdmin(null);
  };

  const handleApprove = async (tenantId) => {
    setActionLoading(true);
    setActionError('');
    try {
      await masterAdminApproveTenant(tenantId, {});
      await loadTenants();
      await loadStats();
      setSelectedTenant(null);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to approve');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (tenantId) => {
    if (!confirm('Reject this signup request?')) return;
    setActionLoading(true);
    setActionError('');
    try {
      await masterAdminRejectTenant(tenantId);
      await loadTenants();
      await loadStats();
      setSelectedTenant(null);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to reject');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async (tenantId) => {
    const reason = prompt('Reason for suspension:');
    if (!reason) return;
    setActionLoading(true);
    setActionError('');
    try {
      await masterAdminSuspendTenant(tenantId, reason);
      await loadTenants();
      await loadStats();
      setSelectedTenant(null);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to suspend');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async (tenantId) => {
    setActionLoading(true);
    setActionError('');
    try {
      await masterAdminReactivateTenant(tenantId);
      await loadTenants();
      await loadStats();
      setSelectedTenant(null);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to reactivate');
    } finally {
      setActionLoading(false);
    }
  };

  // Loading screen
  if (loading) {
    return (
      <div className="master-admin-container">
        <div className="master-admin-loading">Loading...</div>
        <style>{styles}</style>
      </div>
    );
  }

  // Login screen
  if (!admin) {
    return (
      <div className="master-admin-container">
        <div className="master-admin-login-box">
          <div className="login-header">
            <h1>🔧 System Admin</h1>
            <p>CADReport Administration</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="admin@cadreport.com"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                required
              />
            </div>

            {loginError && <div className="login-error">{loginError}</div>}

            <button type="submit" disabled={loginLoading} className="login-button">
              {loginLoading ? 'Logging in...' : 'Log In'}
            </button>
          </form>

          <div className="login-footer">
            <button onClick={onExit} className="back-link">
              ← Back to Department Login
            </button>
          </div>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="master-admin-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>🔧 CADReport Admin</h1>
        </div>
        <div className="header-right">
          <span className="admin-name">{admin.name || admin.email}</span>
          <span className="admin-role">{admin.role}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
          <button onClick={onExit} className="exit-btn">Exit</button>
        </div>
      </header>

      {/* Stats bar */}
      {stats && (
        <div className="stats-bar">
          <div className="stat">
            <span className="stat-value">{stats.tenants?.active || 0}</span>
            <span className="stat-label">Active</span>
          </div>
          <div className="stat pending">
            <span className="stat-value">{stats.tenants?.pending || 0}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.tenants?.suspended || 0}</span>
            <span className="stat-label">Suspended</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.tenants?.total || 0}</span>
            <span className="stat-label">Total</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'tenants' ? 'active' : ''}`}
          onClick={() => setActiveTab('tenants')}
        >
          Tenants
        </button>
        <button
          className={`tab ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => { setActiveTab('audit'); loadAuditLog(); }}
        >
          Audit Log
        </button>
      </div>

      {/* Content */}
      <div className="dashboard-content">
        {activeTab === 'tenants' && (
          <div className="tenants-panel">
            {/* Filter */}
            <div className="filter-bar">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
              <button onClick={loadTenants} className="refresh-btn">↻ Refresh</button>
            </div>

            {/* Tenants list */}
            <div className="tenants-grid">
              <div className="tenants-list">
                {tenants.length === 0 ? (
                  <div className="empty-state">No tenants found</div>
                ) : (
                  tenants.map(t => (
                    <div
                      key={t.id}
                      className={`tenant-card ${selectedTenant?.id === t.id ? 'selected' : ''} status-${t.status?.toLowerCase()}`}
                      onClick={() => setSelectedTenant(t)}
                    >
                      <div className="tenant-name">{t.name}</div>
                      <div className="tenant-slug">{t.slug}.cadreport.com</div>
                      <div className="tenant-meta">
                        <span className={`status-badge ${t.status?.toLowerCase()}`}>
                          {t.status}
                        </span>
                        {t.county && <span className="county">{t.county}, {t.state}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Detail panel */}
              {selectedTenant && (
                <div className="tenant-detail">
                  <h3>{selectedTenant.name}</h3>
                  <div className="detail-row">
                    <label>Subdomain:</label>
                    <span>{selectedTenant.slug}.cadreport.com</span>
                  </div>
                  <div className="detail-row">
                    <label>Status:</label>
                    <span className={`status-badge ${selectedTenant.status?.toLowerCase()}`}>
                      {selectedTenant.status}
                    </span>
                  </div>
                  <div className="detail-row">
                    <label>Contact:</label>
                    <span>{selectedTenant.contact_name || '-'}</span>
                  </div>
                  <div className="detail-row">
                    <label>Email:</label>
                    <span>{selectedTenant.contact_email || '-'}</span>
                  </div>
                  <div className="detail-row">
                    <label>Location:</label>
                    <span>{selectedTenant.county || '-'}, {selectedTenant.state || 'PA'}</span>
                  </div>
                  <div className="detail-row">
                    <label>CAD Port:</label>
                    <span>{selectedTenant.cad_port || 'Not assigned'}</span>
                  </div>
                  <div className="detail-row">
                    <label>Created:</label>
                    <span>{selectedTenant.created_at ? new Date(selectedTenant.created_at).toLocaleDateString() : '-'}</span>
                  </div>

                  {actionError && <div className="action-error">{actionError}</div>}

                  <div className="detail-actions">
                    {selectedTenant.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => handleApprove(selectedTenant.id)}
                          disabled={actionLoading}
                          className="btn-approve"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => handleReject(selectedTenant.id)}
                          disabled={actionLoading}
                          className="btn-reject"
                        >
                          ✕ Reject
                        </button>
                      </>
                    )}
                    {selectedTenant.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleSuspend(selectedTenant.id)}
                        disabled={actionLoading}
                        className="btn-suspend"
                      >
                        ⏸ Suspend
                      </button>
                    )}
                    {selectedTenant.status === 'SUSPENDED' && (
                      <button
                        onClick={() => handleReactivate(selectedTenant.id)}
                        disabled={actionLoading}
                        className="btn-reactivate"
                      >
                        ▶ Reactivate
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="audit-panel">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.length === 0 ? (
                  <tr><td colSpan="5" className="empty-state">No audit entries</td></tr>
                ) : (
                  auditLog.map(entry => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.created_at).toLocaleString()}</td>
                      <td>{entry.admin_email}</td>
                      <td><span className="action-badge">{entry.action}</span></td>
                      <td>{entry.target_name || '-'}</td>
                      <td className="details-cell">
                        {entry.details ? JSON.stringify(entry.details) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .master-admin-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    padding: 20px;
  }

  .master-admin-loading {
    color: #888;
    font-size: 1.2rem;
  }

  .master-admin-login-box {
    background: #1e1e1e;
    border-radius: 12px;
    padding: 40px;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }

  .login-header {
    text-align: center;
    margin-bottom: 30px;
  }

  .login-header h1 {
    font-size: 1.8rem;
    margin: 0 0 10px 0;
    color: #fff;
  }

  .login-header p {
    color: #888;
    margin: 0;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group label {
    color: #aaa;
    font-size: 0.9rem;
  }

  .form-group input {
    padding: 12px 16px;
    border: 1px solid #333;
    border-radius: 6px;
    background: #2a2a2a;
    color: #fff;
    font-size: 1rem;
  }

  .form-group input:focus {
    outline: none;
    border-color: #f39c12;
  }

  .login-error {
    background: rgba(255, 77, 77, 0.1);
    border: 1px solid rgba(255, 77, 77, 0.3);
    color: #ff6b6b;
    padding: 10px 14px;
    border-radius: 6px;
  }

  .login-button {
    padding: 14px;
    background: #f39c12;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }

  .login-button:hover:not(:disabled) {
    background: #e67e22;
  }

  .login-footer {
    margin-top: 24px;
    text-align: center;
  }

  .back-link {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .back-link:hover {
    color: #888;
  }

  /* Dashboard */
  .master-admin-dashboard {
    min-height: 100vh;
    background: #121212;
    color: #fff;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    background: #1a1a1a;
    border-bottom: 1px solid #333;
  }

  .header-left h1 {
    margin: 0;
    font-size: 1.4rem;
    color: #f39c12;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .admin-name {
    color: #fff;
    font-weight: 500;
  }

  .admin-role {
    background: #f39c12;
    color: #000;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .logout-btn, .exit-btn {
    padding: 6px 12px;
    border: 1px solid #444;
    border-radius: 4px;
    background: transparent;
    color: #aaa;
    cursor: pointer;
  }

  .logout-btn:hover, .exit-btn:hover {
    background: #333;
    color: #fff;
  }

  .stats-bar {
    display: flex;
    gap: 24px;
    padding: 16px 24px;
    background: #1e1e1e;
    border-bottom: 1px solid #333;
  }

  .stat {
    text-align: center;
  }

  .stat-value {
    display: block;
    font-size: 1.8rem;
    font-weight: 600;
    color: #4a9eff;
  }

  .stat.pending .stat-value {
    color: #f39c12;
  }

  .stat-label {
    color: #888;
    font-size: 0.85rem;
  }

  .tabs {
    display: flex;
    gap: 4px;
    padding: 16px 24px 0;
    background: #1a1a1a;
  }

  .tab {
    padding: 10px 20px;
    background: transparent;
    border: none;
    color: #888;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    font-size: 0.95rem;
  }

  .tab:hover {
    color: #fff;
  }

  .tab.active {
    color: #fff;
    border-bottom-color: #f39c12;
  }

  .dashboard-content {
    padding: 24px;
  }

  .filter-bar {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  .filter-bar select {
    padding: 8px 12px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 4px;
    color: #fff;
  }

  .refresh-btn {
    padding: 8px 16px;
    background: #333;
    border: none;
    border-radius: 4px;
    color: #fff;
    cursor: pointer;
  }

  .tenants-grid {
    display: grid;
    grid-template-columns: 1fr 400px;
    gap: 24px;
  }

  .tenants-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: calc(100vh - 300px);
    overflow-y: auto;
  }

  .tenant-card {
    padding: 16px;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .tenant-card:hover {
    border-color: #555;
  }

  .tenant-card.selected {
    border-color: #f39c12;
  }

  .tenant-card.status-pending {
    border-left: 3px solid #f39c12;
  }

  .tenant-card.status-active {
    border-left: 3px solid #2ecc71;
  }

  .tenant-card.status-suspended {
    border-left: 3px solid #e74c3c;
  }

  .tenant-name {
    font-weight: 600;
    font-size: 1.1rem;
    margin-bottom: 4px;
  }

  .tenant-slug {
    color: #888;
    font-size: 0.85rem;
    margin-bottom: 8px;
  }

  .tenant-meta {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .status-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .status-badge.pending {
    background: rgba(243, 156, 18, 0.2);
    color: #f39c12;
  }

  .status-badge.active {
    background: rgba(46, 204, 113, 0.2);
    color: #2ecc71;
  }

  .status-badge.suspended {
    background: rgba(231, 76, 60, 0.2);
    color: #e74c3c;
  }

  .county {
    color: #666;
    font-size: 0.85rem;
  }

  .tenant-detail {
    padding: 24px;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 8px;
    position: sticky;
    top: 24px;
  }

  .tenant-detail h3 {
    margin: 0 0 20px 0;
    font-size: 1.3rem;
  }

  .detail-row {
    display: flex;
    margin-bottom: 12px;
  }

  .detail-row label {
    width: 100px;
    color: #888;
    font-size: 0.9rem;
  }

  .detail-row span {
    flex: 1;
    color: #fff;
  }

  .action-error {
    background: rgba(255, 77, 77, 0.1);
    border: 1px solid rgba(255, 77, 77, 0.3);
    color: #ff6b6b;
    padding: 10px;
    border-radius: 4px;
    margin: 16px 0;
  }

  .detail-actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #333;
  }

  .detail-actions button {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-approve {
    background: #2ecc71;
    color: #fff;
  }

  .btn-approve:hover {
    background: #27ae60;
  }

  .btn-reject {
    background: #e74c3c;
    color: #fff;
  }

  .btn-reject:hover {
    background: #c0392b;
  }

  .btn-suspend {
    background: #f39c12;
    color: #fff;
  }

  .btn-suspend:hover {
    background: #e67e22;
  }

  .btn-reactivate {
    background: #3498db;
    color: #fff;
  }

  .btn-reactivate:hover {
    background: #2980b9;
  }

  .empty-state {
    text-align: center;
    padding: 40px;
    color: #666;
  }

  /* Audit log */
  .audit-table {
    width: 100%;
    border-collapse: collapse;
  }

  .audit-table th,
  .audit-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #333;
  }

  .audit-table th {
    background: #1a1a1a;
    color: #888;
    font-weight: 500;
    font-size: 0.85rem;
  }

  .action-badge {
    background: #333;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
  }

  .details-cell {
    font-size: 0.85rem;
    color: #888;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

export default MasterAdminDashboard;
