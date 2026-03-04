import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';
import { formatLabel, formatNerisCode } from '../shared/nerisUtils';
import HierarchicalCodePicker from '../shared/HierarchicalCodePicker';

const VACANCY_CAUSES = [
  { value: 'NEW_CONSTRUCTION_REMODEL', label: 'New Construction / Remodel' },
  { value: 'UNDER_RENOVATION', label: 'Under Renovation' },
  { value: 'CONDEMNED', label: 'Condemned' },
  { value: 'SEASONAL', label: 'Seasonal' },
  { value: 'FOR_SALE_RENT', label: 'For Sale / Rent' },
  { value: 'FORECLOSURE', label: 'Foreclosure' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

export default function LocationUse({ expanded, onToggle }) {
  const { incident, locationUses, saveFields, saving } = useNeris();

  const [locUse, setLocUse] = useState(incident?.neris_location_use || null);
  const [showModal, setShowModal] = useState(false);
  const [showSecondaryModal, setShowSecondaryModal] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  const updateLocUse = (field, value) => {
    setLocUse(prev => ({ ...(prev || {}), [field]: value }));
    mark();
  };

  const getLocationUseValue = () => {
    if (!locUse || !locUse.use_type) return '';
    return locUse.use_subtype ? `${locUse.use_type}: ${locUse.use_subtype}` : locUse.use_type;
  };

  const getSecondaryValue = () => {
    if (!locUse || !locUse.use_type_secondary) return '';
    return locUse.use_subtype_secondary
      ? `${locUse.use_type_secondary}: ${locUse.use_subtype_secondary}`
      : locUse.use_type_secondary;
  };

  const handleToggle = (valueString) => {
    const current = getLocationUseValue();
    if (current === valueString) {
      setLocUse(prev => ({ ...(prev || {}), use_type: null, use_subtype: null }));
      mark();
      return;
    }
    for (const catData of Object.values(locationUses)) {
      if (catData.subtypes) {
        const item = catData.subtypes.find(s => s.value === valueString);
        if (item) {
          setLocUse(prev => ({ ...(prev || {}), use_type: item.use_type, use_subtype: item.use_subtype }));
          mark();
          return;
        }
      }
    }
  };

  const handleSecondaryToggle = (valueString) => {
    const current = getSecondaryValue();
    if (current === valueString) {
      setLocUse(prev => ({ ...(prev || {}), use_type_secondary: null, use_subtype_secondary: null }));
      mark();
      return;
    }
    for (const catData of Object.values(locationUses)) {
      if (catData.subtypes) {
        const item = catData.subtypes.find(s => s.value === valueString);
        if (item) {
          setLocUse(prev => ({ ...(prev || {}), use_type_secondary: item.use_type, use_subtype_secondary: item.use_subtype }));
          mark();
          return;
        }
      }
    }
  };

  const handleSave = async () => {
    const ok = await saveFields({ neris_location_use: locUse });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const labelStyle = { fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' };
  const checkStyle = { display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#374151', cursor: 'pointer' };
  const selectStyle = { width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' };
  const inUse = locUse?.in_use ?? null;

  return (
    <PayloadSection title="NERIS Location Use (mod_location_use)" expanded={expanded} onToggle={onToggle}>
      {/* Primary Location Use */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 600 }}>Primary Location Use</label>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              padding: '0.2rem 0.6rem', fontSize: '0.75rem', background: '#f3f4f6',
              border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', color: '#374151'
            }}
          >Select...</button>
        </div>
        {locUse?.use_type ? (
          <div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.25rem 0.65rem', borderRadius: '999px',
              background: '#dbeafe', border: '1px solid #93c5fd',
              fontSize: '0.8rem', color: '#1f2937'
            }}>
              {formatNerisCode(locUse.use_subtype || locUse.use_type)}
              <button
                type="button"
                onClick={() => { updateLocUse('use_type', null); updateLocUse('use_subtype', null); }}
                style={{
                  background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: '50%',
                  width: '16px', height: '16px', fontSize: '0.65rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280'
                }}
              >×</button>
            </span>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Type: {locUse.use_type} · Subtype: {locUse.use_subtype || '—'}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.8rem', color: '#92400e', fontStyle: 'italic' }}>No location use selected.</div>
        )}
      </div>

      {/* In Use, Vacancy Cause, Secondary Use */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem 1rem', marginTop: '0.5rem' }}>
        <div>
          <label style={labelStyle}>Location In Use?</label>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {[{ val: true, lbl: 'Yes' }, { val: false, lbl: 'No' }, { val: null, lbl: 'Unknown' }].map(opt => (
              <label key={String(opt.val)} style={checkStyle}>
                <input
                  type="radio"
                  name="in_use"
                  checked={inUse === opt.val}
                  onChange={() => updateLocUse('in_use', opt.val)}
                />
                {opt.lbl}
              </label>
            ))}
          </div>
        </div>

        {inUse === false && (
          <div>
            <label style={labelStyle}>Vacancy Cause</label>
            <select
              value={locUse?.vacancy_cause || ''}
              onChange={(e) => updateLocUse('vacancy_cause', e.target.value || null)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              {VACANCY_CAUSES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Secondary Use */}
      <div style={{ marginTop: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <label style={labelStyle}>Secondary Location Use (optional)</label>
          <button
            type="button"
            onClick={() => setShowSecondaryModal(true)}
            style={{
              padding: '0.2rem 0.6rem', fontSize: '0.7rem', background: '#f3f4f6',
              border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', color: '#374151'
            }}
          >Select...</button>
        </div>
        {locUse?.use_type_secondary ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.25rem 0.65rem', borderRadius: '999px',
            background: '#e0e7ff', border: '1px solid #a5b4fc',
            fontSize: '0.8rem', color: '#1f2937'
          }}>
            {formatNerisCode(locUse.use_subtype_secondary || locUse.use_type_secondary)}
            <button
              type="button"
              onClick={() => { updateLocUse('use_type_secondary', null); updateLocUse('use_subtype_secondary', null); }}
              style={{
                background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: '50%',
                width: '16px', height: '16px', fontSize: '0.65rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280'
              }}
            >×</button>
          </span>
        ) : (
          <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>None</span>
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
          {saving ? 'Saving...' : saveOk ? '✓ Saved' : 'Save Location Use'}
        </button>
        {dirty && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>Unsaved changes</span>}
      </div>

      <HierarchicalCodePicker
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Select Location Use"
        data={locationUses}
        selected={getLocationUseValue()}
        onToggle={handleToggle}
        dataType="subtypes"
      />

      <HierarchicalCodePicker
        isOpen={showSecondaryModal}
        onClose={() => setShowSecondaryModal(false)}
        title="Select Secondary Location Use"
        data={locationUses}
        selected={getSecondaryValue()}
        onToggle={handleSecondaryToggle}
        dataType="subtypes"
      />
    </PayloadSection>
  );
}
