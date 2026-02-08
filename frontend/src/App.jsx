/**
 * App.jsx - Main Application Component
 * 
 * INACTIVITY TIMEOUT & CROSS-TAB SESSION SYSTEM (Updated February 2026):
 * - Uses react-idle-timer library for robust idle detection
 * - Two-tier timeout system:
 *   - 10 minutes inactivity: Log out personnel session
 *   - 15 minutes inactivity: Hard page reload to "/" (full fresh state reset)
 * - Cross-tab session sharing via localStorage (login/logout syncs across tabs)
 * - Cross-tab idle timer sync via BroadcastChannel
 * - Tenant session (department-level cookie) is NOT affected by inactivity timeout
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useParams } from 'react-router-dom';
import { BrandingProvider, useBranding } from './contexts/BrandingContext';
import { HelpProvider, useHelp } from './contexts/HelpContext';
import { useHelpHover } from './hooks/useHelpHover';
import HelpPanel from './components/Help/HelpPanel';
import HelpHighlight from './components/Help/HelpHighlight';
import { setStationTimezone } from './utils/timeUtils';
import { useInactivityTimeout } from './hooks/useInactivityTimeout';
import { useAVAlerts } from './hooks/useAVAlerts';
import IncidentsPage from './pages/IncidentsPage';
import PersonnelPage from './pages/PersonnelPage';
import ApparatusPage from './pages/ApparatusPage';
import MunicipalitiesPage from './pages/MunicipalitiesPage';
import AdminPage from './pages/AdminPage';
import ReportsPage from './pages/ReportsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AcceptInvitePage from './pages/AcceptInvitePage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import TenantLogin from './components/TenantLogin';
import LandingPage from './components/LandingPage';
import { 
  getUserSession, 
  setUserSession,
  clearUserSession, 
  getPersonnel,
  personnelLogin,
  personnelRegister,
  personnelVerifyEmail,
  personnelSetPassword,
  personnelGetAuthStatus,
  checkTenantSession,
  tenantLogout,
  USER_SESSION_KEY,
} from './api';
import PrintView from './components/PrintView';
import ReviewTasksBadge from './components/ReviewTasksBadge';
import ProfileReviewBadge from './components/ProfileReviewBadge';
import SequenceAlertBadge from './components/SequenceAlertBadge';
import './App.css';

// Standalone Print Page - no app shell
function PrintPage() {
  const { id } = useParams();
  
  if (!id) {
    return <div style={{ padding: '2rem' }}>Invalid incident ID</div>;
  }
  
  return <PrintView incidentId={parseInt(id)} onClose={() => window.close()} />;
}

/**
 * DEPRECATED: Old SessionManager component
 * Replaced by useInactivityTimeout hook using react-idle-timer
 * Kept here for reference - see App.jsx.bak-pre-inactivity-timeout for full original
 * 
 * Issues with old approach:
 * - Used alert() which blocked the UI requiring user interaction
 * - Only tracked logged-in users, not general page inactivity
 * - Manual event listener management prone to edge cases
 * - No WebWorker support (browser could throttle background tabs)
 * - sessionStorage meant no cross-tab session sharing
 */
// function SessionManager({ userSession, onSessionExpired }) { ... }

