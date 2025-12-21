import { useState, useEffect, useRef } from 'react';
import { getPersonnel, getRanks, createPersonnel, updatePersonnel, deletePersonnel } from '../api';

const API_BASE = '';

function PersonnelPage({ embedded = false }) {
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
  
  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [clearExisting, setClearExisting] = useState(false);
  const fileInputRef = useRef(null);

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
    setFormData({ first_name: '', last_name: '', rank_id: '', email: '', role: '' });
    setShowModal(true);
  };

  const handleEdit = (person) => {
    setEditing(person);
    setFormData({
      first_name: person.first_name,
      last_name: person.last_name,
      rank_id: person.rank_id || '',
      email: person.email || '',
      role: person.role || '',
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

  // Import handlers
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setImportFile(file);
    setImportLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE}/api/personnel/import/preview`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Preview failed');
      }
      
      setImportPreview(data);
      setShowImportModal(true);
    } catch (err) {
      console.error('Preview failed:', err);
      alert('Failed to preview CSV: ' + err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportExecute = async () => {
    if (!importFile) return;
    
    setImportLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      
      const url = `${API_BASE}/api/personnel/import/execute?clear_existing=${clearExisting}`;
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Import failed');
      }
      
      alert(`Imported ${data.imported_count} personnel. ${data.skipped_count} skipped.`);
      setShowImportModal(false);
      setImportPreview(null);
      setImportFile(null);
      setClearExisting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadData();
    } catch (err) {
      console.error('Import failed:', err);
      alert('Failed to import: ' + err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportCancel = () => {
    setShowImportModal(false);
    setImportPreview(null);
    setImportFile(null);
    setClearExisting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>{!embedded && 'Personnel'}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            ref={fileInputRef}
            style={{ display: 'none' }}
          />
          <button 
            className="btn btn-secondary" 
            onClick={() => fileInputRef.current?.click()}
            disabled={importLoading}
          >
            {importLoading ? 'Loading...' : '📤 Import CSV'}
          </button>
          <button className="btn btn-primary" onClick={handleAdd}>
            + Add Personnel
          </button>
        </div>
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
                <th>Email</th>
                <th>Role</th>
                <th>Account</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {personnel.map((p) => (
                <tr key={p.id} className={!p.active ? 'inactive-row' : ''}>
                  <td>{p.last_name}, {p.first_name}</td>
                  <td>{getRankName(p.rank_id)}</td>
                  <td style={{ fontSize: '0.85rem' }}>{p.email || '-'}</td>
                  <td>
                    {p.role ? (
                      <span className={`badge ${p.role === 'ADMIN' ? 'badge-admin' : p.role === 'OFFICER' ? 'badge-officer' : 'badge-member'}`}>
                        {p.role}
                      </span>
                    ) : '-'}
                  </td>
                  <td>
                    {p.is_registered ? (
                      p.is_approved ? (
                        <span className="badge badge-open">Approved</span>
                      ) : (
                        <span className="badge badge-pending">Pending</span>
                      )
                    ) : (
                      <span style={{ color: '#666' }}>Not registered</span>
                    )}
                  </td>
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

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="member@example.com"
                />
              </div>

              <div className="form-group">
                <label>Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => handleChange('role', e.target.value)}
                >
                  <option value="">-- Not Set --</option>
                  <option value="MEMBER">Member</option>
                  <option value="OFFICER">Officer</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <small style={{ color: '#888', marginTop: '0.25rem', display: 'block' }}>
                  Role determines access level when they register
                </small>
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

      {/* Import Modal */}
      {showImportModal && importPreview && (
        <div className="modal-overlay" onClick={handleImportCancel}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '80vh', overflow: 'auto' }}>
            <h3>Import Personnel from CSV</h3>
            
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#2a2a2a', borderRadius: '4px' }}>
              <p style={{ margin: 0, color: '#888' }}>
                Format detected: <strong style={{ color: '#fff' }}>{importPreview.format_detected}</strong>
              </p>
              <p style={{ margin: '0.5rem 0 0', color: '#888' }}>
                Found {importPreview.parsed_count} personnel to import
              </p>
            </div>

            {importPreview.duplicates?.length > 0 && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#4a3000', borderRadius: '4px' }}>
                <p style={{ margin: 0, color: '#f39c12' }}>
                  ⚠️ {importPreview.duplicates.length} duplicate name(s) found in CSV
                </p>
              </div>
            )}

            {importPreview.errors?.length > 0 && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#4a0000', borderRadius: '4px' }}>
                <p style={{ margin: 0, color: '#e74c3c' }}>
                  ❌ {importPreview.errors.length} row(s) had errors
                </p>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={clearExisting}
                  onChange={(e) => setClearExisting(e.target.checked)}
                />
                <span>Deactivate existing personnel before import</span>
              </label>
              {clearExisting && (
                <p style={{ margin: '0.5rem 0 0 1.5rem', color: '#f39c12', fontSize: '0.85rem' }}>
                  ⚠️ This will deactivate all {personnel.length} existing personnel and clear their incident assignments. Historical records (completed by, officer in charge) will be preserved.
                </p>
              )}
            </div>

            <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid #444', borderRadius: '4px' }}>
              <table style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', top: 0, background: '#333', padding: '0.5rem', textAlign: 'left' }}>#</th>
                    <th style={{ position: 'sticky', top: 0, background: '#333', padding: '0.5rem', textAlign: 'left' }}>First Name</th>
                    <th style={{ position: 'sticky', top: 0, background: '#333', padding: '0.5rem', textAlign: 'left' }}>Last Name</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.parsed?.map((p, i) => (
                    <tr key={i}>
                      <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #333' }}>{i + 1}</td>
                      <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #333' }}>{p.first_name}</td>
                      <td style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #333' }}>{p.last_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={handleImportCancel}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleImportExecute}
                disabled={importLoading}
              >
                {importLoading ? 'Importing...' : `Import ${importPreview.parsed_count} Personnel`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PersonnelPage;
