import axios from 'axios';

// Use relative path - configure proxy in vite.config.js or nginx
const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,  // Send cookies with every request for tenant auth
});

// ============================================================================
// INCIDENTS
// ============================================================================

export const getIncidents = (year, category, status) => {
  const params = { limit: 1000 };
  if (year) params.year = year;
  if (category) params.category = category;
  if (status) params.status = status;
  return api.get('/incidents', { params });
};

export const getIncident = (id) => api.get(`/incidents/${id}`);

export const createIncident = (data) => api.post('/incidents', data);

export const updateIncident = (id, data, editedBy = null) => {
  const params = editedBy ? { edited_by: editedBy } : {};
  return api.put(`/incidents/${id}`, data, { params });
};

export const closeIncident = (id, editedBy = null) => {
  const params = editedBy ? { edited_by: editedBy } : {};
  return api.post(`/incidents/${id}/close`, null, { params });
};

export const completeIncident = (id) => api.post(`/incidents/${id}/complete`);

export const getIncidentAuditLog = (id, limit = 50) => 
  api.get(`/incidents/${id}/audit-log`, { params: { limit } });

export const suggestIncidentNumber = (year = null, category = 'FIRE') => {
  const params = { category };
  if (year) params.year = year;
  return api.get('/incidents/suggest-number', { params });
};

export const getIncidentYears = () => api.get('/incidents/years');

export const getAdjacentIncidents = (id) => api.get(`/incidents/${id}/adjacent`);

export const deleteIncident = (id) => api.delete(`/incidents/${id}`);

// ============================================================================
// PERSONNEL
// ============================================================================

export const getPersonnel = () => api.get('/personnel');

export const getPersonnelByRank = () => api.get('/personnel/by-rank');

export const createPersonnel = (data) => api.post('/personnel', data);

export const updatePersonnel = (id, data) => api.put(`/personnel/${id}`, data);

export const deletePersonnel = (id) => api.delete(`/personnel/${id}`);

export const getRanks = () => api.get('/personnel/ranks');

export const createRank = (data) => api.post('/personnel/ranks', data);

export const updateRank = (id, data) => api.put(`/personnel/ranks/${id}`, data);

export const deleteRank = (id) => api.delete(`/personnel/ranks/${id}`);

// Personnel Auth
export const personnelLogin = (personnelId, password) => 
  api.post('/personnel/auth/login', { personnel_id: personnelId, password });

export const personnelRegister = (personnelId, email) => 
  api.post('/personnel/auth/register', { personnel_id: personnelId, email });

export const personnelVerifyEmail = (personnelId, code) => 
  api.post('/personnel/auth/verify-email', { personnel_id: personnelId, code });

export const personnelSetPassword = (personnelId, password) => 
  api.post('/personnel/auth/set-password', { personnel_id: personnelId, password });

export const personnelGetAuthStatus = (personnelId) => 
  api.get(`/personnel/auth/status/${personnelId}`);

export const approveMember = (personnelId, approverId, approverPassword) => 
  api.post(`/personnel/${personnelId}/approve`, { 
    approver_id: approverId, 
    approver_password: approverPassword 
  });

export const updatePersonnelRole = (personnelId, role, adminId, adminPassword) => 
  api.put(`/personnel/${personnelId}/role`, { 
    role, 
    admin_id: adminId, 
    admin_password: adminPassword 
  });

// Personnel Full Details (for admin modal)
export const getPersonnelFull = (personnelId) => 
  api.get(`/personnel/${personnelId}/full`);

// Password Reset (admin-triggered)
export const sendPasswordReset = (personnelId, adminId, adminPassword) => 
  api.post(`/personnel/${personnelId}/send-password-reset`, {
    admin_id: adminId,
    admin_password: adminPassword
  });

export const validateResetToken = (token) => 
  api.get(`/personnel/auth/validate-reset/${token}`);

export const completePasswordReset = (token, newPassword) => 
  api.post('/personnel/auth/complete-reset', { token, new_password: newPassword });

// Invitations
export const sendInvite = (personnelId, email, adminId, adminPassword) => 
  api.post(`/personnel/${personnelId}/send-invite`, {
    email,
    admin_id: adminId,
    admin_password: adminPassword
  });

export const resendInvite = (personnelId, adminId, adminPassword) => 
  api.post(`/personnel/${personnelId}/resend-invite`, {
    admin_id: adminId,
    admin_password: adminPassword
  });

