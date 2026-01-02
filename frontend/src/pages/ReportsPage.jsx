import { useState, useEffect, useRef } from 'react';
import { useBranding } from '../contexts/BrandingContext';

const API_BASE = '';

// =============================================================================
// MAIN REPORTS PAGE - Styled to match PDF report
// =============================================================================

function ReportsPage() {
  const branding = useBranding();
  
  // State
  const [query, setQuery] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  const [activeReport, setActiveReport] = useState('chiefs');
  const [categoryFilter, setCategoryFilter] = useState('FIRE');
  const [reportMonth, setReportMonth] = useState(() => new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(() => new Date().getFullYear());
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [chiefsReport, setChiefsReport] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [personnelData, setPersonnelData] = useState(null);
  const [unitData, setUnitData] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [loading, setLoading] = useState(false);

  const queryInputRef = useRef(null);

  // Load data
  useEffect(() => { loadChiefsReport(); }, [reportMonth, reportYear, categoryFilter]);

  useEffect(() => {
    if (activeReport === 'overview') loadOverviewData();
    else if (activeReport === 'personnel') loadPersonnelData();
    else if (activeReport === 'unit') loadUnitData();
  }, [activeReport, startDate, endDate, categoryFilter]);

  const loadChiefsReport = async () => {
    setLoading(true);
    try {
      const params = `year=${reportYear}&month=${reportMonth}&category=${categoryFilter}`;
      const res = await fetch(`${API_BASE}/api/reports/monthly?${params}`);
      setChiefsReport(await res.json());
    } catch (err) { console.error('Failed to load chiefs report:', err); }
    finally { setLoading(false); }
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
    } catch (err) { console.error('Failed to load overview:', err); }
    finally { setLoading(false); }
  };

  const loadPersonnelData = async () => {
    setLoading(true);
    try {
      const params = `start_date=${startDate}&end_date=${endDate}&category=${categoryFilter}&limit=50`;
      const res = await fetch(`${API_BASE}/api/reports/personnel?${params}`);
      setPersonnelData(await res.json());
    } catch (err) { console.error('Failed to load personnel data:', err); }
    finally { setLoading(false); }
  };

  const loadUnitData = async () => {
    setLoading(true);
    try {
      const params = `start_date=${startDate}&end_date=${endDate}&category=${categoryFilter}`;
      const res = await fetch(`${API_BASE}/api/reports/by-apparatus?${params}`);
      setUnitData(await res.json());
    } catch (err) { console.error('Failed to load unit data:', err); }
    finally { setLoading(false); }
  };

  // Query handlers
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
    } finally { setQueryLoading(false); }
  };

  const executeNaturalQuery = async (naturalQuery) => {
    const q = naturalQuery.toLowerCase();
    let queryStart = startDate, queryEnd = endDate, queryCategory = null;
    
    if (q.includes('last 30 days') || q.includes('past 30 days')) {
      const end = new Date(), start = new Date();
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
      let month = reportMonth, year = reportYear;
      if (monthMatch) {
        const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        month = months.indexOf(monthMatch[1].toLowerCase()) + 1;
      }
      if (yearMatch) year = parseInt(yearMatch[1]);
      const cat = queryCategory || categoryFilter;
      const res = await fetch(`${API_BASE}/api/reports/monthly?year=${year}&month=${month}&category=${cat}`);
      const data = await res.json();
      return { type: 'chiefs', title: `Chiefs Report - ${data.month_name} ${data.year} (${cat})`, data, query: naturalQuery, pdfParams: { year, month, category: cat } };
    }
    
    if (q.includes('personnel') || q.includes('responder') || q.includes('firefighter')) {
      const cat = queryCategory || categoryFilter;
      const res = await fetch(`${API_BASE}/api/reports/personnel?start_date=${queryStart}&end_date=${queryEnd}&category=${cat}&limit=50`);
      return { type: 'personnel', title: `Personnel Report (${queryStart} to ${queryEnd})`, data: await res.json(), query: naturalQuery };
    }
    
    if (q.includes('unit') || q.includes('apparatus') || q.includes('engine') || q.includes('truck')) {
      const cat = queryCategory || categoryFilter;
      const res = await fetch(`${API_BASE}/api/reports/by-apparatus?start_date=${queryStart}&end_date=${queryEnd}&category=${cat}`);
      return { type: 'unit', title: `Unit Response Report (${queryStart} to ${queryEnd})`, data: await res.json(), query: naturalQuery };
    }
    
    const cat = queryCategory || categoryFilter;
    const res = await fetch(`${API_BASE}/api/reports/summary?start_date=${queryStart}&end_date=${queryEnd}&category=${cat}`);
    return { type: 'summary', title: `Summary Report (${queryStart} to ${queryEnd})`, data: await res.json(), query: naturalQuery };
  };

  const quickQuery = (queryText) => { setQuery(queryText); setTimeout(() => handleQuerySubmit(), 100); };
  const openPrintableReport = (year, month, category) => window.open(`${API_BASE}/api/reports/pdf/monthly-weasy?year=${year}&month=${month}&category=${category}`, '_blank');

  // ==========================================================================
  // STYLES - Using branding colors
  // ==========================================================================
  const colors = {
    green: branding.primaryColor || '#016a2b',
    greenLight: branding.primaryLight || '#e8f5e9',
    secondary: branding.secondaryColor || '#eeee01',
    pageBg: '#dcdcdc',      // Page background - gray
    cardBg: '#ffffff',       // Card background - white
    statBg: '#e8e8e8',       // Stat box background - visible gray
    border: '#c0c0c0',       // Borders - darker for visibility
    grayDark: '#666',
    text: '#333',
    white: '#fff',
    red: '#dc2626',
    redLight: '#fee2e2',
    blue: '#2563eb',
    blueLight: '#dbeafe',
  };

  const s = {
    page: { background: colors.pageBg, minHeight: '100vh', padding: '0' },
    
    // Header matching PDF header style
    header: { 
      display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem',
      borderBottom: `3px solid ${colors.green}`, background: colors.cardBg, marginBottom: '1rem',
      position: 'relative'
    },
    headerAccent: {
      position: 'absolute', bottom: '-3px', left: '0', width: '80px', height: '3px',
      background: colors.secondary
    },
    headerLogo: { width: '60px', height: '60px', objectFit: 'contain' },
    headerText: { flex: 1 },
    headerTitle: { fontSize: '1.5rem', fontWeight: '700', color: colors.text, margin: 0 },
    headerSub: { fontSize: '0.9rem', color: colors.green, margin: '0.25rem 0 0 0' },
    
    // Controls bar
    controlsBar: { 
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem',
      padding: '0.75rem 1rem', background: colors.cardBg, borderRadius: '4px',
      border: `1px solid ${colors.border}`, marginBottom: '1rem'
    },
    
    // Query bar
    queryBar: { 
      padding: '1rem', background: colors.cardBg, borderRadius: '4px',
      border: `1px solid ${colors.border}`, marginBottom: '1rem'
    },
    input: { 
      padding: '0.6rem 0.75rem', border: `1px solid ${colors.border}`, borderRadius: '4px',
      fontSize: '0.9rem', background: colors.white, color: colors.text, outline: 'none'
    },
    select: {
      padding: '0.5rem 0.75rem', border: `1px solid ${colors.border}`, borderRadius: '4px',
      fontSize: '0.85rem', background: colors.white, color: colors.text, cursor: 'pointer'
    },
    
    // Buttons
    btn: { 
      padding: '0.5rem 1rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
      fontWeight: '500', fontSize: '0.85rem', transition: 'all 0.15s'
    },
    btnGreen: { background: colors.green, color: colors.white },
    btnGreenHover: { boxShadow: `0 0 0 2px ${colors.secondary}` },
    btnGray: { background: colors.white, color: colors.text, border: `1px solid ${colors.border}` },
    btnSmall: { padding: '0.35rem 0.6rem', fontSize: '0.8rem' },
    
    // Cards - matching PDF boxes
    card: { 
      background: colors.cardBg, borderRadius: '4px', border: `1px solid ${colors.border}`,
      marginBottom: '1rem', overflow: 'hidden', borderTop: `3px solid ${colors.secondary}`
    },
    cardHeader: { 
      background: colors.statBg, padding: '0.6rem 1rem', fontSize: '0.8rem',
      fontWeight: '600', color: colors.green, textTransform: 'uppercase', letterSpacing: '0.5px',
      borderBottom: `1px solid ${colors.border}`
    },
    cardBody: { padding: '1rem', background: colors.cardBg },
    
    // Stat boxes - matching PDF stat cards with VISIBLE gray background
    statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' },
    statBox: { 
      background: colors.statBg, borderRadius: '4px', padding: '1rem', textAlign: 'center',
      border: `1px solid ${colors.border}`
    },
    statValue: { fontSize: '1.75rem', fontWeight: '700', color: colors.text, lineHeight: 1.2 },
    statLabel: { fontSize: '0.7rem', color: colors.grayDark, textTransform: 'uppercase', marginTop: '0.25rem', letterSpacing: '0.3px' },
    statSub: { fontSize: '0.75rem', color: colors.green },
    
    // Tables - matching PDF tables
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
    th: { 
      textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: '600', color: colors.white,
      background: colors.green, fontSize: '0.8rem'
    },
    thFirst: {
      borderLeft: `3px solid ${colors.secondary}`
    },
    td: { padding: '0.5rem 0.75rem', borderBottom: `1px solid ${colors.border}`, color: colors.text },
    tdRight: { textAlign: 'right', fontFamily: 'monospace' },
    tdGreen: { color: colors.green, fontWeight: '600' },
    
    // Two column layout
    twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' },
    
    // Badge (for counts)
    badge: { 
      display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px',
      fontSize: '0.8rem', fontWeight: '600', background: colors.green, color: colors.white
    },
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div style={s.page}>
      {/* Header - PDF style with logo */}
      <div style={s.header}>
        <div style={s.headerAccent} />
        {branding.logoUrl && <img src={branding.logoUrl} alt="Logo" style={s.headerLogo} />}
        <div style={s.headerText}>
          <h1 style={s.headerTitle}>{branding.stationName || 'GLEN MOORE FIRE COMPANY'}</h1>
          <p style={s.headerSub}>Monthly Activity Report — {activeReport === 'chiefs' ? `${new Date(2000, reportMonth - 1).toLocaleString('default', { month: 'long' })} ${reportYear}` : 'Reports'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setCategoryFilter('FIRE')}
            style={{ ...s.btn, ...(categoryFilter === 'FIRE' ? { background: colors.red, color: colors.white } : { background: colors.redLight, color: colors.red, border: `1px solid ${colors.red}` }) }}
          >🔥 Fire</button>
          <button
            onClick={() => setCategoryFilter('EMS')}
            style={{ ...s.btn, ...(categoryFilter === 'EMS' ? { background: colors.blue, color: colors.white } : { background: colors.blueLight, color: colors.blue, border: `1px solid ${colors.blue}` }) }}
          >🚑 EMS</button>
        </div>
      </div>

      {/* Report Type Tabs + Controls */}
      <div style={s.controlsBar}>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {['chiefs', 'overview', 'personnel', 'unit'].map(tab => (
            <button key={tab} onClick={() => setActiveReport(tab)}
              style={{ ...s.btn, ...s.btnSmall, ...(activeReport === tab ? s.btnGreen : s.btnGray) }}>
              {tab === 'chiefs' ? '📋 Monthly' : tab === 'overview' ? '📊 Overview' : tab === 'personnel' ? '👥 Personnel' : '🚒 Units'}
            </button>
          ))}
          {queryResult && (
            <button onClick={() => setActiveReport('custom')}
              style={{ ...s.btn, ...s.btnSmall, background: activeReport === 'custom' ? colors.green : colors.greenLight, color: activeReport === 'custom' ? colors.white : colors.green }}>
              ✨ Query
            </button>
          )}
        </div>
        
        {activeReport === 'chiefs' && (
          <>
            <select value={reportMonth} onChange={(e) => setReportMonth(parseInt(e.target.value))} style={s.select}>
              {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>)}
            </select>
            <select value={reportYear} onChange={(e) => setReportYear(parseInt(e.target.value))} style={s.select}>
              {[...Array(5)].map((_, i) => { const y = new Date().getFullYear() - i; return <option key={y} value={y}>{y}</option>; })}
            </select>
            <button onClick={() => openPrintableReport(reportYear, reportMonth, categoryFilter)} style={{ ...s.btn, ...s.btnGreen }}>🖨️ Print PDF</button>
          </>
        )}
        
        {(activeReport === 'overview' || activeReport === 'personnel' || activeReport === 'unit') && (
          <>
            <span style={{ color: colors.grayDark, fontSize: '0.85rem' }}>From:</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...s.input, width: 'auto' }} />
            <span style={{ color: colors.grayDark, fontSize: '0.85rem' }}>To:</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ ...s.input, width: 'auto' }} />
          </>
        )}
      </div>

      {/* AI Query Bar */}
      <div style={s.queryBar}>
        <form onSubmit={handleQuerySubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input ref={queryInputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder='Ask: "Show fire calls for November" or "Top responders this year"'
            style={{ ...s.input, flex: 1 }} />
          <button type="submit" disabled={queryLoading || !query.trim()} style={{ ...s.btn, ...s.btnGreen, opacity: queryLoading ? 0.6 : 1 }}>
            {queryLoading ? '...' : 'Run'}
          </button>
        </form>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
          <span style={{ color: colors.grayDark, fontSize: '0.75rem' }}>Quick:</span>
          {['This Month Chiefs', 'YTD Fire', 'Top Responders', 'Unit Stats'].map(q => (
            <button key={q} onClick={() => quickQuery(q.includes('Chiefs') ? 'Show me the chiefs report for this month' : q.includes('YTD') ? 'Fire calls year to date' : q.includes('Responders') ? 'Top personnel responders this year' : 'Unit response counts this year')}
              style={{ ...s.btn, ...s.btnSmall, ...s.btnGray }}>{q}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: colors.grayDark }}>Loading...</div>
      ) : (
        <>
          {activeReport === 'chiefs' && chiefsReport && <ChiefsReportView report={chiefsReport} category={categoryFilter} s={s} colors={colors} />}
          {activeReport === 'overview' && summaryData && <OverviewReport summary={summaryData} trend={trendData} year={reportYear} onYearChange={setReportYear} s={s} colors={colors} />}
          {activeReport === 'personnel' && personnelData && <PersonnelReport data={personnelData} s={s} colors={colors} />}
          {activeReport === 'unit' && unitData && <UnitReport data={unitData} s={s} colors={colors} />}
          {activeReport === 'custom' && queryResult && <CustomQueryResult result={queryResult} onOpenPrint={openPrintableReport} s={s} colors={colors} />}
        </>
      )}
    </div>
  );
}

