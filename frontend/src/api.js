import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// INCIDENTS
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
export const suggestIncidentNumber = () => api.get('/incidents/suggest-number');

// PERSONNEL
export const getPersonnel = () => api.get('/personnel');
export const createPersonnel = (data) => api.post('/personnel', data);
export const updatePersonnel = (id, data) => api.put(`/personnel/${id}`, data);
export const deletePersonnel = (id) => api.delete(`/personnel/${id}`);
export const getRanks = () => api.get('/personnel/ranks');

// APPARATUS
export const getApparatus = () => api.get('/apparatus');
export const createApparatus = (data) => api.post('/apparatus', data);
export const updateApparatus = (id, data) => api.put(`/apparatus/${id}`, data);
export const deleteApparatus = (id) => api.delete(`/apparatus/${id}`);

// MUNICIPALITIES
export const getMunicipalities = (includeInactive = false) => 
  api.get('/lookups/municipalities', { params: { include_inactive: includeInactive } });
export const createMunicipality = (data) => api.post('/lookups/municipalities', data);
export const updateMunicipality = (id, data) => api.put(`/lookups/municipalities/${id}`, data);
export const deleteMunicipality = (id) => api.delete(`/lookups/municipalities/${id}`);

// NERIS LOOKUPS
export const getIncidentTypesByCategory = () => api.get('/lookups/neris/incident-types/by-category');
export const getLocationUsesByCategory = () => api.get('/lookups/neris/location-uses/by-category');
export const getActionsTakenByCategory = () => api.get('/lookups/neris/actions-taken/by-category');

// SETTINGS
export const getSettings = () => api.get('/settings');
export const getSetting = (category, key) => api.get(`/settings/${category}/${key}`);
export const updateSetting = (category, key, value) => api.put(`/settings/${category}/${key}`, { value });

export default api;
