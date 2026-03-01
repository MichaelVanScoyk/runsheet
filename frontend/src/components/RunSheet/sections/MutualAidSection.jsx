import { useState, useEffect, useMemo } from 'react';
import { useRunSheet } from '../RunSheetContext';

const API = '/api/admin/neris-mutual-aid';

export default function MutualAidSection() {
  const { formData, handleChange } = useRunSheet();

  const direction = formData.neris_aid_direction;
  const hasAnswered = direction === 'NONE' || direction === 'GIVEN' || direction === 'RECEIVED';

  const [departments, setDepartments] = useState([]);
  const [unitRecords, setUnitRecords] = useState([]); // flat list of all unit records across depts
  const [deptLoading, setDeptLoading] = useState(false);

  // Map unit state
  const [mappingUnit, setMappingUnit] = useState(null);
  const [mapMode, setMapMode] = useState('existing');
  const [mapDeptId, setMapDeptId] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptStation, setNewDeptStation] = useState('');
  const [mapSaving, setMapSaving] = useState(false);

  // GIVEN add
  const [addingStation, setAddingStation] = useState(null);
  const [addName, setAddName] = useState('');
  const [addStationNum, setAddStationNum] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const selectedIds = useMemo(() => {
    return (formData.mutual_aid_department_ids || []).map(v => Number(v));
  }, [formData.mutual_aid_department_ids]);

  const maUnits = useMemo(() => {
    return (formData.cad_units || []).filter(u => u.is_mutual_aid && u.time_enroute);
  }, [formData.cad_units]);

  // Unit designator → department lookup (only explicit links)
  const unitToDept = useMemo(() => {
    const map = {};
    for (const rec of unitRecords) {
      if (rec.unit_designator && rec.department_id) {
        const dept = departments.find(d => d.id === rec.department_id);
        if (dept) map[rec.unit_designator] = dept;
      }
    }
    return map;
  }, [unitRecords, departments]);

  useEffect(() => {
    if ((direction === 'GIVEN' || direction === 'RECEIVED') && departments.length === 0) {
      loadAll();
    }
  }, [direction]);

  const loadAll = async () => {
    setDeptLoading(true);
    try {
      const res = await fetch(`${API}/departments`);
      const depts = await res.json();
      setDepartments(depts);

      // Load all unit records
      const allUnits = [];
      for (const dept of depts) {
        try {
          const uRes = await fetch(`${API}/departments/${dept.id}/units`);
          const uData = await uRes.json();
          for (const u of (uData.units || [])) {
            allUnits.push({ ...u, department_id: dept.id });
          }
        } catch (e) { /* skip */ }
      }
      setUnitRecords(allUnits);
    } catch (err) {
      console.error('Failed to load:', err);
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

  const selectGivenDept = (deptId) => handleChange('mutual_aid_department_ids', [deptId]);

  const toggleDept = (deptId) => {
    const id = Number(deptId);
    const current = [...selectedIds];
    const idx = current.indexOf(id);
    idx >= 0 ? current.splice(idx, 1) : current.push(id);
    handleChange('mutual_aid_department_ids', current);
  };

  const ensureSelected = (deptId) => {
    const id = Number(deptId);
    if (!selectedIds.includes(id)) {
      handleChange('mutual_aid_department_ids', [...selectedIds, id]);
    }
  };

  const handleMapToExisting = async () => {
    if (!mappingUnit || !mapDeptId) return;
    setMapSaving(true);
    try {
      await fetch(`${API}/departments/${mapDeptId}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_designator: mappingUnit }),
      });
      await loadAll();
      ensureSelected(Number(mapDeptId));
      setMappingUnit(null);
    } catch (err) {
      console.error('Failed to map unit:', err);
    } finally {
      setMapSaving(false);
    }
  };

  const handleMapToNew = async () => {
    if (!mappingUnit || !newDeptName.trim()) return;
    setMapSaving(true);
    try {
      const res = await fetch(`${API}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDeptName.trim(), station_number: newDeptStation.trim() || null }),
      });
      if (!res.ok) return;
      const data = await res.json();
      await fetch(`${API}/departments/${data.id}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_designator: mappingUnit }),
      });
      await loadAll();
      ensureSelected(data.id);
      setMappingUnit(null);
      setNewDeptName('');
      setNewDeptStation('');
    } catch (err) {
      console.error('Failed to create dept:', err);
    } finally {
      setMapSaving(false);
    }
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
      await loadAll();
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

  // RECEIVED: group mapped units by department, collect unmapped
  const { mappedGroups, unmappedUnits } = useMemo(() => {
    const groups = {};
    const unmapped = [];
    for (const unit of maUnits) {
      const dept = unitToDept[unit.unit_id];
      if (dept) {
        if (!groups[dept.id]) groups[dept.id] = { dept, units: [] };
        groups[dept.id].units.push(unit.unit_id);
      } else {
        unmapped.push(unit.unit_id);
      }
    }
    return { mappedGroups: Object.values(groups), unmappedUnits: unmapped };
  }, [maUnits, unitToDept]);

  // Auto-select mapped departments on first load
  const [autoSelectDone, setAutoSelectDone] = useState(false);
  useEffect(() => {
    if (direction !== 'RECEIVED' || autoSelectDone || deptLoading) return;
    if (mappedGroups.length === 0) return;
    // Only auto-select if no selections exist yet
    if (selectedIds.length > 0) { setAutoSelectDone(true); return; }
    const autoIds = mappedGroups.map(g => g.dept.id);
    if (autoIds.length > 0) {
      handleChange('mutual_aid_department_ids', autoIds);
    }
    setAutoSelectDone(true);
  }, [direction, mappedGroups, deptLoading, autoSelectDone, selectedIds]);

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
            <button key={dir} type="button" onClick={() => handleDirectionSelect(dir)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                direction === dir
                  ? dir === 'NONE' ? 'bg-blue-600 text-white'
                    : dir === 'GIVEN' ? 'bg-green-600 text-white'
                    : 'bg-orange-600 text-white'
                  : 'bg-theme-section-alt text-theme-muted hover:bg-gray-200 border border-theme'
              }`}>
              {dir === 'NONE' ? 'No - Our First Due' : dir === 'GIVEN' ? 'Yes - We Gave Aid' : 'Yes - We Received Aid'}
            </button>
          ))}
        </div>
        {!hasAnswered && <p className="text-xs text-amber-700 mt-2">⚠️ Please answer to continue with damage assessment</p>}
      </div>

      {/* GIVEN */}
      {direction === 'GIVEN' && (
        <div className="pt-3 border-t border-theme-light">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-theme-muted text-xs">Aid Type</label>
              <select value={formData.neris_aid_type || ''} onChange={(e) => handleChange('neris_aid_type', e.target.value || null)}
                className="w-full bg-white border border-theme rounded px-3 py-1.5 text-sm text-theme-primary focus:border-primary-color focus:outline-none">
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
              ) : selectedIds.length > 0 ? (() => {
                const selected = departments.find(d => d.id === selectedIds[0]);
                return selected ? (
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium">{getDeptDisplay(selected)}</span>
                    <button type="button" onClick={() => handleChange('mutual_aid_department_ids', [])} className="text-xs text-red-600 hover:underline">✕</button>
                  </div>
                ) : null;
              })() : (
                <select value="" onChange={(e) => {
                  if (e.target.value === '__add__') { setAddingStation('manual'); setAddName(''); setAddStationNum(''); }
                  else if (e.target.value) selectGivenDept(Number(e.target.value));
                }} className="w-full bg-white border border-theme rounded px-3 py-1.5 text-sm text-theme-primary focus:border-primary-color focus:outline-none">
                  <option value="">Select station...</option>
                  {departments.map(dept => <option key={dept.id} value={dept.id}>{getDeptDisplay(dept)}</option>)}
                  <option value="__add__">+ Add station not in list...</option>
                </select>
              )}
            </div>
          </div>
          {addingStation && (
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
                className="px-2 py-1 bg-blue-600 text-white text-sm rounded disabled:opacity-50">{addSaving ? '...' : 'Add'}</button>
              <button type="button" onClick={() => setAddingStation(null)}
                className="px-2 py-1 text-xs text-theme-muted hover:text-theme-primary">Cancel</button>
            </div>
          )}
          <p className="text-xs text-theme-hint mt-2">✓ We assisted another station - they track damage for their report</p>
        </div>
      )}

      {/* RECEIVED */}
      {direction === 'RECEIVED' && (
        <div className="pt-3 border-t border-theme-light">
          <div className="mb-3">
            <label className="text-theme-muted text-xs">Aid Type</label>
            <select value={formData.neris_aid_type || ''} onChange={(e) => handleChange('neris_aid_type', e.target.value || null)}
              className="w-full md:w-48 bg-white border border-theme rounded px-3 py-1.5 text-sm text-theme-primary focus:border-primary-color focus:outline-none">
              <option value="">Select type...</option>
              <option value="AUTOMATIC">Automatic Aid</option>
              <option value="MUTUAL">Mutual Aid</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <label className="text-theme-muted text-xs mb-1.5 block">Mutual Aid Units on This Call</label>

          {deptLoading ? (
            <div className="text-sm text-theme-hint">Loading...</div>
          ) : maUnits.length === 0 ? (
            <p className="text-xs text-theme-hint">No mutual aid units went enroute.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {/* Mapped: department chips with unit IDs */}
              {mappedGroups.map(({ dept, units }) => {
                const isSelected = selectedIds.includes(dept.id);
                return (
                  <button key={dept.id} type="button" onClick={() => toggleDept(dept.id)}
                    className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors border ${
                      isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-theme-primary border-theme hover:bg-gray-100'
                    }`}>
                    {dept.name} <span className={isSelected ? 'text-blue-200' : 'text-theme-hint'}>({units.join(', ')})</span>
                  </button>
                );
              })}

              {/* Unmapped: individual unit chips */}
              {unmappedUnits.map(unitId => (
                <button key={unitId} type="button"
                  onClick={() => { setMappingUnit(unitId); setMapMode('existing'); setMapDeptId(''); setNewDeptName(''); setNewDeptStation(''); }}
                  className={`px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
                    mappingUnit === unitId
                      ? 'bg-amber-100 border-amber-400 text-amber-900'
                      : 'border-dashed border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}>
                  {unitId} <span className="text-amber-500">?</span>
                </button>
              ))}
            </div>
          )}

          {/* Map unit form */}
          {mappingUnit && (
            <div className="p-2.5 bg-white border border-theme rounded mb-2 text-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">Map <strong>{mappingUnit}</strong> to:</span>
                <button type="button" onClick={() => setMappingUnit(null)} className="text-xs text-theme-muted hover:text-theme-primary">✕</button>
              </div>
              <div className="flex gap-2 mb-2">
                <button type="button" onClick={() => setMapMode('existing')}
                  className={`text-xs px-2 py-0.5 rounded ${mapMode === 'existing' ? 'bg-blue-100 text-blue-700' : 'text-theme-muted hover:bg-gray-100'}`}>Existing</button>
                <button type="button" onClick={() => setMapMode('new')}
                  className={`text-xs px-2 py-0.5 rounded ${mapMode === 'new' ? 'bg-blue-100 text-blue-700' : 'text-theme-muted hover:bg-gray-100'}`}>New Department</button>
              </div>
              {mapMode === 'existing' ? (
                <div className="flex flex-wrap items-end gap-2">
                  <select value={mapDeptId} onChange={(e) => setMapDeptId(e.target.value)}
                    className="flex-1 min-w-0 bg-white border border-theme rounded px-2 py-1 text-sm focus:border-primary-color focus:outline-none">
                    <option value="">Select department...</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{getDeptDisplay(d)}</option>)}
                  </select>
                  <button type="button" onClick={handleMapToExisting} disabled={!mapDeptId || mapSaving}
                    className="px-2.5 py-1 bg-blue-600 text-white text-xs rounded disabled:opacity-50 shrink-0">{mapSaving ? '...' : 'Assign'}</button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs text-theme-muted">Name *</label>
                    <input value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)}
                      className="bg-white border border-theme rounded px-2 py-1 text-sm w-40 focus:border-primary-color focus:outline-none" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs text-theme-muted">Stn #</label>
                    <input value={newDeptStation} onChange={(e) => setNewDeptStation(e.target.value)}
                      className="bg-white border border-theme rounded px-2 py-1 text-sm w-16 focus:border-primary-color focus:outline-none" />
                  </div>
                  <button type="button" onClick={handleMapToNew} disabled={!newDeptName.trim() || mapSaving}
                    className="px-2.5 py-1 bg-blue-600 text-white text-xs rounded disabled:opacity-50 shrink-0">{mapSaving ? '...' : 'Create & Assign'}</button>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-theme-hint mt-2">✓ This is our incident with assistance - damage assessment applies</p>
        </div>
      )}

      {direction === 'NONE' && hasAnswered && (
        <p className="text-xs text-theme-hint mt-1">✓ This is our incident - damage assessment applies</p>
      )}
    </div>
  );
}
