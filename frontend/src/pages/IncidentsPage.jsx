import { useState, useEffect, useCallback, useRef } from 'react';
import { getIncidents, getIncident } from '../api';
import RunSheetForm from '../components/RunSheetForm';
import PrintView from '../components/PrintView';

const FILTER_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function IncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingIncident, setLoadingIncident] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [editingIncident, setEditingIncident] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('ALL'); // ALL, FIRE, EMS
  
  // Print view state
  const [showPrintView, setShowPrintView] = useState(false);
  const [printIncidentId, setPrintIncidentId] = useState(null);
  
  // Timeout ref for resetting filter
  const filterTimeoutRef = useRef(null);

  // Reset filter to ALL after 30 minutes of inactivity
  const resetFilterTimeout = useCallback(() => {
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }
    filterTimeoutRef.current = setTimeout(() => {
      setCategoryFilter('ALL');
    }, FILTER_TIMEOUT_MS);
  }, []);

  // Reset timeout on user interaction
  useEffect(() => {
    resetFilterTimeout();
    return () => {
      if (filterTimeoutRef.current) {
        clearTimeout(filterTimeoutRef.current);
      }
    };
  }, [categoryFilter, resetFilterTimeout]);

  // Listen for nav menu click to close form (acts as Cancel)
  useEffect(() => {
    const handleNavClick = () => {
      if (showForm) {
        setShowForm(false);
        setEditingIncident(null);
      }
      if (showPrintView) {
        setShowPrintView(false);
        setPrintIncidentId(null);
      }
    };
    window.addEventListener('nav-incidents-click', handleNavClick);
    return () => window.removeEventListener('nav-incidents-click', handleNavClick);
  }, [showForm, showPrintView]);

  const loadData = useCallback(async () => {
    try {
      const category = categoryFilter === 'ALL' ? null : categoryFilter;
      const res = await getIncidents(year, category);
      setIncidents(res.data.incidents || []);
    } catch (err) {
      console.error('Failed to load incidents:', err);
    } finally {
      setLoading(false);
    }
  }, [year, categoryFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 5 seconds when enabled (and not viewing form/print)
  useEffect(() => {
    if (!autoRefresh || showForm || showPrintView) return;
    
    const interval = setInterval(() => {
      loadData();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [autoRefresh, loadData, showForm, showPrintView]);

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

  const handlePrintIncident = (incidentId) => {
    setPrintIncidentId(incidentId);
    setShowPrintView(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingIncident(null);
    loadData();
  };

  const handleFormSave = () => {
    loadData();
  };

  const handlePrintClose = () => {
    setShowPrintView(false);
    setPrintIncidentId(null);
  };

  const handleCategoryChange = (newCategory) => {
    setCategoryFilter(newCategory);
    resetFilterTimeout();
  };

  // Get row style based on category
  const getRowStyle = (category) => {
    if (category === 'EMS') {
      return { 
        borderLeft: '3px solid #3498db',
        borderRight: '3px solid #3498db'
      };
    } else if (category === 'FIRE') {
      return { 
        borderLeft: '3px solid #e74c3c',
        borderRight: '3px solid #e74c3c'
      };
    }
    return {};
  };

  // Get category badge
  const getCategoryBadge = (category) => {
    if (category === 'EMS') {
      return <span className="badge" style={{ backgroundColor: '#3498db', color: '#fff', marginLeft: '0.5rem' }}>EMS</span>;
    } else if (category === 'FIRE') {
      return <span className="badge" style={{ backgroundColor: '#e74c3c', color: '#fff', marginLeft: '0.5rem' }}>FIRE</span>;
    }
    return null;
  };

  // Count by category
  const fireCounts = incidents.filter(i => i.call_category === 'FIRE').length;
  const emsCounts = incidents.filter(i => i.call_category === 'EMS').length;

  // Show print view
  if (showPrintView && printIncidentId) {
    return <PrintView incidentId={printIncidentId} onClose={handlePrintClose} />;
  }

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

      <div className="filter-bar" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
          {[2025, 2024, 2023].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        
        {/* Category Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            className={`btn btn-sm ${categoryFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleCategoryChange('ALL')}
            style={{ minWidth: '60px' }}
          >
            All
          </button>
          <button
            className={`btn btn-sm ${categoryFilter === 'FIRE' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleCategoryChange('FIRE')}
            style={{ 
              minWidth: '60px',
              backgroundColor: categoryFilter === 'FIRE' ? '#e74c3c' : undefined,
              borderColor: categoryFilter === 'FIRE' ? '#e74c3c' : undefined
            }}
          >
            Fire
          </button>
          <button
            className={`btn btn-sm ${categoryFilter === 'EMS' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleCategoryChange('EMS')}
            style={{ 
              minWidth: '60px',
              backgroundColor: categoryFilter === 'EMS' ? '#3498db' : undefined,
              borderColor: categoryFilter === 'EMS' ? '#3498db' : undefined
            }}
          >
            EMS
          </button>
        </div>
        
        <span style={{ color: '#888', fontSize: '0.85rem' }}>
          {incidents.length} incidents
          {categoryFilter === 'ALL' && ` (${fireCounts} Fire, ${emsCounts} EMS)`}
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
                <th>Date/Time</th>
                <th>Type</th>
                <th>Address</th>
                <th>Municipality</th>
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
                  <tr key={i.id} style={getRowStyle(i.call_category)}>
                    <td>
                      {i.internal_incident_number}
                      {getCategoryBadge(i.call_category)}
                    </td>
                    <td>{i.cad_event_number}</td>
                    <td>
                      {i.incident_date}
                      {i.time_dispatched && (
                        <span style={{ color: '#888', marginLeft: '0.5rem' }}>
                          {i.time_dispatched.split('T')[1]?.slice(0, 5)}
                        </span>
                      )}
                    </td>
                    <td>
                      {i.call_category === 'EMS' 
                        ? (i.cad_event_type || '-')
                        : (i.cad_event_subtype 
                            ? `${i.cad_event_type || ''} / ${i.cad_event_subtype}`.replace(/^\s*\/\s*/, '')
                            : (i.cad_event_type || '-'))
                      }
                    </td>
                    <td>{i.address || '-'}</td>
                    <td>{i.municipality_display_name || i.municipality_code || '-'}</td>
                    <td>
                      <span className={`badge badge-${i.status?.toLowerCase()}`}>
                        {i.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handlePrintIncident(i.id)}
                          title="Print View"
                          style={{ padding: '0.25rem 0.5rem' }}
                        >
                          🖨️
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEditIncident(i)}
                          disabled={loadingIncident}
                        >
                          Edit
                        </button>
                      </div>
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
