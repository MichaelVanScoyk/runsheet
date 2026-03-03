import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';
import { formatLabel, formatNerisCode } from '../shared/nerisUtils';

export default function LocationUse({ payload, expanded, onToggle }) {
  return (
    <PayloadSection title="NERIS Location Use (mod_location_use)" expanded={expanded} onToggle={onToggle}>
      {payload.base?.location_use ? (
        <FieldGrid>
          {Object.entries(payload.base.location_use).map(([k, v]) => (
            <Field key={k} label={`${formatLabel(k)} (${k})`} value={typeof v === 'object' ? JSON.stringify(v) : formatNerisCode(String(v))} />
          ))}
        </FieldGrid>
      ) : (
        <div style={{ fontSize: '0.8rem', color: '#92400e', fontStyle: 'italic' }}>
          No location use selected.
        </div>
      )}
    </PayloadSection>
  );
}
