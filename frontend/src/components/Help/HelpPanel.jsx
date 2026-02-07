/**
 * HelpPanel.jsx - Slide-in help panel from the right
 */

import { useState } from 'react';
import { useHelp } from '../../contexts/HelpContext';
import { createHelpText, updateHelpText, deleteHelpText } from '../../api';
import HelpEntry from './HelpEntry';
import HelpTourControls from './HelpTourControls';
import HelpEditModal from './HelpEditModal';

export default function HelpPanel() {
  const {
    helpOpen, entries, loading, pageKey, editMode,
    tourActive, startTour, reloadEntries, userSession,
  } = useHelp();

  const [showNewOnly, setShowNewOnly] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [showModal, setShowModal] = useState(false);

  if (!helpOpen) return null;

  const isAdmin = userSession?.role === 'ADMIN' || userSession?.role === 'OFFICER';
  const filteredEntries = showNewOnly ? entries.filter(e => e.is_new) : entries;
  const newCount = entries.filter(e => e.is_new).length;

  const handleEdit = (entry) => {
    setEditingEntry(entry);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingEntry(null);
    setShowModal(true);
  };

  const handleDelete = async (entry) => {
    if (!confirm('Delete help entry "' + entry.title + '"?')) return;
    try {
      await deleteHelpText(entry.id);
      reloadEntries();
    } catch (err) {
      alert('Failed to delete: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleSave = async (data, existingId) => {
    if (existingId) {
      await updateHelpText(existingId, data);
    } else {
      await createHelpText(data, userSession?.personnel_id);
    }
    setShowModal(false);
    setEditingEntry(null);
    reloadEntries();
  };

  return (
    <>
      <div style={{
        position: 'fixed', top: 0, right: 0, width: '320px', height: '100vh',
        background: '#fafafa', borderLeft: '1px solid #e5e7eb',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.08)', zIndex: 9999,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 700, color: '#333', fontSize: '0.95rem' }}>
              ❓ Help
            </span>
            <span style={{
              fontSize: '0.75rem', color: '#9ca3af', background: '#f3f4f6',
              padding: '2px 8px', borderRadius: '10px',
            }}>
              {pageKey}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {entries.length > 0 && !tourActive && (
              <button onClick={startTour} style={{
                padding: '3px 10px', fontSize: '0.75rem', border: '1px solid #d1d5db',
                borderRadius: '4px', background: '#fff', cursor: 'pointer', color: '#555',
              }}>
                🎯 Tour
              </button>
            )}
            {newCount > 0 && (
              <button onClick={() => setShowNewOnly(!showNewOnly)} style={{
                padding: '3px 10px', fontSize: '0.75rem', border: '1px solid #d1d5db',
                borderRadius: '4px', cursor: 'pointer', color: '#555',
                background: showNewOnly ? '#dcfce7' : '#fff',
              }}>
                🆕 New ({newCount})
              </button>
            )}
            {editMode && isAdmin && (
              <button onClick={handleAdd} style={{
                padding: '3px 10px', fontSize: '0.75rem', border: '1px solid #2563eb',
                borderRadius: '4px', background: '#eff6ff', cursor: 'pointer', color: '#2563eb',
                marginLeft: 'auto',
              }}>
                + Add
              </button>
            )}
          </div>
        </div>

        {/* Entries */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          <HelpTourControls />
          {loading ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem', fontSize: '0.85rem' }}>
              Loading...
            </div>
          ) : filteredEntries.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem', fontSize: '0.85rem' }}>
              {showNewOnly ? 'No new entries for this page' : 'No help entries for this page yet'}
              {editMode && isAdmin && !showNewOnly && (
                <div style={{ marginTop: '0.75rem' }}>
                  <button onClick={handleAdd} style={{
                    padding: '6px 16px', fontSize: '0.85rem', border: '1px solid #2563eb',
                    borderRadius: '4px', background: '#eff6ff', cursor: 'pointer', color: '#2563eb',
                  }}>
                    + Create First Entry
                  </button>
                </div>
              )}
            </div>
          ) : (
            filteredEntries.map(entry => (
              <HelpEntry key={entry.id} entry={entry} onEdit={handleEdit} onDelete={handleDelete} />
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.5rem 0.75rem', borderTop: '1px solid #e5e7eb',
          background: '#fff', fontSize: '0.7rem', color: '#9ca3af', textAlign: 'center',
        }}>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · Hover elements on page to see related help
        </div>
      </div>

      {showModal && (
        <HelpEditModal
          entry={editingEntry}
          pageKey={pageKey}
          onSave={handleSave}
          onCancel={() => { setShowModal(false); setEditingEntry(null); }}
        />
      )}
    </>
  );
}
