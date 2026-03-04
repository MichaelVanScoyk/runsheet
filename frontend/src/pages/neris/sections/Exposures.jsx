import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection } from '../shared/NerisComponents';

export default function Exposures({ expanded, onToggle }) {
  const { incident, dropdowns, saveFields, saving } = useNeris();

  // Per NERIS: exposures are for "when fire spread to other properties"
  // Show for any FIRE type, not just structure fire
  const typeCodes = incident?.neris_incident_type_codes || [];
  const hasFireType = typeCodes.some(t => t && t.startsWith('FIRE'));

  if (!hasFireType) return null;

  const exposureLocCodes = dropdowns.type_exposure_loc || [];
  const exposureItemCodes = dropdowns.type_exposure_item || [];

  const [exposures, setExposures] = useState(incident?.neris_exposures || []);
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  const updateExposure = (idx, field, value) => {
    setExposures(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
    mark();
  };

  const addExposure = () => {
    setExposures(prev => [...prev, {}]);
    mark();
  };

  const removeExposure = (idx) => {
    setExposures(prev => prev.filter((_, i) => i !== idx));
    mark();
  };

  const handleSave = async () => {
    const ok = await saveFields({ neris_exposures: exposures });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const selectStyle = { padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' };

  return (
    <PayloadSection title="NERIS Exposures" expanded={expanded} onToggle={onToggle} badge={exposures.length}>
      {exposures.map((exp, idx) => (
        <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', padding: '0.35rem', marginBottom: '0.35rem', background: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
          <select value={exp.exposure_type || ''} onChange={(e) => updateExposure(idx, 'exposure_type', e.target.value || null)} style={{ ...selectStyle, minWidth: '120px', flex: 1 }}>
            <option value="">Location...</option>
            {exposureLocCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
          </select>
          <select value={exp.exposure_item || ''} onChange={(e) => updateExposure(idx, 'exposure_item', e.target.value || null)} style={{ ...selectStyle, minWidth: '120px', flex: 1 }}>
            <option value="">Item...</option>
            {exposureItemCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
          </select>
          <input type="text" placeholder="Address" value={exp.address || ''} onChange={(e) => updateExposure(idx, 'address', e.target.value)}
            style={{ flex: 1, minWidth: '120px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
          <button type="button" onClick={() => removeExposure(idx)}
            style={{ background: '#fecaca', border: '1px solid #fca5a5', borderRadius: '4px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#991b1b', cursor: 'pointer' }}>×</button>
        </div>
      ))}
      <button type="button" onClick={addExposure}
        style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', border: '1px dashed #d1d5db', borderRadius: '4px', background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
        + Add Exposure
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
        <button onClick={handleSave} disabled={!dirty || saving}
          style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontWeight: 500, background: dirty ? '#2563eb' : '#e5e7eb', color: dirty ? '#fff' : '#9ca3af', border: 'none', borderRadius: '5px', cursor: dirty ? 'pointer' : 'default' }}>
          {saving ? 'Saving...' : saveOk ? '✓ Saved' : 'Save Exposures'}
        </button>
        {dirty && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>Unsaved changes</span>}
      </div>
    </PayloadSection>
  );
}
