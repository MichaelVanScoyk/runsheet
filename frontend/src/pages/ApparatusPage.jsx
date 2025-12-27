import { useState, useEffect } from 'react';
import { getApparatus, createApparatus, updateApparatus, deleteApparatus, reactivateApparatus, hardDeleteApparatus } from '../api';

const API_BASE = '';

// Unit category definitions
// APPARATUS: Physical CAD units - engines, trucks, chief vehicles (configurable crew slots)
// DIRECT: Virtual unit for POV to scene
// STATION: Virtual unit for personnel at station (not on scene)
const UNIT_CATEGORIES = {
  APPARATUS: {
    label: 'Apparatus',
    description: 'Physical CAD units (engines, trucks, chief vehicles) - configurable crew slots and response time counting',
    color: 'text-status-open',
  },
  DIRECT: {
    label: 'Direct (POV to Scene)',
    description: 'Personnel going directly to scene in personal vehicles',
    color: 'text-blue-400',
  },
  STATION: {
    label: 'Station',
    description: 'Personnel who reported to the station (not on scene)',
    color: 'text-gray-400',
  },
};

function ApparatusPage({ embedded = false }) {
  const [units, setUnits] = useState([]);
  const [apparatusTypes, setApparatusTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    unit_designator: '',
    name: '',
    apparatus_type: '',
    neris_unit_type: '',
    unit_category: 'APPARATUS',
    counts_for_response_times: true,
    cad_unit_id: '',
    cad_unit_aliases: '',  // Comma-separated string for UI
    has_driver: true,
    has_officer: true,
    ff_slots: 4,
  });

  useEffect(() => {
    loadData();
    loadApparatusTypes();
  }, []);

  const loadData = async () => {
    try {
      // Include inactive units
      const res = await getApparatus(true);
      setUnits(res.data);
    } catch (err) {
      console.error('Failed to load units:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadApparatusTypes = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/lookups/neris/unit-types`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setApparatusTypes(data);
      }
    } catch (err) {
      console.error('Failed to load NERIS unit types:', err);
      setApparatusTypes([]);
    }
  };

  // Group units by category
  const apparatusUnits = units.filter(u => (u.unit_category || 'APPARATUS') === 'APPARATUS');
  const directUnits = units.filter(u => u.unit_category === 'DIRECT');
  const stationUnits = units.filter(u => u.unit_category === 'STATION');

  const handleAdd = (category) => {
    setEditing(null);
    
    // Set defaults based on category
    const isPhysical = category === 'APPARATUS';
    
    const defaultType = apparatusTypes.find(t => t.value === 'ENGINE_STRUCT') || apparatusTypes[0];
    
    setFormData({
      unit_designator: '',
      name: '',
      apparatus_type: isPhysical ? (defaultType?.description || 'Engine') : '',
      neris_unit_type: isPhysical ? (defaultType?.value || '') : '',
      unit_category: category,
      counts_for_response_times: isPhysical,  // APPARATUS counts by default
      cad_unit_id: '',
      cad_unit_aliases: '',
      has_driver: isPhysical,
      has_officer: isPhysical,
      ff_slots: isPhysical ? 4 : 0,
    });
    setShowModal(true);
  };

  const handleEdit = (item) => {
    setEditing(item);
    // Convert aliases array to comma-separated string for UI
    const aliasesStr = (item.cad_unit_aliases || []).join(', ');
    setFormData({
      unit_designator: item.unit_designator,
      name: item.name,
      apparatus_type: item.apparatus_type || '',
      neris_unit_type: item.neris_unit_type || '',
      unit_category: item.unit_category || 'APPARATUS',
      counts_for_response_times: item.counts_for_response_times ?? true,
      cad_unit_id: item.cad_unit_id || item.unit_designator,
      cad_unit_aliases: aliasesStr,
      has_driver: item.has_driver,
      has_officer: item.has_officer,
      ff_slots: item.ff_slots,
    });
    setShowModal(true);
  };

  const handleDeactivate = async (item) => {
    const msg = `Deactivate ${item.unit_designator}? It will be hidden but can be reactivated.`;
    if (!confirm(msg)) return;
    
    try {
      await deleteApparatus(item.id);
      loadData();
    } catch (err) {
      console.error('Failed to deactivate:', err);
      alert('Failed to deactivate');
    }
  };

  const handleReactivate = async (item) => {
    try {
      await reactivateApparatus(item.id);
      loadData();
    } catch (err) {
      console.error('Failed to reactivate:', err);
      alert('Failed to reactivate');
    }
  };

  const handlePermanentDelete = async (item) => {
    const msg = `PERMANENTLY DELETE ${item.unit_designator}?\n\nThis cannot be undone. The unit will be removed from the database.`;
    if (!confirm(msg)) return;
    
    try {
      await hardDeleteApparatus(item.id);
      loadData();
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete permanently');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // For virtual units (DIRECT/STATION), ensure counts_for_response_times is false
    const submitData = { ...formData };
    if (['DIRECT', 'STATION'].includes(submitData.unit_category)) {
      submitData.counts_for_response_times = false;
    }
    
    // If cad_unit_id is empty, use unit_designator
    if (!submitData.cad_unit_id) {
      submitData.cad_unit_id = submitData.unit_designator;
    }
    
    // Convert comma-separated aliases to array
    submitData.cad_unit_aliases = submitData.cad_unit_aliases
      ? submitData.cad_unit_aliases.split(',').map(a => a.trim().toUpperCase()).filter(a => a)
      : [];
    
    try {
      if (editing) {
        await updateApparatus(editing.id, submitData);
      } else {
        await createApparatus(submitData);
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      console.error('Failed to save:', err);
      alert('Failed to save');
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isPhysicalUnit = formData.unit_category === 'APPARATUS';

  // Render a section of units
  const renderUnitSection = (categoryKey, categoryUnits, showAddButton = true) => {
    const cat = UNIT_CATEGORIES[categoryKey];
    const isPhysical = categoryKey === 'APPARATUS';
    
    return (
      <div key={categoryKey} className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className={`text-lg font-semibold ${cat.color}`}>{cat.label}</h3>
            <p className="text-sm text-gray-400">{cat.description}</p>
          </div>
          {showAddButton && (
            <button 
              className="px-3 py-1.5 bg-accent-red text-white rounded text-sm hover:bg-accent-red-dark"
              onClick={() => handleAdd(categoryKey)}
            >
              + Add
            </button>
          )}
        </div>
        
        <div className="bg-dark-card rounded border border-dark-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-dark-hover text-left text-sm text-gray-400">
                <th className="px-3 py-2">Unit ID</th>
                <th className="px-3 py-2">Name</th>
                {isPhysical && <th className="px-3 py-2">Type</th>}
                {isPhysical && <th className="px-3 py-2">Capacity</th>}
                {isPhysical && <th className="px-3 py-2">Response Metrics</th>}
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categoryUnits.length === 0 ? (
                <tr>
                  <td colSpan={isPhysical ? 7 : 4} className="px-3 py-4 text-center text-gray-500">
                    No {cat.label.toLowerCase()} configured
                  </td>
                </tr>
              ) : (
                categoryUnits.map(unit => (
                  <tr 
                    key={unit.id} 
                    className={`border-t border-dark-border ${!unit.active ? 'opacity-50 bg-dark-hover/30' : ''}`}
                  >
                    <td className="px-3 py-2 font-semibold">{unit.unit_designator}</td>
                    <td className="px-3 py-2">{unit.name}</td>
                    {isPhysical && <td className="px-3 py-2 text-sm text-gray-400">{unit.apparatus_type || '-'}</td>}
                    {isPhysical && (
                      <td className="px-3 py-2 text-sm">
                        {(unit.has_driver ? 1 : 0) + (unit.has_officer ? 1 : 0) + unit.ff_slots}
                      </td>
                    )}
                    {isPhysical && (
                      <td className="px-3 py-2">
                        {unit.counts_for_response_times ? (
                          <span className="text-status-open text-sm">✓ Counts</span>
                        ) : (
                          <span className="text-gray-500 text-sm">No</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        unit.active ? 'bg-status-open/20 text-status-open' : 'bg-gray-600/20 text-gray-400'
                      }`}>
                        {unit.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2 flex-wrap">
                        <button 
                          className="text-sm text-gray-400 hover:text-white"
                          onClick={() => handleEdit(unit)}
                        >
                          Edit
                        </button>
                        {unit.active ? (
                          <button 
                            className="text-sm text-yellow-400 hover:text-yellow-300"
                            onClick={() => handleDeactivate(unit)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <>
                            <button 
                              className="text-sm text-status-open hover:text-green-400"
                              onClick={() => handleReactivate(unit)}
                            >
                              Reactivate
                            </button>
                            <button 
                              className="text-sm text-red-500 hover:text-red-400"
                              onClick={() => handlePermanentDelete(unit)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="p-4 text-gray-400">Loading units...</div>;
  }

  return (
    <div className={embedded ? '' : 'p-4'}>
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Units</h1>
          <p className="text-gray-400">Configure apparatus and personnel assignment units</p>
        </div>
      )}

      {renderUnitSection('APPARATUS', apparatusUnits)}
      {renderUnitSection('DIRECT', directUnits)}
      {renderUnitSection('STATION', stationUnits)}

      {/* Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="bg-dark-card border border-dark-border rounded-lg p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-4">
              {editing ? 'Edit' : 'Add'} {UNIT_CATEGORIES[formData.unit_category]?.label || 'Unit'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Category selector (only for new units) */}
              {!editing && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Category</label>
                  <select
                    className="w-full bg-dark-hover border border-dark-border rounded px-3 py-2 text-white"
                    value={formData.unit_category}
                    onChange={(e) => {
                      const cat = e.target.value;
                      handleChange('unit_category', cat);
                      // Reset defaults based on category
                      if (cat === 'APPARATUS') {
                        handleChange('counts_for_response_times', true);
                        handleChange('has_driver', true);
                        handleChange('has_officer', true);
                        handleChange('ff_slots', 4);
                      } else {
                        handleChange('counts_for_response_times', false);
                        handleChange('has_driver', false);
                        handleChange('has_officer', false);
                        handleChange('ff_slots', 0);
                      }
                    }}
                  >
                    {Object.entries(UNIT_CATEGORIES).map(([key, cat]) => (
                      <option key={key} value={key}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Unit designator */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Unit ID *</label>
                <input
                  type="text"
                  className="w-full bg-dark-hover border border-dark-border rounded px-3 py-2 text-white"
                  value={formData.unit_designator}
                  onChange={(e) => handleChange('unit_designator', e.target.value.toUpperCase())}
                  placeholder="ENG481"
                  required
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Display Name *</label>
                <input
                  type="text"
                  className="w-full bg-dark-hover border border-dark-border rounded px-3 py-2 text-white"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Engine 48-1"
                  required
                />
              </div>

              {/* CAD Unit ID (for physical units) */}
              {isPhysicalUnit && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    CAD Unit ID
                    <span className="text-gray-500 ml-1">(if different from Unit ID)</span>
                  </label>
                  <input
                    type="text"
                    className="w-full bg-dark-hover border border-dark-border rounded px-3 py-2 text-white"
                    value={formData.cad_unit_id}
                    onChange={(e) => handleChange('cad_unit_id', e.target.value.toUpperCase())}
                    placeholder={formData.unit_designator || 'Same as Unit ID'}
                  />
                </div>
              )}

              {/* CAD Unit Aliases (for physical units) */}
              {isPhysicalUnit && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    CAD Unit Aliases
                    <span className="text-gray-500 ml-1">(alternate IDs, comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    className="w-full bg-dark-hover border border-dark-border rounded px-3 py-2 text-white"
                    value={formData.cad_unit_aliases}
                    onChange={(e) => handleChange('cad_unit_aliases', e.target.value.toUpperCase())}
                    placeholder="e.g., 48QRS, SQUAD48"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    For dispatch centers using inconsistent unit IDs
                  </p>
                </div>
              )}

              {/* NERIS Type (for physical units) */}
              {isPhysicalUnit && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">NERIS Type</label>
                  <select
                    className="w-full bg-dark-hover border border-dark-border rounded px-3 py-2 text-white"
                    value={formData.neris_unit_type}
                    onChange={(e) => {
                      const selectedType = apparatusTypes.find(t => t.value === e.target.value);
                      handleChange('neris_unit_type', e.target.value);
                      handleChange('apparatus_type', selectedType?.description || '');
                    }}
                  >
                    <option value="">-- Select Type --</option>
                    {apparatusTypes.map(t => (
                      <option key={t.value} value={t.value}>{t.description}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Crew capacity (for physical units) */}
              {isPhysicalUnit && (
                <div className="space-y-2">
                  <label className="block text-sm text-gray-400">Crew Capacity</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-white">
                      <input
                        type="checkbox"
                        checked={formData.has_driver}
                        onChange={(e) => handleChange('has_driver', e.target.checked)}
                        className="rounded"
                      />
                      Driver
                    </label>
                    <label className="flex items-center gap-2 text-sm text-white">
                      <input
                        type="checkbox"
                        checked={formData.has_officer}
                        onChange={(e) => handleChange('has_officer', e.target.checked)}
                        className="rounded"
                      />
                      Officer
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-400">Additional seats:</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      className="w-20 bg-dark-hover border border-dark-border rounded px-2 py-1 text-white"
                      value={formData.ff_slots}
                      onChange={(e) => handleChange('ff_slots', parseInt(e.target.value) || 0)}
                    />
                    <span className="text-sm text-gray-500">
                      (Total: {(formData.has_driver ? 1 : 0) + (formData.has_officer ? 1 : 0) + formData.ff_slots})
                    </span>
                  </div>
                </div>
              )}

              {/* Response time toggle (for physical units only) */}
              {isPhysicalUnit && (
                <div className="pt-2 border-t border-dark-border">
                  <label className="flex items-center gap-2 text-sm text-white">
                    <input
                      type="checkbox"
                      checked={formData.counts_for_response_times}
                      onChange={(e) => handleChange('counts_for_response_times', e.target.checked)}
                      className="rounded"
                    />
                    Counts for response time metrics
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    Include this unit when calculating "first enroute" and "first on scene" times
                  </p>
                </div>
              )}

              {/* Virtual unit note */}
              {!isPhysicalUnit && (
                <div className="text-sm text-gray-500 bg-dark-hover rounded p-3">
                  {formData.unit_category === 'DIRECT' ? (
                    <>Personnel assigned here went directly to the scene (POV). They count toward incident personnel but not toward response time metrics.</>
                  ) : (
                    <>Personnel assigned here reported to the station. They count toward incident credit but were not on scene.</>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4">
                <button 
                  type="button"
                  className="px-4 py-2 text-gray-400 hover:text-white"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-accent-red text-white rounded hover:bg-accent-red-dark"
                >
                  {editing ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ApparatusPage;
