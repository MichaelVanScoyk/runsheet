import { PayloadSection, Field } from '../shared/NerisComponents';

export default function EmergingHazards({ payload, expanded, onToggle }) {
  if (!payload.electric_hazards && !payload.powergen_hazards && !payload.csst_hazard) return null;
  return (
    <PayloadSection title="NERIS Emerging Hazards" expanded={expanded} onToggle={onToggle}>
      {payload.electric_hazards && <Field label="Electric Vehicle / Battery Storage Hazard (mod_electric_hazard)" value="Present" />}
      {payload.powergen_hazards && <Field label="Solar PV / Power Generation Hazard (mod_powergen_hazard)" value="Present" />}
      {payload.csst_hazard && <Field label="CSST Gas Line Hazard (mod_csst_hazard)" value="Present" />}
    </PayloadSection>
  );
}
