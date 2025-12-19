import axios from 'axios';

// Use relative path - configure proxy in vite.config.js or nginx
const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
});

// ============================================================================
// INCIDENTS
// ============================================================================

export const getIncidents = (year, status) => {
  const params = {};
  if (year) params.year = year;
  if (status) params.status = status;
  return api.get('/incidents', { params });
};

export const getIncident = (id) => api.get(`/incidents/${id}`);

export const createIncident = (data) => api.post('/incidents', data);

export const updateIncident = (id, data) => api.put(`/incidents/${id}`, data);

export const closeIncident = (id) => api.post(`/incidents/${id}/close`);

export const completeIncident = (id) => api.post(`/incidents/${id}/complete`);

export const suggestIncidentNumber = () => api.get('/incidents/suggest-number');

// ============================================================================
// PERSONNEL
// ============================================================================

export const getPersonnel = () => api.get('/personnel');

export const getPersonnelByRank = () => api.get('/personnel/by-rank');

export const createPersonnel = (data) => api.post('/personnel', data);

export const updatePersonnel = (id, data) => api.put(`/personnel/${id}`, data);

export const deletePersonnel = (id) => api.delete(`/personnel/${id}`);

export const getRanks = () => api.get('/personnel/ranks');

// ============================================================================
// APPARATUS
// ============================================================================

export const getApparatus = () => api.get('/apparatus');

export const createApparatus = (data) => api.post('/apparatus', data);

export const updateApparatus = (id, data) => api.put(`/apparatus/${id}`, data);

export const deleteApparatus = (id) => api.delete(`/apparatus/${id}`);

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

// ============================================================================
// SETTINGS
// ============================================================================

export const getSettings = () => api.get('/settings');

export const getSetting = (category, key) => api.get(`/settings/${category}/${key}`);

export const updateSetting = (category, key, value) => 
  api.put(`/settings/${category}/${key}`, { value });

// ============================================================================
// ADMIN (Password-protected section)
// ============================================================================

const ADMIN_AUTH_KEY = 'runsheet_admin_auth';

export const isAdminAuthenticated = () => {
  const auth = sessionStorage.getItem(ADMIN_AUTH_KEY);
  return auth === 'true';
};

export const setAdminAuthenticated = (value) => {
  if (value) {
    sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
  } else {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
  }
};

export const verifyAdminPassword = (password) => 
  api.post('/admin/verify', { password });

export const changeAdminPassword = (currentPassword, newPassword) =>
  api.post('/admin/change-password', { 
    current_password: currentPassword, 
    new_password: newPassword 
  });

export const getAuditLog = (limit = 100, entityType = null, entityId = null) => {
  const params = { limit };
  if (entityType) params.entity_type = entityType;
  if (entityId) params.entity_id = entityId;
  return api.get('/admin/audit-log', { params });
};

export default api;
