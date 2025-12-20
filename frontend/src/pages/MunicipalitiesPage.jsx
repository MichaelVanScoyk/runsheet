import { useState, useEffect } from 'react';
import { getMunicipalities, createMunicipality, updateMunicipality, deleteMunicipality } from '../api';

function MunicipalitiesPage() {
  const [municipalities, setMunicipalities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [subdivisionLabel, setSubdivisionLabel] = useState('Township');
  const [formData, setFormData] = useState({
    code: '',
    display_name: '',
    subdivision_type: 'Township',
  });

  const subdivisionTypes = ['Township', 'Borough', 'City', 'Village', 'Parish', 'Precinct', 'District', 'County'];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await getMunicipalities();
      setMunicipalities(res.data || []);
      
      // Try to get subdivision label setting
      try {
        const settingsRes = await fetch('http://71.185.249.212:8001/api/settings/subdivision_label');
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setSubdivisionLabel(data.value || 'Township');
        }
      } catch (e) {
        // Ignore - use default
      }
    } catch (err) {
      console.error('Failed to load municipalities:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditing(null);
    setFormData({
      code: '',
      display_name: '',
      subdivision_type: subdivisionLabel,
    });
    setShowModal(true);
  };

  const handleEdit = (item) => {
    setEditing(item);
    setFormData({
      code: item.code,
      display_name: item.display_name || item.name,
      subdivision_type: item.subdivision_type || subdivisionLabel,
    });
    setShowModal(true);
  };

  const handleDelete = async (item) => {
    if (!confirm(`Remove "${item.display_name || item.code}"? This will deactivate it.`)) return;
    
    try {
      await deleteMunicipality(item.id);
      loadData();
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to remove');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const payload = {
        code: formData.code.toUpperCase().trim(),
        name: formData.display_name, // Keep name in sync
        display_name: formData.display_name,
        subdivision_type: formData.subdivision_type,
      };

      if (editing) {
        await updateMunicipality(editing.id, payload);
      } else {
        await createMunicipality(payload);
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      console.error('Failed to save:', err);
      alert('Failed to save: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Split into normalized vs auto-created (needs attention)
  const normalizedMunis = municipalities.filter(m => m.active && !m.auto_created);
  const autoCreatedMunis = municipalities.filter(m => m.active && m.auto_created);
  const inactiveMunis = municipalities.filter(m => !m.active);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Municipalities</h2>
        <button className="btn btn-primary" onClick={handleAdd}>
          + Add Municipality
        </button>
      </div>
      <p style={{ color: '#888', marginBottom: '1rem', fontSize: '0.85rem' }}>
        Map CAD codes to display names. Incidents store the CAD code; reports use the display name.
      </p>

      {/* Auto-created needing attention */}
      {autoCreatedMunis.length > 0 && (
        <>
          <h3 style={{ color: '#f39c12', marginTop: '1.5rem', marginBottom: '0.5rem', fontSize: '1rem' }}>
            ⚠️ Needs Normalization ({autoCreatedMunis.length})
          </h3>
          <p style={{ color: '#888', marginBottom: '1rem', fontSize: '0.8rem' }}>
            These were auto-created from CAD data. Edit to set proper display names.
          </p>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>CAD Code</th>
                  <th>Display Name</th>
                  <th>Type</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {autoCreatedMunis.map((m) => (
                  <tr key={m.id} className="needs-attention-row">
                    <td><code>{m.code}</code></td>
                    <td style={{ color: '#f39c12' }}>{m.display_name || m.code}</td>
                    <td>{m.subdivision_type || '-'}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn btn-warning btn-sm" onClick={() => handleEdit(m)}>Normalize</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Normalized municipalities */}
      <h3 style={{ color: '#27ae60', marginTop: '1.5rem', marginBottom: '0.5rem', fontSize: '1rem' }}>
        ✓ Normalized ({normalizedMunis.length})
      </h3>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>CAD Code</th>
              <th>Display Name</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {normalizedMunis.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', color: '#888' }}>No municipalities configured</td></tr>
            ) : (
              normalizedMunis.map((m) => (
                <tr key={m.id}>
                  <td><code>{m.code}</code></td>
                  <td>{m.display_name || m.name}</td>
                  <td>{m.subdivision_type || '-'}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(m)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(m)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Inactive */}
      {inactiveMunis.length > 0 && (
        <>
          <h3 style={{ color: '#7f8c8d', marginTop: '1.5rem', marginBottom: '0.5rem', fontSize: '1rem' }}>
            Inactive ({inactiveMunis.length})
          </h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>CAD Code</th>
                  <th>Display Name</th>
                  <th>Type</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inactiveMunis.map((m) => (
                  <tr key={m.id} className="inactive-row">
                    <td><code>{m.code}</code></td>
                    <td>{m.display_name || m.name}</td>
                    <td>{m.subdivision_type || '-'}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(m)}>Reactivate</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? 'Edit' : 'Add'} Municipality</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>CAD Code *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
                  placeholder="WALLAC"
                  required
                  disabled={editing} // Can't change code after creation
                  style={editing ? { opacity: 0.6 } : {}}
                />
                <small style={{ color: '#888' }}>
                  {editing ? 'Code cannot be changed' : 'Exactly as it appears in CAD data'}
                </small>
              </div>

              <div className="form-group">
                <label>Display Name *</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => handleChange('display_name', e.target.value)}
                  placeholder="Wallace"
                  required
                />
                <small style={{ color: '#888' }}>
                  How it appears in UI and reports
                </small>
              </div>

              <div className="form-group">
                <label>Subdivision Type</label>
                <select
                  value={formData.subdivision_type}
                  onChange={(e) => handleChange('subdivision_type', e.target.value)}
                >
                  {subdivisionTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

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

export default MunicipalitiesPage;
