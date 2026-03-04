import { useState } from 'react';
import { useNeris } from '../NerisContext';
import { PayloadSection } from '../shared/NerisComponents';

const DAMAGE_TYPES = [
  { value: 'NO_DAMAGE', label: 'No Damage' },
  { value: 'MINOR', label: 'Minor' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'DESTROYED', label: 'Destroyed' },
];

const DISPLACEMENT_CAUSES = [
  { value: 'COLLAPSE', label: 'Collapse' },
  { value: 'FIRE', label: 'Fire' },
  { value: 'HAZARDOUS_SITUATION', label: 'Hazardous Situation' },
  { value: 'OTHER', label: 'Other' },
  { value: 'SMOKE', label: 'Smoke' },
  { value: 'UTILITIES', label: 'Utilities' },
  { value: 'WATER', label: 'Water' },
];

function emptyExposure() {
  return {
    exposure_type: '',
    address: '',
    geocode_data: null,
    geocode_status: null, // null | 'loading' | 'success' | 'failed'
    damage_type: '',
    displacement_count: null,
    displacement_causes: [],
    people_present: null,
    floor: '',
    room: '',
  };
}

export default function Exposures({ expanded, onToggle }) {
  const { incident, dropdowns, saveFields, saving } = useNeris();

  const typeCodes = incident?.neris_incident_type_codes || [];
  const hasFireType = typeCodes.some(t => t && t.startsWith('FIRE'));

  if (!hasFireType) return null;

  const [exposures, setExposures] = useState(
    (incident?.neris_exposures || []).map(e => ({
      ...emptyExposure(),
      ...e,
      geocode_status: e.geocode_data ? 'success' : null,
    }))
  );
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const mark = () => setDirty(true);

  const updateExposure = (idx, field, value) => {
    setExposures(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      // Clear geocode if address changed
      if (field === 'address') {
        updated[idx].geocode_data = null;
        updated[idx].geocode_status = null;
      }
      return updated;
    });
    mark();
  };

  const toggleCause = (idx, cause) => {
    setExposures(prev => {
      const updated = [...prev];
      const causes = updated[idx].displacement_causes || [];
      if (causes.includes(cause)) {
        updated[idx] = { ...updated[idx], displacement_causes: causes.filter(c => c !== cause) };
      } else {
        updated[idx] = { ...updated[idx], displacement_causes: [...causes, cause] };
      }
      return updated;
    });
    mark();
  };

  const addExposure = () => {
    setExposures(prev => [...prev, emptyExposure()]);
    mark();
  };

  const removeExposure = (idx) => {
    setExposures(prev => prev.filter((_, i) => i !== idx));
    mark();
  };

  const geocodeExposure = async (idx) => {
    const address = exposures[idx]?.address;
    if (!address || !address.trim()) return;

    setExposures(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], geocode_status: 'loading' };
      return updated;
    });

    try {
      const resp = await fetch('/api/location/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim() }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      setExposures(prev => {
        const updated = [...prev];
        if (data.success && data.geocode_data) {
          updated[idx] = {
            ...updated[idx],
            geocode_data: data.geocode_data,
            geocode_status: 'success',
          };
        } else {
          updated[idx] = { ...updated[idx], geocode_data: null, geocode_status: 'failed' };
        }
        return updated;
      });
      mark();
    } catch (err) {
      console.error('Exposure geocode error:', err);
      setExposures(prev => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], geocode_data: null, geocode_status: 'failed' };
        return updated;
      });
    }
  };

  const handleSave = async () => {
    // Strip geocode_status before saving (UI-only field)
    const cleanExposures = exposures.map(({ geocode_status, ...rest }) => rest);
    const ok = await saveFields({ neris_exposures: cleanExposures });
    if (ok) {
      setDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    }
  };

  const selectStyle = { padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' };
  const labelStyle = { fontSize: '0.7rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: '2px' };
  const cardStyle = { padding: '0.5rem', marginBottom: '0.5rem', background: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb' };
  const removeBtn = { background: '#fecaca', border: '1px solid #fca5a5', borderRadius: '4px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#991b1b', cursor: 'pointer' };

  return (
    <PayloadSection title="NERIS Exposures" expanded={expanded} onToggle={onToggle} badge={exposures.length}>
      <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.5rem', fontStyle: 'italic' }}>
        Properties affected by fire spread from the incident. Each exposure address is geocoded for NERIS NG911 compliance.
      </div>

      {exposures.map((exp, idx) => (
        <div key={idx} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Exposure #{idx + 1}</span>
            <button type="button" onClick={() => removeExposure(idx)} style={removeBtn}>×</button>
          </div>

          {/* Row 1: Type, Address + Geocode, Damage */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 150px', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <div>
              <label style={labelStyle}>Exposure Type</label>
              <select value={exp.exposure_type || ''} onChange={(e) => updateExposure(idx, 'exposure_type', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
                <option value="">--</option>
                <option value="INTERNAL_EXPOSURE">Internal</option>
                <option value="EXTERNAL_EXPOSURE">External</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Address</label>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <input type="text" value={exp.address || ''} onChange={(e) => updateExposure(idx, 'address', e.target.value)}
                  style={{ flex: 1, padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                <button type="button" onClick={() => geocodeExposure(idx)}
                  disabled={!exp.address || exp.geocode_status === 'loading'}
                  style={{
                    padding: '4px 8px', fontSize: '0.75rem', fontWeight: 500,
                    border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer',
                    background: exp.geocode_status === 'success' ? '#dcfce7' :
                                exp.geocode_status === 'failed' ? '#fef2f2' :
                                exp.geocode_status === 'loading' ? '#fef9c3' : '#fff',
                    color: exp.geocode_status === 'success' ? '#166534' :
                           exp.geocode_status === 'failed' ? '#991b1b' : '#374151',
                  }}>
                  {exp.geocode_status === 'loading' ? '...' :
                   exp.geocode_status === 'success' ? '✓ Geocoded' :
                   exp.geocode_status === 'failed' ? '✗ Retry' : 'Geocode'}
                </button>
              </div>
              {exp.geocode_data && (
                <div style={{ fontSize: '0.65rem', color: '#059669', marginTop: '2px' }}>
                  {exp.geocode_data.matched_address} ({exp.geocode_data.provider}, {exp.geocode_data.latitude?.toFixed(5)}, {exp.geocode_data.longitude?.toFixed(5)})
                </div>
              )}
              {exp.geocode_status === 'failed' && (
                <div style={{ fontSize: '0.65rem', color: '#dc2626', marginTop: '2px' }}>
                  Geocoding failed — check address and retry
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>Damage</label>
              <select value={exp.damage_type || ''} onChange={(e) => updateExposure(idx, 'damage_type', e.target.value || null)} style={{ ...selectStyle, width: '100%' }}>
                <option value="">--</option>
                {DAMAGE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Internal detail (floor/room) + displacement + people */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.35rem' }}>
            {exp.exposure_type === 'INTERNAL_EXPOSURE' && (
              <>
                <div>
                  <label style={labelStyle}>Floor</label>
                  <input type="text" value={exp.floor || ''} onChange={(e) => updateExposure(idx, 'floor', e.target.value)}
                    style={{ ...selectStyle, width: '100%' }} />
                </div>
                <div>
                  <label style={labelStyle}>Room</label>
                  <input type="text" value={exp.room || ''} onChange={(e) => updateExposure(idx, 'room', e.target.value)}
                    style={{ ...selectStyle, width: '100%' }} />
                </div>
              </>
            )}
            <div>
              <label style={labelStyle}>Displaced Count</label>
              <input type="number" min="0" value={exp.displacement_count ?? ''}
                onChange={(e) => updateExposure(idx, 'displacement_count', e.target.value ? parseInt(e.target.value) : null)}
                style={{ width: '80px', padding: '4px 6px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
            </div>
            <div>
              <label style={labelStyle}>People Present?</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[{ val: true, lbl: 'Yes' }, { val: false, lbl: 'No' }, { val: null, lbl: '?' }].map(opt => (
                  <label key={String(opt.val)} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                    <input type="radio" name={`people_${idx}`} checked={exp.people_present === opt.val}
                      onChange={() => updateExposure(idx, 'people_present', opt.val)} />
                    {opt.lbl}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Displacement causes — show if displaced > 0 */}
          {(exp.displacement_count > 0) && (
            <div style={{ paddingTop: '0.35rem', borderTop: '1px solid #e5e7eb' }}>
              <label style={labelStyle}>Displacement Causes</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {DISPLACEMENT_CAUSES.map(dc => (
                  <label key={dc.value} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#374151', cursor: 'pointer' }}>
                    <input type="checkbox" checked={(exp.displacement_causes || []).includes(dc.value)}
                      onChange={() => toggleCause(idx, dc.value)} />
                    {dc.label}
                  </label>
                ))}
              </div>
            </div>
          )}
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
