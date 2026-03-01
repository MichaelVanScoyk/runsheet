import { useState, useEffect, useMemo } from 'react';
import { useRunSheet } from '../RunSheetContext';

const API = '/api/admin/neris-mutual-aid';

function extractStationNumber(unitId) {
  if (!unitId) return null;
  const match = unitId.match(/[A-Za-z]+(\d+)/);
  return match ? match[1] : null;
}

export default function MutualAidSection() {
  const { formData, handleChange } = useRunSheet();

  const direction = formData.neris_aid_direction;
  const hasAnswered = direction === 'NONE' || direction === 'GIVEN' || direction === 'RECEIVED';

  const [departments, setDepartments] = useState([]);
  const [deptLoading, setDeptLoading] = useState(false);

  // Inline add
  const [addingStation, setAddingStation] = useState(null); // station number or 'manual'
  const [addName, setAddName] = useState('');
  const [addStationNum, setAddStationNum] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const selectedIds = useMemo(() => {
    return (formData.mutual_aid_department_ids || []).map(v => Number(v));
  }, [formData.mutual_aid_department_ids]);

  // CAD mutual aid units that went enroute
  const maUnits = useMemo(() => {
    return (formData.cad_units || []).filter(u => u.is_mutual_aid && u.time_enroute);
  }, [formData.cad_units]);

  // Unique station numbers from CAD MA units
  const cadStations = useMemo(() => {
    const map = {};
    for (const unit of maUnits) {
      const stn = extractStationNumber(unit.unit_id);
      if (!stn) continue;
      if (!map[stn]) map[stn] = [];
      map[stn].push(unit.unit_id);
    }
    return map;
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
    if ((direction === 'GIVEN' || direction === 'RECEIVED') && departments.length === 0) {
      loadDepartments();
    }
  }, [direction]);

  const loadDepartments = async () => {
    setDeptLoading(true);
    try {
      const res = await fetch(`${API}/departments`);
      setDepartments(await res.json());
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

  // RECEIVED: toggle multi
  const toggleDept = (deptId) => {
    const id = Number(deptId);
    const current = [...selectedIds];
    const idx = current.indexOf(id);
    idx >= 0 ? current.splice(idx, 1) : current.push(id);
    handleChange('mutual_aid_department_ids', current);
  };

  // Add new department
  const handleAddStation = async () => {
    if (!addName.trim()) return;
    const stn = addStationNum.trim() || (addingStation !== 'manual' ? addingStation : null);
    setAddSaving(true);
    try {
      const res = await fetch(`${API}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), station_number: stn || null }),
      });
      if (!res.ok) return;
      const data = await res.json();
      await loadDepartments();

      if (direction === 'GIVEN') {
        handleChange('mutual_aid_department_ids', [data.id]);
      } else {
        handleChange('mutual_aid_department_ids', [...selectedIds, data.id]);
      }
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

  // For RECEIVED: build list of station chips from CAD data
  const receivedStations = useMemo(() => {
    const items = [];
    for (const [stn, unitIds] of Object.entries(cadStations)) {
      const dept = stationToDept[stn];
      items.push({
        stationNum: stn,
        unitIds,
        dept, // null if not in database
        deptId: dept?.id || null,
      });
    }
    // Sort: matched first, then by station number
    items.sort((a, b) => {
      if (a.dept && !b.dept) return -1;
      if (!a.dept && b.dept) return 1;
      return a.stationNum.localeCompare(b.stationNum, undefined, { numeric: true });
    });
    return items;
  }, [cadStations, stationToDept]);

  // =========================================================================
  // INLINE ADD FORM (shared)
  // =========================================================================
  const renderAddForm = () => {
    if (!addingStation) return null;
    const prefillStn = addingStation !== 'manual' ? addingStation : '';
    return (
      <div className="flex flex-wrap items-end gap-2 mt-2 p-2 bg-white border border-theme rounded text-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-theme-muted">Name *</label>
          <input value={addName} onChange={(e) => setAddName(e.target.value)}
            className="bg-white border border-theme rounded px-2 py-1 text-sm w-44 focus:border-primary-color focus:outline-none" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-theme-muted">Stn #</label>
          <input value={addStationNum || prefillStn} onChange={(e) => setAddStationNum(e.target.value)}
            className="bg-white border border-theme rounded px-2 py-1 text-sm w-16 focus:border-primary-color focus:outline-none" />
        </div>
        <button type="button" onClick={handleAddStation} disabled={!addName.trim() || addSaving}
          className="px-2 py-1 bg-blue-600 text-white text-sm rounded disabled:opacity-50">
          {addSaving ? '...' : 'Add'}
        </button>
        <button type="button" onClick={() => { setAddingStation(null); setAddName(''); setAddStationNum(''); }}
          className="px-2 py-1 text-xs text-theme-muted hover:text-theme-primary">Cancel</button>
      </div>
    );
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
      {/* GIVEN: single select dropdown                                     */}
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
          {addingStation && renderAddForm()}
          <p className="text-xs text-theme-hint mt-2">✓ We assisted another station - they track damage for their report</p>
        </div>
      )}

      {/* ================================================================= */}
      {/* RECEIVED: compact chip multi-select                               */}
      {/* ================================================================= */}
      {direction === 'RECEIVED' && (
        <div className="pt-3 border-t border-theme-light">
          <div className="mb-3">
            <label className="text-theme-muted text-xs">Aid Type</label>
            <select
              value={formData.neris_aid_type || ''}
              onChange={(e) => handleChange('neris_aid_type', e.target.value || null)}
              className="w-full md:w-48 bg-white border border-theme rounded px-3 py-1.5 text-sm text-theme-primary focus:border-primary-color focus:outline-none"
            >
              <option value="">Select type...</option>
              <option value="AUTOMATIC">Automatic Aid</option>
              <option value="MUTUAL">Mutual Aid</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <label className="text-theme-muted text-xs mb-1.5 block">Departments That Assisted Us</label>

          {deptLoading ? (
            <div className="text-sm text-theme-hint">Loading...</div>
          ) : (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {/* CAD-detected stations */}
              {receivedStations.map(({ stationNum, unitIds, dept, deptId }) => {
                if (dept) {
                  const isSelected = selectedIds.includes(deptId);
                  return (
                    <button
                      key={stationNum}
                      type="button"
                      onClick={() => toggleDept(deptId)}
                      className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-theme-primary border-theme hover:bg-gray-100'
                      }`}
                      title={`Units: ${unitIds.join(', ')}`}
                    >
                      {dept.name} ({stationNum})
                    </button>
                  );
                } else {
                  return (
                    <button
                      key={stationNum}
                      type="button"
                      onClick={() => { setAddingStation(stationNum); setAddName(''); setAddStationNum(stationNum); }}
                      className="px-2.5 py-1.5 rounded text-xs font-medium border border-dashed border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      title={`Units: ${unitIds.join(', ')} — click to add`}
                    >
                      Stn {stationNum} <span className="text-amber-500">+</span>
                    </button>
                  );
                }
              })}

              {/* Departments already selected but not from CAD (manually added previously) */}
              {selectedIds.filter(id => !receivedStations.some(rs => rs.deptId === id)).map(id => {
                const dept = departments.find(d => d.id === id);
                if (!dept) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleDept(id)}
                    className="px-2.5 py-1.5 rounded text-xs font-medium bg-blue-600 text-white border border-blue-600"
                  >
                    {getDeptDisplay(dept)}
                  </button>
                );
              })}

              {/* Add department not in CAD */}
              {addingStation === null && (
                <button
                  type="button"
                  onClick={() => { setAddingStation('manual'); setAddName(''); setAddStationNum(''); }}
                  className="px-2.5 py-1.5 rounded text-xs text-blue-600 border border-dashed border-blue-300 hover:bg-blue-50"
                >
                  + Other
                </button>
              )}
            </div>
          )}

          {addingStation && renderAddForm()}

          <p className="text-xs text-theme-hint mt-2">✓ This is our incident with assistance - damage assessment applies</p>
        </div>
      )}

      {/* NONE */}
      {direction === 'NONE' && hasAnswered && (
        <p className="text-xs text-theme-hint mt-1">✓ This is our incident - damage assessment applies</p>
      )}
    </div>
  );
}
