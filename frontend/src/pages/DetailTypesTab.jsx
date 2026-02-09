/**
 * DetailTypesTab - Admin tab for managing detail/event types
 * 
 * Used for configuring what types of events can be tracked for
 * attendance (meetings, worknights, training, drills, etc.)
 */

import { useState, useEffect } from 'react';
import { getDetailTypes, createDetailType, updateDetailType, deleteDetailType } from '../api';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

export default function DetailTypesTab() {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    display_name: '',
    display_order: 100,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTypes();
  }, []);

  const loadTypes = async () => {
    try {
      const res = await getDetailTypes(false); // Include inactive
      setTypes(res.data || []);
    } catch (err) {
      console.error('Failed to load detail types:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditing(null);
    setFormData({ code: '', display_name: '', display_order: 100 });
    setError('');
    setShowModal(true);
  };

  const handleEdit = (type) => {
    setEditing(type);
    setFormData({
      code: type.code,
      display_name: type.display_name,
      display_order: type.display_order,
    });
    setError('');
    setShowModal(true);
  };

  const handleDelete = async (type) => {
    const ok = await confirmAction(`Deactivate "${type.display_name}"?`, {
      confirmText: 'Deactivate',
      danger: true,
      details: "This won't delete existing records using this type.",
    });
    if (!ok) return;
    
    try {
      await deleteDetailType(type.id);
      loadTypes();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to deactivate type');
    }
  };

  const handleReactivate = async (type) => {
    try {
      await updateDetailType(type.id, { active: true });
      loadTypes();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reactivate type');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    
    try {
      if (editing) {
        await updateDetailType(editing.id, formData);
      } else {
        await createDetailType(formData);
      }
      setShowModal(false);
      loadTypes();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Auto-generate code from display name
  const handleNameChange = (value) => {
    setFormData(prev => ({
      ...prev,
      display_name: value,
      // Only auto-generate code if adding new (not editing) and code is empty or matches previous auto-gen
      code: !editing && (!prev.code || prev.code === prev.display_name.toUpperCase().replace(/\s+/g, '_'))
        ? value.toUpperCase().replace(/\s+/g, '_').slice(0, 20)
        : prev.code
    }));
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  const activeTypes = types.filter(t => t.active);
  const inactiveTypes = types.filter(t => !t.active);

  return (
    <div className="detail-types-tab">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, color: 'var(--primary-color)' }}>Event Types</h3>
        <button className="btn btn-primary" onClick={handleAdd}>+ Add Type</button>
      </div>
      
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Configure event types for attendance tracking (meetings, worknights, training, etc.).
        Lower display order appears first in dropdowns.
      </p>

      {/* Active Types */}
      <table className="ranks-table" style={{ marginBottom: '1.5rem' }}>
        <thead>
          <tr>
            <th style={{ width: '60px' }}>Order</th>
            <th style={{ width: '120px' }}>Code</th>
            <th>Display Name</th>
            <th style={{ width: '80px' }}>Status</th>
            <th style={{ width: '150px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {activeTypes.length === 0 ? (
            <tr>
              <td colSpan="5" style={{ textAlign: 'center', color: '#888' }}>
                No event types configured
              </td>
            </tr>
          ) : (
            activeTypes.map(type => (
              <tr key={type.id}>
                <td>{type.display_order}</td>
                <td><code style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>{type.code}</code></td>
                <td>{type.display_name}</td>
                <td>
                  <span className="badge badge-open">Active</span>
                </td>
                <td>
                  <div className="action-buttons" style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(type)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(type)}>
                      Deactivate
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Inactive Types */}
      {inactiveTypes.length > 0 && (
        <>
          <h4 style={{ color: '#666', marginBottom: '0.5rem' }}>Inactive Types</h4>
          <table className="ranks-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Order</th>
                <th style={{ width: '120px' }}>Code</th>
                <th>Display Name</th>
                <th style={{ width: '80px' }}>Status</th>
                <th style={{ width: '150px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inactiveTypes.map(type => (
                <tr key={type.id} className="inactive-row" style={{ opacity: 0.6 }}>
                  <td>{type.display_order}</td>
                  <td><code style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>{type.code}</code></td>
                  <td>{type.display_name}</td>
                  <td>
                    <span className="badge badge-closed">Inactive</span>
                  </td>
                  <td>
                    <div className="action-buttons" style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(type)}>
                        Edit
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => handleReactivate(type)}>
                        Reactivate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? 'Edit Event Type' : 'Add Event Type'}</h3>
            <form onSubmit={handleSubmit}>
              {error && <div className="form-error" style={{ color: '#e74c3c', marginBottom: '1rem' }}>{error}</div>}
              
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>Display Name *</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Work Night, Training Session"
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>Code *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => handleChange('code', e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                  placeholder="e.g., WORKNIGHT"
                  required
                  maxLength={20}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', fontFamily: 'monospace' }}
                />
                <small style={{ color: '#888' }}>Uppercase, no spaces. Auto-generated from name.</small>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>Display Order</label>
                <input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => handleChange('display_order', parseInt(e.target.value) || 100)}
                  min={1}
                  max={999}
                  style={{ width: '100px', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
                <small style={{ color: '#888', marginLeft: '0.5rem' }}>Lower number = appears first in dropdown</small>
              </div>

              <div className="modal-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : (editing ? 'Update' : 'Add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
