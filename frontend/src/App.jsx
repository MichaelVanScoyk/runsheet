import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useNavigate, useParams } from 'react-router-dom';
import { BrandingProvider, useBranding } from './contexts/BrandingContext';
import { setStationTimezone } from './utils/timeUtils';
import IncidentsPage from './pages/IncidentsPage';
import PersonnelPage from './pages/PersonnelPage';
import ApparatusPage from './pages/ApparatusPage';
import MunicipalitiesPage from './pages/MunicipalitiesPage';
import AdminPage from './pages/AdminPage';
import ReportsPage from './pages/ReportsPage';
import TenantLogin from './components/TenantLogin';
import LandingPage from './components/LandingPage';
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
  checkTenantSession,
  tenantLogout,
} from './api';
import PrintView from './components/PrintView';
import './App.css';

// Standalone Print Page - no app shell
function PrintPage() {
  const { id } = useParams();
  
  if (!id) {
    return <div style={{ padding: '2rem' }}>Invalid incident ID</div>;
  }
  
  return <PrintView incidentId={parseInt(id)} onClose={() => window.close()} />;
}

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

function AppContent({ tenant, onTenantLogout }) {
  const branding = useBranding();
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

  // Load personnel list and timezone setting
  useEffect(() => {
    // Load personnel
    getPersonnel()
      .then(res => {
        setPersonnel(res.data);
        setPersonnelLoaded(true);
      })
      .catch(err => console.error('Failed to load personnel:', err));
    
    // Load timezone setting
    fetch('/api/settings/station/timezone')
      .then(res => res.json())
      .then(data => {
        if (data.value) {
          setStationTimezone(data.value);
        }
      })
      .catch(err => console.error('Failed to load timezone:', err));
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
          {/* Show logo if available */}
          {branding.logoUrl && (
            <img 
              src={branding.logoUrl} 
              alt="Logo" 
              style={{ 
                width: '90%', 
                maxWidth: '198px',
                height: 'auto', 
                objectFit: 'contain',
                marginBottom: '0.5rem'
              }} 
            />
          )}
          <span style={{ fontSize: '0.85rem', color: branding.primaryColor }}>{branding.stationName || tenant?.name || 'Fire Department'}</span>
        </div>
        
        {/* Tenant info */}
        <div style={{ 
          padding: '8px 12px', 
          background: '#fff', 
          borderRadius: '8px',
          border: '1px solid #ccc',
          fontSize: '0.8rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem'
        }}>
          <span style={{ color: '#333' }}>🏢 {tenant?.slug}</span>
          <button 
            onClick={onTenantLogout}
            style={{ 
              background: branding.primaryColor, 
              border: 'none', 
              color: '#fff', 
              cursor: 'pointer',
              fontSize: '0.7rem',
              padding: '3px 8px',
              borderRadius: '3px'
            }}
            title="Switch department"
          >
            Switch
          </button>
        </div>
        
        {/* User session / login area */}
        <div className="user-auth-area">
          {userSession ? (
            // Logged in
            <>
              <div style={{ color: branding.primaryColor, marginBottom: '5px', fontWeight: '500' }}>
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
                    color: '#666', 
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    padding: '2px 5px'
                  }}
                >
                  Logout
                </button>
              </div>
              {!userSession.is_approved && (
                <div style={{ color: '#ca8a04', fontSize: '0.75rem', marginTop: '5px' }}>
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
                <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '5px' }}>
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
  const [tenantSession, setTenantSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Check tenant session on load
  useEffect(() => {
    checkTenantSession()
      .then(res => {
        if (res.data.authenticated) {
          setTenantSession(res.data);
        }
      })
      .catch(err => {
        console.log('No tenant session:', err.message);
      })
      .finally(() => {
        setCheckingSession(false);
      });
  }, []);

  const handleTenantLogin = (data) => {
    setTenantSession({
      authenticated: true,
      tenant_id: data.tenant_id,
      slug: data.slug,
      name: data.name,
    });
  };

  const handleTenantLogout = async () => {
    try {
      await tenantLogout();
    } catch (err) {
      console.error('Logout error:', err);
    }
    setTenantSession(null);
  };

  // Detect if we're on main domain or subdomain
  const hostname = window.location.hostname;
  const isMainDomain = hostname === 'cadreport.com' || hostname === 'www.cadreport.com' || hostname === 'localhost';

  // Show loading while checking session
  if (checkingSession) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'var(--dark-bg, #1a1a2e)',
        color: '#888'
      }}>
        Loading...
      </div>
    );
  }

  // On main domain: show landing page with master admin
  if (isMainDomain && !tenantSession) {
    return <LandingPage />;
  }

  // On subdomain without session: show tenant login
  if (!tenantSession) {
    return <TenantLogin onLogin={handleTenantLogin} />;
  }

  // Show app with tenant context - wrapped in BrandingProvider
  return (
    <BrandingProvider>
      <Router>
        <Routes>
          {/* Print route - standalone, no app shell */}
          <Route path="/print/:id" element={<PrintPage />} />
          {/* All other routes use the app shell */}
          <Route path="/*" element={<AppContent tenant={tenantSession} onTenantLogout={handleTenantLogout} />} />
        </Routes>
      </Router>
    </BrandingProvider>
  );
}

export default App;