export const validateInviteToken = (token) => 
  api.get(`/personnel/auth/validate-invite/${token}`);

export const acceptInvite = (token, password) => 
  api.post('/personnel/auth/accept-invite', { token, password });

// User Self-Service
export const getMyProfile = (personnelId) => 
  api.get('/personnel/me', { params: { personnel_id: personnelId } });

export const updateMyNotifications = (personnelId, prefs) => 
  api.put('/personnel/me/notifications', prefs, { params: { personnel_id: personnelId } });

export const changeMyPassword = (personnelId, currentPassword, newPassword) => 
  api.post('/personnel/me/change-password', 
    { current_password: currentPassword, new_password: newPassword },
    { params: { personnel_id: personnelId } }
  );

export const requestEmailChange = (personnelId, newEmail, password) => 
  api.post('/personnel/me/request-email-change',
    { new_email: newEmail, password },
    { params: { personnel_id: personnelId } }
  );

export const validateEmailChangeToken = (token) => 
  api.get(`/personnel/auth/validate-email-change/${token}`);

export const confirmEmailChange = (token) => 
  api.post('/personnel/auth/confirm-email-change', null, { params: { token } });

// ============================================================================
// APPARATUS
// ============================================================================

export const getApparatus = (includeInactive = true) => 
  api.get('/apparatus', { params: { active_only: !includeInactive } });

export const createApparatus = (data) => api.post('/apparatus', data);

export const updateApparatus = (id, data) => api.put(`/apparatus/${id}`, data);

export const deleteApparatus = (id) => api.delete(`/apparatus/${id}`);

export const reactivateApparatus = (id) => api.post(`/apparatus/${id}/reactivate`);

export const hardDeleteApparatus = (id) => api.delete(`/apparatus/${id}/permanent`);

// ============================================================================
// MUNICIPALITIES
// ============================================================================

export const getMunicipalities = (includeInactive = false) => 
  api.get('/lookups/municipalities', { params: { include_inactive: includeInactive } });

export const getMunicipalityByCode = (code) => 
  api.get(`/lookups/municipalities/${code}`);

export const createMunicipality = (data) => 
  api.post('/lookups/municipalities', data);

export const updateMunicipality = (id, data) => 
  api.put(`/lookups/municipalities/${id}`, data);

export const deleteMunicipality = (id) => 
  api.delete(`/lookups/municipalities/${id}`);

// ============================================================================
// NERIS LOOKUPS
// ============================================================================

export const getIncidentTypes = () => api.get('/lookups/neris/incident-types');

export const getIncidentTypesByCategory = () => api.get('/lookups/neris/incident-types/by-category');

export const getLocationUses = () => api.get('/lookups/neris/location-uses');

export const getLocationUsesByCategory = () => api.get('/lookups/neris/location-uses/by-category');

export const getActionsTaken = () => api.get('/lookups/neris/actions-taken');

export const getActionsTakenByCategory = () => api.get('/lookups/neris/actions-taken/by-category');

export const getAidTypes = () => api.get('/lookups/neris/aid-types');

export const getAidDirections = () => api.get('/lookups/neris/aid-directions');

// Generic NERIS category lookup - for conditional module dropdowns
export const getNerisCategory = (category) => api.get(`/neris-codes/categories/${category}`);

// ALL NERIS dropdowns in one call - reduces 25+ API calls to 1
export const getAllNerisDropdowns = () => api.get('/lookups/neris/all-dropdowns');

// ============================================================================
// CAD TYPE MAPPINGS
// ============================================================================

export const getCadTypeMappings = () => api.get('/lookups/cad-type-mappings');

export const updateCadTypeMapping = (id, category) => 
  api.put(`/lookups/cad-type-mappings/${id}`, null, { params: { call_category: category } });

// ============================================================================
// SETTINGS
// ============================================================================

export const getSettings = () => api.get('/settings');

export const getSetting = (category, key) => api.get(`/settings/${category}/${key}`);

export const updateSetting = (category, key, value) => 
  api.put(`/settings/${category}/${key}`, { value });

export const getPrintSettings = () => api.get('/settings/print');

export const updatePrintSettings = (settings) => api.put('/settings/print', settings);

// Print Layout (v2 - page-based blocks)
export const getPrintLayout = () => api.get('/settings/print/layout');

export const updatePrintLayout = (layout) => api.put('/settings/print/layout', layout);

