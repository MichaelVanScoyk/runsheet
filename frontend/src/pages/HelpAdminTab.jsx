/**
 * HelpAdminTab.jsx - Admin tab for help system configuration
 * 
 * Provides:
 * - Toggle: Show/hide help toggle in sidebar
 * - Toggle: Enable/disable admin edit mode
 * - Full help topics CRUD table
 */

import { useState, useEffect } from 'react';
import { updateSetting } from '../api';
import { useHelp } from '../contexts/HelpContext';
import HelpTopicsManager from '../components/Help/HelpTopicsManager';

export default function HelpAdminTab() {
  const { helpSettings, setHelpSettings } = useHelp();
  const [toggleVisible, setToggleVisible] = useState(helpSettings.toggle_visible);
  const [editModeEnabled, setEditModeEnabled] = useState(helpSettings.edit_mode);
  const [saving, setSaving] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    setToggleVisible(helpSettings.toggle_visible);
    setEditModeEnabled(helpSettings.edit_mode);
  }, [helpSettings]);

  const handleToggleVisible = async () => {
    const newValue = !toggleVisible;
    setSaving('toggle_visible');
    setMessage(null);
    try {
      await updateSetting('help', 'toggle_visible', String(newValue));
      setToggleVisible(newValue);
      setMessage({ type: 'success', text: 'Help toggle ' + (newValue ? 'shown' : 'hidden') + ' in sidebar' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save' });
    } finally {
      setSaving(null);
    }
  };

  const handleEditMode = async () => {
    const newValue = !editModeEnabled;
    setSaving('edit_mode');
    setMessage(null);
    try {
      await updateSetting('help', 'edit_mode', String(newValue));
      setEditModeEnabled(newValue);
      setHelpSettings(prev => ({ ...prev, edit_mode: newValue }));
      setMessage({ type: 'success', text: 'Edit mode ' + (newValue ? 'enabled' : 'disabled') });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <h3 style={{ color: 'var(--primary-color)' }}>Help System</h3>
      <p className="tab-intro">
        Configure the in-app help system. Help entries appear in a slide-out panel and can be linked to specific UI elements using data-help-id attributes.
      </p>

      {message && (
        <div className={'message ' + message.type} style={{ marginBottom: '1rem' }}>{message.text}</div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '1rem', border: '1px solid #e0e0e0', flex: '1', minWidth: '250px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, color: '#333', marginBottom: '0.25rem' }}>Show Help Toggle</div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>Display "Enable Help" checkbox in the sidebar for all users</div>
          </div>
          <button onClick={handleToggleVisible} disabled={saving === 'toggle_visible'} style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', cursor: saving === 'toggle_visible' ? 'wait' : 'pointer', fontWeight: 'bold', minWidth: '70px', background: toggleVisible ? '#22c55e' : '#e5e7eb', color: toggleVisible ? '#fff' : '#666' }}>
            {saving === 'toggle_visible' ? '...' : (toggleVisible ? 'ON' : 'OFF')}
          </button>
        </div>

        <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '1rem', border: '1px solid #e0e0e0', flex: '1', minWidth: '250px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, color: '#333', marginBottom: '0.25rem' }}>Edit Mode</div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>Allow Officers/Admins to add/edit help entries directly from the help panel</div>
          </div>
          <button onClick={handleEditMode} disabled={saving === 'edit_mode'} style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', cursor: saving === 'edit_mode' ? 'wait' : 'pointer', fontWeight: 'bold', minWidth: '70px', background: editModeEnabled ? '#22c55e' : '#e5e7eb', color: editModeEnabled ? '#fff' : '#666' }}>
            {saving === 'edit_mode' ? '...' : (editModeEnabled ? 'ON' : 'OFF')}
          </button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
        <h4 style={{ marginBottom: '1rem', color: '#333' }}>Help Topics</h4>
        <HelpTopicsManager />
      </div>
    </div>
  );
}
