import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection } from '../shared/NerisComponents';

export default function MedicalDetail({ expanded, onToggle }) {
  const { incident, dropdowns, saveFields, saving } = useNeris();

  const typeCodes = incident?.neris_incident_type_codes || [];
  const hasMedicalType = typeCodes.some(t => t && t.startsWith('MEDICAL'));

  if (!hasMedicalType) return null;

  const medicalPatientCareCodes = dropdowns.type_medical_patient_care || [];

  const [patientCare, setPatientCare] = useState(incident?.neris_medical_patient_care || '');
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const handleSave = async () => {
    const ok = await saveFields({
      neris_medical_patient_care: patientCare || null,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  return (
    <PayloadSection title="NERIS Medical Detail (mod_medical)" expanded={expanded} onToggle={onToggle} color="#059669">
      <div>
        <label style={{ fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' }}>
          Patient Evaluation/Care <span style={{ color: '#dc2626' }}>*</span>
        </label>
        <select
          value={patientCare}
          onChange={(e) => { setPatientCare(e.target.value); setDirty(true); }}
          style={{ width: '100%', maxWidth: '400px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
        >
          <option value="">Select...</option>
          {medicalPatientCareCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontWeight: 500,
            background: dirty ? '#2563eb' : '#e5e7eb', color: dirty ? '#fff' : '#9ca3af',
            border: 'none', borderRadius: '5px', cursor: dirty ? 'pointer' : 'default'
          }}
        >
          {saving ? 'Saving...' : saveOk ? '✓ Saved' : 'Save Medical Detail'}
        </button>
        {dirty && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>Unsaved changes</span>}
      </div>
    </PayloadSection>
  );
}
