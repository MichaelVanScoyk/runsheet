import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';

const WATER_SUPPLY_OPTIONS = [
  { value: 'HYDRANT_LESS_500', label: 'Hydrant < 500ft' },
  { value: 'HYDRANT_GREATER_500', label: 'Hydrant > 500ft' },
  { value: 'TANK_WATER', label: 'Tank Water' },
  { value: 'WATER_TENDER_SHUTTLE', label: 'Water Tender Shuttle' },
  { value: 'DRAFT_FROM_STATIC_SOURCE', label: 'Draft from Static Source' },
  { value: 'NURSE_OTHER_APPARATUS', label: 'Nurse Other Apparatus' },
  { value: 'SUPPLY_FROM_FIRE_BOAT', label: 'Supply from Fire Boat' },
  { value: 'FOAM_ADDITIVE', label: 'Foam Additive' },
  { value: 'NONE', label: 'None' },
];

const SUPPRESSION_APPLIANCES = [
  { value: 'SMALL_DIAMETER_FIRE_HOSE', label: 'Small Diameter Hose' },
  { value: 'MEDIUM_DIAMETER_FIRE_HOSE', label: 'Medium Diameter Hose' },
  { value: 'BOOSTER_FIRE_HOSE', label: 'Booster Hose' },
  { value: 'MASTER_STREAM', label: 'Master Stream' },
  { value: 'ELEVATED_MASTER_STREAM_STANDPIPE', label: 'Elevated Master Stream / Standpipe' },
  { value: 'GROUND_MONITOR', label: 'Ground Monitor' },
  { value: 'FIRE_EXTINGUISHER', label: 'Fire Extinguisher' },
  { value: 'BUILDING_FDC', label: 'Building FDC' },
  { value: 'BUILDING_STANDPIPE', label: 'Building Standpipe' },
  { value: 'AIRATTACK_HELITACK', label: 'Air Attack / Helitack' },
  { value: 'OTHER', label: 'Other' },
  { value: 'NONE', label: 'None' },
];

