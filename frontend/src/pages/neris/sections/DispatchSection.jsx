import { useState } from 'react';
import api from '../../../api';
import { PayloadSection, Field, FieldGrid } from '../shared/NerisComponents';
import { formatTs, toLocalDatetimeStr, thStyle, tdStyle } from '../shared/nerisUtils';

function PsapTimestampEditor({ incidentId, incident, callArrival, callAnswered, callCreate, incidentClear, onSaved }) {
  const defaultVal = callCreate ? toLocalDatetimeStr(callCreate) : '';
  const [arrivalVal, setArrivalVal] = useState(incident.psap_call_arrival ? toLocalDatetimeStr(incident.psap_call_arrival) : defaultVal);
  const [answeredVal, setAnsweredVal] = useState(incident.psap_call_answered ? toLocalDatetimeStr(incident.psap_call_answered) : defaultVal);
  const [saveError, setSaveError] = useState(null);

  const saveValues = async (arrival, answered) => {
    setSaveError(null);
    try {
      await api.patch(`/neris/psap/${incidentId}`, {
        psap_call_arrival: arrival ? new Date(arrival).toISOString() : '',
        psap_call_answered: answered ? new Date(answered).toISOString() : '',
      });
      if (onSaved) onSaved();
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Failed to save PSAP timestamps');
    }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', alignItems: 'end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.7rem', color: '#374151', fontWeight: 600, marginBottom: '2px' }}>PSAP Call Arrival Time (call_arrival)</label>
          <input type="datetime-local" step="1" value={arrivalVal}
            onChange={e => setArrivalVal(e.target.value)}
            onBlur={e => saveValues(e.target.value, answeredVal)}
            style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.7rem', color: '#374151', fontWeight: 600, marginBottom: '2px' }}>PSAP Call Answered Time (call_answered)</label>
          <input type="datetime-local" step="1" value={answeredVal}
            onChange={e => setAnsweredVal(e.target.value)}
            onBlur={e => saveValues(arrivalVal, e.target.value)}
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
      {saveError && <div style={{ fontSize: '0.8rem', color: '#991b1b', marginTop: '0.25rem' }}>{saveError}</div>}
    </div>
  );
}

export default function DispatchSection({ incidentId, incident, payload, expanded, onToggle, onRefresh }) {
  return (
    <PayloadSection
      title="NERIS Dispatch (mod_dispatch)"
      expanded={expanded}
      onToggle={onToggle}
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
  );
}
