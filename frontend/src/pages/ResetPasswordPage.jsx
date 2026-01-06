import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { validateResetToken, completePasswordReset } from '../api';

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tokenData, setTokenData] = useState(null);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('No reset token provided');
      setLoading(false);
      return;
    }

    validateResetToken(token)
      .then(res => {
        setTokenData(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'Invalid or expired reset link');
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
      await completePasswordReset(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.loading}>Validating reset link...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.title}>✓ Password Reset!</h2>
          <p style={styles.message}>
            Your password has been successfully updated.
          </p>
          <p style={styles.message}>
            You can now log in with your new password.
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

  if (error && !tokenData) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.titleError}>Reset Link Error</h2>
          <p style={styles.error}>{error}</p>
          <p style={styles.message}>
            This password reset link may have expired or already been used.
            Please request a new password reset from an administrator.
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
        <h2 style={styles.title}>Reset Password</h2>
        <p style={styles.welcome}>
          Resetting password for <strong>{tokenData?.display_name}</strong>
        </p>

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={tokenData?.email || ''}
              disabled
              style={styles.inputDisabled}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>New Password</label>
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
            <label style={styles.label}>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your new password"
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
            {submitting ? 'Resetting...' : 'Reset Password'}
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
    color: '#888',
    textAlign: 'center',
    marginBottom: '1.5rem',
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

export default ResetPasswordPage;
