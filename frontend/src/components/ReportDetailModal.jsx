import { useState, useEffect } from 'react';

const API_BASE = '';

/**
 * ReportDetailModal - Shows detailed report for personnel, units, or incident types
 * 
 * Props:
 *   - isOpen: boolean
 *   - onClose: function
 *   - type: 'personnel' | 'units' | 'incidents'
 *   - itemId: number (for personnel/units) or string (for incident type)
 *   - itemName: string (display name)
 *   - startDate: string
 *   - endDate: string
 *   - colors: object (styling colors from parent)
 */
export default function ReportDetailModal({ 
  isOpen, 
  onClose, 
  type, 
  itemId, 
  itemName, 
  startDate, 
  endDate,
  colors 
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && itemId) {
      loadDetailData();
    }
  }, [isOpen, itemId, type, startDate, endDate]);

  const loadDetailData = async () => {
    setLoading(true);
    setError(null);
    try {
      let url;
      if (type === 'personnel') {
        url = `${API_BASE}/api/reports/admin/personnel/${itemId}?start_date=${startDate}&end_date=${endDate}`;
      } else if (type === 'units') {
        url = `${API_BASE}/api/reports/admin/units/${itemId}?start_date=${startDate}&end_date=${endDate}`;
      } else if (type === 'incidents') {
        url = `${API_BASE}/api/reports/admin/incidents/types/${encodeURIComponent(itemId)}?start_date=${startDate}&end_date=${endDate}`;
      } else if (type === 'details') {
        url = `${API_BASE}/api/reports/admin/details/${itemId}?start_date=${startDate}&end_date=${endDate}`;
      }
      
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load data: ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to load detail data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openPdf = () => {
    let url;
    if (type === 'personnel') {
      url = `${API_BASE}/api/reports/admin/personnel/${itemId}/pdf?start_date=${startDate}&end_date=${endDate}`;
    } else if (type === 'units') {
      url = `${API_BASE}/api/reports/admin/units/${itemId}/pdf?start_date=${startDate}&end_date=${endDate}`;
    } else if (type === 'incidents') {
      url = `${API_BASE}/api/reports/admin/incidents/types/${encodeURIComponent(itemId)}/pdf?start_date=${startDate}&end_date=${endDate}`;
    } else if (type === 'details') {
      url = `${API_BASE}/api/reports/admin/details/${itemId}/pdf?start_date=${startDate}&end_date=${endDate}`;
    }
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  // Styles
  const s = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modal: {
      background: '#fff',
      borderRadius: '8px',
      width: '95%',
      maxWidth: '700px',
      maxHeight: '90vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
      border: `1px solid ${colors?.border || '#ccc'}`,
    },
    header: {
      padding: '1rem 1.25rem',
      borderBottom: `1px solid ${colors?.border || '#ccc'}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: colors?.statBg || '#f5f5f5',
    },
    headerTitle: {
      margin: 0,
      fontSize: '1.1rem',
      fontWeight: '600',
      color: colors?.green || '#016a2b',
    },
    headerSub: {
      margin: '0.25rem 0 0 0',
      fontSize: '0.8rem',
      color: colors?.grayDark || '#666',
    },
    closeBtn: {
      background: 'transparent',
      border: 'none',
      fontSize: '1.5rem',
      cursor: 'pointer',
      color: colors?.grayDark || '#666',
      lineHeight: 1,
      padding: '0.25rem',
    },
    content: {
      flex: 1,
      overflowY: 'auto',
      padding: '1rem 1.25rem',
    },
    footer: {
      padding: '0.75rem 1.25rem',
      borderTop: `1px solid ${colors?.border || '#ccc'}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: colors?.statBg || '#f5f5f5',
    },
    btn: {
      padding: '0.5rem 1rem',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: '500',
      fontSize: '0.85rem',
    },
    btnGreen: {
      background: colors?.green || '#016a2b',
      color: '#fff',
    },
    btnGray: {
      background: '#fff',
      color: colors?.text || '#333',
      border: `1px solid ${colors?.border || '#ccc'}`,
    },
    statGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
      gap: '0.75rem',
      marginBottom: '1rem',
    },
    statBox: {
      background: colors?.statBg || '#e8e8e8',
      borderRadius: '4px',
      padding: '0.75rem',
      textAlign: 'center',
      border: `1px solid ${colors?.border || '#e0e0e0'}`,
    },
    statValue: {
      fontSize: '1.5rem',
      fontWeight: '700',
      color: colors?.text || '#333',
      lineHeight: 1.2,
    },
    statLabel: {
      fontSize: '0.65rem',
      color: colors?.grayDark || '#666',
      textTransform: 'uppercase',
      marginTop: '0.25rem',
    },
    section: {
      marginBottom: '1rem',
    },
    sectionTitle: {
      fontSize: '0.8rem',
      fontWeight: '600',
      color: colors?.green || '#016a2b',
      textTransform: 'uppercase',
      marginBottom: '0.5rem',
      letterSpacing: '0.3px',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '0.85rem',
    },
    th: {
      textAlign: 'left',
      padding: '0.4rem 0.6rem',
      fontWeight: '600',
      color: '#fff',
      background: colors?.green || '#016a2b',
      fontSize: '0.75rem',
    },
    td: {
      padding: '0.4rem 0.6rem',
      borderBottom: `1px solid ${colors?.border || '#e0e0e0'}`,
    },
    tdRight: {
      textAlign: 'right',
    },
  };

  const getTitle = () => {
    if (type === 'personnel') return 'Personnel Detail';
    if (type === 'units') return 'Unit Detail';
    if (type === 'incidents') return 'Incident Type Detail';
    return 'Detail';
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <h3 style={s.headerTitle}>{itemName || getTitle()}</h3>
            <p style={s.headerSub}>{startDate} to {endDate}</p>
          </div>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Content */}
        <div style={s.content}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: colors?.grayDark }}>
              Loading...
            </div>
          )}
          
          {error && (
            <div style={{ 
              background: colors?.redLight || '#fee2e2', 
              color: colors?.red || '#dc2626',
              padding: '1rem',
              borderRadius: '4px',
            }}>
              {error}
            </div>
          )}
          
          {!loading && !error && data && (
            <>
              {type === 'personnel' && <PersonnelDetail data={data} s={s} colors={colors} />}
              {type === 'units' && <UnitDetail data={data} s={s} colors={colors} />}
              {type === 'incidents' && <IncidentTypeDetail data={data} s={s} colors={colors} />}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <button style={{ ...s.btn, ...s.btnGreen }} onClick={openPdf}>
            🖨️ Print PDF
          </button>
          <button style={{ ...s.btn, ...s.btnGray }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// Personnel Detail Content
// =============================================================================
function PersonnelDetail({ data, s, colors }) {
  const person = data.person || {};
  const combined = data.combined || {};
  const fire = data.fire || {};
  const ems = data.ems || {};
  const apparatus = data.apparatus || [];

  return (
    <>
      {/* Person Info */}
      <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: `1px solid ${colors?.border}` }}>
        <div style={{ fontSize: '0.9rem', color: colors?.grayDark }}>
          {person.rank && <span style={{ fontWeight: '600' }}>{person.rank}</span>}
        </div>
      </div>

      {/* Stats */}
      <div style={s.statGrid}>
        <div style={s.statBox}>
          <div style={{ ...s.statValue, color: colors?.green }}>{combined.incident_count || 0}</div>
          <div style={s.statLabel}>Total Calls</div>
        </div>
        <div style={s.statBox}>
          <div style={s.statValue}>{(combined.total_hours || 0).toFixed(1)}</div>
          <div style={s.statLabel}>Total Hours</div>
        </div>
        <div style={s.statBox}>
          <div style={{ ...s.statValue, color: colors?.red || '#dc2626' }}>{fire.incident_count || 0}</div>
          <div style={s.statLabel}>Fire Calls</div>
        </div>
        <div style={s.statBox}>
          <div style={{ ...s.statValue, color: colors?.blue || '#2563eb' }}>{ems.incident_count || 0}</div>
          <div style={s.statLabel}>EMS Calls</div>
        </div>
      </div>

      {/* Apparatus Breakdown */}
      {apparatus.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Apparatus Breakdown</div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Apparatus</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Times Assigned</th>
              </tr>
            </thead>
            <tbody>
              {apparatus.map((a, i) => (
                <tr key={i}>
                  <td style={s.td}>{a.name}</td>
                  <td style={{ ...s.td, ...s.tdRight, fontWeight: '600', color: colors?.green }}>
                    {a.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {apparatus.length === 0 && (
        <div style={{ color: colors?.grayDark, fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>
          No apparatus assignments in this period
        </div>
      )}
    </>
  );
}


// =============================================================================
// Unit Detail Content
// =============================================================================
function UnitDetail({ data, s, colors }) {
  const unit = data.unit || {};
  const combined = data.combined || {};
  const fireCount = data.fire_count || 0;
  const emsCount = data.ems_count || 0;
  const personnel = data.personnel || [];
  const incidentTypes = data.incident_types || [];

  return (
    <>
      {/* Unit Info */}
      <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: `1px solid ${colors?.border}` }}>
        <div style={{ fontSize: '0.85rem', color: colors?.grayDark }}>
          {unit.unit_designator} • {unit.category || 'APPARATUS'}
          {unit.neris_type && <span> • {unit.neris_type}</span>}
        </div>
      </div>

      {/* Stats */}
      <div style={s.statGrid}>
        <div style={s.statBox}>
          <div style={{ ...s.statValue, color: colors?.green }}>{combined.incident_count || 0}</div>
          <div style={s.statLabel}>Total Incidents</div>
        </div>
        <div style={s.statBox}>
          <div style={{ ...s.statValue, color: colors?.red || '#dc2626' }}>{fireCount}</div>
          <div style={s.statLabel}>Fire</div>
        </div>
        <div style={s.statBox}>
          <div style={{ ...s.statValue, color: colors?.blue || '#2563eb' }}>{emsCount}</div>
          <div style={s.statLabel}>EMS</div>
        </div>
        <div style={s.statBox}>
          <div style={s.statValue}>{personnel.length}</div>
          <div style={s.statLabel}>Personnel</div>
        </div>
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Top Personnel */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Top Personnel</div>
          {personnel.length > 0 ? (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Name</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Times</th>
                </tr>
              </thead>
              <tbody>
                {personnel.slice(0, 10).map((p, i) => (
                  <tr key={i} style={{ background: i < 3 ? (colors?.greenLight || '#e8f5e9') : 'transparent' }}>
                    <td style={s.td}>
                      {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}
                      {p.name}
                      {p.rank && <span style={{ color: colors?.grayDark, fontSize: '0.75rem' }}> ({p.rank})</span>}
                    </td>
                    <td style={{ ...s.td, ...s.tdRight, fontWeight: '600' }}>{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: colors?.grayDark, fontStyle: 'italic', fontSize: '0.85rem' }}>No data</div>
          )}
        </div>

        {/* Incident Types */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Incident Types</div>
          {incidentTypes.length > 0 ? (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Type</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {incidentTypes.slice(0, 10).map((t, i) => (
                  <tr key={i}>
                    <td style={{ ...s.td, fontSize: '0.8rem' }}>{t.type}</td>
                    <td style={{ ...s.td, ...s.tdRight, fontWeight: '600', color: colors?.green }}>{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: colors?.grayDark, fontStyle: 'italic', fontSize: '0.85rem' }}>No data</div>
          )}
        </div>
      </div>
    </>
  );
}


// =============================================================================
// Incident Type Detail Content
// =============================================================================
function IncidentTypeDetail({ data, s, colors }) {
  const incidentType = data.incident_type || 'Unknown';
  const totalCount = data.total_count || 0;
  const subtypes = data.subtypes || [];
  const municipalities = data.municipalities || [];
  const responseTimes = data.response_times || {};

  return (
    <>
      {/* Stats */}
      <div style={s.statGrid}>
        <div style={s.statBox}>
          <div style={{ ...s.statValue, color: colors?.green }}>{totalCount}</div>
          <div style={s.statLabel}>Total Incidents</div>
        </div>
        <div style={s.statBox}>
          <div style={s.statValue}>{subtypes.length}</div>
          <div style={s.statLabel}>Subtypes</div>
        </div>
        <div style={s.statBox}>
          <div style={s.statValue}>{responseTimes.avg_response_minutes?.toFixed(1) || '-'}</div>
          <div style={s.statLabel}>Avg Response (min)</div>
        </div>
        <div style={s.statBox}>
          <div style={s.statValue}>{responseTimes.avg_turnout_minutes?.toFixed(1) || '-'}</div>
          <div style={s.statLabel}>Avg Turnout (min)</div>
        </div>
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Subtype Breakdown */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Subtype Breakdown</div>
          {subtypes.length > 0 ? (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Subtype</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Count</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {subtypes.map((st, i) => {
                  const pct = totalCount > 0 ? ((st.count / totalCount) * 100).toFixed(0) : 0;
                  return (
                    <tr key={i}>
                      <td style={{ ...s.td, fontSize: '0.8rem' }}>{st.name}</td>
                      <td style={{ ...s.td, ...s.tdRight, fontWeight: '600', color: colors?.green }}>{st.count}</td>
                      <td style={{ ...s.td, ...s.tdRight, color: colors?.grayDark }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ color: colors?.grayDark, fontStyle: 'italic', fontSize: '0.85rem' }}>No subtypes</div>
          )}
        </div>

        {/* By Municipality */}
        <div style={s.section}>
          <div style={s.sectionTitle}>By Municipality</div>
          {municipalities.length > 0 ? (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Municipality</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {municipalities.map((m, i) => (
                  <tr key={i}>
                    <td style={s.td}>{m.name}</td>
                    <td style={{ ...s.td, ...s.tdRight, fontWeight: '600', color: colors?.green }}>{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: colors?.grayDark, fontStyle: 'italic', fontSize: '0.85rem' }}>No data</div>
          )}
        </div>
      </div>
    </>
  );
}
