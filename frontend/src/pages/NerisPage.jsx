import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { formatTimeLocal } from '../utils/timeUtils';
import { useBranding } from '../contexts/BrandingContext';

/**
 * NERIS Incident Review Page
 * 
 * Displays the assembled NERIS payload for an incident with:
 * - Explicit NERIS field names throughout
 * - Editable PSAP timestamps
 * - Navigation back to run sheet
 * - Validation errors/warnings
 * - Submit to sandbox controls
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
  const [activeSection, setActiveSection] = useState('overview');
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
      {/* Header with navigation */}
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
                // Navigate back to incidents list and open this incident's run sheet
                // The incidents page listens for this and opens the detail view
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


// ============================================================================
// OVERVIEW TAB
// ============================================================================

function OverviewTab({ preview, incident, incidentId, expandedSections, toggleSection, onRefresh }) {
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
          {valid ? '✓ NERIS payload is valid — ready to submit' : `✗ ${errors.length} validation error${errors.length !== 1 ? 's' : ''} — must fix before submitting`}
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

      {/* NERIS Base Incident Information */}
      <PayloadSection title="NERIS Base — Incident Information" expanded={expandedSections['base'] !== false} onToggle={() => toggleSection('base')}>
        <FieldGrid>
          <Field label="NERIS Department ID (department_neris_id)" value={payload.base?.department_neris_id} />
          <Field label="Incident Number (incident_number)" value={payload.base?.incident_number} />
          <Field label="People Present at Incident (people_present)" value={formatBool(payload.base?.people_present)} />
          <Field label="Number of People Displaced (displacement_count)" value={payload.base?.displacement_count} />
          <Field label="Animals Rescued (animals_rescued)" value={payload.base?.animals_rescued} />
        </FieldGrid>
        {payload.base?.outcome_narrative && (
          <FieldBlock label="Outcome Narrative (outcome_narrative)" value={payload.base.outcome_narrative} />
        )}
        {payload.base?.impediment_narrative && (
          <FieldBlock label="Impediment Narrative (impediment_narrative)" value={payload.base.impediment_narrative} />
        )}
      </PayloadSection>

      {/* NERIS Location — NG911 CLDXF Format */}
      <PayloadSection title="NERIS Location — NG911 Civic Address (mod_civic_location)" expanded={expandedSections['location'] !== false} onToggle={() => toggleSection('location')}>
        {/* Show actual address from incident for context */}
        <div style={{ fontSize: '0.8rem', color: '#374151', marginBottom: '0.5rem', padding: '0.4rem 0.6rem', background: '#f9fafb', borderRadius: '4px' }}>
          <span style={{ color: '#6b7280' }}>Run Sheet Address: </span>
          <span style={{ fontWeight: 500 }}>{incident.address || '—'}</span>
          {incident.cross_streets && <span style={{ color: '#6b7280' }}> (Cross: {incident.cross_streets})</span>}
        </div>
        
        {/* NERIS location fields */}
        {payload.base?.location && Object.keys(payload.base.location).length > 0 ? (
          <FieldGrid>
            <Field label="Street Number (number)" value={payload.base.location.number} />
            <Field label="Street Name (street)" value={payload.base.location.street} />
            <Field label="Street Suffix (street_postfix)" value={payload.base.location.street_postfix} />
            <Field label="Street Prefix Direction (street_prefix_direction)" value={payload.base.location.street_prefix_direction} />
            <Field label="Street Postfix Direction (street_postfix_direction)" value={payload.base.location.street_postfix_direction} />
            <Field label="Incorporated Municipality (incorporated_municipality)" value={payload.base.location.incorporated_municipality} />
            <Field label="Postal Community (postal_community)" value={payload.base.location.postal_community} />
            <Field label="County (county)" value={payload.base.location.county} />
            <Field label="State (state)" value={payload.base.location.state} />
            <Field label="ZIP Code (postal_code)" value={payload.base.location.postal_code} />
            <Field label="Country (country)" value={payload.base.location.country} />
            <Field label="Floor (floor)" value={payload.base.location.floor} />
            <Field label="Unit/Apt (unit_value)" value={payload.base.location.unit_value} />
            <Field label="Room (room)" value={payload.base.location.room} />
            <Field label="Site Name (site)" value={payload.base.location.site} />
            <Field label="Place Type (place_type)" value={payload.base.location.place_type} />
          </FieldGrid>
        ) : (
          <div style={{ fontSize: '0.8rem', color: '#991b1b', fontStyle: 'italic' }}>
            No NERIS location data populated. The neris_location JSONB field on this incident is empty. Address components must be parsed into NERIS NG911 format.
          </div>
        )}

        {/* GPS Point */}
        <div style={{ marginTop: '0.5rem' }}>
          <FieldGrid>
            <Field label="Latitude (incident_point)" value={incident.latitude} />
            <Field label="Longitude (incident_point)" value={incident.longitude} />
          </FieldGrid>
          {payload.base?.point && (
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              GeoJSON CRS: {payload.base.point.crs} — Coordinates: [{payload.base.point.geometry?.coordinates?.[0]}, {payload.base.point.geometry?.coordinates?.[1]}] (lon, lat)
            </div>
          )}
        </div>

        {/* Cross Streets */}
        {incident.cross_streets && (
          <div style={{ marginTop: '0.5rem' }}>
            <Field label="Cross Streets (cross_streets)" value={incident.cross_streets} />
          </div>
        )}
      </PayloadSection>

      {/* NERIS Location Use */}
      <PayloadSection title="NERIS Location Use (mod_location_use)" expanded={expandedSections['location_use'] !== false} onToggle={() => toggleSection('location_use')}>
        {payload.base?.location_use ? (
          <FieldGrid>
            {Object.entries(payload.base.location_use).map(([k, v]) => (
              <Field key={k} label={`${formatLabel(k)} (${k})`} value={typeof v === 'object' ? JSON.stringify(v) : formatNerisCode(String(v))} />
            ))}
          </FieldGrid>
        ) : (
          <div style={{ fontSize: '0.8rem', color: '#92400e', fontStyle: 'italic' }}>
            No location use selected. Set this on the run sheet under NERIS Classification → Location Use.
          </div>
        )}
      </PayloadSection>

      {/* NERIS Incident Type Classification */}
      <PayloadSection 
        title="NERIS Incident Type Classification (incident_types)" 
        expanded={expandedSections['types'] !== false}
        onToggle={() => toggleSection('types')}
        badge={payload.incident_types?.length || 0}
      >
        {(payload.incident_types || []).length > 0 ? (
          (payload.incident_types || []).map((t, i) => (
            <div key={i} style={{ 
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.25rem 0.65rem', margin: '0.2rem', borderRadius: '999px',
              background: t.primary ? '#dbeafe' : '#f3f4f6',
              border: `1px solid ${t.primary ? '#93c5fd' : '#d1d5db'}`,
              fontSize: '0.8rem', color: '#1f2937'
            }}>
              {t.primary && <span style={{ color: '#2563eb', fontWeight: 700 }}>★ Primary</span>}
              {formatNerisCode(t.type)}
            </div>
          ))
        ) : (
          <div style={{ fontSize: '0.8rem', color: '#991b1b', fontStyle: 'italic' }}>
            No incident types selected. Set this on the run sheet under NERIS Classification → Incident Type.
          </div>
        )}
      </PayloadSection>

      {/* NERIS Dispatch — PSAP Timestamps + Unit Responses */}
      <PayloadSection 
        title="NERIS Dispatch (mod_dispatch)" 
        expanded={expandedSections['dispatch'] !== false}
        onToggle={() => toggleSection('dispatch')}
      >
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
          PSAP Timestamps (Required)
        </div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
          NERIS requires: call_arrival ≤ call_answered ≤ call_create (dispatch time). Call Arrival and Call Answered can be edited below.
        </div>

        <PsapTimestampEditor 
          incidentId={incidentId} 
          incident={incident}
          callArrival={payload.dispatch?.call_arrival}
          callAnswered={payload.dispatch?.call_answered}
          callCreate={payload.dispatch?.call_create}
          incidentClear={payload.dispatch?.incident_clear}
          onSaved={onRefresh}
        />

        <div style={{ marginTop: '0.5rem' }}>
          <Field label="CAD Event Number (incident_number)" value={payload.dispatch?.incident_number} />
        </div>

        {/* Unit Responses */}
        {payload.dispatch?.unit_responses?.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
              Unit Responses — IncidentUnitResponsePayload ({payload.dispatch.unit_responses.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={thStyle}>Reported Unit ID (reported_unit_id)</th>
                  <th style={thStyle}>Staffing Count (staffing)</th>
                  <th style={thStyle}>Unit Dispatched (dispatch)</th>
                  <th style={thStyle}>Unit Enroute (enroute_to_scene)</th>
                  <th style={thStyle}>Unit On Scene (on_scene)</th>
                  <th style={thStyle}>Unit Cleared (unit_clear)</th>
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

      {/* NERIS Tactic Timestamps */}
      {payload.tactic_timestamps && (
        <PayloadSection title="NERIS Tactic Timestamps (mod_tactic_timestamps)" expanded={expandedSections['tactics'] !== false} onToggle={() => toggleSection('tactics')}>
          <FieldGrid>
            {Object.entries(payload.tactic_timestamps).map(([k, v]) => (
              <Field key={k} label={`${formatLabel(k)} (${k})`} value={formatTs(v)} />
            ))}
          </FieldGrid>
        </PayloadSection>
      )}

      {/* NERIS Actions Taken */}
      {payload.actions_tactics && (
        <PayloadSection title="NERIS Actions Taken (mod_action_tactic)" expanded={expandedSections['actions'] !== false} onToggle={() => toggleSection('actions')}>
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
            <Field label="No Action Reason (noaction_type)" value={formatNerisCode(payload.actions_tactics.action_noaction.noaction_type)} />
          )}
        </PayloadSection>
      )}

      {/* NERIS Mutual Aid */}
      {payload.aids && (
        <PayloadSection title="NERIS Mutual Aid (mod_aid)" expanded={expandedSections['aids'] !== false} onToggle={() => toggleSection('aids')} badge={payload.aids.length}>
          {payload.aids.map((a, i) => (
            <FieldGrid key={i}>
              <Field label="Aid Department NERIS ID (department_neris_id)" value={a.department_neris_id} />
              <Field label="Aid Type (aid_type)" value={formatNerisCode(a.aid_type)} />
              <Field label="Aid Direction (aid_direction)" value={a.aid_direction} />
            </FieldGrid>
          ))}
        </PayloadSection>
      )}

      {/* NERIS Fire Detail */}
      {payload.fire_detail && (
        <PayloadSection title="NERIS Fire Detail (mod_fire)" expanded={expandedSections['fire'] !== false} onToggle={() => toggleSection('fire')} color="#dc2626">
          <FieldGrid>
            <Field label="Fire Investigation Needed (investigation_needed)" value={payload.fire_detail.investigation_needed} />
            <Field label="Water Supply Type (water_supply)" value={formatNerisCode(payload.fire_detail.water_supply)} />
          </FieldGrid>
          {payload.fire_detail.location_detail && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#fef2f2', borderRadius: '4px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.35rem' }}>
                Fire Location Detail: {payload.fire_detail.location_detail.type}
              </div>
              <FieldGrid>
                {Object.entries(payload.fire_detail.location_detail).filter(([k]) => k !== 'type').map(([k, v]) => (
                  <Field key={k} label={`${formatLabel(k)} (${k})`} value={formatNerisCode(String(v))} />
                ))}
              </FieldGrid>
            </div>
          )}
        </PayloadSection>
      )}

      {/* NERIS Risk Reduction — Alarms & Suppression */}
      {(payload.smoke_alarm || payload.fire_alarm || payload.other_alarm || payload.fire_suppression) && (
        <PayloadSection title="NERIS Risk Reduction — Alarms & Suppression" expanded={expandedSections['alarms'] !== false} onToggle={() => toggleSection('alarms')}>
          <FieldGrid>
            <Field label="Smoke Alarm Presence (mod_smoke_alarm)" value={payload.smoke_alarm?.presence?.type || '—'} />
            <Field label="Fire Alarm Presence (mod_fire_alarm)" value={payload.fire_alarm?.presence?.type || '—'} />
            <Field label="Other Alarm Presence (mod_other_alarm)" value={payload.other_alarm?.presence?.type || '—'} />
            <Field label="Fire Suppression Presence (mod_fire_suppression)" value={payload.fire_suppression?.presence?.type || '—'} />
          </FieldGrid>
        </PayloadSection>
      )}

      {/* NERIS Medical Detail */}
      {payload.medical_details && (
        <PayloadSection title="NERIS Medical Detail (mod_medical)" expanded={expandedSections['medical'] !== false} onToggle={() => toggleSection('medical')} color="#059669">
          {payload.medical_details.map((m, i) => (
            <FieldGrid key={i}>
              <Field label="Patient Care Evaluation (patient_care_evaluation)" value={formatNerisCode(m.patient_care_evaluation)} />
              <Field label="Patient Status (patient_status)" value={formatNerisCode(m.patient_status)} />
              <Field label="Transport Disposition (transport_disposition)" value={formatNerisCode(m.transport_disposition)} />
            </FieldGrid>
          ))}
        </PayloadSection>
      )}

      {/* NERIS Hazmat Detail */}
      {payload.hazsit_detail && (
        <PayloadSection title="NERIS Hazmat Detail (mod_hazsit)" expanded={expandedSections['hazmat'] !== false} onToggle={() => toggleSection('hazmat')} color="#d97706">
          <FieldGrid>
            <Field label="Hazmat Disposition (disposition)" value={formatNerisCode(payload.hazsit_detail.disposition)} />
            <Field label="Number Evacuated (evacuated)" value={payload.hazsit_detail.evacuated} />
          </FieldGrid>
          {payload.hazsit_detail.chemicals?.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>Chemicals Involved</div>
              {payload.hazsit_detail.chemicals.map((c, i) => (
                <div key={i} style={{ fontSize: '0.8rem', color: '#374151', padding: '2px 0' }}>
                  {c.name || '(unnamed)'} — DOT Class: {c.dot_class || '—'} — Release Occurred: {c.release_occurred ? 'Yes' : 'No'}
                </div>
              ))}
            </div>
          )}
        </PayloadSection>
      )}

      {/* NERIS Casualty & Rescues */}
      {payload.casualty_rescues && (
        <PayloadSection title="NERIS Casualty & Rescue (mod_casualty_rescue)" expanded={expandedSections['casualties'] !== false} onToggle={() => toggleSection('casualties')} badge={payload.casualty_rescues.length}>
          {payload.casualty_rescues.map((cr, i) => (
            <div key={i} style={{ padding: '0.35rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.8rem' }}>
              <span style={{ fontWeight: 600 }}>{cr.type}</span>
              {cr.gender && ` — Gender: ${cr.gender}`}
              {cr.rank && ` — Rank: ${cr.rank}`}
            </div>
          ))}
        </PayloadSection>
      )}

      {/* NERIS Emerging Hazards */}
      {(payload.electric_hazards || payload.powergen_hazards || payload.csst_hazard) && (
        <PayloadSection title="NERIS Emerging Hazards" expanded={expandedSections['emerging'] !== false} onToggle={() => toggleSection('emerging')}>
          {payload.electric_hazards && <Field label="Electric Vehicle / Battery Storage Hazard (mod_electric_hazard)" value="Present" />}
          {payload.powergen_hazards && <Field label="Solar PV / Power Generation Hazard (mod_powergen_hazard)" value="Present" />}
          {payload.csst_hazard && <Field label="CSST Gas Line Hazard (mod_csst_hazard)" value="Present" />}
        </PayloadSection>
      )}

      {/* CAD Dispatch Comments */}
      {payload.dispatch?.comments?.length > 0 && (
        <PayloadSection title="CAD Dispatch Comments (dispatch.comments)" expanded={expandedSections['comments'] !== false} onToggle={() => toggleSection('comments')} badge={payload.dispatch.comments.length}>
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
// PSAP TIMESTAMP EDITOR — always-editable, defaults to call_create when null
// ============================================================================

function PsapTimestampEditor({ incidentId, incident, callArrival, callAnswered, callCreate, incidentClear, onSaved }) {
  const defaultVal = callCreate ? toLocalDatetimeStr(callCreate) : '';
  const [arrivalVal, setArrivalVal] = useState(incident.psap_call_arrival ? toLocalDatetimeStr(incident.psap_call_arrival) : defaultVal);
  const [answeredVal, setAnsweredVal] = useState(incident.psap_call_answered ? toLocalDatetimeStr(incident.psap_call_answered) : defaultVal);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.patch(`/neris/psap/${incidentId}`, {
        psap_call_arrival: arrivalVal ? new Date(arrivalVal).toISOString() : '',
        psap_call_answered: answeredVal ? new Date(answeredVal).toISOString() : '',
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (onSaved) onSaved();
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Failed to save PSAP timestamps');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', alignItems: 'end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.7rem', color: '#374151', fontWeight: 600, marginBottom: '2px' }}>PSAP Call Arrival Time (call_arrival)</label>
          <input type="datetime-local" step="1" value={arrivalVal} onChange={e => setArrivalVal(e.target.value)}
            style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.7rem', color: '#374151', fontWeight: 600, marginBottom: '2px' }}>PSAP Call Answered Time (call_answered)</label>
          <input type="datetime-local" step="1" value={answeredVal} onChange={e => setAnsweredVal(e.target.value)}
            style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.7rem', color: '#374151', fontWeight: 600, marginBottom: '2px' }}>Call Create / Dispatch Time (call_create) — read-only</label>
          <div style={{ color: '#1f2937', fontWeight: 500, padding: '5px 6px', fontSize: '0.8rem' }}>{formatTs(callCreate)}</div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.7rem', color: '#374151', fontWeight: 600, marginBottom: '2px' }}>Incident Clear Time (incident_clear) — read-only</label>
          <div style={{ color: '#1f2937', fontWeight: 500, padding: '5px 6px', fontSize: '0.8rem' }}>{formatTs(incidentClear)}</div>
        </div>
      </div>
      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button onClick={handleSave} disabled={saving} style={btnStyle('#2563eb', '#fff', '#1d4ed8')}>
          {saving ? 'Saving...' : 'Save PSAP Timestamps'}
        </button>
        {saved && <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 500 }}>✓ Saved</span>}
        {saveError && <span style={{ fontSize: '0.8rem', color: '#991b1b' }}>{saveError}</span>}
      </div>
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
          {copied ? '✓ Copied' : 'Copy NERIS JSON Payload'}
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
// RESPONSE TAB
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
          {result.success ? '✓ Successfully submitted to NERIS sandbox' : '✗ NERIS submission failed'}
        </div>
        {result.neris_id && (
          <div style={{ fontSize: '0.85rem', color: '#166534', marginTop: '0.25rem' }}>
            NERIS Incident ID: <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: '3px' }}>{result.neris_id}</code>
          </div>
        )}
        {result.api_error && (
          <div style={{ fontSize: '0.85rem', color: '#991b1b', marginTop: '0.25rem' }}>API Error: {result.api_error}</div>
        )}
        {result.message && (
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>{result.message}</div>
        )}
      </div>

      {result.errors?.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.35rem' }}>NERIS Validation Errors</div>
          {result.errors.map((e, i) => (
            <div key={i} style={{ fontSize: '0.8rem', color: '#991b1b', padding: '2px 0' }}>
              ✗ <code>{e.field}</code> — {e.message}
            </div>
          ))}
        </div>
      )}

      {result.warnings?.length > 0 && (
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: '0.35rem' }}>NERIS Warnings</div>
          {result.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: '0.8rem', color: '#92400e', padding: '2px 0' }}>
              ⚠ <code>{w.field}</code> — {w.message}
            </div>
          ))}
        </div>
      )}

      {result.body && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Raw NERIS API Response</div>
          <pre style={{
            background: '#1f2937', color: '#e5e7eb', padding: '0.75rem', borderRadius: '6px',
            fontSize: '0.75rem', overflow: 'auto', maxHeight: '300px', fontFamily: 'ui-monospace, monospace'
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
      marginBottom: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '6px',
      overflow: 'hidden', borderLeft: color ? `3px solid ${color}` : undefined,
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
            <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', fontWeight: 700,
              background: '#e5e7eb', padding: '1px 6px', borderRadius: '999px', color: '#6b7280' }}>{badge}</span>
          )}
        </span>
        <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && <div style={{ padding: '0.5rem 0.75rem', background: '#fff' }}>{children}</div>}
    </div>
  );
}

function FieldGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.35rem 1rem' }}>{children}</div>;
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
      <div style={{ color: '#1f2937', background: '#f9fafb', padding: '0.5rem', borderRadius: '4px', lineHeight: '1.4' }}>{value}</div>
    </div>
  );
}

function StatusBadge({ children, color, bg, border }) {
  return (
    <span style={{ fontSize: '0.75rem', fontWeight: 600, color, background: bg, border: `1px solid ${border}`, padding: '0.25rem 0.6rem', borderRadius: '999px' }}>
      {children}
    </span>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: active ? 600 : 400,
      color: active ? '#2563eb' : '#6b7280', borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
      background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem',
    }}>
      {children}
    </button>
  );
}

function Badge({ color, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: '18px', height: '18px', padding: '0 4px', borderRadius: '999px',
      background: color, color: '#fff', fontSize: '0.65rem', fontWeight: 700,
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

const thStyle = { textAlign: 'left', padding: '0.35rem 0.5rem', color: '#6b7280', fontWeight: 600, fontSize: '0.7rem' };
const tdStyle = { padding: '0.35rem 0.5rem', color: '#1f2937' };

function toLocalDatetimeStr(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    // Format as YYYY-MM-DDTHH:MM:SS for datetime-local input
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return '';
  }
}

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
  const parts = val.split('||');
  const last = parts[parts.length - 1];
  return last.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
