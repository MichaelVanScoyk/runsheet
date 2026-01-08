import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { validateInviteToken, acceptInvite } from '../api';

// Default branding if fetch fails
const DEFAULT_BRANDING = {
  stationName: 'Fire Department',
  logoUrl: null,
  primaryColor: '#dc2626',
};

function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inviteData, setInviteData] = useState(null);
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

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
        }
      })
      .catch(err => console.error('Failed to load branding:', err));
  }, []);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setError('No activation token provided');
      setLoading(false);
      return;
    }

    validateInviteToken(token)
      .then(res => {
        setInviteData(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'Invalid or expired activation link');
        setLoading(false);
      });
  }, [token]);

  // Handle auto-redirect after success (must be before any returns!)
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        window.location.href = '/';  // Full page reload to pick up new cookie
      }, 10000);  // 10 seconds to read the info
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await acceptInvite(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  };

  // Check if this is a self-activation (not auto-approved) or admin invite (auto-approved)
  const isSelfActivation = inviteData?.is_self_activation;

  // Dynamic styles based on branding
  const dynamicStyles = {
    button: {
      ...styles.button,
      background: branding.primaryColor,
    },
    buttonHover: {
      background: branding.primaryColor,
      filter: 'brightness(0.9)',
    },
  };

  // --- RENDER LOGIC (after all hooks) ---

  // Header component with logo and station name
  const PageHeader = () => (
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
  );

  // Footer component
  const PageFooter = () => (
    <div style={styles.footer}>
      Powered by <strong>CADReport</strong>
    </div>
  );

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <PageHeader />
          <div style={styles.loadingSpinner}>
            <div style={styles.spinner}></div>
            <p style={styles.loadingText}>Validating activation link...</p>
          </div>
          <PageFooter />
        </div>
        <style>{spinnerKeyframes}</style>
      </div>
    );
  }

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <PageHeader />
          
          <div style={{...styles.successBanner, borderColor: branding.primaryColor, background: `${branding.primaryColor}10`}}>
            <span style={styles.successIcon}>✓</span>
            <h2 style={{...styles.successTitle, color: branding.primaryColor}}>Account Activated!</h2>
          </div>
          
          <p style={styles.welcomeText}>
            Welcome, <strong>{inviteData?.first_name}</strong>! Your account has been created.
          </p>
          
          {isSelfActivation ? (
            // Self-activation: NOT auto-approved
            <div style={styles.infoBoxWarning}>
              <div style={styles.infoHeader}>
                <span style={styles.infoIcon}>⏳</span>
                <span style={styles.infoTitle}>Pending Approval</span>
              </div>
              <p style={styles.infoText}>
                Your account is active but <strong>pending approval</strong> from an officer or admin.
              </p>
              <p style={styles.infoText}>
                You can complete <strong>one incident report</strong> right now. After that, you'll need approval for full access.
              </p>
              <p style={styles.infoText}>
                An admin has been notified of your activation.
              </p>
            </div>
          ) : (
            // Admin invite: auto-approved
            <div style={styles.infoBox}>
              <div style={styles.infoHeader}>
                <span style={styles.infoIcon}>📱</span>
                <span style={styles.infoTitle}>About Your Access</span>
              </div>
              <p style={styles.infoText}>
                You're now logged into this browser. To maintain access, <strong>keep using this same browser on this device</strong>.
              </p>
              <p style={styles.infoText}>
                If you need to access from a different device or browser, you'll need the department access code from your administrator.
              </p>
              <p style={styles.infoText}>
                Your personal password is separate and keeps your account secure.
              </p>
            </div>
          )}
          
          <div style={styles.redirectBox}>
            <div style={styles.spinner}></div>
            <span style={styles.redirectText}>Redirecting you to the app...</span>
          </div>
          
          <button 
            onClick={() => window.location.href = '/'}
            style={styles.buttonSecondary}
          >
            Click here if not redirected
          </button>
          
          <PageFooter />
        </div>
        <style>{spinnerKeyframes}</style>
      </div>
    );
  }

  if (error && !inviteData) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <PageHeader />
          
          <div style={styles.errorBanner}>
            <span style={styles.errorIcon}>⚠️</span>
            <h2 style={styles.errorTitle}>Activation Error</h2>
          </div>
          
          <p style={styles.errorMessage}>{error}</p>
          <p style={styles.messageText}>
            This activation link may have expired or already been used.
            Please try again or contact an administrator.
          </p>
          
          <button 
            onClick={() => navigate('/')}
            style={styles.buttonSecondary}
          >
            Go to Home
          </button>
          
          <PageFooter />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <PageHeader />
        
        <h2 style={styles.title}>
          {isSelfActivation ? 'Activate Your Account' : 'Accept Invitation'}
        </h2>
        <p style={styles.welcome}>
          Welcome, <strong>{inviteData?.first_name} {inviteData?.last_name}</strong>!
        </p>
        <p style={styles.messageText}>
          Create a password to complete your account setup.
        </p>

        {isSelfActivation && (
          <div style={styles.noteBox}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#92400e' }}>
              <strong>Note:</strong> After activation, you'll be able to complete one incident report. 
              An admin will then approve your account for full access.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={inviteData?.email || ''}
              disabled
              style={styles.inputDisabled}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              style={styles.input}
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button 
            type="submit" 
            disabled={submitting}
            style={dynamicStyles.button}
          >
            {submitting ? 'Creating Account...' : (isSelfActivation ? 'Activate Account' : 'Create Account')}
          </button>
        </form>
        
        <PageFooter />
      </div>
      <style>{spinnerKeyframes}</style>
    </div>
  );
}

