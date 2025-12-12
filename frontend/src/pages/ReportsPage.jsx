import { useState, useEffect } from 'react';
import './ReportsPage.css';

const API_BASE = 'http://192.168.1.189:8001';

function ReportsPage() {
  // Date range state
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [year, setYear] = useState(() => new Date().getFullYear());
  
  // Report data state
  const [summary, setSummary] = useState(null);
  const [municipalities, setMunicipalities] = useState(null);
  const [callTypes, setCallTypes] = useState(null);
  const [personnel, setPersonnel] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState(null);
  const [dayOfWeek, setDayOfWeek] = useState(null);
  const [hourOfDay, setHourOfDay] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [generating, setGenerating] = useState(false);

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
      const params = `start_date=${startDate}&end_date=${endDate}`;
      
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
      
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const downloadPdf = async () => {
    setGenerating(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/reports/pdf?start_date=${startDate}&end_date=${endDate}&report_type=summary`
      );
      
      if (!response.ok) {
        const err = await response.json();
        alert(err.detail || 'Failed to generate PDF');
        return;
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `incident_report_${startDate}_${endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
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
        <h2>Reports</h2>
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
            <div className="card-label">Total Incidents</div>
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
