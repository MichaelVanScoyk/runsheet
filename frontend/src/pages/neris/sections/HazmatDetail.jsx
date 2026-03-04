import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection } from '../shared/NerisComponents';

const PHYSICAL_STATES = [
  { value: 'SOLID', label: 'Solid' },
  { value: 'LIQUID', label: 'Liquid' },
  { value: 'GAS', label: 'Gas' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const RELEASE_CAUSES = [
  { value: 'EQUIPMENT_FAILURE', label: 'Equipment Failure' },
  { value: 'HUMAN_ERROR', label: 'Human Error' },
  { value: 'TRANSPORTATION_ACCIDENT', label: 'Transportation Accident' },
  { value: 'INTENTIONAL', label: 'Intentional' },
  { value: 'NATURAL_PHENOMENON', label: 'Natural Phenomenon' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const RELEASE_INTO = [
  { value: 'AIR', label: 'Air' },
  { value: 'GROUND', label: 'Ground' },
  { value: 'WATER', label: 'Water' },
  { value: 'STRUCTURE', label: 'Structure' },
  { value: 'MULTIPLE', label: 'Multiple' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const AMOUNT_UNITS = [
  { value: 'GALLONS', label: 'Gallons' },
  { value: 'LITERS', label: 'Liters' },
  { value: 'POUNDS', label: 'Pounds' },
  { value: 'KILOGRAMS', label: 'Kilograms' },
  { value: 'CUBIC_FEET', label: 'Cubic Feet' },
  { value: 'CUBIC_METERS', label: 'Cubic Meters' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

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

  const updateRelease = (idx, field, value) => {
    setChemicals(prev => {
      const updated = [...prev];
      const release = updated[idx].release || {};
      updated[idx] = { ...updated[idx], release: { ...release, [field]: value } };
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
          <div key={idx} style={{ padding: '0.5rem', marginBottom: '0.35rem', background: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <select value={chem.dot_class || ''} onChange={(e) => updateChemical(idx, 'dot_class', e.target.value || null)} style={{ ...selectStyle, minWidth: '150px' }}>
                <option value="">DOT Class...</option>
                {hazardDotCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
              <input type="text" value={chem.name || ''} onChange={(e) => updateChemical(idx, 'name', e.target.value)}
                style={{ flex: 1, minWidth: '150px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={chem.release_occurred || false} onChange={(e) => updateChemical(idx, 'release_occurred', e.target.checked)} />
                Released
              </label>
              <button type="button" onClick={() => removeChemical(idx)}
                style={{ background: '#fecaca', border: '1px solid #fca5a5', borderRadius: '4px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#991b1b', cursor: 'pointer' }}>×</button>
            </div>

            {/* Release detail — shown when release_occurred */}
            {chem.release_occurred && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px solid #e5e7eb' }}>
                <div>
                  <label style={labelStyle}>Physical State</label>
                  <select value={chem.release?.physical_state || ''} onChange={(e) => updateRelease(idx, 'physical_state', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
                    <option value="">--</option>
                    {PHYSICAL_STATES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Release Cause</label>
                  <select value={chem.release?.release_cause || ''} onChange={(e) => updateRelease(idx, 'release_cause', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
                    <option value="">--</option>
                    {RELEASE_CAUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Released Into</label>
                  <select value={chem.release?.release_into || ''} onChange={(e) => updateRelease(idx, 'release_into', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
                    <option value="">--</option>
                    {RELEASE_INTO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Amount Est.</label>
                  <input type="number" min="0" step="0.1" value={chem.release?.amount_est ?? ''}
                    onChange={(e) => updateRelease(idx, 'amount_est', e.target.value ? parseFloat(e.target.value) : null)}
                    style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                </div>
                <div>
                  <label style={labelStyle}>Amount Units</label>
                  <select value={chem.release?.amount_units || ''} onChange={(e) => updateRelease(idx, 'amount_units', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
                    <option value="">--</option>
                    {AMOUNT_UNITS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            )}
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
