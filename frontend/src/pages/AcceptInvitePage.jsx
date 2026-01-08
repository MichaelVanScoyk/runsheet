import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { validateInviteToken, acceptInvite } from '../api';

function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inviteData, setInviteData] = useState(null);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

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

  // --- RENDER LOGIC (after all hooks) ---

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.loading}>Validating activation link...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.title}>✓ Account Activated!</h2>
          <p style={styles.message}>
            Welcome, {inviteData?.first_name}! Your account has been created.
          </p>
          
          {isSelfActivation ? (
            // Self-activation: NOT auto-approved
            <div style={styles.infoBoxWarning}>
              <p style={styles.infoTitle}>⏳ Pending Approval</p>
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
              <p style={styles.infoTitle}>📱 About Your Access</p>
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
          
          <p style={styles.message}>
            Redirecting you to the app...
          </p>
          <p style={styles.loading}>⏳</p>
          <button 
            onClick={() => window.location.href = '/'}
            style={styles.buttonSecondary}
          >
            Click here if not redirected
          </button>
        </div>
      </div>
    );
  }

  if (error && !inviteData) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.titleError}>Activation Error</h2>
          <p style={styles.error}>{error}</p>
          <p style={styles.message}>
            This activation link may have expired or already been used.
            Please try again or contact an administrator.
          </p>
          <button 
            onClick={() => navigate('/')}
            style={styles.buttonSecondary}
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>
          {isSelfActivation ? 'Activate Your Account' : 'Accept Invitation'}
        </h2>
        <p style={styles.welcome}>
          Welcome, <strong>{inviteData?.first_name} {inviteData?.last_name}</strong>!
        </p>
        <p style={styles.message}>
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
            style={styles.button}
          >
            {submitting ? 'Creating Account...' : (isSelfActivation ? 'Activate Account' : 'Create Account')}
          </button>
        </form>
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
    background: '#1a1a2e',
    padding: '1rem',
  },
  card: {
    background: '#2a2a3e',
    borderRadius: '8px',
    padding: '2rem',
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
  },
  title: {
    color: '#fff',
    marginTop: 0,
    marginBottom: '1rem',
    textAlign: 'center',
  },
  titleError: {
    color: '#dc2626',
    marginTop: 0,
    marginBottom: '1rem',
    textAlign: 'center',
  },
  welcome: {
    color: '#fff',
    textAlign: 'center',
    marginBottom: '0.5rem',
  },
  message: {
    color: '#888',
    textAlign: 'center',
    marginBottom: '1.5rem',
  },
  loading: {
    color: '#888',
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    color: '#ccc',
    marginBottom: '0.25rem',
    fontSize: '0.9rem',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '4px',
    border: '1px solid #444',
    background: '#1a1a2e',
    color: '#fff',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  inputDisabled: {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '4px',
    border: '1px solid #333',
    background: '#333',
    color: '#888',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '4px',
    border: 'none',
    background: '#dc2626',
    color: '#fff',
    fontSize: '1rem',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  buttonSecondary: {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '4px',
    border: '1px solid #666',
    background: 'transparent',
    color: '#ccc',
    fontSize: '1rem',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  error: {
    color: '#dc2626',
    fontSize: '0.9rem',
    marginBottom: '1rem',
    textAlign: 'center',
  },
  infoBox: {
    background: '#1a1a2e',
    border: '1px solid #444',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1.5rem',
  },
  infoBoxWarning: {
    background: '#1a1a2e',
    border: '1px solid #f59e0b',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1.5rem',
  },
  noteBox: {
    background: '#fef3c7',
    border: '1px solid #f59e0b',
    borderRadius: '6px',
    padding: '0.75rem',
    marginBottom: '1rem',
  },
  infoTitle: {
    color: '#fff',
    fontWeight: 'bold',
    marginTop: 0,
    marginBottom: '0.75rem',
  },
  infoText: {
    color: '#aaa',
    fontSize: '0.85rem',
    marginTop: 0,
    marginBottom: '0.5rem',
    lineHeight: '1.5',
  },
};

export default AcceptInvitePage;
