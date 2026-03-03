import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';
import { formatNerisCode } from '../shared/nerisUtils';

export default function HazmatDetail({ payload, expanded, onToggle }) {
  if (!payload.hazsit_detail) return null;
  return (
    <PayloadSection title="NERIS Hazmat Detail (mod_hazsit)" expanded={expanded} onToggle={onToggle} color="#d97706">
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
  );
}
