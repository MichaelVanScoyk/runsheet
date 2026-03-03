import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';
import { formatLabel, formatTs } from '../shared/nerisUtils';

export default function TacticTimestamps({ payload, expanded, onToggle }) {
  if (!payload.tactic_timestamps) return null;
  return (
    <PayloadSection title="NERIS Tactic Timestamps (mod_tactic_timestamps)" expanded={expanded} onToggle={onToggle}>
      <FieldGrid>
        {Object.entries(payload.tactic_timestamps).map(([k, v]) => (
          <Field key={k} label={`${formatLabel(k)} (${k})`} value={formatTs(v)} />
        ))}
      </FieldGrid>
    </PayloadSection>
  );
}