function AppContent({ tenant, onTenantLogout }) {
  const branding = useBranding();
  const navigate = useNavigate();
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

  // AV Alerts state - persisted in localStorage for kiosk mode
  // The firehouse computer needs sound alerts to work even after inactivity logout/redirect
  // Browser audio policy: first sound after page load may be blocked, but WebSocket
  // events can sometimes trigger audio, and subsequent alerts will work
  const [avAlertsEnabled, setAvAlertsEnabled] = useState(() => {
    try {
      return localStorage.getItem('avAlertsEnabled') === 'true';
    } catch {
      return false;
    }
  });
  const [avAlertsTTSEnabled, setAvAlertsTTSEnabled] = useState(() => {
    try {
      return localStorage.getItem('avAlertsTTSEnabled') === 'true';
    } catch {
      return false;
    }
  });

  /**
   * Callback for when inactivity timeout clears user session
   * Syncs local React state with cleared localStorage
   */
  const handleInactivityLogout = useCallback(() => {
    setUserSessionState(null);
    setSelectedPersonnelId('');
    setAuthStatus(null);
    setAuthPassword('');
    setAuthError('');
  }, []);

  // Initialize inactivity timeout (replaces old SessionManager)
  useInactivityTimeout({ onUserLogout: handleInactivityLogout });

  // Initialize AV alerts (browser sound notifications for dispatch/close)
  const { connected: avConnected, lastAlert } = useAVAlerts({
    enabled: avAlertsEnabled,
    enableTTS: avAlertsTTSEnabled,
  });

  // Toggle AV alerts - persist to localStorage for kiosk mode
  const handleToggleAVAlerts = useCallback(() => {
    setAvAlertsEnabled(prev => {
      const newValue = !prev;
      try {
        localStorage.setItem('avAlertsEnabled', String(newValue));
      } catch (e) {
        console.warn('Failed to save avAlertsEnabled:', e);
      }
      return newValue;
    });
  }, []);

  const handleToggleAVAlertsTTS = useCallback(() => {
    setAvAlertsTTSEnabled(prev => {
      const newValue = !prev;
      try {
        localStorage.setItem('avAlertsTTSEnabled', String(newValue));
      } catch (e) {
        console.warn('Failed to save avAlertsTTSEnabled:', e);
      }
      return newValue;
    });
  }, []);

  // Refresh personnel list (called on mount and when personnel-changed event fires)
  const refreshPersonnel = useCallback(() => {
    getPersonnel()
      .then(res => {
        setPersonnel(res.data);
        setPersonnelLoaded(true);
      })
      .catch(err => console.error('Failed to load personnel:', err));
  }, []);

  // Load personnel list and timezone setting
  useEffect(() => {
    refreshPersonnel();
    
    // Load timezone setting
    fetch('/api/settings/station/timezone')
      .then(res => res.json())
      .then(data => {
        if (data.value) {
          setStationTimezone(data.value);
        }
      })
      .catch(err => console.error('Failed to load timezone:', err));
  }, [refreshPersonnel]);

  // Listen for personnel changes from any component (Admin page, Detail quick-add, etc.)
  useEffect(() => {
    const handlePersonnelChanged = () => refreshPersonnel();
    window.addEventListener('personnel-changed', handlePersonnelChanged);
    return () => window.removeEventListener('personnel-changed', handlePersonnelChanged);
  }, [refreshPersonnel]);

  /**
   * CROSS-TAB SESSION SYNC
   * Listen for localStorage changes from other tabs to sync login/logout state immediately
   */
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key !== USER_SESSION_KEY) return;
      
      if (event.newValue === null) {
        // Session cleared in another tab - sync logout
        console.log('[CrossTab] Session cleared in another tab');
        setUserSessionState(null);
        setSelectedPersonnelId('');
        setAuthStatus(null);
        setAuthPassword('');
        setAuthError('');
      } else if (event.newValue && !event.oldValue) {
        // Session created in another tab - sync login
        console.log('[CrossTab] Session created in another tab');
        try {
          const session = JSON.parse(event.newValue);
          setUserSessionState(session);
          setSelectedPersonnelId('');
          setAuthPassword('');
          setAuthError('');
        } catch (e) {
          console.error('[CrossTab] Failed to parse session:', e);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Refresh session state periodically (backup for cross-tab sync)
  useEffect(() => {
    const checkSession = () => {
      const session = getUserSession();
      setUserSessionState(session);
    };
    
    checkSession();
    const interval = setInterval(checkSession, 5000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Handle explicit user logout (clicking Logout button)
   * Clears session and navigates to incidents page
   */
  const handleUserLogout = useCallback(() => {
    clearUserSession();
    setUserSessionState(null);
    setSelectedPersonnelId('');
    setAuthStatus(null);
    setAuthPassword('');
    setAuthError('');
    // Navigate to incidents page on explicit logout
    navigate('/');
  }, [navigate]);

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
      await personnelRegister(parseInt(selectedPersonnelId), registerEmail);
      // Success - show message that email was sent
      setRegisterStep('email_sent');
    } catch (err) {
      setAuthError(err.response?.data?.detail || 'Failed to send activation email');
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
    <HelpProvider userSession={userSession}>
      <AppContentInner
        branding={branding}
        navigate={navigate}
        tenant={tenant}
        onTenantLogout={onTenantLogout}
        userSession={userSession}
        handleUserLogout={handleUserLogout}
        personnelLoaded={personnelLoaded}
        personnel={personnel}
        selectedPersonnelId={selectedPersonnelId}
        handlePersonnelSelect={handlePersonnelSelect}
        authStatus={authStatus}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        handleLogin={handleLogin}
        showRegisterFlow={showRegisterFlow}
        handleStartRegister={handleStartRegister}
        registerStep={registerStep}
        registerEmail={registerEmail}
        setRegisterEmail={setRegisterEmail}
        handleRegisterSubmitEmail={handleRegisterSubmitEmail}
        registerLoading={registerLoading}
        handleCancelRegister={handleCancelRegister}
        authError={authError}
        avAlertsEnabled={avAlertsEnabled}
        handleToggleAVAlerts={handleToggleAVAlerts}
      />
    </HelpProvider>
  );
}

function AppContentInner({
  branding, navigate, tenant, onTenantLogout, userSession,
  handleUserLogout, personnelLoaded, personnel,
  selectedPersonnelId, handlePersonnelSelect, authStatus,
  authPassword, setAuthPassword, handleLogin,
  showRegisterFlow, handleStartRegister, registerStep,
  registerEmail, setRegisterEmail, handleRegisterSubmitEmail,
  registerLoading, handleCancelRegister, authError,
  avAlertsEnabled, handleToggleAVAlerts,
}) {
  // Initialize help hover detection
  useHelpHover();

  // Get help panel state for content margin adjustment
  const { helpOpen } = useHelp();

  // Mobile sidebar toggle
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef(null);

  // Close sidebar on route change (mobile)
  const location = window.location.pathname;
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  return (
    <div className="app">
      {/* Mobile hamburger button */}
      <button 
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(prev => !prev)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Mobile overlay backdrop */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'sidebar-overlay-visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* SessionManager removed - replaced by useInactivityTimeout hook */}
      <nav className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`} ref={sidebarRef}>
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
          
          {/* Tenant logout */}
          <div style={{ 
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            marginTop: '8px',
            fontSize: '0.8rem'
          }}>
            <span style={{ color: '#333' }}>{tenant?.slug}</span>
            <button 
              onClick={onTenantLogout}
              data-help-id="tenant_logout"
              style={{ 
                background: '#dc2626', 
                border: 'none', 
                color: '#fff', 
                cursor: 'pointer',
                fontSize: '0.7rem',
                padding: '3px 8px',
                borderRadius: '3px'
              }}
              title="Logout from this department"
            >
              Logout
            </button>
          </div>
          
          {/* Dispatch Sound toggle */}
          <label data-help-id="enable_sound" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            width: '100%',
            fontSize: '0.8rem',
            color: '#666',
            cursor: 'pointer',
            marginTop: '8px'
          }}>
            Enable Sound
            <input
              type="checkbox"
              checked={avAlertsEnabled}
              onChange={handleToggleAVAlerts}
            />
          </label>
          {/* Help toggle - visibility controlled by admin setting */}
          <HelpToggle />
        </div>
        
        {/* User session / login area */}
        <div className="user-auth-area" data-help-id="personnel_login">
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
                              {registerLoading ? '...' : 'Send Link'}
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
                      {registerStep === 'email_sent' && (
                        <div style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: '8px',
                          background: '#f0fdf4',
                          border: '1px solid #86efac',
                          borderRadius: '6px',
                          padding: '10px',
                          fontSize: '0.8rem'
                        }}>
                          <div style={{ color: '#166534', fontWeight: '500' }}>✓ Check your email!</div>
                          <div style={{ color: '#15803d', lineHeight: '1.4' }}>
                            We sent an activation link to <strong>{registerEmail}</strong>
                          </div>
                          <div style={{ color: '#166534', fontSize: '0.75rem' }}>
                            Click the link in the email to set your password and activate your account.
                          </div>
                          <button 
                            onClick={handleCancelRegister}
                            style={{ 
                              padding: '6px', 
                              fontSize: '0.8rem', 
                              cursor: 'pointer',
                              background: 'transparent',
                              border: '1px solid #86efac',
                              borderRadius: '4px',
                              color: '#166534'
                            }}
                          >
                            Done
                          </button>
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

        <ul className="nav-links" data-help-id="navigation">
          <li>
            <NavLink 
              to="/" 
              className={({ isActive }) => isActive ? 'active' : ''}
              onClick={() => { setSidebarOpen(false); window.dispatchEvent(new CustomEvent('nav-incidents-click')); }}
            >
              📋 Incidents
            </NavLink>
          </li>
          <li>
            <NavLink to="/reports" className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>
              📊 Reports
            </NavLink>
          </li>
          <li>
            <NavLink to="/analytics" className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>
              📈 Analytics
            </NavLink>
          </li>
          {/* Admin - only show for OFFICER or ADMIN */}
          {userSession && (userSession.role === 'OFFICER' || userSession.role === 'ADMIN') && (
            <li>
              <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>
                🔧 Admin
              </NavLink>
            </li>
          )}
        </ul>

        {/* Review Tasks Badge - Officers and Admins only */}
        <ReviewTasksBadge 
          userSession={userSession} 
          primaryColor={branding.primaryColor}
        />

        {/* Profile Review Badge - for manually-added personnel */}
        <ProfileReviewBadge 
          userSession={userSession} 
          primaryColor={branding.primaryColor}
        />

        {/* Sequence Alert Badge - out-of-order incidents */}
        <SequenceAlertBadge 
          userSession={userSession} 
          primaryColor={branding.primaryColor}
        />
      </nav>
      <main className="content" style={{ marginRight: helpOpen ? '320px' : '0', transition: 'margin-right 0.2s ease' }}>
        <Routes>
          <Route path="/" element={<IncidentsPage userSession={userSession} />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/analytics" element={<AnalyticsPage userSession={userSession} />} />
          <Route path="/personnel" element={<PersonnelPage />} />
          <Route path="/apparatus" element={<ApparatusPage />} />
          <Route path="/municipalities" element={<MunicipalitiesPage />} />
          <Route path="/admin" element={
            userSession && (userSession.role === 'OFFICER' || userSession.role === 'ADMIN')
              ? <AdminPage userSession={userSession} />
              : <div style={{ padding: '2rem', color: '#666' }}>Access restricted to Officers and Admins. Please log in with an authorized account.</div>
          } />
        </Routes>
      </main>
      <HelpPanel />
      <HelpHighlight />
    </div>
  );
}


/**
 * HelpToggle - sidebar checkbox for toggling help panel
 * Only shown if admin has enabled help.toggle_visible
 */
function HelpToggle() {
  const { helpOpen, toggleHelp, helpSettings } = useHelp();
  if (!helpSettings.toggle_visible) return null;
  return (
    <label data-help-id="enable_help" style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      width: '100%',
      fontSize: '0.8rem',
      color: '#666',
      cursor: 'pointer',
      marginTop: '4px'
    }}>
      Enable Help
      <input
        type="checkbox"
        checked={helpOpen}
        onChange={toggleHelp}
      />
    </label>
  );
}

/**
 * AppContentWithHelp - wraps AppContent in HelpProvider (needs router context)
 */
function AppContentWithHelp({ tenant, onTenantLogout }) {
  const userSession = null; // Will be set inside AppContent, but we need it at HelpProvider level
  // HelpProvider is inside AppContent since userSession is managed there
  return <AppContent tenant={tenant} onTenantLogout={onTenantLogout} />;
}

/**
 * SplashGate - Holds the CADReport splash screen until branding is fully loaded + 1 second.
 * Must be rendered inside BrandingProvider so it can read branding.loading.
 * Prevents any flash of default/neutral branding before tenant colors apply.
 */
function SplashGate({ children }) {
  const branding = useBranding();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    // Once branding finishes loading, start 1-second hold timer
    if (!branding.loading && !timerRef.current) {
      timerRef.current = setTimeout(() => setMinTimeElapsed(true), 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [branding.loading]);

  if (branding.loading || !minTimeElapsed) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8f9fa',
      }}>
        <img 
          src="/cadreportlogo.png" 
          alt="CADReport" 
          style={{ maxWidth: '380px', width: '80%', height: 'auto' }} 
        />
      </div>
    );
  }

  return children;
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
  
  // Check if we're on a standalone auth page that doesn't need tenant session
  const pathname = window.location.pathname;
  const isStandaloneAuthPage = pathname.startsWith('/accept-invite') || pathname.startsWith('/reset-password');

  // Standalone auth pages bypass tenant login requirement
  if (isStandaloneAuthPage) {
    return (
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Show branded splash while checking session - prevents any tenant data flash
  if (checkingSession) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8f9fa',
      }}>
        <img 
          src="/cadreportlogo.png" 
          alt="CADReport" 
          style={{ maxWidth: '380px', width: '80%', height: 'auto' }} 
        />
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
  // SplashGate holds the splash until branding loads + 1 second
  return (
    <BrandingProvider>
      <SplashGate>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Standalone auth pages - no app shell needed */}
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            {/* Print route - standalone, no app shell */}
            <Route path="/print/:id" element={<PrintPage />} />
            {/* All other routes use the app shell */}
            <Route path="/*" element={<AppContent tenant={tenantSession} onTenantLogout={handleTenantLogout} />} />
          </Routes>
        </BrowserRouter>
      </SplashGate>
    </BrandingProvider>
  );
}

export default App;
