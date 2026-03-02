import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { formatTimeLocal } from '../utils/timeUtils';
import { useBranding } from '../contexts/BrandingContext';

/**
 * NERIS Incident View Page
 * 
 * Standalone page at /neris/:id that shows:
 * - Incident summary header
 * - NERIS payload mapped into readable sections
 * - Validation errors/warnings
 * - Submit to sandbox controls
 * - API response details
 */
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
  const [activeSection, setActiveSection] = useState('overview'); // overview | payload | response
  const [expandedSections, setExpandedSections] = useState({});

  // Load incident
  useEffect(() => {
    if (!incidentId) return;
    setLoading(true);
    api.get(`/incidents/${incidentId}`)
      .then(res => setIncident(res.data))
      .catch(err => setError(err.response?.data?.detail || 'Failed to load incident'))
      .finally(() => setLoading(false));
  }, [incidentId]);

  // Auto-preview on load
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
      // Refresh incident to get neris_submission_id
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
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading incident...</div>
    );
  }

  if (!incident) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Incident not found</div>
    );
  }

  const errorCount = preview?.errors?.length || 0;
  const warningCount = preview?.warnings?.length || 0;
  const isSubmitted = incident.neris_submission_id || submitResult?.success;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1rem' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: '1rem',
        paddingBottom: '0.75rem',
        borderBottom: '2px solid #e5e7eb'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => navigate('/')}
              style={{ 
                background: 'none', border: 'none', cursor: 'pointer', 
                fontSize: '1.1rem', color: '#6b7280', padding: '2px 6px' 
              }}
              title="Back to incidents"
            >
              ← 
            </button>
            <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#111' }}>
              NERIS Review
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
          <button
            onClick={fetchPreview}
            disabled={previewLoading}
            style={btnStyle('#f3f4f6', '#374151', '#d1d5db')}
          >
            {previewLoading ? 'Building...' : '↻ Refresh'}
          </button>
          {preview && !isSubmitted && (
            <button
              onClick={handleSubmit}
              disabled={!preview.valid || submitLoading}
              style={btnStyle(
                preview.valid ? '#2563eb' : '#9ca3af',
                '#fff',
                preview.valid ? '#1d4ed8' : '#9ca3af'
              )}
              title={!preview.valid ? 'Fix validation errors first' : 'Submit to NERIS test sandbox'}
            >
              {submitLoading ? 'Submitting...' : 'Submit to Sandbox'}
            </button>
          )}
          {isSubmitted && (
            <button
              onClick={handleResubmit}
              disabled={submitLoading}
              style={btnStyle('#d97706', '#fff', '#b45309')}
            >
              {submitLoading ? 'Resubmitting...' : 'Resubmit Update'}
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ 
          padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px',
          background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.85rem'
        }}>
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e5e7eb', marginBottom: '1rem' }}>
        <TabBtn active={activeSection === 'overview'} onClick={() => setActiveSection('overview')}>
          Overview
          {errorCount > 0 && <Badge color="#ef4444">{errorCount}</Badge>}
          {errorCount === 0 && warningCount > 0 && <Badge color="#f59e0b">{warningCount}</Badge>}
          {preview?.valid && errorCount === 0 && warningCount === 0 && <Badge color="#10b981">✓</Badge>}
        </TabBtn>
        <TabBtn active={activeSection === 'payload'} onClick={() => setActiveSection('payload')}>
          JSON Payload
        </TabBtn>
        {submitResult && (
          <TabBtn active={activeSection === 'response'} onClick={() => setActiveSection('response')}>
            API Response
            {submitResult.success ? <Badge color="#10b981">✓</Badge> : <Badge color="#ef4444">✗</Badge>}
          </TabBtn>
        )}
      </div>

      {/* Content */}
      {activeSection === 'overview' && preview && (
        <OverviewTab 
          preview={preview} 
          incident={incident}
          expandedSections={expandedSections}
          toggleSection={toggleSection}
        />
      )}
      {activeSection === 'payload' && preview && (
        <PayloadTab payload={preview.payload} />
      )}
      {activeSection === 'response' && submitResult && (
        <ResponseTab result={submitResult} />
      )}

      {!preview && !previewLoading && !error && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
          Loading NERIS preview...
        </div>
      )}
    </div>
  );
}


