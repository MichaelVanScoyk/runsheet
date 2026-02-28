import { useState, useEffect, useMemo } from 'react';
import { useRunSheet } from '../RunSheetContext';

const API = '/api/admin/neris-mutual-aid';

/**
 * Extract station number from CAD unit ID.
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
  const [deptUnits, setDeptUnits] = useState({});  // {deptId: [units]}
  const [deptLoading, setDeptLoading] = useState(false);

  // Inline add state
  const [addingStation, setAddingStation] = useState(null); // station number being added, or 'manual'
  const [addName, setAddName] = useState('');
  const [addStationNum, setAddStationNum] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Link unit to existing department
  const [linkingUnit, setLinkingUnit] = useState(null); // {unitId, stationNum, deptId}
  const [linkSaving, setLinkSaving] = useState(false);

  const selectedIds = useMemo(() => {
    return (formData.mutual_aid_department_ids || []).map(v => Number(v));
  }, [formData.mutual_aid_department_ids]);

  // CAD mutual aid units that went enroute
  const maUnits = useMemo(() => {
    return (formData.cad_units || []).filter(u => u.is_mutual_aid && u.time_enroute);
  }, [formData.cad_units]);

  // Group MA units by extracted station number
  const stationGroups = useMemo(() => {
    const groups = {};
    for (const unit of maUnits) {
      const stn = extractStationNumber(unit.unit_id);
      if (!stn) continue;
      if (!groups[stn]) groups[stn] = [];
      groups[stn].push(unit.unit_id);
    }
    return groups;
  }, [maUnits]);

  // Map station numbers to departments
  const stationToDept = useMemo(() => {
    const map = {};
    for (const dept of departments) {
      if (dept.station_number) map[dept.station_number] = dept;
    }
    return map;
  }, [departments]);

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

      // Load units for each department
      const unitsMap = {};
      for (const dept of data) {
        try {
          const uRes = await fetch(`${API}/departments/${dept.id}/units`);
          const uData = await uRes.json();
          unitsMap[dept.id] = uData.units || [];
        } catch (e) {
          unitsMap[dept.id] = [];
        }
      }
      setDeptUnits(unitsMap);
    } catch (err) {
      console.error('Failed to load departments:', err);
    } finally {
      setDeptLoading(false);
    }
  };

  const handleDirectionSelect = (newDirection) => {
    handleChange('neris_aid_direction', newDirection);
    if (newDirection === 'NONE') {
      handleChange('neris_aid_type', null);
      handleChange('mutual_aid_department_ids', []);
    } else if (!formData.neris_aid_type) {
      handleChange('neris_aid_type', 'MUTUAL');
    }
  };

  // GIVEN: single select
  const selectGivenDept = (deptId) => {
    handleChange('mutual_aid_department_ids', [deptId]);
  };

  // RECEIVED: toggle
  const toggleReceivedDept = (deptId) => {
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

  // Add new station (from unmatched CAD unit or manual)
  const handleAddStation = async () => {
    if (!addName.trim()) return;
    const stationNum = addStationNum.trim() || (addingStation !== 'manual' ? addingStation : null);
    setAddSaving(true);
    try {
      const res = await fetch(`${API}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), station_number: stationNum || null }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const newDeptId = data.id;

      // If we have CAD units for this station, create unit records
      if (stationNum && stationGroups[stationNum]) {
        for (const unitId of stationGroups[stationNum]) {
          const prefix = unitId.replace(/\d+$/, ''); // E from E49, AMB from AMB891
          await fetch(`${API}/departments/${newDeptId}/units`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              unit_designator: unitId,
              cad_prefix: prefix,
            }),
          });
        }
      }

      await loadDepartments();
      // Auto-select the new department
      handleChange('mutual_aid_department_ids',
        direction === 'GIVEN' ? [newDeptId] : [...selectedIds, newDeptId]
      );

      setAddingStation(null);
      setAddName('');
      setAddStationNum('');
    } catch (err) {
      console.error('Failed to add station:', err);
    } finally {
      setAddSaving(false);
    }
  };

  // Link a CAD unit to an existing department
  const handleLinkUnit = async () => {
    if (!linkingUnit) return;
    setLinkSaving(true);
    try {
      const prefix = linkingUnit.unitId.replace(/\d+$/, '');
      await fetch(`${API}/departments/${linkingUnit.deptId}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_designator: linkingUnit.unitId,
          cad_prefix: prefix,
        }),
      });
      await loadDepartments();
      setLinkingUnit(null);
    } catch (err) {
      console.error('Failed to link unit:', err);
    } finally {
      setLinkSaving(false);
    }
  };

  const getDeptDisplay = (dept) => {
    if (dept.station_number) return `${dept.name} (Stn ${dept.station_number})`;
    return dept.name;
  };

  const getDeptUnitList = (deptId) => {
    const units = deptUnits[deptId] || [];
    if (units.length === 0) return '';
    return units.map(u => u.unit_designator).join(', ');
  };

  // Check if a CAD unit is already in a department's configured units
  const isUnitMapped = (unitId, deptId) => {
    const units = deptUnits[deptId] || [];
    return units.some(u => u.unit_designator === unitId || u.cad_prefix === unitId.replace(/\d+$/, ''));
  };

  // =========================================================================
  // RENDER
  // =========================================================================

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
          {['NONE', 'GIVEN', 'RECEIVED'].map(dir => (
            <button
              key={dir}
              type="button"
              onClick={() => handleDirectionSelect(dir)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                direction === dir
                  ? dir === 'NONE' ? 'bg-blue-600 text-white'
                    : dir === 'GIVEN' ? 'bg-green-600 text-white'
                    : 'bg-orange-600 text-white'
                  : 'bg-theme-section-alt text-theme-muted hover:bg-gray-200 border border-theme'
              }`}
            >
              {dir === 'NONE' ? 'No - Our First Due' : dir === 'GIVEN' ? 'Yes - We Gave Aid' : 'Yes - We Received Aid'}
            </button>
          ))}
        </div>
        {!hasAnswered && (
          <p className="text-xs text-amber-700 mt-2">⚠️ Please answer to continue with damage assessment</p>
        )}
      </div>

      {/* ================================================================= */}
      {/* GIVEN: Pick ONE department we assisted                            */}
      {/* ================================================================= */}
      {direction === 'GIVEN' && (
        <div className="pt-3 border-t border-theme-light">
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
          </div>

          <label className="text-theme-muted text-xs mb-2 block">Station We Assisted</label>

          {deptLoading ? (
            <div className="text-sm text-theme-hint">Loading...</div>
          ) : selectedIds.length > 0 ? (
            /* Show selected department with change/clear */
            (() => {
              const selected = departments.find(d => d.id === selectedIds[0]);
              return selected ? (
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium">
                    {getDeptDisplay(selected)}
                  </span>
                  <button type="button" onClick={() => handleChange('mutual_aid_department_ids', [])}
                    className="text-xs text-red-600 hover:underline">✕ Clear</button>
                </div>
              ) : null;
            })()
          ) : (
            /* Dropdown to pick */
            <div className="mb-2">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value === '__add__') {
                    setAddingStation('manual'); setAddName(''); setAddStationNum('');
                  } else if (e.target.value) {
                    selectGivenDept(Number(e.target.value));
                  }
                }}
                className="w-full md:w-80 bg-white border border-theme rounded px-3 py-2 text-theme-primary focus:border-primary-color focus:outline-none"
              >
                <option value="">Select station...</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{getDeptDisplay(dept)}</option>
                ))}
                <option value="__add__">+ Add station not in list...</option>
              </select>
            </div>
          )}

          {/* Inline add form */}
          {addingStation === 'manual' && selectedIds.length === 0 && (
            <div className="flex items-end gap-2 mt-2 p-3 bg-white border border-theme rounded">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-theme-muted">Name *</label>
                <input value={addName} onChange={(e) => setAddName(e.target.value)}
                  className="bg-white border border-theme rounded px-2 py-1 text-sm w-48 focus:border-primary-color focus:outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-theme-muted">Station #</label>
                <input value={addStationNum} onChange={(e) => setAddStationNum(e.target.value)}
                  className="bg-white border border-theme rounded px-2 py-1 text-sm w-20 focus:border-primary-color focus:outline-none" />
              </div>
              <button type="button" onClick={handleAddStation} disabled={!addName.trim() || addSaving}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded disabled:opacity-50">
                {addSaving ? '...' : 'Add & Select'}
              </button>
              <button type="button" onClick={() => setAddingStation(null)}
                className="px-3 py-1 text-sm text-theme-muted hover:text-theme-primary">Cancel</button>
            </div>
          )}

          <p className="text-xs text-theme-hint mt-3">✓ We assisted another station - they track damage for their report</p>
        </div>
      )}

      {/* ================================================================= */}
      {/* RECEIVED: Show MA units grouped by station, multi-select          */}
      {/* ================================================================= */}
      {direction === 'RECEIVED' && (
        <div className="pt-3 border-t border-theme-light">
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
          </div>

          <label className="text-theme-muted text-xs mb-2 block">Departments That Assisted Us</label>

          {deptLoading ? (
            <div className="text-sm text-theme-hint">Loading...</div>
          ) : maUnits.length === 0 ? (
            <div className="text-sm text-theme-hint mb-2">No mutual aid units went enroute on this call.</div>
          ) : (
            <div className="space-y-2 mb-3">
              {Object.entries(stationGroups).map(([stn, unitIds]) => {
                const dept = stationToDept[stn];

                if (dept) {
                  // Mapped station
                  const isSelected = selectedIds.includes(dept.id);
                  const configuredUnits = getDeptUnitList(dept.id);
                  // Check for unmapped units
                  const unmappedUnits = unitIds.filter(uid => !isUnitMapped(uid, dept.id));

                  return (
                    <div key={stn} className="border border-theme rounded overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleReceivedDept(dept.id)}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-white text-theme-primary hover:bg-gray-50'
                        }`}
                      >
                        <div>
                          <span className="font-medium">{getDeptDisplay(dept)}</span>
                          <span className={`text-xs ml-2 ${isSelected ? 'text-blue-100' : 'text-theme-hint'}`}>
                            Units: {unitIds.join(', ')}
                          </span>
                          {configuredUnits && (
                            <span className={`text-xs ml-2 ${isSelected ? 'text-blue-200' : 'text-theme-hint'}`}>
                              [configured: {configuredUnits}]
                            </span>
                          )}
                        </div>
                        <span className="text-lg">{isSelected ? '✓' : '○'}</span>
                      </button>

                      {/* Offer to link unmapped units */}
                      {unmappedUnits.length > 0 && isSelected && (
                        <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 text-xs">
                          <span className="text-amber-800">New unit(s) not yet linked: </span>
                          {unmappedUnits.map(uid => (
                            <span key={uid} className="inline-flex items-center gap-1 mr-2">
                              <strong>{uid}</strong>
                              {linkingUnit?.unitId === uid ? (
                                <span className="text-theme-hint">linking...</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLinkingUnit({ unitId: uid, stationNum: stn, deptId: dept.id });
                                    handleLinkUnit();
                                  }}
                                  className="text-blue-600 hover:underline"
                                >
                                  link to {dept.name}
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                } else {
                  // Unmapped station
                  return (
                    <div key={stn} className="border border-amber-300 rounded bg-amber-50 px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm">
                          <strong>Station {stn}</strong>
                          <span className="text-xs text-amber-800 ml-2">Units: {unitIds.join(', ')}</span>
                        </span>
                        <span className="text-xs text-amber-700">Not in database</span>
                      </div>

                      {addingStation === stn ? (
                        <div className="flex items-end gap-2 mt-1">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-theme-muted">Department Name *</label>
                            <input value={addName} onChange={(e) => setAddName(e.target.value)}
                              className="bg-white border border-theme rounded px-2 py-1 text-sm w-48 focus:border-primary-color focus:outline-none" />
                          </div>
                          <button type="button" onClick={handleAddStation} disabled={!addName.trim() || addSaving}
                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded disabled:opacity-50">
                            {addSaving ? '...' : 'Add & Select'}
                          </button>
                          <button type="button" onClick={() => setAddingStation(null)}
                            className="px-2 py-1 text-xs text-theme-muted hover:text-theme-primary">Cancel</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setAddingStation(stn); setAddName(''); setAddStationNum(stn); }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          + Add Station {stn} to database & select
                        </button>
                      )}
                    </div>
                  );
                }
              })}
            </div>
          )}

          {/* Manual add for stations not in CAD */}
          {addingStation === null || addingStation !== 'manual' ? (
            <button type="button" onClick={() => { setAddingStation('manual'); setAddName(''); setAddStationNum(''); }}
              className="text-xs text-blue-600 hover:underline">
              + Add department not in CAD list
            </button>
          ) : addingStation === 'manual' && (
            <div className="flex items-end gap-2 mt-2 p-3 bg-white border border-theme rounded">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-theme-muted">Name *</label>
                <input value={addName} onChange={(e) => setAddName(e.target.value)}
                  className="bg-white border border-theme rounded px-2 py-1 text-sm w-48 focus:border-primary-color focus:outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-theme-muted">Station #</label>
                <input value={addStationNum} onChange={(e) => setAddStationNum(e.target.value)}
                  className="bg-white border border-theme rounded px-2 py-1 text-sm w-20 focus:border-primary-color focus:outline-none" />
              </div>
              <button type="button" onClick={handleAddStation} disabled={!addName.trim() || addSaving}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded disabled:opacity-50">
                {addSaving ? '...' : 'Add & Select'}
              </button>
              <button type="button" onClick={() => setAddingStation(null)}
                className="px-3 py-1 text-sm text-theme-muted hover:text-theme-primary">Cancel</button>
            </div>
          )}

          <p className="text-xs text-theme-hint mt-3">✓ This is our incident with assistance - damage assessment applies</p>
        </div>
      )}

      {/* NONE status */}
      {direction === 'NONE' && hasAnswered && (
        <p className="text-xs text-theme-hint mt-1">✓ This is our incident - damage assessment applies</p>
      )}
    </div>
  );
}
