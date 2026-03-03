import { PayloadSection, Field } from '../shared/NerisComponents';
import { formatNerisCode } from '../shared/nerisUtils';

export default function ActionsTaken({ payload, expanded, onToggle }) {
  if (!payload.actions_tactics) return null;
  return (
    <PayloadSection title="NERIS Actions Taken (mod_action_tactic)" expanded={expanded} onToggle={onToggle}>
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
  );
}
