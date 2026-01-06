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

  useEffect(() => {
    if (!token) {
      setError('No invitation token provided');
      setLoading(false);
      return;
    }

    validateInviteToken(token)
      .then(res => {
        setInviteData(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'Invalid or expired invitation link');
        setLoading(false);
      });
  }, [token]);

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

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.loading}>Validating invitation...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.title}>✓ Account Created!</h2>
          <p style={styles.message}>
            Welcome, {inviteData?.first_name}! Your account has been created and approved.
          </p>
          <p style={styles.message}>
            You can now log in using your email and password.
          </p>
          <button 
            onClick={() => navigate('/')}
            style={styles.button}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (error && !inviteData) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.titleError}>Invitation Error</h2>
          <p style={styles.error}>{error}</p>
          <p style={styles.message}>
            This invitation link may have expired or already been used.
            Please contact an administrator to request a new invitation.
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
        <h2 style={styles.title}>Accept Invitation</h2>
        <p style={styles.welcome}>
          Welcome, <strong>{inviteData?.first_name} {inviteData?.last_name}</strong>!
        </p>
        <p style={styles.message}>
          Create a password to complete your account setup.
        </p>

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
            {submitting ? 'Creating Account...' : 'Create Account'}
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
};

export default AcceptInvitePage;
