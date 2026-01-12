import { useState, useEffect, useCallback, useRef } from 'react';
import { getIncidents, getIncident, getIncidentYears } from '../api';
import { useBranding } from '../contexts/BrandingContext';
import RunSheetForm from '../components/RunSheetForm';
import IncidentHubModal from '../components/IncidentHubModal';
import { incidentQualifiesForModal } from '../components/IncidentHubModal/hooks/useActiveIncidents';
import { formatTimeLocal } from '../utils/timeUtils';
import { useIncidentWebSocket } from '../hooks/useIncidentWebSocket';

const FILTER_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const POLL_INTERVAL_MS = 5000; // 5 seconds - fallback when WebSocket disconnected
const ACK_STORAGE_KEY = 'hubModalAcknowledged';

function getAcknowledged() {
  try {
    const data = sessionStorage.getItem(ACK_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function acknowledgeIncident(incidentId, updatedAt) {
  const acked = getAcknowledged();
  acked[incidentId] = updatedAt;
  sessionStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(acked));
}

function needsAutoShow(incident) {
  const acked = getAcknowledged();
  const lastAck = acked[incident.id];
  if (!lastAck) return true;
  const updatedAt = incident.updated_at || incident.created_at;
  if (!updatedAt) return true;
  return new Date(updatedAt).getTime() > new Date(lastAck).getTime();
}

function IncidentsPage() {
  const branding = useBranding();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingIncident, setLoadingIncident] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([new Date().getFullYear()]);
  const [showForm, setShowForm] = useState(false);
  const [editingIncident, setEditingIncident] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  
  // Modal state
  const [showHubModal, setShowHubModal] = useState(false);
  const [qualifyingIncidents, setQualifyingIncidents] = useState([]); // All that qualify
  const [modalIncidents, setModalIncidents] = useState([]); // What's shown in modal
  const [selectedModalIncidentId, setSelectedModalIncidentId] = useState(null);
  
  const filterTimeoutRef = useRef(null);
  
  // Track if WebSocket connected to control fallback polling
  const wsConnectedRef = useRef(false);

  // WebSocket handlers for real-time updates
  const handleIncidentCreated = useCallback((incident) => {
    // Add to list if current year matches
    const incidentYear = incident.incident_date ? new Date(incident.incident_date).getFullYear() : new Date().getFullYear();
    if (incidentYear === year) {
      setIncidents(prev => {
        // Avoid duplicates
        if (prev.some(i => i.id === incident.id)) return prev;
        return [incident, ...prev];
      });
    }
    
    // Check if qualifies for modal auto-popup
    if (!showForm && !showHubModal) {
      // Fetch full incident to check qualification
      getIncident(incident.id).then(res => {
        const fullIncident = res.data;
        if (incidentQualifiesForModal(fullIncident) && needsAutoShow(fullIncident)) {
          setQualifyingIncidents(prev => [fullIncident, ...prev.filter(i => i.id !== fullIncident.id)]);
          setModalIncidents([fullIncident]);
          setSelectedModalIncidentId(fullIncident.id);
          setShowHubModal(true);
        }
      }).catch(err => console.error('Failed to fetch new incident:', err));
    }
  }, [year, showForm, showHubModal]);

  const handleIncidentUpdated = useCallback((incident) => {
    // Update in list
    setIncidents(prev => prev.map(i => i.id === incident.id ? { ...i, ...incident } : i));
    
    // Update qualifying incidents list
    setQualifyingIncidents(prev => {
      const existing = prev.find(i => i.id === incident.id);
      if (existing) {
        return prev.map(i => i.id === incident.id ? { ...i, ...incident } : i);
      }
      return prev;
    });
    
    // Update modal incidents if showing
    setModalIncidents(prev => prev.map(i => i.id === incident.id ? { ...i, ...incident } : i));
    
    // Check if now qualifies for modal (e.g., CAD clear just received)
    if (!showForm && !showHubModal) {
      getIncident(incident.id).then(res => {
        const fullIncident = res.data;
        if (incidentQualifiesForModal(fullIncident) && needsAutoShow(fullIncident)) {
          setQualifyingIncidents(prev => {
            if (prev.some(i => i.id === fullIncident.id)) {
              return prev.map(i => i.id === fullIncident.id ? fullIncident : i);
            }
            return [fullIncident, ...prev];
          });
          setModalIncidents([fullIncident]);
          setSelectedModalIncidentId(fullIncident.id);
          setShowHubModal(true);
        }
      }).catch(err => console.error('Failed to fetch updated incident:', err));
    }
  }, [showForm, showHubModal]);

  const handleIncidentClosed = useCallback((incident) => {
    // Update status in list immediately for responsiveness
    setIncidents(prev => prev.map(i => 
      i.id === incident.id ? { ...i, status: 'CLOSED', ...incident } : i
    ));
    
    // Fetch full incident to get unit times, narrative, etc.
    getIncident(incident.id).then(res => {
      const fullIncident = res.data;
      
      // Update list with full data
      setIncidents(prev => prev.map(i => 
        i.id === fullIncident.id ? fullIncident : i
      ));
      
      // Update qualifying incidents with full data
      setQualifyingIncidents(prev => prev.map(i => 
        i.id === fullIncident.id ? fullIncident : i
      ));
      
      // Update modal with full data (unit times, narrative, etc.)
      setModalIncidents(prev => prev.map(i => 
        i.id === fullIncident.id ? fullIncident : i
      ));
    }).catch(err => console.error('Failed to fetch closed incident:', err));
  }, []);

  // WebSocket connection
  const { connected: wsConnected } = useIncidentWebSocket({
    onIncidentCreated: handleIncidentCreated,
    onIncidentUpdated: handleIncidentUpdated,
    onIncidentClosed: handleIncidentClosed,
    enabled: true,
  });
  
  // Update ref for use in polling decision
  useEffect(() => {
    wsConnectedRef.current = wsConnected;
  }, [wsConnected]);

  const resetFilterTimeout = useCallback(() => {
    if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current);
    filterTimeoutRef.current = setTimeout(() => setCategoryFilter('ALL'), FILTER_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    resetFilterTimeout();
    return () => { if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current); };
  }, [categoryFilter, resetFilterTimeout]);

  useEffect(() => {
    const handleNavClick = () => {
      if (showForm) { setShowForm(false); setEditingIncident(null); }
      if (showHubModal) {
        modalIncidents.forEach(inc => acknowledgeIncident(inc.id, inc.updated_at || inc.created_at));
        setShowHubModal(false);
        setModalIncidents([]);
      }
    };
    window.addEventListener('nav-incidents-click', handleNavClick);
    return () => window.removeEventListener('nav-incidents-click', handleNavClick);
  }, [showForm, showHubModal, modalIncidents]);

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

  useEffect(() => { loadData(); }, [loadData]);

  // Load available years on mount
  useEffect(() => {
    const loadYears = async () => {
      try {
        const res = await getIncidentYears();
        if (res.data.years && res.data.years.length > 0) {
          setAvailableYears(res.data.years);
        }
      } catch (err) {
        console.error('Failed to load years:', err);
      }
    };
    loadYears();
  }, []);

  const loadQualifyingIncidents = useCallback(async () => {
    try {
      const res = await getIncidents(new Date().getFullYear(), null);
      const allIncidents = res.data.incidents || [];
      const candidates = allIncidents.filter(inc => inc.status === 'OPEN' || inc.status === 'CLOSED');
      
      const fullIncidents = await Promise.all(
        candidates.slice(0, 10).map(async (inc) => {
          try {
            const fullRes = await getIncident(inc.id);
            return fullRes.data;
          } catch { return inc; }
        })
      );
      
      const qualifying = fullIncidents.filter(incidentQualifiesForModal);
      qualifying.sort((a, b) => {
        const aTime = a.time_dispatched ? new Date(a.time_dispatched).getTime() : 0;
        const bTime = b.time_dispatched ? new Date(b.time_dispatched).getTime() : 0;
        return bTime - aTime;
      });
      
      setQualifyingIncidents(qualifying);
      
      // Auto-open for UNACKNOWLEDGED incidents only
      if (qualifying.length > 0 && !showHubModal && !showForm) {
        const needsShow = qualifying.filter(needsAutoShow);
        if (needsShow.length > 0) {
          setModalIncidents(needsShow); // Only unacknowledged ones
          setSelectedModalIncidentId(needsShow[0].id);
          setShowHubModal(true);
        }
      }
    } catch (err) {
      console.error('Failed to load qualifying incidents:', err);
    }
  }, [showHubModal, showForm]);

  // Initial load of qualifying incidents
  useEffect(() => {
    loadQualifyingIncidents();
  }, []);

  // Fallback polling - only when WebSocket is disconnected
  useEffect(() => {
    // If WebSocket is connected, don't poll
    if (wsConnected) return;
    
    // Fallback polling when WebSocket disconnected
    if (showForm || showHubModal) return;
    
    const interval = setInterval(() => {
      loadData();
      loadQualifyingIncidents();
    }, POLL_INTERVAL_MS);
    
    return () => clearInterval(interval);
  }, [wsConnected, loadData, loadQualifyingIncidents, showForm, showHubModal]);

  const handleNewIncident = () => { setEditingIncident(null); setShowForm(true); };

  // Manual row click - show ONLY this incident
  const handleIncidentClick = async (incidentSummary) => {
    setLoadingIncident(true);
    try {
      const res = await getIncident(incidentSummary.id);
      const fullIncident = res.data;
      
      if (incidentQualifiesForModal(fullIncident)) {
        setModalIncidents([fullIncident]); // ONLY this one
        setSelectedModalIncidentId(fullIncident.id);
        setShowHubModal(true);
      } else {
        setEditingIncident(fullIncident);
        setShowForm(true);
      }
    } catch (err) {
      console.error('Failed to load incident:', err);
      alert('Failed to load incident details');
    } finally {
      setLoadingIncident(false);
    }
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
    window.open(`/api/reports/pdf/incident/${incidentId}`, '_blank');
  };

  const handleFormClose = () => { setShowForm(false); setEditingIncident(null); loadData(); };
  const handleFormSave = () => { loadData(); };

  // Modal close - acknowledge all shown
  const handleModalClose = () => {
    modalIncidents.forEach(inc => acknowledgeIncident(inc.id, inc.updated_at || inc.created_at));
    setShowHubModal(false);
    setModalIncidents([]);
    setSelectedModalIncidentId(null);
    loadData();
  };

  // Handle X button on individual tab
  const handleTabClose = (incidentId) => {
    const inc = modalIncidents.find(i => i.id === incidentId);
    if (inc) acknowledgeIncident(inc.id, inc.updated_at || inc.created_at);
    
    const remaining = modalIncidents.filter(i => i.id !== incidentId);
    if (remaining.length === 0) {
      setShowHubModal(false);
      setModalIncidents([]);
      setSelectedModalIncidentId(null);
    } else {
      setModalIncidents(remaining);
      if (selectedModalIncidentId === incidentId) {
        setSelectedModalIncidentId(remaining[0].id);
      }
    }
  };

  const handleNavigateToEdit = async (incidentId) => {
    const inc = modalIncidents.find(i => i.id === incidentId);
    if (inc) acknowledgeIncident(inc.id, inc.updated_at || inc.created_at);
    
    setShowHubModal(false);
    setModalIncidents([]);
    setSelectedModalIncidentId(null);
    
    try {
      const res = await getIncident(incidentId);
      setEditingIncident(res.data);
      setShowForm(true);
    } catch (err) {
      console.error('Failed to load incident for edit:', err);
      alert('Failed to load incident');
    }
  };

  const handleCategoryChange = (newCategory) => { setCategoryFilter(newCategory); resetFilterTimeout(); };

  const getRowStyle = (incident) => {
    const category = incident.call_category;
    const isQualifying = qualifyingIncidents.some(q => q.id === incident.id);
    let style = {};
    if (category === 'EMS') style = { borderLeft: '3px solid #3498db', borderRight: '3px solid #3498db' };
    else if (category === 'FIRE') style = { borderLeft: '3px solid #e74c3c', borderRight: '3px solid #e74c3c' };
    else if (category === 'DETAIL') style = { borderLeft: '3px solid #8b5cf6', borderRight: '3px solid #8b5cf6' };
    if (isQualifying) {
      style.backgroundColor = incident.status === 'OPEN' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)';
    }
    return style;
  };

  const getCategoryBadge = (category) => {
    if (category === 'EMS') return <span className="badge" style={{ backgroundColor: '#3498db', color: '#fff', marginLeft: '0.5rem' }}>EMS</span>;
    if (category === 'FIRE') return <span className="badge" style={{ backgroundColor: '#e74c3c', color: '#fff', marginLeft: '0.5rem' }}>FIRE</span>;
    if (category === 'DETAIL') return <span className="badge" style={{ backgroundColor: '#8b5cf6', color: '#fff', marginLeft: '0.5rem' }}>DETAIL</span>;
    return null;
  };

  const getComCatStatusDot = (status) => {
    if (!status) return null;
    const dotStyle = { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', marginLeft: '6px', cursor: 'help' };
    switch (status) {
      case 'trained': return <span style={{ ...dotStyle, backgroundColor: '#8b5cf6' }} title="Reviewed & included in ML model" />;
      case 'validated': return <span style={{ ...dotStyle, backgroundColor: '#22c55e' }} title="Reviewed by officer (retrain to include)" />;
      case 'pending': return <span style={{ ...dotStyle, backgroundColor: '#6b7280' }} title="Comments need officer review" />;
      default: return null;
    }
  };

  const fireCounts = incidents.filter(i => i.call_category === 'FIRE').length;
  const emsCounts = incidents.filter(i => i.call_category === 'EMS').length;
  const detailCounts = incidents.filter(i => i.call_category === 'DETAIL').length;
  const activeCount = qualifyingIncidents.filter(i => i.status === 'OPEN').length;

  // Navigate to a different incident (for quick nav in RunSheetForm)
  const handleNavigateToIncident = async (incidentId) => {
    try {
      const res = await getIncident(incidentId);
      setEditingIncident(res.data);
    } catch (err) {
      console.error('Failed to navigate to incident:', err);
      alert('Failed to load incident');
    }
  };

  if (showForm) {
    return <RunSheetForm key={editingIncident?.id} incident={editingIncident} onSave={handleFormSave} onClose={handleFormClose} onNavigate={handleNavigateToIncident} />;
  }

  return (
    <div>
      {showHubModal && modalIncidents.length > 0 && (
        <IncidentHubModal
          incidents={modalIncidents}
          initialIncidentId={selectedModalIncidentId}
          onClose={handleModalClose}
          onTabClose={handleTabClose}
          onNavigateToEdit={handleNavigateToEdit}
          refetch={loadQualifyingIncidents}
        />
      )}

      <div className="page-header">
        <h2>{branding.stationShortName || 'Station 48'} — Incidents - {year}</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {activeCount > 0 && (
            <button
              className="btn btn-sm"
              style={{ backgroundColor: '#22c55e', color: '#fff', animation: 'pulse 2s infinite' }}
              onClick={() => {
                const active = qualifyingIncidents.filter(i => i.status === 'OPEN');
                setModalIncidents(active.length > 0 ? active : [qualifyingIncidents[0]]);
                setSelectedModalIncidentId(active[0]?.id || qualifyingIncidents[0]?.id);
                setShowHubModal(true);
              }}
            >
              🚨 {activeCount} Active
            </button>
          )}
          <span 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.35rem', 
              color: wsConnected ? '#22c55e' : '#f59e0b', 
              fontSize: '0.85rem',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              backgroundColor: wsConnected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            }}
            title={wsConnected ? 'Real-time updates active' : 'Reconnecting... (using fallback polling)'}
          >
            <span style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: wsConnected ? '#22c55e' : '#f59e0b',
              animation: wsConnected ? 'none' : 'pulse 1.5s infinite',
            }} />
            {wsConnected ? 'Live' : 'Connecting...'}
          </span>
          <button className="btn btn-primary" onClick={handleNewIncident}>+ New Incident</button>
        </div>
      </div>

      <div className="filter-bar" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
          {availableYears.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button className={`btn btn-sm ${categoryFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleCategoryChange('ALL')} style={{ minWidth: '60px' }}>All</button>
          <button className={`btn btn-sm ${categoryFilter === 'FIRE' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleCategoryChange('FIRE')} style={{ minWidth: '60px', backgroundColor: categoryFilter === 'FIRE' ? '#e74c3c' : undefined, borderColor: categoryFilter === 'FIRE' ? '#e74c3c' : undefined }}>Fire</button>
          <button className={`btn btn-sm ${categoryFilter === 'EMS' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleCategoryChange('EMS')} style={{ minWidth: '60px', backgroundColor: categoryFilter === 'EMS' ? '#3498db' : undefined, borderColor: categoryFilter === 'EMS' ? '#3498db' : undefined }}>EMS</button>
          <button className={`btn btn-sm ${categoryFilter === 'DETAIL' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleCategoryChange('DETAIL')} style={{ minWidth: '60px', backgroundColor: categoryFilter === 'DETAIL' ? '#8b5cf6' : undefined, borderColor: categoryFilter === 'DETAIL' ? '#8b5cf6' : undefined }} title="Training exercises and special assignments">Detail</button>
        </div>
        
        <span style={{ color: '#888', fontSize: '0.85rem' }}>
          {incidents.length} incidents{categoryFilter === 'ALL' && ` (${fireCounts} Fire, ${emsCounts} EMS${detailCounts > 0 ? `, ${detailCounts} Detail` : ''})`}
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
                <tr><td colSpan="8" style={{ textAlign: 'center', color: '#888' }}>No incidents for {year}</td></tr>
              ) : (
                incidents.map((i) => (
                  <tr key={i.id} style={getRowStyle(i)} onClick={() => handleIncidentClick(i)} className="cursor-pointer hover:bg-dark-hover transition-colors">
                    <td>{i.internal_incident_number}{getCategoryBadge(i.call_category)}</td>
                    <td>{i.cad_event_number}</td>
                    <td>{i.incident_date}{i.time_dispatched && <span style={{ color: '#888', marginLeft: '0.5rem' }}>{formatTimeLocal(i.time_dispatched)}</span>}</td>
                    <td>{i.call_category === 'EMS' ? (i.cad_event_type || '-') : (i.cad_event_subtype ? `${i.cad_event_type || ''} / ${i.cad_event_subtype}`.replace(/^\s*\/\s*/, '') : (i.cad_event_type || '-'))}</td>
                    <td>{i.address || '-'}</td>
                    <td>{i.municipality_display_name || i.municipality_code || '-'}</td>
                    <td><span className={`badge badge-${i.status?.toLowerCase()}`}>{i.status}</span>{getComCatStatusDot(i.comcat_status)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handlePrintIncident(i.id)}>Print</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEditIncident(i)} disabled={loadingIncident}>Edit</button>
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
