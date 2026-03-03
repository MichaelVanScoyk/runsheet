import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';

export default function BaseInformation({ expanded, onToggle }) {
  const { incident, preview, saveFields, saving } = useNeris();
  const payload = preview?.payload;

  const [peoplePresent, setPeoplePresent] = useState(incident?.neris_people_present);
  const [displaced, setDisplaced] = useState(incident?.neris_displaced_number ?? 0);
  const [animalRescues, setAnimalRescues] = useState(incident?.neris_rescue_animal ?? 0);
  const [outcomeNarrative, setOutcomeNarrative] = useState(incident?.neris_narrative_outcome || '');
  const [impedanceNarrative, setImpedanceNarrative] = useState(incident?.neris_narrative_impedance || '');
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  const handleSave = async () => {
    const ok = await saveFields({
      neris_people_present: peoplePresent,
      neris_displaced_number: displaced,
      neris_rescue_animal: animalRescues,
      neris_narrative_outcome: outcomeNarrative || null,
      neris_narrative_impedance: impedanceNarrative || null,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  return (
    <PayloadSection title="NERIS Base — Incident Information" expanded={expanded} onToggle={onToggle}>
      {/* Read-only fields from payload */}
      <FieldGrid>
        <Field label="NERIS Department ID (department_neris_id)" value={payload?.base?.department_neris_id} />
        <Field label="Incident Number (incident_number)" value={payload?.base?.incident_number} />
      </FieldGrid>

      {/* Editable fields */}
      <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem 1rem' }}>
        {/* People Present */}
        <div>
          <label style={{ fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' }}>People Present?</label>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {[{ val: true, lbl: 'Yes' }, { val: false, lbl: 'No' }, { val: null, lbl: 'Unknown' }].map(opt => (
              <label key={String(opt.val)} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="people_present"
                  checked={peoplePresent === opt.val}
                  onChange={() => { setPeoplePresent(opt.val); mark(); }}
                />
                {opt.lbl}
              </label>
            ))}
          </div>
        </div>

        {/* Displaced */}
        <div>
          <label style={{ fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' }}>People Displaced</label>
          <input
            type="number" min="0" value={displaced}
            onChange={(e) => { setDisplaced(parseInt(e.target.value) || 0); mark(); }}
            style={{ width: '80px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
          />
        </div>

        {/* Animal Rescues */}
        <div>
          <label style={{ fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Animals Rescued</label>
          <input
            type="number" min="0" value={animalRescues}
            onChange={(e) => { setAnimalRescues(parseInt(e.target.value) || 0); mark(); }}
            style={{ width: '80px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
          />
        </div>
      </div>

      {/* Narratives */}
      <div style={{ marginTop: '0.75rem' }}>
        <label style={{ fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' }}>
          Outcome Narrative (outcome_narrative)
        </label>
        {incident?.narrative && (
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            Run sheet narrative: <em>{incident.narrative.substring(0, 120)}{incident.narrative.length > 120 ? '...' : ''}</em>
            {!outcomeNarrative && (
              <button
                type="button"
                onClick={() => { setOutcomeNarrative(incident.narrative); mark(); }}
                style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >Copy to NERIS</button>
            )}
          </div>
        )}
        <textarea
          value={outcomeNarrative}
          onChange={(e) => { setOutcomeNarrative(e.target.value); mark(); }}
          rows={2}
          placeholder="Brief description of incident resolution"
          style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px', resize: 'vertical' }}
        />
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <label style={{ fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' }}>
          Impediment Narrative (impediment_narrative)
        </label>
        <textarea
          value={impedanceNarrative}
          onChange={(e) => { setImpedanceNarrative(e.target.value); mark(); }}
          rows={2}
          placeholder="Traffic, access issues, weather, etc."
          style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px', resize: 'vertical' }}
        />
      </div>

      {/* Save */}
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
          {saving ? 'Saving...' : saveOk ? '✓ Saved' : 'Save Base Info'}
        </button>
        {dirty && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>Unsaved changes</span>}
      </div>
    </PayloadSection>
  );
}
