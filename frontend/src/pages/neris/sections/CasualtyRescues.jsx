import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection } from '../shared/NerisComponents';

const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'NON_BINARY', label: 'Non-Binary' },
  { value: 'UNKNOWN', label: 'Unknown' },
  { value: 'NOT_REPORTED', label: 'Not Reported' },
];

const RACES = [
  { value: 'WHITE', label: 'White' },
  { value: 'BLACK_AFRICAN_AMERICAN', label: 'Black / African American' },
  { value: 'ASIAN', label: 'Asian' },
  { value: 'AMERICAN_INDIAN_ALASKA_NATIVE', label: 'American Indian / Alaska Native' },
  { value: 'NATIVE_HAWAIIAN_PACIFIC_ISLANDER', label: 'Native Hawaiian / Pacific Islander' },
  { value: 'TWO_OR_MORE', label: 'Two or More' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNKNOWN', label: 'Unknown' },
  { value: 'NOT_REPORTED', label: 'Not Reported' },
];

const PATIENT_CARE = [
  { value: 'PATIENT_EVALUATED_CARE_PROVIDED', label: 'Evaluated — Care Provided' },
  { value: 'PATIENT_EVALUATED_NO_CARE_REQUIRED', label: 'Evaluated — No Care Required' },
  { value: 'PATIENT_EVALUATED_REFUSED_CARE', label: 'Evaluated — Refused Care' },
  { value: 'PATIENT_REFUSED_EVALUATION_CARE', label: 'Refused Evaluation & Care' },
  { value: 'PATIENT_SUPPORT_SERVICES_PROVIDED', label: 'Support Services Provided' },
  { value: 'PATIENT_DEAD_ON_ARRIVAL', label: 'Dead on Arrival' },
];

function emptyEntry(type) {
  return {
    person_type: type, // CIVILIAN or FIREFIGHTER
    gender: '',
    race: '',
    birth_month_year: '',
    rank: '',
    years_of_service: '',
    has_casualty: false,
    casualty_type: '', // INJURY or NON_INJURY
    patient_care: '',
    has_rescue: false,
    mayday: null,
    presence_known: null,
  };
}

export default function CasualtyRescues({ expanded, onToggle }) {
  const { incident, saveFields, saving } = useNeris();

  // Load existing per-person entries from JSONB arrays
  const initEntries = () => {
    const entries = [];
    const ff = incident?.neris_rescue_ff;
    const nonff = incident?.neris_rescue_nonff;
    if (Array.isArray(ff)) {
      ff.forEach(e => entries.push({ ...emptyEntry('FIREFIGHTER'), ...e, person_type: 'FIREFIGHTER' }));
    }
    if (Array.isArray(nonff)) {
      nonff.forEach(e => entries.push({ ...emptyEntry('CIVILIAN'), ...e, person_type: 'CIVILIAN' }));
    }
    return entries;
  };

  const [entries, setEntries] = useState(initEntries);
  const [animalRescues, setAnimalRescues] = useState(incident?.neris_rescue_animal ?? 0);
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  const addEntry = (type) => {
    setEntries(prev => [...prev, emptyEntry(type)]);
    mark();
  };

  const updateEntry = (idx, field, value) => {
    setEntries(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
    mark();
  };

  const removeEntry = (idx) => {
    setEntries(prev => prev.filter((_, i) => i !== idx));
    mark();
  };

  const handleSave = async () => {
    // Split entries back into FF and civilian arrays
    const ff = entries.filter(e => e.person_type === 'FIREFIGHTER');
    const nonff = entries.filter(e => e.person_type === 'CIVILIAN');

    const ok = await saveFields({
      neris_rescue_ff: ff.length > 0 ? ff : [],
      neris_rescue_nonff: nonff.length > 0 ? nonff : [],
      neris_rescue_animal: animalRescues,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const selectStyle = { padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' };
  const labelStyle = { fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' };
  const cardStyle = { padding: '0.5rem', marginBottom: '0.35rem', borderRadius: '4px', border: '1px solid #e5e7eb' };
  const removeBtn = { background: '#fecaca', border: '1px solid #fca5a5', borderRadius: '4px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#991b1b', cursor: 'pointer' };

  const ffEntries = entries.filter(e => e.person_type === 'FIREFIGHTER');
  const civEntries = entries.filter(e => e.person_type === 'CIVILIAN');

  return (
    <PayloadSection title="NERIS Casualty & Rescue (mod_casualty_rescue)" expanded={expanded} onToggle={onToggle}>
      <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.5rem', fontStyle: 'italic' }}>
        NERIS: "Think Numbers NOT Names" — record demographics only, no PII.
      </div>

      {/* Animal rescues — stays as count in base node */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={labelStyle}>Animal Rescues (count)</label>
        <input type="number" min="0" value={animalRescues}
          onChange={(e) => { setAnimalRescues(parseInt(e.target.value) || 0); mark(); }}
          style={{ width: '80px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
      </div>

      {/* Firefighter entries */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
          Firefighter Casualties / Rescues ({ffEntries.length})
        </div>
        {entries.map((entry, idx) => entry.person_type === 'FIREFIGHTER' ? (
          <PersonCard key={idx} entry={entry} idx={idx} isFF={true}
            updateEntry={updateEntry} removeEntry={removeEntry}
            selectStyle={selectStyle} labelStyle={labelStyle} cardStyle={cardStyle} removeBtn={removeBtn} />
        ) : null)}
        <button type="button" onClick={() => addEntry('FIREFIGHTER')}
          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', border: '1px dashed #d1d5db', borderRadius: '4px', background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
          + Add Firefighter
        </button>
      </div>

      {/* Civilian entries */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
          Civilian Casualties / Rescues ({civEntries.length})
        </div>
        {entries.map((entry, idx) => entry.person_type === 'CIVILIAN' ? (
          <PersonCard key={idx} entry={entry} idx={idx} isFF={false}
            updateEntry={updateEntry} removeEntry={removeEntry}
            selectStyle={selectStyle} labelStyle={labelStyle} cardStyle={cardStyle} removeBtn={removeBtn} />
        ) : null)}
        <button type="button" onClick={() => addEntry('CIVILIAN')}
          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', border: '1px dashed #d1d5db', borderRadius: '4px', background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
          + Add Civilian
        </button>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
        <button onClick={handleSave} disabled={!dirty || saving}
          style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontWeight: 500, background: dirty ? '#2563eb' : '#e5e7eb', color: dirty ? '#fff' : '#9ca3af', border: 'none', borderRadius: '5px', cursor: dirty ? 'pointer' : 'default' }}>
          {saving ? 'Saving...' : saveOk ? '✓ Saved' : 'Save Casualty & Rescue'}
        </button>
        {dirty && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>Unsaved changes</span>}
      </div>
    </PayloadSection>
  );
}

function PersonCard({ entry, idx, isFF, updateEntry, removeEntry, selectStyle, labelStyle, cardStyle, removeBtn }) {
  const bgColor = isFF ? '#eff6ff' : '#f9fafb';

  return (
    <div style={{ ...cardStyle, background: bgColor }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isFF ? '#1d4ed8' : '#374151' }}>
          {isFF ? 'Firefighter' : 'Civilian'} #{idx + 1}
        </span>
        <button type="button" onClick={() => removeEntry(idx)} style={removeBtn}>×</button>
      </div>

      {/* Demographics row */}
      <div style={{ display: 'grid', gridTemplateColumns: isFF ? 'repeat(5, 1fr)' : 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.35rem' }}>
        <div>
          <label style={labelStyle}>Gender</label>
          <select value={entry.gender || ''} onChange={(e) => updateEntry(idx, 'gender', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
            <option value="">--</option>
            {GENDERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Race</label>
          <select value={entry.race || ''} onChange={(e) => updateEntry(idx, 'race', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
            <option value="">--</option>
            {RACES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Birth Mo/Yr</label>
          <input type="text" value={entry.birth_month_year || ''}
            onChange={(e) => updateEntry(idx, 'birth_month_year', e.target.value || null)}
            style={{ ...selectStyle, width: '100%' }} />
        </div>
        {isFF && (
          <>
            <div>
              <label style={labelStyle}>Rank</label>
              <input type="text" value={entry.rank || ''}
                onChange={(e) => updateEntry(idx, 'rank', e.target.value || null)}
                style={{ ...selectStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Yrs of Service</label>
              <input type="number" min="0" value={entry.years_of_service ?? ''}
                onChange={(e) => updateEntry(idx, 'years_of_service', e.target.value ? parseInt(e.target.value) : null)}
                style={{ ...selectStyle, width: '80px' }} />
            </div>
          </>
        )}
      </div>

      {/* Casualty / Rescue toggles */}
      <div style={{ display: 'flex', gap: '1.5rem', paddingTop: '0.35rem', borderTop: '1px solid #e5e7eb' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={entry.has_casualty || false}
            onChange={(e) => updateEntry(idx, 'has_casualty', e.target.checked)} />
          Casualty
        </label>
        {entry.has_casualty && (
          <select value={entry.patient_care || ''} onChange={(e) => updateEntry(idx, 'patient_care', e.target.value || null)}
            style={{ ...selectStyle, minWidth: '200px' }}>
            <option value="">Patient care...</option>
            {PATIENT_CARE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={entry.has_rescue || false}
            onChange={(e) => updateEntry(idx, 'has_rescue', e.target.checked)} />
          Rescue
        </label>
        {entry.has_rescue && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={entry.mayday || false}
                onChange={(e) => updateEntry(idx, 'mayday', e.target.checked)} />
              Mayday
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={entry.presence_known || false}
                onChange={(e) => updateEntry(idx, 'presence_known', e.target.checked)} />
              Presence Known
            </label>
          </>
        )}
      </div>
    </div>
  );
}
