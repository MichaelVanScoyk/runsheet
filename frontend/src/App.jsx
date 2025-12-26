import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import IncidentsPage from './pages/IncidentsPage';
import PersonnelPage from './pages/PersonnelPage';
import ApparatusPage from './pages/ApparatusPage';
import MunicipalitiesPage from './pages/MunicipalitiesPage';
import AdminPage from './pages/AdminPage';
import ReportsPage from './pages/ReportsPage';
import { 
  isAdminAuthenticated, 
  setAdminAuthenticated, 
  getUserSession, 
  setUserSession,
  clearUserSession, 
  updateSessionActivity,
  isSessionExpired,
  getPersonnel,
  personnelLogin,
  personnelRegister,
  personnelVerifyEmail,
  personnelSetPassword,
  personnelGetAuthStatus,
} from './api';
import './App.css';

// Session timeout checker component
function SessionManager({ userSession, onSessionExpired }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!userSession) return;

    // Check session every 30 seconds
    const interval = setInterval(() => {
      if (isSessionExpired()) {
        onSessionExpired();
        navigate('/');
      }
    }, 30000);

    // Update activity on user interaction
    const handleActivity = () => {
      updateSessionActivity();
    };

    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [userSession, onSessionExpired, navigate]);

  return null;
}

function AppContent() {
  const [adminAuth, setAdminAuth] = useState(isAdminAuthenticated());
  const [userSession, setUserSessionState] = useState(getUserSession());
  const [personnel, setPersonnel] = useState([]);
  const [personnelLoaded, setPersonnelLoaded] = useState(false);
  
  // Auth UI state
  const [selectedPersonnelId, setSelectedPersonnelId] = useState('');
  const [authStatus, setAuthStatus] = useState(null);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [showRegisterFlow, setShowRegisterFlow] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerCode, setRegisterCode] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerStep, setRegisterStep] = useState('email');
  const [registerLoading, setRegisterLoading] = useState(false);

  const navigate = useNavigate();

  // Load personnel list
  useEffect(() => {
    getPersonnel()
      .then(res => {
        setPersonnel(res.data);
        setPersonnelLoaded(true);
      })
      .catch(err => console.error('Failed to load personnel:', err));
  }, []);

  // Refresh session state periodically
  useEffect(() => {
    const checkSession = () => {
      const session = getUserSession();
      setUserSessionState(session);
    };
    
    checkSession();
    const interval = setInterval(checkSession, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAdminLogin = () => {
    setAdminAuth(true);
  };

  const handleAdminLogout = () => {
    setAdminAuthenticated(false);
    setAdminAuth(false);
  };

  const handleUserLogout = () => {
    clearUserSession();
    setUserSessionState(null);
    setSelectedPersonnelId('');
    setAuthStatus(null);
    setAuthPassword('');
    setAuthError('');
  };

  const handleSessionExpired = useCallback(() => {
    clearUserSession();
    setUserSessionState(null);
    setSelectedPersonnelId('');
    setAuthStatus(null);
    alert('Session expired. Please log in again.');
  }, []);

  // Auth handlers
  const handlePersonnelSelect = async (personnelId) => {
    setSelectedPersonnelId(personnelId);
    setAuthPassword('');
    setAuthError('');
    setShowRegisterFlow(false);
    
    if (!personnelId) {
      setAuthStatus(null);
      return;
    }
    
    try {
      const res = await personnelGetAuthStatus(personnelId);
      setAuthStatus(res.data);
    } catch (err) {
      console.error('Failed to get auth status:', err);
      setAuthStatus(null);
    }
  };

  const handleLogin = async () => {
    if (!selectedPersonnelId || !authPassword) return;
    setAuthError('');
    
    try {
      const res = await personnelLogin(parseInt(selectedPersonnelId), authPassword);
      setUserSession(res.data);
      setUserSessionState(res.data);
      setSelectedPersonnelId('');
      setAuthPassword('');
      setAuthStatus(null);
    } catch (err) {
      setAuthError(err.response?.data?.detail || 'Login failed');
    }
  };

  const handleStartRegister = () => {
    setShowRegisterFlow(true);
    setRegisterStep('email');
    setRegisterEmail(authStatus?.email || '');
    setRegisterCode('');
    setRegisterPassword('');
  };

  const handleRegisterSubmitEmail = async () => {
    if (!registerEmail) return;
    setRegisterLoading(true);
    setAuthError('');
    
    try {
      const res = await personnelRegister(parseInt(selectedPersonnelId), registerEmail);
      if (res.data.debug_code) {
        alert(`Verification code (dev mode): ${res.data.debug_code}`);
      }
      setRegisterStep('code');
    } catch (err) {
      setAuthError(err.response?.data?.detail || 'Failed to send verification');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleRegisterVerifyCode = async () => {
    if (!registerCode) return;
    setRegisterLoading(true);
    setAuthError('');
    
    try {
      await personnelVerifyEmail(parseInt(selectedPersonnelId), registerCode);
      setRegisterStep('password');
    } catch (err) {
      setAuthError(err.response?.data?.detail || 'Invalid code');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleRegisterSetPassword = async () => {
    if (!registerPassword || registerPassword.length < 6) {
      setAuthError('Password must be at least 6 characters');
      return;
    }
    setRegisterLoading(true);
    setAuthError('');
    
    try {
      await personnelSetPassword(parseInt(selectedPersonnelId), registerPassword);
      const res = await personnelLogin(parseInt(selectedPersonnelId), registerPassword);
      setUserSession(res.data);
      setUserSessionState(res.data);
      setShowRegisterFlow(false);
      setSelectedPersonnelId('');
      setAuthPassword('');
      setAuthStatus(null);
    } catch (err) {
      setAuthError(err.response?.data?.detail || 'Failed to set password');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleCancelRegister = () => {
    setShowRegisterFlow(false);
    setRegisterStep('email');
    setRegisterEmail('');
    setRegisterCode('');
    setRegisterPassword('');
    setAuthError('');
  };

  return (
    <div className="app">
      <SessionManager userSession={userSession} onSessionExpired={handleSessionExpired} />
      <nav className="sidebar">
        <div className="logo">
          <h1>RunSheet</h1>
          <span>Station 48</span>
        </div>
        
        {/* User session / login area */}
        <div className="user-auth-area" style={{ 
          padding: '10px', 
          background: '#2a2a2a', 
          margin: '0 10px 10px', 
          borderRadius: '4px',
          fontSize: '0.85rem'
        }}>
          {userSession ? (
            // Logged in
            <>
              <div style={{ color: '#2ecc71', marginBottom: '5px' }}>
                ✓ {userSession.display_name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={`badge ${userSession.role === 'ADMIN' ? 'badge-admin' : userSession.role === 'OFFICER' ? 'badge-officer' : 'badge-member'}`} style={{ fontSize: '0.75rem' }}>
                  {userSession.role}
                </span>
                <button 
                  onClick={handleUserLogout}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: '#888', 
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    padding: '2px 5px'
                  }}
                >
                  Logout
                </button>
              </div>
              {!userSession.is_approved && (
                <div style={{ color: '#f39c12', fontSize: '0.75rem', marginTop: '5px' }}>
                  ⚠️ Pending approval
                </div>
              )}
            </>
          ) : personnelLoaded ? (
            // Not logged in - show login UI
            <>
              <select 
                value={selectedPersonnelId}
                onChange={(e) => handlePersonnelSelect(e.target.value)}
                style={{ width: '100%', marginBottom: '8px', padding: '6px', fontSize: '0.85rem' }}
              >
                <option value="">-- Select Your Name --</option>
                {personnel.map(p => (
                  <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>
                ))}
              </select>

              {selectedPersonnelId && authStatus && (
                <>
                  {authStatus.is_registered ? (
                    // Has account - show password
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <input
                        type="password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="Password"
                        style={{ width: '100%', padding: '6px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      />
                      <button 
                        onClick={handleLogin}
                        style={{ width: '100%', padding: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                      >
                        Login
                      </button>
                    </div>
                  ) : !showRegisterFlow ? (
                    // No account - show register button
                    <button 
                      onClick={handleStartRegister}
                      style={{ width: '100%', padding: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      Set Up Account
                    </button>
                  ) : (
                    // Registration flow
                    <div>
                      {registerStep === 'email' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <input
                            type="email"
                            value={registerEmail}
                            onChange={(e) => setRegisterEmail(e.target.value)}
                            placeholder="Your email"
                            style={{ padding: '6px', fontSize: '0.85rem' }}
                          />
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button 
                              onClick={handleRegisterSubmitEmail}
                              disabled={registerLoading}
                              style={{ flex: 1, padding: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                              {registerLoading ? '...' : 'Send Code'}
                            </button>
                            <button 
                              onClick={handleCancelRegister}
                              style={{ padding: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )}
                      {registerStep === 'code' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <input
                            type="text"
                            value={registerCode}
                            onChange={(e) => setRegisterCode(e.target.value)}
                            placeholder="6-digit code"
                            style={{ padding: '6px', fontSize: '0.85rem' }}
                          />
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button 
                              onClick={handleRegisterVerifyCode}
                              disabled={registerLoading}
                              style={{ flex: 1, padding: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                              {registerLoading ? '...' : 'Verify'}
                            </button>
                            <button 
                              onClick={handleCancelRegister}
                              style={{ padding: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )}
                      {registerStep === 'password' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <input
                            type="password"
                            value={registerPassword}
                            onChange={(e) => setRegisterPassword(e.target.value)}
                            placeholder="Set password (6+ chars)"
                            style={{ padding: '6px', fontSize: '0.85rem' }}
                          />
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button 
                              onClick={handleRegisterSetPassword}
                              disabled={registerLoading}
                              style={{ flex: 1, padding: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                              {registerLoading ? '...' : 'Complete'}
                            </button>
                            <button 
                              onClick={handleCancelRegister}
                              style={{ padding: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {authError && (
                <div style={{ color: '#e74c3c', fontSize: '0.75rem', marginTop: '5px' }}>
                  {authError}
                </div>
              )}
            </>
          ) : (
            <div style={{ color: '#888' }}>Loading...</div>
          )}
        </div>

        <ul className="nav-links">
          <li>
            <NavLink 
              to="/" 
              className={({ isActive }) => isActive ? 'active' : ''}
              onClick={() => window.dispatchEvent(new CustomEvent('nav-incidents-click'))}
            >
              📋 Incidents
            </NavLink>
          </li>
          <li>
            <NavLink to="/reports" className={({ isActive }) => isActive ? 'active' : ''}>
              📊 Reports
            </NavLink>
          </li>
          <li>
            <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>
              🔧 Admin
            </NavLink>
          </li>
        </ul>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<IncidentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/personnel" element={<PersonnelPage />} />
          <Route path="/apparatus" element={<ApparatusPage />} />
          <Route path="/municipalities" element={<MunicipalitiesPage />} />
          <Route path="/admin" element={<AdminPage isAuthenticated={adminAuth} onLogin={handleAdminLogin} onLogout={handleAdminLogout} />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;