// =============================================================================
// CHIEFS REPORT VIEW - Matching PDF layout exactly
// =============================================================================
function ChiefsReportView({ report, category, s, colors }) {
  if (!report) return null;
  const cs = report.call_summary || {};
  const rt = report.response_times || {};
  const isFireReport = category === 'FIRE';

  return (
    <div>
      {/* Call Summary */}
      <div style={s.card}>
        <div style={s.cardHeader}>Call Summary</div>
        <div style={s.cardBody}>
          <div style={s.statGrid}>
            <div style={s.statBox}>
              <div style={{ ...s.statValue, color: colors.green }}>{cs.number_of_calls || 0}</div>
              <div style={s.statLabel}>Total Calls</div>
              <div style={s.statSub}>vs. last year: {cs.change >= 0 ? '+' : ''}{cs.change || 0}</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{cs.number_of_men || 0}</div>
              <div style={s.statLabel}>Personnel</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{(cs.hours || 0).toFixed(1)}</div>
              <div style={s.statLabel}>Total Hours</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{(cs.man_hours || 0).toFixed(1)}</div>
              <div style={s.statLabel}>Man Hours</div>
            </div>
          </div>
        </div>
      </div>

      {/* Response Times */}
      <div style={s.card}>
        <div style={s.cardHeader}>Response Times</div>
        <div style={s.cardBody}>
          <div style={{ ...s.statGrid, gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div style={s.statBox}>
              <div style={s.statValue}>{rt.avg_turnout_minutes?.toFixed(1) || '-'}</div>
              <div style={s.statLabel}>Avg Turnout (min)</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{rt.avg_response_minutes?.toFixed(1) || '-'}</div>
              <div style={s.statLabel}>Avg Response (min)</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{rt.avg_on_scene_minutes?.toFixed(1) || '-'}</div>
              <div style={s.statLabel}>Avg On Scene (min)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Two column layout */}
      <div style={s.twoCol}>
        {/* Response by Municipality */}
        <div style={s.card}>
          <div style={s.cardHeader}>Response by Municipality</div>
          <div style={{ padding: 0 }}>
            <table style={s.table}>
              <thead>
                <tr><th style={s.th}>Municipality</th><th style={{ ...s.th, textAlign: 'right' }}>Calls</th><th style={{ ...s.th, textAlign: 'right' }}>Man Hrs</th></tr>
              </thead>
              <tbody>
                {(report.municipalities || []).map((m, i) => (
                  <tr key={i}>
                    <td style={s.td}>{m.municipality}</td>
                    <td style={{ ...s.td, ...s.tdRight }}>{m.calls}</td>
                    <td style={{ ...s.td, ...s.tdRight }}>{m.manhours?.toFixed(1)}</td>
                  </tr>
                ))}
                {(!report.municipalities?.length) && <tr><td colSpan="3" style={{ ...s.td, textAlign: 'center', color: colors.grayDark }}>No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Responses by Unit */}
        <div style={s.card}>
          <div style={s.cardHeader}>Responses by Unit</div>
          <div style={{ padding: 0 }}>
            <table style={s.table}>
              <thead>
                <tr><th style={s.th}>Unit</th><th style={{ ...s.th, textAlign: 'right' }}>Count</th></tr>
              </thead>
              <tbody>
                {(report.responses_per_unit || []).map((u, i) => (
                  <tr key={i}>
                    <td style={s.td}>{u.unit_name || u.unit}</td>
                    <td style={{ ...s.td, ...s.tdRight, ...s.tdGreen }}>{u.responses}</td>
                  </tr>
                ))}
                {(!report.responses_per_unit?.length) && <tr><td colSpan="2" style={{ ...s.td, textAlign: 'center', color: colors.grayDark }}>No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Incident Types */}
        <div style={s.card}>
          <div style={s.cardHeader}>Incident Types</div>
          <div style={{ padding: 0 }}>
            <table style={s.table}>
              <thead>
                <tr><th style={s.th}>Type</th><th style={{ ...s.th, textAlign: 'right' }}>Count</th></tr>
              </thead>
              <tbody>
                {(report.incident_types || []).map((t, i) => (
                  <tr key={i}>
                    <td style={s.td}>{t.type}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{t.parent_count ? <span style={s.badge}>{t.parent_count}</span> : t.count}</td>
                  </tr>
                ))}
                {(!report.incident_types?.length) && <tr><td colSpan="2" style={{ ...s.td, textAlign: 'center', color: colors.grayDark }}>No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mutual Aid */}
        <div style={s.card}>
          <div style={s.cardHeader}>Mutual Aid Given</div>
          <div style={{ padding: 0 }}>
            <table style={s.table}>
              <thead>
                <tr><th style={s.th}>Station</th><th style={{ ...s.th, textAlign: 'right' }}>Count</th></tr>
              </thead>
              <tbody>
                {(report.mutual_aid || []).map((ma, i) => (
                  <tr key={i}>
                    <td style={s.td}>{ma.station}</td>
                    <td style={{ ...s.td, ...s.tdRight }}>{ma.count}</td>
                  </tr>
                ))}
                {(!report.mutual_aid?.length) && <tr><td colSpan="2" style={{ ...s.td, textAlign: 'center', color: colors.grayDark }}>None</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Property & Safety - Fire only */}
      {isFireReport && (
        <div style={s.card}>
          <div style={s.cardHeader}>Property & Safety</div>
          <div style={s.cardBody}>
            <div style={{ ...s.statGrid, gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div style={s.statBox}>
                <div style={s.statValue}>${((cs.property_at_risk || 0) / 100).toLocaleString()}</div>
                <div style={s.statLabel}>Property at Risk</div>
              </div>
              <div style={s.statBox}>
                <div style={s.statValue}>${((cs.fire_damages || 0) / 100).toLocaleString()}</div>
                <div style={s.statLabel}>Fire Damages</div>
              </div>
              <div style={s.statBox}>
                <div style={s.statValue}>{cs.ff_injuries || 0}</div>
                <div style={s.statLabel}>FF Injuries</div>
              </div>
              <div style={s.statBox}>
                <div style={s.statValue}>{cs.civilian_injuries || 0}</div>
                <div style={s.statLabel}>Civilian Injuries</div>
              </div>
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
function OverviewReport({ summary, trend, year, onYearChange, s, colors }) {
  if (!summary) return null;
  return (
    <div>
      <div style={s.card}>
        <div style={s.cardHeader}>Summary</div>
        <div style={s.cardBody}>
          <div style={s.statGrid}>
            <div style={s.statBox}><div style={{ ...s.statValue, color: colors.green }}>{summary.total_incidents}</div><div style={s.statLabel}>Total Incidents</div></div>
            <div style={s.statBox}><div style={s.statValue}>{summary.total_personnel_responses}</div><div style={s.statLabel}>Personnel Responses</div></div>
            <div style={s.statBox}><div style={s.statValue}>{summary.total_manhours?.toFixed(1)}</div><div style={s.statLabel}>Total Manhours</div></div>
            <div style={s.statBox}><div style={s.statValue}>{summary.response_times?.avg_response_minutes?.toFixed(1) || '-'}</div><div style={s.statLabel}>Avg Response (min)</div></div>
          </div>
        </div>
      </div>
      {trend && (
        <div style={s.card}>
          <div style={{ ...s.cardHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Monthly Trend</span>
            <select value={year} onChange={(e) => onYearChange(parseInt(e.target.value))} style={{ ...s.select, padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
              {[...Array(5)].map((_, i) => { const y = new Date().getFullYear() - i; return <option key={y} value={y}>{y}</option>; })}
            </select>
          </div>
          <div style={s.cardBody}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '150px' }}>
              {trend.months?.map((m, i) => {
                const maxCount = Math.max(...trend.months.map(x => x.incident_count), 1);
                const height = (m.incident_count / maxCount) * 100;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.65rem', color: colors.grayDark }}>{m.incident_count || ''}</span>
                    <div style={{ width: '80%', background: colors.green, borderRadius: '2px 2px 0 0', height: `${height}%`, minHeight: m.incident_count > 0 ? '4px' : '0', marginTop: 'auto' }} />
                    <span style={{ fontSize: '0.6rem', color: colors.grayDark, marginTop: '4px' }}>{m.month_name?.slice(0, 3)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.85rem', color: colors.grayDark }}>
              Total: <strong style={{ color: colors.text }}>{trend.total_incidents}</strong> incidents
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PERSONNEL REPORT
// =============================================================================
function PersonnelReport({ data, s, colors }) {
  if (!data) return null;
  return (
    <div style={s.card}>
      <div style={s.cardHeader}>Top Responders</div>
      <div style={{ padding: 0 }}>
        <table style={s.table}>
          <thead>
            <tr><th style={s.th}>#</th><th style={s.th}>Name</th><th style={s.th}>Rank</th><th style={{ ...s.th, textAlign: 'right' }}>Calls</th><th style={{ ...s.th, textAlign: 'right' }}>Hours</th></tr>
          </thead>
          <tbody>
            {(data.personnel || []).map((p, i) => (
              <tr key={p.id} style={{ background: i < 3 ? colors.greenLight : 'transparent' }}>
                <td style={s.td}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                <td style={{ ...s.td, fontWeight: '500' }}>{p.name}</td>
                <td style={{ ...s.td, color: colors.grayDark }}>{p.rank || '-'}</td>
                <td style={{ ...s.td, ...s.tdRight, ...s.tdGreen }}>{p.incident_count}</td>
                <td style={{ ...s.td, ...s.tdRight }}>{p.total_hours?.toFixed(1)}</td>
              </tr>
            ))}
            {(!data.personnel?.length) && <tr><td colSpan="5" style={{ ...s.td, textAlign: 'center', color: colors.grayDark }}>No data</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// UNIT REPORT
// =============================================================================
function UnitReport({ data, s, colors }) {
  if (!data) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
      {(data.apparatus || []).map((u, i) => (
        <div key={i} style={s.card}>
          <div style={s.cardHeader}>{u.unit_designator}</div>
          <div style={s.cardBody}>
            <div style={{ fontSize: '0.8rem', color: colors.grayDark, marginBottom: '0.75rem' }}>{u.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: colors.green }}>{u.incident_count}</div>
                <div style={{ fontSize: '0.65rem', color: colors.grayDark, textTransform: 'uppercase' }}>Incidents</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: colors.text }}>{u.total_responses}</div>
                <div style={{ fontSize: '0.65rem', color: colors.grayDark, textTransform: 'uppercase' }}>Responses</div>
              </div>
            </div>
          </div>
        </div>
      ))}
      {(!data.apparatus?.length) && <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: colors.grayDark, padding: '2rem' }}>No unit data</div>}
    </div>
  );
}

// =============================================================================
// CUSTOM QUERY RESULT
// =============================================================================
function CustomQueryResult({ result, onOpenPrint, s, colors }) {
  if (!result) return null;
  if (result.error) return <div style={{ ...s.card, background: colors.redLight }}><div style={{ ...s.cardHeader, color: colors.red }}>Error</div><div style={s.cardBody}>{result.error}</div></div>;

  return (
    <div>
      <div style={{ ...s.card, background: colors.greenLight, border: `1px solid ${colors.green}` }}>
        <div style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><span style={{ color: colors.green, fontWeight: '500' }}>✨ {result.title}</span><br/><span style={{ fontSize: '0.8rem', color: colors.grayDark }}>Query: "{result.query}"</span></div>
          {result.type === 'chiefs' && result.pdfParams && <button onClick={() => onOpenPrint(result.pdfParams.year, result.pdfParams.month, result.pdfParams.category)} style={{ ...s.btn, ...s.btnGreen }}>🖨️ Print</button>}
        </div>
      </div>
      {result.type === 'chiefs' && result.data && <ChiefsReportView report={result.data} category={result.data.category_filter || 'FIRE'} s={s} colors={colors} />}
      {result.type === 'personnel' && result.data && <PersonnelReport data={result.data} s={s} colors={colors} />}
      {result.type === 'unit' && result.data && <UnitReport data={result.data} s={s} colors={colors} />}
      {result.type === 'summary' && result.data && (
        <div style={s.card}><div style={s.cardHeader}>Summary</div><div style={s.cardBody}>
          <div style={s.statGrid}>
            <div style={s.statBox}><div style={{ ...s.statValue, color: colors.green }}>{result.data.total_incidents}</div><div style={s.statLabel}>Incidents</div></div>
            <div style={s.statBox}><div style={s.statValue}>{result.data.total_personnel_responses}</div><div style={s.statLabel}>Responses</div></div>
            <div style={s.statBox}><div style={s.statValue}>{result.data.total_manhours?.toFixed(1)}</div><div style={s.statLabel}>Manhours</div></div>
          </div>
        </div></div>
      )}
    </div>
  );
}

export default ReportsPage;
