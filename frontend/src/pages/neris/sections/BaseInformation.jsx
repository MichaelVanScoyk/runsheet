import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';

const DISPLACEMENT_CAUSES = [
  { value: 'COLLAPSE', label: 'Collapse' },
  { value: 'FIRE', label: 'Fire' },
  { value: 'HAZARDOUS_SITUATION', label: 'Hazardous Situation' },
  { value: 'OTHER', label: 'Other' },
  { value: 'SMOKE', label: 'Smoke' },
  { value: 'UTILITIES', label: 'Utilities' },
  { value: 'WATER', label: 'Water' },
];

const SPECIAL_MODIFIERS = [
  { value: 'ACTIVE_ASSAILANT', label: 'Active Assailant' },
  { value: 'MCI', label: 'Mass Casualty Incident' },
  { value: 'FEDERAL_DECLARED_DISASTER', label: 'Federal Declared Disaster' },
  { value: 'STATE_DECLARED_DISASTER', label: 'State Declared Disaster' },
  { value: 'COUNTY_LOCAL_DECLARED_DISASTER', label: 'County/Local Declared Disaster' },
  { value: 'URBAN_CONFLAGRATION', label: 'Urban Conflagration' },
  { value: 'VIOLENCE_AGAINST_RESPONDER', label: 'Violence Against Responder' },
];

const MED_OXYGEN_OPTIONS = [
  { val: 'PRESENT', lbl: 'Present' },
  { val: 'NOT_PRESENT', lbl: 'Not Present' },
  { val: 'NOT_APPLICABLE', lbl: 'N/A' },
  { val: null, lbl: 'Unknown' },
];

export default function BaseInformation({ expanded, onToggle }) {
  const { incident, preview, saveFields, saving } = useNeris();
  const payload = preview?.payload;

  const [peoplePresent, setPeoplePresent] = useState(incident?.neris_people_present);
  const [displaced, setDisplaced] = useState(incident?.neris_displaced_number ?? 0);
  const [displacementCauses, setDisplacementCauses] = useState(incident?.neris_displacement_causes || []);
  const [animalRescues, setAnimalRescues] = useState(incident?.neris_rescue_animal ?? 0);
  const [outcomeNarrative, setOutcomeNarrative] = useState(incident?.neris_narrative_outcome || '');
  const [impedanceNarrative, setImpedanceNarrative] = useState(incident?.neris_narrative_impedance || '');
  const [specialModifiers, setSpecialModifiers] = useState(incident?.neris_special_modifiers || []);
  const [medOxygenHazard, setMedOxygenHazard] = useState(incident?.neris_medical_oxygen_hazard || null);
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  const toggleArrayValue = (arr, setArr, value) => {
    if (arr.includes(value)) {
      setArr(arr.filter(v => v !== value));
    } else {
      setArr([...arr, value]);
    }
    mark();
  };

  const handleSave = async () => {
    const ok = await saveFields({
      neris_people_present: peoplePresent,
      neris_displaced_number: displaced,
      neris_displacement_causes: displacementCauses,
      neris_rescue_animal: animalRescues,
      neris_narrative_outcome: outcomeNarrative || null,
      neris_narrative_impedance: impedanceNarrative || null,
      neris_special_modifiers: specialModifiers,
      neris_medical_oxygen_hazard: medOxygenHazard,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const labelStyle = { fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' };
  const checkStyle = { display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#374151', cursor: 'pointer' };

  return (
    <PayloadSection title="NERIS Base — Incident Information" expanded={expanded} onToggle={onToggle}>
      {/* Read-only fields from payload */}
      <FieldGrid>
        <Field label="NERIS Department ID (department_neris_id)" value={payload?.base?.department_neris_id} />
        <Field label="Incident Number (incident_number)" value={payload?.base?.incident_number} />
      </FieldGrid>

      {/* Row 1: People Present, Displaced Count, Animals Rescued */}
      <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem 1rem' }}>
        <div>
          <label style={labelStyle}>People Present?</label>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {[{ val: true, lbl: 'Yes' }, { val: false, lbl: 'No' }, { val: null, lbl: 'Unknown' }].map(opt => (
              <label key={String(opt.val)} style={checkStyle}>
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

        <div>
          <label style={labelStyle}>People Displaced</label>
          <input
            type="number" min="0" value={displaced}
            onChange={(e) => { setDisplaced(parseInt(e.target.value) || 0); mark(); }}
            style={{ width: '80px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
          />
        </div>

        <div>
          <label style={labelStyle}>Animals Rescued</label>
          <input
            type="number" min="0" value={animalRescues}
            onChange={(e) => { setAnimalRescues(parseInt(e.target.value) || 0); mark(); }}
            style={{ width: '80px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
          />
        </div>
      </div>

      {/* Displacement Causes — only show when displaced > 0 */}
      {displaced > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <label style={labelStyle}>Displacement Causes</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
            {DISPLACEMENT_CAUSES.map(opt => (
              <label key={opt.value} style={checkStyle}>
                <input
                  type="checkbox"
                  checked={displacementCauses.includes(opt.value)}
                  onChange={() => toggleArrayValue(displacementCauses, setDisplacementCauses, opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Medical Oxygen Hazard */}
      <div style={{ marginTop: '0.75rem' }}>
        <label style={labelStyle}>Medical Oxygen Hazard?</label>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {MED_OXYGEN_OPTIONS.map(opt => (
            <label key={String(opt.val)} style={checkStyle}>
              <input
                type="radio"
                name="med_oxygen"
                checked={medOxygenHazard === opt.val}
                onChange={() => { setMedOxygenHazard(opt.val); mark(); }}
              />
              {opt.lbl}
            </label>
          ))}
        </div>
      </div>

      {/* Narratives */}
      <div style={{ marginTop: '0.75rem' }}>
        <label style={labelStyle}>Outcome Narrative (outcome_narrative)</label>
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
        <label style={labelStyle}>Impediment Narrative (impediment_narrative)</label>
        <textarea
          value={impedanceNarrative}
          onChange={(e) => { setImpedanceNarrative(e.target.value); mark(); }}
          rows={2}
          placeholder="Traffic, access issues, weather, etc."
          style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px', resize: 'vertical' }}
        />
      </div>

      {/* Special Modifiers */}
      <div style={{ marginTop: '0.75rem' }}>
        <label style={labelStyle}>Special Modifiers</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
          {SPECIAL_MODIFIERS.map(opt => (
            <label key={opt.value} style={checkStyle}>
              <input
                type="checkbox"
                checked={specialModifiers.includes(opt.value)}
                onChange={() => toggleArrayValue(specialModifiers, setSpecialModifiers, opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        {specialModifiers.length === 0 && (
          <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontStyle: 'italic' }}>None selected (typical for most incidents)</span>
        )}
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
