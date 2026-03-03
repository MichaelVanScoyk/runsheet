import { PayloadSection } from '../shared/NerisComponents';
import { formatNerisCode } from '../shared/nerisUtils';

export default function IncidentClassification({ payload, expanded, onToggle }) {
  return (
    <PayloadSection
      title="NERIS Incident Type Classification (incident_types)"
      expanded={expanded}
      onToggle={onToggle}
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
          No incident types selected.
        </div>
      )}
    </PayloadSection>
  );
}
