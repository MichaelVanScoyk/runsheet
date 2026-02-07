/**
 * HelpTopicsManager.jsx - Admin table for managing all help entries
 */

import { useState, useEffect } from 'react';
import { getAllHelp, createHelpText, updateHelpText, deleteHelpText } from '../../api';
import HelpEditModal from './HelpEditModal';

export default function HelpTopicsManager() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterPage, setFilterPage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  useEffect(() => { loadEntries(); }, []);

  const loadEntries = async () => {
    setLoading(true);
    try { const res = await getAllHelp(); setEntries(res.data); }
    catch (err) { console.error('Failed to load help entries:', err); }
    finally { setLoading(false); }
  };

  const handleEdit = (entry) => { setEditingEntry(entry); setShowModal(true); };
  const handleAdd = () => { setEditingEntry(null); setShowModal(true); };

  const handleDelete = async (entry) => {
    if (!confirm('Delete "' + entry.title + '" (' + entry.page_key + '/' + entry.element_key + ')?')) return;
    try { await deleteHelpText(entry.id); loadEntries(); }
    catch (err) { alert('Failed to delete: ' + (err.response?.data?.detail || err.message)); }
  };

  const handleSave = async (data, existingId) => {
    if (existingId) { await updateHelpText(existingId, data); }
    else { await createHelpText(data); }
    setShowModal(false); setEditingEntry(null); loadEntries();
  };

  const pageKeys = [...new Set(entries.map(e => e.page_key))].sort();
  const filtered = filterPage ? entries.filter(e => e.page_key === filterPage) : entries;

  if (loading) return <div style={{ color: '#888' }}>Loading help entries...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.85rem', color: '#555' }}>Filter by page:</label>
          <select value={filterPage} onChange={(e) => setFilterPage(e.target.value)} style={{ padding: '0.4rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid #d1d5db' }}>
            <option value="">All pages ({entries.length})</option>
            {pageKeys.map(pk => <option key={pk} value={pk}>{pk} ({entries.filter(e => e.page_key === pk).length})</option>)}
          </select>
        </div>
        <button onClick={handleAdd} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Add Entry</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>No help entries {filterPage ? 'for "' + filterPage + '"' : 'yet'}</div>
      ) : (
        <div style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0 }}>
                <th style={{ padding: '0.5rem', textAlign: 'left', color: '#555' }}>Page</th>
                <th style={{ padding: '0.5rem', textAlign: 'left', color: '#555' }}>Element</th>
                <th style={{ padding: '0.5rem', textAlign: 'left', color: '#555' }}>Title</th>
                <th style={{ padding: '0.5rem', textAlign: 'center', color: '#555', width: '50px' }}>Order</th>
                <th style={{ padding: '0.5rem', textAlign: 'center', color: '#555', width: '60px' }}>Role</th>
                <th style={{ padding: '0.5rem', textAlign: 'center', color: '#555', width: '40px' }}>New</th>
                <th style={{ padding: '0.5rem', textAlign: 'center', color: '#555', width: '100px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <tr key={entry.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '0.5rem', color: '#666' }}>{entry.page_key}</td>
                  <td style={{ padding: '0.5rem', color: '#666', fontFamily: 'monospace', fontSize: '0.8rem' }}>{entry.element_key}</td>
                  <td style={{ padding: '0.5rem', color: '#333', fontWeight: 500 }}>{entry.title}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: '#888' }}>{entry.sort_order}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                    {entry.min_role ? (
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '1px 5px', borderRadius: '3px', background: entry.min_role === 'ADMIN' ? '#fef2f2' : entry.min_role === 'OFFICER' ? '#fffbeb' : '#f0f0f0', color: entry.min_role === 'ADMIN' ? '#dc2626' : entry.min_role === 'OFFICER' ? '#f59e0b' : '#666' }}>{entry.min_role}</span>
                    ) : <span style={{ color: '#ccc', fontSize: '0.8rem' }}>All</span>}
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>{entry.is_new && <span style={{ color: '#22c55e' }}>&#x2713;</span>}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                      <button onClick={() => handleEdit(entry)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '3px', padding: '2px 6px', fontSize: '0.75rem', cursor: 'pointer', color: '#555' }}>&#x270F;&#xFE0F;</button>
                      <button onClick={() => handleDelete(entry)} style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: '3px', padding: '2px 6px', fontSize: '0.75rem', cursor: 'pointer', color: '#dc2626' }}>&#x1F5D1;&#xFE0F;</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <HelpEditModal
          entry={editingEntry}
          pageKey={filterPage || null}
          onSave={handleSave}
          onCancel={() => { setShowModal(false); setEditingEntry(null); }}
        />
      )}
    </div>
  );
}