export const resetPrintLayout = () => api.post('/settings/print/layout/reset');

// ============================================================================
// ADMIN
// ============================================================================

export const verifyAdminPassword = (password) => 
  api.post('/admin/verify', { password });

export const setAdminAuthenticated = (value) => {
  // Client-side only - store in sessionStorage
  if (value) {
    sessionStorage.setItem('adminAuthenticated', 'true');
  } else {
    sessionStorage.removeItem('adminAuthenticated');
  }
};

export const isAdminAuthenticated = () => {
  return sessionStorage.getItem('adminAuthenticated') === 'true';
};

export const changeAdminPassword = (currentPassword, newPassword) => 
  api.post('/admin/change-password', { current_password: currentPassword, new_password: newPassword });

export const getAuditLog = (limit = 100, entityType = null) => {
  const params = { limit };
  if (entityType && entityType !== 'all') params.entity_type = entityType;
  return api.get('/admin/audit-log', { params });
};

// ============================================================================
// USER SESSION AUTH (cross-tab via localStorage)
// ============================================================================
// 
// CROSS-TAB SUPPORT (Updated January 2025):
// - Changed from sessionStorage to localStorage for cross-tab session sharing
// - Login in one tab = logged in across all tabs
// - Logout/timeout in one tab = logged out across all tabs
// - Other tabs detect changes via storage event listener (see App.jsx)
//
// SESSION TIMEOUT:
// - Timeout is handled by useInactivityTimeout hook (react-idle-timer)
// - 10 min inactivity = redirect to incidents page
// - 15 min inactivity = clear session (logout)
// - This file only stores/retrieves session data, no timeout logic here
//
// Previous implementation had duplicate timeout logic here that conflicted
// with the idle timer, causing premature logouts.

const SESSION_KEY = 'userSession';

export const getUserSession = () => {
  const data = localStorage.getItem(SESSION_KEY);
  if (!data) return null;
  
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

export const setUserSession = (authResult) => {
  const session = {
    ...authResult,
    loginTime: Date.now(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const clearUserSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

// Key exported for storage event listeners in other components
export const USER_SESSION_KEY = SESSION_KEY;

// ============================================================================
// TENANT AUTH (Department-level login)
// ============================================================================

export const tenantLogin = (slug, password) => 
  api.post('/tenant/login', { slug, password }, { withCredentials: true });

export const tenantLogout = () => 
  api.post('/tenant/logout', {}, { withCredentials: true });

export const checkTenantSession = () => 
  api.get('/tenant/session', { withCredentials: true });

export const submitTenantSignupRequest = (data) => 
  api.post('/tenant/signup-request', data);

// ============================================================================
// MASTER ADMIN (System administration)
// ============================================================================

export const masterAdminLogin = (email, password) =>
  api.post('/master/login', { email, password }, { withCredentials: true });

export const masterAdminLogout = () =>
  api.post('/master/logout', {}, { withCredentials: true });

export const masterAdminGetMe = () =>
  api.get('/master/me', { withCredentials: true });

export const masterAdminGetTenants = (status = null) =>
  api.get('/master/tenants', { params: status ? { status } : {}, withCredentials: true });

export const masterAdminGetTenant = (tenantId) =>
  api.get(`/master/tenants/${tenantId}`, { withCredentials: true });

export const masterAdminApproveTenant = (tenantId, data) =>
  api.post(`/master/tenants/${tenantId}/approve`, data, { withCredentials: true });

export const masterAdminSuspendTenant = (tenantId, reason) =>
  api.post(`/master/tenants/${tenantId}/suspend`, { reason }, { withCredentials: true });

export const masterAdminReactivateTenant = (tenantId) =>
  api.post(`/master/tenants/${tenantId}/reactivate`, {}, { withCredentials: true });

export const masterAdminRejectTenant = (tenantId) =>
  api.post(`/master/tenants/${tenantId}/reject`, {}, { withCredentials: true });

export const masterAdminGetStats = () =>
  api.get('/master/system/stats', { withCredentials: true });

export const masterAdminGetAuditLog = (limit = 50) =>
  api.get('/master/audit-log', { params: { limit }, withCredentials: true });

export const masterAdminGetAdmins = () =>
  api.get('/master/admins', { withCredentials: true });

export const masterAdminCreateAdmin = (data) =>
  api.post('/master/admins', data, { withCredentials: true });

export default api;
