import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';
import { formatLabel, formatNerisCode } from '../shared/nerisUtils';

export default function FireDetail({ payload, expanded, onToggle }) {
  if (!payload.fire_detail) return null;
  return (
    <PayloadSection title="NERIS Fire Detail (mod_fire)" expanded={expanded} onToggle={onToggle} color="#dc2626">
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
  );
}
