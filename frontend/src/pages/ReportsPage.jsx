import { useState, useEffect, useRef } from 'react';
import { useBranding } from '../contexts/BrandingContext';
import { getIncidentYears } from '../api';
import ReportDetailModal from '../components/ReportDetailModal';

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
  const [activeReport, setActiveReport] = useState('monthly');
  const [categoryFilter, setCategoryFilter] = useState('FIRE');
  const [reportMonth, setReportMonth] = useState(() => new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(() => new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([new Date().getFullYear()]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  // Report data states
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [personnelData, setPersonnelData] = useState(null);
  const [unitData, setUnitData] = useState(null);
  const [incidentsData, setIncidentsData] = useState(null);
  const [detailsData, setDetailsData] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Detail modal state
  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    type: null,      // 'personnel' | 'units' | 'incidents'
    itemId: null,    // ID or incident type string
    itemName: null,  // Display name
  });

  const openDetailModal = (type, itemId, itemName) => {
    setDetailModal({ isOpen: true, type, itemId, itemName });
  };

  const closeDetailModal = () => {
    setDetailModal({ isOpen: false, type: null, itemId: null, itemName: null });
  };

  const queryInputRef = useRef(null);

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

  // Load monthly report when month/year/category changes
  useEffect(() => {
    if (activeReport === 'monthly') {
      loadMonthlyReport();
    }
  }, [reportMonth, reportYear, categoryFilter, activeReport]);

  // Load other reports when tab or date range changes
  useEffect(() => {
    if (activeReport === 'overview') loadOverviewData();
    else if (activeReport === 'personnel') loadPersonnelData();
    else if (activeReport === 'units') loadUnitsData();
    else if (activeReport === 'incidents') loadIncidentsData();
    else if (activeReport === 'details') loadDetailsData();
  }, [activeReport, startDate, endDate, categoryFilter]);

  // ==========================================================================
  // DATA LOADERS
  // ==========================================================================

  const loadMonthlyReport = async () => {
    setLoading(true);
    try {
      const params = `year=${reportYear}&month=${reportMonth}&category=${categoryFilter}`;
      const res = await fetch(`${API_BASE}/api/reports/monthly?${params}`);
      setMonthlyReport(await res.json());
    } catch (err) { console.error('Failed to load monthly report:', err); }
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
      // Use new admin endpoint with category filter
      const params = `start_date=${startDate}&end_date=${endDate}&category=${categoryFilter}&limit=50`;
      const res = await fetch(`${API_BASE}/api/reports/admin/personnel?${params}`);
      setPersonnelData(await res.json());
    } catch (err) { console.error('Failed to load personnel data:', err); }
    finally { setLoading(false); }
  };

  const loadUnitsData = async () => {
    setLoading(true);
    try {
      // Use new admin endpoint - no category filter, shows Fire/EMS columns
      const params = `start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(`${API_BASE}/api/reports/admin/units?${params}`);
      setUnitData(await res.json());
    } catch (err) { console.error('Failed to load units data:', err); }
    finally { setLoading(false); }
  };

  const loadIncidentsData = async () => {
    setLoading(true);
    try {
      // Use new admin endpoint - no category filter, types self-identify
      const params = `start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(`${API_BASE}/api/reports/admin/incidents?${params}`);
      setIncidentsData(await res.json());
    } catch (err) { console.error('Failed to load incidents data:', err); }
    finally { setLoading(false); }
  };

  const loadDetailsData = async () => {
    setLoading(true);
    try {
      const params = `start_date=${startDate}&end_date=${endDate}&limit=50`;
      const res = await fetch(`${API_BASE}/api/reports/admin/details?${params}`);
      setDetailsData(await res.json());
    } catch (err) { console.error('Failed to load details data:', err); }
    finally { setLoading(false); }
  };

  // ==========================================================================
  // PDF OPENERS
  // ==========================================================================

  const openMonthlyPdf = () => {
    window.open(`${API_BASE}/api/reports/pdf/monthly-weasy?year=${reportYear}&month=${reportMonth}&category=${categoryFilter}`, '_blank');
  };

  const openPersonnelPdf = () => {
    window.open(`${API_BASE}/api/reports/admin/personnel/pdf?start_date=${startDate}&end_date=${endDate}&category=${categoryFilter}`, '_blank');
  };

  const openUnitsPdf = () => {
    window.open(`${API_BASE}/api/reports/admin/units/pdf?start_date=${startDate}&end_date=${endDate}`, '_blank');
  };

  const openIncidentsPdf = () => {
    window.open(`${API_BASE}/api/reports/admin/incidents/pdf?start_date=${startDate}&end_date=${endDate}`, '_blank');
  };

  const openDetailsPdf = () => {
    window.open(`${API_BASE}/api/reports/admin/details/pdf?start_date=${startDate}&end_date=${endDate}`, '_blank');
  };

  // ==========================================================================
  // QUERY HANDLERS
  // ==========================================================================

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
      return { type: 'monthly', title: `Monthly Report - ${data.month_name} ${data.year} (${cat})`, data, query: naturalQuery, pdfUrl: `${API_BASE}/api/reports/pdf/monthly-weasy?year=${year}&month=${month}&category=${cat}` };
    }
    
    if (q.includes('personnel') || q.includes('responder') || q.includes('firefighter')) {
      const cat = queryCategory || categoryFilter;
      const res = await fetch(`${API_BASE}/api/reports/admin/personnel?start_date=${queryStart}&end_date=${queryEnd}&category=${cat}&limit=50`);
      return { type: 'personnel', title: `Personnel Report (${queryStart} to ${queryEnd})`, data: await res.json(), query: naturalQuery, pdfUrl: `${API_BASE}/api/reports/admin/personnel/pdf?start_date=${queryStart}&end_date=${queryEnd}&category=${cat}` };
    }
    
    if (q.includes('unit') || q.includes('apparatus') || q.includes('engine') || q.includes('truck')) {
      const res = await fetch(`${API_BASE}/api/reports/admin/units?start_date=${queryStart}&end_date=${queryEnd}`);
      return { type: 'units', title: `Unit Report (${queryStart} to ${queryEnd})`, data: await res.json(), query: naturalQuery, pdfUrl: `${API_BASE}/api/reports/admin/units/pdf?start_date=${queryStart}&end_date=${queryEnd}` };
    }
    
    if (q.includes('incident') || q.includes('type') || q.includes('call type')) {
      const res = await fetch(`${API_BASE}/api/reports/admin/incidents?start_date=${queryStart}&end_date=${queryEnd}`);
      return { type: 'incidents', title: `Incident Types Report (${queryStart} to ${queryEnd})`, data: await res.json(), query: naturalQuery, pdfUrl: `${API_BASE}/api/reports/admin/incidents/pdf?start_date=${queryStart}&end_date=${queryEnd}` };
    }
    
    const cat = queryCategory || categoryFilter;
    const res = await fetch(`${API_BASE}/api/reports/summary?start_date=${queryStart}&end_date=${queryEnd}&category=${cat}`);
    return { type: 'summary', title: `Summary Report (${queryStart} to ${queryEnd})`, data: await res.json(), query: naturalQuery };
  };

  const quickQuery = (queryText) => { setQuery(queryText); setTimeout(() => handleQuerySubmit(), 100); };

  // ==========================================================================
  // STYLES - Using branding colors
  // ==========================================================================
  const colors = {
    green: branding.primaryColor || '#016a2b',
    greenLight: branding.primaryLight || '#e8f5e9',
    secondary: branding.secondaryColor || '#eeee01',
    pageBg: '#dcdcdc',
    cardBg: '#ffffff',
    statBg: '#e8e8e8',
    border: '#c0c0c0',
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
    
    controlsBar: { 
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem',
      padding: '0.75rem 1rem', background: colors.cardBg, borderRadius: '4px',
      border: `1px solid ${colors.border}`, marginBottom: '1rem'
    },
    
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
    
    btn: { 
      padding: '0.5rem 1rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
      fontWeight: '500', fontSize: '0.85rem', transition: 'all 0.15s'
    },
    btnGreen: { background: colors.green, color: colors.white },
    btnGray: { background: colors.white, color: colors.text, border: `1px solid ${colors.border}` },
    btnSmall: { padding: '0.35rem 0.6rem', fontSize: '0.8rem' },
    
    card: { 
      background: colors.cardBg, borderRadius: '4px', border: `1px solid ${colors.border}`,
      marginBottom: '1rem', overflow: 'hidden', borderTop: `3px solid ${colors.secondary}`
    },
    cardHeader: { 
      background: colors.statBg, padding: '0.6rem 1rem', fontSize: '0.8rem',
      fontWeight: '600', color: colors.green, textTransform: 'uppercase', letterSpacing: '0.5px',
      borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    },
    cardBody: { padding: '1rem', background: colors.cardBg },
    
    statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' },
    statBox: { 
      background: colors.statBg, borderRadius: '4px', padding: '1rem', textAlign: 'center',
      border: `1px solid ${colors.border}`
    },
    statValue: { fontSize: '1.5rem', fontWeight: '700', color: colors.text, lineHeight: 1.2 },
    statLabel: { fontSize: '0.7rem', color: colors.grayDark, textTransform: 'uppercase', marginTop: '0.25rem', letterSpacing: '0.3px' },
    statSub: { fontSize: '0.75rem', color: colors.green },
    
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
    th: { 
      textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: '600', color: colors.white,
      background: colors.green, fontSize: '0.8rem'
    },
    td: { padding: '0.5rem 0.75rem', borderBottom: `1px solid ${colors.border}`, color: colors.text },
    tdRight: { textAlign: 'right', fontFamily: 'monospace' },
    tdGreen: { color: colors.green, fontWeight: '600' },
    
    twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' },
    
    badge: { 
      display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px',
      fontSize: '0.8rem', fontWeight: '600', background: colors.green, color: colors.white
    },

    clickableRow: { cursor: 'pointer', transition: 'background 0.15s' },
  };

  // ==========================================================================
  // HELPER: Get subtitle based on active report
  // ==========================================================================
  const getHeaderSubtitle = () => {
    if (activeReport === 'monthly') {
      return `Monthly Activity Report — ${new Date(2000, reportMonth - 1).toLocaleString('default', { month: 'long' })} ${reportYear}`;
    }
    return `Activity Reports — ${startDate} to ${endDate}`;
  };

  // ==========================================================================
  // HELPER: Check if category toggle applies to this tab
  // ==========================================================================
  const showCategoryToggle = ['monthly', 'overview', 'personnel'].includes(activeReport);

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerAccent} />
        {branding.logoUrl && <img src={branding.logoUrl} alt="Logo" style={s.headerLogo} />}
        <div style={s.headerText}>
          <h1 style={s.headerTitle}>{branding.stationName || 'GLEN MOORE FIRE COMPANY'}</h1>
          <p style={s.headerSub}>{getHeaderSubtitle()}</p>
        </div>
        {showCategoryToggle && (
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
        )}
      </div>

      {/* Report Type Tabs + Controls */}
      <div style={s.controlsBar}>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {[
            { id: 'monthly', label: '📋 Monthly' },
            { id: 'overview', label: '📊 Overview' },
            { id: 'personnel', label: '👥 Personnel' },
            { id: 'units', label: '🚒 Units' },
            { id: 'incidents', label: '🔥 Incidents' },
            { id: 'details', label: '📝 Details' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveReport(tab.id)}
              style={{ ...s.btn, ...s.btnSmall, ...(activeReport === tab.id ? s.btnGreen : s.btnGray) }}>
              {tab.label}
            </button>
          ))}
          {queryResult && (
            <button onClick={() => setActiveReport('custom')}
              style={{ ...s.btn, ...s.btnSmall, background: activeReport === 'custom' ? colors.green : colors.greenLight, color: activeReport === 'custom' ? colors.white : colors.green }}>
              ✨ Query
            </button>
          )}
        </div>
        
        {/* Monthly controls */}
        {activeReport === 'monthly' && (
          <>
            <select value={reportMonth} onChange={(e) => setReportMonth(parseInt(e.target.value))} style={s.select}>
              {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>)}
            </select>
            <select value={reportYear} onChange={(e) => setReportYear(parseInt(e.target.value))} style={s.select}>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={openMonthlyPdf} style={{ ...s.btn, ...s.btnGreen }}>🖨️ Print PDF</button>
          </>
        )}
        
        {/* Date range controls for other tabs */}
        {['overview', 'personnel', 'units', 'incidents', 'details'].includes(activeReport) && (
          <>
            <span style={{ color: colors.grayDark, fontSize: '0.85rem' }}>From:</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...s.input, width: 'auto' }} />
            <span style={{ color: colors.grayDark, fontSize: '0.85rem' }}>To:</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ ...s.input, width: 'auto' }} />
            
            {/* PDF buttons for personnel, units, incidents */}
            {activeReport === 'personnel' && (
              <button onClick={openPersonnelPdf} style={{ ...s.btn, ...s.btnGreen }}>🖨️ Print PDF</button>
            )}
            {activeReport === 'units' && (
              <button onClick={openUnitsPdf} style={{ ...s.btn, ...s.btnGreen }}>🖨️ Print PDF</button>
            )}
            {activeReport === 'incidents' && (
              <button onClick={openIncidentsPdf} style={{ ...s.btn, ...s.btnGreen }}>🖨️ Print PDF</button>
            )}
            {activeReport === 'details' && (
              <button onClick={openDetailsPdf} style={{ ...s.btn, ...s.btnGreen }}>🖨️ Print PDF</button>
            )}
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
          {['This Month Chiefs', 'YTD Fire', 'Top Responders', 'Unit Stats', 'Incident Types'].map(q => (
            <button key={q} onClick={() => quickQuery(
              q.includes('Chiefs') ? 'Show me the chiefs report for this month' : 
              q.includes('YTD') ? 'Fire calls year to date' : 
              q.includes('Responders') ? 'Top personnel responders this year' : 
              q.includes('Unit') ? 'Unit response counts this year' :
              'Incident type breakdown this year'
            )}
              style={{ ...s.btn, ...s.btnSmall, ...s.btnGray }}>{q}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: colors.grayDark }}>Loading...</div>
      ) : (
        <>
          {activeReport === 'monthly' && monthlyReport && <MonthlyReportView report={monthlyReport} category={categoryFilter} s={s} colors={colors} />}
          {activeReport === 'overview' && summaryData && <OverviewReport summary={summaryData} trend={trendData} year={reportYear} onYearChange={setReportYear} availableYears={availableYears} s={s} colors={colors} />}
          {activeReport === 'personnel' && personnelData && <PersonnelReport data={personnelData} s={s} colors={colors} startDate={startDate} endDate={endDate} onItemClick={(id, name) => openDetailModal('personnel', id, name)} />}
          {activeReport === 'units' && unitData && <UnitsReport data={unitData} s={s} colors={colors} startDate={startDate} endDate={endDate} onItemClick={(id, name) => openDetailModal('units', id, name)} />}
          {activeReport === 'incidents' && incidentsData && <IncidentsReport data={incidentsData} s={s} colors={colors} startDate={startDate} endDate={endDate} onItemClick={(typeName) => openDetailModal('incidents', typeName, typeName)} />}
          {activeReport === 'details' && detailsData && <DetailsReport data={detailsData} s={s} colors={colors} startDate={startDate} endDate={endDate} onItemClick={(id, name) => openDetailModal('details', id, name)} />}
          {activeReport === 'custom' && queryResult && <CustomQueryResult result={queryResult} s={s} colors={colors} />}
        </>
      )}

      {/* Detail Modal */}
      <ReportDetailModal
        isOpen={detailModal.isOpen}
        onClose={closeDetailModal}
        type={detailModal.type}
        itemId={detailModal.itemId}
        itemName={detailModal.itemName}
        startDate={startDate}
        endDate={endDate}
        colors={colors}
      />
    </div>
  );
}

