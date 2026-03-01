import { useState, useEffect, useMemo } from 'react';
import { useRunSheet } from '../RunSheetContext';

const API = '/api/admin/neris-mutual-aid';

function extractStationNumber(unitId) {
  if (!unitId) return null;
  const match = unitId.match(/[A-Za-z]+(\d+)/);
  return match ? match[1] : null;
}

// ============================================================================
// RECEIVED AID MODAL
// ============================================================================
function ReceivedAidModal({ departments, deptUnits, stationGroups, stationToDept, selectedIds, onToggle, onClose, onReload }) {
  const [addingStation, setAddingStation] = useState(null);
  const [addName, setAddName] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [assignToDept, setAssignToDept] = useState({}); // {stn: deptId} for assigning unknown station to existing dept
  const [linkSaving, setLinkSaving] = useState(null);

  const handleAddStation = async (stn) => {
    if (!addName.trim()) return;
    setAddSaving(true);
    try {
      const res = await fetch(`${API}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), station_number: stn }),
      });
      if (!res.ok) return;
      const data = await res.json();

      // Create unit records for CAD units
      if (stationGroups[stn]) {
        for (const unitId of stationGroups[stn]) {
          const prefix = unitId.replace(/\d+$/, '');
          await fetch(`${API}/departments/${data.id}/units`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unit_designator: unitId, cad_prefix: prefix }),
          });
        }
      }

      await onReload();
      onToggle(data.id, true);
      setAddingStation(null);
      setAddName('');
    } catch (err) {
      console.error('Failed to add station:', err);
    } finally {
      setAddSaving(false);
    }
  };

  const handleAssignToExisting = async (stn, deptId) => {
    if (!deptId) return;
    setAddSaving(true);
    try {
      // Create unit records under existing department
      if (stationGroups[stn]) {
        for (const unitId of stationGroups[stn]) {
          const prefix = unitId.replace(/\d+$/, '');
          await fetch(`${API}/departments/${deptId}/units`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unit_designator: unitId, cad_prefix: prefix }),
          });
        }
      }
      await onReload();
      onToggle(Number(deptId), true);
    } catch (err) {
      console.error('Failed to assign units:', err);
    } finally {
      setAddSaving(false);
    }
  };

  const handleLinkUnit = async (unitId, deptId) => {
    setLinkSaving(unitId);
    try {
      const prefix = unitId.replace(/\d+$/, '');
      await fetch(`${API}/departments/${deptId}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_designator: unitId, cad_prefix: prefix }),
      });
      await onReload();
    } catch (err) {
      console.error('Failed to link unit:', err);
    } finally {
      setLinkSaving(null);
    }
  };

  const isUnitMapped = (unitId, deptId) => {
    const units = deptUnits[deptId] || [];
    return units.some(u => u.unit_designator === unitId || (u.cad_prefix && unitId.startsWith(u.cad_prefix)));
  };

  const sortedStations = useMemo(() => {
    return Object.entries(stationGroups).sort((a, b) => {
      const aMapped = !!stationToDept[a[0]];
      const bMapped = !!stationToDept[b[0]];
      if (aMapped && !bMapped) return -1;
      if (!aMapped && bMapped) return 1;
      return a[0].localeCompare(b[0], undefined, { numeric: true });
    });
  }, [stationGroups, stationToDept]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full md:max-w-lg md:rounded-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h3 className="text-base font-semibold text-gray-900">Departments That Assisted Us</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {sortedStations.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No mutual aid units went enroute on this call.</p>
          )}

          {sortedStations.map(([stn, unitIds]) => {
            const dept = stationToDept[stn];

            if (dept) {
              const isSelected = selectedIds.includes(dept.id);
              const configuredUnits = (deptUnits[dept.id] || []).map(u => u.unit_designator);
              const unmappedUnits = unitIds.filter(uid => !isUnitMapped(uid, dept.id));

              return (
                <div key={stn} className={`border rounded-lg overflow-hidden ${isSelected ? 'border-blue-500' : 'border-gray-200'}`}>
                  <button
                    type="button"
                    onClick={() => onToggle(dept.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{dept.name} (Stn {dept.station_number})</div>
                      <div className={`text-xs mt-0.5 ${isSelected ? 'text-blue-100' : 'text-gray-500'}`}>
                        CAD: {unitIds.join(', ')}
                        {configuredUnits.length > 0 && <span className="ml-1">· Linked: {configuredUnits.join(', ')}</span>}
                      </div>
                    </div>
                    <span className={`shrink-0 ml-2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                      isSelected ? 'border-white bg-white text-blue-600' : 'border-gray-300'
                    }`}>
                      {isSelected && '✓'}
                    </span>
                  </button>

                  {/* Unmapped units */}
                  {unmappedUnits.length > 0 && isSelected && (
                    <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 text-xs space-y-1">
                      {unmappedUnits.map(uid => (
                        <div key={uid} className="flex items-center justify-between">
                          <span className="text-amber-800"><strong>{uid}</strong> not linked</span>
                          <button
                            type="button"
                            disabled={linkSaving === uid}
                            onClick={() => handleLinkUnit(uid, dept.id)}
                            className="text-blue-600 hover:underline disabled:opacity-50"
                          >
                            {linkSaving === uid ? '...' : `Link to ${dept.name}`}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            } else {
              // Unknown station
              return (
                <div key={stn} className="border border-amber-300 rounded-lg bg-amber-50 px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="font-medium text-sm text-gray-900">Station {stn}</span>
                      <span className="text-xs text-amber-700 ml-2">{unitIds.join(', ')}</span>
                    </div>
                    <span className="text-xs text-amber-600">Not in database</span>
                  </div>

                  {addingStation === stn ? (
                    <div className="mt-2 space-y-2">
                      <input
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleAddStation(stn)} disabled={!addName.trim() || addSaving}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded disabled:opacity-50 flex-1">
                          {addSaving ? '...' : 'Create & Select'}
                        </button>
                        <button type="button" onClick={() => { setAddingStation(null); setAddName(''); }}
                          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1.5 flex flex-col gap-1.5">
                      <button type="button"
                        onClick={() => { setAddingStation(stn); setAddName(''); }}
                        className="text-xs text-blue-600 hover:underline text-left">
                        + Create new department for Station {stn}
                      </button>
                      {departments.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500">or assign to:</span>
                          <select
                            value={assignToDept[stn] || ''}
                            onChange={(e) => setAssignToDept(prev => ({ ...prev, [stn]: e.target.value }))}
                            className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white flex-1"
                          >
                            <option value="">Select existing...</option>
                            {departments.map(d => (
                              <option key={d.id} value={d.id}>{d.name}{d.station_number ? ` (${d.station_number})` : ''}</option>
                            ))}
                          </select>
                          {assignToDept[stn] && (
                            <button type="button" onClick={() => handleAssignToExisting(stn, assignToDept[stn])}
                              disabled={addSaving}
                              className="text-xs px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50">
                              {addSaving ? '...' : 'Assign'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 shrink-0 flex items-center justify-between">
          <span className="text-xs text-gray-500">{selectedIds.length} department{selectedIds.length !== 1 ? 's' : ''} selected</span>
          <button type="button" onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function MutualAidSection() {
  const { formData, handleChange } = useRunSheet();

  const direction = formData.neris_aid_direction;
  const hasAnswered = direction === 'NONE' || direction === 'GIVEN' || direction === 'RECEIVED';

  const [departments, setDepartments] = useState([]);
  const [deptUnits, setDeptUnits] = useState({});
  const [deptLoading, setDeptLoading] = useState(false);

  // GIVEN inline add
  const [addingStation, setAddingStation] = useState(null);
  const [addName, setAddName] = useState('');
  const [addStationNum, setAddStationNum] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // RECEIVED modal
  const [showReceivedModal, setShowReceivedModal] = useState(false);

  const selectedIds = useMemo(() => {
    return (formData.mutual_aid_department_ids || []).map(v => Number(v));
  }, [formData.mutual_aid_department_ids]);

  const maUnits = useMemo(() => {
    return (formData.cad_units || []).filter(u => u.is_mutual_aid && u.time_enroute);
  }, [formData.cad_units]);

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

  const stationToDept = useMemo(() => {
    const map = {};
    for (const dept of departments) {
      if (dept.station_number) map[dept.station_number] = dept;
    }
    return map;
  }, [departments]);

  useEffect(() => {
    if ((direction === 'GIVEN' || direction === 'RECEIVED') && departments.length === 0) {
      loadDepartments();
    }
  }, [direction]);

  const loadDepartments = async () => {
    setDeptLoading(true);
    try {
      const res = await fetch(`${API}/departments`);
      const data = await res.json();
      setDepartments(data);
      const unitsMap = {};
      for (const dept of data) {
        try {
          const uRes = await fetch(`${API}/departments/${dept.id}/units`);
          const uData = await uRes.json();
          unitsMap[dept.id] = uData.units || [];
        } catch (e) { unitsMap[dept.id] = []; }
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

  const selectGivenDept = (deptId) => {
    handleChange('mutual_aid_department_ids', [deptId]);
  };

  const toggleReceivedDept = (deptId, forceSelect) => {
    const id = Number(deptId);
    const current = [...selectedIds];
    const idx = current.indexOf(id);
    if (forceSelect) {
      if (idx < 0) current.push(id);
    } else {
      idx >= 0 ? current.splice(idx, 1) : current.push(id);
    }
    handleChange('mutual_aid_department_ids', current);
  };

  const handleAddGivenStation = async () => {
    if (!addName.trim()) return;
    setAddSaving(true);
    try {
      const res = await fetch(`${API}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), station_number: addStationNum.trim() || null }),
      });
      if (!res.ok) return;
      const data = await res.json();
      await loadDepartments();
      handleChange('mutual_aid_department_ids', [data.id]);
      setAddingStation(null);
      setAddName('');
      setAddStationNum('');
    } catch (err) {
      console.error('Failed to add station:', err);
    } finally {
      setAddSaving(false);
    }
  };

  const getDeptDisplay = (dept) => {
    if (dept.station_number) return `${dept.name} (Stn ${dept.station_number})`;
    return dept.name;
  };

  // Selected departments summary for RECEIVED
  const selectedDepts = useMemo(() => {
    return departments.filter(d => selectedIds.includes(d.id));
  }, [departments, selectedIds]);

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
      {/* GIVEN                                                             */}
      {/* ================================================================= */}
      {direction === 'GIVEN' && (
        <div className="pt-3 border-t border-theme-light">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-theme-muted text-xs">Aid Type</label>
              <select
                value={formData.neris_aid_type || ''}
                onChange={(e) => handleChange('neris_aid_type', e.target.value || null)}
                className="w-full bg-white border border-theme rounded px-3 py-1.5 text-sm text-theme-primary focus:border-primary-color focus:outline-none"
              >
                <option value="">Select type...</option>
                <option value="AUTOMATIC">Automatic Aid</option>
                <option value="MUTUAL">Mutual Aid</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="text-theme-muted text-xs">Station We Assisted</label>
              {deptLoading ? (
                <div className="text-sm text-theme-hint py-1">Loading...</div>
              ) : selectedIds.length > 0 ? (
                (() => {
                  const selected = departments.find(d => d.id === selectedIds[0]);
                  return selected ? (
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium">
                        {getDeptDisplay(selected)}
                      </span>
                      <button type="button" onClick={() => handleChange('mutual_aid_department_ids', [])}
                        className="text-xs text-red-600 hover:underline">✕</button>
                    </div>
                  ) : null;
                })()
              ) : (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value === '__add__') {
                      setAddingStation('manual'); setAddName(''); setAddStationNum('');
                    } else if (e.target.value) {
                      selectGivenDept(Number(e.target.value));
                    }
                  }}
                  className="w-full bg-white border border-theme rounded px-3 py-1.5 text-sm text-theme-primary focus:border-primary-color focus:outline-none"
                >
                  <option value="">Select station...</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{getDeptDisplay(dept)}</option>
                  ))}
                  <option value="__add__">+ Add station not in list...</option>
                </select>
              )}
            </div>
          </div>

          {addingStation === 'manual' && selectedIds.length === 0 && (
            <div className="flex flex-wrap items-end gap-2 mt-2 p-2 bg-white border border-theme rounded text-sm">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-theme-muted">Name *</label>
                <input value={addName} onChange={(e) => setAddName(e.target.value)}
                  className="bg-white border border-theme rounded px-2 py-1 text-sm w-44 focus:border-primary-color focus:outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-theme-muted">Stn #</label>
                <input value={addStationNum} onChange={(e) => setAddStationNum(e.target.value)}
                  className="bg-white border border-theme rounded px-2 py-1 text-sm w-16 focus:border-primary-color focus:outline-none" />
              </div>
              <button type="button" onClick={handleAddGivenStation} disabled={!addName.trim() || addSaving}
                className="px-2 py-1 bg-blue-600 text-white text-sm rounded disabled:opacity-50">
                {addSaving ? '...' : 'Add'}
              </button>
              <button type="button" onClick={() => setAddingStation(null)}
                className="px-2 py-1 text-xs text-theme-muted hover:text-theme-primary">Cancel</button>
            </div>
          )}

          <p className="text-xs text-theme-hint mt-2">✓ We assisted another station - they track damage for their report</p>
        </div>
      )}

      {/* ================================================================= */}
      {/* RECEIVED                                                          */}
      {/* ================================================================= */}
      {direction === 'RECEIVED' && (
        <div className="pt-3 border-t border-theme-light">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <label className="text-theme-muted text-xs">Aid Type</label>
              <select
                value={formData.neris_aid_type || ''}
                onChange={(e) => handleChange('neris_aid_type', e.target.value || null)}
                className="w-full bg-white border border-theme rounded px-3 py-1.5 text-sm text-theme-primary focus:border-primary-color focus:outline-none"
              >
                <option value="">Select type...</option>
                <option value="AUTOMATIC">Automatic Aid</option>
                <option value="MUTUAL">Mutual Aid</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setShowReceivedModal(true)}
              className="mt-4 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 shrink-0"
            >
              {selectedDepts.length > 0 ? 'Edit Departments' : 'Select Departments'}
            </button>
          </div>

          {/* Summary of selected */}
          {selectedDepts.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {selectedDepts.map(dept => (
                <span key={dept.id} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                  {getDeptDisplay(dept)}
                  <button type="button" onClick={() => toggleReceivedDept(dept.id)}
                    className="text-blue-600 hover:text-blue-900 ml-0.5">✕</button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-700 mt-1">No departments selected — click to select assisting departments</p>
          )}

          <p className="text-xs text-theme-hint mt-2">✓ This is our incident with assistance - damage assessment applies</p>

          {showReceivedModal && (
            <ReceivedAidModal
              departments={departments}
              deptUnits={deptUnits}
              stationGroups={stationGroups}
              stationToDept={stationToDept}
              selectedIds={selectedIds}
              onToggle={toggleReceivedDept}
              onClose={() => setShowReceivedModal(false)}
              onReload={loadDepartments}
            />
          )}
        </div>
      )}

      {/* NONE */}
      {direction === 'NONE' && hasAnswered && (
        <p className="text-xs text-theme-hint mt-1">✓ This is our incident - damage assessment applies</p>
      )}
    </div>
  );
}
