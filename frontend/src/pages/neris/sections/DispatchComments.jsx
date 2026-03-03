import { PayloadSection } from '../shared/NerisComponents';
import { formatTs } from '../shared/nerisUtils';

export default function DispatchComments({ payload, expanded, onToggle }) {
  if (!payload.dispatch?.comments?.length) return null;
  return (
    <PayloadSection title="CAD Dispatch Comments (dispatch.comments)" expanded={expanded} onToggle={onToggle} badge={payload.dispatch.comments.length}>
      {payload.dispatch.comments.map((c, i) => (
        <div key={i} style={{ padding: '0.25rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.8rem' }}>
          <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{formatTs(c.timestamp)}</span>
          <span style={{ marginLeft: '0.5rem', color: '#1f2937' }}>{c.comment}</span>
        </div>
      ))}
    </PayloadSection>
  );
}
