import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection } from '../shared/NerisComponents';

const ELECTRIC_TYPES = [
  { value: 'EV_PASSENGER', label: 'EV — Passenger Vehicle' },
  { value: 'EV_COMMERCIAL', label: 'EV — Commercial Vehicle' },
  { value: 'EV_BUS', label: 'EV — Bus' },
  { value: 'EV_MICRO_MOBILITY', label: 'EV — Micro-Mobility (scooter, ebike)' },
  { value: 'ESS_RESIDENTIAL', label: 'ESS — Residential' },
  { value: 'ESS_COMMERCIAL', label: 'ESS — Commercial' },
  { value: 'ESS_UTILITY', label: 'ESS — Utility Scale' },
  { value: 'BATTERY_LITHIUM_ION', label: 'Battery — Lithium Ion' },
  { value: 'BATTERY_OTHER', label: 'Battery — Other' },
  { value: 'OTHER', label: 'Other' },
];

const SOURCE_TARGET = [
  { value: 'SOURCE', label: 'Source of Fire/Incident' },
  { value: 'TARGET', label: 'Target (damaged by fire)' },
];

const ELECTRIC_SUPPRESSION_TYPES = [
  { value: 'WATER', label: 'Water' },
  { value: 'FOAM', label: 'Foam' },
  { value: 'DRY_CHEMICAL', label: 'Dry Chemical' },
  { value: 'CO2', label: 'CO2' },
  { value: 'CLEAN_AGENT', label: 'Clean Agent' },
  { value: 'SAND_DIRT', label: 'Sand / Dirt' },
  { value: 'NONE', label: 'None Used' },
  { value: 'OTHER', label: 'Other' },
];

const PV_TYPES = [
  { value: 'ROOF_MOUNTED', label: 'Roof Mounted' },
  { value: 'GROUND_MOUNTED', label: 'Ground Mounted' },
  { value: 'BUILDING_INTEGRATED', label: 'Building Integrated' },
];

const POWERGEN_TYPES = [
  { value: 'SOLAR_PV', label: 'Solar PV' },
  { value: 'WIND', label: 'Wind' },
  { value: 'GENERATOR', label: 'Generator' },
  { value: 'FUEL_CELL', label: 'Fuel Cell' },
];

const PG_SOURCE_TARGET = [
  { value: 'SOURCE', label: 'Source' },
  { value: 'TARGET', label: 'Target' },
  { value: 'NOT_INVOLVED', label: 'Not Involved' },
];

