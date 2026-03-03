import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';
import { formatNerisCode } from '../shared/nerisUtils';

export default function MutualAidDisplay({ payload, expanded, onToggle }) {
  if (!payload.aids) return null;
  return (
    <PayloadSection title="NERIS Mutual Aid (mod_aid)" expanded={expanded} onToggle={onToggle} badge={payload.aids.length}>
      {payload.aids.map((a, i) => (
        <FieldGrid key={i}>
          <Field label="Aid Department NERIS ID (department_neris_id)" value={a.department_neris_id} />
          <Field label="Aid Type (aid_type)" value={formatNerisCode(a.aid_type)} />
          <Field label="Aid Direction (aid_direction)" value={a.aid_direction} />
        </FieldGrid>
      ))}
    </PayloadSection>
  );
}
