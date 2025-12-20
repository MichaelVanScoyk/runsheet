import axios from 'axios';

// Use relative path - configure proxy in vite.config.js or nginx
const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
});

// ============================================================================
// INCIDENTS
// ============================================================================

export const getIncidents = (year, category, status) => {
  const params = {};
  if (year) params.year = year;
  if (category) params.category = category;
  if (status) params.status = status;
  return api.get('/incidents', { params });
};

export const getIncident = (id) => api.get(`/incidents/${id}`);

export const createIncident = (data) => api.post('/incidents', data);

export const updateIncident = (id, data) => api.put(`/incidents/${id}`, data);

export const closeIncident = (id) => api.post(`/incidents/${id}/close`);

export const completeIncident = (id) => api.post(`/incidents/${id}/complete`);

export const suggestIncidentNumber = (category = 'FIRE') => 
  api.get('/incidents/suggest-number', { params: { category } });

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

export const getAuditLog = (params) => api.get('/admin/audit-log', { params });

export default api;