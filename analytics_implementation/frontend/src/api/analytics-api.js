/**
 * Analytics API Client for CADReport
 * Add these functions to your existing api.js or create a new analytics-api.js
 */

import api from './api';  // Your existing axios instance

// ============================================================================
// QUERY USAGE / RATE LIMITING
// ============================================================================

export const getQueryUsage = async () => {
  const response = await api.get('/api/analytics/usage');
  return response.data;
};

// ============================================================================
// NATURAL LANGUAGE QUERIES
// ============================================================================

export const executeNaturalLanguageQuery = async (question, options = {}) => {
  const response = await api.post('/api/analytics/query', {
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
  const response = await api.get('/api/analytics/queries/saved', {
    params: { include_system: includeSystem }
  });
  return response.data;
};

export const executeSavedQuery = async (queryId, options = {}) => {
  const response = await api.post('/api/analytics/queries/saved/execute', {
    query_id: queryId,
    start_date: options.startDate,
    end_date: options.endDate,
    parameters: options.parameters
  });
  return response.data;
};

export const createSavedQuery = async (query) => {
  const response = await api.post('/api/analytics/queries/saved', query);
  return response.data;
};

export const deleteSavedQuery = async (queryId) => {
  const response = await api.delete(`/api/analytics/queries/saved/${queryId}`);
  return response.data;
};

// ============================================================================
// DASHBOARD
// ============================================================================

export const getDashboardStats = async (startDate, endDate, compareStartDate = null, compareEndDate = null) => {
  const params = {
    start_date: startDate,
    end_date: endDate
  };
  if (compareStartDate) params.compare_start_date = compareStartDate;
  if (compareEndDate) params.compare_end_date = compareEndDate;
  
  const response = await api.get('/api/analytics/dashboard/stats', { params });
  return response.data;
};

// ============================================================================
// PREDICTIONS
// ============================================================================

export const getPredictions = async () => {
  const response = await api.get('/api/analytics/predictions');
  return response.data;
};

// ============================================================================
// DATA QUALITY
// ============================================================================

export const scanForOutliers = async (options = {}) => {
  const response = await api.post('/api/analytics/data-quality/scan', {
    start_date: options.startDate,
    end_date: options.endDate,
    include_resolved: options.includeResolved || false
  });
  return response.data;
};

export const getDataQualityIssues = async (includeResolved = false, limit = 50) => {
  const response = await api.get('/api/analytics/data-quality/issues', {
    params: { include_resolved: includeResolved, limit }
  });
  return response.data;
};

export const resolveDataQualityIssue = async (issueId, notes = null) => {
  const response = await api.post(`/api/analytics/data-quality/issues/${issueId}/resolve`, {
    resolution_notes: notes
  });
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
  resolveDataQualityIssue
};
