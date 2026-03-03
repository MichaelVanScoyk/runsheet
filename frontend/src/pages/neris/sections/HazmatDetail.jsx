import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection } from '../shared/NerisComponents';

export default function HazmatDetail({ expanded, onToggle }) {
  const { incident, dropdowns, saveFields, saving } = useNeris();

  const typeCodes = incident?.neris_incident_type_codes || [];
  const hasHazsitType = typeCodes.some(t => t && t.startsWith('HAZSIT'));

  if (!hasHazsitType) return null;

  const hazardDispositionCodes = dropdowns.type_hazard_disposition || [];
  const hazardDotCodes = dropdowns.type_hazard_dot || [];

  const [disposition, setDisposition] = useState(incident?.neris_hazmat_disposition || '');
  const [evacuated, setEvacuated] = useState(incident?.neris_hazmat_evacuated ?? 0);
  const [chemicals, setChemicals] = useState(incident?.neris_hazmat_chemicals || []);
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  const updateChemical = (idx, field, value) => {
    setChemicals(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
    mark();
  };

  const addChemical = () => {
    setChemicals(prev => [...prev, { dot_class: null, name: '', release_occurred: false }]);
    mark();
  };

  const removeChemical = (idx) => {
    setChemicals(prev => prev.filter((_, i) => i !== idx));
    mark();
  };

  const handleSave = async () => {
    const ok = await saveFields({
      neris_hazmat_disposition: disposition || null,
      neris_hazmat_evacuated: evacuated,
      neris_hazmat_chemicals: chemicals,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const selectStyle = { padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' };
  const labelStyle = { fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' };

  return (
    <PayloadSection title="NERIS Hazmat Detail (mod_hazsit)" expanded={expanded} onToggle={onToggle} color="#d97706">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem 1rem', marginBottom: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Hazmat Disposition <span style={{ color: '#dc2626' }}>*</span></label>
          <select value={disposition} onChange={(e) => { setDisposition(e.target.value); mark(); }} style={{ ...selectStyle, width: '100%' }}>
            <option value="">Select...</option>
            {hazardDispositionCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>People Evacuated <span style={{ color: '#dc2626' }}>*</span></label>
          <input type="number" min="0" value={evacuated} onChange={(e) => { setEvacuated(parseInt(e.target.value) || 0); mark(); }}
            style={{ width: '80px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
        </div>
      </div>

      {/* Chemicals */}
      <div style={{ marginBottom: '0.5rem' }}>
        <label style={labelStyle}>Chemicals Involved <span style={{ color: '#dc2626' }}>*</span></label>
        {chemicals.map((chem, idx) => (
          <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', padding: '0.35rem', marginBottom: '0.35rem', background: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
            <select value={chem.dot_class || ''} onChange={(e) => updateChemical(idx, 'dot_class', e.target.value || null)} style={{ ...selectStyle, minWidth: '150px' }}>
              <option value="">DOT Class...</option>
              {hazardDotCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
            </select>
            <input type="text" value={chem.name || ''} onChange={(e) => updateChemical(idx, 'name', e.target.value)} placeholder="Chemical name..."
              style={{ flex: 1, minWidth: '150px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={chem.release_occurred || false} onChange={(e) => updateChemical(idx, 'release_occurred', e.target.checked)} />
              Released
            </label>
            <button type="button" onClick={() => removeChemical(idx)}
              style={{ background: '#fecaca', border: '1px solid #fca5a5', borderRadius: '4px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#991b1b', cursor: 'pointer' }}>×</button>
          </div>
        ))}
        <button type="button" onClick={addChemical}
          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', border: '1px dashed #d1d5db', borderRadius: '4px', background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
          + Add Chemical
        </button>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontWeight: 500,
            background: dirty ? '#2563eb' : '#e5e7eb', color: dirty ? '#fff' : '#9ca3af',
            border: 'none', borderRadius: '5px', cursor: dirty ? 'pointer' : 'default'
          }}
        >
          {saving ? 'Saving...' : saveOk ? '✓ Saved' : 'Save Hazmat Detail'}
        </button>
        {dirty && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>Unsaved changes</span>}
      </div>
    </PayloadSection>
  );
}
