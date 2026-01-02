import { useState, useEffect, useRef } from 'react';

const API_BASE = '';

// =============================================================================
// MAIN REPORTS PAGE - AI-Powered with Traditional Reports
// =============================================================================

function ReportsPage() {
  // =========================================================================
  // STATE
  // =========================================================================
  
  // AI Query
  const [query, setQuery] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  
  // Report selection
  const [activeReport, setActiveReport] = useState('chiefs');
  const [categoryFilter, setCategoryFilter] = useState('FIRE');
  
  // Date controls
  const [reportMonth, setReportMonth] = useState(() => new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(() => new Date().getFullYear());
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  // Report data
  const [chiefsReport, setChiefsReport] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [personnelData, setPersonnelData] = useState(null);
  const [unitData, setUnitData] = useState(null);
  const [trendData, setTrendData] = useState(null);
  
  // Loading/UI
  const [loading, setLoading] = useState(false);

  const queryInputRef = useRef(null);

  // =========================================================================
  // LOAD DATA
  // =========================================================================

  useEffect(() => {
    loadChiefsReport();
  }, [reportMonth, reportYear, categoryFilter]);

  useEffect(() => {
    if (activeReport === 'overview') {
      loadOverviewData();
    } else if (activeReport === 'personnel') {
      loadPersonnelData();
    } else if (activeReport === 'unit') {
      loadUnitData();
    }
  }, [activeReport, startDate, endDate, categoryFilter]);

  const loadChiefsReport = async () => {
    setLoading(true);
    try {
      const params = `year=${reportYear}&month=${reportMonth}&category=${categoryFilter}`;
      const res = await fetch(`${API_BASE}/api/reports/monthly?${params}`);
      const data = await res.json();
      setChiefsReport(data);
    } catch (err) {
      console.error('Failed to load chiefs report:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadOverviewData = async () => {
    setLoading(true);
    try {
      const params = `start_date=${startDate}&end_date=${endDate}&category=${categoryFilter}`;
      const [summaryRes, trendRes] = await Promise.all([
        fetch(`${API_BASE}/api/reports/summary?${params}`),
        fetch(`${API_BASE}/api/reports/monthly-trend?year=${reportYear}`),
      ]);
      setSummaryData(await summaryRes.json());
      setTrendData(await trendRes.json());
    } catch (err) {
      console.error('Failed to load overview:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPersonnelData = async () => {
    setLoading(true);
    try {
      const params = `start_date=${startDate}&end_date=${endDate}&category=${categoryFilter}&limit=50`;
      const res = await fetch(`${API_BASE}/api/reports/personnel?${params}`);
      setPersonnelData(await res.json());
    } catch (err) {
      console.error('Failed to load personnel data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUnitData = async () => {
    setLoading(true);
    try {
      const params = `start_date=${startDate}&end_date=${endDate}&category=${categoryFilter}`;
      const res = await fetch(`${API_BASE}/api/reports/by-apparatus?${params}`);
      setUnitData(await res.json());
    } catch (err) {
      console.error('Failed to load unit data:', err);
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // AI QUERY HANDLER
  // =========================================================================

  const handleQuerySubmit = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    
    setQueryLoading(true);
    setQueryResult(null);
    
    try {
      const result = await executeNaturalQuery(query);
      setQueryResult(result);
      setActiveReport('custom');
    } catch (err) {
      console.error('Query failed:', err);
      setQueryResult({ error: err.message });
    } finally {
      setQueryLoading(false);
    }
  };

  const executeNaturalQuery = async (naturalQuery) => {
    const q = naturalQuery.toLowerCase();
    
    let queryStart = startDate;
    let queryEnd = endDate;
    let queryCategory = null;
    
    if (q.includes('last 30 days') || q.includes('past 30 days')) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      queryStart = start.toISOString().split('T')[0];
      queryEnd = end.toISOString().split('T')[0];
    } else if (q.includes('this month') || q.includes('month to date')) {
      const now = new Date();
      queryStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      queryEnd = now.toISOString().split('T')[0];
    } else if (q.includes('this year') || q.includes('year to date') || q.includes('ytd')) {
      const now = new Date();
      queryStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      queryEnd = now.toISOString().split('T')[0];
    } else if (q.includes('last year')) {
      const now = new Date();
      queryStart = new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0];
      queryEnd = new Date(now.getFullYear() - 1, 11, 31).toISOString().split('T')[0];
    }
    
    if (q.includes('fire')) queryCategory = 'FIRE';
    else if (q.includes('ems') || q.includes('medical')) queryCategory = 'EMS';
    
    if (q.includes('chiefs') || q.includes('monthly report') || q.includes('chief')) {
      const monthMatch = q.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
      const yearMatch = q.match(/\b(20\d{2})\b/);
      
      let month = reportMonth;
      let year = reportYear;
      
      if (monthMatch) {
        const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        month = months.indexOf(monthMatch[1].toLowerCase()) + 1;
      }
      if (yearMatch) {
        year = parseInt(yearMatch[1]);
      }
      
      const cat = queryCategory || categoryFilter;
      const res = await fetch(`${API_BASE}/api/reports/monthly?year=${year}&month=${month}&category=${cat}`);
      const data = await res.json();
      
      return {
        type: 'chiefs',
        title: `Chiefs Report - ${data.month_name} ${data.year} (${cat})`,
        data,
        query: naturalQuery,
        pdfParams: { year, month, category: cat },
      };
    }
    
    if (q.includes('personnel') || q.includes('responder') || q.includes('firefighter')) {
      const cat = queryCategory || categoryFilter;
      const params = `start_date=${queryStart}&end_date=${queryEnd}&category=${cat}&limit=50`;
      const res = await fetch(`${API_BASE}/api/reports/personnel?${params}`);
      const data = await res.json();
      
      return {
        type: 'personnel',
        title: `Personnel Report (${queryStart} to ${queryEnd})`,
        data,
        query: naturalQuery,
      };
    }
    
    if (q.includes('unit') || q.includes('apparatus') || q.includes('engine') || q.includes('truck')) {
      const cat = queryCategory || categoryFilter;
      const params = `start_date=${queryStart}&end_date=${queryEnd}&category=${cat}`;
      const res = await fetch(`${API_BASE}/api/reports/by-apparatus?${params}`);
      const data = await res.json();
      
      return {
        type: 'unit',
        title: `Unit Response Report (${queryStart} to ${queryEnd})`,
        data,
        query: naturalQuery,
      };
    }
    
    if (q.includes('auto accident') || q.includes('accident') || q.includes('mva')) {
      const cat = queryCategory || 'FIRE';
      const params = `start_date=${queryStart}&end_date=${queryEnd}&category=${cat}`;
      const res = await fetch(`${API_BASE}/api/reports/by-type?${params}`);
      const data = await res.json();
      
      const accidents = data.call_types?.filter(t => 
        t.call_type?.toLowerCase().includes('accident') ||
        t.call_type?.toLowerCase().includes('mva')
      ) || [];
      
      return {
        type: 'filtered',
        title: `Auto Accidents (${queryStart} to ${queryEnd})`,
        data: { call_types: accidents, total: accidents.reduce((sum, a) => sum + a.incident_count, 0) },
        query: naturalQuery,
      };
    }
    
    const cat = queryCategory || categoryFilter;
    const params = `start_date=${queryStart}&end_date=${queryEnd}&category=${cat}`;
    const res = await fetch(`${API_BASE}/api/reports/summary?${params}`);
    const data = await res.json();
    
    return {
      type: 'summary',
      title: `Summary Report (${queryStart} to ${queryEnd})`,
      data,
      query: naturalQuery,
    };
  };

  const quickQuery = (queryText) => {
    setQuery(queryText);
    setTimeout(() => handleQuerySubmit(), 100);
  };

  const openPrintableReport = (year, month, category) => {
    const url = `${API_BASE}/api/reports/pdf/monthly-weasy?year=${year}&month=${month}&category=${category}`;
    window.open(url, '_blank');
  };

  // =========================================================================
  // STYLES - Light Theme
  // =========================================================================
  const styles = {
    page: { minHeight: '100vh', color: '#333' },
    header: { background: '#fff', borderBottom: '3px solid #016a2b', padding: '1rem 1.5rem', marginBottom: '1rem' },
    headerTitle: { fontSize: '1.5rem', fontWeight: '700', color: '#016a2b', margin: 0 },
    headerSub: { color: '#666', fontSize: '0.85rem', marginTop: '0.25rem' },
    queryBar: { background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', padding: '1rem', marginBottom: '1rem' },
    input: { width: '100%', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.9rem', background: '#fff', color: '#333' },
    btn: { padding: '0.5rem 1rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '0.85rem' },
    btnPrimary: { background: '#016a2b', color: '#fff' },
    btnSecondary: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd' },
    btnActive: { background: '#016a2b', color: '#fff' },
    card: { background: '#fff', borderRadius: '6px', padding: '1.25rem', border: '1px solid #e0e0e0', marginBottom: '1rem' },
    cardTitle: { fontSize: '1rem', fontWeight: '600', color: '#016a2b', borderBottom: '1px solid #e0e0e0', paddingBottom: '0.5rem', marginBottom: '1rem' },
    statCard: { background: '#fff', borderRadius: '6px', padding: '1rem', textAlign: 'center', border: '1px solid #e0e0e0' },
    statValue: { fontSize: '1.75rem', fontWeight: '700' },
    statLabel: { color: '#666', fontSize: '0.8rem', marginTop: '0.25rem' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
    th: { textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #016a2b', color: '#016a2b', fontWeight: '600' },
    td: { padding: '0.5rem', borderBottom: '1px solid #e0e0e0' },
    quickBtn: { padding: '0.35rem 0.75rem', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', color: '#333' },
  };

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.headerTitle}>Reports</h1>
        <p style={styles.headerSub}>Generate monthly chiefs reports or ask questions in plain English</p>
      </div>

      {/* AI Query Bar */}
      <div style={styles.queryBar}>
        <form onSubmit={handleQuerySubmit} style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              ref={queryInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Try: "Show me fire calls for November 2025" or "Who ran the most calls this year?"'
              style={styles.input}
            />
          </div>
          <button
            type="submit"
            disabled={queryLoading || !query.trim()}
            style={{ ...styles.btn, ...styles.btnPrimary, opacity: queryLoading || !query.trim() ? 0.6 : 1 }}
          >
            {queryLoading ? 'Running...' : 'Run Query'}
          </button>
        </form>
        
        {/* Quick Query Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
          <span style={{ color: '#888', fontSize: '0.8rem' }}>Quick:</span>
          <button onClick={() => quickQuery('Show me the chiefs report for this month')} style={styles.quickBtn}>This Month Chiefs</button>
          <button onClick={() => quickQuery('Fire calls year to date')} style={styles.quickBtn}>YTD Fire</button>
          <button onClick={() => quickQuery('Top personnel responders this year')} style={styles.quickBtn}>Top Responders</button>
          <button onClick={() => quickQuery('Auto accidents last 90 days')} style={styles.quickBtn}>Recent Accidents</button>
          <button onClick={() => quickQuery('Unit response counts this year')} style={styles.quickBtn}>Unit Stats</button>
        </div>
      </div>

      {/* Report Tabs + Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['chiefs', 'overview', 'personnel', 'unit'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveReport(tab)}
              style={{
                ...styles.btn,
                ...(activeReport === tab ? styles.btnActive : styles.btnSecondary),
              }}
            >
              {tab === 'chiefs' && '📋 Monthly Report'}
              {tab === 'overview' && '📊 Date Range'}
              {tab === 'personnel' && '👥 Personnel'}
              {tab === 'unit' && '🚒 Units'}
            </button>
          ))}
          {queryResult && (
            <button
              onClick={() => setActiveReport('custom')}
              style={{
                ...styles.btn,
                background: activeReport === 'custom' ? '#7c3aed' : '#ede9fe',
                color: activeReport === 'custom' ? '#fff' : '#7c3aed',
              }}
            >
              ✨ Query Result
            </button>
          )}
        </div>

        {/* Category Toggle */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setCategoryFilter('FIRE')}
            style={{
              ...styles.btn,
              background: categoryFilter === 'FIRE' ? '#dc2626' : '#fee2e2',
              color: categoryFilter === 'FIRE' ? '#fff' : '#dc2626',
            }}
          >
            🔥 Fire
          </button>
          <button
            onClick={() => setCategoryFilter('EMS')}
            style={{
              ...styles.btn,
              background: categoryFilter === 'EMS' ? '#2563eb' : '#dbeafe',
              color: categoryFilter === 'EMS' ? '#fff' : '#2563eb',
            }}
          >
            🚑 EMS
          </button>
        </div>
      </div>

      {/* Report Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Loading report...</div>
      ) : (
        <>
          {activeReport === 'chiefs' && (
            <ChiefsReportView
              report={chiefsReport}
              month={reportMonth}
              year={reportYear}
              category={categoryFilter}
              onMonthChange={setReportMonth}
              onYearChange={setReportYear}
              onOpenPrint={() => openPrintableReport(reportYear, reportMonth, categoryFilter)}
              showControls={true}
              styles={styles}
            />
          )}

          {activeReport === 'overview' && summaryData && (
            <OverviewReport
              summary={summaryData}
              trend={trendData}
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              year={reportYear}
              onYearChange={setReportYear}
              styles={styles}
            />
          )}

          {activeReport === 'personnel' && personnelData && (
            <PersonnelReport
              data={personnelData}
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              styles={styles}
            />
          )}

          {activeReport === 'unit' && unitData && (
            <UnitReport
              data={unitData}
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              styles={styles}
            />
          )}

          {activeReport === 'custom' && queryResult && (
            <CustomQueryResult result={queryResult} onOpenPrint={openPrintableReport} styles={styles} />
          )}
        </>
      )}
    </div>
  );
}


// =============================================================================
// CHIEFS REPORT VIEW
// =============================================================================

function ChiefsReportView({ report, month, year, category, onMonthChange, onYearChange, onOpenPrint, showControls = false, styles }) {
  if (!report) return null;

  const cs = report.call_summary || {};
  const isFireReport = category === 'FIRE';
  
  return (
    <div>
      {/* Controls */}
      {showControls && (
        <div style={{ ...styles.card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ color: '#666', fontSize: '0.85rem' }}>Month:</label>
            <select value={month} onChange={(e) => onMonthChange(parseInt(e.target.value))} style={styles.input}>
              {[...Array(12)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ color: '#666', fontSize: '0.85rem' }}>Year:</label>
            <select value={year} onChange={(e) => onYearChange(parseInt(e.target.value))} style={styles.input}>
              {[...Array(5)].map((_, i) => {
                const y = new Date().getFullYear() - i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={onOpenPrint} style={{ ...styles.btn, ...styles.btnPrimary }}>
              🖨️ Print Report
            </button>
          </div>
        </div>
      )}

      {/* Report Header */}
      <div style={{ ...styles.card, textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#016a2b', margin: 0 }}>GLEN MOORE FIRE CO. MONTHLY REPORT</h2>
        <p style={{ color: '#666', marginTop: '0.25rem' }}>
          {report.month_name} {report.year} - {category === 'FIRE' ? '🔥 Fire' : '🚑 EMS'}
        </p>
      </div>

      {/* Call Summary */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>CALL SUMMARY</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#2563eb' }}>{cs.number_of_calls || 0}</div>
            <div style={styles.statLabel}>Calls for Month</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#16a34a' }}>{cs.number_of_men || 0}</div>
            <div style={styles.statLabel}>Number of Men</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#ca8a04' }}>{(cs.hours || 0).toFixed(1)}</div>
            <div style={styles.statLabel}>Hours</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#9333ea' }}>{(cs.man_hours || 0).toFixed(1)}</div>
            <div style={styles.statLabel}>Man Hours</div>
          </div>
        </div>
        
        {isFireReport && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div style={styles.statCard}>
              <div style={{ ...styles.statValue, color: '#ea580c', fontSize: '1.25rem' }}>${((cs.property_at_risk || 0) / 100).toLocaleString()}</div>
              <div style={styles.statLabel}>Property at Risk</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statValue, color: '#dc2626', fontSize: '1.25rem' }}>${((cs.fire_damages || 0) / 100).toLocaleString()}</div>
              <div style={styles.statLabel}>Fire Damages</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statValue, color: '#eab308' }}>{cs.ff_injuries || 0}</div>
              <div style={styles.statLabel}>FF Injuries</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statValue, color: '#ec4899' }}>{cs.civilian_injuries || 0}</div>
              <div style={styles.statLabel}>Civilian Injuries</div>
            </div>
          </div>
        )}
        
        <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>
          <span style={{ color: '#666' }}>vs Same Month Last Year: </span>
          <span style={{ fontWeight: '600', color: cs.change >= 0 ? '#16a34a' : '#dc2626' }}>
            {cs.change >= 0 ? '+' : ''}{cs.change || 0} ({cs.percent_change >= 0 ? '+' : ''}{cs.percent_change || 0}%)
          </span>
        </div>
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        {/* Municipality Summary */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>MUNICIPALITY SUMMARY</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Municipality</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Calls</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Man Hrs</th>
              </tr>
            </thead>
            <tbody>
              {(report.municipalities || []).map((m, i) => (
                <tr key={i}>
                  <td style={styles.td}>{m.municipality}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace' }}>{m.calls}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace' }}>{m.manhours?.toFixed(1)}</td>
                </tr>
              ))}
              {(!report.municipalities || report.municipalities.length === 0) && (
                <tr><td colSpan="3" style={{ ...styles.td, textAlign: 'center', color: '#888' }}>No data</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Responses Per Unit */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>RESPONSES PER UNIT</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Unit</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Responses</th>
              </tr>
            </thead>
            <tbody>
              {(report.responses_per_unit || []).map((u, i) => (
                <tr key={i}>
                  <td style={styles.td}>{u.unit_name || u.unit}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace' }}>{u.responses}</td>
                </tr>
              ))}
              {(!report.responses_per_unit || report.responses_per_unit.length === 0) && (
                <tr><td colSpan="2" style={{ ...styles.td, textAlign: 'center', color: '#888' }}>No data</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Type of Incident */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>TYPE OF INCIDENT</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Type</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {(report.incident_types || []).map((t, i) => (
                <tr key={i}>
                  <td style={styles.td}>{t.type}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace' }}>{t.count}</td>
                </tr>
              ))}
              {(!report.incident_types || report.incident_types.length === 0) && (
                <tr><td colSpan="2" style={{ ...styles.td, textAlign: 'center', color: '#888' }}>No data</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mutual Aid */}
        {isFireReport && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>MUTUAL AID ASSIST TO</h3>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Station</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {(report.mutual_aid || []).map((ma, i) => (
                  <tr key={i}>
                    <td style={styles.td}>{ma.station}</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace' }}>{ma.count}</td>
                  </tr>
                ))}
                {(!report.mutual_aid || report.mutual_aid.length === 0) && (
                  <tr><td colSpan="2" style={{ ...styles.td, textAlign: 'center', color: '#888' }}>None</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Response Times */}
      {report.response_times && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>RESPONSE TIMES</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#2563eb' }}>
                {report.response_times.avg_turnout_minutes?.toFixed(1) || '-'} min
              </div>
              <div style={{ color: '#666', fontSize: '0.85rem' }}>Avg Turnout</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#16a34a' }}>
                {report.response_times.avg_response_minutes?.toFixed(1) || '-'} min
              </div>
              <div style={{ color: '#666', fontSize: '0.85rem' }}>Avg Response</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ca8a04' }}>
                {report.response_times.avg_on_scene_minutes?.toFixed(1) || '-'} min
              </div>
              <div style={{ color: '#666', fontSize: '0.85rem' }}>Avg On Scene</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// =============================================================================
// OVERVIEW REPORT
// =============================================================================

function OverviewReport({ summary, trend, startDate, endDate, onStartDateChange, onEndDateChange, year, onYearChange, styles }) {
  if (!summary) return null;

  return (
    <div>
      {/* Date Range Controls */}
      <div style={{ ...styles.card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ color: '#666', fontSize: '0.85rem' }}>From:</label>
          <input type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} style={{ ...styles.input, width: 'auto' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ color: '#666', fontSize: '0.85rem' }}>To:</label>
          <input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} style={{ ...styles.input, width: 'auto' }} />
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: '#2563eb' }}>{summary.total_incidents}</div>
          <div style={styles.statLabel}>Total Incidents</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: '#16a34a' }}>{summary.total_personnel_responses}</div>
          <div style={styles.statLabel}>Personnel Responses</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: '#ca8a04' }}>{summary.total_manhours?.toFixed(1)}</div>
          <div style={styles.statLabel}>Total Manhours</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: '#9333ea' }}>{summary.response_times?.avg_response_minutes?.toFixed(1) || '-'}</div>
          <div style={styles.statLabel}>Avg Response (min)</div>
        </div>
      </div>

      {/* Monthly Trend */}
      {trend && (
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ ...styles.cardTitle, marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>Monthly Trend - {year}</h3>
            <select value={year} onChange={(e) => onYearChange(parseInt(e.target.value))} style={{ ...styles.input, width: 'auto' }}>
              {[...Array(5)].map((_, i) => {
                const y = new Date().getFullYear() - i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '180px' }}>
            {trend.months?.map((m, i) => {
              const maxCount = Math.max(...trend.months.map(x => x.incident_count), 1);
              const height = (m.incident_count / maxCount) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '150px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>{m.incident_count || ''}</span>
                    <div style={{ width: '100%', maxWidth: '40px', background: '#016a2b', borderRadius: '3px 3px 0 0', height: `${height}%`, minHeight: m.incident_count > 0 ? '4px' : '0' }} />
                  </div>
                  <span style={{ fontSize: '0.65rem', color: '#888', marginTop: '4px' }}>{m.month_name?.slice(0, 3)}</span>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: 'center', marginTop: '1rem', color: '#666', fontSize: '0.85rem' }}>
            Total: <span style={{ fontWeight: '700', color: '#333' }}>{trend.total_incidents}</span> incidents
          </div>
        </div>
      )}
    </div>
  );
}


// =============================================================================
// PERSONNEL REPORT
// =============================================================================

function PersonnelReport({ data, startDate, endDate, onStartDateChange, onEndDateChange, styles }) {
  if (!data) return null;

  return (
    <div>
      <div style={{ ...styles.card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ color: '#666', fontSize: '0.85rem' }}>From:</label>
          <input type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} style={{ ...styles.input, width: 'auto' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ color: '#666', fontSize: '0.85rem' }}>To:</label>
          <input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} style={{ ...styles.input, width: 'auto' }} />
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Top Responders</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Rank</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Calls</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Hours</th>
            </tr>
          </thead>
          <tbody>
            {(data.personnel || []).map((p, i) => (
              <tr key={p.id} style={{ background: i < 3 ? '#f0fdf4' : 'transparent' }}>
                <td style={styles.td}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                <td style={{ ...styles.td, fontWeight: '500' }}>{p.name}</td>
                <td style={{ ...styles.td, color: '#666' }}>{p.rank || '-'}</td>
                <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace', color: '#2563eb' }}>{p.incident_count}</td>
                <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace', color: '#16a34a' }}>{p.total_hours?.toFixed(1)}</td>
              </tr>
            ))}
            {(!data.personnel || data.personnel.length === 0) && (
              <tr><td colSpan="5" style={{ ...styles.td, textAlign: 'center', color: '#888' }}>No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// =============================================================================
// UNIT REPORT
// =============================================================================

function UnitReport({ data, startDate, endDate, onStartDateChange, onEndDateChange, styles }) {
  if (!data) return null;

  return (
    <div>
      <div style={{ ...styles.card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ color: '#666', fontSize: '0.85rem' }}>From:</label>
          <input type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} style={{ ...styles.input, width: 'auto' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ color: '#666', fontSize: '0.85rem' }}>To:</label>
          <input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} style={{ ...styles.input, width: 'auto' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {(data.apparatus || []).map((u, i) => (
          <div key={i} style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: '700' }}>{u.unit_designator}</span>
              <span style={{ color: '#666', fontSize: '0.8rem' }}>{u.name}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#2563eb' }}>{u.incident_count}</div>
                <div style={{ fontSize: '0.7rem', color: '#666' }}>Incidents</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#16a34a' }}>{u.total_responses}</div>
                <div style={{ fontSize: '0.7rem', color: '#666' }}>Responses</div>
              </div>
            </div>
          </div>
        ))}
        {(!data.apparatus || data.apparatus.length === 0) && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#888', padding: '2rem' }}>No unit data</div>
        )}
      </div>
    </div>
  );
}


// =============================================================================
// CUSTOM QUERY RESULT
// =============================================================================

function CustomQueryResult({ result, onOpenPrint, styles }) {
  if (!result) return null;

  if (result.error) {
    return (
      <div style={{ ...styles.card, background: '#fef2f2', border: '1px solid #fecaca' }}>
        <h3 style={{ color: '#dc2626', fontWeight: '600', marginBottom: '0.5rem' }}>Query Error</h3>
        <p style={{ color: '#666' }}>{result.error}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ ...styles.card, background: '#f5f3ff', border: '1px solid #c4b5fd' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#7c3aed' }}>
              <span>✨</span>
              <span style={{ fontWeight: '500' }}>{result.title}</span>
            </div>
            <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.25rem' }}>Query: "{result.query}"</p>
          </div>
          {result.type === 'chiefs' && result.pdfParams && (
            <button
              onClick={() => onOpenPrint(result.pdfParams.year, result.pdfParams.month, result.pdfParams.category)}
              style={{ ...styles.btn, ...styles.btnPrimary }}
            >
              🖨️ Print Report
            </button>
          )}
        </div>
      </div>

      {result.type === 'chiefs' && result.data && (
        <ChiefsReportView
          report={result.data}
          month={result.data.month}
          year={result.data.year}
          category={result.data.category_filter || 'FIRE'}
          onMonthChange={() => {}}
          onYearChange={() => {}}
          onOpenPrint={() => onOpenPrint(result.pdfParams.year, result.pdfParams.month, result.pdfParams.category)}
          showControls={false}
          styles={styles}
        />
      )}

      {result.type === 'personnel' && result.data && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Personnel Results</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Rank</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Calls</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {(result.data.personnel || []).map((p, i) => (
                <tr key={p.id} style={{ background: i < 3 ? '#f0fdf4' : 'transparent' }}>
                  <td style={styles.td}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                  <td style={{ ...styles.td, fontWeight: '500' }}>{p.name}</td>
                  <td style={{ ...styles.td, color: '#666' }}>{p.rank || '-'}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace', color: '#2563eb' }}>{p.incident_count}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace', color: '#16a34a' }}>{p.total_hours?.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.type === 'unit' && result.data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {(result.data.apparatus || []).map((u, i) => (
            <div key={i} style={styles.card}>
              <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>{u.unit_designator}</div>
              <div style={{ color: '#666', fontSize: '0.8rem' }}>{u.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#2563eb' }}>{u.incident_count}</div>
                  <div style={{ fontSize: '0.7rem', color: '#666' }}>Incidents</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#16a34a' }}>{u.total_responses}</div>
                  <div style={{ fontSize: '0.7rem', color: '#666' }}>Responses</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {result.type === 'filtered' && result.data && (
        <div style={styles.card}>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#2563eb' }}>{result.data.total}</div>
            <div style={{ color: '#666' }}>Total Incidents</div>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Call Type</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {(result.data.call_types || []).map((t, i) => (
                <tr key={i}>
                  <td style={styles.td}>{t.call_type}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace' }}>{t.incident_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.type === 'summary' && result.data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#2563eb' }}>{result.data.total_incidents}</div>
            <div style={styles.statLabel}>Total Incidents</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#16a34a' }}>{result.data.total_personnel_responses}</div>
            <div style={styles.statLabel}>Personnel Responses</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#ca8a04' }}>{result.data.total_manhours?.toFixed(1)}</div>
            <div style={styles.statLabel}>Total Manhours</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#9333ea' }}>{result.data.response_times?.avg_response_minutes?.toFixed(1) || '-'}</div>
            <div style={styles.statLabel}>Avg Response (min)</div>
          </div>
        </div>
      )}
    </div>
  );
}


export default ReportsPage;
