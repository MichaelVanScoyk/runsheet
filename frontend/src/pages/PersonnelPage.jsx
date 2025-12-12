import { useState, useEffect } from 'react';
import { getPersonnel, getRanks, createPersonnel, updatePersonnel, deletePersonnel } from '../api';

function PersonnelPage() {
  const [personnel, setPersonnel] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    rank_id: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [personnelRes, ranksRes] = await Promise.all([
        getPersonnel(),
        getRanks()
      ]);
      setPersonnel(personnelRes.data);
      setRanks(ranksRes.data);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditing(null);
    setFormData({ first_name: '', last_name: '', rank_id: '' });
    setShowModal(true);
  };

  const handleEdit = (person) => {
    setEditing(person);
    setFormData({
      first_name: person.first_name,
      last_name: person.last_name,
      rank_id: person.rank_id || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (person) => {
    if (!confirm(`Deactivate ${person.first_name} ${person.last_name}?`)) return;
    
    try {
      await deletePersonnel(person.id);
      loadData();
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to deactivate personnel');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const data = {
        ...formData,
        rank_id: formData.rank_id ? parseInt(formData.rank_id) : null,
      };
      
      if (editing) {
        await updatePersonnel(editing.id, data);
      } else {
        await createPersonnel(data);
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      console.error('Failed to save:', err);
      alert('Failed to save personnel');
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const getRankName = (rankId) => {
    const rank = ranks.find(r => r.id === rankId);
    return rank ? rank.rank_name : '-';
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Personnel</h2>
        <button className="btn btn-primary" onClick={handleAdd}>
          + Add Personnel
        </button>
      </div>

      {personnel.length === 0 ? (
        <div className="empty-state">
          <p>No personnel added yet.</p>
          <p style={{ marginTop: '1rem', color: '#888' }}>
            Click "Add Personnel" to add your first member.
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Rank</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {personnel.map((p) => (
                <tr key={p.id} className={!p.active ? 'inactive-row' : ''}>
                  <td>{p.last_name}, {p.first_name}</td>
                  <td>{getRankName(p.rank_id)}</td>
                  <td>
                    <span className={`badge ${p.active ? 'badge-open' : 'badge-closed'}`}>
                      {p.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleEdit(p)}
                      >
                        Edit
                      </button>
                      {p.active && (
                        <button 
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(p)}
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? 'Edit Personnel' : 'Add Personnel'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>First Name *</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Last Name *</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Rank</label>
                <select
                  value={formData.rank_id}
                  onChange={(e) => handleChange('rank_id', e.target.value)}
                >
                  <option value="">-- Select --</option>
                  {ranks.map(r => (
                    <option key={r.id} value={r.id}>{r.rank_name}</option>
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

export default PersonnelPage;
