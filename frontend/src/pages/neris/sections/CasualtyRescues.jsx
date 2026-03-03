import { PayloadSection, Field } from '../shared/NerisComponents';

export default function CasualtyRescues({ payload, expanded, onToggle }) {
  if (!payload.casualty_rescues) return null;
  return (
    <PayloadSection title="NERIS Casualty & Rescue (mod_casualty_rescue)" expanded={expanded} onToggle={onToggle} badge={payload.casualty_rescues.length}>
      {payload.casualty_rescues.map((cr, i) => (
        <div key={i} style={{ padding: '0.35rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.8rem' }}>
          <span style={{ fontWeight: 600 }}>{cr.type}</span>
          {cr.gender && ` — Gender: ${cr.gender}`}
          {cr.rank && ` — Rank: ${cr.rank}`}
        </div>
      ))}
    </PayloadSection>
  );
}
