import { useState, useEffect } from 'react';
import './ReportsPage.css';

const API_BASE = '';

function ReportsPage() {
  // Date range state
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [categoryFilter, setCategoryFilter] = useState('FIRE'); // FIRE or EMS only
  
  // Report data state
  const [summary, setSummary] = useState(null);
  const [municipalities, setMunicipalities] = useState(null);
  const [callTypes, setCallTypes] = useState(null);
  const [personnel, setPersonnel] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState(null);
  const [dayOfWeek, setDayOfWeek] = useState(null);
  const [hourOfDay, setHourOfDay] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('monthly');
  const [generating, setGenerating] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(() => new Date().getFullYear());

  // Quick date range presets
  const setPreset = (preset) => {
    const today = new Date();
    let start = new Date();
    
    switch (preset) {
      case 'mtd': // Month to date
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'ytd': // Year to date
        start = new Date(today.getFullYear(), 0, 1);
        break;
      case 'last30':
        start.setDate(today.getDate() - 30);
        break;
      case 'last90':
        start.setDate(today.getDate() - 90);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        today.setDate(0); // Last day of previous month
        break;
      case 'lastYear':
        start = new Date(today.getFullYear() - 1, 0, 1);
        const endOfYear = new Date(today.getFullYear() - 1, 11, 31);
        setEndDate(endOfYear.toISOString().split('T')[0]);
        setStartDate(start.toISOString().split('T')[0]);
        return;
      default:
        return;
    }
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  };

  const loadReports = async () => {
    setLoading(true);
    try {
      const params = `start_date=${startDate}&end_date=${endDate}&category=${categoryFilter}`;
      
      const [summaryRes, muniRes, typesRes, personnelRes, dowRes, hodRes] = await Promise.all([
        fetch(`${API_BASE}/api/reports/summary?${params}`),
        fetch(`${API_BASE}/api/reports/by-municipality?${params}`),
        fetch(`${API_BASE}/api/reports/by-type?${params}`),
        fetch(`${API_BASE}/api/reports/personnel?${params}&limit=25`),
        fetch(`${API_BASE}/api/reports/day-of-week?${params}`),
        fetch(`${API_BASE}/api/reports/hour-of-day?${params}`),
      ]);
      
      setSummary(await summaryRes.json());
      setMunicipalities(await muniRes.json());
      setCallTypes(await typesRes.json());
      setPersonnel(await personnelRes.json());
      setDayOfWeek(await dowRes.json());
      setHourOfDay(await hodRes.json());
      
      // Load monthly trend for selected year
      const trendRes = await fetch(`${API_BASE}/api/reports/monthly-trend?year=${year}`);
      setMonthlyTrend(await trendRes.json());
      
      // Load monthly chiefs report
      const monthlyRes = await fetch(`${API_BASE}/api/reports/monthly?year=${reportYear}&month=${reportMonth}`);
      setMonthlyReport(await monthlyRes.json());
      
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyReport = async () => {
    setLoading(true);
    try {
      const params = `year=${reportYear}&month=${reportMonth}&category=${categoryFilter}`;
      const res = await fetch(`${API_BASE}/api/reports/monthly?${params}`);
      setMonthlyReport(await res.json());
    } catch (err) {
      console.error('Failed to load monthly report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  // Reload reports when category changes
  useEffect(() => {
    loadReports();
    if (monthlyReport) {
      loadMonthlyReport();
    }
  }, [categoryFilter]);

  const downloadPdf = async () => {
    setGenerating(true);
    try {
      let url;
      let filename;
      const catSuffix = `_${categoryFilter.toLowerCase()}`;
      
      if (activeTab === 'monthly') {
        // Use monthly PDF endpoint
        url = `${API_BASE}/api/reports/pdf/monthly?year=${reportYear}&month=${reportMonth}&category=${categoryFilter}`;
        const monthName = new Date(reportYear, reportMonth - 1, 1).toLocaleString('default', { month: 'long' });
        filename = `monthly_report${catSuffix}_${reportYear}_${String(reportMonth).padStart(2, '0')}_${monthName}.pdf`;
      } else {
        // Use generic PDF endpoint
        url = `${API_BASE}/api/reports/pdf?start_date=${startDate}&end_date=${endDate}&report_type=summary&category=${categoryFilter}`;
        filename = `incident_report${catSuffix}_${startDate}_${endDate}.pdf`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const err = await response.json();
        alert(err.detail || 'Failed to generate PDF');
        return;
      }
      
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      a.remove();
    } catch (err) {
      console.error('Failed to download PDF:', err);
      alert('Failed to generate PDF');
    } finally {
      setGenerating(false);
    }
  };

  // Simple bar chart component
  const BarChart = ({ data, valueKey, labelKey, maxBars = 10 }) => {
    const items = data.slice(0, maxBars);
    const maxValue = Math.max(...items.map(d => d[valueKey]), 1);
    
    return (
      <div className="bar-chart">
        {items.map((item, idx) => (
          <div key={idx} className="bar-row">
            <div className="bar-label">{item[labelKey]}</div>
            <div className="bar-container">
              <div 
                className="bar-fill" 
                style={{ width: `${(item[valueKey] / maxValue) * 100}%` }}
              />
              <span className="bar-value">{item[valueKey]}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Hour histogram
  const HourHistogram = ({ data }) => {
    if (!data) return null;
    const maxCount = Math.max(...data.map(h => h.incident_count), 1);
    
    return (
      <div className="hour-histogram">
        {data.map((h, idx) => (
          <div key={idx} className="hour-bar-wrapper">
            <div 
              className="hour-bar" 
              style={{ height: `${(h.incident_count / maxCount) * 100}%` }}
              title={`${h.hour_label}: ${h.incident_count} incidents`}
            />
            <span className="hour-label">{h.hour}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="reports-page">
      {/* Header with date controls */}
      <div className="reports-header">
        <h2>Reports - {categoryFilter === 'FIRE' ? '🔥 Fire' : '🚑 EMS'}</h2>
        <div className="date-controls">
          <div className="presets">
            <button onClick={() => setPreset('mtd')}>MTD</button>
            <button onClick={() => setPreset('ytd')}>YTD</button>
            <button onClick={() => setPreset('last30')}>Last 30</button>
            <button onClick={() => setPreset('last90')}>Last 90</button>
            <button onClick={() => setPreset('lastMonth')}>Last Month</button>
            <button onClick={() => setPreset('lastYear')}>Last Year</button>
          </div>
          <div className="date-inputs">
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
            />
            <span>to</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
            />
            {/* Category Filter - Fire or EMS only */}
            <div style={{ display: 'flex', gap: '4px', marginLeft: '1rem' }}>
              <button
                onClick={() => setCategoryFilter('FIRE')}
                style={{ 
                  minWidth: '80px',
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  backgroundColor: categoryFilter === 'FIRE' ? '#e74c3c' : '#3a3a3a',
                  color: categoryFilter === 'FIRE' ? 'white' : '#888',
                }}
              >
                🔥 Fire
              </button>
              <button
                onClick={() => setCategoryFilter('EMS')}
                style={{ 
                  minWidth: '80px',
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  backgroundColor: categoryFilter === 'EMS' ? '#3498db' : '#3a3a3a',
                  color: categoryFilter === 'EMS' ? 'white' : '#888',
                }}
              >
                🚑 EMS
              </button>
            </div>
            <button className="btn-primary" onClick={loadReports} disabled={loading}>
              {loading ? 'Loading...' : 'Update'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="summary-cards">
          <div className="summary-card">
            <div className="card-value">{summary.total_incidents}</div>
            <div className="card-label">{categoryFilter} Incidents</div>
          </div>
          <div className="summary-card">
            <div className="card-value">{summary.total_personnel_responses}</div>
            <div className="card-label">Personnel Responses</div>
          </div>
          <div className="summary-card">
            <div className="card-value">{summary.total_manhours.toFixed(1)}</div>
            <div className="card-label">Total Manhours</div>
          </div>
          <div className="summary-card">
            <div className="card-value">
              {summary.response_times.avg_response_minutes 
                ? `${summary.response_times.avg_response_minutes.toFixed(1)} min` 
                : '-'}
            </div>
            <div className="card-label">Avg Response Time</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="report-tabs">
        <button 
          className={activeTab === 'monthly' ? 'active' : ''} 
          onClick={() => setActiveTab('monthly')}
        >
          Monthly Report
        </button>
        <button 
          className={activeTab === 'summary' ? 'active' : ''} 
          onClick={() => setActiveTab('summary')}
        >
          Overview
        </button>
        <button 
          className={activeTab === 'personnel' ? 'active' : ''} 
          onClick={() => setActiveTab('personnel')}
        >
          Personnel
        </button>
        <button 
          className={activeTab === 'trends' ? 'active' : ''} 
          onClick={() => setActiveTab('trends')}
        >
          Trends
        </button>
        <button 
          className="pdf-btn"
          onClick={downloadPdf} 
          disabled={generating}
        >
          {generating ? 'Generating...' : '📄 Download PDF'}
        </button>
      </div>

      {/* Tab Content */}
      <div className="report-content">
        {activeTab === 'monthly' && (
          <div className="monthly-tab">
            {/* Month/Year Selector */}
            <div className="month-selector">
              <select value={reportMonth} onChange={(e) => setReportMonth(parseInt(e.target.value))}>
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
              <select value={reportYear} onChange={(e) => setReportYear(parseInt(e.target.value))}>
                {[...Array(5)].map((_, i) => {
                  const y = new Date().getFullYear() - i;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
              {/* Category Filter for Monthly */}
              <div style={{ display: 'flex', gap: '4px', marginLeft: '0.5rem' }}>
                <button
                  onClick={() => setCategoryFilter('FIRE')}
                  style={{ 
                    minWidth: '80px',
                    padding: '0.5rem 1rem',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    backgroundColor: categoryFilter === 'FIRE' ? '#e74c3c' : '#3a3a3a',
                    color: categoryFilter === 'FIRE' ? 'white' : '#888',
                  }}
                >
                  🔥 Fire
                </button>
                <button
                  onClick={() => setCategoryFilter('EMS')}
                  style={{ 
                    minWidth: '80px',
                    padding: '0.5rem 1rem',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    backgroundColor: categoryFilter === 'EMS' ? '#3498db' : '#3a3a3a',
                    color: categoryFilter === 'EMS' ? 'white' : '#888',
                  }}
                >
                  🚑 EMS
                </button>
              </div>
              <button onClick={loadMonthlyReport} disabled={loading}>
                {loading ? 'Loading...' : 'Load Report'}
              </button>
            </div>

            {monthlyReport && (
              <div className="chiefs-report">
                <h3 className="report-title">
                  GLEN MOORE FIRE CO. MONTHLY REPORT<br/>
                  <span>{monthlyReport.month_name} {monthlyReport.year} - {categoryFilter === 'FIRE' ? '🔥 Fire' : '🚑 EMS'}</span>
                </h3>

                {/* Call Summary */}
                <div className="report-section">
                  <h4>CALL SUMMARY</h4>
                  <table className="summary-table">
                    <tbody>
                      <tr>
                        <td>Number of Calls for Month</td>
                        <td className="value">{monthlyReport.call_summary.number_of_calls}</td>
                      </tr>
                      <tr>
                        <td>Number of Men</td>
                        <td className="value">{monthlyReport.call_summary.number_of_men}</td>
                      </tr>
                      <tr>
                        <td>Hours</td>
                        <td className="value">{monthlyReport.call_summary.hours.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td>Man Hours</td>
                        <td className="value">{monthlyReport.call_summary.man_hours.toFixed(2)}</td>
                      </tr>
                      <tr className="comparison">
                        <td>vs. Same Month Last Year</td>
                        <td className="value">
                          {monthlyReport.call_summary.change >= 0 ? '+' : ''}{monthlyReport.call_summary.change} 
                          ({monthlyReport.call_summary.percent_change >= 0 ? '+' : ''}{monthlyReport.call_summary.percent_change}%)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="report-grid-2col">
                  {/* Municipality Summary */}
                  <div className="report-section">
                    <h4>MUNICIPALITY SUMMARY</h4>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Municipality</th>
                          <th>Calls</th>
                          <th>Man Hrs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyReport.municipalities.map((m, i) => (
                          <tr key={i}>
                            <td>{m.municipality}</td>
                            <td className="num">{m.calls}</td>
                            <td className="num">{m.manhours.toFixed(2)}</td>
                          </tr>
                        ))}
                        {monthlyReport.municipalities.length === 0 && (
                          <tr><td colSpan="3" className="no-data">No data</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Responses Per Unit */}
                  <div className="report-section">
                    <h4>RESPONSES PER UNIT</h4>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Unit</th>
                          <th>Responses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyReport.responses_per_unit.map((u, i) => (
                          <tr key={i}>
                            <td>{u.unit_name || u.unit}</td>
                            <td className="num">{u.responses}</td>
                          </tr>
                        ))}
                        {monthlyReport.responses_per_unit.length === 0 && (
                          <tr><td colSpan="2" className="no-data">No data</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="report-grid-2col">
                  {/* Type of Incident */}
                  <div className="report-section">
                    <h4>TYPE OF INCIDENT</h4>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyReport.incident_types.map((t, i) => (
                          <tr key={i}>
                            <td>{t.type}</td>
                            <td className="num">{t.count}</td>
                          </tr>
                        ))}
                        {monthlyReport.incident_types.length === 0 && (
                          <tr><td colSpan="2" className="no-data">No data</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mutual Aid */}
                  <div className="report-section">
                    <h4>MUTUAL AID ASSIST TO</h4>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Station</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyReport.mutual_aid.length > 0 ? (
                          monthlyReport.mutual_aid.map((ma, i) => (
                            <tr key={i}>
                              <td>{ma.station}</td>
                              <td className="num">{ma.count}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="2" className="no-data">None</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Response Times */}
                {monthlyReport.response_times && (
                  <div className="report-section">
                    <h4>RESPONSE TIMES</h4>
                    <table className="summary-table">
                      <tbody>
                        <tr>
                          <td>Avg Turnout Time</td>
                          <td className="value">
                            {monthlyReport.response_times.avg_turnout_minutes 
                              ? `${monthlyReport.response_times.avg_turnout_minutes.toFixed(1)} min` 
                              : '-'}
                          </td>
                        </tr>
                        <tr>
                          <td>Avg Response Time</td>
                          <td className="value">
                            {monthlyReport.response_times.avg_response_minutes 
                              ? `${monthlyReport.response_times.avg_response_minutes.toFixed(1)} min` 
                              : '-'}
                          </td>
                        </tr>
                        <tr>
                          <td>Avg On Scene Time</td>
                          <td className="value">
                            {monthlyReport.response_times.avg_on_scene_minutes 
                              ? `${monthlyReport.response_times.avg_on_scene_minutes.toFixed(1)} min` 
                              : '-'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="summary-tab">
            <div className="report-grid">
              {/* By Municipality */}
              <div className="report-card">
                <h3>Incidents by Municipality</h3>
                {municipalities && municipalities.municipalities.length > 0 ? (
                  <BarChart 
                    data={municipalities.municipalities} 
                    valueKey="incident_count" 
                    labelKey="municipality" 
                  />
                ) : (
                  <p className="no-data">No data available</p>
                )}
              </div>

              {/* By Call Type */}
              <div className="report-card">
                <h3>Incidents by Call Type</h3>
                {callTypes && callTypes.call_types.length > 0 ? (
                  <BarChart 
                    data={callTypes.call_types} 
                    valueKey="incident_count" 
                    labelKey="call_type" 
                  />
                ) : (
                  <p className="no-data">No data available</p>
                )}
              </div>

              {/* By Day of Week */}
              <div className="report-card">
                <h3>Incidents by Day of Week</h3>
                {dayOfWeek && (
                  <BarChart 
                    data={dayOfWeek.days} 
                    valueKey="incident_count" 
                    labelKey="day_name" 
                    maxBars={7}
                  />
                )}
              </div>

              {/* By Hour */}
              <div className="report-card full-width">
                <h3>Incidents by Hour of Day</h3>
                {hourOfDay && <HourHistogram data={hourOfDay.hours} />}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'personnel' && (
          <div className="personnel-tab">
            <div className="report-card">
              <h3>Top Responders</h3>
              {personnel && personnel.personnel.length > 0 ? (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Rank</th>
                      <th>Calls</th>
                      <th>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personnel.personnel.map((p, idx) => (
                      <tr key={p.id} className={idx < 3 ? 'top-three' : ''}>
                        <td className="rank-col">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                        </td>
                        <td>{p.name}</td>
                        <td>{p.rank || '-'}</td>
                        <td className="num-col">{p.incident_count}</td>
                        <td className="num-col">{p.total_hours.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="no-data">No personnel data available</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="trends-tab">
            <div className="year-selector">
              <label>Year:</label>
              <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
                {[...Array(5)].map((_, i) => {
                  const y = new Date().getFullYear() - i;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
              <button onClick={loadReports}>Update</button>
            </div>
            
            <div className="report-card full-width">
              <h3>Monthly Incident Trend - {year}</h3>
              {monthlyTrend && (
                <div className="monthly-chart">
                  {monthlyTrend.months.map((m, idx) => {
                    const maxCount = Math.max(...monthlyTrend.months.map(x => x.incident_count), 1);
                    return (
                      <div key={idx} className="month-bar-wrapper">
                        <div 
                          className="month-bar" 
                          style={{ height: `${(m.incident_count / maxCount) * 100}%` }}
                          title={`${m.month_name}: ${m.incident_count} incidents`}
                        >
                          {m.incident_count > 0 && <span>{m.incident_count}</span>}
                        </div>
                        <span className="month-label">{m.month_name.slice(0, 3)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {monthlyTrend && (
                <div className="trend-summary">
                  Total for {year}: <strong>{monthlyTrend.total_incidents}</strong> incidents
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportsPage;