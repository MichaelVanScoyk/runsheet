import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection } from '../shared/NerisComponents';

export default function CasualtyRescues({ expanded, onToggle }) {
  const { incident, saveFields, saving } = useNeris();

  const [ffRescues, setFfRescues] = useState(incident?.neris_rescue_ff ?? 0);
  const [nonffRescues, setNonffRescues] = useState(incident?.neris_rescue_nonff ?? 0);
  const [animalRescues, setAnimalRescues] = useState(incident?.neris_rescue_animal ?? 0);
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  const handleSave = async () => {
    const ok = await saveFields({
      neris_rescue_ff: ffRescues,
      neris_rescue_nonff: nonffRescues,
      neris_rescue_animal: animalRescues,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const labelStyle = { fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' };
  const inputStyle = { width: '80px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' };

  return (
    <PayloadSection title="NERIS Casualty & Rescue (mod_casualty_rescue)" expanded={expanded} onToggle={onToggle}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem 1rem', marginBottom: '0.5rem' }}>
        <div>
          <label style={labelStyle}>Firefighter Rescues</label>
          <input type="number" min="0" value={ffRescues} onChange={(e) => { setFfRescues(parseInt(e.target.value) || 0); mark(); }} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Civilian Rescues</label>
          <input type="number" min="0" value={nonffRescues} onChange={(e) => { setNonffRescues(parseInt(e.target.value) || 0); mark(); }} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Animal Rescues</label>
          <input type="number" min="0" value={animalRescues} onChange={(e) => { setAnimalRescues(parseInt(e.target.value) || 0); mark(); }} style={inputStyle} />
        </div>
      </div>

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
