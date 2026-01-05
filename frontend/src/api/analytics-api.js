/**
 * Analytics API Client for CADReport
 * Add these functions to your existing api.js or create a new analytics-api.js
 */

import api from '../api';  // Your existing axios instance

// ============================================================================
// QUERY USAGE / RATE LIMITING
// ============================================================================

export const getQueryUsage = async () => {
  const response = await api.get('/analytics/usage');
  return response.data;
};

// ============================================================================
// NATURAL LANGUAGE QUERIES
// ============================================================================

export const executeNaturalLanguageQuery = async (question, options = {}) => {
  const response = await api.post('/analytics/query', {
    question,
    start_date: options.startDate,
    end_date: options.endDate,
    save_query: options.saveQuery || false,
    query_name: options.queryName
  });
  return response.data;
};

// ============================================================================
// SAVED QUERIES
// ============================================================================

export const getSavedQueries = async (includeSystem = true) => {
  const response = await api.get('/analytics/queries/saved', {
    params: { include_system: includeSystem }
  });
  return response.data;
};

export const executeSavedQuery = async (queryId, options = {}) => {
  const response = await api.post('/analytics/queries/saved/execute', {
    query_id: queryId,
    start_date: options.startDate,
    end_date: options.endDate,
    parameters: options.parameters
  });
  return response.data;
};

export const createSavedQuery = async (query) => {
  const response = await api.post('/analytics/queries/saved', query);
  return response.data;
};

export const deleteSavedQuery = async (queryId) => {
  const response = await api.delete(`/analytics/queries/saved/${queryId}`);
  return response.data;
};

// ============================================================================
// DASHBOARD
// ============================================================================

export const getDashboardStats = async (startDate, endDate, compareStartDate = null, compareEndDate = null, category = null) => {
  const params = {
    start_date: startDate,
    end_date: endDate
  };
  if (compareStartDate) params.compare_start_date = compareStartDate;
  if (compareEndDate) params.compare_end_date = compareEndDate;
  if (category) params.category = category;
  
  const response = await api.get('/analytics/dashboard/stats', { params });
  return response.data;
};

// ============================================================================
// PREDICTIONS
// ============================================================================

export const getPredictions = async () => {
  const response = await api.get('/analytics/predictions');
  return response.data;
};

// ============================================================================
// DATA QUALITY
// ============================================================================

export const scanForOutliers = async (options = {}) => {
  const response = await api.post('/analytics/data-quality/scan', {
    start_date: options.startDate,
    end_date: options.endDate,
    include_resolved: options.includeResolved || false
  });
  return response.data;
};

export const getDataQualityIssues = async (includeResolved = false, limit = 50) => {
  const response = await api.get('/analytics/data-quality/issues', {
    params: { include_resolved: includeResolved, limit }
  });
  return response.data;
};

export const resolveDataQualityIssue = async (issueId, notes = null) => {
  const response = await api.post(`/analytics/data-quality/issues/${issueId}/resolve`, {
    resolution_notes: notes
  });
  return response.data;
};

// ============================================================================
// CHART DATA (direct endpoints with category filtering)
// ============================================================================

export const getIncidentsByDay = async (startDate, endDate, category = null) => {
  const params = { start_date: startDate, end_date: endDate };
  if (category) params.category = category;
  const response = await api.get('/analytics/charts/incidents-by-day', { params });
  return response.data;
};

export const getIncidentsByHour = async (startDate, endDate, category = null) => {
  const params = { start_date: startDate, end_date: endDate };
  if (category) params.category = category;
  const response = await api.get('/analytics/charts/incidents-by-hour', { params });
  return response.data;
};

export const getIncidentsByType = async (startDate, endDate, category = null, limit = 10) => {
  const params = { start_date: startDate, end_date: endDate, limit };
  if (category) params.category = category;
  const response = await api.get('/analytics/charts/incidents-by-type', { params });
  return response.data;
};

export const getResponseTimesByHour = async (startDate, endDate, category = null) => {
  const params = { start_date: startDate, end_date: endDate };
  if (category) params.category = category;
  const response = await api.get('/analytics/charts/response-times-by-hour', { params });
  return response.data;
};

export default {
  getQueryUsage,
  executeNaturalLanguageQuery,
  getSavedQueries,
  executeSavedQuery,
  createSavedQuery,
  deleteSavedQuery,
  getDashboardStats,
  getPredictions,
  scanForOutliers,
  getDataQualityIssues,
  resolveDataQualityIssue,
  // Chart data with category filtering
  getIncidentsByDay,
  getIncidentsByHour,
  getIncidentsByType,
  getResponseTimesByHour
};
