import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../../api';
import {
  getIncidentTypesByCategory,
  getLocationUsesByCategory,
  getActionsTakenByCategory,
  getAllNerisDropdowns,
  updateIncident,
  getUserSession,
} from '../../api';

const NerisContext = createContext(null);

export function NerisProvider({ incidentId, children }) {
  const [incident, setIncident] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Hierarchical code data (for modal pickers)
  const [incidentTypes, setIncidentTypes] = useState({});
  const [locationUses, setLocationUses] = useState({});
  const [actionsTaken, setActionsTaken] = useState({});

  // Flat dropdown codes (for selects)
  const [dropdowns, setDropdowns] = useState({});

  const userSession = getUserSession();

  // Load incident + all reference data
  useEffect(() => {
    if (!incidentId) return;
    setLoading(true);

    Promise.all([
      api.get(`/incidents/${incidentId}`),
      getIncidentTypesByCategory(),
      getLocationUsesByCategory(),
      getActionsTakenByCategory(),
      getAllNerisDropdowns(),
    ])
      .then(([incRes, typesRes, locUsesRes, actionsRes, dropdownsRes]) => {
        setIncident(incRes.data);
        setIncidentTypes(typesRes.data);
        setLocationUses(locUsesRes.data);
        setActionsTaken(actionsRes.data);
        setDropdowns(dropdownsRes.data.categories || {});
      })
      .catch(err => setError(err.response?.data?.detail || 'Failed to load incident'))
      .finally(() => setLoading(false));
  }, [incidentId]);

  // Auto-preview after incident loads
  useEffect(() => {
    if (incident) fetchPreview();
  }, [incident?.id]);

  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true);
    setError(null);
    try {
      const res = await api.get(`/neris/preview/${incidentId}`);
      setPreview(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to build preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [incidentId]);

  // Save fields to incident, re-fetch incident, refresh preview
  const saveFields = useCallback(async (fields) => {
    setSaving(true);
    setError(null);
    try {
      const editedBy = userSession?.personnel_id || null;
      await updateIncident(incidentId, fields, editedBy);
      // Re-fetch incident to get server state
      const res = await api.get(`/incidents/${incidentId}`);
      setIncident(res.data);
      // Refresh preview with new data
      const prevRes = await api.get(`/neris/preview/${incidentId}`);
      setPreview(prevRes.data);
      return true;
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save');
      return false;
    } finally {
      setSaving(false);
    }
  }, [incidentId, userSession?.personnel_id]);

  const handleSubmit = useCallback(async () => {
    setSubmitLoading(true);
    setError(null);
    try {
      const res = await api.post(`/neris/submit/${incidentId}`);
      setSubmitResult(res.data);
      const inc = await api.get(`/incidents/${incidentId}`);
      setIncident(inc.data);
      return 'response';
    } catch (err) {
      setError(err.response?.data?.detail || 'Submission failed');
      return null;
    } finally {
      setSubmitLoading(false);
    }
  }, [incidentId]);

  const handleResubmit = useCallback(async () => {
    setSubmitLoading(true);
    setError(null);
    try {
      const res = await api.post(`/neris/resubmit/${incidentId}`);
      setSubmitResult(res.data);
      return 'response';
    } catch (err) {
      setError(err.response?.data?.detail || 'Resubmission failed');
      return null;
    } finally {
      setSubmitLoading(false);
    }
  }, [incidentId]);

  const value = {
    incidentId,
    incident,
    preview,
    submitResult,
    loading,
    previewLoading,
    submitLoading,
    saving,
    error,
    setError,

    // Reference data
    incidentTypes,
    locationUses,
    actionsTaken,
    dropdowns,

    // Actions
    fetchPreview,
    saveFields,
    handleSubmit,
    handleResubmit,
  };

  return (
    <NerisContext.Provider value={value}>
      {children}
    </NerisContext.Provider>
  );
}

export function useNeris() {
  const context = useContext(NerisContext);
  if (!context) {
    throw new Error('useNeris must be used within NerisProvider');
  }
  return context;
}
