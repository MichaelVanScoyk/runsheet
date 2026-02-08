import { useState, useEffect } from 'react';
import { tenantLogin } from '../api';

// Default branding if fetch fails
const DEFAULT_BRANDING = {
  stationName: 'Fire Department',
  logoUrl: null,
  primaryColor: '#dc2626',
};

/**
 * Tenant Login Form
 * 
 * Shown on subdomain (e.g., glenmoorefc.cadreport.com) when not logged in.
 * Light theme matching AcceptInvitePage design with department branding.
 */
function TenantLogin({ onLogin }) {
  const [slug, setSlug] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  // Pre-fill slug from subdomain
  const subdomain = window.location.hostname.split('.')[0];
  const isSubdomain = subdomain && subdomain !== 'cadreport' && subdomain !== 'www';

  // Fetch branding on mount (public endpoint - no auth required)
  useEffect(() => {
    fetch('/api/branding/theme')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setBranding({
            stationName: data.station_name || DEFAULT_BRANDING.stationName,
            logoUrl: data.logo_url || null,
            primaryColor: data.primary_color || DEFAULT_BRANDING.primaryColor,
          });
          // Set browser tab title
          if (data.station_name) {
            document.title = `${data.station_name} — CADReport`;
          }
        }
      })
      .catch(err => console.error('Failed to load branding:', err));
  }, []);

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
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header - department logo + name */}
        <div style={styles.header}>
          {branding.logoUrl && (
            <img 
              src={branding.logoUrl} 
              alt="Department Logo" 
              style={styles.logo}
            />
          )}
          <h1 style={styles.stationName}>{branding.stationName}</h1>
        </div>

        {/* Subdomain indicator */}
        {isSubdomain && (
          <div style={{
            ...styles.subdomainInfo,
            background: `${branding.primaryColor}10`,
            borderColor: `${branding.primaryColor}40`,
            color: branding.primaryColor,
          }}>
            Logging in to <strong>{subdomain}</strong>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!isSubdomain && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Department Code</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                style={styles.input}
              />
            </div>
          )}

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus={isSubdomain}
              autoComplete="current-password"
              style={styles.input}
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            style={{
              ...styles.button,
              background: branding.primaryColor,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <div style={styles.footerInfo}>
          Don't have access? Contact your fire company officer.
        </div>

        {/* Powered by CADReport footer */}
        <div style={styles.footer}>
          Powered by <strong>CADReport</strong>
          <span style={styles.footerDot}>·</span>
          <a href="https://cadreport.com" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
            Support
          </a>
        </div>
      </div>

      {/* CADReport logo - bottom right corner */}
      <div style={styles.cornerBadge}>
        <img 
          src="/cadreportlogo.png" 
          alt="CADReport" 
          style={styles.cornerLogo}
        />
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f3f4f6',
    padding: '1rem',
    position: 'relative',
  },
  card: {
    background: '#ffffff',
    borderRadius: '12px',
    padding: '1.5rem',
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '1rem',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid #e5e7eb',
  },
  logo: {
    maxWidth: '80px',
    maxHeight: '80px',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
    marginBottom: '0.5rem',
  },
  stationName: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  subdomainInfo: {
    textAlign: 'center',
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
  formGroup: {
    marginBottom: '0.75rem',
  },
  label: {
    display: 'block',
    color: '#374151',
    marginBottom: '0.2rem',
    fontSize: '0.85rem',
    fontWeight: '500',
  },
  input: {
    width: '100%',
    padding: '0.6rem',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#1f2937',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
  },
  error: {
    color: '#dc2626',
    fontSize: '0.85rem',
    marginBottom: '0.75rem',
    textAlign: 'center',
  },
  button: {
    width: '100%',
    padding: '0.65rem',
    borderRadius: '6px',
    border: 'none',
    color: '#fff',
    fontSize: '0.95rem',
    fontWeight: '600',
    marginTop: '0.5rem',
  },
  footerInfo: {
    textAlign: 'center',
    marginTop: '1rem',
    color: '#9ca3af',
    fontSize: '0.8rem',
  },
  footer: {
    textAlign: 'center',
    marginTop: '0.75rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #e5e7eb',
    color: '#9ca3af',
    fontSize: '0.8rem',
  },
  footerDot: {
    margin: '0 6px',
    color: '#d1d5db',
  },
  footerLink: {
    color: '#6b7280',
    textDecoration: 'none',
    fontWeight: '500',
  },
  cornerBadge: {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    background: '#ffffff',
    borderRadius: '10px',
    padding: '8px 12px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb',
  },
  cornerLogo: {
    height: '28px',
    width: 'auto',
    display: 'block',
  },
};

export default TenantLogin;
