import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import { useBranding } from '../../contexts/BrandingContext';
import { StatusBadge, TabBtn, Badge } from './shared/NerisComponents';
import { btnStyle } from './shared/nerisUtils';
import OverviewTab from './OverviewTab';
import PayloadTab from './shared/PayloadTab';
import ResponseTab from './shared/ResponseTab';

export default function NerisPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const branding = useBranding();
  const incidentId = parseInt(id);

  const [incident, setIncident] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');
  const [expandedSections, setExpandedSections] = useState({});

  useEffect(() => {
    if (!incidentId) return;
    setLoading(true);
    api.get(`/incidents/${incidentId}`)
      .then(res => setIncident(res.data))
      .catch(err => setError(err.response?.data?.detail || 'Failed to load incident'))
      .finally(() => setLoading(false));
  }, [incidentId]);

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

  const handleSubmit = useCallback(async () => {
    setSubmitLoading(true);
    setError(null);
    try {
      const res = await api.post(`/neris/submit/${incidentId}`);
      setSubmitResult(res.data);
      setActiveSection('response');
      const inc = await api.get(`/incidents/${incidentId}`);
      setIncident(inc.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Submission failed');
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
      setActiveSection('response');
    } catch (err) {
      setError(err.response?.data?.detail || 'Resubmission failed');
    } finally {
      setSubmitLoading(false);
    }
  }, [incidentId]);

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading incident...</div>;
  }
  if (!incident) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Incident not found</div>;
  }

  const errorCount = preview?.errors?.length || 0;
  const warningCount = preview?.warnings?.length || 0;
  const isSubmitted = incident.neris_submission_id || submitResult?.success;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '2px solid #e5e7eb'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => navigate('/')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#6b7280', padding: '2px 6px' }}
            >
              ← Incidents
            </button>
            <span style={{ color: '#d1d5db' }}>|</span>
            <button
              onClick={() => {
                navigate('/');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('open-incident', { detail: { id: incidentId } }));
                }, 100);
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#2563eb', padding: '2px 6px', fontWeight: 500 }}
            >
              ← Back to Run Sheet
            </button>
            <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#111' }}>
              NERIS Incident Review
            </h1>
          </div>
          <div style={{ marginTop: '0.25rem', marginLeft: '2.1rem', fontSize: '0.85rem', color: '#6b7280' }}>
            {incident.internal_incident_number || incident.cad_event_number || `#${incident.id}`}
            {' — '}
            {incident.address || 'No address'}
            {incident.cad_event_type && ` — ${incident.cad_event_type}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isSubmitted && (
            <StatusBadge color="#059669" bg="#ecfdf5" border="#a7f3d0">
              Submitted: {incident.neris_submission_id || submitResult?.neris_id}
            </StatusBadge>
          )}
          <button onClick={fetchPreview} disabled={previewLoading} style={btnStyle('#f3f4f6', '#374151', '#d1d5db')}>
            {previewLoading ? 'Building...' : '↻ Refresh'}
          </button>
          {preview && !isSubmitted && (
            <button
              onClick={handleSubmit}
              disabled={!preview.valid || submitLoading}
              style={btnStyle(preview.valid ? '#2563eb' : '#9ca3af', '#fff', preview.valid ? '#1d4ed8' : '#9ca3af')}
              title={!preview.valid ? 'Fix validation errors before submitting' : 'Submit incident to NERIS test sandbox'}
            >
              {submitLoading ? 'Submitting...' : 'Submit to NERIS Sandbox'}
            </button>
          )}
          {isSubmitted && (
            <button onClick={handleResubmit} disabled={submitLoading} style={btnStyle('#d97706', '#fff', '#b45309')}>
              {submitLoading ? 'Resubmitting...' : 'Resubmit Update to NERIS'}
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px',
          background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e5e7eb', marginBottom: '1rem' }}>
        <TabBtn active={activeSection === 'overview'} onClick={() => setActiveSection('overview')}>
          NERIS Overview
          {errorCount > 0 && <Badge color="#ef4444">{errorCount}</Badge>}
          {errorCount === 0 && warningCount > 0 && <Badge color="#f59e0b">{warningCount}</Badge>}
          {preview?.valid && errorCount === 0 && warningCount === 0 && <Badge color="#10b981">✓</Badge>}
        </TabBtn>
        <TabBtn active={activeSection === 'payload'} onClick={() => setActiveSection('payload')}>
          NERIS JSON Payload
        </TabBtn>
        {submitResult && (
          <TabBtn active={activeSection === 'response'} onClick={() => setActiveSection('response')}>
            NERIS API Response
            {submitResult.success ? <Badge color="#10b981">✓</Badge> : <Badge color="#ef4444">✗</Badge>}
          </TabBtn>
        )}
      </div>

      {/* Content */}
      {activeSection === 'overview' && preview && (
        <OverviewTab
          preview={preview}
          incident={incident}
          incidentId={incidentId}
          expandedSections={expandedSections}
          toggleSection={toggleSection}
          onRefresh={fetchPreview}
        />
      )}
      {activeSection === 'payload' && preview && <PayloadTab payload={preview.payload} />}
      {activeSection === 'response' && submitResult && <ResponseTab result={submitResult} />}

      {!preview && !previewLoading && !error && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>Loading NERIS preview...</div>
      )}
    </div>
  );
}
