import { PayloadSection, FieldGrid, Field, FieldBlock } from '../shared/NerisComponents';
import { formatBool } from '../shared/nerisUtils';

export default function BaseInformation({ payload, expanded, onToggle }) {
  return (
    <PayloadSection title="NERIS Base — Incident Information" expanded={expanded} onToggle={onToggle}>
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
  );
}