export default function FireDetail({ expanded, onToggle }) {
  const { incident, preview, dropdowns, saveFields, saving } = useNeris();
  const payload = preview?.payload;

  const typeCodes = incident?.neris_incident_type_codes || [];
  const hasFireType = typeCodes.some(t => t && t.startsWith('FIRE'));
  const hasStructureFire = typeCodes.some(t => t && t.includes('STRUCTURE_FIRE'));
  const hasOutsideFire = typeCodes.some(t => t && t.includes('OUTSIDE_FIRE'));

  const fireInvestNeedCodes = dropdowns.type_fire_invest_need || [];
  const fireConditionArrivalCodes = dropdowns.type_fire_condition_arrival || [];
  const fireBldgDamageCodes = dropdowns.type_fire_bldg_damage || [];
  const fireCauseInCodes = dropdowns.type_fire_cause_in || [];
  const fireCauseOutCodes = dropdowns.type_fire_cause_out || [];
  const roomCodes = dropdowns.type_room || [];

  const [investNeed, setInvestNeed] = useState(incident?.neris_fire_investigation_need || '');
  const [arrivalConditions, setArrivalConditions] = useState(incident?.neris_fire_arrival_conditions || '');
  const [structureDamage, setStructureDamage] = useState(incident?.neris_fire_structure_damage || '');
  const [structureFloor, setStructureFloor] = useState(incident?.neris_fire_structure_floor ?? '');
  const [structureRoom, setStructureRoom] = useState(incident?.neris_fire_structure_room || '');
  const [structureCause, setStructureCause] = useState(incident?.neris_fire_structure_cause || '');
  const [outsideCause, setOutsideCause] = useState(incident?.neris_fire_outside_cause || '');
  const [waterSupply, setWaterSupply] = useState(incident?.neris_fire_water_supply || '');
  const [suppressionAppliances, setSuppressionAppliances] = useState(incident?.neris_fire_suppression_appliances || []);
  const [progressionEvident, setProgressionEvident] = useState(incident?.neris_fire_progression_evident ?? null);
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

  if (!hasFireType) return null;

  const handleSave = async () => {
    const ok = await saveFields({
      neris_fire_investigation_need: investNeed || null,
      neris_fire_arrival_conditions: arrivalConditions || null,
      neris_fire_structure_damage: structureDamage || null,
      neris_fire_structure_floor: structureFloor !== '' ? parseInt(structureFloor) : null,
      neris_fire_structure_room: structureRoom || null,
      neris_fire_structure_cause: structureCause || null,
      neris_fire_outside_cause: outsideCause || null,
      neris_fire_water_supply: waterSupply || null,
      neris_fire_suppression_appliances: suppressionAppliances,
      neris_fire_progression_evident: progressionEvident,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const selectStyle = { width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' };
  const labelStyle = { fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' };
  const checkStyle = { display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#374151', cursor: 'pointer' };

  return (
    <PayloadSection title="NERIS Fire Detail (mod_fire)" expanded={expanded} onToggle={onToggle} color="#dc2626">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem 1rem' }}>
        <div>
          <label style={labelStyle}>Fire Investigation Needed? <span style={{ color: '#dc2626' }}>*</span></label>
          <select value={investNeed} onChange={(e) => { setInvestNeed(e.target.value); mark(); }} style={selectStyle}>
            <option value="">Select...</option>
            {fireInvestNeedCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Water Supply</label>
          <select value={waterSupply} onChange={(e) => { setWaterSupply(e.target.value); mark(); }} style={selectStyle}>
            <option value="">Select...</option>
            {WATER_SUPPLY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        {hasStructureFire && (
          <>
            <div>
              <label style={labelStyle}>Arrival Conditions <span style={{ color: '#dc2626' }}>*</span></label>
              <select value={arrivalConditions} onChange={(e) => { setArrivalConditions(e.target.value); mark(); }} style={selectStyle}>
                <option value="">Select...</option>
                {fireConditionArrivalCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Structure Damage <span style={{ color: '#dc2626' }}>*</span></label>
              <select value={structureDamage} onChange={(e) => { setStructureDamage(e.target.value); mark(); }} style={selectStyle}>
                <option value="">Select...</option>
                {fireBldgDamageCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Floor of Origin</label>
              <input
                type="number" min="0" value={structureFloor}
                onChange={(e) => { setStructureFloor(e.target.value); mark(); }}
                placeholder="Floor #"
                style={{ width: '80px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={labelStyle}>Room of Origin</label>
              <select value={structureRoom} onChange={(e) => { setStructureRoom(e.target.value); mark(); }} style={selectStyle}>
                <option value="">Select...</option>
                {roomCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Fire Cause (Structure)</label>
              <select value={structureCause} onChange={(e) => { setStructureCause(e.target.value); mark(); }} style={selectStyle}>
                <option value="">Select...</option>
                {fireCauseInCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Progression Evident on Arrival?</label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {[{ val: true, lbl: 'Yes' }, { val: false, lbl: 'No' }, { val: null, lbl: 'Unknown' }].map(opt => (
                  <label key={String(opt.val)} style={checkStyle}>
                    <input
                      type="radio"
                      name="progression_evident"
                      checked={progressionEvident === opt.val}
                      onChange={() => { setProgressionEvident(opt.val); mark(); }}
                    />
                    {opt.lbl}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {hasOutsideFire && (
          <div>
            <label style={labelStyle}>Fire Cause (Outside) <span style={{ color: '#dc2626' }}>*</span></label>
            <select value={outsideCause} onChange={(e) => { setOutsideCause(e.target.value); mark(); }} style={selectStyle}>
              <option value="">Select...</option>
              {fireCauseOutCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Suppression Appliances */}
      <div style={{ marginTop: '0.75rem' }}>
        <label style={labelStyle}>Suppression Appliances Used</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
          {SUPPRESSION_APPLIANCES.map(opt => (
            <label key={opt.value} style={checkStyle}>
              <input
                type="checkbox"
                checked={suppressionAppliances.includes(opt.value)}
                onChange={() => toggleArrayValue(suppressionAppliances, setSuppressionAppliances, opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
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
          {saving ? 'Saving...' : saveOk ? '✓ Saved' : 'Save Fire Detail'}
        </button>
        {dirty && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>Unsaved changes</span>}
      </div>
    </PayloadSection>
  );
}
