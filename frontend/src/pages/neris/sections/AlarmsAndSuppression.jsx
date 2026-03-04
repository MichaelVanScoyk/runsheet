import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection } from '../shared/NerisComponents';

export default function AlarmsAndSuppression({ expanded, onToggle }) {
  const { incident, dropdowns, saveFields, saving } = useNeris();

  const typeCodes = incident?.neris_incident_type_codes || [];
  const hasStructureFire = typeCodes.some(t => t && t.includes('STRUCTURE_FIRE'));
  const hasConfinedCooking = typeCodes.some(t => t && t.includes('CONFINED_COOKING'));

  if (!hasStructureFire && !hasConfinedCooking) return null;

  const rrPresenceCodes = dropdowns.type_rr_presence || [];
  const smokeAlarmTypeCodes = dropdowns.type_alarm_smoke || [];
  const fireAlarmTypeCodes = dropdowns.type_alarm_fire || [];
  const otherAlarmTypeCodes = dropdowns.type_alarm_other || [];
  const alarmOperationCodes = dropdowns.type_alarm_operation || [];
  const alarmFailureCodes = dropdowns.type_alarm_failure || [];
  const sprinklerTypeCodes = dropdowns.type_suppress_fire || [];
  const sprinklerOperationCodes = dropdowns.type_suppress_operation || [];
  const cookingSuppressionCodes = dropdowns.type_suppress_cooking || [];
  const fullPartialCodes = dropdowns.type_full_partial || [];

  const [rr, setRr] = useState(incident?.neris_risk_reduction || {});
  const [otherAlarm, setOtherAlarm] = useState(incident?.neris_rr_other_alarm || '');
  const [smokeType, setSmokeType] = useState(incident?.neris_rr_smoke_alarm_type || []);
  const [smokeWorking, setSmokeWorking] = useState(incident?.neris_rr_smoke_alarm_working);
  const [smokeOperation, setSmokeOperation] = useState(incident?.neris_rr_smoke_alarm_operation || '');
  const [smokeFailure, setSmokeFailure] = useState(incident?.neris_rr_smoke_alarm_failure || '');
  const [smokePostAction, setSmokePostAction] = useState(incident?.neris_rr_smoke_alarm_post_action || '');
  const [fireAlarmType, setFireAlarmType] = useState(incident?.neris_rr_fire_alarm_type || []);
  const [fireAlarmOp, setFireAlarmOp] = useState(incident?.neris_rr_fire_alarm_operation || '');
  const [otherAlarmType, setOtherAlarmType] = useState(incident?.neris_rr_other_alarm_type || []);
  const [sprinklerType, setSprinklerType] = useState(incident?.neris_rr_sprinkler_type || []);
  const [sprinklerCoverage, setSprinklerCoverage] = useState(incident?.neris_rr_sprinkler_coverage || '');
  const [sprinklerOp, setSprinklerOp] = useState(incident?.neris_rr_sprinkler_operation || '');
  const [sprinklerHeads, setSprinklerHeads] = useState(incident?.neris_rr_sprinkler_heads_activated ?? '');
  const [sprinklerFailure, setSprinklerFailure] = useState(incident?.neris_rr_sprinkler_failure || '');
  const [cookingSuppression, setCookingSuppression] = useState(incident?.neris_rr_cooking_suppression || '');
  const [cookingType, setCookingType] = useState(incident?.neris_rr_cooking_suppression_type || []);
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  const updateRr = (key, val) => {
    setRr(prev => ({ ...prev, [key]: val || null }));
    mark();
  };

  const handleSave = async () => {
    const ok = await saveFields({
      neris_risk_reduction: Object.keys(rr).length > 0 ? rr : null,
      neris_rr_other_alarm: otherAlarm || null,
      neris_rr_smoke_alarm_type: smokeType,
      neris_rr_smoke_alarm_working: smokeWorking,
      neris_rr_smoke_alarm_operation: smokeOperation || null,
      neris_rr_smoke_alarm_failure: smokeFailure || null,
      neris_rr_smoke_alarm_post_action: smokePostAction || null,
      neris_rr_fire_alarm_type: fireAlarmType,
      neris_rr_fire_alarm_operation: fireAlarmOp || null,
      neris_rr_other_alarm_type: otherAlarmType,
      neris_rr_sprinkler_type: sprinklerType,
      neris_rr_sprinkler_coverage: sprinklerCoverage || null,
      neris_rr_sprinkler_operation: sprinklerOp || null,
      neris_rr_sprinkler_heads_activated: sprinklerHeads !== '' ? parseInt(sprinklerHeads) : null,
      neris_rr_sprinkler_failure: sprinklerFailure || null,
      neris_rr_cooking_suppression: cookingSuppression || null,
      neris_rr_cooking_suppression_type: cookingType,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const selectStyle = { width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' };
  const labelStyle = { fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' };
  const multiStyle = { ...selectStyle, minHeight: '60px' };

  const handleMultiChange = (setter) => (e) => {
    setter(Array.from(e.target.selectedOptions, opt => opt.value));
    mark();
  };

  return (
    <PayloadSection title="NERIS Risk Reduction — Alarms & Suppression" expanded={expanded} onToggle={onToggle}>
      {/* Presence row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {[
          { key: 'smoke_alarm_presence', label: 'Smoke Alarm' },
          { key: 'fire_alarm_presence', label: 'Fire Alarm' },
          { key: 'fire_suppression_presence', label: 'Sprinklers' },
        ].map(({ key, label }) => (
          <div key={key}>
            <label style={labelStyle}>{label}</label>
            <select value={rr[key] || ''} onChange={(e) => updateRr(key, e.target.value)} style={selectStyle}>
              <option value="">--</option>
              {rrPresenceCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label style={labelStyle}>Other Alarm</label>
          <select value={otherAlarm} onChange={(e) => { setOtherAlarm(e.target.value); mark(); }} style={selectStyle}>
            <option value="">--</option>
            {rrPresenceCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
          </select>
        </div>
      </div>

      {/* Smoke Alarm Details */}
      {rr.smoke_alarm_presence === 'PRESENT' && (
        <DetailBlock title="Smoke Alarm Details">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
            <div>
              <label style={labelStyle}>Type(s)</label>
              <select multiple value={smokeType} onChange={handleMultiChange(setSmokeType)} style={multiStyle}>
                {smokeAlarmTypeCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Working?</label>
              <select value={smokeWorking === null ? '' : String(smokeWorking)} onChange={(e) => { setSmokeWorking(e.target.value === '' ? null : e.target.value === 'true'); mark(); }} style={selectStyle}>
                <option value="">--</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Operation</label>
              <select value={smokeOperation} onChange={(e) => { setSmokeOperation(e.target.value); mark(); }} style={selectStyle}>
                <option value="">--</option>
                {alarmOperationCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Post-Alarm Action</label>
              <select value={smokePostAction} onChange={(e) => { setSmokePostAction(e.target.value); mark(); }} style={selectStyle}>
                <option value="">--</option>
                <option value="EVACUATED">Evacuated</option>
                <option value="ATTEMPTED_EXTINGUISHMENT">Attempted Extinguishment</option>
                <option value="NOTIFIED_OTHERS">Notified Others</option>
                <option value="CALLED_911">Called 911</option>
                <option value="NO_ACTION">No Action</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Failure Reason</label>
              <select value={smokeFailure} onChange={(e) => { setSmokeFailure(e.target.value); mark(); }} style={selectStyle}>
                <option value="">--</option>
                {alarmFailureCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>
          </div>
        </DetailBlock>
      )}

      {/* Fire Alarm Details */}
      {rr.fire_alarm_presence === 'PRESENT' && (
        <DetailBlock title="Fire Alarm Details">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            <div>
              <label style={labelStyle}>Type(s)</label>
              <select multiple value={fireAlarmType} onChange={handleMultiChange(setFireAlarmType)} style={multiStyle}>
                {fireAlarmTypeCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Operation</label>
              <select value={fireAlarmOp} onChange={(e) => { setFireAlarmOp(e.target.value); mark(); }} style={selectStyle}>
                <option value="">--</option>
                {alarmOperationCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>
          </div>
        </DetailBlock>
      )}

      {/* Other Alarm Details */}
      {otherAlarm === 'PRESENT' && (
        <DetailBlock title="Other Alarm Details">
          <div>
            <label style={labelStyle}>Type(s)</label>
            <select multiple value={otherAlarmType} onChange={handleMultiChange(setOtherAlarmType)} style={multiStyle}>
              {otherAlarmTypeCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
            </select>
          </div>
        </DetailBlock>
      )}

      {/* Sprinkler Details */}
      {rr.fire_suppression_presence === 'PRESENT' && (
        <DetailBlock title="Sprinkler Details">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
            <div>
              <label style={labelStyle}>Type(s)</label>
              <select multiple value={sprinklerType} onChange={handleMultiChange(setSprinklerType)} style={multiStyle}>
                {sprinklerTypeCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Coverage</label>
              <select value={sprinklerCoverage} onChange={(e) => { setSprinklerCoverage(e.target.value); mark(); }} style={selectStyle}>
                <option value="">--</option>
                {fullPartialCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Operation</label>
              <select value={sprinklerOp} onChange={(e) => { setSprinklerOp(e.target.value); mark(); }} style={selectStyle}>
                <option value="">--</option>
                {sprinklerOperationCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Heads Activated</label>
              <input type="number" min="0" value={sprinklerHeads} onChange={(e) => { setSprinklerHeads(e.target.value); mark(); }}
                style={{ width: '80px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
            </div>
            <div>
              <label style={labelStyle}>Failure</label>
              <select value={sprinklerFailure} onChange={(e) => { setSprinklerFailure(e.target.value); mark(); }} style={selectStyle}>
                <option value="">--</option>
                {alarmFailureCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>
          </div>
        </DetailBlock>
      )}

      {/* Cooking Suppression */}
      {hasConfinedCooking && (
        <DetailBlock title="Cooking Fire Suppression">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
            <div>
              <label style={labelStyle}>Presence</label>
              <select value={cookingSuppression} onChange={(e) => { setCookingSuppression(e.target.value); mark(); }} style={selectStyle}>
                <option value="">--</option>
                {rrPresenceCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
              </select>
            </div>
            {cookingSuppression === 'PRESENT' && (
              <div>
                <label style={labelStyle}>Type(s)</label>
                <select multiple value={cookingType} onChange={handleMultiChange(setCookingType)} style={multiStyle}>
                  {cookingSuppressionCodes.map(c => <option key={c.value} value={c.value}>{c.description || c.value}</option>)}
                </select>
              </div>
            )}
          </div>
        </DetailBlock>
      )}

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
          {saving ? 'Saving...' : saveOk ? '✓ Saved' : 'Save Alarms & Suppression'}
        </button>
        {dirty && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>Unsaved changes</span>}
      </div>
    </PayloadSection>
  );
}

function DetailBlock({ title, children }) {
  return (
    <div style={{ marginBottom: '0.5rem', padding: '0.5rem', background: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>{title}</div>
      {children}
    </div>
  );
}
