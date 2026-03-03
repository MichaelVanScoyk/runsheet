import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection } from '../shared/NerisComponents';
import { formatNerisCode } from '../shared/nerisUtils';
import HierarchicalCodePicker from '../shared/HierarchicalCodePicker';

export default function IncidentClassification({ expanded, onToggle }) {
  const { incident, incidentTypes, actionsTaken, dropdowns, saveFields, saving } = useNeris();
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);

  // Local editable state initialized from incident
  const [typeCodes, setTypeCodes] = useState(incident?.neris_incident_type_codes || []);
  const [primaryFlags, setPrimaryFlags] = useState(incident?.neris_incident_type_primary || []);
  const [actionCodes, setActionCodes] = useState(incident?.neris_action_codes || []);
  const [noactionCode, setNoactionCode] = useState(incident?.neris_noaction_code || '');
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const noActionCodes = dropdowns.type_noaction || [];

  const handleTypeToggle = (code) => {
    setTypeCodes(prev => {
      let next;
      if (prev.includes(code)) {
        next = prev.filter(t => t !== code);
        // Remove corresponding primary flag
        const idx = prev.indexOf(code);
        setPrimaryFlags(pf => { const n = [...pf]; n.splice(idx, 1); return n; });
      } else if (prev.length < 3) {
        next = [...prev, code];
        // Add primary flag — first one defaults true
        setPrimaryFlags(pf => [...pf, prev.length === 0]);
      } else {
        return prev;
      }
      setDirty(true);
      return next;
    });
  };

  const togglePrimary = (idx) => {
    setPrimaryFlags(prev => {
      const next = prev.map(() => false);
      next[idx] = true;
      setDirty(true);
      return next;
    });
  };

  const handleActionToggle = (code) => {
    setActionCodes(prev => {
      const next = prev.includes(code) ? prev.filter(a => a !== code) : [...prev, code];
      setDirty(true);
      // Clear no-action when actions are selected
      if (next.length > 0) setNoactionCode('');
      return next;
    });
  };

  const handleNoactionChange = (val) => {
    setNoactionCode(val);
    if (val) setActionCodes([]);
    setDirty(true);
  };

  const handleSave = async () => {
    const ok = await saveFields({
      neris_incident_type_codes: typeCodes,
      neris_incident_type_primary: primaryFlags,
      neris_action_codes: actionCodes,
      neris_noaction_code: noactionCode || null,
    });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  return (
    <PayloadSection
      title="NERIS Incident Type Classification"
      expanded={expanded}
      onToggle={onToggle}
      badge={typeCodes.length || 0}
    >
      {/* Incident Types */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 600 }}>Incident Type (max 3)</label>
          <button
            type="button"
            onClick={() => setShowTypeModal(true)}
            style={{
              padding: '0.2rem 0.6rem', fontSize: '0.75rem', background: '#f3f4f6',
              border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', color: '#374151'
            }}
          >Select...</button>
        </div>
        {typeCodes.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {typeCodes.map((code, idx) => (
              <div key={code} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.25rem 0.65rem', borderRadius: '999px',
                background: primaryFlags[idx] ? '#dbeafe' : '#f3f4f6',
                border: `1px solid ${primaryFlags[idx] ? '#93c5fd' : '#d1d5db'}`,
                fontSize: '0.8rem', color: '#1f2937'
              }}>
                <button
                  type="button"
                  onClick={() => togglePrimary(idx)}
                  title="Set as primary"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    color: primaryFlags[idx] ? '#2563eb' : '#d1d5db', fontWeight: 700, fontSize: '0.85rem'
                  }}
                >★</button>
                {formatNerisCode(code)}
                <button
                  type="button"
                  onClick={() => handleTypeToggle(code)}
                  style={{
                    background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: '50%',
                    width: '16px', height: '16px', fontSize: '0.65rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280'
                  }}
                >×</button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '0.8rem', color: '#991b1b', fontStyle: 'italic' }}>No incident types selected.</div>
        )}
      </div>

      {/* Actions Taken */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 600 }}>Actions Taken</label>
          <button
            type="button"
            onClick={() => setShowActionsModal(true)}
            style={{
              padding: '0.2rem 0.6rem', fontSize: '0.75rem', background: '#f3f4f6',
              border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', color: '#374151'
            }}
          >Select...</button>
        </div>
        {actionCodes.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {actionCodes.map(code => (
              <span key={code} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.2rem 0.5rem', background: '#f3f4f6',
                border: '1px solid #d1d5db', borderRadius: '4px',
                fontSize: '0.8rem', color: '#374151'
              }}>
                {formatNerisCode(code)}
                <button
                  type="button"
                  onClick={() => handleActionToggle(code)}
                  style={{
                    background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: '50%',
                    width: '14px', height: '14px', fontSize: '0.6rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280'
                  }}
                >×</button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* No Action Reason — only when no actions selected */}
      {actionCodes.length === 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
            No Action Reason
          </label>
          <select
            value={noactionCode}
            onChange={(e) => handleNoactionChange(e.target.value)}
            style={{ width: '100%', maxWidth: '400px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
          >
            <option value="">Select if no actions taken...</option>
            {noActionCodes.map(code => (
              <option key={code.value} value={code.value}>
                {code.description || code.value}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Save button */}
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
          {saving ? 'Saving...' : saveOk ? '✓ Saved' : 'Save Classification'}
        </button>
        {dirty && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>Unsaved changes</span>}
      </div>

      {/* Modals */}
      <HierarchicalCodePicker
        isOpen={showTypeModal}
        onClose={() => setShowTypeModal(false)}
        title="Select Incident Type"
        data={incidentTypes}
        selected={typeCodes}
        onToggle={handleTypeToggle}
        maxSelections={3}
        dataType="children"
      />
      <HierarchicalCodePicker
        isOpen={showActionsModal}
        onClose={() => setShowActionsModal(false)}
        title="Select Actions Taken"
        data={actionsTaken}
        selected={actionCodes}
        onToggle={handleActionToggle}
        dataType="children"
      />
    </PayloadSection>
  );
}
