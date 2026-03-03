import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';
import { formatLabel, formatNerisCode } from '../shared/nerisUtils';
import HierarchicalCodePicker from '../shared/HierarchicalCodePicker';

export default function LocationUse({ expanded, onToggle }) {
  const { incident, locationUses, saveFields, saving } = useNeris();

  const [locUse, setLocUse] = useState(incident?.neris_location_use || null);
  const [showModal, setShowModal] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const getLocationUseValue = () => {
    if (!locUse || !locUse.use_type) return '';
    return locUse.use_subtype ? `${locUse.use_type}: ${locUse.use_subtype}` : locUse.use_type;
  };

  const handleToggle = (valueString) => {
    const current = getLocationUseValue();
    if (current === valueString) {
      setLocUse(null);
      setDirty(true);
      return;
    }
    for (const catData of Object.values(locationUses)) {
      if (catData.subtypes) {
        const item = catData.subtypes.find(s => s.value === valueString);
        if (item) {
          setLocUse({ use_type: item.use_type, use_subtype: item.use_subtype });
          setDirty(true);
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

  return (
    <PayloadSection title="NERIS Location Use (mod_location_use)" expanded={expanded} onToggle={onToggle}>
      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 600 }}>Location Use</label>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              padding: '0.2rem 0.6rem', fontSize: '0.75rem', background: '#f3f4f6',
              border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', color: '#374151'
            }}
          >Select...</button>
        </div>
        {locUse ? (
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
                onClick={() => { setLocUse(null); setDirty(true); }}
                style={{
                  background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: '50%',
                  width: '16px', height: '16px', fontSize: '0.65rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280'
                }}
              >×</button>
            </span>
            {locUse.use_type && (
              <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Type: {locUse.use_type} · Subtype: {locUse.use_subtype || '—'}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '0.8rem', color: '#92400e', fontStyle: 'italic' }}>No location use selected.</div>
        )}
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
    </PayloadSection>
  );
}