// Spinner animation keyframes
const spinnerKeyframes = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f3f4f6',
    padding: '1rem',
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
  title: {
    color: '#1f2937',
    marginTop: 0,
    marginBottom: '0.25rem',
    textAlign: 'center',
    fontSize: '1.1rem',
  },
  welcome: {
    color: '#374151',
    textAlign: 'center',
    marginBottom: '0.25rem',
    fontSize: '0.95rem',
  },
  messageText: {
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
  loadingSpinner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '1.5rem 0',
  },
  spinner: {
    width: 28,
    height: 28,
    border: '3px solid #e5e7eb',
    borderTopColor: '#dc2626',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '0.75rem',
    color: '#6b7280',
    fontSize: '0.9rem',
  },
  successBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    borderRadius: '6px',
    border: '1px solid',
    marginBottom: '1rem',
  },
  successIcon: {
    fontSize: '1.25rem',
  },
  successTitle: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: '600',
  },
  welcomeText: {
    textAlign: 'center',
    color: '#374151',
    marginBottom: '1rem',
    fontSize: '0.95rem',
  },
  infoBox: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '0.75rem',
    marginBottom: '1rem',
  },
  infoBoxWarning: {
    background: '#fffbeb',
    border: '1px solid #f59e0b',
    borderRadius: '6px',
    padding: '0.75rem',
    marginBottom: '1rem',
  },
  infoHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  infoIcon: {
    fontSize: '1rem',
  },
  infoTitle: {
    fontWeight: '600',
    color: '#1f2937',
    fontSize: '0.9rem',
  },
  infoText: {
    margin: '0 0 0.35rem 0',
    fontSize: '0.8rem',
    color: '#4b5563',
    lineHeight: '1.4',
  },
  redirectBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    marginBottom: '0.75rem',
  },
  redirectText: {
    color: '#6b7280',
    fontSize: '0.85rem',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    borderRadius: '6px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    marginBottom: '1rem',
  },
  errorIcon: {
    fontSize: '1.25rem',
  },
  errorTitle: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: '600',
    color: '#dc2626',
  },
  errorMessage: {
    color: '#dc2626',
    fontSize: '0.9rem',
    marginBottom: '0.75rem',
    textAlign: 'center',
    fontWeight: '500',
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
  inputDisabled: {
    width: '100%',
    padding: '0.6rem',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    color: '#6b7280',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '0.65rem',
    borderRadius: '6px',
    border: 'none',
    background: '#dc2626',
    color: '#fff',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  buttonSecondary: {
    width: '100%',
    padding: '0.65rem',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#374151',
    fontSize: '0.95rem',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  error: {
    color: '#dc2626',
    fontSize: '0.85rem',
    marginBottom: '0.75rem',
    textAlign: 'center',
  },
  noteBox: {
    background: '#fef3c7',
    border: '1px solid #f59e0b',
    borderRadius: '6px',
    padding: '0.6rem',
    marginBottom: '0.75rem',
  },
  footer: {
    textAlign: 'center',
    marginTop: '1rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #e5e7eb',
    color: '#9ca3af',
    fontSize: '0.8rem',
  },
};

export default AcceptInvitePage;