export default function EmergingHazards({ expanded, onToggle }) {
  const { incident, saveFields, saving } = useNeris();

  // Electric hazards — array of entries
  const [electricHazards, setElectricHazards] = useState(
    incident?.neris_emerging_hazard?.electric_hazards || []
  );

  // Powergen hazards — array of entries
  const [powergenHazards, setPowergenHazards] = useState(
    incident?.neris_emerging_hazard?.powergen_hazards || []
  );

  // CSST — dedicated columns
  const [csstPresent, setCsstPresent] = useState(
    incident?.neris_emerging_hazard?.csst?.present || false
  );
  const [csstIgnition, setCsstIgnition] = useState(incident?.neris_csst_ignition_source ?? null);
  const [csstLightning, setCsstLightning] = useState(incident?.neris_csst_lightning_suspected || '');
  const [csstGrounded, setCsstGrounded] = useState(incident?.neris_csst_grounded || '');

  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  // Electric hazard helpers
  const addElectric = () => {
    setElectricHazards(prev => [...prev, { type: '', source_or_target: '', involved_in_crash: null }]);
    mark();
  };
  const updateElectric = (idx, field, value) => {
    setElectricHazards(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
    mark();
  };
  const updateElectricFire = (idx, field, value) => {
    setElectricHazards(prev => {
      const updated = [...prev];
      const fire = updated[idx].fire_details || {};
      updated[idx] = { ...updated[idx], fire_details: { ...fire, [field]: value } };
      return updated;
    });
    mark();
  };
  const removeElectric = (idx) => {
    setElectricHazards(prev => prev.filter((_, i) => i !== idx));
    mark();
  };

  // Powergen hazard helpers
  const addPowergen = () => {
    setPowergenHazards(prev => [...prev, { type: 'SOLAR_PV', source_or_target: '' }]);
    mark();
  };
  const updatePowergen = (idx, field, value) => {
    setPowergenHazards(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
    mark();
  };
  const removePowergen = (idx) => {
    setPowergenHazards(prev => prev.filter((_, i) => i !== idx));
    mark();
  };

  const handleSave = async () => {
    // Build the emerging_hazard JSONB (legacy structure + new arrays)
    const hazard = {};
    if (electricHazards.length > 0) hazard.electric_hazards = electricHazards;
    if (powergenHazards.length > 0) hazard.powergen_hazards = powergenHazards;
    if (csstPresent) hazard.csst = { present: true };

    // Legacy compat: keep ev_battery.present if electric hazards exist
    if (electricHazards.length > 0) hazard.ev_battery = { present: true };
    if (powergenHazards.length > 0) hazard.solar_pv = { present: true };

    const hasAny = electricHazards.length > 0 || powergenHazards.length > 0 || csstPresent;

    const ok = await saveFields({
      neris_emerging_hazard: hasAny ? hazard : null,
      neris_csst_ignition_source: csstPresent ? csstIgnition : null,
      neris_csst_lightning_suspected: csstPresent ? (csstLightning || null) : null,
      neris_csst_grounded: csstPresent ? (csstGrounded || null) : null,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const selectStyle = { padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' };
  const labelStyle = { fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' };
  const cardStyle = { padding: '0.5rem', marginBottom: '0.35rem', background: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb' };
  const removeBtn = { background: '#fecaca', border: '1px solid #fca5a5', borderRadius: '4px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#991b1b', cursor: 'pointer' };
  const addBtn = { padding: '0.25rem 0.6rem', fontSize: '0.75rem', border: '1px dashed #d1d5db', borderRadius: '4px', background: '#fff', color: '#6b7280', cursor: 'pointer' };

  return (
    <PayloadSection title="NERIS Emerging Hazards" expanded={expanded} onToggle={onToggle}>
      {/* Electric Hazards */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
          EV / Battery / ESS Hazards
        </div>
        {electricHazards.map((eh, idx) => (
          <div key={idx} style={cardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '0.5rem', alignItems: 'end' }}>
              <div>
                <label style={labelStyle}>Type</label>
                <select value={eh.type || ''} onChange={(e) => updateElectric(idx, 'type', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
                  <option value="">Select type...</option>
                  {ELECTRIC_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Source / Target</label>
                <select value={eh.source_or_target || ''} onChange={(e) => updateElectric(idx, 'source_or_target', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
                  <option value="">--</option>
                  {SOURCE_TARGET.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer', paddingBottom: '4px' }}>
                <input type="checkbox" checked={eh.involved_in_crash || false}
                  onChange={(e) => updateElectric(idx, 'involved_in_crash', e.target.checked)} />
                Crash
              </label>
              <button type="button" onClick={() => removeElectric(idx)} style={removeBtn}>×</button>
            </div>
            {/* Fire details sub-object */}
            <div style={{ marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={eh.fire_details?.reignition || false}
                    onChange={(e) => updateElectricFire(idx, 'reignition', e.target.checked)} />
                  Reignition
                </label>
              </div>
              <div>
                <label style={labelStyle}>Suppression Types Used</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {ELECTRIC_SUPPRESSION_TYPES.map(st => {
                    const types = eh.fire_details?.suppression_types || [];
                    return (
                      <label key={st.value} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#374151', cursor: 'pointer' }}>
                        <input type="checkbox" checked={types.includes(st.value)}
                          onChange={(e) => {
                            const cur = eh.fire_details?.suppression_types || [];
                            const next = e.target.checked ? [...cur, st.value] : cur.filter(v => v !== st.value);
                            updateElectricFire(idx, 'suppression_types', next);
                          }} />
                        {st.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={addElectric} style={addBtn}>+ Add Electric Hazard</button>
      </div>

      {/* Powergen Hazards */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
          Power Generation Hazards
        </div>
        {powergenHazards.map((pg, idx) => (
          <div key={idx} style={cardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
              <div>
                <label style={labelStyle}>Type</label>
                <select value={pg.type || ''} onChange={(e) => updatePowergen(idx, 'type', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
                  {POWERGEN_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {pg.type === 'SOLAR_PV' && (
                <div>
                  <label style={labelStyle}>PV Type</label>
                  <select value={pg.pv_type || ''} onChange={(e) => updatePowergen(idx, 'pv_type', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
                    <option value="">--</option>
                    {PV_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={labelStyle}>Source / Target</label>
                <select value={pg.source_or_target || ''} onChange={(e) => updatePowergen(idx, 'source_or_target', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
                  <option value="">--</option>
                  {PG_SOURCE_TARGET.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => removePowergen(idx)} style={removeBtn}>×</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addPowergen} style={addBtn}>+ Add Powergen Hazard</button>
      </div>

      {/* CSST */}
      <div style={{ padding: '0.5rem', marginBottom: '0.5rem', background: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={csstPresent}
            onChange={(e) => { setCsstPresent(e.target.checked); mark(); }} />
          CSST Gas Lines Present
        </label>
        {csstPresent && (
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
              <select value={csstLightning} onChange={(e) => { setCsstLightning(e.target.value); mark(); }} style={{ ...selectStyle, width: '100%' }}>
                <option value="">--</option>
                <option value="YES">Yes</option>
                <option value="NO">No</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Grounded?</label>
              <select value={csstGrounded} onChange={(e) => { setCsstGrounded(e.target.value); mark(); }} style={{ ...selectStyle, width: '100%' }}>
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
