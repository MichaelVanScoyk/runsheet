import { useState } from 'react';
import MasterAdminDashboard from './MasterAdminDashboard';
import { submitTenantSignupRequest } from '../api';

/**
 * Landing Page - shown on cadreport.com (main domain)
 * 
 * Three sections:
 * 1. Department Login - enter code, redirects to subdomain
 * 2. Request Access - signup form for new departments
 * 3. System Admin - master admin login
 */
function LandingPage() {
  const [activeSection, setActiveSection] = useState('login');
  const [showMasterAdmin, setShowMasterAdmin] = useState(false);
  
  // Login state
  const [loginSlug, setLoginSlug] = useState('');
  
  // Signup state
  const [signupData, setSignupData] = useState({
    requested_slug: '',
    department_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    county: '',
    state: 'PA',
  });
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);

  // Handle department login - redirect to subdomain
  const handleLogin = (e) => {
    e.preventDefault();
    const slug = loginSlug.toLowerCase().trim();
    if (slug) {
      window.location.href = `https://${slug}.cadreport.com`;
    }
  };

  // Handle signup request
  const handleSignup = async (e) => {
    e.preventDefault();
    setSignupError('');
    setSignupLoading(true);

    try {
      await submitTenantSignupRequest(signupData);
      setSignupSuccess(true);
    } catch (err) {
      setSignupError(err.response?.data?.detail || 'Failed to submit request');
    } finally {
      setSignupLoading(false);
    }
  };

  // Show master admin dashboard
  if (showMasterAdmin) {
    return <MasterAdminDashboard onExit={() => setShowMasterAdmin(false)} />;
  }

  return (
    <div className="landing-container">
      <div className="landing-content">
        {/* Header */}
        <header className="landing-header">
          <h1>🚒 CADReport</h1>
          <p>Fire Department Incident Management System</p>
        </header>

        {/* Tab navigation */}
        <div className="section-tabs">
          <button
            className={`tab ${activeSection === 'login' ? 'active' : ''}`}
            onClick={() => setActiveSection('login')}
          >
            Department Login
          </button>
          <button
            className={`tab ${activeSection === 'signup' ? 'active' : ''}`}
            onClick={() => setActiveSection('signup')}
          >
            Request Access
          </button>
        </div>

        {/* Login Section */}
        {activeSection === 'login' && (
          <div className="section-content">
            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label>Department Code</label>
                <input
                  type="text"
                  value={loginSlug}
                  onChange={(e) => setLoginSlug(e.target.value)}
                  placeholder="e.g., glenmoorefc"
                  required
                  autoFocus
                />
                <span className="input-hint">Enter your department's code to access your portal</span>
              </div>
              <button type="submit" className="primary-button">
                Go to Department →
              </button>
            </form>
          </div>
        )}

        {/* Signup Section */}
        {activeSection === 'signup' && (
          <div className="section-content">
            {signupSuccess ? (
              <div className="success-message">
                <h3>✓ Request Submitted</h3>
                <p>Thank you for your interest in CADReport. We'll review your request and contact you soon.</p>
                <button onClick={() => { setSignupSuccess(false); setActiveSection('login'); }} className="secondary-button">
                  Back to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSignup} className="signup-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Department Name *</label>
                    <input
                      type="text"
                      value={signupData.department_name}
                      onChange={(e) => setSignupData({...signupData, department_name: e.target.value})}
                      placeholder="Glen Moore Fire Company"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Requested Subdomain *</label>
                    <div className="subdomain-input">
                      <input
                        type="text"
                        value={signupData.requested_slug}
                        onChange={(e) => setSignupData({...signupData, requested_slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '')})}
                        placeholder="glenmoorefc"
                        required
                      />
                      <span>.cadreport.com</span>
                    </div>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Contact Name *</label>
                    <input
                      type="text"
                      value={signupData.contact_name}
                      onChange={(e) => setSignupData({...signupData, contact_name: e.target.value})}
                      placeholder="John Smith"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Contact Email *</label>
                    <input
                      type="email"
                      value={signupData.contact_email}
                      onChange={(e) => setSignupData({...signupData, contact_email: e.target.value})}
                      placeholder="chief@example.com"
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={signupData.contact_phone}
                      onChange={(e) => setSignupData({...signupData, contact_phone: e.target.value})}
                      placeholder="610-555-1234"
                    />
                  </div>
                  <div className="form-group">
                    <label>County</label>
                    <input
                      type="text"
                      value={signupData.county}
                      onChange={(e) => setSignupData({...signupData, county: e.target.value})}
                      placeholder="Chester"
                    />
                  </div>
                  <div className="form-group" style={{maxWidth: '100px'}}>
                    <label>State</label>
                    <input
                      type="text"
                      value={signupData.state}
                      onChange={(e) => setSignupData({...signupData, state: e.target.value.toUpperCase()})}
                      placeholder="PA"
                      maxLength={2}
                    />
                  </div>
                </div>

                {signupError && <div className="error-message">{signupError}</div>}

                <button type="submit" disabled={signupLoading} className="primary-button">
                  {signupLoading ? 'Submitting...' : 'Submit Request'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Admin link */}
        <div className="admin-section">
          <button onClick={() => setShowMasterAdmin(true)} className="admin-link">
            🔧 System Administration
          </button>
        </div>

        {/* Footer */}
        <footer className="landing-footer">
          <p>CADReport - NERIS-compliant incident management for Pennsylvania fire departments</p>
        </footer>
      </div>

      <style>{`
        .landing-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          padding: 20px;
        }

        .landing-content {
          width: 100%;
          max-width: 600px;
        }

        .landing-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .landing-header h1 {
          font-size: 2.5rem;
          margin: 0 0 10px 0;
          color: #fff;
        }

        .landing-header p {
          color: #888;
          margin: 0;
          font-size: 1.1rem;
        }

        .section-tabs {
          display: flex;
          background: #1e1e1e;
          border-radius: 12px 12px 0 0;
          overflow: hidden;
        }

        .tab {
          flex: 1;
          padding: 16px;
          background: transparent;
          border: none;
          color: #888;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab:hover {
          color: #fff;
          background: #2a2a2a;
        }

        .tab.active {
          color: #fff;
          background: #2a2a2a;
          border-bottom: 2px solid #4a9eff;
        }

        .section-content {
          background: #1e1e1e;
          padding: 30px;
          border-radius: 0 0 12px 12px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
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
          border-color: #4a9eff;
        }

        .input-hint {
          color: #666;
          font-size: 0.8rem;
        }

        .form-row {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
        }

        .subdomain-input {
          display: flex;
          align-items: center;
        }

        .subdomain-input input {
          border-radius: 6px 0 0 6px;
          flex: 1;
        }

        .subdomain-input span {
          padding: 12px;
          background: #333;
          border: 1px solid #333;
          border-left: none;
          border-radius: 0 6px 6px 0;
          color: #888;
          font-size: 0.9rem;
        }

        .primary-button {
          width: 100%;
          padding: 14px;
          background: #4a9eff;
          border: none;
          border-radius: 6px;
          color: #fff;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          margin-top: 10px;
        }

        .primary-button:hover:not(:disabled) {
          background: #3a8eef;
        }

        .primary-button:disabled {
          background: #555;
          cursor: not-allowed;
        }

        .secondary-button {
          padding: 10px 20px;
          background: #333;
          border: none;
          border-radius: 6px;
          color: #fff;
          cursor: pointer;
        }

        .error-message {
          background: rgba(255, 77, 77, 0.1);
          border: 1px solid rgba(255, 77, 77, 0.3);
          color: #ff6b6b;
          padding: 10px 14px;
          border-radius: 6px;
          margin-bottom: 10px;
        }

        .success-message {
          text-align: center;
          padding: 20px;
        }

        .success-message h3 {
          color: #2ecc71;
          margin: 0 0 10px 0;
        }

        .success-message p {
          color: #888;
          margin-bottom: 20px;
        }

        .admin-section {
          text-align: center;
          margin-top: 30px;
        }

        .admin-link {
          background: none;
          border: none;
          color: #666;
          font-size: 0.9rem;
          cursor: pointer;
          padding: 10px 20px;
        }

        .admin-link:hover {
          color: #f39c12;
        }

        .landing-footer {
          text-align: center;
          margin-top: 30px;
          color: #555;
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}

export default LandingPage;
