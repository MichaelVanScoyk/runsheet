import { useState, useEffect, useMemo } from 'react';
import { useRunSheet } from '../RunSheetContext';

const API = '/api/admin/neris-mutual-aid';

/**
 * Extract station number from a CAD unit ID.
 * Strips leading letters, keeps remaining digits.
 * E49 → "49", AMB891 → "891", BAT47 → "47", L49 → "49"
 */
function extractStationNumber(unitId) {
  if (!unitId) return null;
  const match = unitId.match(/[A-Za-z]+(\d+)/);
  return match ? match[1] : null;
}

export default function MutualAidSection() {
  const { formData, handleChange } = useRunSheet();

  const direction = formData.neris_aid_direction;
  const hasAnswered = direction === 'NONE' || direction === 'GIVEN' || direction === 'RECEIVED';
  const isMutualAid = direction === 'GIVEN' || direction === 'RECEIVED';

  const [departments, setDepartments] = useState([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [autoSelectDone, setAutoSelectDone] = useState(false);

  // Inline manual add
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptStation, setNewDeptStation] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Selected department row IDs
  const selectedIds = useMemo(() => {
    return (formData.mutual_aid_department_ids || []).map(v => Number(v));
  }, [formData.mutual_aid_department_ids]);

  // Unmatched MA station numbers (CAD units with no department in table)
  const [unmatchedStations, setUnmatchedStations] = useState([]);

  // Load departments when mutual aid selected
  useEffect(() => {
    if (isMutualAid && departments.length === 0) {
      loadDepartments();
    }
  }, [isMutualAid]);

  const loadDepartments = async () => {
    setDeptLoading(true);
    try {
      const res = await fetch(`${API}/departments`);
      const data = await res.json();
      setDepartments(data);

      // Auto-select on first load only
      if (!autoSelectDone) {
        doAutoSelect(data);
        setAutoSelectDone(true);
      }
    } catch (err) {
      console.error('Failed to load mutual aid departments:', err);
    } finally {
      setDeptLoading(false);
    }
  };

  const doAutoSelect = (depts) => {
    // Already has selections — don't override
    if (formData.mutual_aid_department_ids?.length > 0) return;

    const maUnits = (formData.cad_units || []).filter(u => u.is_mutual_aid && u.time_enroute);
    if (maUnits.length === 0) return;

    // Extract unique station numbers from mutual aid CAD units
    const stationNumbers = new Set();
    for (const unit of maUnits) {
      const stn = extractStationNumber(unit.unit_id);
      if (stn) stationNumbers.add(stn);
    }

    // Match against departments
    const matched = [];
    const unmatched = [];

    for (const stn of stationNumbers) {
      const dept = depts.find(d => d.station_number === stn);
      if (dept) {
        matched.push(dept.id);
      } else {
        unmatched.push(stn);
      }
    }

    if (matched.length > 0) {
      handleChange('mutual_aid_department_ids', matched);
    }
    setUnmatchedStations(unmatched);
  };

  const handleDirectionSelect = (newDirection) => {
    handleChange('neris_aid_direction', newDirection);
    if (newDirection === 'NONE') {
      handleChange('neris_aid_type', null);
      handleChange('mutual_aid_department_ids', []);
      setUnmatchedStations([]);
    } else if (!formData.neris_aid_type) {
      handleChange('neris_aid_type', 'MUTUAL');
    }
  };

  const toggleDept = (deptId) => {
    const id = Number(deptId);
    const current = [...selectedIds];
    const idx = current.indexOf(id);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(id);
    }
    handleChange('mutual_aid_department_ids', current);
  };

  const handleAddDept = async (prefillStation) => {
    const name = newDeptName.trim();
    const station = (prefillStation || newDeptStation).trim();
    if (!name) return;

    setAddSaving(true);
    try {
      const res = await fetch(`${API}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, station_number: station || null }),
      });
      if (!res.ok) return;
      const data = await res.json();

      // Reload and auto-select the new one
      const deptRes = await fetch(`${API}/departments`);
      const deptData = await deptRes.json();
      setDepartments(deptData);

      handleChange('mutual_aid_department_ids', [...selectedIds, data.id]);

      // Remove from unmatched if it was a prefill
      if (station) {
        setUnmatchedStations(prev => prev.filter(s => s !== station));
      }

      setNewDeptName('');
      setNewDeptStation('');
      setShowAddForm(false);
    } catch (err) {
      console.error('Failed to add department:', err);
    } finally {
      setAddSaving(false);
    }
  };

  const getDeptDisplay = (dept) => {
    if (dept.station_number) return `${dept.name} (Stn ${dept.station_number})`;
    return dept.name;
  };

  return (
    <div className="bg-theme-section rounded-lg p-4 mb-4 border border-theme" data-help-id="mutual_aid">
      <h3 className="text-sm font-semibold text-theme-muted border-b border-theme-light pb-2 mb-4 flex items-center gap-2">
        <span>🤝</span>
        Mutual Aid
        <span className="text-xs text-theme-hint font-normal ml-auto">For Chiefs Report & NERIS</span>
      </h3>

      {/* Direction */}
      <div className="mb-4">
        <p className="text-theme-primary text-sm mb-3">Was mutual aid given or received on this call?</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleDirectionSelect('NONE')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              direction === 'NONE'
                ? 'bg-blue-600 text-white'
                : 'bg-theme-section-alt text-theme-muted hover:bg-gray-200 border border-theme'
            }`}
          >
            No - Our First Due
          </button>
          <button
            type="button"
            onClick={() => handleDirectionSelect('GIVEN')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              direction === 'GIVEN'
                ? 'bg-green-600 text-white'
                : 'bg-theme-section-alt text-theme-muted hover:bg-gray-200 border border-theme'
            }`}
          >
            Yes - We Gave Aid
          </button>
          <button
            type="button"
            onClick={() => handleDirectionSelect('RECEIVED')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              direction === 'RECEIVED'
                ? 'bg-orange-600 text-white'
                : 'bg-theme-section-alt text-theme-muted hover:bg-gray-200 border border-theme'
            }`}
          >
            Yes - We Received Aid
          </button>
        </div>
        {!hasAnswered && (
          <p className="text-xs text-amber-700 mt-2">⚠️ Please answer to continue with damage assessment</p>
        )}
      </div>

      {/* Expanded when mutual aid */}
      {isMutualAid && (
        <div className="pt-3 border-t border-theme-light">
          {/* Aid Type */}
          <div className="mb-4">
            <label className="text-theme-muted text-xs">Aid Type</label>
            <select
              value={formData.neris_aid_type || ''}
              onChange={(e) => handleChange('neris_aid_type', e.target.value || null)}
              className="w-full md:w-64 bg-white border border-theme rounded px-3 py-2 text-theme-primary focus:border-primary-color focus:outline-none"
            >
              <option value="">Select type...</option>
              <option value="AUTOMATIC">Automatic Aid</option>
              <option value="MUTUAL">Mutual Aid</option>
              <option value="OTHER">Other</option>
            </select>
            <p className="text-xs text-theme-hint mt-1">Automatic = pre-arranged, Mutual = requested</p>
          </div>

          {/* Department Selection */}
          <div className="mb-3">
            <label className="text-theme-muted text-xs mb-2 block">
              {direction === 'GIVEN' ? 'Departments We Assisted' : 'Departments That Assisted Us'}
            </label>

            {deptLoading ? (
              <div className="text-sm text-theme-hint">Loading departments...</div>
            ) : departments.length === 0 && unmatchedStations.length === 0 ? (
              <div className="text-sm text-theme-hint">No departments configured. Add one below or configure in Admin → Mutual Aid.</div>
            ) : (
              <div className="flex flex-wrap gap-2 mb-2">
                {departments.map(dept => (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => toggleDept(dept.id)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors border ${
                      selectedIds.includes(dept.id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-theme-primary border-theme hover:bg-gray-100'
                    }`}
                  >
                    {getDeptDisplay(dept)}
                  </button>
                ))}
              </div>
            )}

            {/* Unmatched CAD stations — prompt to add */}
            {unmatchedStations.length > 0 && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded">
                <p className="text-xs text-amber-800 mb-2">
                  CAD units from unknown station(s): <strong>{unmatchedStations.join(', ')}</strong>
                </p>
                {unmatchedStations.map(stn => (
                  <div key={stn} className="flex items-end gap-2 mb-1">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-theme-muted">Name for Station {stn} *</label>
                      <input
                        id={`unmatched-name-${stn}`}
                        className="bg-white border border-theme rounded px-2 py-1 text-sm w-48 focus:border-primary-color focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById(`unmatched-name-${stn}`);
                        const name = input?.value?.trim();
                        if (!name) return;
                        setNewDeptName(name);
                        handleAddDept(stn);
                      }}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded"
                    >
                      Add & Select
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Inline add for any other department */}
            {!showAddForm ? (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="text-xs text-blue-600 hover:underline mt-1"
              >
                + Add department not in list
              </button>
            ) : (
              <div className="flex items-end gap-2 mt-2 p-3 bg-white border border-theme rounded">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-theme-muted">Name *</label>
                  <input
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    className="bg-white border border-theme rounded px-2 py-1 text-sm w-48 focus:border-primary-color focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-theme-muted">Station #</label>
                  <input
                    value={newDeptStation}
                    onChange={(e) => setNewDeptStation(e.target.value)}
                    className="bg-white border border-theme rounded px-2 py-1 text-sm w-20 focus:border-primary-color focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAddDept(null)}
                  disabled={!newDeptName.trim() || addSaving}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded disabled:opacity-50"
                >
                  {addSaving ? '...' : 'Add & Select'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setNewDeptName(''); setNewDeptStation(''); }}
                  className="px-3 py-1 text-sm text-theme-muted hover:text-theme-primary"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status text */}
      {hasAnswered && (
        <p className="text-xs text-theme-hint mt-3">
          {direction === 'NONE' && '✓ This is our incident - damage assessment applies'}
          {direction === 'GIVEN' && '✓ We assisted another station - they track damage for their report'}
          {direction === 'RECEIVED' && '✓ This is our incident with assistance - damage assessment applies'}
        </p>
      )}
    </div>
  );
}
