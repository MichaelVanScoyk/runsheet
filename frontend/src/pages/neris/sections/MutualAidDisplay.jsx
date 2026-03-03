import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection, FieldGrid, Field } from '../shared/NerisComponents';
import { formatNerisCode } from '../shared/nerisUtils';

export default function MutualAidDisplay({ expanded, onToggle }) {
  const { incident, preview, dropdowns, saveFields, saving } = useNeris();
  const payload = preview?.payload;

  const aidDirectionCodes = dropdowns.type_aid_direction || [];
  const aidTypeCodes = dropdowns.type_aid || [];

  const [aidDirection, setAidDirection] = useState(incident?.neris_aid_direction || '');
  const [aidType, setAidType] = useState(incident?.neris_aid_type || '');
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  const handleSave = async () => {
    const ok = await saveFields({
      neris_aid_direction: aidDirection || null,
      neris_aid_type: aidType || null,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  return (
    <PayloadSection title="NERIS Mutual Aid (mod_aid)" expanded={expanded} onToggle={onToggle} badge={payload?.aids?.length || 0}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem 1rem', marginBottom: '0.5rem' }}>
        <div>
          <label style={{ fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Aid Direction</label>
          <select
            value={aidDirection}
            onChange={(e) => { setAidDirection(e.target.value); mark(); }}
            style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
          >
            <option value="">No mutual aid</option>
            {aidDirectionCodes.map(code => (
              <option key={code.value} value={code.value}>{code.description || code.value}</option>
            ))}
          </select>
        </div>
        {aidDirection && (
          <div>
            <label style={{ fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Aid Type</label>
            <select
              value={aidType}
              onChange={(e) => { setAidType(e.target.value); mark(); }}
              style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            >
              <option value="">Select type...</option>
              {aidTypeCodes.map(code => (
                <option key={code.value} value={code.value}>{code.description || code.value}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Show assembled payload aids if present */}
      {payload?.aids?.length > 0 && (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#f9fafb', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.25rem' }}>Assembled in payload:</div>
          {payload.aids.map((a, i) => (
            <FieldGrid key={i}>
              <Field label="department_neris_id" value={a.department_neris_id} />
              <Field label="aid_type" value={formatNerisCode(a.aid_type)} />
              <Field label="aid_direction" value={a.aid_direction} />
            </FieldGrid>
          ))}
        </div>
      )}

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
          {saving ? 'Saving...' : saveOk ? '✓ Saved' : 'Save Mutual Aid'}
        </button>
        {dirty && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>Unsaved changes</span>}
      </div>
    </PayloadSection>
  );
}