// =============================================================================
// MONTHLY REPORT VIEW
// =============================================================================
function MonthlyReportView({ report, category, s, colors }) {
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
          <div style={{ ...s.statGrid, gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <div style={s.statBox}>
              <div style={{ ...s.statValue, color: colors.green }}>{cs.number_of_calls || 0}</div>
              <div style={s.statLabel}>Total Calls</div>
              <div style={s.statSub}>vs. last year: {cs.change >= 0 ? '+' : ''}{cs.change || 0}</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{cs.responded || 0} ({cs.responded_pct?.toFixed(1) || '0.0'}%)</div>
              <div style={s.statLabel}>Responded</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{cs.unique_responders || 0}</div>
              <div style={s.statLabel}>Responders</div>
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

        {/* Mutual Aid (Fire) / Units Assisted (EMS) */}
        {isFireReport ? (
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
        ) : (
          <div style={s.card}>
            <div style={s.cardHeader}>Units Assisted</div>
            <div style={{ padding: 0 }}>
              <table style={s.table}>
                <thead>
                  <tr><th style={s.th}>Unit</th><th style={{ ...s.th, textAlign: 'right' }}>Count</th></tr>
                </thead>
                <tbody>
                  {(report.units_assisted || []).map((ua, i) => (
                    <tr key={i}>
                      <td style={s.td}>{ua.unit}</td>
                      <td style={{ ...s.td, ...s.tdRight }}>{ua.count}</td>
                    </tr>
                  ))}
                  {(!report.units_assisted?.length) && <tr><td colSpan="2" style={{ ...s.td, textAlign: 'center', color: colors.grayDark }}>None</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
function OverviewReport({ summary, trend, year, onYearChange, availableYears, s, colors }) {
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
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
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
// PERSONNEL REPORT - Using new admin endpoint
// =============================================================================
function PersonnelReport({ data, s, colors, startDate, endDate, onItemClick }) {
  if (!data) return null;
  
  const summary = data.summary || {};
  const personnel = data.personnel || [];

  return (
    <div>
      {/* Summary Stats */}
      <div style={s.card}>
        <div style={s.cardHeader}>Summary</div>
        <div style={s.cardBody}>
          <div style={s.statGrid}>
            <div style={s.statBox}>
              <div style={{ ...s.statValue, color: colors.green }}>{summary.unique_responders || 0}</div>
              <div style={s.statLabel}>Active Responders</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{summary.total_responses || 0}</div>
              <div style={s.statLabel}>Total Responses</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{summary.total_incidents || 0}</div>
              <div style={s.statLabel}>Incidents</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{(summary.total_hours || 0).toFixed(1)}</div>
              <div style={s.statLabel}>Total Hours</div>
            </div>
          </div>
        </div>
      </div>

      {/* Personnel Rankings */}
      <div style={s.card}>
        <div style={s.cardHeader}>Personnel Rankings</div>
        <div style={{ padding: 0 }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>#</th>
                <th style={s.th}>Name</th>
                <th style={s.th}>Rank</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Calls</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {personnel.map((p, i) => (
                <tr 
                  key={p.id} 
                  onClick={() => onItemClick && onItemClick(p.id, p.name)}
                  style={{ 
                    background: i < 3 ? colors.greenLight : 'transparent',
                    cursor: 'pointer',
                  }}
                  title={`Click to view ${p.name}'s detail report`}
                >
                  <td style={s.td}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                  <td style={{ ...s.td, fontWeight: '500' }}>{p.name}</td>
                  <td style={{ ...s.td, color: colors.grayDark }}>{p.rank_abbrev || p.rank || '-'}</td>
                  <td style={{ ...s.td, ...s.tdRight, ...s.tdGreen }}>{p.incident_count}</td>
                  <td style={{ ...s.td, ...s.tdRight }}>{(p.total_hours || 0).toFixed(1)}</td>
                </tr>
              ))}
              {(!personnel.length) && (
                <tr><td colSpan="5" style={{ ...s.td, textAlign: 'center', color: colors.grayDark }}>No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// UNITS REPORT - Using new admin endpoint with Fire/EMS breakdown
// =============================================================================
function UnitsReport({ data, s, colors, startDate, endDate, onItemClick }) {
  if (!data) return null;
  
  const summary = data.summary || {};
  const units = data.units || [];

  return (
    <div>
      {/* Summary Stats */}
      <div style={s.card}>
        <div style={s.cardHeader}>Summary</div>
        <div style={s.cardBody}>
          <div style={s.statGrid}>
            <div style={s.statBox}>
              <div style={{ ...s.statValue, color: colors.green }}>{summary.active_units || 0}</div>
              <div style={s.statLabel}>Active Units</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{summary.total_incidents || 0}</div>
              <div style={s.statLabel}>Total Incidents</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{summary.fire_incidents || 0}</div>
              <div style={s.statLabel}>Fire</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{summary.ems_incidents || 0}</div>
              <div style={s.statLabel}>EMS</div>
            </div>
          </div>
        </div>
      </div>

      {/* Units Table with Fire/EMS columns */}
      <div style={s.card}>
        <div style={s.cardHeader}>Unit Activity</div>
        <div style={{ padding: 0 }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Unit</th>
                <th style={s.th}>Name</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Total</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Fire</th>
                <th style={{ ...s.th, textAlign: 'right' }}>EMS</th>
              </tr>
            </thead>
            <tbody>
              {units.filter(u => u.total_incidents > 0).map((u, i) => (
                <tr 
                  key={u.id || i}
                  onClick={() => onItemClick && onItemClick(u.id, u.name)}
                  style={{ cursor: 'pointer' }}
                  title={`Click to view ${u.name}'s detail report`}
                >
                  <td style={{ ...s.td, fontWeight: '600' }}>{u.unit_designator}</td>
                  <td style={s.td}>{u.name}</td>
                  <td style={{ ...s.td, ...s.tdRight, ...s.tdGreen }}>{u.total_incidents}</td>
                  <td style={{ ...s.td, ...s.tdRight, color: colors.red }}>{u.fire_incidents}</td>
                  <td style={{ ...s.td, ...s.tdRight, color: colors.blue }}>{u.ems_incidents}</td>
                </tr>
              ))}
              {(!units.filter(u => u.total_incidents > 0).length) && (
                <tr><td colSpan="5" style={{ ...s.td, textAlign: 'center', color: colors.grayDark }}>No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// INCIDENTS REPORT - Type/Subtype breakdown
// =============================================================================
function IncidentsReport({ data, s, colors, startDate, endDate, onItemClick }) {
  if (!data) return null;
  
  const summary = data.summary || {};
  const incidentTypes = data.incident_types || [];
  const municipalities = data.municipalities || [];
  
  // Track expanded groups
  const [expandedGroups, setExpandedGroups] = useState({});
  
  const toggleGroup = (typeName, e) => {
    e.stopPropagation(); // Don't trigger the detail modal
    setExpandedGroups(prev => ({
      ...prev,
      [typeName]: !prev[typeName]
    }));
  };

  return (
    <div>
      {/* Summary Stats */}
      <div style={s.card}>
        <div style={s.cardHeader}>Summary</div>
        <div style={s.cardBody}>
          <div style={s.statGrid}>
            <div style={s.statBox}>
              <div style={{ ...s.statValue, color: colors.green }}>{summary.total_incidents || 0}</div>
              <div style={s.statLabel}>Total Incidents</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{summary.fire_incidents || 0}</div>
              <div style={s.statLabel}>Fire</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{summary.ems_incidents || 0}</div>
              <div style={s.statLabel}>EMS</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{summary.unique_types || 0}</div>
              <div style={s.statLabel}>Incident Types</div>
            </div>
          </div>
        </div>
      </div>

      <div style={s.twoCol}>
        {/* Incident Types with expandable subtypes */}
        <div style={s.card}>
          <div style={s.cardHeader}>Incident Type Breakdown</div>
          <div style={{ padding: '0.5rem' }}>
            {incidentTypes.map((type, i) => (
              <div key={i} style={{ marginBottom: '0.5rem' }}>
                {/* Type header - clickable */}
                <div 
                  onClick={() => onItemClick && onItemClick(type.name)}
                  style={{
                    background: colors.green,
                    color: colors.white,
                    padding: '0.5rem 0.75rem',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                  }}
                  title={`Click to view ${type.name} detail report`}
                >
                  <span
                    onClick={(e) => toggleGroup(type.name, e)}
                    style={{ cursor: 'pointer' }}
                  >
                    {expandedGroups[type.name] ? '▼' : '▶'} {type.name}
                  </span>
                  <span style={{
                    background: 'rgba(255,255,255,0.25)',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '10px',
                    fontSize: '0.75rem',
                  }}>
                    {type.count}
                  </span>
                </div>
                
                {/* Subtypes - collapsible */}
                {expandedGroups[type.name] && type.items && type.items.length > 0 && (
                  <div style={{ paddingLeft: '1rem', borderLeft: `2px solid ${colors.green}`, marginLeft: '0.5rem', marginTop: '0.25rem' }}>
                    {type.items.map((item, j) => (
                      <div 
                        key={j}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.8rem',
                          borderBottom: j < type.items.length - 1 ? `1px dotted ${colors.border}` : 'none',
                        }}
                      >
                        <span>{item.name}</span>
                        <span style={{ fontWeight: '600', color: colors.grayDark }}>{item.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {(!incidentTypes.length) && (
              <div style={{ textAlign: 'center', color: colors.grayDark, padding: '1rem' }}>No data</div>
            )}
          </div>
        </div>

        {/* Top Municipalities */}
        <div style={s.card}>
          <div style={s.cardHeader}>Top Municipalities</div>
          <div style={{ padding: 0 }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Municipality</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Incidents</th>
                </tr>
              </thead>
              <tbody>
                {municipalities.map((m, i) => (
                  <tr key={i}>
                    <td style={s.td}>{m.name}</td>
                    <td style={{ ...s.td, ...s.tdRight, ...s.tdGreen }}>{m.count}</td>
                  </tr>
                ))}
                {(!municipalities.length) && (
                  <tr><td colSpan="2" style={{ ...s.td, textAlign: 'center', color: colors.grayDark }}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CUSTOM QUERY RESULT
// =============================================================================
function CustomQueryResult({ result, s, colors }) {
  if (!result) return null;
  if (result.error) return (
    <div style={{ ...s.card, background: colors.redLight }}>
      <div style={{ ...s.cardHeader, color: colors.red }}>Error</div>
      <div style={s.cardBody}>{result.error}</div>
    </div>
  );

  const openPdf = () => {
    if (result.pdfUrl) {
      window.open(result.pdfUrl, '_blank');
    }
  };

  return (
    <div>
      <div style={{ ...s.card, background: colors.greenLight, border: `1px solid ${colors.green}` }}>
        <div style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ color: colors.green, fontWeight: '500' }}>✨ {result.title}</span>
            <br/>
            <span style={{ fontSize: '0.8rem', color: colors.grayDark }}>Query: "{result.query}"</span>
          </div>
          {result.pdfUrl && (
            <button onClick={openPdf} style={{ ...s.btn, ...s.btnGreen }}>🖨️ Print PDF</button>
          )}
        </div>
      </div>
      
      {result.type === 'monthly' && result.data && (
        <MonthlyReportView report={result.data} category={result.data.category_filter || 'FIRE'} s={s} colors={colors} />
      )}
      {result.type === 'personnel' && result.data && (
        <PersonnelReport data={result.data} s={s} colors={colors} />
      )}
      {result.type === 'units' && result.data && (
        <UnitsReport data={result.data} s={s} colors={colors} />
      )}
      {result.type === 'incidents' && result.data && (
        <IncidentsReport data={result.data} s={s} colors={colors} />
      )}
      {result.type === 'summary' && result.data && (
        <div style={s.card}>
          <div style={s.cardHeader}>Summary</div>
          <div style={s.cardBody}>
            <div style={s.statGrid}>
              <div style={s.statBox}><div style={{ ...s.statValue, color: colors.green }}>{result.data.total_incidents}</div><div style={s.statLabel}>Incidents</div></div>
              <div style={s.statBox}><div style={s.statValue}>{result.data.total_personnel_responses}</div><div style={s.statLabel}>Responses</div></div>
              <div style={s.statBox}><div style={s.statValue}>{result.data.total_manhours?.toFixed(1)}</div><div style={s.statLabel}>Manhours</div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// DETAILS REPORT (ROLL CALL ATTENDANCE)
// =============================================================================
function DetailsReport({ data, s, colors, startDate, endDate, onItemClick }) {
  if (!data) return null;
  
  const summary = data.summary || {};
  const personnel = data.personnel || [];
  const typeBreakdown = data.type_breakdown || [];

  return (
    <div>
      {/* Summary Stats */}
      <div style={s.card}>
        <div style={s.cardHeader}>Summary</div>
        <div style={s.cardBody}>
          <div style={s.statGrid}>
            <div style={s.statBox}>
              <div style={{ ...s.statValue, color: colors.green }}>{summary.total_events || 0}</div>
              <div style={s.statLabel}>Total Events</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{summary.unique_attendees || 0}</div>
              <div style={s.statLabel}>Unique Attendees</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{summary.total_attendance_records || 0}</div>
              <div style={s.statLabel}>Total Attendance</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{(summary.total_hours || 0).toFixed(1)}</div>
              <div style={s.statLabel}>Total Hours</div>
            </div>
          </div>
        </div>
      </div>

      <div style={s.twoCol}>
        {/* Personnel Rankings */}
        <div style={s.card}>
          <div style={s.cardHeader}>Personnel Rankings</div>
          <div style={{ padding: 0 }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>#</th>
                  <th style={s.th}>Name</th>
                  <th style={s.th}>Rank</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Events</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Hours</th>
                </tr>
              </thead>
              <tbody>
                {personnel.map((p, i) => (
                  <tr 
                    key={p.id} 
                    onClick={() => onItemClick && onItemClick(p.id, p.name)}
                    style={{ 
                      background: i < 3 ? colors.greenLight : 'transparent',
                      cursor: 'pointer',
                    }}
                    title={`Click to view ${p.name}'s detail attendance report`}
                  >
                    <td style={s.td}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                    <td style={{ ...s.td, fontWeight: '500' }}>{p.name}</td>
                    <td style={{ ...s.td, color: colors.grayDark }}>{p.rank_abbrev || p.rank || '-'}</td>
                    <td style={{ ...s.td, ...s.tdRight, ...s.tdGreen }}>{p.event_count}</td>
                    <td style={{ ...s.td, ...s.tdRight }}>{(p.total_hours || 0).toFixed(1)}</td>
                  </tr>
                ))}
                {(!personnel.length) && (
                  <tr><td colSpan="5" style={{ ...s.td, textAlign: 'center', color: colors.grayDark }}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Event Type Breakdown */}
        <div style={s.card}>
          <div style={s.cardHeader}>Breakdown by Event Type</div>
          <div style={{ padding: 0 }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Event Type</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Events</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Attendees</th>
                </tr>
              </thead>
              <tbody>
                {typeBreakdown.map((t, i) => (
                  <tr key={i}>
                    <td style={s.td}>{t.type_name}</td>
                    <td style={{ ...s.td, ...s.tdRight, ...s.tdGreen }}>{t.event_count}</td>
                    <td style={{ ...s.td, ...s.tdRight }}>{t.unique_attendees}</td>
                  </tr>
                ))}
                {(!typeBreakdown.length) && (
                  <tr><td colSpan="3" style={{ ...s.td, textAlign: 'center', color: colors.grayDark }}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportsPage;
