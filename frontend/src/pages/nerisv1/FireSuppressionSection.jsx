/**
 * nerisv1: FireSuppressionSection — fire_suppression form (Section 18)
 *
 * Schema: IncidentPayload.fire_suppression from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * fire_suppression: FireSuppressionPayload | null
 * Conditional: required for FIRE||STRUCTURE_FIRE (unless SUPPORT_AID GIVEN)
 *
 * Props:
 *   data: object|null
 *   onChange: (newData) => void
 */
import React from 'react';

const PRESENCE_TYPES = ['PRESENT', 'NOT_PRESENT', 'NOT_APPLICABLE'];
const SUPPRESS_FIRE_VALUES = ['CLEAN_AGENT_SYSTEM', 'DELUGE_SYSTEM', 'DRY_PIPE_SPRINKLER_SYSTEM', 'INDUSTRIAL_DRY_CHEM_SYSTEM', 'OTHER', 'PRE_ACTION_SYSTEM', 'UNKNOWN', 'WET_PIPE_SPRINKLER_SYSTEM'];
const FULL_PARTIAL_VALUES = ['EXTENT_UNKNOWN', 'FULL', 'PARTIAL'];
const EFFECTIVENESS_TYPES = ['OPERATED_EFFECTIVE', 'OPERATED_NOT_EFFECTIVE', 'NO_OPERATION'];
const NO_OPERATION_REASONS = ['INSUFFICIENT_SOURCE', 'INSUFFICIENT_WATER_SUPPLY', 'SYSTEM_DAMAGED_COMPROMISED', 'SYSTEM_INOPERABLE', 'SYSTEM_NOT_SUITABLE', 'SYSTEM_SHUTOFF_DURING_INCIDENT', 'SYSTEM_SHUTOFF_PRIOR_TO_INCIDENT', 'UNABLE_TO_DETERMINE'];

function EnumSelect({ label, value, options, onChange, required }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}{required ? ' *' : ''}</label>
      <select className="w-full border rounded px-2 py-1 text-sm" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function FireSuppressionSection({ data = null, onChange }) {
  if (data === null) return null;

  const pres = data.presence || {};
  const presType = pres.type || '';

  const setPresType = (t) => {
    if (t === 'PRESENT') {
      onChange({ presence: { type: 'PRESENT' } });
    } else {
      onChange({ presence: { type: t } });
    }
  };

  const setPres = (field, value) => {
    onChange({ presence: { ...pres, [field]: value } });
  };

  // --- Suppression types array ---
  const stypes = pres.suppression_types || [];
  const addSType = () => setPres('suppression_types', [...stypes, { type: '' }]);
  const removeSType = (i) => {
    const next = stypes.filter((_, idx) => idx !== i);
    setPres('suppression_types', next.length ? next : null);
  };
  const setSType = (i, field, value) => {
    const next = stypes.map((st, idx) => (idx === i ? { ...st, [field]: value } : st));
    setPres('suppression_types', next);
  };

  // --- Operation / effectiveness ---
  const op = pres.operation_type || null;
  const eff = op?.effectiveness || {};
  const effType = eff.type || '';

  const setEffType = (t) => {
    if (!t) {
      setPres('operation_type', null);
      return;
    }
    setPres('operation_type', { effectiveness: { type: t } });
  };

  const setEff = (field, value) => {
    setPres('operation_type', { effectiveness: { ...eff, [field]: value } });
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 18: Fire Suppression</h3>

      <EnumSelect label="presence.type * (discriminator)" value={presType} options={PRESENCE_TYPES} onChange={(v) => setPresType(v || '')} required />

      {presType === 'PRESENT' && (
        <div className="p-3 bg-gray-50 rounded border space-y-4">

          {/* suppression_types array */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600">suppression_types</label>
              <button type="button" className="text-xs text-blue-600 hover:underline" onClick={addSType}>+ Add</button>
            </div>
            {stypes.map((st, i) => (
              <div key={i} className="flex items-start gap-2 mb-2 p-2 bg-white rounded border">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <EnumSelect label="type *" value={st.type} options={SUPPRESS_FIRE_VALUES} onChange={(v) => setSType(i, 'type', v || '')} required />
                  <EnumSelect label="full_partial" value={st.full_partial} options={FULL_PARTIAL_VALUES} onChange={(v) => setSType(i, 'full_partial', v)} />
                </div>
                <button type="button" className="mt-5 text-red-500 text-xs hover:underline" onClick={() => removeSType(i)}>remove</button>
              </div>
            ))}
          </div>

          {/* operation_type / effectiveness */}
          <div className="p-2 border rounded bg-white space-y-2">
            <span className="text-xs font-bold text-gray-500">operation_type</span>
            <EnumSelect label="effectiveness.type (discriminator)" value={effType} options={EFFECTIVENESS_TYPES} onChange={(v) => setEffType(v)} />

            {effType === 'OPERATED_EFFECTIVE' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">sprinklers_activated</label>
                <input
                  type="number"
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={eff.sprinklers_activated ?? ''}
                  onChange={(e) => setEff('sprinklers_activated', e.target.value === '' ? null : parseInt(e.target.value, 10))}
                />
              </div>
            )}

            {effType === 'OPERATED_NOT_EFFECTIVE' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">sprinklers_activated</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1 text-sm"
                    value={eff.sprinklers_activated ?? ''}
                    onChange={(e) => setEff('sprinklers_activated', e.target.value === '' ? null : parseInt(e.target.value, 10))}
                  />
                </div>
                <EnumSelect label="failure_reason" value={eff.failure_reason} options={NO_OPERATION_REASONS} onChange={(v) => setEff('failure_reason', v)} />
              </div>
            )}

            {effType === 'NO_OPERATION' && (
              <EnumSelect label="failure_reason" value={eff.failure_reason} options={NO_OPERATION_REASONS} onChange={(v) => setEff('failure_reason', v)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
