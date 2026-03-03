import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';
import { formatLabel, formatNerisCode } from '../shared/nerisUtils';

export default function FireDetail({ expanded, onToggle }) {
  const { incident, preview, dropdowns, saveFields, saving } = useNeris();
  const payload = preview?.payload;

  // Only show if fire types present
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
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

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
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const selectStyle = { width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' };
  const labelStyle = { fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' };

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
