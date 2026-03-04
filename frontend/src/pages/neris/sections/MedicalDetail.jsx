import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection } from '../shared/NerisComponents';

const TRANSPORT_DISPOSITION_OPTIONS = [
  { value: 'TRANSPORT_BY_EMS_UNIT', label: 'Transported by EMS Unit' },
  { value: 'OTHER_AGENCY_TRANSPORT', label: 'Other Agency Transport' },
  { value: 'NONPATIENT_TRANSPORT', label: 'Non-Patient Transport' },
  { value: 'PATIENT_REFUSED_TRANSPORT', label: 'Patient Refused Transport' },
  { value: 'NO_TRANSPORT', label: 'No Transport' },
];

const PATIENT_STATUS_OPTIONS = [
  { value: 'IMPROVED', label: 'Improved' },
  { value: 'UNCHANGED', label: 'Unchanged' },
  { value: 'WORSE', label: 'Worse' },
];

export default function MedicalDetail({ expanded, onToggle }) {
  const { incident, dropdowns, saveFields, saving } = useNeris();

  const typeCodes = incident?.neris_incident_type_codes || [];
  const hasMedicalType = typeCodes.some(t => t && t.startsWith('MEDICAL'));

  if (!hasMedicalType) return null;

  const medicalPatientCareCodes = dropdowns.type_medical_patient_care || [];

  const [patientCare, setPatientCare] = useState(incident?.neris_medical_patient_care || '');
  const [pcrId, setPcrId] = useState(incident?.neris_medical_pcr_id || '');
  const [transportDisposition, setTransportDisposition] = useState(incident?.neris_medical_transport_disposition || '');
  const [patientStatus, setPatientStatus] = useState(incident?.neris_medical_patient_status || '');
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  const handleSave = async () => {
    const ok = await saveFields({
      neris_medical_patient_care: patientCare || null,
      neris_medical_pcr_id: pcrId || null,
      neris_medical_transport_disposition: transportDisposition || null,
      neris_medical_patient_status: patientStatus || null,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const selectStyle = { width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' };
  const labelStyle = { fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' };

  return (
    <PayloadSection title="NERIS Medical Detail (mod_medical)" expanded={expanded} onToggle={onToggle} color="#059669">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem 1rem' }}>
        <div>
          <label style={labelStyle}>Patient Evaluation/Care <span style={{ color: '#dc2626' }}>*</span></label>
          <select value={patientCare} onChange={(e) => { setPatientCare(e.target.value); mark(); }} style={selectStyle}>
            <option value="">Select...</option>
            {medicalPatientCareCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Transport Disposition</label>
          <select value={transportDisposition} onChange={(e) => { setTransportDisposition(e.target.value); mark(); }} style={selectStyle}>
            <option value="">Select...</option>
            {TRANSPORT_DISPOSITION_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Patient Status</label>
          <select value={patientStatus} onChange={(e) => { setPatientStatus(e.target.value); mark(); }} style={selectStyle}>
            <option value="">Select...</option>
            {PATIENT_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Patient Care Report ID</label>
          <input
            type="text"
            value={pcrId}
            onChange={(e) => { setPcrId(e.target.value); mark(); }}
            placeholder="PCR #"
            style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
          />
        </div>
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
