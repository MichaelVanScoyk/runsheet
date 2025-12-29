import { useState } from 'react';
import { tenantLogin } from '../api';

/**
 * Tenant Login Form
 * 
 * Shown on subdomain (e.g., glenmoorefc.cadreport.com) when not logged in.
 * NO master admin link here - that's on the main landing page.
 */
function TenantLogin({ onLogin }) {
  const [slug, setSlug] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-fill slug from subdomain
  const subdomain = window.location.hostname.split('.')[0];
  const isSubdomain = subdomain && subdomain !== 'cadreport' && subdomain !== 'www';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const loginSlug = isSubdomain ? subdomain : slug.toLowerCase().trim();

    try {
      const response = await tenantLogin(loginSlug, password);
      onLogin(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tenant-login-container">
      <div className="tenant-login-box">
        <div className="tenant-login-header">
          <h1>🚒 CADReport</h1>
          <p>Fire Department Incident Management</p>
        </div>

        <form onSubmit={handleSubmit} className="tenant-login-form">
          {!isSubdomain && (
            <div className="form-group">
              <label htmlFor="slug">Department Code</label>
              <input
                type="text"
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g., glenmoorefc"
                required
                autoFocus
                autoComplete="username"
              />
            </div>
          )}

          {isSubdomain && (
            <div className="subdomain-info">
              Logging in to <strong>{subdomain}</strong>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Department password"
              required
              autoFocus={isSubdomain}
              autoComplete="current-password"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={loading} className="login-button">
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <div className="tenant-login-footer">
          <p>Don't have access? Contact your fire company officer.</p>
        </div>
      </div>

      <style>{`
        .tenant-login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          padding: 20px;
        }

        .tenant-login-box {
          background: #1e1e1e;
          border-radius: 12px;
          padding: 40px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }

        .tenant-login-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .tenant-login-header h1 {
          font-size: 2rem;
          margin: 0 0 10px 0;
          color: #fff;
        }

        .tenant-login-header p {
          color: #888;
          margin: 0;
          font-size: 0.95rem;
        }

        .subdomain-info {
          text-align: center;
          padding: 12px;
          background: #2a3a2a;
          border-radius: 6px;
          color: #4a9;
          margin-bottom: 10px;
        }

        .subdomain-info strong {
          color: #6c6;
        }

        .tenant-login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .tenant-login-form .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .tenant-login-form label {
          color: #aaa;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .tenant-login-form input {
          padding: 12px 16px;
          border: 1px solid #333;
          border-radius: 6px;
          background: #2a2a2a;
          color: #fff;
          font-size: 1rem;
          transition: border-color 0.2s;
        }

        .tenant-login-form input:focus {
          outline: none;
          border-color: #4a9eff;
        }

        .tenant-login-form input::placeholder {
          color: #666;
        }

        .login-error {
          background: rgba(255, 77, 77, 0.1);
          border: 1px solid rgba(255, 77, 77, 0.3);
          color: #ff6b6b;
          padding: 10px 14px;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .login-button {
          padding: 14px;
          background: #4a9eff;
          border: none;
          border-radius: 6px;
          color: #fff;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .login-button:hover:not(:disabled) {
          background: #3a8eef;
        }

        .login-button:disabled {
          background: #555;
          cursor: not-allowed;
        }

        .tenant-login-footer {
          margin-top: 24px;
          text-align: center;
        }

        .tenant-login-footer p {
          color: #666;
          font-size: 0.85rem;
          margin: 0;
        }
      `}</style>
    </div>
  );
}

export default TenantLogin;
