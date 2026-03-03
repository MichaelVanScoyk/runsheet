import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';

export default function AlarmsAndSuppression({ payload, expanded, onToggle }) {
  if (!payload.smoke_alarm && !payload.fire_alarm && !payload.other_alarm && !payload.fire_suppression) return null;
  return (
    <PayloadSection title="NERIS Risk Reduction — Alarms & Suppression" expanded={expanded} onToggle={onToggle}>
      <FieldGrid>
        <Field label="Smoke Alarm Presence (mod_smoke_alarm)" value={payload.smoke_alarm?.presence?.type || '—'} />
        <Field label="Fire Alarm Presence (mod_fire_alarm)" value={payload.fire_alarm?.presence?.type || '—'} />
        <Field label="Other Alarm Presence (mod_other_alarm)" value={payload.other_alarm?.presence?.type || '—'} />
        <Field label="Fire Suppression Presence (mod_fire_suppression)" value={payload.fire_suppression?.presence?.type || '—'} />
      </FieldGrid>
    </PayloadSection>
  );
}
