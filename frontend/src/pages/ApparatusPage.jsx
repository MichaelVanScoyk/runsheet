import { useState, useEffect } from 'react';
import { getApparatus, createApparatus, updateApparatus, deleteApparatus } from '../api';

const API_BASE = 'http://71.185.249.212:8001';

function ApparatusPage() {
  const [apparatus, setApparatus] = useState([]);
  const [apparatusTypes, setApparatusTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('truck'); // 'truck' or 'auxiliary'
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    unit_designator: '',
    name: '',
    apparatus_type: '',
    neris_unit_type: '',
    has_driver: true,
    has_officer: true,
    ff_slots: 4,
    is_virtual: false,
  });

  useEffect(() => {
    loadData();
    loadApparatusTypes();
  }, []);

  const loadData = async () => {
    try {
      const res = await getApparatus();
      setApparatus(res.data);
    } catch (err) {
      console.error('Failed to load apparatus:', err);
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
      console.error('Failed to load NERIS apparatus types:', err);
      setApparatusTypes([]);
    }
  };

  // Split into real apparatus and auxiliary roles
  const realApparatus = apparatus.filter(a => !a.is_virtual);
  const auxiliaryRoles = apparatus.filter(a => a.is_virtual);

  const handleAddTruck = () => {
    setEditing(null);
    setModalType('truck');
    const defaultType = apparatusTypes.find(t => t.value === 'ENGINE_STRUCT') || apparatusTypes[0];
    setFormData({
      unit_designator: '',
      name: '',
      apparatus_type: defaultType?.description || 'Engine',
      neris_unit_type: defaultType?.value || '',
      has_driver: true,
      has_officer: true,
      ff_slots: 4,
      is_virtual: false,
    });
    setShowModal(true);
  };

  const handleAddAuxiliary = () => {
    setEditing(null);
    setModalType('auxiliary');
    setFormData({
      unit_designator: '',
      name: '',
      apparatus_type: 'Auxiliary',
      neris_unit_type: '',
      has_driver: false,
      has_officer: false,
      ff_slots: 0,
      is_virtual: true,
    });
    setShowModal(true);
  };

  const handleEdit = (item) => {
    setEditing(item);
    setModalType(item.is_virtual ? 'auxiliary' : 'truck');
    setFormData({
      unit_designator: item.unit_designator,
      name: item.name,
      apparatus_type: item.apparatus_type,
      neris_unit_type: item.neris_unit_type || '',
      has_driver: item.has_driver,
      has_officer: item.has_officer,
      ff_slots: item.ff_slots,
      is_virtual: item.is_virtual,
    });
    setShowModal(true);
  };

  const handleDelete = async (item) => {
    const msg = item.is_virtual 
      ? `Remove auxiliary role "${item.unit_designator}"?`
      : `Deactivate ${item.unit_designator}?`;
    if (!confirm(msg)) return;
    
    try {
      await deleteApparatus(item.id);
      loadData();
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to remove');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editing) {
        await updateApparatus(editing.id, formData);
      } else {
        await createApparatus(formData);
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

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div>
      {/* Real Apparatus Section */}
      <div className="page-header">
        <h2>Apparatus</h2>
        <button className="btn btn-primary" onClick={handleAddTruck}>
          + Add Apparatus
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Unit</th>
              <th>Name</th>
              <th>Type</th>
              <th>Capacity</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {realApparatus.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>No apparatus configured</td></tr>
            ) : (
              realApparatus.map((a) => (
                <tr key={a.id} className={!a.active ? 'inactive-row' : ''}>
                  <td><strong>{a.unit_designator}</strong></td>
                  <td>{a.name}</td>
                  <td>{a.apparatus_type}</td>
                  <td>{(a.has_driver ? 1 : 0) + (a.has_officer ? 1 : 0) + a.ff_slots}</td>
                  <td>
                    <span className={`badge ${a.active ? 'badge-open' : 'badge-closed'}`}>
                      {a.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(a)}>Edit</button>
                      {a.active && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a)}>Deactivate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Auxiliary Roles Section */}
      <div className="page-header" style={{ marginTop: '3rem' }}>
        <h2>Auxiliary Roles</h2>
        <button className="btn btn-primary" onClick={handleAddAuxiliary}>
          + Add Role
        </button>
      </div>
      <p style={{ color: '#888', marginBottom: '1rem', fontSize: '0.85rem' }}>
        For personnel who responded direct to scene, stayed at station, or other non-apparatus assignments.
      </p>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Description</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {auxiliaryRoles.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', color: '#888' }}>No auxiliary roles configured</td></tr>
            ) : (
              auxiliaryRoles.map((a) => (
                <tr key={a.id} className={!a.active ? 'inactive-row' : ''}>
                  <td><strong>{a.unit_designator}</strong></td>
                  <td>{a.name}</td>
                  <td>
                    <span className={`badge ${a.active ? 'badge-open' : 'badge-closed'}`}>
                      {a.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(a)}>Edit</button>
                      {a.active && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a)}>Remove</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? 'Edit' : 'Add'} {modalType === 'truck' ? 'Apparatus' : 'Auxiliary Role'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>{modalType === 'truck' ? 'Unit Designator' : 'Role Name'} *</label>
                <input
                  type="text"
                  value={formData.unit_designator}
                  onChange={(e) => handleChange('unit_designator', e.target.value.toUpperCase())}
                  placeholder={modalType === 'truck' ? 'ENG481' : 'DIRECT'}
                  required
                />
              </div>

              <div className="form-group">
                <label>{modalType === 'truck' ? 'Full Name' : 'Description'} *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder={modalType === 'truck' ? 'Engine 48-1' : 'Direct to Scene'}
                  required
                />
              </div>

              {modalType === 'truck' && (
                <>
                  <div className="form-group">
                    <label>Type (NERIS)</label>
                    <select
                      value={formData.neris_unit_type}
                      onChange={(e) => {
                        const selectedType = apparatusTypes.find(t => t.value === e.target.value);
                        handleChange('neris_unit_type', e.target.value);
                        handleChange('apparatus_type', selectedType?.description || '');
                      }}
                    >
                      <option value="">-- Select Type --</option>
                      {apparatusTypes.map(t => (
                        <option key={t.value} value={t.value}>
                          {t.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={formData.has_driver}
                          onChange={(e) => handleChange('has_driver', e.target.checked)}
                        />
                        {' '}Driver Seat
                      </label>
                    </div>
                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={formData.has_officer}
                          onChange={(e) => handleChange('has_officer', e.target.checked)}
                        />
                        {' '}Officer Seat
                      </label>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Additional Crew Seats</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={formData.ff_slots}
                      onChange={(e) => handleChange('ff_slots', parseInt(e.target.value) || 0)}
                    />
                    <small style={{ color: '#888' }}>
                      Total capacity: {(formData.has_driver ? 1 : 0) + (formData.has_officer ? 1 : 0) + formData.ff_slots}
                    </small>
                  </div>
                </>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
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