// ============================================================================
// OVERVIEW TAB — human-readable view of payload + validation
// ============================================================================

function OverviewTab({ preview, incident, expandedSections, toggleSection }) {
  const { payload, errors, warnings, valid } = preview;

  return (
    <div>
      {/* Validation summary */}
      <div style={{
        padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px',
        background: valid ? '#f0fdf4' : '#fef2f2',
        border: `1px solid ${valid ? '#bbf7d0' : '#fecaca'}`,
      }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: valid ? '#166534' : '#991b1b', marginBottom: errors.length || warnings.length ? '0.5rem' : 0 }}>
          {valid ? '✓ Payload is valid — ready to submit' : `✗ ${errors.length} validation error${errors.length !== 1 ? 's' : ''}`}
          {warnings.length > 0 && ` · ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`}
        </div>
        {errors.map((e, i) => (
          <div key={`e${i}`} style={{ fontSize: '0.8rem', color: '#991b1b', padding: '2px 0', paddingLeft: '1rem' }}>
            ✗ <code style={{ background: '#fee2e2', padding: '1px 4px', borderRadius: '3px', fontSize: '0.75rem' }}>{e.field}</code> — {e.message}
          </div>
        ))}
        {warnings.map((w, i) => (
          <div key={`w${i}`} style={{ fontSize: '0.8rem', color: '#92400e', padding: '2px 0', paddingLeft: '1rem' }}>
            ⚠ <code style={{ background: '#fef3c7', padding: '1px 4px', borderRadius: '3px', fontSize: '0.75rem' }}>{w.field}</code> — {w.message}
          </div>
        ))}
      </div>

      {/* Base section */}
      <PayloadSection 
        title="Base" 
        expanded={expandedSections['base'] !== false}
        onToggle={() => toggleSection('base')}
      >
        <FieldGrid>
          <Field label="Department NERIS ID" value={payload.base?.department_neris_id} />
          <Field label="Incident Number" value={payload.base?.incident_number} />
          <Field label="People Present" value={formatBool(payload.base?.people_present)} />
          <Field label="Displaced" value={payload.base?.displacement_count} />
          <Field label="Animals Rescued" value={payload.base?.animals_rescued} />
        </FieldGrid>
        {payload.base?.outcome_narrative && (
          <FieldBlock label="Outcome Narrative" value={payload.base.outcome_narrative} />
        )}
        {payload.base?.impediment_narrative && (
          <FieldBlock label="Impediment Narrative" value={payload.base.impediment_narrative} />
        )}
      </PayloadSection>

      {/* Location */}
      <PayloadSection 
        title="Location" 
        expanded={expandedSections['location'] !== false}
        onToggle={() => toggleSection('location')}
      >
        <FieldGrid>
          {payload.base?.location && Object.entries(payload.base.location).map(([k, v]) => (
            typeof v !== 'object' && <Field key={k} label={formatLabel(k)} value={v} />
          ))}
        </FieldGrid>
        {payload.base?.point && (
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' }}>
            📍 [{payload.base.point.geometry?.coordinates?.[1]}, {payload.base.point.geometry?.coordinates?.[0]}]
          </div>
        )}
      </PayloadSection>

      {/* Location Use */}
      {payload.base?.location_use && (
        <PayloadSection 
          title="Location Use" 
          expanded={expandedSections['location_use'] !== false}
          onToggle={() => toggleSection('location_use')}
        >
          <FieldGrid>
            {Object.entries(payload.base.location_use).map(([k, v]) => (
              <Field key={k} label={formatLabel(k)} value={typeof v === 'object' ? JSON.stringify(v) : v} />
            ))}
          </FieldGrid>
        </PayloadSection>
      )}

      {/* Incident Types */}
      <PayloadSection 
        title="Incident Types" 
        expanded={expandedSections['types'] !== false}
        onToggle={() => toggleSection('types')}
        badge={payload.incident_types?.length || 0}
      >
        {(payload.incident_types || []).map((t, i) => (
          <div key={i} style={{ 
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.25rem 0.65rem', margin: '0.2rem', borderRadius: '999px',
            background: t.primary ? '#dbeafe' : '#f3f4f6',
            border: `1px solid ${t.primary ? '#93c5fd' : '#d1d5db'}`,
            fontSize: '0.8rem', color: '#1f2937'
          }}>
            {t.primary && <span style={{ color: '#2563eb', fontWeight: 700 }}>★</span>}
            {formatNerisCode(t.type)}
          </div>
        ))}
      </PayloadSection>

      {/* Dispatch */}
      <PayloadSection 
        title="Dispatch" 
        expanded={expandedSections['dispatch'] !== false}
        onToggle={() => toggleSection('dispatch')}
      >
        <FieldGrid>
          <Field label="CAD Event #" value={payload.dispatch?.incident_number} />
          <Field label="Call Arrival" value={formatTs(payload.dispatch?.call_arrival)} />
          <Field label="Call Answered" value={formatTs(payload.dispatch?.call_answered)} />
          <Field label="Call Create" value={formatTs(payload.dispatch?.call_create)} />
          <Field label="Incident Clear" value={formatTs(payload.dispatch?.incident_clear)} />
        </FieldGrid>

        {/* Unit Responses */}
        {payload.dispatch?.unit_responses?.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
              Unit Responses ({payload.dispatch.unit_responses.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={thStyle}>Unit</th>
                  <th style={thStyle}>Staffing</th>
                  <th style={thStyle}>Dispatch</th>
                  <th style={thStyle}>Enroute</th>
                  <th style={thStyle}>On Scene</th>
                  <th style={thStyle}>Clear</th>
                </tr>
              </thead>
              <tbody>
                {payload.dispatch.unit_responses.map((u, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>{u.unit_neris_id || u.reported_unit_id || '—'}</td>
                    <td style={tdStyle}>{u.staffing ?? '—'}</td>
                    <td style={tdStyle}>{formatTs(u.dispatch)}</td>
                    <td style={tdStyle}>{formatTs(u.enroute_to_scene)}</td>
                    <td style={tdStyle}>{formatTs(u.on_scene)}</td>
                    <td style={tdStyle}>{formatTs(u.unit_clear)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PayloadSection>

      {/* Tactic Timestamps */}
      {payload.tactic_timestamps && (
        <PayloadSection 
          title="Tactic Timestamps" 
          expanded={expandedSections['tactics'] !== false}
          onToggle={() => toggleSection('tactics')}
        >
          <FieldGrid>
            {Object.entries(payload.tactic_timestamps).map(([k, v]) => (
              <Field key={k} label={formatLabel(k)} value={formatTs(v)} />
            ))}
          </FieldGrid>
        </PayloadSection>
      )}

      {/* Actions/Tactics */}
      {payload.actions_tactics && (
        <PayloadSection 
          title="Actions Taken" 
          expanded={expandedSections['actions'] !== false}
          onToggle={() => toggleSection('actions')}
        >
          {payload.actions_tactics.action_noaction?.type === 'ACTION' && (
            <div>
              {(payload.actions_tactics.action_noaction.actions || []).map((a, i) => (
                <span key={i} style={{ 
                  display: 'inline-block', padding: '0.2rem 0.5rem', margin: '0.15rem',
                  background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px',
                  fontSize: '0.8rem', color: '#374151'
                }}>
                  {formatNerisCode(a)}
                </span>
              ))}
            </div>
          )}
          {payload.actions_tactics.action_noaction?.type === 'NOACTION' && (
            <Field label="No Action Reason" value={formatNerisCode(payload.actions_tactics.action_noaction.noaction_type)} />
          )}
        </PayloadSection>
      )}

      {/* Aids */}
      {payload.aids && (
        <PayloadSection 
          title="Mutual Aid" 
          expanded={expandedSections['aids'] !== false}
          onToggle={() => toggleSection('aids')}
          badge={payload.aids.length}
        >
          {payload.aids.map((a, i) => (
            <FieldGrid key={i}>
              <Field label="Department" value={a.department_neris_id} />
              <Field label="Type" value={formatNerisCode(a.aid_type)} />
              <Field label="Direction" value={a.aid_direction} />
            </FieldGrid>
          ))}
        </PayloadSection>
      )}

      {/* Fire Detail */}
      {payload.fire_detail && (
        <PayloadSection 
          title="Fire Detail" 
          expanded={expandedSections['fire'] !== false}
          onToggle={() => toggleSection('fire')}
          color="#dc2626"
        >
          <FieldGrid>
            <Field label="Investigation Needed" value={payload.fire_detail.investigation_needed} />
            <Field label="Water Supply" value={formatNerisCode(payload.fire_detail.water_supply)} />
          </FieldGrid>
          {payload.fire_detail.location_detail && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#fef2f2', borderRadius: '4px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.35rem' }}>
                {payload.fire_detail.location_detail.type}
              </div>
              <FieldGrid>
                {Object.entries(payload.fire_detail.location_detail).filter(([k]) => k !== 'type').map(([k, v]) => (
                  <Field key={k} label={formatLabel(k)} value={formatNerisCode(String(v))} />
                ))}
              </FieldGrid>
            </div>
          )}
        </PayloadSection>
      )}

      {/* Alarm modules */}
      {(payload.smoke_alarm || payload.fire_alarm || payload.other_alarm || payload.fire_suppression) && (
        <PayloadSection 
          title="Alarms & Suppression" 
          expanded={expandedSections['alarms'] !== false}
          onToggle={() => toggleSection('alarms')}
        >
          <FieldGrid>
            <Field label="Smoke Alarm" value={payload.smoke_alarm?.presence?.type || '—'} />
            <Field label="Fire Alarm" value={payload.fire_alarm?.presence?.type || '—'} />
            <Field label="Other Alarm" value={payload.other_alarm?.presence?.type || '—'} />
            <Field label="Suppression" value={payload.fire_suppression?.presence?.type || '—'} />
          </FieldGrid>
        </PayloadSection>
      )}

      {/* Medical */}
      {payload.medical_details && (
        <PayloadSection 
          title="Medical" 
          expanded={expandedSections['medical'] !== false}
          onToggle={() => toggleSection('medical')}
          color="#059669"
        >
          {payload.medical_details.map((m, i) => (
            <FieldGrid key={i}>
              <Field label="Patient Care" value={formatNerisCode(m.patient_care_evaluation)} />
              <Field label="Patient Status" value={formatNerisCode(m.patient_status)} />
              <Field label="Transport" value={formatNerisCode(m.transport_disposition)} />
            </FieldGrid>
          ))}
        </PayloadSection>
      )}

      {/* Hazmat */}
      {payload.hazsit_detail && (
        <PayloadSection 
          title="Hazmat" 
          expanded={expandedSections['hazmat'] !== false}
          onToggle={() => toggleSection('hazmat')}
          color="#d97706"
        >
          <FieldGrid>
            <Field label="Disposition" value={formatNerisCode(payload.hazsit_detail.disposition)} />
            <Field label="Evacuated" value={payload.hazsit_detail.evacuated} />
          </FieldGrid>
          {payload.hazsit_detail.chemicals?.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>Chemicals</div>
              {payload.hazsit_detail.chemicals.map((c, i) => (
                <div key={i} style={{ fontSize: '0.8rem', color: '#374151', padding: '2px 0' }}>
                  {c.name || '(unnamed)'} — DOT: {c.dot_class || '—'} — Released: {c.release_occurred ? 'Yes' : 'No'}
                </div>
              ))}
            </div>
          )}
        </PayloadSection>
      )}

      {/* Casualty/Rescues */}
      {payload.casualty_rescues && (
        <PayloadSection 
          title="Casualty & Rescues" 
          expanded={expandedSections['casualties'] !== false}
          onToggle={() => toggleSection('casualties')}
          badge={payload.casualty_rescues.length}
        >
          {payload.casualty_rescues.map((cr, i) => (
            <div key={i} style={{ padding: '0.35rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.8rem' }}>
              <span style={{ fontWeight: 600 }}>{cr.type}</span>
              {cr.gender && ` — ${cr.gender}`}
              {cr.rank && ` — ${cr.rank}`}
            </div>
          ))}
        </PayloadSection>
      )}

      {/* Emerging Hazards */}
      {(payload.electric_hazards || payload.powergen_hazards || payload.csst_hazard) && (
        <PayloadSection 
          title="Emerging Hazards" 
          expanded={expandedSections['emerging'] !== false}
          onToggle={() => toggleSection('emerging')}
        >
          {payload.electric_hazards && <Field label="Electric/EV" value="Present" />}
          {payload.powergen_hazards && <Field label="Solar PV" value="Present" />}
          {payload.csst_hazard && <Field label="CSST" value="Present" />}
        </PayloadSection>
      )}

      {/* Dispatch Comments */}
      {payload.dispatch?.comments?.length > 0 && (
        <PayloadSection 
          title="CAD Comments" 
          expanded={expandedSections['comments'] !== false}
          onToggle={() => toggleSection('comments')}
          badge={payload.dispatch.comments.length}
        >
          {payload.dispatch.comments.map((c, i) => (
            <div key={i} style={{ padding: '0.25rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.8rem' }}>
              <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{formatTs(c.timestamp)}</span>
              <span style={{ marginLeft: '0.5rem', color: '#1f2937' }}>{c.comment}</span>
            </div>
          ))}
        </PayloadSection>
      )}
    </div>
  );
}


// ============================================================================
// PAYLOAD TAB — raw JSON
// ============================================================================

function PayloadTab({ payload }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(payload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
        <button onClick={handleCopy} style={btnStyle('#f3f4f6', '#374151', '#d1d5db')}>
          {copied ? '✓ Copied' : 'Copy JSON'}
        </button>
      </div>
      <pre style={{
        background: '#1f2937', color: '#e5e7eb', padding: '1rem', borderRadius: '6px',
        fontSize: '0.75rem', lineHeight: '1.5', overflow: 'auto', maxHeight: '70vh',
        fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace'
      }}>
        {json}
      </pre>
    </div>
  );
}


// ============================================================================
// RESPONSE TAB — API response from NERIS
// ============================================================================

function ResponseTab({ result }) {
  return (
    <div>
      <div style={{
        padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px',
        background: result.success ? '#f0fdf4' : '#fef2f2',
        border: `1px solid ${result.success ? '#bbf7d0' : '#fecaca'}`,
      }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: result.success ? '#166534' : '#991b1b' }}>
          {result.success ? '✓ Successfully submitted to NERIS sandbox' : '✗ Submission failed'}
        </div>
        {result.neris_id && (
          <div style={{ fontSize: '0.85rem', color: '#166534', marginTop: '0.25rem' }}>
            NERIS ID: <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: '3px' }}>{result.neris_id}</code>
          </div>
        )}
        {result.api_error && (
          <div style={{ fontSize: '0.85rem', color: '#991b1b', marginTop: '0.25rem' }}>
            Error: {result.api_error}
          </div>
        )}
        {result.message && (
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
            {result.message}
          </div>
        )}
      </div>

      {/* Validation errors from submit response */}
      {result.errors?.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.35rem' }}>Validation Errors</div>
          {result.errors.map((e, i) => (
            <div key={i} style={{ fontSize: '0.8rem', color: '#991b1b', padding: '2px 0' }}>
              ✗ <code>{e.field}</code> — {e.message}
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {result.warnings?.length > 0 && (
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: '0.35rem' }}>Warnings</div>
          {result.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: '0.8rem', color: '#92400e', padding: '2px 0' }}>
              ⚠ <code>{w.field}</code> — {w.message}
            </div>
          ))}
        </div>
      )}

      {/* Full response body */}
      {result.body && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Raw API Response</div>
          <pre style={{
            background: '#1f2937', color: '#e5e7eb', padding: '0.75rem', borderRadius: '6px',
            fontSize: '0.75rem', overflow: 'auto', maxHeight: '300px',
            fontFamily: 'ui-monospace, monospace'
          }}>
            {JSON.stringify(result.body, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}


// ============================================================================
// SHARED COMPONENTS
// ============================================================================

function PayloadSection({ title, children, expanded = true, onToggle, badge, color }) {
  return (
    <div style={{
      marginBottom: '0.5rem',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      overflow: 'hidden',
      borderLeft: color ? `3px solid ${color}` : undefined,
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.5rem 0.75rem', background: expanded ? '#f9fafb' : '#fff',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: color || '#374151' }}>
          {title}
          {badge !== undefined && (
            <span style={{ 
              marginLeft: '0.5rem', fontSize: '0.7rem', fontWeight: 700,
              background: '#e5e7eb', padding: '1px 6px', borderRadius: '999px', color: '#6b7280'
            }}>{badge}</span>
          )}
        </span>
        <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0.5rem 0.75rem', background: '#fff' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function FieldGrid({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.35rem 1rem' }}>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div style={{ fontSize: '0.8rem' }}>
      <span style={{ color: '#6b7280' }}>{label}: </span>
      <span style={{ color: '#1f2937', fontWeight: 500 }}>{String(value)}</span>
    </div>
  );
}

function FieldBlock({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
      <span style={{ color: '#6b7280', display: 'block', marginBottom: '0.15rem' }}>{label}:</span>
      <div style={{ color: '#1f2937', background: '#f9fafb', padding: '0.5rem', borderRadius: '4px', lineHeight: '1.4' }}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ children, color, bg, border }) {
  return (
    <span style={{
      fontSize: '0.75rem', fontWeight: 600, color,
      background: bg, border: `1px solid ${border}`,
      padding: '0.25rem 0.6rem', borderRadius: '999px',
    }}>
      {children}
    </span>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: active ? 600 : 400,
        color: active ? '#2563eb' : '#6b7280',
        borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '0.35rem',
      }}
    >
      {children}
    </button>
  );
}

function Badge({ color, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: '18px', height: '18px', padding: '0 4px',
      borderRadius: '999px', background: color, color: '#fff',
      fontSize: '0.65rem', fontWeight: 700,
    }}>
      {children}
    </span>
  );
}


// ============================================================================
// UTILITIES
// ============================================================================

function btnStyle(bg, color, border) {
  return {
    padding: '0.4rem 0.85rem', fontSize: '0.8rem', fontWeight: 500,
    background: bg, color, border: `1px solid ${border}`, borderRadius: '5px',
    cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

const thStyle = { textAlign: 'left', padding: '0.35rem 0.5rem', color: '#6b7280', fontWeight: 600, fontSize: '0.75rem' };
const tdStyle = { padding: '0.35rem 0.5rem', color: '#1f2937' };

function formatTs(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return val;
  }
}

function formatBool(val) {
  if (val === true) return 'Yes';
  if (val === false) return 'No';
  return '—';
}

function formatLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatNerisCode(val) {
  if (!val) return '—';
  // "FIRE||STRUCTURE_FIRE" → "Structure Fire"
  const parts = val.split('||');
  const last = parts[parts.length - 1];
  return last.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
