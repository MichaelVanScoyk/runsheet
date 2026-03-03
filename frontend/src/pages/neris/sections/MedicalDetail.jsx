import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';
import { formatNerisCode } from '../shared/nerisUtils';

export default function MedicalDetail({ payload, expanded, onToggle }) {
  if (!payload.medical_details) return null;
  return (
    <PayloadSection title="NERIS Medical Detail (mod_medical)" expanded={expanded} onToggle={onToggle} color="#059669">
      {payload.medical_details.map((m, i) => (
        <FieldGrid key={i}>
          <Field label="Patient Care Evaluation (patient_care_evaluation)" value={formatNerisCode(m.patient_care_evaluation)} />
          <Field label="Patient Status (patient_status)" value={formatNerisCode(m.patient_status)} />
          <Field label="Transport Disposition (transport_disposition)" value={formatNerisCode(m.transport_disposition)} />
        </FieldGrid>
      ))}
    </PayloadSection>
  );
}
