import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection } from '../shared/NerisComponents';

export default function EmergingHazards({ expanded, onToggle }) {
  const { incident, dropdowns, saveFields, saving } = useNeris();

  const emergHazElecCodes = dropdowns.type_emerghaz_elec || [];
  const emergHazPvIgnCodes = dropdowns.type_emerghaz_pv_ign || [];

  const [hazard, setHazard] = useState(incident?.neris_emerging_hazard || {});
  const [csstIgnition, setCsstIgnition] = useState(incident?.neris_csst_ignition_source ?? null);
  const [csstLightning, setCsstLightning] = useState(incident?.neris_csst_lightning_suspected || '');
  const [csstGrounded, setCsstGrounded] = useState(incident?.neris_csst_grounded || '');
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  const updateNested = (section, field, value) => {
    setHazard(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value }
    }));
    mark();
  };

  const handleSave = async () => {
    const hasAny = hazard.ev_battery?.present || hazard.solar_pv?.present || hazard.csst?.present;
    const ok = await saveFields({
      neris_emerging_hazard: hasAny ? hazard : null,
      neris_csst_ignition_source: csstIgnition,
      neris_csst_lightning_suspected: csstLightning || null,
      neris_csst_grounded: csstGrounded || null,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const selectStyle = { padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px', minWidth: '150px' };
  const labelStyle = { fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' };

  return (
    <PayloadSection title="NERIS Emerging Hazards" expanded={expanded} onToggle={onToggle}>
      {/* EV/Battery */}
      <div style={{ padding: '0.5rem', marginBottom: '0.5rem', background: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={hazard.ev_battery?.present || false}
            onChange={(e) => updateNested('ev_battery', 'present', e.target.checked)} />
          EV / Battery Storage
        </label>
        {hazard.ev_battery?.present && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px solid #e5e7eb' }}>
            <select value={hazard.ev_battery?.type || ''} onChange={(e) => updateNested('ev_battery', 'type', e.target.value || null)} style={selectStyle}>
              <option value="">Select type...</option>
              {emergHazElecCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={hazard.ev_battery?.crash || false}
                onChange={(e) => updateNested('ev_battery', 'crash', e.target.checked)} />
              Vehicle Crash
            </label>
          </div>
        )}
      </div>

      {/* Solar PV */}
      <div style={{ padding: '0.5rem', marginBottom: '0.5rem', background: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={hazard.solar_pv?.present || false}
            onChange={(e) => updateNested('solar_pv', 'present', e.target.checked)} />
          Solar PV System
        </label>
        {hazard.solar_pv?.present && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px solid #e5e7eb' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={hazard.solar_pv?.energized || false}
                onChange={(e) => updateNested('solar_pv', 'energized', e.target.checked)} />
              Remained Energized
            </label>
            <select value={hazard.solar_pv?.ignition || ''} onChange={(e) => updateNested('solar_pv', 'ignition', e.target.value || null)} style={selectStyle}>
              <option value="">Ignition source?</option>
              {emergHazPvIgnCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* CSST */}
      <div style={{ padding: '0.5rem', marginBottom: '0.5rem', background: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={hazard.csst?.present || false}
            onChange={(e) => updateNested('csst', 'present', e.target.checked)} />
          CSST Gas Lines
        </label>
        {hazard.csst?.present && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px solid #e5e7eb' }}>
            <div>
              <label style={labelStyle}>Ignition Source?</label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {[{ val: true, lbl: 'Yes' }, { val: false, lbl: 'No' }, { val: null, lbl: 'Unknown' }].map(opt => (
                  <label key={String(opt.val)} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#374151', cursor: 'pointer' }}>
                    <input type="radio" name="csst_ignition" checked={csstIgnition === opt.val}
                      onChange={() => { setCsstIgnition(opt.val); mark(); }} />
                    {opt.lbl}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Lightning Suspected?</label>
              <select value={csstLightning} onChange={(e) => { setCsstLightning(e.target.value); mark(); }} style={selectStyle}>
                <option value="">--</option>
                <option value="YES">Yes</option>
                <option value="NO">No</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Grounded?</label>
              <select value={csstGrounded} onChange={(e) => { setCsstGrounded(e.target.value); mark(); }} style={selectStyle}>
                <option value="">--</option>
                <option value="YES">Yes</option>
                <option value="NO">No</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
        <button onClick={handleSave} disabled={!dirty || saving}
          style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontWeight: 500, background: dirty ? '#2563eb' : '#e5e7eb', color: dirty ? '#fff' : '#9ca3af', border: 'none', borderRadius: '5px', cursor: dirty ? 'pointer' : 'default' }}>
          {saving ? 'Saving...' : saveOk ? '✓ Saved' : 'Save Emerging Hazards'}
        </button>
        {dirty && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>Unsaved changes</span>}
      </div>
    </PayloadSection>
  );
}
