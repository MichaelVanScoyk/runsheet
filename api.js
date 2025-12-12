import axios from 'axios';

const API_BASE = 'http://192.168.1.189:8001/api';

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

export const getPropertyUses = () => api.get('/lookups/neris/property-uses');

export const getPropertyUsesByCategory = () => api.get('/lookups/neris/property-uses/by-category');

export const getActionsTaken = () => api.get('/lookups/neris/actions-taken');

export const getActionsTakenByCategory = () => api.get('/lookups/neris/actions-taken/by-category');

// ============================================================================
// SETTINGS
// ============================================================================

export const getSetting = (key) => api.get(`/lookups/settings/${key}`);

export const updateSetting = (key, value) => api.put(`/lookups/settings/${key}`, null, { params: { value } });

export default api;
