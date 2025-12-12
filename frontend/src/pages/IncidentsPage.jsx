import { useState, useEffect, useCallback } from 'react';
import { getIncidents, getIncident } from '../api';
import RunSheetForm from '../components/RunSheetForm';

function IncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingIncident, setLoadingIncident] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [editingIncident, setEditingIncident] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await getIncidents(year);
      setIncidents(res.data.incidents || []);
    } catch (err) {
      console.error('Failed to load incidents:', err);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 5 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      loadData();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  const handleNewIncident = () => {
    setEditingIncident(null);
    setShowForm(true);
  };

  const handleEditIncident = async (incidentSummary) => {
    setLoadingIncident(true);
    try {
      const res = await getIncident(incidentSummary.id);
      setEditingIncident(res.data);
      setShowForm(true);
    } catch (err) {
      console.error('Failed to load incident:', err);
      alert('Failed to load incident details');
    } finally {
      setLoadingIncident(false);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingIncident(null);
    loadData();
  };

  const handleFormSave = () => {
    loadData();
  };

  if (showForm) {
    return (
      <RunSheetForm
        incident={editingIncident}
        onSave={handleFormSave}
        onClose={handleFormClose}
      />
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Incidents - {year}</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#888', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button className="btn btn-primary" onClick={handleNewIncident}>
            + New Incident
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
          {[2025, 2024, 2023].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span style={{ color: '#888', fontSize: '0.85rem' }}>
          {incidents.length} incidents
        </span>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Incident #</th>
                <th>CAD #</th>
                <th>Date</th>
                <th>Type</th>
                <th>Address</th>
                <th>Township</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', color: '#888' }}>
                    No incidents for {year}
                  </td>
                </tr>
              ) : (
                incidents.map((i) => (
                  <tr key={i.id}>
                    <td>{i.internal_incident_number}</td>
                    <td>{i.cad_event_number}</td>
                    <td>{i.incident_date}</td>
                    <td>{i.cad_event_type || '-'}</td>
                    <td>{i.address || '-'}</td>
                    <td>{i.municipality_code || '-'}</td>
                    <td>
                      <span className={`badge badge-${i.status?.toLowerCase()}`}>
                        {i.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleEditIncident(i)}
                        disabled={loadingIncident}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default IncidentsPage;
