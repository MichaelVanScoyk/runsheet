/**
 * MutualAidTab - Admin tab for managing mutual aid departments and their units.
 *
 * Departments can be added manually or imported from the NERIS API.
 * Each department has configurable units with CAD prefixes for auto-matching.
 * Unit type dropdown pulls from neris_codes table (category = 'type_unit').
 * Works for all tenants regardless of NERIS feature toggle.
 */

import { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

const API = '/api/admin/neris-mutual-aid';

export default function MutualAidTab() {
  const toast = useToast();
  const confirmAction = useConfirm();

  // Departments
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptForm, setDeptForm] = useState({ name: '', station_number: '', neris_entity_id: '', address: '', city: '', state: '', zip_code: '', department_type: '' });

  // Units (expanded department)
  const [expandedDeptId, setExpandedDeptId] = useState(null);
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [unitForm, setUnitForm] = useState({ unit_designator: '', neris_unit_type: '', cad_prefix: '' });

  // Unit type options from neris_codes
  const [unitTypes, setUnitTypes] = useState([]);

  // NERIS import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importState, setImportState] = useState('');
  const [importResults, setImportResults] = useState([]);
  const [importSelected, setImportSelected] = useState(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [importNameFilter, setImportNameFilter] = useState('');

  useEffect(() => {
    loadDepartments();
    loadUnitTypes();
  }, []);

  // =========================================================================
  // DATA LOADING
  // =========================================================================

  const loadDepartments = async () => {
    try {
      const res = await fetch(`${API}/departments?include_inactive=true`);
      const data = await res.json();
      setDepartments(data);
    } catch (err) {
      console.error('Failed to load departments:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUnitTypes = async () => {
    try {
      const res = await fetch('/api/neris-codes/categories/type_unit');
      const data = await res.json();
      setUnitTypes(data);
    } catch (err) {
      console.error('Failed to load unit types:', err);
    }
  };

  const loadUnits = async (deptId) => {
    setUnitsLoading(true);
    try {
      const res = await fetch(`${API}/departments/${deptId}/units?include_inactive=true`);
      const data = await res.json();
      setUnits(data.units || []);
    } catch (err) {
      console.error('Failed to load units:', err);
    } finally {
      setUnitsLoading(false);
    }
  };

  // =========================================================================
  // DEPARTMENT CRUD
  // =========================================================================

  const handleExpandDept = (deptId) => {
    if (expandedDeptId === deptId) {
      setExpandedDeptId(null);
      setUnits([]);
    } else {
      setExpandedDeptId(deptId);
      loadUnits(deptId);
    }
  };

  const handleAddDept = () => {
    setEditingDept(null);
    setDeptForm({ name: '', station_number: '', neris_entity_id: '', address: '', city: '', state: '', zip_code: '', department_type: '' });
    setShowDeptModal(true);
  };

  const handleEditDept = (dept) => {
    setEditingDept(dept);
    setDeptForm({
      name: dept.name || '',
      station_number: dept.station_number || '',
      neris_entity_id: dept.neris_entity_id || '',
      address: dept.address || '',
      city: dept.city || '',
      state: dept.state || '',
      zip_code: dept.zip_code || '',
      department_type: dept.department_type || '',
    });
    setShowDeptModal(true);
  };

  const handleSaveDept = async () => {
    if (!deptForm.name.trim()) return;

    try {
      const url = editingDept ? `${API}/departments/${editingDept.id}` : `${API}/departments`;
      const method = editingDept ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deptForm),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail || 'Failed to save');
        return;
      }
      toast.success(editingDept ? 'Department updated' : 'Department added');
      setShowDeptModal(false);
      loadDepartments();
    } catch (err) {
      toast.error('Failed to save department');
    }
  };

  const handleDeactivateDept = async (dept) => {
    const confirmed = await confirmAction(`Deactivate ${dept.name}?`);
    if (!confirmed) return;

    try {
      await fetch(`${API}/departments/${dept.id}`, { method: 'DELETE' });
      toast.success('Department deactivated');
      loadDepartments();
    } catch (err) {
      toast.error('Failed to deactivate');
    }
  };

  // =========================================================================
  // UNIT CRUD
  // =========================================================================

  const handleAddUnit = () => {
    setEditingUnit(null);
    setUnitForm({ unit_designator: '', neris_unit_type: '', cad_prefix: '' });
    setShowUnitModal(true);
  };

  const handleEditUnit = (unit) => {
    setEditingUnit(unit);
    setUnitForm({
      unit_designator: unit.unit_designator || '',
      neris_unit_type: unit.neris_unit_type || '',
      cad_prefix: unit.cad_prefix || '',
    });
    setShowUnitModal(true);
  };

  const handleSaveUnit = async () => {
    if (!unitForm.unit_designator.trim()) return;

    try {
      const url = editingUnit
        ? `${API}/units/${editingUnit.id}`
        : `${API}/departments/${expandedDeptId}/units`;
      const method = editingUnit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unitForm),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail || 'Failed to save');
        return;
      }
      toast.success(editingUnit ? 'Unit updated' : 'Unit added');
      setShowUnitModal(false);
      loadUnits(expandedDeptId);
      loadDepartments();
    } catch (err) {
      toast.error('Failed to save unit');
    }
  };

  const handleDeleteUnit = async (unit) => {
    const confirmed = await confirmAction(`Delete ${unit.unit_designator}?`);
    if (!confirmed) return;

    try {
      await fetch(`${API}/units/${unit.id}`, { method: 'DELETE' });
      toast.success('Unit deleted');
      loadUnits(expandedDeptId);
      loadDepartments();
    } catch (err) {
      toast.error('Failed to delete unit');
    }
  };

  // =========================================================================
  // NERIS IMPORT
  // =========================================================================

  const handleOpenImport = () => {
    setImportState('PA');
    setImportResults([]);
    setImportSelected(new Set());
    setImportNameFilter('');
    setShowImportModal(true);
  };

  const handleSearchNeris = async () => {
    if (!importState.trim()) return;
    setImportLoading(true);
    try {
      const params = new URLSearchParams({ state: importState });
      if (importNameFilter.trim()) params.append('name_filter', importNameFilter.trim());
      const res = await fetch(`${API}/search-neris?${params}`);
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail || 'NERIS search failed');
        setImportResults([]);
        return;
      }
      const data = await res.json();
      setImportResults(data.departments || []);
      setImportSelected(new Set());
    } catch (err) {
      toast.error('Failed to search NERIS');
    } finally {
      setImportLoading(false);
    }
  };

  const handleToggleImport = (idx) => {
    setImportSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const handleConfirmImport = async () => {
    const selected = importResults.filter((_, i) => importSelected.has(i));
    if (!selected.length) return;

    setImportLoading(true);
    try {
      const res = await fetch(`${API}/import-neris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departments: selected.map(d => ({
            name: d.name,
            neris_entity_id: d.neris_entity_id,
            address: d.address,
            city: d.city,
            state: d.state,
            zip_code: d.zip_code,
            department_type: d.department_type,
          })),
        }),
      });
      const data = await res.json();
      toast.success(`Imported ${data.imported} department(s)${data.skipped ? `, ${data.skipped} skipped` : ''}`);
      setShowImportModal(false);
      loadDepartments();
    } catch (err) {
      toast.error('Import failed');
    } finally {
      setImportLoading(false);
    }
  };

  // =========================================================================
  // HELPERS
  // =========================================================================

  const getUnitTypeLabel = (value) => {
    if (!value) return '—';
    const found = unitTypes.find(t => t.value === value);
    return found ? found.display_text : value;
  };

  // =========================================================================
  // RENDER
  // =========================================================================

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Mutual Aid Departments</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleOpenImport}>Import from NERIS</button>
          <button className="btn btn-primary" onClick={handleAddDept}>+ Add Department</button>
        </div>
      </div>

      {/* Department Table */}
      <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ width: 30 }}></th>
            <th>Name</th>
            <th>Stn #</th>
            <th>NERIS Entity ID</th>
            <th>City</th>
            <th>Type</th>
            <th>Units</th>
            <th>Source</th>
            <th style={{ width: 100 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {departments.length === 0 && (
            <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#888' }}>No departments configured. Add manually or import from NERIS.</td></tr>
          )}
          {departments.map(dept => (
            <>
              <tr
                key={dept.id}
                style={{ cursor: 'pointer', opacity: dept.is_active ? 1 : 0.5, background: expandedDeptId === dept.id ? '#f0f4ff' : undefined }}
                onClick={() => handleExpandDept(dept.id)}
              >
                <td style={{ textAlign: 'center' }}>{expandedDeptId === dept.id ? '▼' : '▶'}</td>
                <td><strong>{dept.name}</strong></td>
                <td>{dept.station_number || '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{dept.neris_entity_id || '—'}</td>
                <td>{dept.city || '—'}</td>
                <td>{dept.department_type || '—'}</td>
                <td style={{ textAlign: 'center' }}>{dept.unit_count}</td>
                <td style={{ fontSize: 11, color: '#888' }}>{dept.import_source}</td>
                <td>
                  <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handleEditDept(dept); }}>Edit</button>
                  {dept.is_active && (
                    <button className="btn btn-sm btn-danger" style={{ marginLeft: 4 }} onClick={(e) => { e.stopPropagation(); handleDeactivateDept(dept); }}>✕</button>
                  )}
                </td>
              </tr>

              {/* Expanded Units */}
              {expandedDeptId === dept.id && (
                <tr key={`${dept.id}-units`}>
                  <td colSpan={9} style={{ padding: '8px 16px 16px 40px', background: '#f8f9fa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong>Units for {dept.name}</strong>
                      <button className="btn btn-sm btn-primary" onClick={handleAddUnit}>+ Add Unit</button>
                    </div>
                    {unitsLoading ? (
                      <div>Loading units...</div>
                    ) : units.length === 0 ? (
                      <div style={{ color: '#888', fontStyle: 'italic' }}>No units configured</div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #ddd' }}>
                            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Designator</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Unit Type</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px' }}>CAD Prefix</th>
                            <th style={{ width: 80 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {units.map(unit => (
                            <tr key={unit.id} style={{ borderBottom: '1px solid #eee', opacity: unit.is_active ? 1 : 0.5 }}>
                              <td style={{ padding: '4px 8px', fontWeight: 600 }}>{unit.unit_designator}</td>
                              <td style={{ padding: '4px 8px' }}>{getUnitTypeLabel(unit.neris_unit_type)}</td>
                              <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{unit.cad_prefix || '—'}</td>
                              <td>
                                <button className="btn btn-sm" onClick={() => handleEditUnit(unit)}>Edit</button>
                                <button className="btn btn-sm btn-danger" style={{ marginLeft: 4 }} onClick={() => handleDeleteUnit(unit)}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      {/* Department Modal */}
      {showDeptModal && (
        <div className="modal-overlay" onClick={() => setShowDeptModal(false)}>
          <div className="modal-content" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <h3>{editingDept ? 'Edit Department' : 'Add Department'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>Name *
                <input value={deptForm.name} onChange={e => setDeptForm(p => ({ ...p, name: e.target.value }))} />
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{ flex: 1 }}>Station #
                  <input value={deptForm.station_number} onChange={e => setDeptForm(p => ({ ...p, station_number: e.target.value }))} />
                </label>
                <label style={{ flex: 1 }}>NERIS Entity ID
                  <input value={deptForm.neris_entity_id} onChange={e => setDeptForm(p => ({ ...p, neris_entity_id: e.target.value }))} />
                </label>
              </div>
              <label>Address
                <input value={deptForm.address} onChange={e => setDeptForm(p => ({ ...p, address: e.target.value }))} />
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{ flex: 2 }}>City
                  <input value={deptForm.city} onChange={e => setDeptForm(p => ({ ...p, city: e.target.value }))} />
                </label>
                <label style={{ flex: 1 }}>State
                  <input value={deptForm.state} maxLength={2} onChange={e => setDeptForm(p => ({ ...p, state: e.target.value.toUpperCase() }))} />
                </label>
                <label style={{ flex: 1 }}>ZIP
                  <input value={deptForm.zip_code} onChange={e => setDeptForm(p => ({ ...p, zip_code: e.target.value }))} />
                </label>
              </div>
              <label>Department Type
                <input value={deptForm.department_type} onChange={e => setDeptForm(p => ({ ...p, department_type: e.target.value }))} />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowDeptModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveDept} disabled={!deptForm.name.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Unit Modal */}
      {showUnitModal && (
        <div className="modal-overlay" onClick={() => setShowUnitModal(false)}>
          <div className="modal-content" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3>{editingUnit ? 'Edit Unit' : 'Add Unit'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>Unit Designator * (e.g. E49, L49)
                <input value={unitForm.unit_designator} onChange={e => setUnitForm(p => ({ ...p, unit_designator: e.target.value }))} />
              </label>
              <label>Unit Type
                <select value={unitForm.neris_unit_type} onChange={e => setUnitForm(p => ({ ...p, neris_unit_type: e.target.value }))}>
                  <option value="">— Select —</option>
                  {unitTypes.map(t => (
                    <option key={t.value} value={t.value}>{t.display_text}</option>
                  ))}
                </select>
              </label>
              <label>CAD Prefix (for auto-matching)
                <input value={unitForm.cad_prefix} onChange={e => setUnitForm(p => ({ ...p, cad_prefix: e.target.value }))} />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowUnitModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveUnit} disabled={!unitForm.unit_designator.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* NERIS Import Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal-content" style={{ maxWidth: 700, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3>Import from NERIS</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <label style={{ flex: 0 }}>State
                <input value={importState} maxLength={2} style={{ width: 60 }} onChange={e => setImportState(e.target.value.toUpperCase())} />
              </label>
              <label style={{ flex: 1 }}>Filter by name
                <input value={importNameFilter} onChange={e => setImportNameFilter(e.target.value)} />
              </label>
              <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={handleSearchNeris} disabled={importLoading}>
                {importLoading ? 'Searching...' : 'Search'}
              </button>
            </div>

            {importResults.length > 0 && (
              <>
                <div style={{ marginBottom: 8, color: '#666', fontSize: 13 }}>
                  {importResults.length} results — select departments to import
                </div>
                <div style={{ maxHeight: 400, overflow: 'auto', border: '1px solid #ddd', borderRadius: 4 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #ddd', position: 'sticky', top: 0, background: '#fff' }}>
                        <th style={{ width: 30, padding: '6px 4px' }}></th>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>Name</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>NERIS ID</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>City</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResults.map((dept, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid #eee',
                            opacity: dept.already_imported ? 0.4 : 1,
                            cursor: dept.already_imported ? 'default' : 'pointer',
                            background: importSelected.has(idx) ? '#e8f0fe' : undefined,
                          }}
                          onClick={() => !dept.already_imported && handleToggleImport(idx)}
                        >
                          <td style={{ textAlign: 'center', padding: '4px' }}>
                            {dept.already_imported
                              ? <span title="Already imported">✓</span>
                              : <input type="checkbox" checked={importSelected.has(idx)} readOnly />
                            }
                          </td>
                          <td style={{ padding: '4px 8px' }}>{dept.name}</td>
                          <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: 11 }}>{dept.neris_entity_id}</td>
                          <td style={{ padding: '4px 8px' }}>{dept.city}</td>
                          <td style={{ padding: '4px 8px' }}>{dept.department_type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    onClick={handleConfirmImport}
                    disabled={importSelected.size === 0 || importLoading}
                  >
                    {importLoading ? 'Importing...' : `Import ${importSelected.size} Selected`}
                  </button>
                </div>
              </>
            )}

            {importResults.length === 0 && !importLoading && (
              <div style={{ textAlign: 'center', padding: 20, color: '#888' }}>
                Search for departments by state to get started
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
