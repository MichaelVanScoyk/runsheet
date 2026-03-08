/**
 * nerisv1: ActionsTacticsSection — actions_tactics form (Section 7)
 *
 * Schema: IncidentPayload.actions_tactics from api-test.neris.fsri.org/v1/openapi.json v1.4.38
 *
 * actions_tactics: ActionTacticPayload | null
 *
 * ActionTacticPayload (additionalProperties: false, required: action_noaction):
 *   - action_noaction: oneOf ActionPayload | NoactionPayload
 *     discriminator: type -> ACTION | NOACTION
 *
 * ActionPayload (additionalProperties: false, required: none):
 *   - type: string, const "ACTION", default "ACTION"
 *   - actions: TypeActionTacticValue[] | null (89-value enum, from codes API)
 *
 * NoactionPayload (additionalProperties: false, required: noaction_type):
 *   - type: string, const "NOACTION", default "NOACTION"
 *   - noaction_type: TypeNoactionValue (CANCELLED, NO_INCIDENT_FOUND, STAGED_STANDBY)
 *
 * Props:
 *   data: object|null — current actions_tactics value (NERIS field names)
 *   onChange: (newData) => void
 */
import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const NOACTION_TYPES = ['CANCELLED', 'NO_INCIDENT_FOUND', 'STAGED_STANDBY'];

export default function ActionsTacticsSection({ data = null, onChange }) {
  const [actionOptions, setActionOptions] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/neris-codes/categories/action_tactic`)
      .then((r) => r.json())
      .then((codes) => {
        const sorted = codes
          .filter((c) => c.active)
          .map((c) => c.value)
          .sort();
        setActionOptions(sorted);
      })
      .catch(() => {});
  }, []);

  const an = data?.action_noaction || null;
  const discriminator = an?.type || '';

  const setDiscriminator = (newType) => {
    if (newType === 'ACTION') {
      onChange({ action_noaction: { type: 'ACTION', actions: null } });
    } else if (newType === 'NOACTION') {
      onChange({ action_noaction: { type: 'NOACTION', noaction_type: '' } });
    } else {
      onChange(null);
    }
  };

  // --- ACTION mode helpers ---
  const actions = an?.actions || [];
  const toggleAction = (value) => {
    const current = actions;
    let next;
    if (current.includes(value)) {
      next = current.filter((v) => v !== value);
    } else {
      next = [...current, value];
    }
    onChange({
      action_noaction: {
        type: 'ACTION',
        actions: next.length ? next : null,
      },
    });
  };

  // --- NOACTION mode helper ---
  const setNoactionType = (value) => {
    onChange({
      action_noaction: {
        type: 'NOACTION',
        noaction_type: value || '',
      },
    });
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded border">
      <h3 className="text-lg font-bold text-gray-800">Section 7: Actions / Tactics</h3>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">action_noaction.type (discriminator)</label>
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={discriminator}
          onChange={(e) => setDiscriminator(e.target.value)}
        >
          <option value="">— none (null) —</option>
          <option value="ACTION">ACTION</option>
          <option value="NOACTION">NOACTION</option>
        </select>
      </div>

      {discriminator === 'ACTION' && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-2">actions (TypeActionTacticValue[])</label>
          <div className="max-h-64 overflow-y-auto border rounded p-2 space-y-1">
            {actionOptions.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={actions.includes(opt)}
                  onChange={() => toggleAction(opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      )}

      {discriminator === 'NOACTION' && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">noaction_type *</label>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={an?.noaction_type || ''}
            onChange={(e) => setNoactionType(e.target.value)}
          >
            <option value="">— select —</option>
            {NOACTION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
